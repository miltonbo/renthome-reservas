import { priceForGuests } from "@/lib/pricing";
import { rentHomeBuildingDistance } from "@/lib/renthome-building-locations";

export type RentHomeGroupUnit = { propertyId: number; title: string; building: string; guests: number; totalMinor: number; savingsMinor: number };
export type RentHomeGroup = { building: string; distanceMeters: number; units: RentHomeGroupUnit[]; totalMinor: number; savingsMinor: number };
type Candidate = { id: number; building: string; details: { capacity: number; title: string }; totalMinor: number | null; savingsMinor?: number };

export function rentHomeStayForGuests(totalMinor: number, savingsMinor: number, guests: number) {
  const total = priceForGuests(totalMinor, guests);
  return { totalMinor: total, savingsMinor: priceForGuests(totalMinor + savingsMinor, guests) - total };
}

const knownBuildings = ["Sky Elite", "Luxe Suites", "Sky Eclipse", "Sky Moon", "Sky Luxia", "UpTown Nuu", "Stanza"];

export function rentHomeBuilding(name: string, configured?: string) {
  const building = knownBuildings.find((value) => name.toLowerCase().startsWith(value.toLowerCase() + " "));
  return building ?? configured?.trim() ?? "";
}

export function quoteRentHomeGroup(selected: Candidate[], guests: number): RentHomeGroup | null {
  if (guests < 3 || selected.length < 2 || selected.length > 3 ||
    selected.some((item) => !item.building || item.totalMinor === null || item.details.capacity < 1) ||
    new Set(selected.map((item) => item.id)).size !== selected.length ||
    selected.reduce((capacity, item) => capacity + item.details.capacity, 0) < guests) return null;

  const buildings = [...new Map(selected.map((item) => [item.building.toLowerCase(), item.building])).values()];
  let distanceMeters = 0;
  for (const [index, building] of buildings.entries()) {
    for (const other of buildings.slice(index + 1)) {
      const distance = rentHomeBuildingDistance(building, other);
      if (distance === null) return null;
      distanceMeters = Math.max(distanceMeters, distance);
    }
  }

  const units = selected.map((item): RentHomeGroupUnit => ({
    propertyId: item.id, title: item.details.title, building: item.building, guests: 1, totalMinor: item.totalMinor!, savingsMinor: item.savingsMinor ?? 0,
  }));
  let remaining = guests - units.length;
  for (let occupancy = 2; remaining > 0; occupancy++) {
    for (const [index, unit] of units.entries()) {
      if (selected[index].details.capacity < occupancy) continue;
      unit.guests = occupancy;
      if (--remaining === 0) break;
    }
  }
  const quotedUnits = units.map((unit) => ({
    ...unit,
    ...rentHomeStayForGuests(unit.totalMinor, unit.savingsMinor, unit.guests),
  }));
  return {
    building: buildings.join(" · "), distanceMeters, units: quotedUnits,
    totalMinor: quotedUnits.reduce((total, item) => total + item.totalMinor, 0),
    savingsMinor: quotedUnits.reduce((total, item) => total + item.savingsMinor, 0),
  };
}

export function rentHomeGroups(options: Candidate[], guests: number): RentHomeGroup[] {
  if (guests < 3) return [];
  const byBuilding = new Map<string, Candidate[]>();
  for (const item of options) {
    if (!item.building) continue;
    const key = item.building.toLowerCase();
    const units = byBuilding.get(key) ?? [];
    units.push(item);
    byBuilding.set(key, units);
  }
  function combinations(options: Candidate[]) {
    const groups: RentHomeGroup[] = [];
    for (const [first, unit] of options.entries()) {
      for (const [offset, next] of options.slice(first + 1).entries()) {
        const pair = quoteRentHomeGroup([unit, next], guests);
        if (pair) groups.push(pair);
        for (const last of options.slice(first + offset + 2)) {
          const triple = quoteRentHomeGroup([unit, next, last], guests);
          if (triple) groups.push(triple);
        }
      }
    }
    return groups;
  }
  const sameBuilding = [...byBuilding.values()].flatMap(combinations);
  const groups = sameBuilding.length ? sameBuilding : combinations([...byBuilding.values()].flat());
  return groups.sort((a, b) => a.distanceMeters - b.distanceMeters || a.units.length - b.units.length || a.totalMinor - b.totalMinor);
}
