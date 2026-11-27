import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isRentHomeOperator, pushConfig, supervisorRole, validPushEndpoint } from "@/lib/renthome-push";
import { rentHomeOwner } from "@/lib/renthome";

async function getRecipient() {
  const session = await getSession();
  if (!session || session.impersonatorId || !rentHomeOwner()) return null;
  return session.role === supervisorRole || await isRentHomeOperator(session.userId, session.role) ? session : null;
}

export async function GET(request: Request) {
  const user = await getRecipient();
  if (!user) return Response.json({ error: "Acceso restringido." }, { status: 403 });
  const endpoint = new URL(request.url).searchParams.get("endpoint");
  const registered = validPushEndpoint(endpoint) && !!await prisma.pushSubscription.findFirst({
    where: { endpoint, userId: user.userId }, select: { userId: true },
  });
  return Response.json({ publicKey: pushConfig()?.publicKey ?? null, registered }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  const user = await getRecipient();
  if (!user) return Response.json({ error: "Acceso restringido." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!validPushEndpoint(body?.endpoint)) return Response.json({ error: "Navegador de notificaciones no compatible." }, { status: 400 });
  if (body.enabled === false) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint: body.endpoint, userId: user.userId } });
    return Response.json({ ok: true });
  }
  if (!pushConfig()) return Response.json({ error: "Web Push aún no está configurado en el servidor." }, { status: 503 });
  const { auth, p256dh } = body.keys ?? {};
  if (typeof auth !== "string" || !/^[\w-]{22}$/.test(auth)
    || typeof p256dh !== "string" || !/^[\w-]{87}$/.test(p256dh)) {
    return Response.json({ error: "Suscripción inválida." }, { status: 400 });
  }
  const data = { userId: user.userId, auth, p256dh };
  await prisma.pushSubscription.upsert({
    where: { endpoint: body.endpoint }, update: data, create: { endpoint: body.endpoint, ...data },
  });
  return Response.json({ ok: true });
}
