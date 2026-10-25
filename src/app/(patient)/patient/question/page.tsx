import type { Metadata } from "next";
import Link from "next/link";
import { QuestionFlow } from "@/components/question-flow";

export const metadata: Metadata = { title: "Question · Closer" };

export default function PatientQuestionPage() {
  return (
    <>
      <Link href="/patient" className="min-h-11 self-start content-center rounded-full px-3 font-bold text-muted-foreground hover:bg-muted">
        ← Today
      </Link>
      <h1 className="text-4xl font-extrabold">Question time ❓</h1>
      <QuestionFlow viewer="leo" />
    </>
  );
}
