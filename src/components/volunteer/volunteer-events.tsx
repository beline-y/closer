"use client";

import { useState } from "react";
import { EVENTS } from "@/lib/demo-fixtures";
import { cn } from "@/lib/utils";

// Hospital events volunteers can join in person. Saved for this visit only.
export function VolunteerEvents({ me }: { me: "maya" | "daniel" }) {
  const [going, setGoing] = useState<string[]>(EVENTS.filter((e) => e.signups.includes(me)).map((e) => e.id));

  return (
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {EVENTS.map((e) => {
        const isGoing = going.includes(e.id);
        const count = e.signups.filter((s) => s !== me).length + (isGoing ? 1 : 0);
        const full = count >= e.capacity && !isGoing;
        return (
          <li key={e.id} className={cn("flex flex-col gap-3 rounded-3xl bg-card p-5 shadow-sm ring-1 ring-border", isGoing && "ring-2 ring-role-volunteer")}>
            <div className="flex items-start gap-3">
              <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-role-volunteer-soft text-3xl">
                {e.emoji}
              </span>
              <div className="flex flex-col">
                <h2 className="text-xl font-extrabold">{e.title}</h2>
                <p className="font-bold text-role-volunteer-ink">{e.when}</p>
                <p className="text-sm text-muted-foreground">{e.location}</p>
              </div>
            </div>
            <details className="group">
              <summary className="min-h-11 cursor-pointer content-center font-bold">Details</summary>
              <p className="pt-1 text-muted-foreground">{e.description}</p>
            </details>
            <div className="mt-auto flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground tabular-nums">
                {count}/{e.capacity} volunteers
              </span>
              <button
                type="button"
                disabled={full}
                aria-pressed={isGoing}
                onClick={() => setGoing((g) => (isGoing ? g.filter((id) => id !== e.id) : [...g, e.id]))}
                className={cn("min-h-12 rounded-full px-5 font-bold disabled:opacity-50", isGoing ? "bg-muted" : "bg-role-volunteer-ink text-white")}
              >
                {isGoing ? "Cancel my spot" : full ? "Full" : "Sign up"}
              </button>
            </div>
            {isGoing && <p className="text-sm font-bold text-success">✓ You&apos;re going. The care team will welcome you at the front desk.</p>}
          </li>
        );
      })}
    </ul>
  );
}
