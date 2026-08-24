import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

describe("financial report workbook", () => {
  it("creates a valid four-sheet Excel workbook with auditable detail", async () => {
    process.env.DATABASE_URL ||= "file:./data/test.db";
    const { buildFinancialWorkbook } = await import("./route");
    const data = {
      period: { from: "2026-08-01", to: "2026-08-31" },
      channelTotals: { booking: { reservations: 1, BOB: 580, USD: 0 } },
      held: { deysi: { BOB: 0, USD: 0 }, milton: { BOB: 58000, USD: 0 } },
      entitled: { deysi: { BOB: 0, USD: 0 }, milton: { BOB: 58000, USD: 0 } },
      commissions: { deysi: { BOB: 0, USD: 0 }, milton: { BOB: 8700, USD: 0 } },
      transfers: [],
      reservations: [{ id: 1, property: "Sky Elite 331", guest: "Huésped prueba", channel: "booking", checkIn: "2026-08-20", checkOut: "2026-08-22", nights: 2, lodgingAmount: 580, lodgingCurrency: "BOB", parkingAmount: 0, parkingCurrency: "BOB", guaranteeAmount: 250, guaranteeCurrency: "BOB", receivedBOB: 58000, receivedUSD: 0, commissionAmount: 8700, commissionCurrency: "BOB", commissionResponsible: "milton", note: "" }],
      performance: [{ property: "Sky Elite 331", occupiedNights: 2, freeNights: 29, occupancy: 2 / 31, averageNightlyBOB: 290, averageNightlyUSD: 0 }],
    };
    const workbook = buildFinancialWorkbook(data, [{ date: new Date("2026-08-20T14:00:00Z"), property: "Sky Elite 331", guest: "Huésped prueba", channel: "booking", type: "lodging", method: "qr", currency: "BOB", amount: 580, receivedBy: "milton", note: "" }]);
    const buffer = await workbook.xlsx.writeBuffer();
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(buffer);
    expect(loaded.worksheets.map((sheet) => sheet.name)).toEqual(["Gerencial", "Reservas", "Rendimiento", "Movimientos"]);
    expect(loaded.getWorksheet("Reservas")?.getCell("B2").value).toBe("Sky Elite 331");
    expect(loaded.getWorksheet("Movimientos")?.getCell("H2").value).toBe(580);
  });
});
