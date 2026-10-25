"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { replyToNudge } from "@/app/nudge-actions";
import { FeedItem } from "@/components/kit/feed-item";
import { ResultCard } from "@/components/activities/result-card";
import { CheckInCard } from "@/components/checkin-card";
import { ReactionBar } from "@/components/reaction-bar";
import { CAST } from "@/lib/cast";
import type { ActivityResult } from "@/lib/data/activities";
import type { CheckInView } from "@/lib/data/checkins";
import type { Milestone } from "@/lib/streak";
import type { MyNudge } from "@/lib/data/nudges";
import { relativeDay } from "@/lib/dates";
import { MEMORIES, VOLUNTEER_STORIES } from "@/lib/demo-fixtures";
import type { TodayQuestion } from "@/lib/data/daily-question";
import type { Card } from "@/lib/data/cards";
import { nudgeKind, QUICK_REPLIES } from "@/lib/nudges";
import { cn } from "@/lib/utils";

// Emma's home. Check-ins and nudges are real and live (see the page). Unanswered nudges
// stay pinned on top. The volunteer request, memories and cards are still placeholder data.
type PendingChallenge = { session_id: string; title: string; emoji: string; theme: string | null };

export function FamilyFeed({ checkins, nudges, results, challenges, milestones, openedCards, question, me }: {
  checkins: CheckInView[];
  nudges: MyNudge[];
  results: ActivityResult[];
  challenges: PendingChallenge[];
  milestones: { daysAgo: number; milestone: Milestone }[];
  /** My cards Leo opened this week (live) */
  openedCards: Card[];
  question: TodayQuestion | null;
  me: string;
}) {
  const pending = nudges.filter((n) => !n.reply);
  const answered = nudges.filter((n) => n.reply).slice(0, 3);
  const [request, setRequest] = useState<"pending" | "approved" | "declined">("pending");
  const memory = MEMORIES.find((m) => m.by !== "emma");
  const maya = VOLUNTEER_STORIES.maya;

  return (
    <div className="flex flex-col gap-4">
      {pending.map((n) => (
        <PinnedNudge key={n.id} nudge={n} />
      ))}

      {challenges.map((c) => (
        <FeedItem key={c.session_id} person={CAST.leo} pinned when="Waiting for you" line={<><strong>Leo</strong> challenged you: {c.title} {c.emoji}</>}>
          <p className="text-muted-foreground">🔒 Leo&apos;s drawing is hidden until you draw yours. Then you both see them side by side.</p>
          <Link href={`/family/challenge/${c.session_id}`} className="flex min-h-12 items-center self-start rounded-full bg-role-family-ink px-5 font-bold text-white">
            Draw mine ▶
          </Link>
        </FeedItem>
      ))}

      {request === "pending" ? (
        <FeedItem person={CAST.leo} when="Today" line={<><strong>Leo</strong> would like to talk with <strong>{maya.firstName}</strong>, a volunteer {maya.job.toLowerCase()} {maya.avatar}</>}>
          <p className="text-muted-foreground">Sarah already said yes. As Leo&apos;s guardian, you decide. Visits are always supervised by the hospital.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setRequest("approved")} className="min-h-12 rounded-full bg-role-family-ink px-5 font-bold text-white">
              Approve
            </button>
            <button type="button" onClick={() => setRequest("declined")} className="min-h-12 rounded-full bg-muted px-5 font-bold">
              Not now
            </button>
          </div>
        </FeedItem>
      ) : (
        <p aria-live="polite" className="animate-rise rounded-2xl bg-muted px-4 py-3">
          {request === "approved" ? `Approved. ${maya.firstName} will get the request without Leo's name.` : "No problem. Leo won't see a refusal, just that it's not for now."}
        </p>
      )}

      {question && !question.myAnswer && (
        <Link href="/family/question" className="flex items-center gap-3 rounded-2xl bg-role-volunteer-soft px-4 py-3 font-bold text-role-volunteer-ink transition hover:-translate-y-0.5">
          <span aria-hidden className="text-2xl">
            ⏳
          </span>
          {question.answeredBy.length ? `${question.answeredBy.map((m) => m.name).join(" and ")} answered today's question. Answer to see it:` : "Today's question is waiting for you:"} “{question.text}”
        </Link>
      )}

      {checkins.length === 0 && results.length === 0 && (
        <p className="rounded-2xl bg-muted px-4 py-3 text-muted-foreground">Leo hasn&apos;t checked in this week yet. You&apos;ll see it here as soon as he does 💛</p>
      )}
      {/* Leo's week, newest day first: milestones, then results, then the check-in */}
      {[...new Set([...checkins.map((c) => c.daysAgo), ...results.map((r) => r.daysAgo), ...milestones.map((m) => m.daysAgo), ...openedCards.map((c) => c.openedDaysAgo ?? 0)])]
        .sort((a, b) => a - b)
        .map((day) => (
          <div key={day} className="flex flex-col gap-4">
            {milestones
              .filter((m) => m.daysAgo === day)
              .map((m) => (
                <FeedItem key={m.milestone.days} person={CAST.leo} when={relativeDay(day)} line={<><strong>Leo</strong> has been connected for {m.milestone.days} days</>}>
                  <p className="flex items-center gap-3 rounded-2xl bg-role-patient-soft px-4 py-3 text-lg font-extrabold text-role-patient-ink">
                    <span aria-hidden className="text-4xl">
                      {m.milestone.emoji}
                    </span>
                    New badge: {m.milestone.name}
                  </p>
                </FeedItem>
              ))}
            {openedCards
              .filter((c) => (c.openedDaysAgo ?? 0) === day)
              .map((c) => (
                <FeedItem key={c.id} person={CAST.leo} when={relativeDay(day)} line={<><strong>Leo</strong> opened your card 💌</>}>
                  <p className="line-clamp-2 text-muted-foreground">“{c.body}”</p>
                </FeedItem>
              ))}
            {results
              .filter((r) => r.daysAgo === day)
              .map((r) => (
                <FeedItem key={r.id} person={CAST.leo} when={`${relativeDay(r.daysAgo)}, ${r.time}`} line={<><strong>Leo</strong> {r.activity.type === "challenge" ? "and you revealed your challenge" : r.inMemories && r.visibility !== "family" ? "added to Memories" : "shared"}</>}>
                  <ResultCard result={r} viewer="family" me={me} />
                </FeedItem>
              ))}
            {checkins
              .filter((c) => c.daysAgo === day)
              .map((c) => (
                <FeedItem key={c.id} person={CAST.leo} when={`${relativeDay(c.daysAgo)}, ${c.time}`} line={<><strong>Leo</strong> shared the mood of the day</>}>
                  <CheckInCard checkin={c}>
                    <ReactionBar checkinId={c.id} reactions={c.reactions} me={me} />
                  </CheckInCard>
                </FeedItem>
              ))}
          </div>
        ))}

      {answered.map((n) => (
        <FeedItem key={n.id} person={CAST.leo} when={`${relativeDay(n.daysAgo)}, ${n.time}`} line={<><strong>Leo</strong> {nudgeKind(n.kind).message} {nudgeKind(n.kind).emoji}</>}>
          <p className="text-muted-foreground">
            You replied <span aria-hidden>{n.reply?.emoji}</span> “{n.reply?.text}”
          </p>
        </FeedItem>
      ))}

      {memory && (
        <FeedItem person={CAST[memory.by]} when={relativeDay(memory.sharedDaysAgo)} line={<><strong>{CAST[memory.by].name}</strong> shared a memory</>}>
          <Link href="/family/memories" className="flex items-center gap-3 rounded-2xl bg-muted p-2 pr-4 transition hover:-translate-y-0.5">
            <span aria-hidden className={`flex size-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-4xl ${memory.gradient}`}>
              {memory.emoji}
            </span>
            <span>{memory.caption}</span>
          </Link>
        </FeedItem>
      )}

    </div>
  );
}

// Quick reply in one tap, or a short message of your own. Leo sees it live.
function PinnedNudge({ nudge }: { nudge: MyNudge }) {
  const [emoji, setEmoji] = useState<string>(QUICK_REPLIES[0].emoji);
  const [text, setText] = useState("");
  const [custom, setCustom] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  const k = nudgeKind(nudge.kind);

  const send = (e: string, t: string) => {
    setError(null);
    startSending(async () => {
      const result = await replyToNudge(nudge.id, e, t);
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <FeedItem person={CAST.leo} pinned when={`${relativeDay(nudge.daysAgo)}, ${nudge.time}`} line={<><strong>Leo</strong> {k.message} {k.emoji}</>}>
      <p className="text-sm font-bold text-role-family-ink">⏳ Leo is waiting for your answer</p>
      {custom ? (
        <form
          onSubmit={(ev) => {
            ev.preventDefault();
            send(emoji, text);
          }}
          className="flex flex-col gap-2"
        >
          <div role="radiogroup" aria-label="Emoji" className="flex gap-2">
            {QUICK_REPLIES.map((r) => (
              <button key={r.emoji} type="button" role="radio" aria-checked={emoji === r.emoji} onClick={() => setEmoji(r.emoji)} className={cn("flex size-11 items-center justify-center rounded-full text-xl", emoji === r.emoji ? "bg-card ring-2 ring-role-family" : "bg-card/60")}>
                {r.emoji}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <label htmlFor={`reply-${nudge.id}`} className="sr-only">
              Your message
            </label>
            <input id={`reply-${nudge.id}`} value={text} onChange={(e) => setText(e.target.value)} maxLength={140} placeholder="Coming tonight!" className="min-h-11 min-w-0 flex-1 rounded-full border bg-card px-4" />
            <button type="submit" disabled={sending || !text.trim()} className="min-h-11 rounded-full bg-role-family-ink px-5 font-bold text-white disabled:opacity-50">
              Send
            </button>
          </div>
        </form>
      ) : (
        <div role="group" aria-label="Quick reply" className="flex flex-wrap gap-2">
          {QUICK_REPLIES.map((r) => (
            <button
              key={r.emoji}
              type="button"
              disabled={sending}
              onClick={() => send(r.emoji, r.text)}
              className="min-h-11 rounded-full bg-card px-4 font-bold shadow-sm ring-1 ring-border transition hover:-translate-y-0.5 active:scale-95 disabled:opacity-60"
            >
              <span aria-hidden>{r.emoji}</span> {r.text}
            </button>
          ))}
          <button type="button" onClick={() => setCustom(true)} className="min-h-11 rounded-full px-4 font-bold text-role-family-ink hover:bg-card">
            ✏️ Write
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm font-bold text-alert">
          {error}
        </p>
      )}
    </FeedItem>
  );
}
