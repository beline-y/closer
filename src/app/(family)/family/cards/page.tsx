import type { Metadata } from "next";
import { Suspense } from "react";
import { CardWriter } from "@/components/family/card-writer";
import { LiveRefresh } from "@/components/live-refresh";
import { getMyCards } from "@/lib/data/cards";
import { getVisiblePatients } from "@/lib/data/circle";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Cards · Closer" };

export default function FamilyCardsPage({ searchParams }: { searchParams: Promise<{ idea?: string | string[] }> }) {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold">Comfort cards 💌</h1>
        <p className="text-lg text-muted-foreground">A sealed card waits for Leo until the right moment.</p>
      </header>
      <Suspense fallback={<p>Opening your card draft…</p>}><DraftWriter searchParams={searchParams} /></Suspense>
    </>
  );
}

async function DraftWriter({ searchParams }: { searchParams: Promise<{ idea?: string | string[] }> }) {
  const { idea } = await searchParams;
  const initialBody = typeof idea === "string" ? idea.trim().slice(0, 1000) : "";
  const supabase = await createClient();
  const [{ data: claims }, [leo]] = await Promise.all([supabase.auth.getClaims(), getVisiblePatients()]);
  const me = claims?.claims.sub ?? "";
  const cards = leo ? await getMyCards(me, leo.id, leo.timezone) : [];
  return (
    <>
      {/* "Leo opened your card" arrives live (Realtime, the author's own rows only). */}
      <LiveRefresh channel={`family-cards-${me}`} watch={[{ table: "comfort_cards", filter: `author_id=eq.${me}` }]} />
      <CardWriter key={initialBody} initialBody={initialBody} cards={cards} />
    </>
  );
}
