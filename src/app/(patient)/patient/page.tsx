import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PersonaAvatar } from "@/components/kit/persona-avatar";
import { CheckInCard } from "@/components/patient/check-in-card";
import { CAST } from "@/lib/cast";
import { getVisibleCircle } from "@/lib/data/circle";
import { relativeDay } from "@/lib/dates";
import { COMFORT_CARDS, MEMORIES, SUGGESTED_ACTIVITY, THINKING_OF_YOU_TODAY, TODAY_QUESTION } from "@/lib/demo-fixtures";

export const metadata: Metadata = { title: "Today · Closer" };

export default function PatientTodayPage() {
  const sealed = COMFORT_CARDS.filter((c) => c.sealed).length;
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
        <CheckInCard />

        <Link
          href="/patient/question"
          className="flex flex-col gap-3 rounded-3xl bg-role-volunteer-soft p-5 shadow-sm ring-1 ring-border transition hover:-translate-y-0.5"
        >
          <span className="text-sm font-bold text-role-volunteer-ink">❓ Today&apos;s question</span>
          <span className="font-heading text-2xl font-extrabold">{TODAY_QUESTION.text}</span>
          <span className="text-lg">🔒 Dad answered! Answer to see his.</span>
        </Link>

        {sealed > 0 && (
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
        )}

        <section aria-labelledby="activity-title" className="flex items-center gap-4 rounded-3xl bg-card p-5 shadow-sm ring-1 ring-border">
          <span aria-hidden className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-role-patient-soft text-4xl">
            {SUGGESTED_ACTIVITY.emoji}
          </span>
          <div className="flex flex-col">
            <h2 id="activity-title" className="text-sm font-bold text-muted-foreground">
              Try this
            </h2>
            <p className="font-heading text-xl font-extrabold">{SUGGESTED_ACTIVITY.title}</p>
            <p className="text-muted-foreground">About {SUGGESTED_ACTIVITY.minutes} minutes</p>
          </div>
        </section>
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
    </>
  );
}

// Who's in Leo's circle comes from Supabase (RLS); who interacted today is placeholder data.
async function ThinkingOfYou() {
  const circle = await getVisibleCircle();
  const today = circle.filter((m) => THINKING_OF_YOU_TODAY.includes(m.id));
  if (today.length === 0) {
    return <p className="text-lg text-muted-foreground">Your family will pop up here when they send you something 💛</p>;
  }
  return (
    <ul className="flex flex-wrap gap-5">
      {today.map((m) => (
        <li key={m.id} className="flex flex-col items-center gap-1.5">
          <PersonaAvatar person={m} size="xl" presence="online" />
          <span className="font-bold">{m.relationship === "Mom" ? "Mom" : m.name}</span>
        </li>
      ))}
    </ul>
  );
}
