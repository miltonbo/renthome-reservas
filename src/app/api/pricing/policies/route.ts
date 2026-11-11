import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { canManageProperty, listAccessiblePropertyIds } from "@/lib/ownership";
import { assertPricingBand } from "@/lib/pricing";
import { logAudit } from "@/lib/audit";

const CHANNEL_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const PROMOTION_TYPES = new Set(["genius", "mobile", "country", "last_minute", "weekly", "monthly", "custom"]);

function integer(value: unknown, label: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new RangeError(`${label} inválido`);
  return parsed;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const propertyIds = await listAccessiblePropertyIds(session.userId, session.role);
  const [properties, policies, promotions] = await Promise.all([
    prisma.property.findMany({
      where: { id: { in: propertyIds }, isPaused: false },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.pricingPolicy.findMany({ where: { propertyId: { in: propertyIds } }, orderBy: [{ propertyId: "asc" }, { channel: "asc" }] }),
    prisma.promotionPolicy.findMany({ where: { propertyId: { in: propertyIds } }, orderBy: [{ propertyId: "asc" }, { channel: "asc" }, { promotionType: "asc" }] }),
  ]);
  return NextResponse.json({ properties, policies, promotions });
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    const propertyId = integer(body.propertyId, "propertyId", 1);
    if (!(await canManageProperty(propertyId, session.userId, session.role))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const channel = typeof body.channel === "string" ? body.channel.trim().toLowerCase() : "";
    if (!CHANNEL_RE.test(channel)) return NextResponse.json({ error: "Canal inválido" }, { status: 400 });

    if (body.kind === "promotion") {
      const promotionType = typeof body.promotionType === "string" ? body.promotionType : "";
      if (!PROMOTION_TYPES.has(promotionType)) return NextResponse.json({ error: "Promoción inválida" }, { status: 400 });
      const discountBps = integer(body.discountBps, "discountBps", 0, 10_000);
      const minLeadDays = body.minLeadDays == null ? null : integer(body.minLeadDays, "minLeadDays", 0, 3650);
      const maxLeadDays = body.maxLeadDays == null ? null : integer(body.maxLeadDays, "maxLeadDays", 0, 3650);
      if (minLeadDays != null && maxLeadDays != null && minLeadDays > maxLeadDays) {
        return NextResponse.json({ error: "El mínimo de anticipación no puede superar el máximo" }, { status: 400 });
      }
      const existing = await prisma.promotionPolicy.findUnique({
        where: { propertyId_channel_promotionType: { propertyId, channel, promotionType } },
      });
      const promotion = await prisma.promotionPolicy.upsert({
        where: { propertyId_channel_promotionType: { propertyId, channel, promotionType } },
        create: {
          propertyId,
          channel,
          promotionType,
          enabled: Boolean(body.enabled),
          discountBps,
          stackable: Boolean(body.stackable),
          minNights: integer(body.minNights ?? 1, "minNights", 1, 365),
          minLeadDays,
          maxLeadDays,
          netFloorMinor: integer(body.netFloorMinor, "netFloorMinor", 0),
          netFloorCurrency: body.netFloorCurrency === "USD" ? "USD" : "BOB",
          requiresReviewBps: integer(body.requiresReviewBps ?? 2_000, "requiresReviewBps", 0, 10_000),
        },
        update: {
          enabled: Boolean(body.enabled),
          discountBps,
          stackable: Boolean(body.stackable),
          minNights: integer(body.minNights ?? 1, "minNights", 1, 365),
          minLeadDays,
          maxLeadDays,
          netFloorMinor: integer(body.netFloorMinor, "netFloorMinor", 0),
          netFloorCurrency: body.netFloorCurrency === "USD" ? "USD" : "BOB",
          requiresReviewBps: integer(body.requiresReviewBps ?? 2_000, "requiresReviewBps", 0, 10_000),
        },
      });
      await logAudit(session.userId, existing ? "update" : "create", "promotionPolicy", promotion.id, { propertyId, channel, promotionType });
      return NextResponse.json({ promotion });
    }

    const currency = body.currency === "USD" ? "USD" : "BOB";
    const band = {
      floorMinor: integer(body.floorMinor, "floorMinor", 0),
      targetMinor: integer(body.targetMinor, "targetMinor", 0),
      ceilingMinor: integer(body.ceilingMinor, "ceilingMinor", 0),
    };
    assertPricingBand(band);
    const existing = await prisma.pricingPolicy.findUnique({ where: { propertyId_channel: { propertyId, channel } } });
    const values = {
      currency,
      ...band,
      baseOccupancy: integer(body.baseOccupancy ?? 2, "baseOccupancy", 1, 20),
      extraGuestFrom: integer(body.extraGuestFrom ?? 3, "extraGuestFrom", 2, 21),
      extraGuestMarkupBps: integer(body.extraGuestMarkupBps ?? 2_000, "extraGuestMarkupBps", 0, 10_000),
      commissionBps: integer(body.commissionBps ?? 0, "commissionBps", 0, 9_999),
      maxDiscountBps: integer(body.maxDiscountBps ?? 2_000, "maxDiscountBps", 0, 10_000),
      defaultMinNights: integer(body.defaultMinNights ?? 2, "defaultMinNights", 1, 365),
      gapMinNights: integer(body.gapMinNights ?? 1, "gapMinNights", 1, 365),
      isActive: body.isActive !== false,
    };
    if (values.extraGuestFrom <= values.baseOccupancy) {
      return NextResponse.json({ error: "El huésped adicional debe comenzar después de la ocupación base" }, { status: 400 });
    }
    const policy = await prisma.pricingPolicy.upsert({
      where: { propertyId_channel: { propertyId, channel } },
      create: { propertyId, channel, ...values },
      update: values,
    });
    await logAudit(session.userId, existing ? "update" : "create", "pricingPolicy", policy.id, { propertyId, channel });
    return NextResponse.json({ policy });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Datos inválidos";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
