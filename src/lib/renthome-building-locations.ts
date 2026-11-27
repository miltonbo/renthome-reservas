type Coordinates = readonly [latitude: number, longitude: number];

// Exact building pins stay on the server for distance calculations.
let previousConfig: string | undefined;
const buildingLocations = new Map<string, Coordinates>();

function loadLocations(config: string | undefined) {
  previousConfig = config;
  buildingLocations.clear();
  if (!config) return;
  try {
    for (const [name, coordinates] of Object.entries(JSON.parse(config))) {
      if (!Array.isArray(coordinates) || coordinates.length !== 2) continue;
      const [latitude, longitude] = coordinates;
      if (Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
        buildingLocations.set(name.trim().toLowerCase(), [latitude, longitude]);
      }
    }
  } catch {
    // Quotes in a single building remain available if the private configuration cannot be read.
  }
}

function buildingPoint(building: string) {
  const config = process.env.RENTHOME_BUILDING_LOCATIONS;
  if (config !== previousConfig) loadLocations(config);
  return buildingLocations.get(building?.toLowerCase());
}

export function rentHomePublicMapLocation(building: string): [number, number] | null {
  const point = buildingPoint(building);
  if (!point) return null;
  return [Number(point[0].toFixed(4)), Number(point[1].toFixed(4))];
}

export function rentHomeBuildingDistance(first: string, second: string): number | null {
  const a = buildingPoint(first);
  const b = buildingPoint(second);
  if (!a || !b) return null;
  const radians = Math.PI / 180;
  const haversine = Math.sin((b[0] - a[0]) * radians / 2) ** 2 +
    Math.cos(a[0] * radians) * Math.cos(b[0] * radians) * Math.sin((b[1] - a[1]) * radians / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(Math.min(1, haversine)));
}
