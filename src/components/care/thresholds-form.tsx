"use client";

import { useState } from "react";
import { DEFAULT_THRESHOLDS, type Thresholds } from "@/lib/demo-fixtures";

const FIELDS: { key: keyof Thresholds; label: string; unit: string; min: number; max: number }[] = [
  { key: "lowMoodStreak", label: "Low moods in a row", unit: "check-ins", min: 1, max: 10 },
  { key: "noCheckinDays", label: "Days without check-in", unit: "days", min: 1, max: 14 },
  { key: "noFamilyContactDays", label: "Days without family contact", unit: "days", min: 1, max: 14 },
  { key: "nudgeCooldownMinutes", label: "Nudge cooldown", unit: "minutes", min: 1, max: 120 },
];

// Per-patient alert thresholds (or the defaults, on the Settings page). Saved for this visit only.
export function ThresholdsForm({ title = "Alert thresholds" }: { title?: string }) {
  const [values, setValues] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const [saved, setSaved] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(true);
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
                  setSaved(false);
                }}
                className="min-h-11 w-24 rounded-lg border bg-background px-3 tabular-nums"
              />
              <span className="text-sm text-muted-foreground">{f.unit}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" className="min-h-11 rounded-lg bg-role-care-ink px-4 font-bold text-white">
          Save
        </button>
        {saved && (
          <span aria-live="polite" className="text-sm font-bold text-success">
            Saved for this demo visit
          </span>
        )}
      </div>
    </form>
  );
}
