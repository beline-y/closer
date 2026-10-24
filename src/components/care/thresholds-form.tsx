"use client";

import { useState, useTransition } from "react";
import { saveThresholds } from "@/app/nudge-actions";
import type { Thresholds } from "@/lib/nudges";

const FIELDS: { key: keyof Thresholds; label: string; unit: string; min: number; max: number }[] = [
  { key: "lowMoodStreak", label: "Low moods in a row", unit: "check-ins", min: 1, max: 14 },
  { key: "lowMoodThreshold", label: "A low mood is at or below", unit: "out of 5", min: 1, max: 4 },
  { key: "noCheckinDays", label: "Days without check-in", unit: "days", min: 1, max: 14 },
  { key: "noFamilyContactDays", label: "Days without family contact", unit: "days", min: 1, max: 14 },
  { key: "nudgeCooldownMinutes", label: "Nudge cooldown (per type)", unit: "minutes", min: 0, max: 240 },
];

// Per-patient thresholds, saved to patient_settings (RLS: this patient's care team only).
// Without a patientId (Settings page) it shows the defaults for new patients.
export function ThresholdsForm({ title = "Alert thresholds", patientId, initial }: { title?: string; patientId?: string; initial: Thresholds }) {
  const [values, setValues] = useState<Thresholds>(initial);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [saving, startSaving] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!patientId) {
          setStatus("saved");
          return;
        }
        startSaving(async () => {
          const result = await saveThresholds(patientId, values);
          setStatus(result.ok ? "saved" : "error");
        });
      }}
      className="flex flex-col gap-4 rounded-xl border bg-card p-4"
    >
      <h2 className="font-heading text-lg font-extrabold">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key} className="flex flex-col gap-1.5">
            <label htmlFor={f.key} className="text-sm font-bold">
              {f.label}
            </label>
            <div className="flex items-center gap-2">
              <input
                id={f.key}
                type="number"
                min={f.min}
                max={f.max}
                value={values[f.key]}
                onChange={(e) => {
                  setValues((v) => ({ ...v, [f.key]: Number(e.target.value) }));
                  setStatus("idle");
                }}
                className="min-h-11 w-24 rounded-lg border bg-background px-3 tabular-nums"
              />
              <span className="text-sm text-muted-foreground">{f.unit}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving} className="min-h-11 rounded-lg bg-role-care-ink px-4 font-bold text-white disabled:opacity-60">
          {saving ? "Saving…" : "Save"}
        </button>
        <span aria-live="polite" className="text-sm font-bold">
          {status === "saved" && <span className="text-success">{patientId ? "Saved. The cooldown applies right away." : "Saved for this demo visit (defaults arrive with the care dashboard)"}</span>}
          {status === "error" && <span className="text-alert">Couldn&apos;t save. Try again?</span>}
        </span>
      </div>
    </form>
  );
}
