"use client";

import { MoodFace } from "@/components/icons/mood-face";
import { MOODS } from "@/lib/mood";
import { cn } from "@/lib/utils";

// Five big face buttons (radio group): face + word + color.
export function MoodPicker({ value, onChange, compact }: { value: number | null; onChange: (mood: number) => void; compact?: boolean }) {
  return (
    <div role="radiogroup" aria-label="How do you feel?" className="grid grid-cols-5 gap-2">
      {MOODS.map((m) => {
        const selected = value === m.value;
        return (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(m.value)}
            className={cn(
              "flex min-h-(--tap) flex-col items-center justify-center gap-1 rounded-2xl border-2 bg-card px-1 py-2 transition active:scale-95",
              selected ? "border-current shadow-md" : "border-transparent ring-1 ring-border hover:-translate-y-0.5",
              m.text,
            )}
          >
            <MoodFace value={m.value} className={cn(compact ? "size-9" : "size-11 sm:size-14", selected && "animate-pop")} />
            <span className="text-center text-xs font-bold text-foreground sm:text-sm">{m.label}</span>
            <span aria-hidden className={cn("h-1.5 w-8 rounded-full", m.bg)} />
          </button>
        );
      })}
    </div>
  );
}
