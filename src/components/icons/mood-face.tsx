import { getMood } from "@/lib/mood";
import { cn } from "@/lib/utils";

// Five faces, very sad to great, in a rounded line style and the --mood-N color. The same
// faces rate food (yuck to loved it). Never color alone: callers show the label too, or
// pass it here as the accessible name.
const MOUTHS: Record<number, string> = {
  1: "M8 16.5c1.2-1.6 2.5-2.3 4-2.3s2.8.7 4 2.3",
  2: "M8.5 15.8c1-.8 2.2-1.2 3.5-1.2s2.5.4 3.5 1.2",
  3: "M8.5 15h7",
  4: "M8.5 14c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8",
  5: "M7.8 13.3h8.4c-.4 2.6-2.1 4.2-4.2 4.2s-3.8-1.6-4.2-4.2z",
};

export function MoodFace({ value, label, className }: { value: number; label?: string; className?: string }) {
  const mood = getMood(value);
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-[1.4em] shrink-0", mood.text, className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <circle cx="12" cy="12" r="9.5" fill="currentColor" fillOpacity={0.16} />
      {mood.value === 1 ? (
        <>
          <path d="M7.6 9.2l2.2.8M16.4 9.2l-2.2.8" />
          <circle cx="9" cy="11" r="0.9" fill="currentColor" stroke="none" />
          <circle cx="15" cy="11" r="0.9" fill="currentColor" stroke="none" />
        </>
      ) : mood.value === 5 ? (
        <path d="M7.8 10.2c.5-.9 1.8-.9 2.3 0M13.9 10.2c.5-.9 1.8-.9 2.3 0" />
      ) : (
        <>
          <circle cx="9" cy="10" r="0.9" fill="currentColor" stroke="none" />
          <circle cx="15" cy="10" r="0.9" fill="currentColor" stroke="none" />
        </>
      )}
      <path d={MOUTHS[mood.value]} fill={mood.value === 5 ? "currentColor" : "none"} fillOpacity={mood.value === 5 ? 0.35 : undefined} />
    </svg>
  );
}
