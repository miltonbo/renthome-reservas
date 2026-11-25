export const rentHomeFields = ["title", "description", "area", "city", "locationNotes", "layout", "services", "rules"] as const;
export type RentHomeDetails = Record<(typeof rentHomeFields)[number], string> & { capacity: number };

export function rentHomeServices(value: string) {
  return [...new Set(value.split(/[·\r\n]/).map((item) => item.trim()).filter(Boolean))];
}

export function rentHomePublicLocation(details: RentHomeDetails) {
  return [details.area, details.city].filter(Boolean).join(" · ") || "Santa Cruz de la Sierra";
}
