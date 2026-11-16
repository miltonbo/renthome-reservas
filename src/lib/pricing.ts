export const BASIS_POINTS = 10_000;
export const RENTHOME_BASE_OCCUPANCY = 2;
export const RENTHOME_EXTRA_GUEST_FROM = 3;
export const RENTHOME_EXTRA_GUEST_MARKUP_BPS = 2_000;

export type PricingBand = {
  floorMinor: number;
  targetMinor: number;
};

function assertIntegerInRange(value: number, label: string, min: number, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${label} must be an integer between ${min} and ${max}`);
  }
}

export function assertPricingBand(band: PricingBand): void {
  assertIntegerInRange(band.floorMinor, "floorMinor", 0);
  assertIntegerInRange(band.targetMinor, "targetMinor", 0);
  if (band.floorMinor > band.targetMinor) {
    throw new RangeError("pricing band must satisfy floorMinor <= targetMinor");
  }
}

/**
 * Returns the minimum displayed gross price that preserves a desired net floor
 * after every percentage deduction (platform commission + stacked discounts).
 * Each deduction is applied sequentially. This matches a promotion reducing
 * the sell rate and the platform commission being charged on the resulting
 * booking subtotal.
 */
export function grossMinorForNetFloor(netFloorMinor: number, deductionsBps: readonly number[]): number {
  assertIntegerInRange(netFloorMinor, "netFloorMinor", 0);
  let retention = 1;
  for (const deduction of deductionsBps) {
    assertIntegerInRange(deduction, "deductionBps", 0, BASIS_POINTS - 1);
    retention *= (BASIS_POINTS - deduction) / BASIS_POINTS;
  }
  let gross = Math.ceil(netFloorMinor / retention);
  while (netMinorAfterDeductions(gross, deductionsBps) < netFloorMinor) gross++;
  return gross;
}

/** Returns the net payout after sequential discounts and commissions. */
export function netMinorAfterDeductions(grossMinor: number, deductionsBps: readonly number[]): number {
  assertIntegerInRange(grossMinor, "grossMinor", 0);
  let net = grossMinor;
  for (const deduction of deductionsBps) {
    assertIntegerInRange(deduction, "deductionBps", 0, BASIS_POINTS - 1);
    net = Math.floor(net * (BASIS_POINTS - deduction) / BASIS_POINTS);
  }
  return net;
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
