"use client";

import { useState } from "react";
import { MOODS, type MoodValue } from "@/lib/mood";
import { cn } from "@/lib/utils";

// Five big emoji buttons (radio group): emoji + word + color, then a little celebration.
export function MoodPicker({ onPick, compact }: { onPick?: (mood: MoodValue) => void; compact?: boolean }) {
  const [picked, setPicked] = useState<MoodValue | null>(null);
  const mood = MOODS.find((m) => m.value === picked);

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="How do you feel?" className="grid grid-cols-5 gap-2">
        {MOODS.map((m) => {
          const selected = picked === m.value;
          return (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                setPicked(m.value);
                onPick?.(m.value);
              }}
              className={cn(
                "flex min-h-(--tap) flex-col items-center justify-center gap-1 rounded-2xl border-2 bg-card px-1 py-2 transition active:scale-95",
                selected ? "border-current shadow-md" : "border-transparent ring-1 ring-border hover:-translate-y-0.5",
                m.text,
              )}
            >
              <span aria-hidden className={cn("leading-none", compact ? "text-3xl" : "text-4xl sm:text-5xl", selected && "animate-pop")}>
                {m.emoji}
              </span>
              <span className="text-center text-xs font-bold text-foreground sm:text-sm">{m.label}</span>
              <span aria-hidden className={cn("h-1.5 w-8 rounded-full", m.bg)} />
            </button>
          );
        })}
      </div>
      <p aria-live="polite" className="min-h-7 text-center text-lg font-bold">
        {mood && (
          <span className="inline-block animate-rise">
            {mood.value >= 4 ? "Yay! 🎉" : mood.value === 3 ? "Thanks for telling us 💛" : "Sending you a big hug 🤗"} Your family will see it.
          </span>
        )}
      </p>
    </div>
  );
}
