"use client";

import { useRef, useState, useTransition } from "react";
import { takeBackCard, writeCard } from "@/app/card-actions";
import { QuestionIdeas } from "@/components/question-ideas";
import { CARD_COLORS } from "@/components/kit/reveal-card";
import { relativeDay } from "@/lib/dates";
import type { Card, CardColor } from "@/lib/data/cards";
import { cn } from "@/lib/utils";
import { CloserIcon } from "@/components/icons/closer-icon";

const COLOR_NAMES: Record<CardColor, string> = { sun: "Sunshine", coral: "Coral", sky: "Sky", lilac: "Lilac" };

// Write a sealed card; Leo opens it when ready, and the list below updates live
// ("Opened by Leo"). A card can be taken back while it's still sealed.
export function CardWriter({ initialBody = "", cards }: { initialBody?: string; cards: Card[] }) {
  const [body, setBody] = useState(initialBody);
  const [error, setError] = useState<string | null>(null);
  const [sealing, startSealing] = useTransition();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [draftMessage, setDraftMessage] = useState(initialBody ? "Your question is in the draft. Edit it below; nothing has been sent." : "");
  const [color, setColor] = useState<CardColor>("coral");
  const [justSealed, setJustSealed] = useState(false);
  const sealed = cards.filter((c) => !c.openedAt);
  const opened = cards.filter((c) => c.openedAt);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!body.trim()) return;
          setError(null);
          startSealing(async () => {
            const r = await writeCard(body, color);
            if (!r.ok) return setError(r.error);
            setBody("");
            setDraftMessage("");
            setJustSealed(true);
          });
        }}
        className={cn("flex flex-col gap-4 rounded-3xl p-5 shadow-sm ring-1 ring-border transition-colors", CARD_COLORS[color])}
      >
        <label htmlFor="card-body" className="text-xl font-extrabold">
          Write a card for Leo
        </label>
        <p className="text-sm">Make it your own. Leo gets the card only when you choose to seal it.</p>
        {draftMessage && <p role="status" className="rounded-2xl bg-card/75 p-3 font-bold">{draftMessage}</p>}
        <textarea
          id="card-body"
          ref={bodyRef}
          autoFocus={!!initialBody}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setJustSealed(false);
          }}
          rows={6}
          maxLength={1000}
          placeholder="Something to make Leo smile…"
          className="rounded-2xl border bg-card p-4 text-lg"
        />
        <QuestionIdeas onChoose={(question) => {
          const next = body.trim() ? `${body.trim()}\n\n${question}` : question;
          if (next.length > 1000) { setDraftMessage("Make a little room in your card before adding another question."); return; }
          setBody(next);
          setJustSealed(false);
          setDraftMessage("Question added to your draft. You can edit it before sealing your card.");
          requestAnimationFrame(() => bodyRef.current?.focus());
        }} />
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="mb-2 font-bold">Card color</legend>
          {(Object.keys(CARD_COLORS) as CardColor[]).map((c) => (
            <label key={c} className={cn("flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-card px-3 font-bold ring-1 ring-border", color === c && "ring-2 ring-foreground")}>
              <input type="radio" name="color" value={c} checked={color === c} onChange={() => setColor(c)} className="sr-only" />
              <span aria-hidden className={cn("size-5 rounded-full ring-1 ring-black/10", CARD_COLORS[c])} />
              {COLOR_NAMES[c]}
            </label>
          ))}
        </fieldset>
        <button type="submit" disabled={!body.trim() || sealing} className="min-h-14 rounded-2xl bg-role-family-ink text-lg font-extrabold text-white disabled:opacity-50">
          {sealing ? "Sealing…" : "Seal card for Leo"}
        </button>
        {justSealed && (
          <p aria-live="polite" className="animate-rise font-bold">
            Sealed! Leo will open it when ready. You&apos;ll see it here as soon as it&apos;s opened.
          </p>
        )}
        {error && <p role="alert" className="font-bold text-alert">{error}</p>}
      </form>

      <div className="flex flex-col gap-6">
        <section aria-labelledby="sealed-title" className="flex flex-col gap-3">
          <h2 id="sealed-title" className="text-xl font-extrabold">
            Waiting to be opened ({sealed.length})
          </h2>
          {sealed.length === 0 ? (
            <p className="text-muted-foreground">Leo has opened all your cards.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {sealed.map((c) => (
                <li key={c.id} className={cn("flex items-center gap-3 rounded-2xl p-4", CARD_COLORS[c.color])}>
                  <CloserIcon name="card" className="size-6" />
                  <p className="line-clamp-1 flex-1">{c.body}</p>
                  <TakeBack id={c.id} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="opened-title" className="flex flex-col gap-3">
          <h2 id="opened-title" className="text-xl font-extrabold">
            Opened by Leo
          </h2>
          {opened.length === 0 && <p className="text-muted-foreground">Nothing opened yet. You&apos;ll see it here the moment Leo opens one.</p>}
          <ul className="flex flex-col gap-2">
            {opened.map((c) => (
              <li key={c.id} className="flex flex-col gap-1 rounded-2xl bg-card p-4 ring-1 ring-border">
                <p className="line-clamp-2">{c.body}</p>
                <p className="flex items-center gap-1.5 text-sm font-bold text-role-family-ink"><CloserIcon name="card" /> Leo opened your card {relativeDay(c.openedDaysAgo ?? 0).toLowerCase()}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function TakeBack({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (window.confirm("Take back this card? Leo hasn't opened it yet.")) start(async () => void (await takeBackCard(id)));
      }}
      className="min-h-11 shrink-0 rounded-full px-3 text-sm font-bold hover:bg-card/60 disabled:opacity-50"
    >
      Take back
    </button>
  );
}
