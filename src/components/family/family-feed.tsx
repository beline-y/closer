"use client";

import Link from "next/link";
import { useState } from "react";
import { FeedItem } from "@/components/kit/feed-item";
import { MoodDot } from "@/components/kit/mood-dot";
import { CAST } from "@/lib/cast";
import { relativeDay } from "@/lib/dates";
import { CHECKINS, COMFORT_CARDS, MEMORIES, QUICK_REPLIES, TODAY_QUESTION, VOLUNTEER_STORIES } from "@/lib/demo-fixtures";
import { PATIENT_IDS } from "@/lib/cast";
import { cn } from "@/lib/utils";

const CHECKIN_REACTIONS = ["❤️", "🤗", "⭐", "💪"];

// Emma's home. Nudges stay pinned on top until answered.
// Saved for this visit only; Realtime arrives with the nudges and check-in features.
export function FamilyFeed() {
  const [reply, setReply] = useState<string | null>(null);
  const [reaction, setReaction] = useState<string | null>(null);
  const [request, setRequest] = useState<"pending" | "approved" | "declined">("pending");
  const checkin = CHECKINS[PATIENT_IDS.leo][0];
  const opened = COMFORT_CARDS.find((c) => c.from === "emma" && !c.sealed);
  const memory = MEMORIES.find((m) => m.by !== "emma");
  const maya = VOLUNTEER_STORIES.maya;

  return (
    <div className="flex flex-col gap-4">
      {!reply && (
        <FeedItem person={CAST.leo} pinned when="10 min ago" line={<><strong>Leo</strong> misses you 💛</>}>
          <p className="text-sm font-bold text-role-family-ink">⏳ Leo is waiting for your answer</p>
          <div role="group" aria-label="Quick reply" className="flex flex-wrap gap-2">
            {QUICK_REPLIES.map((r) => (
              <button key={r} type="button" onClick={() => setReply(r)} className="min-h-11 rounded-full bg-card px-4 font-bold shadow-sm ring-1 ring-border transition hover:-translate-y-0.5 active:scale-95">
                {r}
              </button>
            ))}
          </div>
        </FeedItem>
      )}
      {reply && (
        <p aria-live="polite" className="animate-rise rounded-2xl bg-success-soft px-4 py-3 font-bold text-success">
          You replied “{reply}” to Leo. 💌
        </p>
      )}

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

      <Link href="/family/question" className="flex items-center gap-3 rounded-2xl bg-role-volunteer-soft px-4 py-3 font-bold text-role-volunteer-ink transition hover:-translate-y-0.5">
        <span aria-hidden className="text-2xl">
          ⏳
        </span>
        Dad answered today&apos;s question. Answer to see it: “{TODAY_QUESTION.text}”
      </Link>

      <FeedItem person={CAST.leo} when={`Today, ${checkin.time}`} line={<><strong>Leo</strong> checked in</>}>
        <div className="flex flex-col gap-2 rounded-2xl bg-role-patient-soft p-3">
          <MoodDot value={checkin.mood} className="text-lg font-bold" />
          {checkin.note && <p className="text-lg">“{checkin.note}”</p>}
          <p className="text-sm text-muted-foreground">
            {checkin.activity} · Ate {checkin.meal?.toLowerCase()}
          </p>
        </div>
        <div role="group" aria-label="React to the check-in" className="flex gap-2">
          {CHECKIN_REACTIONS.map((e) => (
            <button
              key={e}
              type="button"
              aria-pressed={reaction === e}
              aria-label={`React ${e}`}
              onClick={() => setReaction(reaction === e ? null : e)}
              className={cn("flex size-12 items-center justify-center rounded-full text-xl transition active:scale-90", reaction === e ? "bg-role-family-soft ring-2 ring-role-family" : "bg-muted")}
            >
              {e}
            </button>
          ))}
        </div>
      </FeedItem>

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

      {opened && (
        <FeedItem person={CAST.leo} when={relativeDay(opened.openedDaysAgo ?? 0)} line={<><strong>Leo</strong> opened your card 💌</>}>
          <p className="line-clamp-2 text-muted-foreground">“{opened.body}”</p>
        </FeedItem>
      )}
    </div>
  );
}
