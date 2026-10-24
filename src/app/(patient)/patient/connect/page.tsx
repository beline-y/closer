import type { Metadata } from "next";
import { EmptyState } from "@/components/kit/empty-state";
import { RevealCard } from "@/components/kit/reveal-card";
import { NudgePanel } from "@/components/patient/nudge-panel";
import { CAST } from "@/lib/cast";
import { COMFORT_CARDS } from "@/lib/demo-fixtures";

export const metadata: Metadata = { title: "Connect · Closer" };

export default function PatientConnectPage() {
  const sealed = COMFORT_CARDS.filter((c) => c.sealed);
  const opened = COMFORT_CARDS.filter((c) => !c.sealed);

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-4xl font-extrabold">Connect 💛</h1>
        <p className="text-xl text-muted-foreground">Tap to tell your people.</p>
      </header>

      <NudgePanel />

      <section aria-labelledby="cards-title" className="flex flex-col gap-4">
        <h2 id="cards-title" className="text-3xl font-extrabold">
          Cards for you 💌
        </h2>
        {sealed.length === 0 ? (
          <EmptyState emoji="📬" title="No new cards right now">
            When someone writes you a card, it will wait for you here.
          </EmptyState>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {sealed.map((c) => (
              <li key={c.id}>
                <RevealCard from={CAST[c.from]} body={c.body} color={c.color} sealed />
              </li>
            ))}
          </ul>
        )}
      </section>

      {opened.length > 0 && (
        <section aria-labelledby="archive-title" className="flex flex-col gap-4">
          <h2 id="archive-title" className="text-2xl font-extrabold">
            Cards you kept
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {opened.map((c) => (
              <li key={c.id}>
                <RevealCard from={CAST[c.from]} body={c.body} color={c.color} sealed={false} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
