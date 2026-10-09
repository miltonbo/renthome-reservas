import { describe, expect, it } from "vitest";
import { formatDailyCleaningHeader, formatDailyCleaningMovement } from "./cleaning-schedule";

describe("formatDailyCleaningHeader", () => {
  it("formats a bold WhatsApp heading in uppercase with day and month", () => {
    expect(formatDailyCleaningHeader("Calendario de limpiezas", "es-ES", "2026-10-09"))
      .toBe("*CALENDARIO DE LIMPIEZAS 09/10*");
  });
});

describe("formatDailyCleaningMovement", () => {
  it("omits guest names and non-Airbnb channels from a turnover", () => {
    expect(formatDailyCleaningMovement({ kind: "turnover", prevPlatform: "direct", nextPlatform: "booking" }))
      .toBe("Cambio de huésped: sale e ingresa huésped");
  });

  it("identifies Airbnb only on the side that uses that channel", () => {
    expect(formatDailyCleaningMovement({ kind: "turnover", prevPlatform: "direct", nextPlatform: "airbnb" }))
      .toBe("Cambio de huésped: sale huésped e ingresa huésped Airbnb");
    expect(formatDailyCleaningMovement({ kind: "turnover", prevPlatform: "Airbnb", nextPlatform: "direct" }))
      .toBe("Cambio de huésped: sale huésped Airbnb e ingresa huésped");
  });

  it("keeps single movements concise and only labels Airbnb", () => {
    expect(formatDailyCleaningMovement({ kind: "after", prevPlatform: "airbnb" })).toBe("Sale huésped Airbnb");
    expect(formatDailyCleaningMovement({ kind: "before", nextPlatform: "direct" })).toBe("Ingresa huésped");
  });
});
