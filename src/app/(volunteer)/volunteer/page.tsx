import type { Metadata } from "next";
import { VolunteerQuestions } from "@/components/volunteer/volunteer-questions";

export const metadata: Metadata = { title: "Questions · Closer" };

export default function VolunteerQuestionsPage() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold">Hi Maya 🐬</h1>
        <p className="text-lg text-muted-foreground">Your answers inspire kids in hospital. They never see who you are beyond your story card, and you never see who they are.</p>
      </header>
      <VolunteerQuestions me="maya" />
    </>
  );
}
