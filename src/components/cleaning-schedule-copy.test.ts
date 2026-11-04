import { describe, expect, it } from "vitest";
import { formatDailyCleaningHeader, formatDailyCleaningMovement, formatDailyCleaningSchedule, formatDailyCleaningScheduleLine } from "./cleaning-schedule";

describe("formatDailyCleaningHeader", () => {
  it("formats a bold WhatsApp heading in uppercase with day and month", () => {
    expect(formatDailyCleaningHeader("Calendario de limpiezas", "es-ES", "2026-10-09"))
      .toBe("*CALENDARIO DE LIMPIEZAS 09/10*");
  });
});

describe("formatDailyCleaningMovement", () => {
  it("omits guest names and includes the incoming stay length", () => {
    expect(formatDailyCleaningMovement({ kind: "turnover", nextPlatform: "booking", nextStartDate: "2026-11-04", nextEndDate: "2026-11-07" }))
      .toBe("Sale huésped ingresa huésped por 3 noches");
  });

  it("identifies Airbnb for the incoming guest", () => {
    expect(formatDailyCleaningMovement({ kind: "turnover", nextPlatform: "airbnb", nextStartDate: "2026-11-04", nextEndDate: "2026-11-14" }))
      .toBe("Sale huésped ingresa huésped por Airbnb por 10 noches");
  });

  it("explains an exit without an immediate subsequent guest", () => {
    expect(formatDailyCleaningMovement({ kind: "after" })).toBe("Sale huésped y sin huésped posterior por ahora");
  });

  it("formats an arrival-only cleaning with singular nights", () => {
    expect(formatDailyCleaningMovement({ kind: "before", nextPlatform: "airbnb", nextStartDate: "2026-11-04", nextEndDate: "2026-11-05" }))
      .toBe("Ingresa huésped por Airbnb por 1 noche");
  });
});

describe("formatDailyCleaningScheduleLine", () => {
  it("numbers the row and bolds the property for WhatsApp", () => {
    expect(formatDailyCleaningScheduleLine(2, {
      property: "Sky Eclipse 1602",
      kind: "turnover",
      nextPlatform: "direct",
      nextStartDate: "2026-11-04",
      nextEndDate: "2026-11-07",
    })).toBe("2. *Sky Eclipse 1602* : Sale huésped ingresa huésped por 3 noches");
  });
});

describe("formatDailyCleaningSchedule", () => {
  it("separates numbered one-line items with blank lines", () => {
    expect(formatDailyCleaningSchedule("Calendario de limpiezas", "es-ES", "2026-11-04", [
      { property: "Luxe Suites 113", kind: "turnover", nextPlatform: "airbnb", nextStartDate: "2026-11-04", nextEndDate: "2026-11-14" },
      { property: "Sky Elite 527", kind: "after" },
    ])).toEqual([
      "*CALENDARIO DE LIMPIEZAS 04/11*",
      "",
      "1. *Luxe Suites 113* : Sale huésped ingresa huésped por Airbnb por 10 noches",
      "",
      "2. *Sky Elite 527* : Sale huésped y sin huésped posterior por ahora",
      "",
    ]);
  });
});
