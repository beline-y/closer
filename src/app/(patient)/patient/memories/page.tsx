import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHero } from "@/components/kit/page-hero";
import { getResults } from "@/lib/data/activities";
import { getVisiblePatients } from "@/lib/data/circle";
import { resultsAsMemories } from "@/lib/memories";
import { MemoriesAlbum } from "@/components/memories-album";

export const metadata: Metadata = { title: "Memories · Closer" };

export default function PatientMemoriesPage() {
  return (
    <>
      <PageHero emoji="📸" title="Memories" hue="sky" listen="Memories. Happy moments with your family.">
        Happy moments with your family.
      </PageHero>
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
