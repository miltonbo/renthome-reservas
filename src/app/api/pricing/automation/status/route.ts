import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listAccessiblePropertyIds } from "@/lib/ownership";
import { enqueuePricingAutomationRuns } from "@/lib/pricing-automation";
import { pricingWorkerConfigured } from "@/lib/pricing-worker-auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const propertyIds = await listAccessiblePropertyIds(session.userId, session.role);
  const [connections, runs] = await Promise.all([
    prisma.pricingChannelConnection.findMany({
      where: { propertyId: { in: propertyIds } }, include: { property: { select: { name: true } } },
      orderBy: [{ channel: "asc" }, { property: { name: "asc" } }],
    }),
    prisma.pricingAutomationRun.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  return NextResponse.json({ workerConfigured: pricingWorkerConfigured(), connections, runs });
}

export async function POST(_request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "superadmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const now = new Date();
  const slotKey = `manual-${now.toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`;
  const runs = await enqueuePricingAutomationRuns(slotKey, "manual");
  return NextResponse.json({ runs }, { status: 201 });
}
