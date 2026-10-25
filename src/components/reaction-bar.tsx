"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setCheckinReaction } from "@/app/checkin-actions";
import { CloserIcon, REACTION_TONE } from "@/components/icons/closer-icon";
import { PersonaAvatar } from "@/components/kit/persona-avatar";
import { REACTIONS, type ReactionKey } from "@/lib/checkin";
import type { CheckInView } from "@/lib/data/checkins";
import { cn } from "@/lib/utils";

type Reactions = CheckInView["reactions"];

const myReaction = (reactions: Reactions, me: string) => reactions.find((r) => r.byUserIds.includes(me))?.kind ?? null;

// Family side: one reaction per person, tap another to change it, the same one to remove it.
// Optimistic, then confirmed by the server; a failure is shown under the buttons.
export function ReactionBar({ checkinId, reactions, me, onReact = setCheckinReaction }: {
  checkinId: string;
  reactions: Reactions;
  me: string;
  onReact?: (id: string, kind: ReactionKey) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [optimistic, choose] = useOptimistic(reactions, (state: Reactions, kind: ReactionKey) => {
    const current = myReaction(state, me);
    const without = state
      .map((r) => ({ ...r, byUserIds: r.byUserIds.filter((id) => id !== me), by: r.by.filter((m) => m.userId !== me) }))
      .filter((r) => r.byUserIds.length);
    if (current === kind) return without;
    const target = without.find((r) => r.kind === kind);
    return target
      ? without.map((r) => (r.kind === kind ? { ...r, byUserIds: [...r.byUserIds, me] } : r))
      : [...without, { kind, byUserIds: [me], by: [] }];
  });
  const mine = myReaction(optimistic, me);

  return (
    <div role="radiogroup" aria-label="Your reaction" className="flex flex-wrap gap-2">
      {REACTIONS.map(({ key, label }) => {
        const r = optimistic.find((x) => x.kind === key);
        const names = r?.by.map((m) => m.relationship ?? m.name).join(", ");
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={mine === key}
            aria-label={`Send ${label}${names ? `. Already from ${names}` : ""}`}
            title={names}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                choose(key);
                const result = await onReact(checkinId, key);
                if (!result.ok) setError(result.error ?? "Couldn't react.");
              })
            }
            className={cn(
              "flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full px-3 transition active:scale-90",
              mine === key ? "bg-role-family-soft ring-2 ring-role-family" : "bg-card ring-1 ring-border",
            )}
          >
            <CloserIcon name={key} className={cn("size-5", REACTION_TONE[key])} />
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
  const people = reactions.flatMap((r) => r.by.map((m) => ({ m, kind: r.kind })));
  if (people.length === 0) return null;
  return (
    <ul aria-label="Reactions" className="flex flex-col gap-2">
      {people.map(({ m, kind }) => {
        const who = m.relationship === "Mom" || m.relationship === "Dad" ? m.relationship : m.name;
        const verb = REACTIONS.find((x) => x.key === kind)?.verb ?? "reacted";
        return (
          <li key={m.id} className="flex animate-rise items-center gap-3 rounded-full bg-card py-1 pr-4 pl-1 ring-1 ring-border">
            <PersonaAvatar person={m} size="sm" decorative />
            <span className="font-bold">
              {who} {verb}
            </span>
            <CloserIcon name={kind} className={cn("ml-auto size-6", REACTION_TONE[kind])} />
          </li>
        );
      })}
    </ul>
  );
}
