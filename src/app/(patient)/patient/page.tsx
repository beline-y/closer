import type { Metadata } from "next";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { WellbeingPanel } from "@/components/wellbeing/dashboard";
import { PageHero } from "@/components/kit/page-hero";
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
      <PageHero emoji="👋" title="Hi Leo!" hue="sun" listen="Hi Leo! Your people are thinking of you.">
        Your people are thinking of you.
      </PageHero>

      <section aria-labelledby="thinking-title" className="flex flex-col gap-3">
        <h2 id="thinking-title" className="text-2xl font-extrabold">
          Thinking of you today <span aria-hidden>💛</span>
        </h2>
        <Suspense fallback={<div className="h-24" />}>
          <ThinkingOfYou />
        </Suspense>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <Suspense fallback={<div className="min-h-48 rounded-3xl bg-card ring-1 ring-border" />}>
          <TodayCheckIn />
        </Suspense>

        <Suspense fallback={<div className="hue-lilac min-h-40 rounded-3xl bg-hue-soft" />}>
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
          <h2 id="memories-title" className="text-2xl font-extrabold">
            New memories <span aria-hidden>📸</span>
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {newMemories.map((m) => (
              <li key={m.id} className="hue-sky">
                <Link href="/patient/memories" className="pressable flex items-center gap-4 rounded-3xl bg-card p-3 ring-1 ring-hue">
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
    <section aria-labelledby="checkin-title" className="hue-sun flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-sm ring-2 ring-hue">
      <LiveRefresh
        channel={`patient-today-${patient.id}`}
        watch={[{ table: "mood_checkins", filter: `patient_id=eq.${patient.id}` }, { table: "checkin_reactions" }]}
      />
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="checkin-title" className="mr-auto text-2xl font-extrabold">
          {doneToday ? "Mood of the day" : "How do you feel?"}
        </h2>
        {streak.totalDays > 0 && (
          <span className="rounded-full bg-hue-soft px-3 py-1 font-bold whitespace-nowrap text-hue-ink">
            <span aria-hidden>🔥</span> {streak.totalDays} {streak.totalDays === 1 ? "day" : "days"}
          </span>
        )}
        {doneToday && (
          <Link href="/patient/checkin" className="flex min-h-12 items-center gap-1.5 rounded-full bg-muted px-4 font-bold transition hover:bg-hue-soft">
            <Pencil className="size-5" aria-hidden /> Change
          </Link>
        )}
      </div>
      {!doneToday && (
        <Link href="/patient/checkin" className="pressable flex min-h-20 items-center justify-center gap-3 rounded-2xl bg-hue text-2xl font-extrabold">
          <span aria-hidden className="text-5xl">
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
    <Link href={`/patient/activities/${pick.id}`} aria-labelledby="activity-title" className="hue-mint pressable flex items-center gap-4 rounded-3xl bg-hue-soft p-5">
      <span aria-hidden className="flex size-20 shrink-0 rotate-3 items-center justify-center rounded-3xl bg-card text-5xl shadow-sm">
        {pick.emoji}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="font-bold text-hue-ink">🎨 Try this</span>
        <span id="activity-title" className="font-heading text-2xl font-extrabold">
          {pick.title}
        </span>
        <span className="text-lg">About {pick.minutes} minutes · Start ▶</span>
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
      className="hue-coral pressable flex items-center gap-4 rounded-3xl bg-hue-soft p-5"
    >
      <span aria-hidden className="flex size-20 shrink-0 -rotate-3 items-center justify-center rounded-3xl bg-card text-5xl shadow-sm">
        <span className="animate-wiggle">💌</span>
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="font-heading text-2xl font-extrabold">
          {sealed} {sealed === 1 ? "card" : "cards"} for you
        </span>
        <span className="text-lg font-bold text-hue-ink">Open them when you want ▶</span>
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
    <Link href="/patient/question" className="hue-lilac pressable flex flex-col gap-3 rounded-3xl bg-hue-soft p-5">
      <span className="flex items-center gap-2 font-bold text-hue-ink">
        <span aria-hidden className="flex size-10 items-center justify-center rounded-2xl bg-card text-2xl shadow-sm">
          ❓
        </span>
        Today&apos;s question
      </span>
      <span className="font-heading text-2xl font-extrabold">{q.text}</span>
      <span className="text-lg font-bold">
        {q.myAnswer ? "✅ You answered. See everyone's answers ▶" : who.length ? `🔒 ${who.join(" and ")} answered! Answer to see it.` : "Be the first to answer ▶"}
      </span>
    </Link>
  );
}
