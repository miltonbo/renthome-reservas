import { after } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rentHomeOwner } from "@/lib/renthome";
import { boliviaDateString } from "@/lib/messaging-availability";
import { parseReservationDate } from "@/lib/reservation-dates";
import { listTurnovers } from "@/lib/renthome-turnovers";
import { isRentHomeOperator, notifyRentHome, pushConfig, supervisorRole } from "@/lib/renthome-push";

async function getContext() {
  const user = await getSession();
  const ownerId = rentHomeOwner();
  if (!user || !ownerId) return null;
  const supervisor = user.role === supervisorRole;
  if (!supervisor && !await isRentHomeOperator(user.userId, user.role)) return null;
  return { user, ownerId, supervisor, scope: supervisor ? undefined : user.userId };
}

function validDate(date: unknown): date is string {
  return typeof date === "string" && date.length === 10 && !!parseReservationDate(date);
}

export async function GET(request: Request) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Acceso restringido." }, { status: 403 });
  const today = boliviaDateString();
  const date = new URL(request.url).searchParams.get("date") ?? today;
  if (!validDate(date)) return Response.json({ error: "La fecha no es válida." }, { status: 400 });
  return Response.json({ today, date, rows: await listTurnovers(ctx.ownerId, date, ctx.scope) }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Acceso restringido." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const { propertyId, date, action } = body ?? {};
  if (!Number.isSafeInteger(propertyId) || !validDate(date) || date > boliviaDateString()
    || !["checkout", "ready"].includes(action)) {
    return Response.json({ error: "La acción o fecha no es válida." }, { status: 400 });
  }
  if (ctx.supervisor !== (action === "ready")) {
    return Response.json({ error: "Tu rol no permite esta acción." }, { status: 403 });
  }
  const row = (await listTurnovers(ctx.ownerId, date, ctx.scope)).find((item) => item.id === propertyId);
  if (!row) return Response.json({ error: "La salida ya no figura para esta fecha." }, { status: 404 });
  const now = new Date();
  let changed = false;
  if (action === "checkout") {
    if (!row.checkoutAt && row.scheduled) {
      try {
        await prisma.cleaningTurnover.create({
          data: { propertyId, date, checkoutAt: now, checkoutBy: ctx.user.userId },
        });
        changed = true;
      } catch (error) {
        if ((error as { code?: string }).code !== "P2002") throw error;
      }
    }
  } else {
    if (!row.checkoutAt) return Response.json({ error: "Administración debe confirmar la salida primero." }, { status: 409 });
    if (!row.readyAt && !row.scheduled) return Response.json({ error: "La salida cambió. Revisa la agenda con administración." }, { status: 409 });
    changed = await prisma.$transaction(async (db) => {
      const result = await db.cleaningTurnover.updateMany({
        where: { propertyId, date, readyAt: null }, data: { readyAt: now, readyBy: ctx.user.userId },
      });
      if (!result.count) return false;
      const data = { status: "done", doneAt: now, doneByUserId: ctx.user.userId };
      await db.cleaningRecord.upsert({
        where: { propertyId_date: { propertyId, date } },
        create: { propertyId, date, ...data }, update: { ...data, updatedAt: now },
      });
      return true;
    });
  }
  if (changed && pushConfig()) {
    after(() => notifyRentHome(action === "checkout" ? "supervisors" : "administrators", {
      title: action === "checkout" ? "Salida confirmada" : "Departamento listo",
      body: action === "checkout" ? "Ya se puede iniciar una limpieza. Revisa el tablero." : "Revisa el tablero para avisar al próximo huésped.",
      path: "/dashboard?view=cleaning&turnoverDate=" + date + "#renthome-turnovers",
      tag: action + "-" + propertyId + "-" + date,
    }, propertyId).catch(() => console.warn("No se pudo enviar el aviso de limpieza.")));
  }
  return Response.json({ ok: true });
}
