export type RentHomeGroupUnit = { propertyId: number; title: string; guests: number; totalMinor: number };
export type RentHomeGroup = { building: string; units: RentHomeGroupUnit[]; totalMinor: number };
type Candidate = { id: number; building: string; details: { capacity: number; title: string }; totalMinor: number | null };

const knownBuildings = ["Sky Elite", "Luxe Suites", "Sky Eclipse", "Sky Moon", "Sky Luxia", "UpTown Nuu", "Stanza"];

export function rentHomeBuilding(name: string, configured?: string) {
  const building = knownBuildings.find((value) => name.toLowerCase().startsWith(value.toLowerCase() + " "));
  return building ?? configured?.trim() ?? "";
}

export function quoteRentHomeGroup(selected: Candidate[], guests: number): RentHomeGroup | null {
  const building = selected[0]?.building;
  if (guests < 3 || selected.length < 2 || selected.length > 3 || !building ||
    selected.some((item) => item.building.toLowerCase() !== building.toLowerCase() || item.totalMinor === null || item.details.capacity < 1) ||
    new Set(selected.map((item) => item.id)).size !== selected.length ||
    selected.reduce((capacity, item) => capacity + item.details.capacity, 0) < guests) return null;

  let remaining = guests;
  const units = selected.map((item, index): RentHomeGroupUnit => {
    const count = Math.min(item.details.capacity, remaining - (selected.length - index - 1));
    remaining -= count;
    return { propertyId: item.id, title: item.details.title, guests: count, totalMinor: item.totalMinor! };
  });
  return { building, units, totalMinor: units.reduce((total, item) => total + item.totalMinor, 0) };
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
  const groups: RentHomeGroup[] = [];
  for (const options of byBuilding.values()) {
    const pairs: RentHomeGroup[] = [];
    const triples: RentHomeGroup[] = [];
    for (const [first, unit] of options.entries()) {
      for (const [offset, next] of options.slice(first + 1).entries()) {
        const pair = quoteRentHomeGroup([unit, next], guests);
        if (pair) pairs.push(pair);
        for (const last of options.slice(first + offset + 2)) {
          const triple = quoteRentHomeGroup([unit, next, last], guests);
          if (triple) triples.push(triple);
        }
      }
    }
    const byPrice = (a: RentHomeGroup, b: RentHomeGroup) => a.totalMinor - b.totalMinor;
    groups.push(...pairs.sort(byPrice).slice(0, 2), ...triples.sort(byPrice).slice(0, 2));
  }
  return groups.sort((a, b) => a.units.length - b.units.length || a.totalMinor - b.totalMinor);
}
