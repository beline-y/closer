import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyState } from "@/components/kit/empty-state";
import { RevealCard } from "@/components/kit/reveal-card";
import { LiveRefresh } from "@/components/live-refresh";
import { ResultCard } from "@/components/activities/result-card";
import { NudgeReplies } from "@/components/nudge-replies";
import { NudgePanel } from "@/components/patient/nudge-panel";
import { CAST } from "@/lib/cast";
import { getMyPatient } from "@/lib/data/checkins";
import { getResults } from "@/lib/data/activities";
import { getVisibleCircle } from "@/lib/data/circle";
import { getNudgeState, getRepliesForPatient } from "@/lib/data/nudges";
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

      <Suspense fallback={<div className="min-h-64" />}>
        <Nudges />
      </Suspense>

      <Suspense fallback={null}>
        <SharedCreations />
      </Suspense>

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

// Buttons with the real cooldown, then the family's replies. Live: replies and a cooldown
// change by the care team show up without reloading.
async function Nudges() {
  const patient = await getMyPatient();
  if (!patient) return null;
  const [circle, state, replies] = await Promise.all([
    getVisibleCircle(),
    getNudgeState(patient.id),
    getRepliesForPatient(patient.id, patient.timezone),
  ]);
  return (
    <>
      <LiveRefresh
        channel={`patient-nudges-${patient.id}`}
        watch={[{ table: "nudge_recipients" }, { table: "patient_settings", filter: `patient_id=eq.${patient.id}` }]}
      />
      <NudgePanel circle={circle} cooldownMinutes={state.cooldownMinutes} lastSent={state.lastSent} serverNow={state.serverNow} />
      {replies.length > 0 && (
        <section aria-labelledby="replies-title" className="flex flex-col gap-4">
          <h2 id="replies-title" className="text-3xl font-extrabold">
            Your people answered 💌
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
    <section aria-labelledby="creations-title" className="flex flex-col gap-4">
      <LiveRefresh
        channel={`patient-shared-${patient.id}`}
        watch={[{ table: "activity_reactions" }, { table: "activity_comments" }, { table: "challenge_entries" }]}
      />
      <h2 id="creations-title" className="text-3xl font-extrabold">
        Your creations with your family 🎨
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
