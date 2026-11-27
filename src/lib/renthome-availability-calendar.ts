import { reservationNights } from "./reservation-dates";

export type RentHomeAvailabilityCalendar = {
  minNights: number;
  maxNights: number;
  ranges: { start: string; end: string }[];
};

export function rentHomeCanCheckIn(calendar: RentHomeAvailabilityCalendar, date: string) {
  return calendar.ranges.some(({ start, end }) => start <= date && reservationNights(date, end) >= calendar.minNights);
}

export function rentHomeCanCheckOut(calendar: RentHomeAvailabilityCalendar, checkIn: string, checkOut: string) {
  const nights = reservationNights(checkIn, checkOut);
  return nights >= calendar.minNights && nights <= calendar.maxNights &&
    calendar.ranges.some(({ start, end }) => start <= checkIn && checkOut <= end);
}
