import type { Metadata } from "next";
import { QuestionFlow } from "@/components/question-flow";

export const metadata: Metadata = { title: "Question · Closer" };

export default function FamilyQuestionPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <h1 className="text-3xl font-extrabold">Question of the day</h1>
      <QuestionFlow viewer="emma" />
    </div>
  );
}
