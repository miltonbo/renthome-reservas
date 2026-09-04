import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth";
import { listAccessiblePropertyIds } from "@/lib/ownership";
import { prisma } from "@/lib/prisma";
import { bookingCommission, bookingCommissionLiability, financialAllocations, reconciliableMovementAmounts, segmentReconciliationStatus } from "@/lib/finance";

export const dynamic = "force-dynamic";

type Currency = "BOB" | "USD";
type Person = "deysi" | "milton";
const currencies: Currency[] = ["BOB", "USD"];
const people: Person[] = ["deysi", "milton"];

const blankCurrency = () => ({ BOB: 0, USD: 0 });
const asCurrency = (value: string): Currency => value === "USD" ? "USD" : "BOB";
const dateKey = (value: Date) => value.toISOString().slice(0, 10);
const nights = (start: Date, end: Date) => Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));

function parsePeriod(request: NextRequest) {
  const now = new Date();
  const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fromKey = request.nextUrl.searchParams.get("from") || defaultFrom;
  const toKey = request.nextUrl.searchParams.get("to") || dateKey(defaultEnd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromKey) || !/^\d{4}-\d{2}-\d{2}$/.test(toKey) || fromKey > toKey) return null;
  return {
    fromKey,
    toKey,
    from: new Date(`${fromKey}T00:00:00.000Z`),
    toExclusive: new Date(new Date(`${toKey}T00:00:00.000Z`).getTime() + 86_400_000),
  };
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const period = parsePeriod(request);
  if (!period) return NextResponse.json({ error: "Rango de fechas inválido" }, { status: 400 });

  const accessibleIds = await listAccessiblePropertyIds(session.userId, session.role);
  const activeRows = await prisma.property.findMany({ where: { id: { in: accessibleIds }, isPaused: false }, select: { id: true } });
  const activeIds = activeRows.map((row) => row.id);
  const requestedPropertyId = Number(request.nextUrl.searchParams.get("propertyId") || 0);
  const propertyIds = requestedPropertyId && activeIds.includes(requestedPropertyId) ? [requestedPropertyId] : activeIds;
  if (requestedPropertyId && !propertyIds.includes(requestedPropertyId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [properties, reservations, movements, calendarEvents] = await Promise.all([
    prisma.property.findMany({ where: { id: { in: propertyIds } }, select: { id: true, name: true, financialOperator: true, financialModel: true, managementFeeBps: true, managementFixedFeeMinor: true, managementFixedFeeCurrency: true, managementBeneficiary: true, bookingCommissionPayer: true }, orderBy: { name: "asc" } }),
    prisma.reservation.findMany({
      where: { propertyId: { in: propertyIds }, status: "confirmed", checkIn: { lt: period.toExclusive }, checkOut: { gt: period.from } },
      include: { property: { select: { id: true, name: true, financialOperator: true, bookingCommissionPayer: true } }, bookingOriginalProperty: { select: { id: true, name: true, financialOperator: true, bookingCommissionPayer: true } }, moneyMovements: true, bookingCommission: true },
      orderBy: [{ checkIn: "asc" }, { propertyId: "asc" }],
    }),
    prisma.moneyMovement.findMany({
      where: { propertyId: { in: propertyIds }, occurredAt: { gte: period.from, lt: period.toExclusive } },
      include: { allocations: true, property: { select: { id: true, name: true, financialOperator: true, financialModel: true, managementFeeBps: true, managementFixedFeeMinor: true, managementFixedFeeCurrency: true, managementBeneficiary: true, bookingCommissionPayer: true } }, reservation: { select: { id: true, name: true, platform: true, checkOut: true, totalPrice: true, priceCurrency: true, guaranteeAmount: true, settledManuallyAt: true, moneyMovements: { select: { id: true, type: true, amountMinor: true, currency: true, occurredAt: true } }, bookingOriginalProperty: { select: { id: true, name: true, financialOperator: true, financialModel: true, managementFeeBps: true, managementFixedFeeMinor: true, managementFixedFeeCurrency: true, managementBeneficiary: true, bookingCommissionPayer: true } } } } },
      orderBy: { occurredAt: "asc" },
    }),
    prisma.calendarEvent.findMany({ where: { propertyId: { in: propertyIds }, startDate: { lt: period.toKey }, endDate: { gt: period.fromKey } } }),
  ]);

  // A financial row belongs to the period in which its independent segment
  // checks out. Overlapping segments remain available for occupancy only.
  const reportReservations = reservations.filter((reservation) =>
    reservation.checkOut.getTime() >= period.from.getTime() &&
    reservation.checkOut.getTime() < period.toExclusive.getTime(),
  );
  const channelTotals: Record<string, { reservations: number; BOB: number; USD: number }> = {};
  for (const reservation of reportReservations) {
    const channel = reservation.platform.toLowerCase();
    channelTotals[channel] ||= { reservations: 0, BOB: 0, USD: 0 };
    channelTotals[channel].reservations += 1;
  }

  const effectiveAmounts = new Map<number, number>();
  const eligibleReservationIds = new Set<number>();
  const observations: Array<{ reservationId: number; reservationName: string; reason: "active" | "outstanding" }> = [];
  const seenReservations = new Set<number>();
  for (const movement of movements) {
    const reservation = movement.reservation;
    if (seenReservations.has(reservation.id)) continue;
    seenReservations.add(reservation.id);
    const status = segmentReconciliationStatus(reservation);
    const requiresClosure = reservation.platform === "booking" || reservation.platform === "direct";
    const concluded = reservation.checkOut.getTime() < period.toExclusive.getTime();
    if (!requiresClosure || (concluded && status.isSettled)) eligibleReservationIds.add(reservation.id);
    else observations.push({ reservationId: reservation.id, reservationName: reservation.name, reason: concluded ? "outstanding" : "active" });
    for (const [id, amount] of reconciliableMovementAmounts(reservation)) effectiveAmounts.set(id, amount);
  }
  const eligibleMovements = movements.filter((movement) => eligibleReservationIds.has(movement.reservationId) && (effectiveAmounts.get(movement.id) || 0) !== 0);
  for (const movement of eligibleMovements) {
    const channel = movement.reservation.platform.toLowerCase();
    channelTotals[channel] ||= { reservations: 0, BOB: 0, USD: 0 };
    channelTotals[channel][asCurrency(movement.currency)] += (effectiveAmounts.get(movement.id) || 0) / 100;
  }

  const held: Record<Person, Record<Currency, number>> = { deysi: blankCurrency(), milton: blankCurrency() };
  const entitled: Record<Person, Record<Currency, number>> = { deysi: blankCurrency(), milton: blankCurrency() };
  const fixedFeePolicies = new Map<number, { financialOperator: string; financialModel: string; managementFeeBps: number; managementFixedFeeMinor: number; managementFixedFeeCurrency: string; managementBeneficiary: string }>();
  for (const movement of eligibleMovements) {
    const currency = asCurrency(movement.currency);
    const effectiveAmount = effectiveAmounts.get(movement.id) || 0;
    const allocationPolicy = movement.property;
    const policyAllocations = financialAllocations(effectiveAmount, allocationPolicy);
    if (effectiveAmount > 0 && allocationPolicy.financialModel === "owner_fee") fixedFeePolicies.set(movement.reservationId, allocationPolicy);
    if (movement.paymentMethod === "airbnb") {
      if (movement.property.financialModel === "owner_fee") {
        const receiver: Person = movement.property.managementBeneficiary === "milton" ? "milton" : "deysi";
        held[receiver][currency] += effectiveAmount;
      }
      for (const allocation of policyAllocations) {
        if (movement.property.financialModel !== "owner_fee") held[allocation.person][currency] += allocation.amountMinor;
        entitled[allocation.person][currency] += allocation.amountMinor;
      }
    } else {
      const receiver = movement.receivedBy as Person;
      if (people.includes(receiver)) held[receiver][currency] += effectiveAmount;
      for (const allocation of policyAllocations) entitled[allocation.person][currency] += allocation.amountMinor;
    }
  }

  for (const [, policy] of fixedFeePolicies) {
    const beneficiary: Person = policy.managementBeneficiary === "milton" ? "milton" : "deysi";
    entitled[beneficiary][asCurrency(policy.managementFixedFeeCurrency)] += policy.managementFixedFeeMinor || 0;
  }

  const eligibleBookingSegments = [...new Map(
    eligibleMovements
      .filter((movement) => movement.reservation.platform === "booking")
      .map((movement) => [movement.reservationId, movement]),
  ).values()];
  const commissionParts = eligibleBookingSegments
    .filter((movement) => (movement.reservation.totalPrice || 0) > 0)
    .map((movement) => {
      const bookingProperty = movement.reservation.bookingOriginalProperty || movement.property;
      return {
        reservationId: movement.reservationId,
        reservationName: movement.reservation.name,
        physicalPropertyId: movement.propertyId,
        physicalProperty: movement.property.name,
        physicalOperator: movement.property.financialOperator as Person,
        originalPropertyId: bookingProperty.id,
        originalProperty: bookingProperty.name,
        incomeOperator: movement.property.financialOperator as Person,
        liablePerson: bookingCommissionLiability(bookingProperty),
        currency: asCurrency(movement.reservation.priceCurrency),
        amountMinor: bookingCommission(Math.round((movement.reservation.totalPrice || 0) * 100)),
      };
    });
  const commissions: Record<Person | "owner", Record<Currency, number>> = { deysi: blankCurrency(), milton: blankCurrency(), owner: blankCurrency() };
  for (const commission of commissionParts) commissions[commission.liablePerson][commission.currency] += commission.amountMinor;
  const commissionReimbursements: Array<{ reservationId: number; reservationName: string; physicalProperty: string; originalProperty: string; from: Person; to: Person; currency: Currency; amountMinor: number }> = [];
  for (const commission of commissionParts) {
    const from = commission.incomeOperator;
    const to = commission.liablePerson as Person;
    const physicalPolicy = properties.find((property) => property.id === commission.physicalPropertyId);
    if (physicalPolicy) {
      for (const allocation of financialAllocations(commission.amountMinor, physicalPolicy)) {
        entitled[allocation.person][commission.currency] -= allocation.amountMinor;
      }
    }
    if (people.includes(to)) entitled[to][commission.currency] += commission.amountMinor;
    if (!people.includes(from) || !people.includes(to) || from === to) continue;
    commissionReimbursements.push({ reservationId: commission.reservationId, reservationName: commission.reservationName, physicalProperty: commission.physicalProperty, originalProperty: commission.originalProperty, from, to, currency: commission.currency, amountMinor: commission.amountMinor });
  }
  const ownerPayable = blankCurrency();
  for (const currency of currencies) ownerPayable[currency] = held.deysi[currency] + held.milton[currency] - entitled.deysi[currency] - entitled.milton[currency];
  const transfers: Array<{ from: Person | "owner"; to: Person | "owner"; currency: Currency; amountMinor: number }> = [];
  for (const currency of currencies) {
    let deysiBalance = held.deysi[currency] - entitled.deysi[currency];
    let miltonBalance = held.milton[currency] - entitled.milton[currency];
    if (deysiBalance > 0 && miltonBalance < 0) { const transfer = Math.min(deysiBalance, -miltonBalance); transfers.push({ from: "deysi", to: "milton", currency, amountMinor: transfer }); deysiBalance -= transfer; miltonBalance += transfer; }
    if (miltonBalance > 0 && deysiBalance < 0) { const transfer = Math.min(miltonBalance, -deysiBalance); transfers.push({ from: "milton", to: "deysi", currency, amountMinor: transfer }); miltonBalance -= transfer; deysiBalance += transfer; }
    if (deysiBalance > 0) transfers.push({ from: "deysi", to: "owner", currency, amountMinor: deysiBalance });
    if (miltonBalance > 0) transfers.push({ from: "milton", to: "owner", currency, amountMinor: miltonBalance });
    if (deysiBalance < 0) transfers.push({ from: "owner", to: "deysi", currency, amountMinor: -deysiBalance });
    if (miltonBalance < 0) transfers.push({ from: "owner", to: "milton", currency, amountMinor: -miltonBalance });
  }

  const detailedReservations = reportReservations.map((reservation) => {
    const received = blankCurrency();
    const effective = reconciliableMovementAmounts(reservation);
    for (const movement of reservation.moneyMovements) received[asCurrency(movement.currency)] += effective.get(movement.id) || 0;
    const paymentStatus = segmentReconciliationStatus(reservation);
    const requiresClosure = reservation.platform === "booking" || reservation.platform === "direct";
    const concludedInRange = reservation.checkOut.getTime() < period.toExclusive.getTime();
    const reconciliationStatus = !requiresClosure || (concludedInRange && paymentStatus.isSettled)
      ? "included"
      : "outstanding";
    return {
      id: reservation.id,
      property: reservation.property.name,
      guest: reservation.name,
      channel: reservation.platform,
      checkIn: dateKey(reservation.checkIn),
      checkOut: dateKey(reservation.checkOut),
      nights: nights(reservation.checkIn, reservation.checkOut),
      lodgingAmount: reservation.totalPrice || 0,
      lodgingCurrency: asCurrency(reservation.priceCurrency),
      parkingAmount: reservation.parkingTotalPrice || 0,
      parkingCurrency: asCurrency(reservation.parkingCurrency),
      guaranteeAmount: reservation.guaranteeAmount || 0,
      guaranteeCurrency: asCurrency(reservation.guaranteeCurrency),
      receivedBOB: received.BOB,
      receivedUSD: received.USD,
      commissionBOB: commissionParts.filter((item) => item.reservationId === reservation.id && item.currency === "BOB").reduce((sum, item) => sum + item.amountMinor, 0),
      commissionUSD: commissionParts.filter((item) => item.reservationId === reservation.id && item.currency === "USD").reduce((sum, item) => sum + item.amountMinor, 0),
      commissionResponsible: commissionParts.find((item) => item.reservationId === reservation.id)?.liablePerson || null,
      reconciliationStatus,
      note: reservation.note || "",
    };
  });

  const totalDays = Math.round((period.toExclusive.getTime() - period.from.getTime()) / 86_400_000);
  const performance = properties.map((property) => {
    const occupied = new Set<string>();
    const addRange = (startKey: string, endKey: string) => {
      let cursor = new Date(`${startKey < period.fromKey ? period.fromKey : startKey}T00:00:00.000Z`);
      const end = new Date(`${endKey > dateKey(period.toExclusive) ? dateKey(period.toExclusive) : endKey}T00:00:00.000Z`);
      while (cursor < end) { occupied.add(dateKey(cursor)); cursor = new Date(cursor.getTime() + 86_400_000); }
    };
    for (const reservation of reservations.filter((item) => item.propertyId === property.id)) addRange(dateKey(reservation.checkIn), dateKey(reservation.checkOut));
    for (const event of calendarEvents.filter((item) => item.propertyId === property.id)) {
      const isBlock = event.platform.toLowerCase() === "airbnb" && /not available|blocked/i.test(event.summary);
      if (!isBlock) addRange(event.startDate, event.endDate);
    }
    const propertyReservations = reservations.filter((item) => item.propertyId === property.id);
    const avg = (currency: Currency) => {
      const matching = propertyReservations.filter((item) => asCurrency(item.priceCurrency) === currency && (item.totalPrice || 0) > 0);
      const bookedNights = matching.reduce((sum, item) => sum + nights(item.checkIn, item.checkOut), 0);
      return bookedNights ? matching.reduce((sum, item) => sum + (item.totalPrice || 0), 0) / bookedNights : 0;
    };
    return { propertyId: property.id, property: property.name, occupiedNights: occupied.size, freeNights: Math.max(0, totalDays - occupied.size), occupancy: totalDays ? occupied.size / totalDays : 0, averageNightlyBOB: avg("BOB"), averageNightlyUSD: avg("USD") };
  });

  const monthlyMap = new Map<string, { month: string; BOB: number; USD: number }>();
  for (const movement of eligibleMovements) {
    const month = movement.occurredAt.toISOString().slice(0, 7);
    const row = monthlyMap.get(month) || { month, BOB: 0, USD: 0 };
    row[asCurrency(movement.currency)] += (effectiveAmounts.get(movement.id) || 0) / 100;
    monthlyMap.set(month, row);
  }

  const operatedProperties = {
    deysi: properties.filter((property) => property.financialModel !== "owner_fee" && property.financialOperator === "deysi").map((property) => property.name),
    milton: properties.filter((property) => property.financialModel !== "owner_fee" && property.financialOperator !== "deysi").map((property) => property.name),
  };
  const ownerFeeProperties = properties.filter((property) => property.financialModel === "owner_fee").map((property) => ({ name: property.name, feeBps: property.managementFeeBps, fixedFeeMinor: property.managementFixedFeeMinor, fixedFeeCurrency: asCurrency(property.managementFixedFeeCurrency), beneficiary: property.managementBeneficiary }));
  const ownerSettlements = properties.filter((property) => property.financialModel === "owner_fee").map((property) => {
    const propertyMovements = eligibleMovements.filter((movement) => movement.propertyId === property.id);
    const gross = blankCurrency();
    const management = blankCurrency();
    const payable = blankCurrency();
    const reservationIds = new Set<number>();
    for (const movement of propertyMovements) {
      const currency = asCurrency(movement.currency);
      const amount = effectiveAmounts.get(movement.id) || 0;
      gross[currency] += amount;
      management[currency] += financialAllocations(amount, property).reduce((sum, allocation) => sum + allocation.amountMinor, 0);
      if (amount > 0) reservationIds.add(movement.reservationId);
    }
    management[asCurrency(property.managementFixedFeeCurrency)] += reservationIds.size * (property.managementFixedFeeMinor || 0);
    for (const currency of currencies) payable[currency] = gross[currency] - management[currency];
    const commission = blankCurrency();
    for (const item of commissionParts.filter((part) => part.physicalPropertyId === property.id)) commission[item.currency] += item.amountMinor;
    return { propertyId: property.id, property: property.name, gross, management, payable, bookingCommission: commission, reservationsWithFixedFee: reservationIds.size };
  });
  const data = { period: { from: period.fromKey, to: period.toKey }, policy: { operatedProperties, ownerFeeProperties, miltonShareBps: 8000, deysiAdministrationShareBps: 2000, deysiOwnShareBps: 10000, bookingCommissionBps: 1500 }, channelTotals, held, entitled, commissions, commissionReimbursements, ownerPayable, ownerSettlements, transfers, observations, reservations: detailedReservations, performance, monthlyIncome: [...monthlyMap.values()] };
  if (request.nextUrl.searchParams.get("format") !== "xlsx") return NextResponse.json(data);

  const workbook = buildFinancialWorkbook(data, eligibleMovements.map((movement) => ({
    date: movement.occurredAt,
    property: movement.property.name,
    guest: movement.reservation.name,
    channel: movement.reservation.platform,
    type: movement.type,
    method: movement.paymentMethod,
    currency: asCurrency(movement.currency),
    amount: (effectiveAmounts.get(movement.id) || 0) / 100,
    receivedBy: movement.receivedBy || "Distribución Airbnb",
    note: movement.note || "",
  })));
  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="informe-deptosbo-${period.fromKey}-${period.toKey}.xlsx"`, "Cache-Control": "no-store" } });
}

export function buildFinancialWorkbook(data: any, movements: any[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DeptosBO";
  workbook.created = new Date();
  const orange = "F28C28", navy = "10252E", pale = "FFF2E4";
  const styleSheet = (sheet: ExcelJS.Worksheet) => {
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${navy}` } };
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
    sheet.columns.forEach((column) => { column.width = Math.min(34, Math.max(12, ...(column.values || []).map((value) => String(value || "").length + 2))); });
  };

  const management = workbook.addWorksheet("Gerencial", { views: [{ showGridLines: false }] });
  management.columns = [{ header: "Indicador", key: "metric" }, { header: "Bs", key: "BOB" }, { header: "USD", key: "USD" }];
  management.addRow({ metric: `Período ${data.period.from} al ${data.period.to}` });
  management.addRow({ metric: `Opera Deysi: ${data.policy.operatedProperties.deysi.join(", ") || "—"}` });
  management.addRow({ metric: `Opera Milton: ${data.policy.operatedProperties.milton.join(", ") || "—"}` });
  management.addRow({ metric: "Política: propiedades de Milton 80% Milton / 20% Deysi; propiedades de Deysi 100% Deysi. Comisión Booking 15% a cargo del operador." });
  for (const policy of data.policy.ownerFeeProperties || []) management.addRow({ metric: `Contrato ${policy.name}: ${(policy.feeBps / 100).toLocaleString("es-BO")}% + ${policy.fixedFeeCurrency} ${(policy.fixedFeeMinor / 100).toFixed(2)} por reserva para ${policy.beneficiary}; saldo al propietario.` });
  for (const [channel, values] of Object.entries<any>(data.channelTotals)) management.addRow({ metric: `Ventas ${channel} (${values.reservations} reservas)`, BOB: values.BOB, USD: values.USD });
  for (const person of people) {
    management.addRow({ metric: `Recibido por ${person}`, BOB: data.held[person].BOB / 100, USD: data.held[person].USD / 100 });
    management.addRow({ metric: `Comisión Booking de ${person}`, BOB: data.commissions[person].BOB / 100, USD: data.commissions[person].USD / 100 });
  }
  for (const settlement of data.ownerSettlements || []) {
    management.addRow({ metric: `Ingresos cobrados · ${settlement.property}`, BOB: settlement.gross.BOB / 100, USD: settlement.gross.USD / 100 });
    management.addRow({ metric: `Administración para Deysi · ${settlement.property}`, BOB: settlement.management.BOB / 100, USD: settlement.management.USD / 100 });
    management.addRow({ metric: `Saldo a propietario · ${settlement.property}`, BOB: settlement.payable.BOB / 100, USD: settlement.payable.USD / 100 });
    management.addRow({ metric: `Comisión Booking a cargo del propietario · ${settlement.property}`, BOB: settlement.bookingCommission.BOB / 100, USD: settlement.bookingCommission.USD / 100 });
  }
  for (const transfer of data.transfers) management.addRow({ metric: `${transfer.from} transfiere a ${transfer.to}`, [transfer.currency]: transfer.amountMinor / 100 });
  styleSheet(management); management.getColumn(1).width = 95; management.getColumn(2).numFmt = '"Bs" #,##0.00'; management.getColumn(3).numFmt = '"USD" #,##0.00'; management.getRow(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${pale}` } };

  const detail = workbook.addWorksheet("Reservas");
  detail.columns = ["ID", "Departamento", "Huésped", "Canal", "Ingreso", "Salida", "Noches", "Hospedaje", "Moneda hospedaje", "Garantía referencial Bs", "Ingreso conciliable Bs", "Ingreso conciliable USD", "Comisión Bs", "Comisión USD", "Responsable comisión", "Nota"].map((header) => ({ header, key: header }));
  for (const item of data.reservations) detail.addRow([item.id, item.property, item.guest, item.channel, new Date(`${item.checkIn}T12:00:00`), new Date(`${item.checkOut}T12:00:00`), item.nights, item.lodgingAmount, item.lodgingCurrency, item.guaranteeAmount, item.receivedBOB / 100, item.receivedUSD / 100, item.commissionBOB / 100, item.commissionUSD / 100, item.commissionResponsible || "", item.note]);
  styleSheet(detail); detail.getColumn(5).numFmt = "yyyy-mm-dd"; detail.getColumn(6).numFmt = "yyyy-mm-dd"; [8,10,11,12,13,14].forEach((column) => detail.getColumn(column).numFmt = "#,##0.00");

  const performance = workbook.addWorksheet("Rendimiento");
  performance.columns = ["Departamento", "Noches ocupadas", "Noches libres", "Ocupación", "Promedio noche Bs", "Promedio noche USD"].map((header) => ({ header, key: header }));
  for (const item of data.performance) performance.addRow([item.property, item.occupiedNights, item.freeNights, item.occupancy, item.averageNightlyBOB, item.averageNightlyUSD]);
  styleSheet(performance); performance.getColumn(4).numFmt = "0.0%"; performance.getColumn(5).numFmt = '"Bs" #,##0.00'; performance.getColumn(6).numFmt = '"USD" #,##0.00';

  const movementSheet = workbook.addWorksheet("Movimientos");
  movementSheet.columns = ["Fecha", "Departamento", "Huésped", "Canal", "Concepto", "Método", "Moneda", "Monto", "Recibido por", "Nota"].map((header) => ({ header, key: header }));
  movements.forEach((item) => movementSheet.addRow([item.date, item.property, item.guest, item.channel, item.type, item.method, item.currency, item.amount, item.receivedBy, item.note]));
  styleSheet(movementSheet); movementSheet.getColumn(1).numFmt = "yyyy-mm-dd hh:mm"; movementSheet.getColumn(8).numFmt = "#,##0.00";
  [management, detail, performance, movementSheet].forEach((sheet) => { sheet.getRow(1).height = 24; sheet.getRow(1).alignment = { vertical: "middle" }; sheet.getRow(1).eachCell((cell) => { cell.border = { bottom: { style: "medium", color: { argb: `FF${orange}` } } }; }); });
  return workbook;
}
