import { Lock } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyState } from "@/components/kit/empty-state";
import { JournalBox } from "@/components/patient/journal-box";
import { ShareKeptButtons } from "@/components/patient/kept-item";
import { ACTIVITY_TYPES } from "@/lib/activities";
import { getResults } from "@/lib/data/activities";
import { getCheckins, getMyPatient, getStreak } from "@/lib/data/checkins";
import { relativeDay, todayIn } from "@/lib/dates";
import { JOURNAL_ENTRIES } from "@/lib/demo-fixtures";
import { getMood } from "@/lib/mood";
import { MILESTONES } from "@/lib/streak";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Me · Closer" };

// Leo's private space. Nothing here reaches family, care team or volunteers unless he
// shares an item (enforced by RLS: private results are readable by the patient only).
export default function PatientMePage() {
  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-extrabold">Me 🦖</h1>
        <p className="flex items-center gap-2 rounded-2xl bg-muted px-4 py-3 text-lg font-bold">
          <Lock className="size-5 shrink-0" aria-hidden /> Only you can see this, unless you share it.
        </p>
      </header>
      <Suspense fallback={<div className="min-h-64" />}>
        <MySpace />
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

async function MySpace() {
  const patient = await getMyPatient();
  if (!patient) return null;
  const [streak, checkins, results] = await Promise.all([
    getStreak(patient.id, patient.timezone),
    getCheckins(patient.id, patient.timezone, { days: 35 }),
    getResults(patient.id, patient.timezone, { days: 90 }),
  ]);
  const kept = results.filter((r) => r.status === "completed" && r.visibility === "private" && !r.inMemories);

  // Calendar: 5 weeks ending this week, Monday first.
  const today = todayIn(patient.timezone);
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const days = Array.from({ length: 35 }, (_, i) => 34 - i - (6 - weekday)).map((daysAgo) => ({ daysAgo, checkin: checkins.find((c) => c.daysAgo === daysAgo) }));
  const label = (daysAgo: number) => new Date(Date.parse(`${today}T12:00:00Z`) - daysAgo * 86_400_000).toLocaleDateString("en-US", { day: "numeric", timeZone: "UTC" });

  return (
    <>
      <section aria-labelledby="badges-title" className="flex flex-col gap-3 rounded-3xl bg-role-patient-soft p-5">
        <h2 id="badges-title" className="text-2xl font-extrabold">
          🔥 Connected for {streak.totalDays} {streak.totalDays === 1 ? "day" : "days"}
        </h2>
        {streak.streakDays > 1 && <p className="text-lg">{streak.streakDays} days in a row{streak.restDays ? " (rest days count too)" : ""}!</p>}
        <ul aria-label="My badges" className="flex flex-wrap gap-3">
          {MILESTONES.map((m) => {
            const earned = streak.totalDays >= m.days;
            return (
              <li key={m.days} className={cn("flex flex-col items-center gap-1 rounded-2xl bg-card p-3 text-center", !earned && "opacity-50 grayscale")}>
                <span aria-hidden className="text-4xl">
                  {m.emoji}
                </span>
                <span className="text-sm font-bold">{m.name}</span>
                <span className="text-xs text-muted-foreground">{earned ? "Earned!" : `${m.days} days`}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="moods-title" className="flex flex-col gap-3">
        <h2 id="moods-title" className="text-2xl font-extrabold">
          My moods 🌈
        </h2>
        <div className="rounded-3xl bg-card p-4 shadow-sm ring-1 ring-border">
          <div aria-hidden className="mb-2 grid grid-cols-7 gap-1.5 text-center text-sm font-bold text-muted-foreground">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <ol className="grid grid-cols-7 gap-1.5">
            {days.map(({ daysAgo, checkin }) => {
              const mood = checkin ? getMood(checkin.mood) : null;
              return (
                <li
                  key={daysAgo}
                  aria-label={daysAgo < 0 ? undefined : `${relativeDay(daysAgo)}: ${mood ? mood.label : "no mood shared"}`}
                  aria-hidden={daysAgo < 0 || undefined}
                  className={cn(
                    "flex aspect-square flex-col items-center justify-center rounded-xl text-xs",
                    daysAgo < 0 ? "opacity-0" : mood ? "bg-role-patient-soft" : "bg-muted/60",
                    daysAgo === 0 && "ring-2 ring-role-patient-ink",
                  )}
                >
                  <span aria-hidden className="text-2xl leading-none sm:text-3xl">
                    {mood ? mood.emoji : "·"}
                  </span>
                  <span aria-hidden className="text-muted-foreground">
                    {daysAgo >= 0 ? label(daysAgo) : ""}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section aria-labelledby="kept-title" className="flex flex-col gap-3">
        <h2 id="kept-title" className="text-2xl font-extrabold">
          Kept for myself 🔒
        </h2>
        {kept.length === 0 ? (
          <EmptyState emoji="🗝️" title="Nothing kept here yet">
            When you finish an activity and choose &quot;Keep it for myself&quot;, it waits for you here.
          </EmptyState>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {kept.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 overflow-hidden rounded-3xl bg-card shadow-sm ring-1 ring-border">
                {r.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- signed URL from a private bucket
                  <img src={r.imageUrl} alt={r.activity.theme ?? r.activity.title} className="max-h-72 w-full bg-muted object-contain" loading="lazy" />
                )}
                <div className="flex flex-col gap-2 px-4 pb-4 first:pt-4">
                  <p className="font-bold">
                    {r.activity.emoji} {r.activity.title}
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      {ACTIVITY_TYPES[r.activity.type].label} · {relativeDay(r.daysAgo)}
                    </span>
                  </p>
                  {r.score !== null && <p className="text-2xl font-extrabold">{"⭐".repeat(r.score)} {r.score} / {r.scoreTotal}</p>}
                  {r.text && r.score === null && <p className="line-clamp-6 text-lg whitespace-pre-wrap">{r.text}</p>}
                  <ShareKeptButtons sessionId={r.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
