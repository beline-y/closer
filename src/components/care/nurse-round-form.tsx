"use client";

import { HandHeart, Loader2, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { saveNurseRound } from "@/app/care-ai-actions";
import {
  AFFECTS,
  ENGAGEMENTS,
  INTAKES,
  NIGHT_SLEEPS,
  NURSE_NOTE_MAX,
  type NurseRoundInput,
  VISITORS,
  WARD_MEALS,
  type WardMenu,
} from "@/lib/nurse-round";
import { cn } from "@/lib/utils";

const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

const chip = (active: boolean) =>
  cn(
    "inline-flex min-h-11 items-center justify-center rounded-full border px-3.5 text-sm font-bold transition active:scale-95",
    active ? "border-transparent bg-role-care-ink text-white" : "bg-card hover:bg-muted",
  );

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-bold">
        {label}
        {hint && <span className="ml-1.5 font-normal text-muted-foreground">{hint}</span>}
      </legend>
      {children}
    </fieldset>
  );
}

/** Single choice: tapping the selected chip again clears it. */
function Choice<T extends string>({ options, value, onChange, label }: { options: readonly { value: T; label: string }[]; value: T | null; onChange: (v: T | null) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(value === o.value ? null : o.value)} className={chip(value === o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// The nurse's round for today, in under a minute. Every field is optional.
export function NurseRoundForm({ patientId, nickname, initial, menu, savedBy, claude }: { patientId: string; nickname: string; initial: NurseRoundInput; menu: WardMenu; savedBy: string | null; claude: boolean }) {
  const [round, setRound] = useState<NurseRoundInput>(initial);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const set = (patch: Partial<NurseRoundInput>) => {
    setRound((r) => ({ ...r, ...patch }));
    setDirty(true);
    setError(null);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startSaving(async () => {
          const result = await saveNurseRound(patientId, round);
          if (result.ok) setDirty(false);
          else setError(result.error);
        });
      }}
      aria-labelledby="round-title"
      className="flex flex-col gap-5 rounded-xl border bg-card p-5"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="round-title" className="font-heading text-lg font-extrabold">
          Today&apos;s round
        </h2>
        <span className="text-sm text-muted-foreground">{savedBy && !dirty ? `Saved by ${savedBy}` : "Takes under a minute"}</span>
      </header>

      <Field label="Meals" hint="from the ward's menu">
        <div className="flex flex-col gap-3">
          {WARD_MEALS.map((meal) => (
            <div key={meal.value} className="flex flex-col gap-2">
              <span className="text-sm">
                <span className="font-bold">{meal.label}</span>
                <span className="text-muted-foreground"> · {menu[meal.value] ?? "dish not set"}</span>
              </span>
              <Choice label={`${meal.label} eaten`} options={INTAKES} value={round[meal.value]} onChange={(v) => set(meal.value === "lunch" ? { lunch: v } : { dinner: v })} />
            </div>
          ))}
        </div>
      </Field>

      <Field label={`How did ${nickname} look?`} hint="pick any">
        <div className="flex flex-wrap gap-2">
          {AFFECTS.map((a) => (
            <button key={a.value} type="button" aria-pressed={round.affect.includes(a.value)} onClick={() => set({ affect: toggle(round.affect, a.value) })} className={chip(round.affect.includes(a.value))}>
              {a.label}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="During care">
          <Choice label="During care" options={ENGAGEMENTS} value={round.engagement} onChange={(v) => set({ engagement: v })} />
        </Field>
        <Field label="Last night">
          <Choice label="Last night" options={NIGHT_SLEEPS} value={round.nightSleep} onChange={(v) => set({ nightSleep: v })} />
        </Field>
      </div>

      <Field label="Pain score" hint="0 to 10">
        <div role="group" aria-label="Pain score" className="grid grid-cols-11 gap-1">
          {Array.from({ length: 11 }, (_, n) => (
            <button
              key={n}
              type="button"
              aria-pressed={round.pain === n}
              onClick={() => set({ pain: round.pain === n ? null : n })}
              className={cn("min-h-11 rounded-lg border text-sm font-bold tabular-nums transition active:scale-95", round.pain === n ? "border-transparent bg-role-care-ink text-white" : "bg-card hover:bg-muted")}
            >
              {n}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Visitors today">
        <div className="flex flex-wrap gap-2">
          {VISITORS.map((v) => (
            <button key={v.value} type="button" aria-pressed={round.visits.includes(v.value)} onClick={() => set({ visits: toggle(round.visits, v.value) })} className={chip(round.visits.includes(v.value))}>
              {v.label}
            </button>
          ))}
        </div>
      </Field>

      <div className="flex flex-col gap-2">
        <label className="flex min-h-11 items-center gap-3 font-bold">
          <input type="checkbox" checked={round.refusedCare} onChange={(e) => set({ refusedCare: e.target.checked })} className="size-5 accent-role-care-ink" />
          Refused care or treatment
        </label>
        <label className={cn("flex min-h-12 items-center gap-3 rounded-lg border px-3 font-bold transition", round.asksPsychologist ? "border-alert/50 bg-alert-soft text-alert" : "hover:bg-muted")}>
          <input type="checkbox" checked={round.asksPsychologist} onChange={(e) => set({ asksPsychologist: e.target.checked })} className="size-5 accent-alert" />
          <HandHeart className="size-5" aria-hidden />
          I&apos;d like the psychologist to see {nickname}
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="round-note" className="text-sm font-bold">
          What you noticed <span className="font-normal text-muted-foreground">words {nickname} said, behavior</span>
        </label>
        <textarea
          id="round-note"
          rows={3}
          maxLength={NURSE_NOTE_MAX}
          value={round.note}
          onChange={(e) => set({ note: e.target.value })}
          className="rounded-lg border bg-background px-3 py-2"
          placeholder={`e.g. ${nickname} stayed in bed all morning, didn't want to play`}
        />
        <span className="self-end text-xs text-muted-foreground tabular-nums">
          {round.note.length}/{NURSE_NOTE_MAX}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving || !dirty} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-role-care-ink px-5 font-bold text-white transition disabled:opacity-50">
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
          {saving ? "Updating the summary…" : "Save round"}
        </button>
        <span aria-live="polite" className={cn("text-sm", error ? "font-bold text-alert" : "text-muted-foreground")}>
          {error ?? (saving ? (claude ? "Claude is reading the round" : null) : !dirty && savedBy ? "The summary includes this round" : null)}
        </span>
      </div>
    </form>
  );
}
