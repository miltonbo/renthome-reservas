/** OTA calendars also export inventory closed by the host as iCal events.
 * These rows are migration/availability references, not guest stays. */
export function isAvailabilityBlockSummary(summary: string | null | undefined): boolean {
  const normalized = (summary || "").toLowerCase().trim();
  return (
    normalized.includes("not available") ||
    normalized.includes("blocked") ||
    /^closed\b/.test(normalized)
  );
}

export function isAvailabilityBlockEvent(event: { summary?: string | null }): boolean {
  return isAvailabilityBlockSummary(event.summary);
}
