import type { Metadata } from "next";
import { Suspense } from "react";
import { AiOffline } from "@/components/care/ai-summary";
import { VolunteerMatches } from "@/components/care/volunteer-matches";
import { VolunteersAdmin } from "@/components/care/volunteers-admin";
import { getMatchBoard, missingAiSettings } from "@/lib/data/care-ai";
import { getVisiblePatients } from "@/lib/data/circle";
import { getVolunteerSubmissions } from "@/lib/data/volunteer-submissions";
import { getAnswersToReview } from "@/lib/data/daily-question";
import { daysBetween, todayIn } from "@/lib/dates";

export const metadata: Metadata = { title: "Volunteers · Closer" };

export default function CareVolunteersPage() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold">Volunteers</h1>
        <p className="text-muted-foreground">You decide what volunteers can see. They never see a patient&apos;s name, age, photo or unit.</p>
      </header>
      <Suspense fallback={<p>Loading applicant messages…</p>}><VolunteerReviews /></Suspense>
    </>
  );
}

async function VolunteerReviews() {
  const [{ submissions, error }, shared] = await Promise.all([getVolunteerSubmissions(), getAnswersToReview()]);
  const today = todayIn("America/New_York");
  const answers = shared.map((a) => ({
    id: a.answer_id,
    patientId: a.patient_id,
    question: a.question,
    masked: a.masked,
    daysAgo: daysBetween(today, new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(a.created_at))),
  }));
  const matches = (
    <Suspense fallback={<p className="text-muted-foreground">Matching children and volunteers…</p>}>
      <Matches />
    </Suspense>
  );
  return <VolunteersAdmin submissions={submissions} loadError={error} answers={answers} matches={matches} />;
}

// This week's AI suggestions, for the children this care team member follows (RLS).
async function Matches() {
  const patients = await getVisiblePatients();
  const board = await getMatchBoard(todayIn(patients[0]?.timezone ?? "America/New_York"));
  if (!board) return <AiOffline missing={missingAiSettings()} />;
  return <VolunteerMatches board={board} />;
}
