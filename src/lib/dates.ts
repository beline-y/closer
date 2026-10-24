// Relative day labels ("daysAgo" offsets).
export function relativeDay(daysAgo: number): string {
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  return `${daysAgo} days ago`;
}

/** Weekday ("Tue") or full date label; needs today's date, so call it on the client. */
export function dayLabel(today: Date | null, daysAgo: number, style: "short" | "long" = "short"): string {
  if (style === "short" && daysAgo <= 1) return relativeDay(daysAgo);
  if (!today) return relativeDay(daysAgo);
  const d = new Date(today);
  d.setDate(d.getDate() - daysAgo);
  return d.toLocaleDateString("en-US", style === "short" ? { weekday: "short" } : { weekday: "short", month: "short", day: "numeric" });
}

// Server-side helpers for real data. Patients' days follow their own timezone.

/** Today's date (YYYY-MM-DD) in a timezone. */
export function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

/** Whole days between two YYYY-MM-DD dates (today - date). */
export function daysBetween(today: string, date: string): number {
  return Math.round((Date.parse(today) - Date.parse(date)) / 86_400_000);
}

/** "9:12 AM" in a timezone. */
export function timeIn(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
}
