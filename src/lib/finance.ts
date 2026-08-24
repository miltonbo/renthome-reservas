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

export function airbnbAllocations(amountMinor: number, operator: FinancialPerson) {
  if (operator === "deysi") {
    return [{ person: "deysi" as const, amountMinor, percentageBps: 10000 }];
  }
  const deysiAmount = Math.round(amountMinor * 0.2);
  return [
    { person: "milton" as const, amountMinor: amountMinor - deysiAmount, percentageBps: 8000 },
    { person: "deysi" as const, amountMinor: deysiAmount, percentageBps: 2000 },
  ];
}

export function bookingCommission(amountMinor: number): number {
  return Math.round(amountMinor * 0.15);
}

export function moneyLabel(amountMinor: number, currency: MoneyCurrency): string {
  const amount = new Intl.NumberFormat("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    .format(minorToAmount(amountMinor));
  return currency === "USD" ? `USD ${amount}` : `Bs ${amount}`;
}
