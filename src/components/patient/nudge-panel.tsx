"use client";

import { useEffect, useState, useTransition } from "react";
import { sendNudge } from "@/app/nudge-actions";
import { CloserIcon } from "@/components/icons/closer-icon";
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

const RING_R = 30;
const RING_C = 2 * Math.PI * RING_R;

function timeLeft(ms: number) {
  const s = Math.ceil(ms / 1000);
  return s >= 60 ? `${Math.ceil(s / 60)} min` : `${s} s`;
}

// Five round nudge buttons in one row -> pick who -> "Sent!". Each type then rests for the
// cooldown set by the care team (enforced by the database): a ring fills back around the
// icon, with the time left under it.
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
      <ul aria-label="Send a nudge" className="grid grid-cols-5 gap-1">
        {NUDGE_KINDS.map((k) => {
          const ms = left(k.kind);
          const cooling = ms > 0;
          // The ring fills back up as the cooldown runs out.
          const filled = cooling && cooldownMs ? 1 - ms / cooldownMs : 1;
          return (
            <li key={k.kind} className="flex flex-col items-center gap-1">
              <button
                type="button"
                aria-label={cooling ? `${k.label}. Sent! Again in ${timeLeft(ms)}` : k.label}
                disabled={cooling || circle.length === 0}
                onClick={() => {
                  setSent(false);
                  setError(null);
                  setPicking(k.kind);
                }}
                className="relative flex size-16 items-center justify-center rounded-full transition active:scale-90 disabled:cursor-not-allowed"
              >
                <svg aria-hidden viewBox="0 0 64 64" className="absolute inset-0 size-full -rotate-90">
                  <circle cx="32" cy="32" r={RING_R} fill="none" strokeWidth="3" className="stroke-border" />
                  {cooling && (
                    <circle
                      cx="32"
                      cy="32"
                      r={RING_R}
                      fill="none"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={RING_C}
                      strokeDashoffset={RING_C * (1 - filled)}
                      className="stroke-role-patient-ink transition-[stroke-dashoffset] duration-1000 ease-linear"
                    />
                  )}
                </svg>
                <span
                  className={cn(
                    "flex size-14 items-center justify-center rounded-full",
                    cooling ? "bg-muted text-muted-foreground" : "bg-role-patient-soft text-role-patient-ink shadow-sm",
                  )}
                >
                  <CloserIcon name={k.icon} className="size-7" />
                </span>
              </button>
              <span className="text-center text-sm leading-tight font-bold">{k.short}</span>
              {cooling && (
                <span aria-hidden className="text-xs text-muted-foreground tabular-nums">
                  {timeLeft(ms)}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <Modal
        open={picking !== null}
        onClose={() => setPicking(null)}
        title={sent ? "Sent!" : (kind?.label ?? "")}
      >
        {sent ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CloserIcon name="heart" className="size-24 animate-heart text-role-family" strokeWidth={1.5} />
            <p className="text-xl font-bold">Your people got it.</p>
            <button type="button" onClick={() => setPicking(null)} className="min-h-14 w-full rounded-2xl bg-role-patient text-lg font-extrabold">
              Yay!
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <p className="flex items-center gap-2 text-lg">
              {kind && <CloserIcon name={kind.icon} className="size-6 text-role-patient-ink" />} Who should get it?
            </p>
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
                      <CloserIcon name={on ? "check" : "plus"} className={on ? "text-success" : "text-muted-foreground"} />
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
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        )}
      </Modal>
    </>
  );
}
