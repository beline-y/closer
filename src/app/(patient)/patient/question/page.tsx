import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { QuestionScreen } from "@/components/question-screen";
import { getMyPatient } from "@/lib/data/checkins";

export const metadata: Metadata = { title: "Question · Closer" };

export default function PatientQuestionPage() {
  return (
    <>
      <Link href="/patient" className="min-h-11 self-start content-center rounded-full px-3 font-bold text-muted-foreground hover:bg-muted">
        Back to Today
      </Link>
      <h1 className="text-4xl font-extrabold">Question time</h1>
      <Suspense fallback={<p className="text-lg text-muted-foreground">Getting today&apos;s question…</p>}>
        <Question />
      </Suspense>
    </>
  );
}

async function Question() {
  const patient = await getMyPatient();
  if (!patient) redirect("/");
  return <QuestionScreen patientId={patient.id} isLeo />;
}
