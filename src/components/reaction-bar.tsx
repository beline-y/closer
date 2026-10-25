"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setCheckinReaction } from "@/app/checkin-actions";
import { PersonaAvatar } from "@/components/kit/persona-avatar";
import { REACTIONS } from "@/lib/checkin";
import type { CheckInView } from "@/lib/data/checkins";
import { cn } from "@/lib/utils";

type Reactions = CheckInView["reactions"];

const myEmoji = (reactions: Reactions, me: string) => reactions.find((r) => r.byUserIds.includes(me))?.emoji ?? null;

// Family side: one reaction per person, tap another to change it, the same one to remove it.
// Optimistic, then confirmed by the server; a failure is shown under the buttons.
export function ReactionBar({ checkinId, reactions, me, onReact = setCheckinReaction }: {
  checkinId: string;
  reactions: Reactions;
  me: string;
  onReact?: (id: string, emoji: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [optimistic, choose] = useOptimistic(reactions, (state: Reactions, emoji: string) => {
    const current = myEmoji(state, me);
    const without = state
      .map((r) => ({ ...r, byUserIds: r.byUserIds.filter((id) => id !== me), by: r.by.filter((m) => m.userId !== me) }))
      .filter((r) => r.byUserIds.length);
    if (current === emoji) return without;
    const target = without.find((r) => r.emoji === emoji);
    return target
      ? without.map((r) => (r.emoji === emoji ? { ...r, byUserIds: [...r.byUserIds, me] } : r))
      : [...without, { emoji, byUserIds: [me], by: [] }];
  });
  const mine = myEmoji(optimistic, me);

  return (
    <div role="radiogroup" aria-label="Your reaction" className="flex flex-wrap gap-2">
      {REACTIONS.map(({ emoji, label }) => {
        const r = optimistic.find((x) => x.emoji === emoji);
        const names = r?.by.map((m) => m.relationship ?? m.name).join(", ");
        return (
          <button
            key={emoji}
            type="button"
            role="radio"
            aria-checked={mine === emoji}
            aria-label={`Send ${label}${names ? `. Already from ${names}` : ""}`}
            title={names}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                choose(emoji);
                const result = await onReact(checkinId, emoji);
                if (!result.ok) setError(result.error ?? "Couldn't react.");
              })
            }
            className={cn("flex min-h-11 items-center gap-1 rounded-full px-3 text-xl transition active:scale-90", mine === emoji ? "bg-role-family-soft ring-2 ring-role-family" : "bg-card ring-1 ring-border")}
          >
            {emoji}
            {r && <span className="text-sm font-bold tabular-nums">{r.byUserIds.length}</span>}
          </button>
        );
      })}
      {error && (
        <p role="alert" className="w-full text-sm font-bold text-alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Patient side: who reacted, with avatars ("Mom sent a hug"). */
export function ReactionList({ reactions }: { reactions: Reactions }) {
  const people = reactions.flatMap((r) => r.by.map((m) => ({ m, emoji: r.emoji })));
  if (people.length === 0) return null;
  return (
    <ul aria-label="Reactions" className="flex flex-col gap-2">
      {people.map(({ m, emoji }) => {
        const who = m.relationship === "Mom" || m.relationship === "Dad" ? m.relationship : m.name;
        const verb = REACTIONS.find((x) => x.emoji === emoji)?.verb ?? "reacted";
        return (
          <li key={m.id} className="flex animate-rise items-center gap-3 rounded-full bg-card py-1 pr-4 pl-1 ring-1 ring-border">
            <PersonaAvatar person={m} size="sm" decorative />
            <span className="font-bold">
              {who} {verb}
            </span>
            <span aria-hidden className="ml-auto text-2xl">
              {emoji}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
