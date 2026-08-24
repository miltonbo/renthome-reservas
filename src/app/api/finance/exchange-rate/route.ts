import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const BCB_URL = "https://www.bcb.gob.bo/librerias/indicadores/dolar/bolsin.php";

function dateInBolivia() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const today = dateInBolivia();
  const cached = await prisma.exchangeRate.findFirst({
    where: { effectiveDate: today, currency: "USD", source: "BCB" },
  });
  if (cached) return NextResponse.json({ ...cached, bobPerUsd: cached.bobPerUnitMinor / 100, referenceOnly: true });
  try {
    const response = await fetch(BCB_URL, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`BCB ${response.status}`);
    const html = await response.text();
    const text = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ");
    const value = text.match(/Bs\s*([0-9]+(?:[.,][0-9]+)?)\s*por\s*1\s*US\$/i)?.[1];
    if (!value) throw new Error("BCB value not found");
    const bobPerUsd = Number(value.replace(",", "."));
    const effectiveDate = today;
    const rate = await prisma.exchangeRate.upsert({
      where: { effectiveDate_currency_source: { effectiveDate, currency: "USD", source: "BCB" } },
      create: { effectiveDate, currency: "USD", source: "BCB", bobPerUnitMinor: Math.round(bobPerUsd * 100) },
      update: { bobPerUnitMinor: Math.round(bobPerUsd * 100), fetchedAt: new Date() },
    });
    return NextResponse.json({ ...rate, bobPerUsd, referenceOnly: true });
  } catch (error) {
    const latest = await prisma.exchangeRate.findFirst({ where: { currency: "USD", source: "BCB" }, orderBy: { effectiveDate: "desc" } });
    if (latest) return NextResponse.json({ ...latest, bobPerUsd: latest.bobPerUnitMinor / 100, referenceOnly: true, stale: true });
    return NextResponse.json({ error: "BCB rate unavailable", detail: error instanceof Error ? error.message : "Unknown error" }, { status: 503 });
  }
}
