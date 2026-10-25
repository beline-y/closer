import type { Metadata } from "next";
import { Suspense } from "react";
import { getResults } from "@/lib/data/activities";
import { getVisiblePatients } from "@/lib/data/circle";
import { resultsAsMemories } from "@/lib/memories";
import { MemoriesAlbum } from "@/components/memories-album";

export const metadata: Metadata = { title: "Memories · Closer" };

export default function PatientMemoriesPage() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-4xl font-extrabold">Memories 📸</h1>
        <p className="text-xl text-muted-foreground">Happy moments with your family.</p>
      </header>
      <Suspense fallback={<MemoriesAlbum viewer="leo" big />}>
        <Album />
      </Suspense>
    </>
  );
}

async function Album() {
  const [leo] = await getVisiblePatients();
  const results = leo ? await getResults(leo.id, leo.timezone, { days: 90, memoriesOnly: true }) : [];
  return <MemoriesAlbum viewer="leo" big fromActivities={resultsAsMemories(results)} />;
}
