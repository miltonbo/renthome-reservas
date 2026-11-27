import { describe, expect, it } from "vitest";
import { rentHomeCanCheckIn, rentHomeCanCheckOut } from "./renthome-availability-calendar";

describe("RentHome property calendar", () => {
  const calendar = {
    minNights: 2,
    maxNights: 365,
    ranges: [{ start: "2026-12-11", end: "2026-12-15" }, { start: "2026-12-19", end: "2026-12-23" }],
  };

  it("only offers arrival when enough consecutive nights remain", () => {
    expect(rentHomeCanCheckIn(calendar, "2026-12-13")).toBe(true);
    expect(rentHomeCanCheckIn(calendar, "2026-12-14")).toBe(false);
    expect(rentHomeCanCheckIn(calendar, "2026-12-18")).toBe(false);
  });

  it("allows checkout at the boundary and disallows crossing a blocked night", () => {
    expect(rentHomeCanCheckOut(calendar, "2026-12-13", "2026-12-14")).toBe(false);
    expect(rentHomeCanCheckOut(calendar, "2026-12-13", "2026-12-15")).toBe(true);
    expect(rentHomeCanCheckOut(calendar, "2026-12-13", "2026-12-19")).toBe(false);
    expect(rentHomeCanCheckOut({ ...calendar, maxNights: 3 }, "2026-12-11", "2026-12-15")).toBe(false);
  });
});
