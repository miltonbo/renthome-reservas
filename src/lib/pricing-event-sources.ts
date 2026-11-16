import "server-only";

import * as https from "node:https";
import * as tls from "node:tls";
import { prisma } from "@/lib/prisma";

export type DiscoveredMarketEvent = {
  name: string;
  startsOn: string;
  endsOn: string;
  eventType: "holiday" | "fair" | "concert" | "sports" | "civic" | "cultural" | "congress" | "other";
  sourceName: string;
  sourceUrl: string;
  impactBps: number;
  confidenceBps: number;
  status?: "candidate" | "confirmed";
};

export type EventSourceResult = {
  key: string;
  name: string;
  url: string;
  ok: boolean;
  discovered: number;
  saved: number;
  error?: string;
  checkedAt: string;
};

type EventSource = {
  key: string;
  name: string;
  url: string | ((now: Date) => string);
  parse: (html: string, now: Date, resolvedUrl: string) => DiscoveredMarketEvent[];
};

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&aacute;/gi, "á").replace(/&eacute;/gi, "é").replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó").replace(/&uacute;/gi, "ú").replace(/&ntilde;/gi, "ñ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

export function htmlToLines(html: string): string[] {
  const text = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "\n")
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>|<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(text).split(/\r?\n/).map(clean).filter(Boolean);
}

function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function parseSpanishRange(value: string): { startsOn: string; endsOn: string } | null {
  const normalized = stripAccents(value);
  const range = normalized.match(/\b(\d{1,2})\s*(?:al|a|y|-)\s*(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(20\d{2})\b/i);
  if (range) {
    const month = MONTHS[range[3]];
    const start = month ? isoDate(Number(range[4]), month, Number(range[1])) : null;
    const end = month ? isoDate(Number(range[4]), month, Number(range[2])) : null;
    return start && end ? { startsOn: start, endsOn: end } : null;
  }
  const single = normalized.match(/\b(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(20\d{2})\b/i);
  if (single) {
    const month = MONTHS[single[2]];
    const date = month ? isoDate(Number(single[3]), month, Number(single[1])) : null;
    return date ? { startsOn: date, endsOn: date } : null;
  }
  const numeric = value.match(/\b(\d{2})\/(\d{2})\/(20\d{2})\b/);
  if (numeric) {
    const date = isoDate(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));
    return date ? { startsOn: date, endsOn: date } : null;
  }
  return null;
}

function plausibleName(value: string): boolean {
  return value.length >= 4 && value.length <= 160 && !/^(conoc[eé]|ver|comprar|m[aá]s|pr[oó]ximos|calendario|ferias?\s+20\d{2})/i.test(value);
}

function classify(name: string): DiscoveredMarketEvent["eventType"] {
  const value = stripAccents(name);
  if (/feriado|carnaval|ano nuevo|navidad|independencia/.test(value)) return "holiday";
  if (/congreso|conferencia|simposio|rueda de negocios|seminario/.test(value)) return "congress";
  if (/futbol|partido|maraton|running|deporte|liga|campeonato|torneo|42k/.test(value)) return "sports";
  if (/concierto|musical|festival de musica|rock|cumbia|orquesta|opera|show/.test(value)) return "concert";
  if (/feria|fexpocruz|expocruz|\bexpo(?:\s|$)/.test(value)) return "fair";
  if (/museo|teatro|cine|cultura|danza|ballet|arte|libro|patrimonio/.test(value)) return "cultural";
  return "other";
}

function impactFor(type: DiscoveredMarketEvent["eventType"], name: string): number {
  const value = stripAccents(name);
  if (/\bexpocruz\b/.test(value)) return 1_200;
  if (/ano nuevo/.test(value)) return 1_500;
  if (/navidad/.test(value)) return 1_200;
  if (/carnaval/.test(value)) return 1_000;
  if (type === "holiday" || type === "civic") return 500;
  if (type === "congress") return 500;
  if (type === "fair") return 300;
  if (type === "concert" || type === "sports") return 500;
  if (/larga noche/.test(value)) return 300;
  if (type === "cultural") return 200;
  return 100;
}

function economicConfidenceFor(type: DiscoveredMarketEvent["eventType"], name: string, sourceName: string): number {
  const value = stripAccents(name);
  if (/\bexpocruz\b/.test(value)) return 8_000;
  if (/ano nuevo|navidad/.test(value)) return 8_000;
  if (/carnaval/.test(value)) return 7_000;
  if (sourceName === "Ministerio de Trabajo") return 6_000;
  if (sourceName === "Fexpocruz") return type === "fair" || type === "congress" ? 5_500 : 5_000;
  if (sourceName === "SuperTicket") return 5_000;
  if (sourceName === "Cultura y Turismo Santa Cruz") return 4_500;
  return 5_000;
}

function flattenJsonLd(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (!value || typeof value !== "object") return [];
  const row = value as Record<string, unknown>;
  const graph = flattenJsonLd(row["@graph"]);
  return [row, ...graph];
}

function locationText(location: unknown): string {
  if (typeof location === "string") return location;
  if (!location || typeof location !== "object") return "";
  const row = location as Record<string, unknown>;
  const address = row.address;
  return clean([row.name, typeof address === "object" && address ? Object.values(address as Record<string, unknown>).join(" ") : address].filter(Boolean).join(" "));
}

export function parseJsonLdEvents(html: string, sourceName: string, sourceUrl: string): DiscoveredMarketEvent[] {
  const scripts = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const events: DiscoveredMarketEvent[] = [];
  for (const script of scripts) {
    try {
      const rows = flattenJsonLd(JSON.parse(decodeEntities(script[1])));
      for (const row of rows) {
        const rawType = row["@type"];
        const types = Array.isArray(rawType) ? rawType.map(String) : [String(rawType || "")];
        if (!types.some((type) => /Event$/i.test(type))) continue;
        const name = clean(String(row.name || ""));
        const start = String(row.startDate || "").slice(0, 10);
        const end = String(row.endDate || row.startDate || "").slice(0, 10);
        const location = locationText(row.location);
        if (!name || !/^20\d{2}-\d{2}-\d{2}$/.test(start) || !/santa cruz/i.test(location)) continue;
        const eventType = classify(`${types.join(" ")} ${name}`);
        events.push({ name, startsOn: start, endsOn: /^20\d{2}-\d{2}-\d{2}$/.test(end) ? end : start, eventType, sourceName, sourceUrl: String(row.url || sourceUrl), impactBps: impactFor(eventType, name), confidenceBps: economicConfidenceFor(eventType, name, sourceName) });
      }
    } catch {
      // A malformed JSON-LD block must not invalidate the whole source.
    }
  }
  return events;
}

function precedingName(lines: string[], index: number): string | null {
  for (let offset = 1; offset <= 5; offset++) {
    const candidate = lines[index - offset];
    if (candidate && plausibleName(candidate) && !parseSpanishRange(candidate)) return candidate.replace(/^#+\s*/, "");
  }
  return null;
}

export function parseFexpocruzEvents(html: string, sourceUrl: string): DiscoveredMarketEvent[] {
  const jsonLd = parseJsonLdEvents(html, "Fexpocruz", sourceUrl);
  const lines = htmlToLines(html);
  const events = [...jsonLd];
  for (let index = 0; index < lines.length; index++) {
    const range = parseSpanishRange(lines[index]);
    if (!range) continue;
    const name = precedingName(lines, index);
    if (!name || !/(feria|expo|festival|42k|running|seminario|congreso|logistica|finergy)/i.test(stripAccents(name))) continue;
    const eventType = classify(name);
    events.push({ name, ...range, eventType, sourceName: "Fexpocruz", sourceUrl, impactBps: impactFor(eventType, name), confidenceBps: economicConfidenceFor(eventType, name, "Fexpocruz") });
  }
  return deduplicate(events);
}

export function parseSuperTicketEvents(html: string, sourceUrl: string): DiscoveredMarketEvent[] {
  const jsonLd = parseJsonLdEvents(html, "SuperTicket", sourceUrl);
  const lines = htmlToLines(html);
  const events = [...jsonLd];
  for (let index = 0; index < lines.length; index++) {
    const range = parseSpanishRange(lines[index]);
    if (!range || !/^\d{2}\/\d{2}\/20\d{2}/.test(lines[index])) continue;
    const name = precedingName(lines, index);
    const nearby = lines.slice(index + 1, index + 5).join(" ");
    if (!name || !/santa cruz/i.test(nearby)) continue;
    const eventType = classify(name);
    events.push({ name, ...range, eventType, sourceName: "SuperTicket", sourceUrl, impactBps: impactFor(eventType, name), confidenceBps: economicConfidenceFor(eventType, name, "SuperTicket") });
  }
  return deduplicate(events);
}

function holidayName(context: string): string {
  if (/gesta libertaria|24 de septiembre/i.test(context)) return "Feriado departamental de Santa Cruz";
  if (/independencia/i.test(context)) return "Feriado por la Independencia de Bolivia";
  if (/corpus christi/i.test(context)) return "Feriado de Corpus Christi";
  if (/carnaval/i.test(context)) return "Feriados de Carnaval";
  if (/a[nñ]o nuevo andino/i.test(context)) return "Año Nuevo Andino Amazónico Chaqueño";
  if (/estado plurinacional/i.test(context)) return "Día del Estado Plurinacional";
  return "Feriado comunicado por el Ministerio de Trabajo";
}

export function parseMinTrabajoEvents(html: string, sourceUrl: string): DiscoveredMarketEvent[] {
  const text = htmlToLines(html).join("\n");
  const patterns = [
    /\b\d{1,2}\s*(?:al|a|y|-)\s*\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+20\d{2}\b/gi,
    /\b\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+20\d{2}\b/gi,
  ];
  const events: DiscoveredMarketEvent[] = [];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const index = match.index || 0;
      const context = text.slice(Math.max(0, index - 220), Math.min(text.length, index + match[0].length + 220));
      const normalizedContext = stripAccents(context);
      if (!/feriado/.test(normalizedContext) || (!/nacional/.test(normalizedContext) && !/santa cruz/.test(normalizedContext))) continue;
      const range = parseSpanishRange(match[0]);
      if (!range) continue;
      const name = holidayName(context);
      const eventType = /santa cruz/i.test(name) ? "civic" : "holiday";
      events.push({ name, ...range, eventType, sourceName: "Ministerio de Trabajo", sourceUrl, impactBps: impactFor(eventType, name), confidenceBps: economicConfidenceFor(eventType, name, "Ministerio de Trabajo"), status: "confirmed" });
    }
  }
  return deduplicate(events);
}

export function parseMunicipalCultureEvents(html: string, sourceUrl: string, now = new Date()): DiscoveredMarketEvent[] {
  const structured = parseJsonLdEvents(html, "Cultura y Turismo Santa Cruz", sourceUrl)
    .filter((event) => event.eventType !== "other" || /(larga noche|festival|feria|congreso|concierto)/i.test(event.name));
  const dateHeaders = [...html.matchAll(/<p[^>]*>\s*(\d{1,2})\s+([a-záéíóúñ]{3,})\s*<\/p>/gi)];
  const localParts = new Intl.DateTimeFormat("en", { timeZone: "America/La_Paz", year: "numeric", month: "numeric" }).formatToParts(now);
  const currentYear = Number(localParts.find((part) => part.type === "year")?.value);
  const currentMonth = Number(localParts.find((part) => part.type === "month")?.value);
  const agenda: DiscoveredMarketEvent[] = [];
  for (let index = 0; index < dateHeaders.length; index++) {
    const header = dateHeaders[index];
    const month = MONTHS[stripAccents(header[2]).slice(0, 3)] || Object.entries(MONTHS).find(([name]) => name.startsWith(stripAccents(header[2])))?.[1];
    if (!month) continue;
    const year = month < currentMonth ? currentYear + 1 : currentYear;
    const date = isoDate(year, month, Number(header[1]));
    if (!date) continue;
    const start = (header.index || 0) + header[0].length;
    const end = dateHeaders[index + 1]?.index ?? html.length;
    const segment = html.slice(start, end);
    for (const anchor of segment.matchAll(/<a\b[^>]*href=["'](\/eventos\/[a-f0-9-]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const names = [...anchor[2].matchAll(/<span[^>]*class=["'][^"']*truncate[^"']*["'][^>]*>([^<]+)<\/span>/gi)].map((match) => clean(decodeEntities(match[1])));
      const name = names[0];
      if (!name || !/(larga noche|festival|feria|congreso|concierto|convencion|encuentro|\bexpo(?:\s|$)|campeonato|maraton|show)/i.test(stripAccents(name))) continue;
      const eventType = classify(name);
      const demandType = eventType === "other" ? "cultural" : eventType;
      agenda.push({ name, startsOn: date, endsOn: date, eventType: demandType, sourceName: "Cultura y Turismo Santa Cruz", sourceUrl: new URL(anchor[1], sourceUrl).toString(), impactBps: impactFor(demandType, name), confidenceBps: economicConfidenceFor(demandType, name, "Cultura y Turismo Santa Cruz") });
    }
  }
  return deduplicate([...structured, ...agenda]);
}

function deduplicate(events: DiscoveredMarketEvent[]): DiscoveredMarketEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = `${stripAccents(event.name)}:${event.startsOn}:${event.sourceName}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const SOURCES: EventSource[] = [
  { key: "mintrabajo", name: "Ministerio de Trabajo", url: "https://mintrabajo.gob.bo/index.php/lista-comunicados-page/", parse: (html, _now, url) => parseMinTrabajoEvents(html, url) },
  { key: "cultura_scz", name: "Cultura y Turismo Santa Cruz", url: "https://culturayturismo.gmsantacruz.gob.bo/eventos?vista=calendario", parse: (html, now, url) => parseMunicipalCultureEvents(html, url, now) },
  { key: "fexpocruz", name: "Fexpocruz", url: "https://www.fexpocruz.com.bo/", parse: (html, _now, url) => parseFexpocruzEvents(html, url) },
  { key: "superticket", name: "SuperTicket", url: "https://superticket.bo/?subcategoria=Santa+Cruz", parse: (html, _now, url) => parseSuperTicketEvents(html, url) },
];

function fetchWithSystemCertificates(url: string): Promise<string> {
  const tlsWithSystem = tls as typeof tls & { getCACertificates?: (type: "system") => string[] };
  const ca = [...tls.rootCertificates, ...(tlsWithSystem.getCACertificates?.("system") || [])];
  return new Promise((resolve, reject) => {
    const request = https.get(url, { ca, headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "DeptosBO-RentHome-EventMonitor/1.0" } }, (response) => {
      const status = response.statusCode || 0;
      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error(`HTTP ${status}`));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 5_000_000) request.destroy(new Error("La respuesta excede 5 MB"));
        else chunks.push(chunk);
      });
      response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    request.setTimeout(12_000, () => request.destroy(new Error("Timeout")));
    request.on("error", reject);
  });
}

async function fetchHtml(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
      headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "DeptosBO-RentHome-EventMonitor/1.0" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } catch (error) {
    const code = error instanceof Error && "cause" in error && error.cause && typeof error.cause === "object" && "code" in error.cause ? String(error.cause.code) : "";
    if (code !== "UNABLE_TO_VERIFY_LEAF_SIGNATURE") throw error;
    return fetchWithSystemCertificates(url);
  }
}

async function saveDiscoveredEvent(event: DiscoveredMarketEvent): Promise<void> {
  const existing = await prisma.marketEvent.findFirst({
    where: { name: event.name, startsOn: event.startsOn, sourceName: event.sourceName },
  });
  const values = {
    name: event.name.slice(0, 160),
    city: "Santa Cruz de la Sierra",
    eventType: event.eventType,
    startsOn: event.startsOn,
    endsOn: event.endsOn,
    impactBps: event.impactBps,
    confidenceBps: event.confidenceBps,
    sourceName: event.sourceName,
    sourceUrl: event.sourceUrl.slice(0, 1000),
    lastVerifiedAt: new Date(),
  };
  if (existing) {
    await prisma.marketEvent.update({
      where: { id: existing.id },
      data: { ...values, status: existing.status === "cancelled" ? "cancelled" : event.status === "confirmed" ? "confirmed" : existing.status },
    });
  } else {
    await prisma.marketEvent.create({ data: { ...values, status: event.status || "candidate" } });
  }
}

async function fetchSource(source: EventSource, now: Date): Promise<EventSourceResult> {
  const checkedAt = now.toISOString();
  const url = typeof source.url === "function" ? source.url(now) : source.url;
  try {
    const html = await fetchHtml(url);
    const events = deduplicate(source.parse(html, now, url)).filter((event) => event.endsOn >= now.toISOString().slice(0, 10));
    for (const event of events) await saveDiscoveredEvent(event);
    return { key: source.key, name: source.name, url, ok: true, discovered: events.length, saved: events.length, checkedAt };
  } catch (error) {
    return { key: source.key, name: source.name, url, ok: false, discovered: 0, saved: 0, error: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200), checkedAt };
  }
}

export async function syncExternalEventSources(now = new Date()): Promise<EventSourceResult[]> {
  // Each request targets a different public domain. Running them together keeps
  // the pricing job below the cron timeout without increasing load on one site.
  const results = await Promise.all(SOURCES.map((source) => fetchSource(source, now)));
  await prisma.appSettings.upsert({
    where: { key: "pricing_event_source_status" },
    update: { value: JSON.stringify(results) },
    create: { key: "pricing_event_source_status", value: JSON.stringify(results) },
  });
  return results;
}

export async function getEventSourceStatus(): Promise<EventSourceResult[]> {
  const row = await prisma.appSettings.findUnique({ where: { key: "pricing_event_source_status" } });
  if (!row?.value) return [];
  try { return JSON.parse(row.value) as EventSourceResult[]; } catch { return []; }
}
