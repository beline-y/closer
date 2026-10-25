import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHero } from "@/components/kit/page-hero";
import { ACTIVITY_TYPES, type ActivityType } from "@/lib/activities";
import { getActivities, getUnfinished } from "@/lib/data/activities";
import { getMyPatient } from "@/lib/data/checkins";
import { relativeDay, todayIn } from "@/lib/dates";
import { HUES } from "@/lib/hues";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Play · Closer" };

const ORDER: ActivityType[] = ["draw", "make_snap", "quiz", "story", "challenge"];
const who = (m: { relationship?: string; name: string } | null) => (!m ? "your partner" : m.relationship === "Mom" || m.relationship === "Dad" ? m.relationship : m.name);

// Play: today's theme, what Leo can continue, and the library by type.
// Results aren't kept here: after an activity Leo shares it, adds it to Memories or keeps it in Me.
export default function PatientPlayPage() {
  return (
    <>
      <PageHero emoji="🎨" title="Play" hue="mint" listen="Play. Draw, make, play and imagine.">
        Draw, make, play and imagine.
      </PageHero>
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
        <Link href={`/patient/activities/${theme.id}`} className="hue-sun pressable flex items-center gap-5 rounded-3xl bg-hue-soft p-5 ring-2 ring-hue">
          <span aria-hidden className="flex size-24 shrink-0 -rotate-3 items-center justify-center rounded-3xl bg-card text-6xl shadow-sm">
            {theme.emoji}
          </span>
          <span className="flex flex-col gap-1">
            <span className="font-bold text-hue-ink">✨ Today&apos;s theme</span>
            <span className="font-heading text-2xl font-extrabold sm:text-3xl">{theme.theme ?? theme.title}</span>
            <span className="self-start rounded-full bg-hue px-4 py-1 text-lg font-extrabold">Start drawing ▶</span>
          </span>
        </Link>
      )}

      {unfinished.length > 0 && (
        <section aria-labelledby="continue-title" className="flex flex-col gap-3">
          <h2 id="continue-title" className="text-2xl font-extrabold">
            Continue <span aria-hidden>⏯️</span>
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {unfinished.map((u) => (
              <li key={u.id} className={HUES[ACTIVITY_TYPES[u.activity.type].hue]}>
                {u.status === "waiting_partner" ? (
                  <div className="flex min-h-20 items-center gap-4 rounded-3xl bg-card p-4 ring-2 ring-hue">
                    <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-hue-soft text-4xl">
                      {u.activity.emoji}
                    </span>
                    <span className="flex flex-col">
                      <span className="font-bold">{u.activity.title}</span>
                      <span className="text-muted-foreground">🔒 Waiting for {who(u.partner)}. You&apos;ll see both drawings soon!</span>
                    </span>
                  </div>
                ) : (
                  <Link href={`/patient/activities/${u.activity.id}?session=${u.id}`} className="pressable flex min-h-20 items-center gap-4 rounded-3xl bg-card p-4 ring-2 ring-hue">
                    <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-hue-soft text-4xl">
                      {u.activity.emoji}
                    </span>
                    <span className="flex flex-col">
                      <span className="font-bold">{u.activity.title}</span>
                      <span className="text-muted-foreground">
                        {u.draft ? "Your draft is saved" : "Started"} · {relativeDay(u.daysAgo).toLowerCase()}
                      </span>
                      <span className="font-extrabold text-hue-ink">Continue ▶</span>
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
          <section key={type} aria-labelledby={`type-${type}`} className={cn("flex flex-col gap-3", HUES[ACTIVITY_TYPES[type].hue])}>
            <h2 id={`type-${type}`} className="flex items-center gap-2 text-2xl font-extrabold">
              <span aria-hidden className="flex size-11 items-center justify-center rounded-2xl bg-hue-soft text-2xl">
                {ACTIVITY_TYPES[type].emoji}
              </span>
              {ACTIVITY_TYPES[type].label}
            </h2>
            {/* Scrolls sideways; the bottom padding leaves room for the pressable edge. */}
            <ul className="-mx-4 flex gap-4 overflow-x-auto px-4 pt-1 pb-3">
              {list.map((a) => (
                <li key={a.id} className="w-44 shrink-0">
                  <Link href={`/patient/activities/${a.id}`} className="pressable flex h-full flex-col gap-2 rounded-3xl bg-hue-soft p-4">
                    <span aria-hidden className="flex size-16 items-center justify-center rounded-2xl bg-card text-4xl shadow-sm">
                      {a.emoji}
                    </span>
                    <span className="text-lg leading-snug font-bold">{a.title}</span>
                    <span className="mt-auto flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">{a.minutes} min</span>
                      <span className="rounded-full bg-card px-3 py-1 font-extrabold text-hue-ink">Start ▶</span>
                    </span>
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
