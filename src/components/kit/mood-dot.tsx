import { getMood } from "@/lib/mood";
import { cn } from "@/lib/utils";

// Compact mood for tables and timelines: color dot + emoji + label (never color alone).
export function MoodDot({ value, showLabel = true, className }: { value: number; showLabel?: boolean; className?: string }) {
  const mood = getMood(value);
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
      <span aria-hidden className={cn("size-2.5 rounded-full", mood.bg)} />
      <span aria-hidden>{mood.emoji}</span>
      {showLabel ? <span>{mood.label}</span> : <span className="sr-only">{mood.label}</span>}
    </span>
  );
}
