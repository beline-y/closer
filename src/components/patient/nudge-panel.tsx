"use client";

import { useEffect, useState, useTransition } from "react";
import { sendNudge } from "@/app/nudge-actions";
import { BigActionButton } from "@/components/kit/big-action-button";
import { Modal } from "@/components/kit/modal";
import { PersonaAvatar } from "@/components/kit/persona-avatar";
import type { CastMember } from "@/lib/cast";
import { NUDGE_KINDS, type NudgeKind } from "@/lib/nudges";
import { cn } from "@/lib/utils";

type Props = {
  circle: CastMember[];
  cooldownMinutes: number;
  lastSent: Partial<Record<NudgeKind, string>>;
  serverNow: string;
};

// Five big nudge buttons -> pick who -> "Sent! ❤️". Each type then rests for the
// cooldown set by the care team (enforced by the database, shown here as a ring).
export function NudgePanel({ circle, cooldownMinutes, lastSent, serverNow }: Props) {
  const cooldownMs = cooldownMinutes * 60_000;
  // Device clocks can be off: count from the server's "now".
  const [skew] = useState(() => Date.parse(serverNow) - Date.now());
  const [now, setNow] = useState(() => Date.parse(serverNow));
  const [justSent, setJustSent] = useState<Partial<Record<NudgeKind, number>>>({});
  const [picking, setPicking] = useState<NudgeKind | null>(null);
  const [to, setTo] = useState<string[]>(circle.map((m) => m.userId!));
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();

  const sentAt = (k: NudgeKind) => Math.max(justSent[k] ?? 0, lastSent[k] ? Date.parse(lastSent[k]!) : 0);
  const left = (k: NudgeKind) => Math.max(0, cooldownMs - (now - sentAt(k)));
  const anyCooling = NUDGE_KINDS.some((k) => left(k.kind) > 0);

  useEffect(() => {
    if (!anyCooling) return;
    const id = setInterval(() => setNow(Date.now() + skew), 1000);
    return () => clearInterval(id);
  }, [anyCooling, skew]);

  const kind = NUDGE_KINDS.find((k) => k.kind === picking);

  function send() {
    if (!picking) return;
    setError(null);
    startSending(async () => {
      const result = await sendNudge(picking, to);
      if (result.ok) {
        setJustSent((s) => ({ ...s, [picking]: Date.now() + skew }));
        setSent(true);
      } else if (result.availableAt) {
        // Already sent recently (another device?): still a happy ending for the child.
        setJustSent((s) => ({ ...s, [picking]: Date.parse(result.availableAt!) - cooldownMs }));
        setSent(true);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {NUDGE_KINDS.map((k) => {
          const ms = left(k.kind);
          return (
            <BigActionButton
              key={k.kind}
              emoji={k.emoji}
              label={k.label}
              cooldown={cooldownMs ? ms / cooldownMs : 0}
              disabled={ms > 0 || circle.length === 0}
              hint={ms > 0 ? `Sent! Again in ${Math.ceil(ms / 60_000)} min` : undefined}
              onClick={() => {
                setSent(false);
                setError(null);
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
              {circle.map((m) => {
                const on = to.includes(m.userId!);
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => setTo((t) => (on ? t.filter((id) => id !== m.userId) : [...t, m.userId!]))}
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
            {error && (
              <p role="alert" className="rounded-2xl bg-alert-soft px-4 py-3 font-bold text-alert">
                {error}
              </p>
            )}
            <button
              type="button"
              disabled={to.length === 0 || sending}
              onClick={send}
              className="min-h-14 rounded-2xl bg-role-patient text-xl font-extrabold shadow-sm transition active:scale-[0.98] disabled:opacity-50"
            >
              {sending ? "Sending…" : `Send ${kind?.emoji ?? ""}`}
            </button>
          </div>
        )}
      </Modal>
    </>
  );
}
