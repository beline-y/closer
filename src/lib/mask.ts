/** Replaces any known name (whole word, any case) with "[name]" before text leaves the app. */
export function maskNames(text: string, names: string[]): string {
  return names
    .filter((n) => n.trim().length > 1)
    .reduce((t, n) => t.replace(new RegExp(`(?<![\\p{L}\\p{N}])${n.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "giu"), "[name]"), text);
}
