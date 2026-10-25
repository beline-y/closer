import type { Metadata } from "next";
import { Suspense } from "react";
import { QuestionScreen } from "@/components/question-screen";
import { getVisiblePatients } from "@/lib/data/circle";

export const metadata: Metadata = { title: "Question · Closer" };

export default function FamilyQuestionPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <h1 className="text-3xl font-extrabold">Question of the day</h1>
      <Suspense fallback={<p className="text-muted-foreground">Getting today&apos;s question…</p>}>
        <Question />
      </Suspense>
    </div>
  );
}

async function Question() {
  const [leo] = await getVisiblePatients();
  if (!leo) return <p className="text-muted-foreground">You&apos;re not linked to a patient yet.</p>;
  return <QuestionScreen patientId={leo.id} isLeo={false} />;
}
