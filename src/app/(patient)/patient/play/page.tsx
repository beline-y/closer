import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ACTIVITY_TYPES, type ActivityType } from "@/lib/activities";
import { getActivities, getUnfinished } from "@/lib/data/activities";
import { getMyPatient } from "@/lib/data/checkins";
import { relativeDay, todayIn } from "@/lib/dates";

export const metadata: Metadata = { title: "Play · Closer" };

const ORDER: ActivityType[] = ["draw", "make_snap", "quiz", "story", "challenge"];
const who = (m: { relationship?: string; name: string } | null) => (!m ? "your partner" : m.relationship === "Mom" || m.relationship === "Dad" ? m.relationship : m.name);

// Play: today's theme, what Leo can continue, and the library by type.
// Results aren't kept here: after an activity Leo shares it, adds it to Memories or keeps it in Me.
export default function PatientPlayPage() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-4xl font-extrabold">Play 🎨</h1>
        <p className="text-xl text-muted-foreground">Draw, make, play and imagine.</p>
      </header>
      <Suspense fallback={<div className="min-h-96" />}>
        <Play />
      </Suspense>
    </>
  );
}

async function Play() {
  const [patient, activities] = await Promise.all([getMyPatient(), getActivities()]);
  if (!patient) return null;
  const unfinished = await getUnfinished(patient.id, patient.timezone);
  // Today's theme: one drawing a day, the same for everyone that day.
  const draws = activities.filter((a) => a.type === "draw");
  const theme = draws.length ? draws[Math.floor(Date.parse(todayIn(patient.timezone)) / 86_400_000) % draws.length] : null;

  return (
    <>
      {theme && (
        <Link href={`/patient/activities/${theme.id}`} className="flex items-center gap-5 rounded-3xl bg-role-patient-soft p-5 shadow-sm ring-1 ring-border transition hover:-translate-y-0.5">
          <span aria-hidden className="text-7xl">
            {theme.emoji}
          </span>
          <span className="flex flex-col gap-1">
            <span className="font-bold text-role-patient-ink">✨ Today&apos;s theme</span>
            <span className="font-heading text-3xl font-extrabold">{theme.theme ?? theme.title}</span>
            <span className="text-lg">Start drawing ▶</span>
          </span>
        </Link>
      )}

      {unfinished.length > 0 && (
        <section aria-labelledby="continue-title" className="flex flex-col gap-3">
          <h2 id="continue-title" className="text-2xl font-extrabold">
            Continue
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {unfinished.map((u) => (
              <li key={u.id}>
                {u.status === "waiting_partner" ? (
                  <div className="flex min-h-20 items-center gap-4 rounded-3xl bg-card p-4 ring-1 ring-border">
                    <span aria-hidden className="text-4xl">
                      {u.activity.emoji}
                    </span>
                    <span className="flex flex-col">
                      <span className="font-bold">{u.activity.title}</span>
                      <span className="text-muted-foreground">🔒 Waiting for {who(u.partner)}. You&apos;ll see both drawings soon!</span>
                    </span>
                  </div>
                ) : (
                  <Link href={`/patient/activities/${u.activity.id}?session=${u.id}`} className="flex min-h-20 items-center gap-4 rounded-3xl bg-card p-4 shadow-sm ring-1 ring-border transition hover:-translate-y-0.5">
                    <span aria-hidden className="text-4xl">
                      {u.activity.emoji}
                    </span>
                    <span className="flex flex-col">
                      <span className="font-bold">{u.activity.title}</span>
                      <span className="text-muted-foreground">
                        {u.draft ? "Your draft is saved" : "Started"} · {relativeDay(u.daysAgo).toLowerCase()} · Continue ▶
                      </span>
                    </span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {ORDER.map((type) => {
        const list = activities.filter((a) => a.type === type);
        if (!list.length) return null;
        return (
          <section key={type} aria-labelledby={`type-${type}`} className="flex flex-col gap-2">
            <h2 id={`type-${type}`} className="text-xl font-extrabold">
              {ACTIVITY_TYPES[type].emoji} {ACTIVITY_TYPES[type].label}
            </h2>
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
          </section>
        );
      })}
    </>
  );
}
