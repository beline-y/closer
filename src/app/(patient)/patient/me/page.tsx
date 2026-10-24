import type { Metadata } from "next";
import { JournalBox } from "@/components/patient/journal-box";
import { relativeDay } from "@/lib/dates";
import { ACTIVITIES, JOURNAL_ENTRIES } from "@/lib/demo-fixtures";

export const metadata: Metadata = { title: "Me · Closer" };

export default function PatientMePage() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-4xl font-extrabold">Me 🦖</h1>
        <p className="text-xl text-muted-foreground">Your journal and things to do.</p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <section aria-labelledby="journal-title" className="flex flex-col gap-4">
          <h2 id="journal-title" className="text-2xl font-extrabold">
            My journal 📓
          </h2>
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
        </section>

        <section aria-labelledby="activities-title" className="flex flex-col gap-4">
          <h2 id="activities-title" className="text-2xl font-extrabold">
            Things to do 🎨
          </h2>
          <ul className="grid gap-3">
            {ACTIVITIES.map((a) => (
              <li key={a.title} className="flex min-h-20 items-center gap-4 rounded-3xl bg-card p-4 shadow-sm ring-1 ring-border">
                <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-role-patient-soft text-3xl">
                  {a.emoji}
                </span>
                <div className="flex flex-col">
                  <span className="text-lg font-bold">{a.title}</span>
                  <span className="text-muted-foreground">About {a.minutes} minutes</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
