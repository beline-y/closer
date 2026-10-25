import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ResultCard } from "@/components/activities/result-card";
import { EmptyState } from "@/components/kit/empty-state";
import { LiveRefresh } from "@/components/live-refresh";
import { JournalBox } from "@/components/patient/journal-box";
import { ACTIVITY_TYPES, type ActivityType } from "@/lib/activities";
import { getActivities, getResults } from "@/lib/data/activities";
import { getMyPatient } from "@/lib/data/checkins";
import { relativeDay } from "@/lib/dates";
import { JOURNAL_ENTRIES } from "@/lib/demo-fixtures";

export const metadata: Metadata = { title: "Me · Closer" };

export default function PatientMePage() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-4xl font-extrabold">Me 🦖</h1>
        <p className="text-xl text-muted-foreground">Things to do, your creations and your journal.</p>
      </header>

      <Suspense fallback={<div className="min-h-64" />}>
        <Library />
      </Suspense>

      <Suspense fallback={<div className="min-h-64" />}>
        <Creations />
      </Suspense>

      <section aria-labelledby="journal-title" className="flex flex-col gap-4">
        <h2 id="journal-title" className="text-2xl font-extrabold">
          My journal 📓
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <JournalBox />
          <ul className="flex flex-col gap-3">
            {JOURNAL_ENTRIES.map((e, i) => (
              <li key={i} className="flex gap-3 rounded-3xl bg-card p-4 shadow-sm ring-1 ring-border">
                <span aria-hidden className="text-3xl">
                  {e.emoji}
                </span>
                <div className="flex flex-col gap-1">
                  <p className="text-lg">{e.body}</p>
                  <p className="text-sm text-muted-foreground">
                    {relativeDay(e.daysAgo)} · {e.sharedWithCare ? "👀 Shared with Sarah" : "🔒 Only you"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}

const ORDER: ActivityType[] = ["draw", "make_snap", "quiz", "story", "challenge"];

async function Library() {
  const activities = await getActivities();
  return (
    <section aria-labelledby="todo-title" className="flex flex-col gap-4">
      <h2 id="todo-title" className="text-2xl font-extrabold">
        Things to do 🎨
      </h2>
      {ORDER.map((type) => {
        const list = activities.filter((a) => a.type === type);
        if (!list.length) return null;
        return (
          <div key={type} className="flex flex-col gap-2">
            <h3 className="text-lg font-extrabold">
              {ACTIVITY_TYPES[type].emoji} {ACTIVITY_TYPES[type].label}
            </h3>
            <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
              {list.map((a) => (
                <li key={a.id} className="w-44 shrink-0">
                  <Link href={`/patient/activities/${a.id}`} className="flex h-full flex-col gap-2 rounded-3xl bg-card p-4 shadow-sm ring-1 ring-border transition hover:-translate-y-0.5">
                    <span aria-hidden className="flex size-14 items-center justify-center rounded-2xl bg-role-patient-soft text-3xl">
                      {a.emoji}
                    </span>
                    <span className="font-bold">{a.title}</span>
                    <span className="mt-auto text-sm text-muted-foreground">{a.minutes} min · Start ▶</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

// Leo's results, with the family's reactions and comments, live.
async function Creations() {
  const patient = await getMyPatient();
  if (!patient) return null;
  const results = await getResults(patient.id, patient.timezone, { days: 30 });
  return (
    <section aria-labelledby="creations-title" className="flex flex-col gap-4">
      <LiveRefresh
        channel={`patient-creations-${patient.id}`}
        watch={[
          { table: "activity_sessions", filter: `patient_id=eq.${patient.id}` },
          { table: "activity_reactions" },
          { table: "activity_comments" },
          { table: "challenge_entries" },
        ]}
      />
      <h2 id="creations-title" className="text-2xl font-extrabold">
        My creations ✨
      </h2>
      {results.length === 0 ? (
        <EmptyState emoji="🖍️" title="Nothing here yet">
          Start an activity above. What you make will be here.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {results.map((r) => (
            <li key={r.id}>
              <ResultCard result={r} viewer="patient" me={patient.id} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
