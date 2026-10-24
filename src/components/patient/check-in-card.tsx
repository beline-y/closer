"use client";

import { useState } from "react";
import { MoodPicker } from "@/components/kit/mood-picker";

// Today screen: one big button, then the five moods inline.
export function CheckInCard() {
  const [open, setOpen] = useState(false);
  return (
    <section aria-labelledby="checkin-title" className="flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-sm ring-1 ring-border">
      <h2 id="checkin-title" className="text-2xl font-extrabold">
        How do you feel?
      </h2>
      {open ? (
        <MoodPicker />
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-20 items-center justify-center gap-3 rounded-2xl bg-role-patient text-xl font-extrabold text-foreground shadow-sm transition hover:-translate-y-0.5 active:scale-[0.98]"
        >
          <span aria-hidden className="text-4xl">
            😊
          </span>
          Check in
        </button>
      )}
    </section>
  );
}
