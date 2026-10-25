import type { Metadata } from "next";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { WellbeingPanel } from "@/components/wellbeing/dashboard";
import { PersonaAvatar } from "@/components/kit/persona-avatar";
import { CheckInCard } from "@/components/checkin-card";
import { LiveRefresh } from "@/components/live-refresh";
import { ReactionList } from "@/components/reaction-bar";
import { CAST } from "@/lib/cast";
import { getCheckins, getMyPatient, getStreak } from "@/lib/data/checkins";
import { getRepliesForPatient, getThinkingOfYouToday } from "@/lib/data/nudges";
import { NudgeReplies } from "@/components/nudge-replies";
import { getVisibleCircle } from "@/lib/data/circle";
import { relativeDay } from "@/lib/dates";
import { MEMORIES } from "@/lib/demo-fixtures";
import { getTodayQuestion } from "@/lib/data/daily-question";
import { getSealedCards } from "@/lib/data/cards";
import { getActivities } from "@/lib/data/activities";
import { todayIn } from "@/lib/dates";

export const metadata: Metadata = { title: "Today · Closer" };

export default function PatientTodayPage() {
  const newMemories = MEMORIES.filter((m) => m.sharedDaysAgo <= 1);

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-4xl font-extrabold sm:text-5xl">Hi Leo! 👋</h1>
        <p className="text-xl text-muted-foreground">Your people are thinking of you.</p>
      </header>

      <section aria-labelledby="thinking-title" className="flex flex-col gap-3">
        <h2 id="thinking-title" className="text-xl font-extrabold">
          Thinking of you today
        </h2>
        <Suspense fallback={<div className="h-24" />}>
          <ThinkingOfYou />
        </Suspense>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <Suspense fallback={<div className="min-h-48 rounded-3xl bg-card ring-1 ring-border" />}>
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
                  <span aria-hidden className={`flex size-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-4xl ${m.gradient}`}>
                    {m.emoji}
                  </span>
                  <span className="flex flex-col">
                    <span className="font-bold">
                      {CAST[m.by].name} shared a memory {CAST[m.by].avatar}
                    </span>
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

// Today's check-in (or a big button to do it), with the family's reactions, live.
async function TodayCheckIn() {
  const patient = await getMyPatient();
  if (!patient) return null;
  const [[latest], streak] = await Promise.all([
    getCheckins(patient.id, patient.timezone, { days: 14, withPhotos: true, withReactions: true }),
    getStreak(patient.id, patient.timezone),
  ]);
  const doneToday = latest?.daysAgo === 0;

  return (
    <section aria-labelledby="checkin-title" className="relative flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-sm ring-1 ring-border">
      <LiveRefresh
        channel={`patient-today-${patient.id}`}
        watch={[{ table: "mood_checkins", filter: `patient_id=eq.${patient.id}` }, { table: "checkin_reactions" }]}
      />
      <div className="flex items-start justify-between gap-3 pr-12">
        <h2 id="checkin-title" className="text-2xl font-extrabold">
          {doneToday ? "Mood of the day" : "How do you feel?"}
        </h2>
        {streak.totalDays > 0 && (
          <span className="rounded-full bg-role-patient-soft px-3 py-1 font-bold whitespace-nowrap text-role-patient-ink">
            <span aria-hidden>🔥</span> {streak.totalDays} {streak.totalDays === 1 ? "day" : "days"}
          </span>
        )}
      </div>
      {doneToday && (
        <Link
          href="/patient/checkin"
          aria-label="Edit my mood"
          title="Edit my mood"
          className="absolute top-4 right-4 flex size-12 items-center justify-center rounded-full bg-muted transition hover:bg-role-patient-soft"
        >
          <Pencil className="size-5" aria-hidden />
        </Link>
      )}
      {!doneToday && (
        <Link
          href="/patient/checkin"
          className="flex min-h-20 items-center justify-center gap-3 rounded-2xl bg-role-patient text-xl font-extrabold shadow-sm transition hover:-translate-y-0.5 active:scale-[0.98]"
        >
          <span aria-hidden className="text-4xl">
            😊
          </span>
          Check in
        </Link>
      )}
      {latest && (
        <>
          {!doneToday && <p className="font-bold text-muted-foreground">Last time ({relativeDay(latest.daysAgo).toLowerCase()})</p>}
          <CheckInCard checkin={latest} size="lg">
            <ReactionList reactions={latest.reactions} />
          </CheckInCard>
        </>
      )}
    </section>
  );
}

// Family who replied to a nudge or reacted to a check-in today, plus today's replies. Live.
async function ThinkingOfYou() {
  const patient = await getMyPatient();
  if (!patient) return null;
  const [circle, todayIds, replies] = await Promise.all([
    getVisibleCircle(),
    getThinkingOfYouToday(patient.id, patient.timezone),
    getRepliesForPatient(patient.id, patient.timezone, 1),
  ]);
  const today = circle.filter((m) => m.userId && todayIds.includes(m.userId));
  return (
    <>
      <LiveRefresh
        channel={`patient-thinking-${patient.id}`}
        watch={[{ table: "nudge_recipients" }, { table: "checkin_reactions" }]}
      />
      {today.length === 0 ? (
        <p className="text-lg text-muted-foreground">Your family will pop up here when they send you something 💛</p>
      ) : (
        <ul className="flex flex-wrap gap-5">
          {today.map((m) => (
            <li key={m.id} className="flex flex-col items-center gap-1.5">
              <PersonaAvatar person={m} size="xl" presence="recent" />
              <span className="font-bold">{m.relationship === "Mom" || m.relationship === "Dad" ? m.relationship : m.name}</span>
            </li>
          ))}
        </ul>
      )}
      {replies.filter((r) => r.daysAgo === 0).length > 0 && <NudgeReplies replies={replies.filter((r) => r.daysAgo === 0).slice(0, 3)} />}
    </>
  );
}

// One activity a day from the library (rotates daily), opens straight into it.
async function SuggestedActivity() {
  const [patient, activities] = await Promise.all([getMyPatient(), getActivities()]);
  if (!patient || activities.length === 0) return null;
  const dayNumber = Math.floor(Date.parse(todayIn(patient.timezone)) / 86_400_000);
  const pick = activities.filter((a) => a.type !== "challenge")[dayNumber % activities.filter((a) => a.type !== "challenge").length];
  return (
    <Link href={`/patient/activities/${pick.id}`} aria-labelledby="activity-title" className="flex items-center gap-4 rounded-3xl bg-card p-5 shadow-sm ring-1 ring-border transition hover:-translate-y-0.5">
      <span aria-hidden className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-role-patient-soft text-4xl">
        {pick.emoji}
      </span>
      <span className="flex flex-col">
        <span className="text-sm font-bold text-muted-foreground">Try this</span>
        <span id="activity-title" className="font-heading text-xl font-extrabold">
          {pick.title}
        </span>
        <span className="text-muted-foreground">About {pick.minutes} minutes · Start ▶</span>
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
      <span aria-hidden className="animate-wiggle text-5xl">
        💌
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
      <span className="text-sm font-bold text-role-volunteer-ink">❓ Today&apos;s question</span>
      <span className="font-heading text-2xl font-extrabold">{q.text}</span>
      <span className="text-lg">
        {q.myAnswer ? "✅ You answered. See everyone's answers ▶" : who.length ? `🔒 ${who.join(" and ")} answered! Answer to see it.` : "Be the first to answer ▶"}
      </span>
    </Link>
  );
}
