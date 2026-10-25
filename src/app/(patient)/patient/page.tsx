import type { Metadata } from "next";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { WellbeingPanel } from "@/components/wellbeing/dashboard";
import { CheckInCard } from "@/components/checkin-card";
import { CloserIcon } from "@/components/icons/closer-icon";
import { MemoryThumb } from "@/components/kit/memory-thumb";
import { LiveRefresh } from "@/components/live-refresh";
import { StoriesRow } from "@/components/patient/stories";
import { ACTIVITY_TYPES } from "@/lib/activities";
import { CAST } from "@/lib/cast";
import { getCheckins, getMyPatient, getStreak } from "@/lib/data/checkins";
import { getStories } from "@/lib/data/stories";
import { relativeDay, todayIn } from "@/lib/dates";
import { MEMORIES } from "@/lib/demo-fixtures";
import { getTodayQuestion } from "@/lib/data/daily-question";
import { getSealedCards } from "@/lib/data/cards";
import { getActivities } from "@/lib/data/activities";

export const metadata: Metadata = { title: "Today · Closer" };

export default function PatientTodayPage() {
  const newMemories = MEMORIES.filter((m) => m.sharedDaysAgo <= 1);

  return (
    <>
      <h1 className="sr-only">Today</h1>
      <section aria-label="Who's thinking of you">
        <Suspense fallback={<div className="h-20" />}>
          <Stories />
        </Suspense>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <Suspense fallback={<div className="min-h-48 rounded-3xl bg-surface-muted" />}>
          <TodayCheckIn />
        </Suspense>

        <Suspense fallback={<div className="min-h-40 rounded-3xl bg-role-volunteer-soft" />}>
          <TodayQuestionCard />
        </Suspense>

        <Suspense fallback={null}>
          <CardsWaiting />
        </Suspense>

        <Suspense fallback={<div className="min-h-32 rounded-3xl bg-card ring-1 ring-border" />}>
          <SuggestedActivity />
        </Suspense>
      </div>

      {newMemories.length > 0 && (
        <section aria-labelledby="memories-title" className="flex flex-col gap-3">
          <h2 id="memories-title" className="text-xl font-extrabold">
            New memories
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {newMemories.map((m) => (
              <li key={m.id}>
                <Link href="/patient/memories" className="flex items-center gap-4 rounded-3xl bg-card p-3 shadow-sm ring-1 ring-border transition hover:-translate-y-0.5">
                  <MemoryThumb memory={m} className="size-16 shrink-0 rounded-2xl" />
                  <span className="flex flex-col">
                    <span className="font-bold">{CAST[m.by].name} shared a memory</span>
                    <span className="line-clamp-1 text-muted-foreground">{m.caption}</span>
                    <span className="text-sm text-muted-foreground">{relativeDay(m.sharedDaysAgo)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Suspense fallback={null}><WellbeingPanel role="patient" /></Suspense>
    </>
  );
}

// Everything the family sent today, one story per person. Live: a new reply, reaction,
// comment, card or answer shows up without reloading.
async function Stories() {
  const patient = await getMyPatient();
  if (!patient) return null;
  const stories = await getStories(patient.id, patient.timezone);
  return (
    <>
      <LiveRefresh
        channel={`patient-stories-${patient.id}`}
        watch={[
          { table: "nudge_recipients" },
          { table: "checkin_reactions" },
          { table: "activity_reactions" },
          { table: "activity_comments" },
          { table: "comfort_cards" },
          { table: "question_answers" },
        ]}
      />
      <StoriesRow stories={stories} />
    </>
  );
}

// Today's check-in on one flat tinted area (or a big button to do it).
async function TodayCheckIn() {
  const patient = await getMyPatient();
  if (!patient) return null;
  const [[latest], streak] = await Promise.all([
    getCheckins(patient.id, patient.timezone, { days: 14, withPhotos: true }),
    getStreak(patient.id, patient.timezone),
  ]);
  const doneToday = latest?.daysAgo === 0;

  return (
    <section aria-labelledby="checkin-title" className="relative flex flex-col gap-4 rounded-3xl bg-surface-muted p-5">
      <LiveRefresh channel={`patient-today-${patient.id}`} watch={[{ table: "mood_checkins", filter: `patient_id=eq.${patient.id}` }]} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pr-12">
        <h2 id="checkin-title" className="text-2xl font-extrabold">
          {doneToday ? "Mood of the day" : "How do you feel?"}
        </h2>
        {streak.totalDays > 0 && (
          <span className="inline-flex items-center gap-1 font-bold whitespace-nowrap text-role-patient-ink">
            <CloserIcon name="streak" className="text-mood-5" /> {streak.totalDays} {streak.totalDays === 1 ? "day" : "days"}
          </span>
        )}
      </div>
      {doneToday && (
        <Link
          href="/patient/checkin"
          aria-label="Edit my mood"
          title="Edit my mood"
          className="absolute top-3 right-3 flex size-11 items-center justify-center rounded-full transition hover:bg-background"
        >
          <Pencil className="size-5" aria-hidden />
        </Link>
      )}
      {!doneToday && (
        <Link
          href="/patient/checkin"
          className="flex min-h-16 items-center justify-center gap-3 rounded-2xl bg-role-patient text-xl font-extrabold shadow-sm transition hover:-translate-y-0.5 active:scale-[0.98]"
        >
          <CloserIcon name="happy" className="size-8" /> Check in
        </Link>
      )}
      {latest && (
        <>
          {!doneToday && <p className="font-bold text-muted-foreground">Last time ({relativeDay(latest.daysAgo).toLowerCase()})</p>}
          <CheckInCard checkin={latest} size="lg" plain />
        </>
      )}
    </section>
  );
}

// One activity a day from the library (rotates daily), opens straight into it.
async function SuggestedActivity() {
  const [patient, activities] = await Promise.all([getMyPatient(), getActivities()]);
  if (!patient || activities.length === 0) return null;
  const dayNumber = Math.floor(Date.parse(todayIn(patient.timezone)) / 86_400_000);
  const pool = activities.filter((a) => a.type !== "challenge");
  const pick = pool[dayNumber % pool.length];
  return (
    <Link href={`/patient/activities/${pick.id}`} aria-labelledby="activity-title" className="flex items-center gap-4 rounded-3xl bg-card p-5 shadow-sm ring-1 ring-border transition hover:-translate-y-0.5">
      <span aria-hidden className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-role-patient-soft text-role-patient-ink">
        <CloserIcon name={ACTIVITY_TYPES[pick.type].icon} className="size-8" />
      </span>
      <span className="flex flex-col">
        <span className="text-sm font-bold text-muted-foreground">Try this</span>
        <span id="activity-title" className="font-heading text-xl font-extrabold">
          {pick.title}
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          About {pick.minutes} minutes · Start <CloserIcon name="play" className="size-4" />
        </span>
      </span>
    </Link>
  );
}

// "2 cards for you": sealed cards from the family (count only, never the text).
async function CardsWaiting() {
  const sealed = (await getSealedCards()).length;
  if (sealed === 0) return null;
  return (
    <Link
      href="/patient/connect"
      className="flex items-center gap-4 rounded-3xl bg-role-family-soft p-5 shadow-sm ring-1 ring-border transition hover:-translate-y-0.5"
    >
      <span aria-hidden className="flex size-16 shrink-0 animate-wiggle items-center justify-center rounded-2xl bg-card text-role-family-ink">
        <CloserIcon name="card" className="size-8" />
      </span>
      <span className="flex flex-col">
        <span className="font-heading text-2xl font-extrabold">
          {sealed} {sealed === 1 ? "card" : "cards"} for you
        </span>
        <span className="text-lg text-muted-foreground">Open them when you want</span>
      </span>
    </Link>
  );
}

// Today's question: opens the full question screen. Says who answered, never what.
async function TodayQuestionCard() {
  const patient = await getMyPatient();
  if (!patient) return null;
  const q = await getTodayQuestion(patient.id);
  if (!q) return null;
  const who = q.answeredBy.map((m) => (m.relationship === "Mom" || m.relationship === "Dad" ? m.relationship : m.name));
  return (
    <Link href="/patient/question" className="flex flex-col gap-3 rounded-3xl bg-role-volunteer-soft p-5 shadow-sm ring-1 ring-border transition hover:-translate-y-0.5">
      <span className="flex items-center gap-1.5 text-sm font-bold text-role-volunteer-ink">
        <CloserIcon name="idea" /> Today&apos;s question
      </span>
      <span className="font-heading text-2xl font-extrabold">{q.text}</span>
      <span className="flex items-center gap-1.5 text-lg">
        {q.myAnswer ? (
          <>
            <CloserIcon name="check" className="text-success" /> You answered. See everyone&apos;s answers
          </>
        ) : who.length ? (
          <>
            <CloserIcon name="lock" /> {who.join(" and ")} answered! Answer to see it.
          </>
        ) : (
          "Be the first to answer"
        )}
      </span>
    </Link>
  );
}
