import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { boliviaPublicationWindow, selectBcbRates } from "./bcb-exchange-rate";

describe("BCB official exchange rate", () => {
  it("selects the rate effective today while preserving the next published rate", () => {
    const result = selectBcbRates({
      datos: [
        { Fecha: "2026-10-27", Valor: 12.02 },
        { Fecha: "2026-10-28", Valor: 12.02 },
        { Fecha: "2026-10-29", Valor: 12.11 },
      ],
    }, "2026-10-28");
    expect(result.current).toEqual({ Fecha: "2026-10-28", Valor: 12.02 });
    expect(result.latest).toEqual({ Fecha: "2026-10-29", Valor: 12.11 });
  });

  it("refreshes shortly after the BCB weekday publication at 20:00 Bolivia time", () => {
    expect(boliviaPublicationWindow(new Date("2026-10-29T00:10:00Z"))).toBe(true);
    expect(boliviaPublicationWindow(new Date("2026-10-29T00:40:00Z"))).toBe(false);
    expect(boliviaPublicationWindow(new Date("2026-11-01T00:10:00Z"))).toBe(false);
  });
});
