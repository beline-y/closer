import type { Metadata } from "next";
import { QuestionFlow } from "@/components/question-flow";

export const metadata: Metadata = { title: "Question · Closer" };

export default function PatientQuestionPage() {
  return (
    <>
      <h1 className="text-4xl font-extrabold">Question time ❓</h1>
      <QuestionFlow viewer="leo" />
    </>
  );
}
