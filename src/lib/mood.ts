// Mood scale used by check-ins, charts and the care team table.
// Mood is never color alone: always the face icon (MoodFace) + label, color is a third cue.
export type MoodValue = 1 | 2 | 3 | 4 | 5;

export type Mood = {
  value: MoodValue;
  label: string;
  /** Tailwind classes bound to the --mood-N tokens */
  bg: string;
  text: string;
  /** CSS color for SVG charts */
  color: string;
};

export const MOODS: Mood[] = [
  { value: 1, label: "Very sad", bg: "bg-mood-1", text: "text-mood-1", color: "var(--mood-1)" },
  { value: 2, label: "Not great", bg: "bg-mood-2", text: "text-mood-2", color: "var(--mood-2)" },
  { value: 3, label: "Okay", bg: "bg-mood-3", text: "text-mood-3", color: "var(--mood-3)" },
  { value: 4, label: "Good", bg: "bg-mood-4", text: "text-mood-4", color: "var(--mood-4)" },
  { value: 5, label: "Great", bg: "bg-mood-5", text: "text-mood-5", color: "var(--mood-5)" },
];

/** One day of a mood chart; null = no check-in that day. */
export type MoodPoint = { daysAgo: number; mood: MoodValue | null };

export function getMood(value: number): Mood {
  return MOODS[Math.min(5, Math.max(1, Math.round(value))) - 1];
}
