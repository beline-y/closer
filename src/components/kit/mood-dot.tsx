import { MoodFace } from "@/components/icons/mood-face";
import { getMood } from "@/lib/mood";
import { cn } from "@/lib/utils";

// Compact mood for tables and timelines: face + label (never color alone).
export function MoodDot({ value, showLabel = true, className }: { value: number; showLabel?: boolean; className?: string }) {
  const mood = getMood(value);
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
      <MoodFace value={mood.value} />
      {showLabel ? <span>{mood.label}</span> : <span className="sr-only">{mood.label}</span>}
    </span>
  );
}
