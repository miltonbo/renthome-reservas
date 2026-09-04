export const CURRENCIES = ["BOB", "USD"] as const;
export type MoneyCurrency = (typeof CURRENCIES)[number];

export const FINANCIAL_PEOPLE = ["deysi", "milton"] as const;
export type FinancialPerson = (typeof FINANCIAL_PEOPLE)[number];

export const PAYMENT_METHODS = [
  "qr", "transfer", "airbnb", "binance", "takenos", "sepa", "cash",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  qr: "QR",
  transfer: "Transferencia",
  airbnb: "Airbnb",
  binance: "Binance",
  takenos: "Takenos",
  sepa: "SEPA",
  cash: "Efectivo",
};

export function isCurrency(value: unknown): value is MoneyCurrency {
  return typeof value === "string" && CURRENCIES.includes(value as MoneyCurrency);
}

export function isFinancialPerson(value: unknown): value is FinancialPerson {
  return typeof value === "string" && FINANCIAL_PEOPLE.includes(value as FinancialPerson);
}

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && PAYMENT_METHODS.includes(value as PaymentMethod);
}

export function allowedCurrencies(method: PaymentMethod): readonly MoneyCurrency[] {
  if (method === "qr" || method === "transfer") return ["BOB"];
  if (method === "cash") return CURRENCIES;
  return ["USD"];
}

export function isMethodCurrencyValid(method: PaymentMethod, currency: MoneyCurrency): boolean {
  return allowedCurrencies(method).includes(currency);
}

export function amountToMinor(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100);
}

export function minorToAmount(amountMinor: number): number {
  return amountMinor / 100;
}

export function operatingAllocations(amountMinor: number, operator: FinancialPerson) {
  if (operator === "deysi") {
    return [{ person: "deysi" as const, amountMinor, percentageBps: 10000 }];
  }
  const deysiAmount = Math.round(amountMinor * 0.2);
  return [
    { person: "milton" as const, amountMinor: amountMinor - deysiAmount, percentageBps: 8000 },
    { person: "deysi" as const, amountMinor: deysiAmount, percentageBps: 2000 },
  ];
}

export interface PropertyFinancialPolicy {
  financialOperator?: string | null;
  financialModel?: string | null;
  managementFeeBps?: number | null;
  managementBeneficiary?: string | null;
  bookingCommissionPayer?: string | null;
}

export function bookingCommissionLiability(policy: PropertyFinancialPolicy): "deysi" | "milton" | "owner" {
  if (policy.bookingCommissionPayer === "owner" || policy.bookingCommissionPayer === "deysi" || policy.bookingCommissionPayer === "milton") return policy.bookingCommissionPayer;
  return policy.financialOperator === "deysi" ? "deysi" : "milton";
}

/** Internal entitlement for a single movement. Fixed per-reservation fees
 * are applied by reconciliation after movements have been grouped. */
export function financialAllocations(amountMinor: number, policy: PropertyFinancialPolicy) {
  if (policy.financialModel === "owner_fee") {
    const beneficiary: FinancialPerson = policy.managementBeneficiary === "milton" ? "milton" : "deysi";
    const percentageBps = Math.max(0, Math.min(10000, policy.managementFeeBps || 0));
    return [{ person: beneficiary, amountMinor: Math.round(amountMinor * percentageBps / 10000), percentageBps }];
  }
  const operator: FinancialPerson = policy.financialOperator === "deysi" ? "deysi" : "milton";
  return operatingAllocations(amountMinor, operator);
}

/** Backwards-compatible name for existing Airbnb import call sites. */
export const airbnbAllocations = operatingAllocations;

export function bookingCommission(amountMinor: number): number {
  return Math.round(amountMinor * 0.15);
}

export function isReconciliableMovementType(type: string): boolean {
  return ["lodging", "additional", "adjustment", "refund"].includes(type);
}

export interface SegmentChargeLike {
  totalPrice?: number | null;
  priceCurrency?: string | null;
  guaranteeAmount?: number | null;
  guaranteeCurrency?: string | null;
  settledManuallyAt?: string | Date | null;
  moneyMovements?: Array<{ type: string; amountMinor: number; currency: string }>;
}

export interface ReconciliationSegmentLike extends SegmentChargeLike {
  guaranteeAmount?: number | null;
  moneyMovements?: Array<{ id: number; type: string; amountMinor: number; currency: string; occurredAt?: string | Date }>;
}

/** Payment state for one reservation segment. Guarantees are refundable
 * references and parking is managed outside DeptosBO, so neither pays down
 * the lodging charge. Mixed-currency stays can be confirmed with the existing
 * manual settlement override. */
function calculateSegmentStatus(segment: SegmentChargeLike, includeGuarantee: boolean) {
  const expected = { BOB: 0, USD: 0 };
  const paid = { BOB: 0, USD: 0 };
  const currency: MoneyCurrency = segment.priceCurrency === "USD" ? "USD" : "BOB";
  if (segment.totalPrice != null) expected[currency] = segment.totalPrice;
  if (includeGuarantee && segment.guaranteeAmount != null) {
    const guaranteeCurrency: MoneyCurrency = segment.guaranteeCurrency === "USD" ? "USD" : "BOB";
    expected[guaranteeCurrency] += segment.guaranteeAmount;
  }
  for (const movement of segment.moneyMovements || []) {
    if (!["lodging", "refund", ...(includeGuarantee ? ["guarantee"] : [])].includes(movement.type)) continue;
    const movementCurrency: MoneyCurrency = movement.currency === "USD" ? "USD" : "BOB";
    paid[movementCurrency] += movement.amountMinor / 100;
  }
  const balance = { BOB: paid.BOB - expected.BOB, USD: paid.USD - expected.USD };
  const manuallySettled = Boolean(segment.settledManuallyAt);
  if (manuallySettled) {
    if (balance.BOB < 0) balance.BOB = 0;
    if (balance.USD < 0) balance.USD = 0;
  }
  const hasKnownCharge = segment.totalPrice != null || (includeGuarantee && segment.guaranteeAmount != null);
  return {
    expected,
    paid,
    balance,
    manuallySettled,
    hasKnownCharge,
    isSettled: hasKnownCharge && (manuallySettled || (balance.BOB >= -0.005 && balance.USD >= -0.005)),
    hasOutstandingBalance: hasKnownCharge && (balance.BOB < -0.005 || balance.USD < -0.005),
  };
}

/** Operational collection state shown on reservations. The refundable
 * guarantee must be received before the segment is displayed as fully paid. */
export function segmentChargeStatus(segment: SegmentChargeLike) {
  return calculateSegmentStatus(segment, true);
}

/** Financial settlement state. Guarantees never participate in income or in
 * the monthly distribution even though they remain pending operationally. */
export function segmentReconciliationStatus(segment: SegmentChargeLike) {
  return calculateSegmentStatus(segment, false);
}

/** Returns the portion of every movement that participates in reconciliation.
 * Old explicit parking/guarantee rows remain auditable but contribute zero.
 * When a BOB lodging payment bundled the refundable guarantee, the guarantee
 * is inferred only from the amount above the lodging charge and deducted once. */
export function reconciliableMovementAmounts(segment: ReconciliationSegmentLike): Map<number, number> {
  const result = new Map<number, number>();
  const movements = [...(segment.moneyMovements || [])].sort((a, b) => {
    const timeA = a.occurredAt ? new Date(a.occurredAt).getTime() : 0;
    const timeB = b.occurredAt ? new Date(b.occurredAt).getTime() : 0;
    return timeA - timeB || a.id - b.id;
  });
  for (const movement of movements) result.set(movement.id, isReconciliableMovementType(movement.type) ? movement.amountMinor : 0);

  const lodgingReceived = movements
    .filter((movement) => movement.type === "lodging" && movement.currency !== "USD" && movement.amountMinor > 0)
    .reduce((sum, movement) => sum + movement.amountMinor, 0);
  // A USD-priced stay has no BOB lodging basis. Any BOB amount bundled into
  // "Hospedaje" first covers its BOB guarantee; only the remainder is income.
  const lodgingExpected = segment.priceCurrency === "USD"
    ? 0
    : Math.round((segment.totalPrice || 0) * 100);
  let implicitGuarantee = Math.min(
    Math.round((segment.guaranteeAmount || 0) * 100),
    Math.max(0, lodgingReceived - lodgingExpected),
  );
  for (const movement of [...movements].reverse()) {
    if (implicitGuarantee <= 0) break;
    if (movement.type !== "lodging" || movement.currency === "USD" || movement.amountMinor <= 0) continue;
    const deduction = Math.min(implicitGuarantee, Math.max(0, result.get(movement.id) || 0));
    result.set(movement.id, (result.get(movement.id) || 0) - deduction);
    implicitGuarantee -= deduction;
  }
  return result;
}

export function moneyLabel(amountMinor: number, currency: MoneyCurrency): string {
  const amount = new Intl.NumberFormat("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    .format(minorToAmount(amountMinor));
  return currency === "USD" ? `USD ${amount}` : `Bs ${amount}`;
}
