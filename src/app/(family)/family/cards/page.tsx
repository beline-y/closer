import type { Metadata } from "next";
import { Suspense } from "react";
import { CardWriter } from "@/components/family/card-writer";

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
  return <CardWriter key={initialBody} initialBody={initialBody} />;
}
