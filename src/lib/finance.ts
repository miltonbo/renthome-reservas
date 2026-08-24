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

export function moneyLabel(amountMinor: number, currency: MoneyCurrency): string {
  const amount = new Intl.NumberFormat("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    .format(minorToAmount(amountMinor));
  return currency === "USD" ? `USD ${amount}` : `Bs ${amount}`;
}
