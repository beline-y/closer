"use client";

import { MOODS } from "@/lib/mood";
import { cn } from "@/lib/utils";

// Five big emoji buttons (radio group): emoji + word + color.
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
              "flex min-h-(--tap) flex-col items-center justify-center gap-1 rounded-2xl border-2 px-1 py-2 transition active:scale-95",
              selected ? cn("border-current shadow-md", m.tint) : "border-transparent bg-card ring-1 ring-border hover:-translate-y-0.5",
              m.text,
            )}
          >
            <span aria-hidden className={cn("leading-none", compact ? "text-3xl" : "text-4xl sm:text-5xl", selected && "animate-pop")}>
              {m.emoji}
            </span>
            <span className="text-center text-sm leading-tight font-bold text-foreground sm:text-base">{m.label}</span>
            <span aria-hidden className={cn("h-1.5 w-8 rounded-full", m.bg)} />
          </button>
        );
      })}
    </div>
  );
}
