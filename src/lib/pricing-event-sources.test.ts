import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  parseFexpocruzEvents,
  parseJsonLdEvents,
  parseMinTrabajoEvents,
  parseMunicipalCultureEvents,
  parseSuperTicketEvents,
} from "./pricing-event-sources";

describe("pricing event source parsers", () => {
  it("extracts a dated Fexpocruz fair", () => {
    const events = parseFexpocruzEvents("<h2>Expocruz 2027</h2><p>17 al 26 de septiembre de 2027</p>", "https://fexpocruz.test");
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Expocruz 2027", startsOn: "2027-09-17", endsOn: "2027-09-26", eventType: "fair" }),
    ]));
  });

  it("keeps only Santa Cruz ticketed events", () => {
    const html = "<h3>Maluma en concierto</h3><div>20/03/2027</div><div>Santa Cruz · Arena</div>";
    const events = parseSuperTicketEvents(html, "https://tickets.test");
    expect(events[0]).toMatchObject({ name: "Maluma en concierto", startsOn: "2027-03-20", eventType: "concert" });
  });

  it("extracts confirmed national holidays from labor notices", () => {
    const html = "<p>El Ministerio de Trabajo comunica feriado nacional por Corpus Christi el 27 de mayo de 2027.</p>";
    const events = parseMinTrabajoEvents(html, "https://trabajo.test");
    expect(events[0]).toMatchObject({ name: "Feriado de Corpus Christi", startsOn: "2027-05-27", status: "confirmed", confidenceBps: 6_000 });
  });

  it("reads structured municipal events located in Santa Cruz", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "Event", name: "Larga Noche de Museos", startDate: "2027-05-22T18:00:00-04:00",
      endDate: "2027-05-22T23:00:00-04:00", location: { name: "Santa Cruz de la Sierra" },
    })}</script>`;
    const events = parseJsonLdEvents(html, "Cultura Santa Cruz", "https://cultura.test");
    expect(events[0]).toMatchObject({ name: "Larga Noche de Museos", startsOn: "2027-05-22", eventType: "cultural" });
  });

  it("extracts major events, including Larga Noche, from the municipal agenda", () => {
    const html = `<p class="date">22 may</p><a href="/eventos/61988cd6-8252-4885-b8b5-0db47255ee27"><span class="truncate">Larga Noche de Museos</span><span class="truncate">Centro histórico</span></a>`;
    const events = parseMunicipalCultureEvents(html, "https://culturayturismo.gmsantacruz.gob.bo/eventos?vista=calendario", new Date("2027-04-10T12:00:00Z"));
    expect(events[0]).toMatchObject({ name: "Larga Noche de Museos", startsOn: "2027-05-22", eventType: "cultural", impactBps: 300, confidenceBps: 4_500 });
  });

  it("does not treat every cultural exhibition as a demand-driving Expo", () => {
    const html = `<p class="date">13 nov</p><a href="/eventos/61988cd6-8252-4885-b8b5-0db47255ee27"><span class="truncate">Exposición Permanente de Arte</span></a>`;
    expect(parseMunicipalCultureEvents(html, "https://culturayturismo.gmsantacruz.gob.bo/eventos?vista=calendario", new Date("2026-11-13T12:00:00Z"))).toEqual([]);
  });
});
