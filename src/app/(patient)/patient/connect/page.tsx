import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyState } from "@/components/kit/empty-state";
import { RevealCard } from "@/components/kit/reveal-card";
import { LiveRefresh } from "@/components/live-refresh";
import { ResultCard } from "@/components/activities/result-card";
import { NudgeReplies } from "@/components/nudge-replies";
import { NudgePanel } from "@/components/patient/nudge-panel";
import { SealedCards } from "@/components/patient/sealed-cards";
import { getOpenedCards, getSealedCards } from "@/lib/data/cards";
import { getMyPatient } from "@/lib/data/checkins";
import { getResults } from "@/lib/data/activities";
import { getVisibleCircle } from "@/lib/data/circle";
import { getNudgeState, getRepliesForPatient } from "@/lib/data/nudges";

export const metadata: Metadata = { title: "Connect · Closer" };

// Nudges first, in one compact row; then the cards waiting, the replies, and the creations.
export default function PatientConnectPage() {
  return (
    <>
      <h1 className="sr-only">Connect</h1>
      <Suspense fallback={<div className="min-h-24" />}>
        <Nudges />
      </Suspense>

      <Suspense fallback={<div className="min-h-48" />}>
        <Cards />
      </Suspense>

      <Suspense fallback={null}>
        <Replies />
      </Suspense>

      <Suspense fallback={null}>
        <SharedCreations />
      </Suspense>
    </>
  );
}

// The five nudges with their real cooldown. Live: a cooldown change by the care team shows
// up without reloading.
async function Nudges() {
  const patient = await getMyPatient();
  if (!patient) return null;
  const [circle, state] = await Promise.all([getVisibleCircle(), getNudgeState(patient.id)]);
  return (
    <section aria-label="Tell your people" className="flex flex-col gap-2">
      <LiveRefresh channel={`patient-nudge-settings-${patient.id}`} watch={[{ table: "patient_settings", filter: `patient_id=eq.${patient.id}` }]} />
      <NudgePanel circle={circle} cooldownMinutes={state.cooldownMinutes} lastSent={state.lastSent} serverNow={state.serverNow} />
    </section>
  );
}

// Sealed cards to open (no text until opened), then the archive Leo can reread.
async function Cards() {
  const patient = await getMyPatient();
  if (!patient) return null;
  const [sealed, opened] = await Promise.all([getSealedCards(), getOpenedCards(patient.id, patient.timezone)]);
  return (
    <>
      <section aria-labelledby="cards-title" className="flex flex-col gap-3">
        <h2 id="cards-title" className="text-2xl font-extrabold">
          Cards for you
        </h2>
        {sealed.length === 0 ? (
          <EmptyState icon="card" title="No new cards right now">
            When someone writes you a card, it will wait for you here.
          </EmptyState>
        ) : (
          <SealedCards cards={sealed} />
        )}
      </section>
      {opened.length > 0 && (
        <section aria-labelledby="archive-title" className="flex flex-col gap-3">
          <h2 id="archive-title" className="text-2xl font-extrabold">
            Cards you kept
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {opened.map((c) => (
              <li key={c.id}>
                <RevealCard from={c.from} body={c.body} color={c.color} sealed={false} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

// The family's replies to Leo's nudges, live.
async function Replies() {
  const patient = await getMyPatient();
  if (!patient) return null;
  const replies = await getRepliesForPatient(patient.id, patient.timezone);
  return (
    <>
      <LiveRefresh channel={`patient-nudges-${patient.id}`} watch={[{ table: "nudge_recipients" }]} />
      {replies.length > 0 && (
        <section aria-labelledby="replies-title" className="flex flex-col gap-3">
          <h2 id="replies-title" className="text-2xl font-extrabold">
            Your people answered
          </h2>
          <NudgeReplies replies={replies.slice(0, 6)} />
        </section>
      )}
    </>
  );
}

// What the family said about the creations Leo shared (reactions and comments, live).
async function SharedCreations() {
  const patient = await getMyPatient();
  if (!patient) return null;
  const shared = (await getResults(patient.id, patient.timezone, { days: 14, sharedOnly: true })).filter((r) => r.reactions.length || r.comments.length || (r.activity.type === "challenge" && r.partnerEntry));
  if (shared.length === 0) return null;
  return (
    <section aria-labelledby="creations-title" className="flex flex-col gap-3">
      <LiveRefresh
        channel={`patient-shared-${patient.id}`}
        watch={[{ table: "activity_reactions" }, { table: "activity_comments" }, { table: "challenge_entries" }]}
      />
      <h2 id="creations-title" className="text-2xl font-extrabold">
        Your creations with your family
      </h2>
      <ul className="grid gap-4 md:grid-cols-2">
        {shared.map((r) => (
          <li key={r.id}>
            <ResultCard result={r} viewer="patient" me={patient.id} />
          </li>
        ))}
      </ul>
    </section>
  );
}
