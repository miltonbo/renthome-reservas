import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listAccessiblePropertyIds } from "@/lib/ownership";
import { prisma } from "@/lib/prisma";
import { refreshPricingFeedback } from "@/lib/pricing-feedback";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const propertyIds = await listAccessiblePropertyIds(session.userId, session.role);
  const [decisions, appliedDecisions, exposures, outcomes, calibrations, metrics, latestCalibration] = await Promise.all([
    prisma.pricingDecision.count({ where: { propertyId: { in: propertyIds } } }),
    prisma.pricingDecision.count({ where: { propertyId: { in: propertyIds }, status: { in: ["applied", "mismatch", "manual_override"] } } }),
    prisma.pricingExposure.count({ where: { propertyId: { in: propertyIds } } }),
    prisma.pricingOutcome.count({ where: { propertyId: { in: propertyIds } } }),
    prisma.pricingCalibration.findMany({
      where: { propertyId: { in: propertyIds }, durationBand: "all" },
      include: { property: { select: { name: true } } },
      orderBy: [{ channel: "asc" }, { property: { name: "asc" } }],
    }),
    prisma.channelPerformanceMetric.count({ where: { propertyId: { in: propertyIds } } }),
    prisma.pricingCalibration.findFirst({ where: { propertyId: { in: propertyIds } }, orderBy: { calculatedAt: "desc" }, select: { calculatedAt: true } }),
  ]);
  return NextResponse.json({
    counts: { decisions, appliedDecisions, exposures, outcomes, calibrations: calibrations.length, performanceMetrics: metrics },
    latestCalibrationAt: latestCalibration?.calculatedAt || null,
    calibrations,
  });
}

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "superadmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json(await refreshPricingFeedback());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo recalibrar el motor" }, { status: 500 });
  }
}
