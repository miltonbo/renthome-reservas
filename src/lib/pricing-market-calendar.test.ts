import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { easterSunday, recurringBoliviaMarketEvents } from "./pricing-market-calendar";

describe("automatic pricing market calendar", () => {
  it("calculates Gregorian Easter deterministically", () => {
    expect(easterSunday(2026).toISOString().slice(0, 10)).toBe("2026-04-05");
    expect(easterSunday(2027).toISOString().slice(0, 10)).toBe("2027-03-28");
  });

  it("derives movable Bolivia holidays from Easter", () => {
    const events = recurringBoliviaMarketEvents(2027);
    expect(events.find((event) => event.name === "Carnaval · lunes")?.startsOn).toBe("2027-02-08");
    expect(events.find((event) => event.name === "Viernes Santo")?.startsOn).toBe("2027-03-26");
    expect(events.find((event) => event.name === "Corpus Christi")?.startsOn).toBe("2027-05-27");
  });

  it("includes Santa Cruz and year-end demand signals", () => {
    const events = recurringBoliviaMarketEvents(2027);
    expect(events.some((event) => event.name === "Efeméride de Santa Cruz" && event.startsOn === "2027-09-24")).toBe(true);
    expect(events.some((event) => event.name === "Navidad" && event.startsOn === "2027-12-24" && event.endsOn === "2027-12-25")).toBe(true);
    expect(events.some((event) => event.name === "Año Nuevo" && event.startsOn === "2026-12-30" && event.endsOn === "2027-01-01")).toBe(true);
  });
});
