"use client";

import Link from "next/link";
import { useState } from "react";
import { EmptyState } from "@/components/kit/empty-state";
import { PersonaAvatar } from "@/components/kit/persona-avatar";
import { castByPatientId } from "@/lib/cast";
import { relativeDay } from "@/lib/dates";
import { ALERT_LABELS, CARE_ALERTS } from "@/lib/demo-fixtures";

// Triggered alerts with "Mark as reviewed". Saved for this visit only.
export function AlertsList() {
  const [reviewed, setReviewed] = useState<string[]>([]);
  const open = CARE_ALERTS.filter((a) => !reviewed.includes(a.id));
  const done = CARE_ALERTS.filter((a) => reviewed.includes(a.id));

  const row = (a: (typeof CARE_ALERTS)[number], isOpen: boolean) => {
    const patient = castByPatientId(a.patientId);
    return (
      <li key={a.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {patient && <PersonaAvatar person={patient} size="sm" decorative />}
          <div className="flex flex-col">
            <span className="font-bold">
              <Link href={`/care/patients/${a.patientId}`} className="hover:underline">
                {patient?.name}
              </Link>{" "}
              · <span className={isOpen ? "text-alert" : ""}>{isOpen ? "⚠ " : "✓ "}{ALERT_LABELS[a.kind]}</span>
            </span>
            <span className="text-sm text-muted-foreground">
              {a.detail} · {relativeDay(a.daysAgo)}
            </span>
          </div>
        </div>
        {isOpen ? (
          <button type="button" onClick={() => setReviewed((r) => [...r, a.id])} className="min-h-11 shrink-0 rounded-lg bg-role-care-ink px-4 font-bold text-white">
            Mark as reviewed
          </button>
        ) : (
          <button type="button" onClick={() => setReviewed((r) => r.filter((id) => id !== a.id))} className="min-h-11 shrink-0 rounded-lg px-4 font-bold text-muted-foreground hover:bg-muted">
            Undo
          </button>
        )}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="open-title" className="flex flex-col gap-3">
        <h2 id="open-title" className="font-heading text-lg font-extrabold">
          To review ({open.length})
        </h2>
        {open.length === 0 ? (
          <EmptyState emoji="🌤️" title="All clear">
            No alert to review. New ones appear here as soon as a threshold is crossed.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">{open.map((a) => row(a, true))}</ul>
        )}
      </section>
      {done.length > 0 && (
        <section aria-labelledby="done-title" className="flex flex-col gap-3">
          <h2 id="done-title" className="font-heading text-lg font-extrabold">
            Reviewed
          </h2>
          <ul className="flex flex-col gap-2">{done.map((a) => row(a, false))}</ul>
        </section>
      )}
    </div>
  );
}
