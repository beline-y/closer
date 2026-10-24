"use client";

import Link from "next/link";
import { useState } from "react";
import { FeedItem } from "@/components/kit/feed-item";
import { CheckInCard } from "@/components/checkin-card";
import { ReactionBar } from "@/components/reaction-bar";
import { CAST } from "@/lib/cast";
import type { CheckInView } from "@/lib/data/checkins";
import { relativeDay } from "@/lib/dates";
import { COMFORT_CARDS, MEMORIES, QUICK_REPLIES, TODAY_QUESTION, VOLUNTEER_STORIES } from "@/lib/demo-fixtures";

// Emma's home. Check-ins are real and live (see the page); nudges, the volunteer request,
// memories and cards are still placeholder data until their features land.
export function FamilyFeed({ checkins, me }: { checkins: CheckInView[]; me: string }) {
  const [reply, setReply] = useState<string | null>(null);
  const [request, setRequest] = useState<"pending" | "approved" | "declined">("pending");
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

      {checkins.length === 0 && (
        <p className="rounded-2xl bg-muted px-4 py-3 text-muted-foreground">Leo hasn&apos;t checked in this week yet. You&apos;ll see it here as soon as he does 💛</p>
      )}
      {checkins.map((c) => (
        <FeedItem
          key={c.id}
          person={CAST.leo}
          when={`${relativeDay(c.daysAgo)}, ${c.time}`}
          line={<><strong>Leo</strong> checked in</>}
        >
          <CheckInCard checkin={c}>
            <ReactionBar checkinId={c.id} reactions={c.reactions} me={me} />
          </CheckInCard>
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

      {opened && (
        <FeedItem person={CAST.leo} when={relativeDay(opened.openedDaysAgo ?? 0)} line={<><strong>Leo</strong> opened your card 💌</>}>
          <p className="line-clamp-2 text-muted-foreground">“{opened.body}”</p>
        </FeedItem>
      )}
    </div>
  );
}
