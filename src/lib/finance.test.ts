import { describe, expect, it } from "vitest";
import {
  operatingAllocations,
  financialAllocations,
  allowedCurrencies,
  amountToMinor,
  bookingCommission,
  isMethodCurrencyValid,
  reconciliableMovementAmounts,
  segmentChargeStatus,
  segmentReconciliationStatus,
  USD_SETTLEMENT_TOLERANCE_BOB,
  usdReservationSettlementCheck,
} from "./finance";

describe("DeptosBO finance rules", () => {
  it("restricts payment methods to the agreed operational currencies", () => {
    expect(allowedCurrencies("qr")).toEqual(["BOB"]);
    expect(allowedCurrencies("transfer")).toEqual(["BOB"]);
    expect(allowedCurrencies("airbnb")).toEqual(["USD"]);
    expect(allowedCurrencies("binance")).toEqual(["USD"]);
    expect(allowedCurrencies("takenos")).toEqual(["USD"]);
    expect(allowedCurrencies("qpos")).toEqual(["BOB"]);
    expect(allowedCurrencies("sepa")).toEqual(["USD"]);
    expect(allowedCurrencies("cash")).toEqual(["BOB", "USD"]);
    expect(isMethodCurrencyValid("qr", "USD")).toBe(false);
    expect(isMethodCurrencyValid("qpos", "USD")).toBe(false);
  });

  it("stores exact cent amounts", () => {
    expect(amountToMinor(10.01)).toBe(1001);
    expect(amountToMinor(245.8)).toBe(24580);
  });

  it("splits every receipt from Milton-operated properties 80/20 without losing cents", () => {
    const allocations = operatingAllocations(10001, "milton");
    expect(allocations).toEqual([
      { person: "milton", amountMinor: 8001, percentageBps: 8000 },
      { person: "deysi", amountMinor: 2000, percentageBps: 2000 },
    ]);
    expect(allocations.reduce((sum, item) => sum + item.amountMinor, 0)).toBe(10001);
  });

  it("assigns every receipt from Deysi-operated properties entirely to Deysi", () => {
    expect(operatingAllocations(10000, "deysi")).toEqual([
      { person: "deysi", amountMinor: 10000, percentageBps: 10000 },
    ]);
  });

  it("assigns only the configured percentage to management under an owner contract", () => {
    expect(financialAllocations(10000, { financialModel: "owner_fee", financialOperator: "milton", managementFeeBps: 1000, managementBeneficiary: "deysi" })).toEqual([
      { person: "deysi", amountMinor: 1000, percentageBps: 1000 },
    ]);
  });

  it("calculates Booking commission at 15 percent", () => {
    expect(bookingCommission(10000)).toBe(1500);
    expect(bookingCommission(140000)).toBe(21000);
  });
});

describe("reconciliation money rules", () => {
  it("ignores parking and explicit guarantee movements", () => {
    const amounts = reconciliableMovementAmounts({
      totalPrice: 800,
      priceCurrency: "BOB",
      guaranteeAmount: 250,
      moneyMovements: [
        { id: 1, type: "lodging", amountMinor: 80000, currency: "BOB" },
        { id: 2, type: "guarantee", amountMinor: 25000, currency: "BOB" },
        { id: 3, type: "parking", amountMinor: 7000, currency: "BOB" },
      ],
    });
    expect(amounts.get(1)).toBe(80000);
    expect(amounts.get(2)).toBe(0);
    expect(amounts.get(3)).toBe(0);
  });

  it("deducts an embedded BOB guarantee and preserves the real excess", () => {
    const amounts = reconciliableMovementAmounts({
      totalPrice: 800,
      priceCurrency: "BOB",
      guaranteeAmount: 250,
      moneyMovements: [{ id: 1, type: "lodging", amountMinor: 110000, currency: "BOB" }],
    });
    expect(amounts.get(1)).toBe(85000);
  });

  it("excludes a BOB guarantee recorded as lodging on a USD reservation", () => {
    const amounts = reconciliableMovementAmounts({
      totalPrice: 100,
      priceCurrency: "USD",
      guaranteeAmount: 250,
      moneyMovements: [
        { id: 1, type: "lodging", amountMinor: 10000, currency: "USD" },
        { id: 2, type: "lodging", amountMinor: 25000, currency: "BOB" },
      ],
    });
    expect(amounts.get(1)).toBe(10000);
    expect(amounts.get(2)).toBe(0);
  });

  it("does not let a guarantee or parking mark lodging as paid for reconciliation", () => {
    const status = segmentReconciliationStatus({
      totalPrice: 800,
      priceCurrency: "BOB",
      moneyMovements: [
        { type: "lodging", amountMinor: 50000, currency: "BOB" },
        { type: "guarantee", amountMinor: 25000, currency: "BOB" },
        { type: "parking", amountMinor: 5000, currency: "BOB" },
      ],
    });
    expect(status.isSettled).toBe(false);
    expect(status.balance.BOB).toBe(-300);
  });

  it("keeps the operational warning until lodging and guarantee are received", () => {
    const segment = {
      totalPrice: 800,
      priceCurrency: "BOB",
      guaranteeAmount: 250,
      guaranteeCurrency: "BOB",
      moneyMovements: [{ type: "lodging", amountMinor: 80000, currency: "BOB" }],
    };
    expect(segmentChargeStatus(segment).isSettled).toBe(false);
    expect(segmentChargeStatus(segment).balance.BOB).toBe(-250);
    expect(segmentReconciliationStatus(segment).isSettled).toBe(true);
  });

  it("marks the operational charge paid when a combined lodging payment covers the guarantee", () => {
    const status = segmentChargeStatus({
      totalPrice: 800,
      priceCurrency: "BOB",
      guaranteeAmount: 250,
      guaranteeCurrency: "BOB",
      moneyMovements: [{ type: "lodging", amountMinor: 105000, currency: "BOB" }],
    });
    expect(status.isSettled).toBe(true);
    expect(status.balance.BOB).toBe(0);
  });

  it("accepts a BOB payment equal to or above a USD reservation at the official rate", () => {
    const exact = usdReservationSettlementCheck({
      totalPrice: 100,
      priceCurrency: "USD",
      guaranteeAmount: 250,
      guaranteeCurrency: "BOB",
      moneyMovements: [{ type: "lodging", amountMinor: 145000, currency: "BOB" }],
    }, 12);
    expect(exact.ok).toBe(true);

    const excess = usdReservationSettlementCheck({
      totalPrice: 100,
      priceCurrency: "USD",
      guaranteeAmount: 250,
      guaranteeCurrency: "BOB",
      moneyMovements: [{ type: "lodging", amountMinor: 150000, currency: "BOB" }],
    }, 12);
    expect(excess.ok).toBe(true);
  });

  it("blocks manual settlement when the BOB equivalent is below the USD reservation", () => {
    const result = usdReservationSettlementCheck({
      totalPrice: 100,
      priceCurrency: "USD",
      guaranteeAmount: 250,
      guaranteeCurrency: "BOB",
      moneyMovements: [{ type: "lodging", amountMinor: 140000, currency: "BOB" }],
    }, 12);
    expect(result.ok).toBe(false);
    expect(result.expectedLodgingBOB).toBe(1200);
    expect(result.paidLodgingBOB).toBe(1150);
    expect(result.lodgingShortfallBOB).toBe(50);
  });

  it("accepts up to Bs 10 below the official USD equivalent, but not more", () => {
    const reservation = {
      totalPrice: 75,
      priceCurrency: "USD",
      guaranteeAmount: 0,
      guaranteeCurrency: "BOB",
    };
    const roundedPayment = usdReservationSettlementCheck({
      ...reservation,
      moneyMovements: [{ type: "lodging", amountMinor: 90000, currency: "BOB" }],
    }, 12.02);
    expect(roundedPayment.expectedLodgingBOB).toBe(901.5);
    expect(roundedPayment.lodgingShortfallBOB).toBe(1.5);
    expect(roundedPayment.ok).toBe(true);

    const boundary = usdReservationSettlementCheck({
      ...reservation,
      moneyMovements: [{ type: "lodging", amountMinor: 89150, currency: "BOB" }],
    }, 12.02);
    expect(boundary.lodgingShortfallBOB).toBe(USD_SETTLEMENT_TOLERANCE_BOB);
    expect(boundary.ok).toBe(true);

    const tooLow = usdReservationSettlementCheck({
      ...reservation,
      moneyMovements: [{ type: "lodging", amountMinor: 89149, currency: "BOB" }],
    }, 12.02);
    expect(tooLow.lodgingShortfallBOB).toBe(10.01);
    expect(tooLow.ok).toBe(false);
  });

  it("keeps the BOB guarantee mandatory before applying BOB to USD lodging", () => {
    const result = usdReservationSettlementCheck({
      totalPrice: 100,
      priceCurrency: "USD",
      guaranteeAmount: 250,
      guaranteeCurrency: "BOB",
      moneyMovements: [
        { type: "lodging", amountMinor: 10000, currency: "BOB" },
        { type: "lodging", amountMinor: 10000, currency: "USD" },
      ],
    }, 12);
    expect(result.ok).toBe(false);
    expect(result.guaranteeShortfallBOB).toBe(150);
  });
});
