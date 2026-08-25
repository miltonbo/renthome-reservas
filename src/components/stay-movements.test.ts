import { describe, expect, it } from "vitest";
import { computeStayMovements } from "./cleaning-schedule";
import type { Property, Reservation } from "@/lib/types";

const reservation = (values: Partial<Reservation> & Pick<Reservation, "id" | "name" | "checkIn" | "checkOut">): Reservation => ({
  platform: "direct",
  propertyId: 1,
  createdAt: "2026-08-01T00:00:00Z",
  ...values,
});

const property = (reservations: Reservation[]): Property => ({
  id: 1,
  userId: 1,
  name: "Sky Elite 406",
  minNights: 1,
  checkInTime: "14:00",
  checkOutTime: "11:00",
  bookingWindow: 365,
  cleaningEnabled: true,
  reservations,
});

describe("computeStayMovements", () => {
  it("does not count an extension as a new arrival and uses only the final checkout", () => {
    const movements = computeStayMovements([property([
      reservation({ id: 10, name: "Sebastian", checkIn: "2026-08-24", checkOut: "2026-08-25", platform: "airbnb" }),
      reservation({ id: 11, name: "Sebastian", checkIn: "2026-08-25", checkOut: "2026-08-26", platform: "direct", extensionOfId: 10 }),
    ])]);

    expect(movements).toEqual([
      expect.objectContaining({ kind: "checkin", date: "2026-08-24", reservationId: 10 }),
      expect.objectContaining({ kind: "checkout", date: "2026-08-26", reservationId: 11 }),
    ]);
  });

  it("omits cancelled reservations", () => {
    const movements = computeStayMovements([property([
      reservation({ id: 20, name: "Cancelado", checkIn: "2026-08-25", checkOut: "2026-08-27", status: "cancelled" }),
    ])]);
    expect(movements).toEqual([]);
  });
});
