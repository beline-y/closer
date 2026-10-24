import type { Metadata } from "next";
import { CardWriter } from "@/components/family/card-writer";

export const metadata: Metadata = { title: "Cards · Closer" };

export default function FamilyCardsPage() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold">Comfort cards 💌</h1>
        <p className="text-lg text-muted-foreground">A sealed card waits for Leo until the right moment.</p>
      </header>
      <CardWriter />
    </>
  );
}
