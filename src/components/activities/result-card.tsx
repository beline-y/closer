"use client";

import { useState, useTransition } from "react";
import { commentOnResult, reactToResult } from "@/app/activity-actions";
import { PersonaAvatar } from "@/components/kit/persona-avatar";
import { ReactionBar, ReactionList } from "@/components/reaction-bar";
import { ACTIVITY_TYPES } from "@/lib/activities";
import { CAST } from "@/lib/cast";
import type { ActivityResult } from "@/lib/data/activities";
import { relativeDay } from "@/lib/dates";

const who = (m: { relationship?: string; name: string }) => (m.relationship === "Mom" || m.relationship === "Dad" ? m.relationship : m.name);

// A finished activity: the result, and (once shared) reactions and comments, live.
export function ResultCard({ result, viewer, me }: { result: ActivityResult; viewer: "patient" | "family"; me: string }) {
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, start] = useTransition();
  const type = ACTIVITY_TYPES[result.activity.type];
  const shared = result.status === "completed" && (result.visibility === "family" || result.inMemories);
  const grouped = Object.values(
    result.reactions.reduce<Record<string, { emoji: string; by: typeof result.reactions[number]["by"][]; byUserIds: string[] }>>((acc, r) => {
      acc[r.emoji] ??= { emoji: r.emoji, by: [], byUserIds: [] };
      acc[r.emoji].by.push(r.by);
      acc[r.emoji].byUserIds.push(r.userId);
      return acc;
    }, {}),
  );

  return (
    <article className="flex flex-col gap-3 overflow-hidden rounded-3xl bg-card shadow-sm ring-1 ring-border">
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
        <p className="font-bold">
          <span aria-hidden>{result.activity.emoji} </span>
          {result.activity.title}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {type.label} · {relativeDay(result.daysAgo)}
          </span>
        </p>
        {viewer === "patient" && (
          <span className="rounded-full bg-muted px-3 py-1 text-sm font-bold">
            {result.status === "waiting_partner" ? `🔒 Waiting for ${result.partner ? who(result.partner) : "your partner"}` : result.visibility === "family" ? "💛 Shared" : result.inMemories ? "📸 In Memories" : "🔒 Only you"}
          </span>
        )}
      </header>

      {result.activity.type === "challenge" && result.partnerEntry ? (
        <div className="grid grid-cols-2 gap-2 px-4">
          {[
            { label: "Leo", url: result.imageUrl, person: CAST.leo },
            { label: result.partner ? who(result.partner) : "Family", url: result.partnerEntry.imageUrl, person: result.partner ?? CAST.emma },
          ].map((side) => (
            <figure key={side.label} className="flex flex-col gap-1">
              {side.url && (
                // eslint-disable-next-line @next/next/no-img-element -- signed URL from a private bucket
                <img src={side.url} alt={`${side.label}'s drawing: ${result.activity.theme ?? result.activity.title}`} className="aspect-[4/3] w-full rounded-2xl bg-muted object-cover" loading="lazy" />
              )}
              <figcaption className="flex items-center gap-1.5 text-sm font-bold">
                <PersonaAvatar person={side.person} size="sm" decorative /> {side.label}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <>
          {result.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- signed URL from a private bucket
            <img src={result.imageUrl} alt={result.activity.theme ?? result.activity.title} className="max-h-80 w-full bg-muted object-contain" loading="lazy" />
          )}
          {result.score !== null && (
            <p className="px-4 text-2xl font-extrabold">
              <span aria-hidden>{"⭐".repeat(result.score)} </span>
              {result.score} / {result.scoreTotal}
            </p>
          )}
          {result.text && result.score === null && <p className="line-clamp-6 px-4 text-lg leading-relaxed whitespace-pre-wrap">{result.text}</p>}
        </>
      )}

      {shared && (
        <div className="flex flex-col gap-3 px-4 pb-4">
          {viewer === "family" ? (
            <ReactionBar checkinId={result.id} reactions={grouped} me={me} onReact={reactToResult} />
          ) : (
            <ReactionList reactions={grouped} />
          )}
          {result.comments.length > 0 && (
            <ul aria-label="Comments" className="flex flex-col gap-2">
              {result.comments.map((c) => (
                <li key={c.id} className="flex items-start gap-2">
                  <PersonaAvatar person={c.by} size="sm" decorative />
                  <p className="rounded-2xl bg-muted px-3 py-2">
                    <span className="font-bold">{who(c.by)} </span>
                    {c.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              start(async () => {
                const r = await commentOnResult(result.id, comment);
                if (r.ok) setComment("");
                else setError(r.error);
              });
            }}
            className="flex gap-2"
          >
            <label htmlFor={`comment-${result.id}`} className="sr-only">
              Write a comment
            </label>
            <input id={`comment-${result.id}`} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={200} placeholder={viewer === "patient" ? "Say thank you…" : "Say something nice…"} className="min-h-11 min-w-0 flex-1 rounded-full border bg-background px-4" />
            <button type="submit" disabled={sending || !comment.trim()} className="min-h-11 rounded-full bg-foreground px-5 font-bold text-background disabled:opacity-50">
              Send
            </button>
          </form>
          {error && <p className="text-sm font-bold text-alert">{error}</p>}
        </div>
      )}
      {!shared && <div className="pb-1" />}
    </article>
  );
}
