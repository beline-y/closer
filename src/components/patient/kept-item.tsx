"use client";

import { useState, useTransition } from "react";
import { shareKept } from "@/app/activity-actions";

// A result Leo kept for himself, with the choice to share it later.
export function ShareKeptButtons({ sessionId }: { sessionId: string }) {
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (done) return <p className="font-bold text-success">{done}</p>;
  const share = (to: "family" | "memories") =>
    start(async () => {
      const r = await shareKept(sessionId, to);
      setDone(r.ok ? (to === "family" ? "Shared with your family 💛" : "Added to Memories 📸") : r.error);
    });
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={pending} onClick={() => share("family")} className="hue-coral pressable min-h-12 rounded-full bg-hue-soft px-4 font-bold disabled:opacity-60">
        💛 Share with my family
      </button>
      <button type="button" disabled={pending} onClick={() => share("memories")} className="hue-sky pressable min-h-12 rounded-full bg-hue-soft px-4 font-bold disabled:opacity-60">
        📸 Add to Memories
      </button>
    </div>
  );
}
