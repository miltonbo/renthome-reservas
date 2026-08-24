import { describe, expect, it } from "vitest";
import {
  airbnbAllocations,
  allowedCurrencies,
  amountToMinor,
  bookingCommission,
  isMethodCurrencyValid,
} from "./finance";

describe("RentHome finance rules", () => {
  it("restricts payment methods to the agreed operational currencies", () => {
    expect(allowedCurrencies("qr")).toEqual(["BOB"]);
    expect(allowedCurrencies("transfer")).toEqual(["BOB"]);
    expect(allowedCurrencies("airbnb")).toEqual(["USD"]);
    expect(allowedCurrencies("binance")).toEqual(["USD"]);
    expect(allowedCurrencies("takenos")).toEqual(["USD"]);
    expect(allowedCurrencies("sepa")).toEqual(["USD"]);
    expect(allowedCurrencies("cash")).toEqual(["BOB", "USD"]);
    expect(isMethodCurrencyValid("qr", "USD")).toBe(false);
  });

  it("stores exact cent amounts", () => {
    expect(amountToMinor(10.01)).toBe(1001);
    expect(amountToMinor(245.8)).toBe(24580);
  });

  it("splits Milton-operated Airbnb receipts 80/20 without losing cents", () => {
    const allocations = airbnbAllocations(10001, "milton");
    expect(allocations).toEqual([
      { person: "milton", amountMinor: 8001, percentageBps: 8000 },
      { person: "deysi", amountMinor: 2000, percentageBps: 2000 },
    ]);
    expect(allocations.reduce((sum, item) => sum + item.amountMinor, 0)).toBe(10001);
  });

  it("assigns Deysi-operated Airbnb receipts entirely to Deysi", () => {
    expect(airbnbAllocations(10000, "deysi")).toEqual([
      { person: "deysi", amountMinor: 10000, percentageBps: 10000 },
    ]);
  });

  it("calculates Booking commission at 15 percent", () => {
    expect(bookingCommission(10000)).toBe(1500);
  });
});
