import type { Metadata } from "next";
import { Suspense } from "react";
import { getResults } from "@/lib/data/activities";
import { getVisiblePatients } from "@/lib/data/circle";
import { resultsAsMemories } from "@/lib/memories";
import { MemoriesAlbum } from "@/components/memories-album";

export const metadata: Metadata = { title: "Memories · Closer" };

export default function FamilyMemoriesPage() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold">Memories with Leo 📸</h1>
        <p className="text-lg text-muted-foreground">A shared album. Leo sees the same photos.</p>
      </header>
      <Suspense fallback={<MemoriesAlbum viewer="emma" />}>
        <Album />
      </Suspense>
    </>
  );
}

async function Album() {
  const [leo] = await getVisiblePatients();
  const results = leo ? await getResults(leo.id, leo.timezone, { days: 90, memoriesOnly: true }) : [];
  return <MemoriesAlbum viewer="emma" fromActivities={resultsAsMemories(results)} />;
}
