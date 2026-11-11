import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { listAccessiblePropertyIds } from "@/lib/ownership";
import { generateShadowPrices } from "@/lib/pricing-shadow";

function boundedDays(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(365, Math.trunc(parsed))) : fallback;
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const propertyIds = await listAccessiblePropertyIds(session.userId, session.role);
  const start = request.nextUrl.searchParams.get("start") || new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  const days = boundedDays(request.nextUrl.searchParams.get("days"), 42);
  const end = new Date(`${start}T12:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + days - 1);
  const rows = await prisma.dailyPrice.findMany({
    where: { propertyId: { in: propertyIds }, date: { gte: start, lte: end.toISOString().slice(0, 10) } },
    orderBy: [{ propertyId: "asc" }, { date: "asc" }],
  });
  return NextResponse.json({ prices: rows });
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const accessible = await listAccessiblePropertyIds(session.userId, session.role);
    const body = await request.json().catch(() => ({}));
    const requested = Array.isArray(body.propertyIds) ? body.propertyIds.map(Number) : accessible;
    const allowed = requested.filter((id: number) => accessible.includes(id));
    const result = await generateShadowPrices({
      propertyIds: allowed,
      startDate: typeof body.startDate === "string" ? body.startDate : undefined,
      days: boundedDays(body.days, 90),
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudieron calcular los precios" }, { status: 500 });
  }
}
