export type ClosedDateOverride = {
  propertyId: number;
  date: string;
  type: string;
  note?: string | null;
};

export type BlockedDateRange = {
  propertyId: number;
  startDate: string;
  endDate: string;
  nights: number;
  reason: string;
};

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Groups consecutive manually blocked nights that share the same reason.
 * endDate is exclusive, matching reservations and iCal DTEND semantics. */
export function groupClosedDateOverrides(overrides: ClosedDateOverride[]): BlockedDateRange[] {
  const closed = overrides
    .filter((override) => override.type === "closed")
    .map((override) => ({ ...override, reason: override.note?.trim() || "Sin motivo especificado" }))
    .sort((a, b) => a.propertyId - b.propertyId || a.date.localeCompare(b.date));

  const ranges: BlockedDateRange[] = [];
  for (const override of closed) {
    const previous = ranges.at(-1);
    if (
      previous &&
      previous.propertyId === override.propertyId &&
      previous.reason === override.reason &&
      previous.endDate === override.date
    ) {
      previous.endDate = addDays(override.date, 1);
      previous.nights += 1;
      continue;
    }
    ranges.push({
      propertyId: override.propertyId,
      startDate: override.date,
      endDate: addDays(override.date, 1),
      nights: 1,
      reason: override.reason,
    });
  }
  return ranges;
}
