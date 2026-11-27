import { prisma } from "@/lib/prisma";
import { isAdvisoryBookingEvent, isAvailabilityBlockEvent } from "@/lib/calendar-event-kind";

export async function listTurnovers(ownerId: number, date: string, administratorId?: number) {
  const day = new Date(date + "T00:00:00Z");
  const nextDay = new Date(day.getTime() + 86_400_000);
  const properties = await prisma.property.findMany({
    where: {
      userId: ownerId, isPaused: false, cleaningEnabled: true,
      ...(administratorId !== undefined && {
        OR: [{ userId: administratorId }, { managers: { some: { managerId: administratorId } } }],
      }),
    },
    select: {
      id: true, name: true, checkInTime: true, checkOutTime: true,
      reservations: {
        where: { status: "confirmed", checkIn: { lt: nextDay }, checkOut: { gte: day } },
        select: { checkIn: true, checkOut: true, extensionOfId: true, linkedEventUid: true,
          linkedEventPlatform: true, linkedEventRole: true },
      },
      calendarEvents: {
        where: { startDate: { lte: date }, endDate: { gte: date } },
        select: { startDate: true, endDate: true, platform: true, summary: true, uid: true },
      },
      cleaningTurnovers: { where: { date }, select: { checkoutAt: true, readyAt: true } },
    },
    orderBy: { name: "asc" },
  });
  return properties.flatMap((property) => {
    const synced = property.calendarEvents
      .filter((event) => !isAdvisoryBookingEvent(event) && !isAvailabilityBlockEvent(event))
      .map((event) => ({
        start: event.startDate, end: event.endDate,
        extension: event.startDate === date && property.reservations.some((stay) =>
          stay.linkedEventRole === "extension" && stay.linkedEventUid === event.uid
          && stay.linkedEventPlatform === event.platform && stay.checkOut.toISOString().slice(0, 10) === date),
      }));
    const manual = property.reservations.map((stay) => ({
      start: stay.checkIn.toISOString().slice(0, 10), end: stay.checkOut.toISOString().slice(0, 10),
      extension: stay.extensionOfId !== null || stay.linkedEventRole === "extension",
    }));
    const stays = [...manual, ...synced];
    const scheduled = stays.some((stay) => stay.start < date && stay.end === date)
      && !stays.some((stay) => (stay.start < date || stay.extension) && stay.end > date);
    const turnover = property.cleaningTurnovers[0];
    if (!scheduled && !turnover) return [];
    return [{
      id: property.id, name: property.name, scheduled,
      checkOutTime: property.checkOutTime,
      nextArrivalTime: stays.some((stay) => stay.start === date && stay.end > date && !stay.extension)
        ? property.checkInTime : null,
      checkoutAt: turnover?.checkoutAt ?? null,
      readyAt: turnover?.readyAt ?? null,
    }];
  });
}
