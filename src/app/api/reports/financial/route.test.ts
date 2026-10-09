import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

describe("financial report workbook", () => {
  it("lists the unoccupied ranges before and after a reservation", async () => {
    process.env.DATABASE_URL ||= "file:./data/test.db";
    const { calculateFreePeriods } = await import("./route");
    expect(calculateFreePeriods(
      [{ id: 1, name: "Sky Elite 331" }],
      [{ propertyId: 1, checkIn: new Date("2026-09-10T00:00:00.000Z"), checkOut: new Date("2026-09-29T00:00:00.000Z") }],
      new Date("2026-09-01T00:00:00.000Z"),
      new Date("2026-10-01T00:00:00.000Z"),
    )).toEqual([
      { propertyId: 1, property: "Sky Elite 331", checkIn: "2026-09-01", checkOut: "2026-09-10", nights: 9 },
      { propertyId: 1, property: "Sky Elite 331", checkIn: "2026-09-29", checkOut: "2026-10-01", nights: 2 },
    ]);
  });

  it("routes owner-contract collections through Deysi instead of the owner", async () => {
    process.env.DATABASE_URL ||= "file:./data/test.db";
    const { personToPersonTransfers } = await import("./route");
    expect(personToPersonTransfers(
      { deysi: { BOB: 0, USD: 0 }, milton: { BOB: 165000, USD: 7620 } },
      { deysi: { BOB: 165000, USD: 7620 }, milton: { BOB: 0, USD: 0 } },
    )).toEqual([
      { from: "milton", to: "deysi", currency: "BOB", amountMinor: 165000 },
      { from: "milton", to: "deysi", currency: "USD", amountMinor: 7620 },
    ]);
  });

  it("assigns payments to the checkout month of a cross-month stay", async () => {
    process.env.DATABASE_URL ||= "file:./data/test.db";
    const { financialMovementPeriodWhere } = await import("./route");
    const from = new Date("2026-10-01T00:00:00.000Z");
    const toExclusive = new Date("2026-11-01T00:00:00.000Z");

    expect(financialMovementPeriodWhere([23], from, toExclusive)).toEqual({
      reservation: {
        is: {
          propertyId: { in: [23] },
          status: "confirmed",
          checkOut: { gte: from, lt: toExclusive },
        },
      },
    });
  });

  it("creates a valid four-sheet Excel workbook with auditable detail", async () => {
    process.env.DATABASE_URL ||= "file:./data/test.db";
    const { buildFinancialWorkbook } = await import("./route");
    const data = {
      period: { from: "2026-08-01", to: "2026-08-31" },
      policy: { operatedProperties: { deysi: ["Sky Elite 528"], milton: ["Sky Elite 331"] }, ownerFeeProperties: [{ name: "Luxe Suites 113", feeBps: 1000, fixedFeeMinor: 7000, fixedFeeCurrency: "BOB", beneficiary: "deysi" }], miltonShareBps: 8000, deysiAdministrationShareBps: 2000, deysiOwnShareBps: 10000, bookingCommissionBps: 1500 },
      channelTotals: { booking: { reservations: 1, BOB: 580, USD: 0 } },
      received: { deysi: { BOB: 0, USD: 0 }, milton: { BOB: 58000, USD: 0 } },
      held: { deysi: { BOB: 0, USD: 0 }, milton: { BOB: 58000, USD: 0 } },
      entitled: { deysi: { BOB: 0, USD: 0 }, milton: { BOB: 58000, USD: 0 } },
      commissions: { deysi: { BOB: 0, USD: 0 }, milton: { BOB: 8700, USD: 0 }, owner: { BOB: 0, USD: 0 } },
      ownerPayable: { BOB: 0, USD: 0 },
      ownerSettlements: [{ propertyId: 99, property: "Luxe Suites 113", gross: { BOB: 100000, USD: 0 }, management: { BOB: 17000, USD: 0 }, payable: { BOB: 83000, USD: 0 }, bookingCommission: { BOB: 0, USD: 0 }, reservationsWithFixedFee: 1 }],
      transfers: [],
      reservations: [{ id: 1, property: "Sky Elite 331", guest: "Huésped prueba", channel: "booking", checkIn: "2026-08-20", checkOut: "2026-08-22", nights: 2, lodgingAmount: 580, lodgingCurrency: "BOB", parkingAmount: 0, parkingCurrency: "BOB", guaranteeAmount: 250, guaranteeCurrency: "BOB", receivedBOB: 58000, receivedUSD: 0, commissionBOB: 8700, commissionUSD: 0, commissionResponsible: "milton", note: "" }],
      blockedPeriods: [
        { propertyId: 1, property: "Sky Elite 331", checkIn: "2026-08-23", checkOut: "2026-08-25", nights: 2, reason: "Mantenimiento preventivo" },
      ],
      freePeriods: [
        { propertyId: 1, property: "Sky Elite 331", checkIn: "2026-08-01", checkOut: "2026-08-20", nights: 19 },
        { propertyId: 1, property: "Sky Elite 331", checkIn: "2026-08-22", checkOut: "2026-08-23", nights: 1 },
        { propertyId: 1, property: "Sky Elite 331", checkIn: "2026-08-25", checkOut: "2026-09-01", nights: 7 },
      ],
      performance: [{ property: "Sky Elite 331", occupiedNights: 2, freeNights: 29, occupancy: 2 / 31, averageNightlyBOB: 290, averageNightlyUSD: 0 }],
    };
    const workbook = buildFinancialWorkbook(data, [
      { date: new Date("2026-08-20T14:00:00Z"), property: "Sky Elite 331", guest: "Huésped prueba", channel: "booking", type: "lodging", method: "qr", currency: "BOB", amount: 580, receivedBy: "milton", note: "" },
      { date: new Date("2026-08-21T14:00:00Z"), property: "Sky Elite 331", guest: "Huésped prueba", channel: "booking", type: "additional", method: "card", currency: "BOB", amount: 20, receivedBy: "milton", note: "" },
    ]);
    const buffer = await workbook.xlsx.writeBuffer();
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(buffer);
    expect(loaded.worksheets.map((sheet) => sheet.name)).toEqual(["Gerencial", "Reservas", "Rendimiento", "Movimientos"]);
    expect(loaded.getWorksheet("Reservas")?.getCell("B2").value).toBe("Sky Elite 331");
    expect(loaded.getWorksheet("Reservas")?.getCell("C2").value).toBe("Sin reserva / fechas no ocupadas");
    expect(loaded.getWorksheet("Reservas")?.getCell("J1").value).toBe("Comisión Booking Bs");
    expect(loaded.getWorksheet("Reservas")?.getCell("K1").value).toBe("Comisión Booking USD");
    expect(loaded.getWorksheet("Reservas")?.getCell("M1").value).toBe("Motivo del bloqueo");
    expect(loaded.getWorksheet("Reservas")?.getColumn(13).values).toContain("Mantenimiento preventivo");
    expect(loaded.getWorksheet("Reservas")?.getRow(1).values).not.toContain("Nota");
    expect(loaded.getWorksheet("Reservas")?.getCell("A2").fill).not.toEqual(loaded.getWorksheet("Reservas")?.getCell("A3").fill);
    expect(loaded.getWorksheet("Gerencial")?.getCell("A4").value).toBe("MONTOS RECIBIDOS");
    expect(loaded.getWorksheet("Movimientos")?.getCell("H2").value).toBe(580);
    expect(loaded.getWorksheet("Movimientos")?.getCell("A2").fill).not.toEqual(loaded.getWorksheet("Movimientos")?.getCell("A3").fill);
  });

  it("creates the owner administration report with zebra rows, formulas and totals", async () => {
    process.env.DATABASE_URL ||= "file:./data/test.db";
    const { buildAdministrationWorkbook } = await import("./route");
    const workbook = buildAdministrationWorkbook({
      period: { from: "2026-09-01", to: "2026-09-30" },
      property: "Luxe Suites 113",
      feeBps: 1000,
      cleaningFeeBOB: 70,
      exchangeRate: 6.96,
      rows: [
        { id: 1, checkIn: "2026-09-08", checkOut: "2026-09-10", guest: "Francisco", nights: 2, receivedBOB: 560, receivedUSD: 0 },
        { id: 2, checkIn: "2026-09-18", checkOut: "2026-09-21", guest: "Melanny", nights: 3, receivedBOB: 0, receivedUSD: 84.67 },
      ],
    });
    const buffer = await workbook.xlsx.writeBuffer();
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(buffer);
    const sheet = loaded.getWorksheet("Administración 113")!;
    expect(sheet.getCell("B7").value).toBe("Francisco");
    expect(sheet.getCell("B4").value).toBe(6.96);
    expect(sheet.getCell("E4").value).toBe(0.1);
    expect(sheet.getCell("E4").numFmt).toBe("0.0%");
    expect(sheet.getCell("E7").value).toMatchObject({ formula: "ROUND(J7+D7*$B$4,2)", result: 560 });
    expect(sheet.getCell("F7").value).toMatchObject({ formula: "ROUND(E7*$E$4,2)", result: 56 });
    expect(sheet.getCell("I7").value).toMatchObject({ formula: "G7-H7", result: 434 });
    expect(sheet.getCell("E8").value).toMatchObject({ formula: "ROUND(J8+D8*$B$4,2)", result: 589.3 });
    expect(sheet.getCell("I8").value).toMatchObject({ formula: "G8-H8", result: 460.37 });
    expect(sheet.getCell("A9").value).toBe("TOTALES");
    expect(sheet.getCell("E9").value).toMatchObject({ formula: "SUM(E7:E8)", result: 1149.3 });
    expect(sheet.getCell("A7").fill).not.toEqual(sheet.getCell("A8").fill);
  });
});
