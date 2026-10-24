// Relative day labels for fixture data ("daysAgo" offsets).
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
