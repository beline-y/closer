"use client";

import { useState } from "react";
import type { CastMember } from "@/lib/cast";
import { HUES } from "@/lib/hues";
import { cn } from "@/lib/utils";
import { PersonaAvatar } from "./persona-avatar";
import { ReadAloud } from "./read-aloud";

export const CARD_COLORS = {
  sun: "bg-role-patient-soft",
  coral: "bg-role-family-soft",
  sky: "bg-sky-100",
  lilac: "bg-role-volunteer-soft",
} as const;

// A sealed envelope that opens once, with a little flap animation.
// A sealed card has no text yet: onOpen fetches it (the database records the opening).
// Opened, it can be read out loud.
export function RevealCard({
  from,
  body: initialBody,
  color,
  sealed: initiallySealed,
  onOpen,
}: {
  from: CastMember;
  body?: string;
  color: keyof typeof CARD_COLORS;
  sealed: boolean;
  onOpen?: () => Promise<string | null>;
}) {
  const [sealed, setSealed] = useState(initiallySealed);
  const [opening, setOpening] = useState(false);
  const [body, setBody] = useState(initialBody ?? "");
  const [failed, setFailed] = useState(false);

  if (sealed) {
    return (
      <button
        type="button"
        disabled={opening}
        onClick={async () => {
          setOpening(true);
          setFailed(false);
          const [text] = await Promise.all([onOpen ? onOpen() : Promise.resolve(body), new Promise((r) => setTimeout(r, 450))]);
          if (text === null) {
            setOpening(false);
            setFailed(true);
            return;
          }
          setBody(text);
          setSealed(false);
        }}
        aria-label={`Open the card from ${from.name}`}
        className={cn(
          "group pressable relative flex aspect-[4/3] w-full flex-col items-center justify-end overflow-hidden rounded-3xl p-5",
          HUES[color],
          CARD_COLORS[color],
          !opening && "hover:animate-wiggle",
        )}
      >
        {/* Envelope flap */}
        <span
          aria-hidden
          className={cn(
            "absolute inset-x-0 top-0 h-1/2 origin-top bg-black/5 transition-transform duration-500 [clip-path:polygon(0_0,100%_0,50%_100%)]",
            opening && "[transform:rotateX(180deg)]",
          )}
        />
        <span aria-hidden className={cn("absolute top-[38%] text-4xl transition", opening && "scale-0")}>
          💌
        </span>
        <span className="relative flex items-center gap-2 font-heading text-lg font-extrabold">
          <PersonaAvatar person={from} size="sm" decorative />
          From {from.name}
        </span>
        <span className="relative font-bold text-hue-ink">{failed ? "Oops, try again" : "Tap to open ▶"}</span>
      </button>
    );
  }

  return (
    <article className={cn("flex flex-col gap-3 rounded-3xl p-5 shadow-sm ring-1 ring-black/5", HUES[color], CARD_COLORS[color], initiallySealed && "animate-pop")}>
      <header className="flex flex-wrap items-center gap-2 font-heading text-lg font-extrabold">
        <PersonaAvatar person={from} size="sm" decorative />
        <span className="mr-auto">From {from.name}</span>
        <ReadAloud text={`A card from ${from.name}. ${body}`} className="font-sans text-base" />
      </header>
      <p className="text-xl leading-relaxed">{body}</p>
    </article>
  );
}
