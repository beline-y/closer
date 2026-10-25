import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FamilyChallenge } from "@/components/family/family-challenge";
import { EmptyState } from "@/components/kit/empty-state";
import { getMyPendingChallenges } from "@/lib/data/activities";

export const metadata: Metadata = { title: "Challenge · Closer" };

export default function FamilyChallengePage({ params }: PageProps<"/family/challenge/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <Challenge params={params} />
    </Suspense>
  );
}

async function Challenge({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Only challenges waiting for the signed-in family member (title, never Leo's drawing).
  const challenge = (await getMyPendingChallenges()).find((c) => c.session_id === id);
  if (!challenge) {
    // Done (or just finished): both drawings are revealed in the feed.
    return (
      <EmptyState icon="challenge" title="Revealed! You both finished">
        <Link href="/family" className="font-bold text-role-family-ink underline-offset-4 hover:underline">
          See both drawings side by side in the feed
        </Link>
      </EmptyState>
    );
  }
  return <FamilyChallenge sessionId={challenge.session_id} patientId={challenge.patient_id} title={challenge.title} theme={challenge.theme} emoji={challenge.emoji} />;
}
