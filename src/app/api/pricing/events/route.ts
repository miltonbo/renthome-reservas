import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const events = await prisma.marketEvent.findMany({ orderBy: [{ startsOn: "asc" }, { name: "asc" }] });
  return NextResponse.json({ events });
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.role !== "superadmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const body = await request.json();
    const startsOn = String(body.startsOn || "");
    const endsOn = String(body.endsOn || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || !/^\d{4}-\d{2}-\d{2}$/.test(endsOn) || startsOn > endsOn) {
      return NextResponse.json({ error: "Rango de fechas inválido" }, { status: 400 });
    }
    const name = String(body.name || "").trim().slice(0, 160);
    if (!name) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
    const id = Number(body.id);
    const values = {
      name,
      city: String(body.city || "Santa Cruz de la Sierra").trim().slice(0, 120),
      eventType: String(body.eventType || "other").trim().slice(0, 40),
      startsOn,
      endsOn,
      impactBps: Math.max(-5_000, Math.min(20_000, Math.round(Number(body.impactBps) || 0))),
      confidenceBps: Math.max(0, Math.min(10_000, Math.round(Number(body.confidenceBps) || 0))),
      status: ["candidate", "confirmed", "cancelled"].includes(body.status) ? body.status : "candidate",
      sourceName: String(body.sourceName || "").trim().slice(0, 120),
      sourceUrl: body.sourceUrl ? String(body.sourceUrl).trim().slice(0, 1000) : null,
      lastVerifiedAt: new Date(),
    };
    const event = Number.isSafeInteger(id) && id > 0
      ? await prisma.marketEvent.update({ where: { id }, data: values })
      : await prisma.marketEvent.create({ data: values });
    await logAudit(session.userId, Number.isSafeInteger(id) && id > 0 ? "update" : "create", "marketEvent", event.id, { name, startsOn, endsOn });
    return NextResponse.json({ event });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo guardar el evento" }, { status: 400 });
  }
}
