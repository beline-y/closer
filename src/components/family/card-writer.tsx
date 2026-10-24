"use client";

import { useState } from "react";
import { CARD_COLORS } from "@/components/kit/reveal-card";
import { relativeDay } from "@/lib/dates";
import { COMFORT_CARDS, type ComfortCard } from "@/lib/demo-fixtures";
import { cn } from "@/lib/utils";

const COLOR_NAMES: Record<ComfortCard["color"], string> = { sun: "Sunshine", coral: "Coral", sky: "Sky", lilac: "Lilac" };

// Write a sealed card; Leo opens it when ready. Saved for this visit only.
export function CardWriter() {
  const [cards, setCards] = useState(COMFORT_CARDS.filter((c) => c.from === "emma"));
  const [body, setBody] = useState("");
  const [color, setColor] = useState<ComfortCard["color"]>("coral");
  const [justSealed, setJustSealed] = useState(false);
  const sealed = cards.filter((c) => c.sealed);
  const opened = cards.filter((c) => !c.sealed);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!body.trim()) return;
          setCards((all) => [{ id: `cc-${Date.now()}`, from: "emma", color, body: body.trim(), sealed: true }, ...all]);
          setBody("");
          setJustSealed(true);
        }}
        className={cn("flex flex-col gap-4 rounded-3xl p-5 shadow-sm ring-1 ring-border transition-colors", CARD_COLORS[color])}
      >
        <label htmlFor="card-body" className="text-xl font-extrabold">
          Write a card for Leo
        </label>
        <textarea
          id="card-body"
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
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="mb-2 font-bold">Card color</legend>
          {(Object.keys(CARD_COLORS) as ComfortCard["color"][]).map((c) => (
            <label key={c} className={cn("flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-card px-3 font-bold ring-1 ring-border", color === c && "ring-2 ring-foreground")}>
              <input type="radio" name="color" value={c} checked={color === c} onChange={() => setColor(c)} className="sr-only" />
              <span aria-hidden className={cn("size-5 rounded-full ring-1 ring-black/10", CARD_COLORS[c])} />
              {COLOR_NAMES[c]}
            </label>
          ))}
        </fieldset>
        <button type="submit" disabled={!body.trim()} className="min-h-14 rounded-2xl bg-role-family-ink text-lg font-extrabold text-white disabled:opacity-50">
          Seal the card 💌
        </button>
        {justSealed && (
          <p aria-live="polite" className="animate-rise font-bold">
            Sealed! Leo will open it when ready. You&apos;ll know when it&apos;s opened.
          </p>
        )}
      </form>

      <div className="flex flex-col gap-6">
        <section aria-labelledby="sealed-title" className="flex flex-col gap-3">
          <h2 id="sealed-title" className="text-xl font-extrabold">
            Waiting to be opened ({sealed.length})
          </h2>
          {sealed.length === 0 ? (
            <p className="text-muted-foreground">Leo has opened all your cards 💛</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {sealed.map((c) => (
                <li key={c.id} className={cn("flex items-center gap-3 rounded-2xl p-4", CARD_COLORS[c.color])}>
                  <span aria-hidden className="text-2xl">
                    ✉️
                  </span>
                  <p className="line-clamp-1">{c.body}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="opened-title" className="flex flex-col gap-3">
          <h2 id="opened-title" className="text-xl font-extrabold">
            Opened by Leo
          </h2>
          <ul className="flex flex-col gap-2">
            {opened.map((c) => (
              <li key={c.id} className="flex flex-col gap-1 rounded-2xl bg-card p-4 ring-1 ring-border">
                <p className="line-clamp-2">{c.body}</p>
                <p className="text-sm text-muted-foreground">💌 Opened {relativeDay(c.openedDaysAgo ?? 0).toLowerCase()}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
