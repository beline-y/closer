"use client";

import { useEffect, useState } from "react";
import { BigActionButton } from "@/components/kit/big-action-button";
import { Modal } from "@/components/kit/modal";
import { PersonaAvatar } from "@/components/kit/persona-avatar";
import { type CastId, LEO_CIRCLE } from "@/lib/cast";
import { DEFAULT_THRESHOLDS, NUDGE_KINDS, type NudgeKind } from "@/lib/demo-fixtures";
import { cn } from "@/lib/utils";

const COOLDOWN_MS = DEFAULT_THRESHOLDS.nudgeCooldownMinutes * 60_000;

// Five big nudge buttons -> pick who -> "Sent! ❤️". Each type then rests for 10 minutes.
// Saved for this visit only until the nudges feature lands.
export function NudgePanel() {
  const [sentAt, setSentAt] = useState<Partial<Record<NudgeKind, number>>>({});
  const [now, setNow] = useState(0);
  const [picking, setPicking] = useState<NudgeKind | null>(null);
  const [to, setTo] = useState<CastId[]>(LEO_CIRCLE.map((m) => m.id));
  const [sent, setSent] = useState(false);

  const coolingDown = Object.values(sentAt).some((t) => t && now - t < COOLDOWN_MS);
  useEffect(() => {
    if (!coolingDown) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [coolingDown]);

  const kind = NUDGE_KINDS.find((k) => k.kind === picking);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {NUDGE_KINDS.map((k) => {
          const left = sentAt[k.kind] ? Math.max(0, COOLDOWN_MS - (now - sentAt[k.kind]!)) : 0;
          const minutes = Math.ceil(left / 60_000);
          return (
            <BigActionButton
              key={k.kind}
              emoji={k.emoji}
              label={k.label}
              cooldown={left / COOLDOWN_MS}
              disabled={left > 0}
              hint={left > 0 ? `Sent! Again in ${minutes} min` : undefined}
              onClick={() => {
                setSent(false);
                setPicking(k.kind);
              }}
            />
          );
        })}
      </div>

      <Modal open={picking !== null} onClose={() => setPicking(null)} title={sent ? "Sent! ❤️" : `${kind?.emoji ?? ""} ${kind?.label ?? ""}`}>
        {sent ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span aria-hidden className="animate-heart text-8xl">
              ❤️
            </span>
            <p className="text-xl font-bold">Your people got it.</p>
            <button type="button" onClick={() => setPicking(null)} className="min-h-14 w-full rounded-2xl bg-role-patient text-lg font-extrabold">
              Yay!
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <p className="text-lg">Who should get it?</p>
            <ul className="flex flex-wrap gap-3">
              {LEO_CIRCLE.map((m) => {
                const on = to.includes(m.id);
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => setTo((t) => (on ? t.filter((id) => id !== m.id) : [...t, m.id]))}
                      className={cn(
                        "flex min-h-14 flex-col items-center gap-1 rounded-2xl border-2 px-4 py-2 font-bold transition",
                        on ? "border-role-patient bg-role-patient-soft" : "border-transparent bg-muted opacity-70",
                      )}
                    >
                      <PersonaAvatar person={m} size="lg" decorative />
                      {m.relationship === "Mom" || m.relationship === "Dad" ? m.relationship : m.name}
                      <span aria-hidden>{on ? "✅" : "➕"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              disabled={to.length === 0}
              onClick={() => {
                const t = Date.now();
                setSentAt((s) => ({ ...s, [picking!]: t }));
                setNow(t);
                setSent(true);
              }}
              className="min-h-14 rounded-2xl bg-role-patient text-xl font-extrabold shadow-sm transition active:scale-[0.98] disabled:opacity-50"
            >
              Send {kind?.emoji}
            </button>
          </div>
        )}
      </Modal>
    </>
  );
}
