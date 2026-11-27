import type { RentHomeDates } from "@/components/renthome-search";

export const rentHomeReceiptKey = "renthome:last-booking-receipt";
export type RentHomeReceipt = {
  code: string;
  whatsapp: string;
  stay?: RentHomeDates & { guestName: string; propertyTitles: string[] };
};

export function rentHomeBookingLink(dates: RentHomeDates, unitIds: number[]) {
  return `/renthome/reservar?${new URLSearchParams({ ...dates, unidades: unitIds.join(",") })}`;
}

export function rentHomeBackToResults(dates: RentHomeDates) {
  return `/renthome?${new URLSearchParams(dates)}#departamentos`;
}
