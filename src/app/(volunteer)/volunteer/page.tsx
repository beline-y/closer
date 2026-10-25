import type { Metadata } from "next";
import { Suspense } from "react";
import { VolunteerQuestions } from "@/components/volunteer/volunteer-questions";
import { getVolunteerSubmissions } from "@/lib/data/volunteer-submissions";

export const metadata: Metadata = { title: "Questions · Closer" };

export default function VolunteerQuestionsPage() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold">Hi Maya</h1>
        <p className="text-lg text-muted-foreground">Your answers inspire kids in hospital. They never see who you are beyond your story card, and you never see who they are.</p>
      </header>
      <Suspense fallback={<p>Loading your messages…</p>}><QuestionsWithMessages /></Suspense>
    </>
  );
}

async function QuestionsWithMessages() {
  const { submissions, error } = await getVolunteerSubmissions();
  return <>{error && <p role="alert" className="text-alert">{error}</p>}<VolunteerQuestions me="maya" submissions={submissions.filter((s) => s.kind === "question_answer")} /></>;
}
