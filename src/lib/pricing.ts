export const BASIS_POINTS = 10_000;
export const RENTHOME_BASE_OCCUPANCY = 2;
export const RENTHOME_EXTRA_GUEST_FROM = 3;
export const RENTHOME_EXTRA_GUEST_MARKUP_BPS = 2_000;

export type PricingBand = {
  floorMinor: number;
  targetMinor: number;
  ceilingMinor: number;
};

function assertIntegerInRange(value: number, label: string, min: number, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${label} must be an integer between ${min} and ${max}`);
  }
}

export function assertPricingBand(band: PricingBand): void {
  assertIntegerInRange(band.floorMinor, "floorMinor", 0);
  assertIntegerInRange(band.targetMinor, "targetMinor", 0);
  assertIntegerInRange(band.ceilingMinor, "ceilingMinor", 0);
  if (band.floorMinor > band.targetMinor || band.targetMinor > band.ceilingMinor) {
    throw new RangeError("pricing band must satisfy floorMinor <= targetMinor <= ceilingMinor");
  }
}

/**
 * Returns the minimum displayed gross price that preserves a desired net floor
 * after every percentage deduction (platform commission + stacked discounts).
 * Rates are additive because that is the conservative safe-floor assumption;
 * the platform-specific adapter may replace it with its verified calculation.
 */
export function grossMinorForNetFloor(netFloorMinor: number, deductionsBps: readonly number[]): number {
  assertIntegerInRange(netFloorMinor, "netFloorMinor", 0);
  let totalDeductionsBps = 0;
  for (const deduction of deductionsBps) {
    assertIntegerInRange(deduction, "deductionBps", 0, BASIS_POINTS);
    totalDeductionsBps += deduction;
  }
  if (totalDeductionsBps >= BASIS_POINTS) {
    throw new RangeError("combined deductions must be below 10000 basis points");
  }
  return Math.ceil((netFloorMinor * BASIS_POINTS) / (BASIS_POINTS - totalDeductionsBps));
}

/** Applies a percentage discount but never returns less than the configured floor. */
export function discountedMinorWithFloor(grossMinor: number, discountBps: number, floorMinor: number): number {
  assertIntegerInRange(grossMinor, "grossMinor", 0);
  assertIntegerInRange(discountBps, "discountBps", 0, BASIS_POINTS);
  assertIntegerInRange(floorMinor, "floorMinor", 0);
  const discounted = Math.ceil((grossMinor * (BASIS_POINTS - discountBps)) / BASIS_POINTS);
  return Math.max(discounted, floorMinor);
}

/** RentHome standard: guests 1-2 use base price; guest 3 pays +20%. */
export function priceForGuests(baseMinor: number, guestCount: number): number {
  assertIntegerInRange(baseMinor, "baseMinor", 0);
  assertIntegerInRange(guestCount, "guestCount", 1);
  if (guestCount < RENTHOME_EXTRA_GUEST_FROM) return baseMinor;
  return Math.ceil((baseMinor * (BASIS_POINTS + RENTHOME_EXTRA_GUEST_MARKUP_BPS)) / BASIS_POINTS);
}
