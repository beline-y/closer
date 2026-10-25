"use client";

import { useOptimistic, useState, useTransition } from "react";
import { toggleCheckinReaction } from "@/app/checkin-actions";
import { REACTIONS } from "@/lib/checkin";
import type { CheckInView } from "@/lib/data/checkins";
import { cn } from "@/lib/utils";

type Reactions = CheckInView["reactions"];

// Family side: tap to react, tap again to remove. Optimistic, then confirmed by the server.
export function ReactionBar({ checkinId, reactions, me }: { checkinId: string; reactions: Reactions; me: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [optimistic, toggle] = useOptimistic(reactions, (state: Reactions, emoji: string) => {
    const r = state.find((x) => x.emoji === emoji);
    const mine = !!r?.byUserIds.includes(me);
    const byUserIds = mine ? r!.byUserIds.filter((id) => id !== me) : [...(r?.byUserIds ?? []), me];
    const rest = state.filter((x) => x.emoji !== emoji)
      .map((x) => ({ ...x, byUserIds: x.byUserIds.filter((id) => id !== me) }))
      .filter((x) => x.byUserIds.length);
    return byUserIds.length ? [...rest, { emoji, byUserIds, by: r?.by ?? [] }] : rest;
  });

  return (
    <div role="group" aria-label="React" className="flex flex-wrap gap-2">
      {REACTIONS.map((emoji) => {
        const r = optimistic.find((x) => x.emoji === emoji);
        const mine = !!r?.byUserIds.includes(me);
        const names = r?.by.map((m) => m.relationship ?? m.name).join(", ");
        return (
          <button
            key={emoji}
            type="button"
            disabled={pending}
            aria-pressed={mine}
            aria-label={`React ${emoji}${names ? `, from ${names}` : ""}`}
            title={names}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                toggle(emoji);
                const result = await toggleCheckinReaction(checkinId, emoji);
                if (!result.ok) setError(result.error);
              })
            }
            className={cn("flex min-h-11 items-center gap-1 rounded-full px-3 text-xl transition active:scale-90", mine ? "bg-role-family-soft ring-2 ring-role-family" : "bg-card ring-1 ring-border")}
          >
            {emoji}
            {r && <span className="text-sm font-bold tabular-nums">{r.byUserIds.length}</span>}
          </button>
        );
      })}
      {error && <p role="alert" className="w-full text-sm text-destructive">{error}</p>}
    </div>
  );
}

/** Patient side: read-only, with names ("❤️ Mom, Dad"). */
export function ReactionList({ reactions }: { reactions: Reactions }) {
  if (reactions.length === 0) return null;
  return (
    <ul aria-label="Reactions" className="flex flex-wrap gap-2">
      {reactions.map((r) => (
        <li key={r.emoji} className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1 font-bold ring-1 ring-border">
          <span aria-hidden className="text-xl">
            {r.emoji}
          </span>
          {r.by.map((m) => m.relationship === "Mom" || m.relationship === "Dad" ? m.relationship : m.name).join(", ")}
        </li>
      ))}
    </ul>
  );
}
