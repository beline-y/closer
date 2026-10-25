"use client";

import { openCard } from "@/app/card-actions";
import { RevealCard } from "@/components/kit/reveal-card";
import type { SealedCard } from "@/lib/data/cards";

// Each envelope opens once; the text only arrives from the database at that moment.
export function SealedCards({ cards }: { cards: SealedCard[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {cards.map((c) => (
        <li key={c.id}>
          <RevealCard
            from={c.from}
            color={c.color}
            sealed
            onOpen={async () => {
              const r = await openCard(c.id);
              return r.ok ? r.body : null;
            }}
          />
        </li>
      ))}
    </ul>
  );
}
