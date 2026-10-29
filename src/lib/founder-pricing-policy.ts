export const FOUNDER_PRICING_LIMIT = 10;

export function parseFounderClaimCount(value: string | null | undefined) {
  const parsed = Number.parseInt(value ?? "0", 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(parsed, FOUNDER_PRICING_LIMIT);
}
