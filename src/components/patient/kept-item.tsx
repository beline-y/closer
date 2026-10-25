"use client";

import { useState, useTransition } from "react";
import { shareKept } from "@/app/activity-actions";
import { CloserIcon } from "@/components/icons/closer-icon";

// A result Leo kept for himself, with the choice to share it later.
export function ShareKeptButtons({ sessionId }: { sessionId: string }) {
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (done) return <p className="font-bold text-success">{done}</p>;
  const share = (to: "family" | "memories") =>
    start(async () => {
      const r = await shareKept(sessionId, to);
      setDone(r.ok ? (to === "family" ? "Shared with your family." : "Added to Memories.") : r.error);
    });
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={pending} onClick={() => share("family")} className="inline-flex min-h-12 items-center gap-1.5 rounded-full bg-role-patient px-4 font-bold disabled:opacity-60">
        <CloserIcon name="heart" /> Share with my family
      </button>
      <button type="button" disabled={pending} onClick={() => share("memories")} className="inline-flex min-h-12 items-center gap-1.5 rounded-full bg-muted px-4 font-bold disabled:opacity-60">
        <CloserIcon name="memory" /> Add to Memories
      </button>
    </div>
  );
}
