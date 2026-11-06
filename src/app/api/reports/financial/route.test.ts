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

  it("keeps the income transfer gross and independent from Booking commissions", async () => {
    process.env.DATABASE_URL ||= "file:./data/test.db";
    const { personToPersonTransfers } = await import("./route");
    expect(personToPersonTransfers(
      { deysi: { BOB: 0, USD: 11387 }, milton: { BOB: 0, USD: 25748 } },
      { deysi: { BOB: 0, USD: 7427 }, milton: { BOB: 0, USD: 29708 } },
    )).toEqual([{ from: "deysi", to: "milton", currency: "USD", amountMinor: 3960 }]);
  });

  it("nets Booking commission reimbursements separately", async () => {
    process.env.DATABASE_URL ||= "file:./data/test.db";
    const { netCommissionReimbursements } = await import("./route");
    expect(netCommissionReimbursements([
      { from: "milton", to: "deysi", currency: "USD", amountMinor: 1122 },
      { from: "deysi", to: "milton", currency: "USD", amountMinor: 500 },
    ])).toEqual([{ from: "milton", to: "deysi", currency: "USD", amountMinor: 622 }]);
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

  it("creates a valid five-sheet Excel workbook with a separate Booking commission reconciliation", async () => {
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
      ownerSettlements: [{ propertyId: 99, property: "Luxe Suites 113", gross: { BOB: 100000, USD: 0 }, management: { BOB: 17000, USD: 0 }, payable: { BOB: 83000, USD: 0 }, reservationsWithFixedFee: 1 }],
      transfers: [],
      bookingCommissions: [{ reservationId: 1, reservationName: "Huésped prueba", checkIn: "2026-08-20", checkOut: "2026-08-22", originalProperty: "Sky Elite 528", physicalProperty: "Sky Elite 331", reassigned: true, physicalOperator: "milton" as const, commissionResponsible: "deysi" as const, reservationCurrency: "USD" as const, reservationAmountMinor: 8000, commissionCurrency: "USD" as const, commissionAmountMinor: 1200, receivedBOB: 150000, receivedUSD: 0 }],
      commissionTransfers: [{ from: "milton" as const, to: "deysi" as const, currency: "USD" as const, amountMinor: 1200 }],
      reservations: [{ id: 1, property: "Sky Elite 331", guest: "Huésped prueba", channel: "booking", checkIn: "2026-08-20", checkOut: "2026-08-22", nights: 2, lodgingAmount: 580, lodgingCurrency: "BOB", parkingAmount: 0, parkingCurrency: "BOB", guaranteeAmount: 250, guaranteeCurrency: "BOB", receivedBOB: 58000, receivedUSD: 0, note: "" }],
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
    expect(loaded.worksheets.map((sheet) => sheet.name)).toEqual(["Gerencial", "Reservas", "Rendimiento", "Movimientos", "Comisiones Booking"]);
    expect(loaded.getWorksheet("Reservas")?.getCell("B2").value).toBe("Sky Elite 331");
    expect(loaded.getWorksheet("Reservas")?.getCell("C2").value).toBe("Sin reserva / fechas no ocupadas");
    expect(loaded.getWorksheet("Reservas")?.getCell("J1").value).toBe("Motivo del bloqueo");
    expect(loaded.getWorksheet("Reservas")?.getColumn(10).values).toContain("Mantenimiento preventivo");
    expect(loaded.getWorksheet("Reservas")?.getRow(1).values).not.toContain("Nota");
    expect(loaded.getWorksheet("Reservas")?.getCell("A2").fill).not.toEqual(loaded.getWorksheet("Reservas")?.getCell("A3").fill);
    expect(loaded.getWorksheet("Gerencial")?.getCell("A4").value).toBe("MONTOS RECIBIDOS");
    expect(loaded.getWorksheet("Movimientos")?.getCell("H2").value).toBe(580);
    expect(loaded.getWorksheet("Movimientos")?.getCell("A2").fill).not.toEqual(loaded.getWorksheet("Movimientos")?.getCell("A3").fill);
    expect(loaded.getWorksheet("Comisiones Booking")?.getCell("E11").value).toBe("Sky Elite 528");
    expect(loaded.getWorksheet("Comisiones Booking")?.getCell("F11").value).toBe("Sky Elite 331");
    expect(loaded.getWorksheet("Comisiones Booking")?.getCell("K11").value).toBe(80);
    expect(loaded.getWorksheet("Comisiones Booking")?.getCell("L11").value).toBe(1500);
    expect(loaded.getWorksheet("Comisiones Booking")?.getCell("O11").value).toBe(12);
  });

  it("creates the owner administration report with zebra rows, formulas and totals", async () => {
    process.env.DATABASE_URL ||= "file:./data/test.db";
    const { buildAdministrationWorkbook } = await import("./route");
    const workbook = buildAdministrationWorkbook({
      period: { from: "2026-09-01", to: "2026-09-30" },
      property: "Luxe Suites 113",
      feeBps: 1000,
      bookingCommissionBps: 1500,
      cleaningFeeBOB: 70,
      exchangeRate: 6.96,
      rows: [
        { id: 1, checkIn: "2026-09-08", checkOut: "2026-09-10", guest: "Francisco", channel: "direct", nights: 2, receivedBOB: 560, receivedUSD: 0 },
        { id: 2, checkIn: "2026-09-18", checkOut: "2026-09-21", guest: "Melanny", channel: "booking", nights: 3, receivedBOB: 0, receivedUSD: 84.67 },
        { id: -1, checkIn: "2026-09-22", checkOut: "2026-09-25", guest: "Noches bloqueadas", channel: "manual_block", nights: 3, receivedBOB: 0, receivedUSD: 0, reason: "Ocupado por el propietario", blocked: true },
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
    expect(sheet.getCell("H4").value).toBe(0.15);
    expect(sheet.getCell("F7").value).toMatchObject({ formula: "ROUND(M7+E7*$B$4,2)", result: 560 });
    expect(sheet.getCell("G7").value).toMatchObject({ formula: 'IF(C7="Booking.com",ROUND(F7*$H$4,2),0)' });
    expect(sheet.getCell("I7").value).toMatchObject({ formula: "ROUND(H7*$E$4,2)", result: 56 });
    expect(sheet.getCell("K7").value).toMatchObject({ formula: "H7-I7-J7", result: 434 });
    expect(sheet.getCell("F8").value).toMatchObject({ formula: "ROUND(M8+E8*$B$4,2)", result: 589.3 });
    expect(sheet.getCell("G8").value).toMatchObject({ formula: 'IF(C8="Booking.com",ROUND(F8*$H$4,2),0)', result: 88.4 });
    expect(sheet.getCell("H8").value).toMatchObject({ formula: "F8-G8", result: 500.9 });
    expect(sheet.getCell("I8").value).toMatchObject({ formula: "ROUND(H8*$E$4,2)", result: 50.09 });
    expect(sheet.getCell("K8").value).toMatchObject({ formula: "H8-I8-J8", result: 380.81 });
    expect(sheet.getCell("B9").value).toBe("Noches bloqueadas");
    expect(sheet.getCell("C9").value).toBe("Bloqueo manual");
    expect(sheet.getCell("L9").value).toBe("Ocupado por el propietario");
    expect(sheet.getCell("F9").value).toMatchObject({ formula: "ROUND(M9+E9*$B$4,2)" });
    expect(sheet.getCell("A10").value).toBe("TOTALES");
    expect(sheet.getCell("D10").value).toMatchObject({ formula: "SUM(D7:D9)", result: 8 });
    expect(sheet.getCell("F10").value).toMatchObject({ formula: "SUM(F7:F9)", result: 1149.3 });
    expect(sheet.getCell("G10").value).toMatchObject({ formula: "SUM(G7:G9)", result: 88.4 });
    expect(sheet.getCell("K10").value).toMatchObject({ formula: "SUM(K7:K9)", result: 814.81 });
    expect(sheet.getCell("A7").fill).not.toEqual(sheet.getCell("A8").fill);
  });
});
