import "server-only";

import { prisma } from "@/lib/prisma";
import { syncExternalEventSources } from "@/lib/pricing-event-sources";

export const AUTOMATIC_CALENDAR_SOURCE = "Calendario automático Bolivia";

type AutomaticMarketEvent = {
  name: string;
  eventType: "holiday" | "civic";
  startsOn: string;
  endsOn: string;
  impactBps: number;
  confidenceBps: number;
};

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

/** Gregorian Easter Sunday (Meeus/Jones/Butcher), used for movable holidays. */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utcDate(year, month, day);
}

export function recurringBoliviaMarketEvents(year: number): AutomaticMarketEvent[] {
  const easter = easterSunday(year);
  const oneDay = (
    name: string,
    eventType: "holiday" | "civic",
    date: Date,
    impactBps: number,
    confidenceBps = 6_000,
  ): AutomaticMarketEvent => ({
    name,
    eventType,
    startsOn: dateKey(date),
    endsOn: dateKey(date),
    impactBps,
    confidenceBps,
  });

  return [
    {
      name: "Año Nuevo",
      eventType: "holiday",
      startsOn: dateKey(utcDate(year - 1, 12, 30)),
      endsOn: dateKey(utcDate(year, 1, 1)),
      impactBps: 2_000,
      confidenceBps: 9_000,
    },
    oneDay("Día del Estado Plurinacional", "holiday", utcDate(year, 1, 22), 500),
    oneDay("Carnaval · lunes", "holiday", addDays(easter, -48), 1_000, 7_000),
    oneDay("Carnaval · martes", "holiday", addDays(easter, -47), 1_000, 7_000),
    oneDay("Viernes Santo", "holiday", addDays(easter, -2), 500),
    oneDay("Día del Trabajo", "holiday", utcDate(year, 5, 1), 400, 5_500),
    oneDay("Corpus Christi", "holiday", addDays(easter, 60), 500),
    oneDay("Año Nuevo Andino Amazónico Chaqueño", "holiday", utcDate(year, 6, 21), 400, 5_000),
    oneDay("Día de la Independencia", "holiday", utcDate(year, 8, 6), 600, 6_500),
    oneDay("Efeméride de Santa Cruz", "civic", utcDate(year, 9, 24), 600),
    oneDay("Día de Todos los Difuntos", "holiday", utcDate(year, 11, 2), 400, 5_000),
    {
      name: "Navidad",
      eventType: "holiday",
      startsOn: dateKey(utcDate(year, 12, 24)),
      endsOn: dateKey(utcDate(year, 12, 25)),
      impactBps: 1_500,
      confidenceBps: 8_500,
    },
  ];
}

export async function syncAutomaticMarketCalendar(years: number[]) {
  const events = years.flatMap(recurringBoliviaMarketEvents);
  let created = 0;
  let updated = 0;

  for (const event of events) {
    const existing = await prisma.marketEvent.findFirst({
      where: {
        name: event.name,
        // Some lodging-demand windows begin before the named holiday (for
        // example Año Nuevo starts on 30 December). Match the edition by the
        // year in which it ends so an existing one-day row is expanded rather
        // than duplicated.
        endsOn: { startsWith: event.endsOn.slice(0, 4) },
        sourceName: AUTOMATIC_CALENDAR_SOURCE,
      },
    });
    if (existing) {
      await prisma.marketEvent.update({
        where: { id: existing.id },
        data: {
          eventType: event.eventType,
          startsOn: event.startsOn,
          endsOn: event.endsOn,
          impactBps: event.impactBps,
          confidenceBps: event.confidenceBps,
          lastVerifiedAt: new Date(),
        },
      });
      updated++;
    } else {
      await prisma.marketEvent.create({
        data: {
          ...event,
          city: "Santa Cruz de la Sierra",
          status: "candidate",
          sourceName: AUTOMATIC_CALENDAR_SOURCE,
          lastVerifiedAt: new Date(),
        },
      });
      created++;
    }
  }

  return { created, updated, total: events.length };
}

export async function syncAllMarketSignals(years: number[], now = new Date()) {
  const recurring = await syncAutomaticMarketCalendar(years);
  const sources = await syncExternalEventSources(now);
  return { recurring, sources };
}
