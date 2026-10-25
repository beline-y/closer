import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ActivityRunner } from "@/components/activities/activity-runner";
import { getActivity, getDraft } from "@/lib/data/activities";
import { getMyPatient } from "@/lib/data/checkins";
import { getVisibleCircle } from "@/lib/data/circle";

export const metadata: Metadata = { title: "Activity · Closer" };

export default function PatientActivityPage({ params, searchParams }: PageProps<"/patient/activities/[id]">) {
  return (
    <Suspense fallback={<p className="text-xl text-muted-foreground">Getting ready…</p>}>
      <Runner params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Runner({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: PageProps<"/patient/activities/[id]">["searchParams"] }) {
  const [{ id }, { session }] = await Promise.all([params, searchParams]);
  const [patient, activity, circle, resume] = await Promise.all([
    getMyPatient(),
    getActivity(id),
    getVisibleCircle(),
    typeof session === "string" ? getDraft(session) : null,
  ]);
  if (!patient) redirect("/");
  if (!activity) notFound();
  return <ActivityRunner key={resume?.sessionId ?? "new"} activity={activity} patientId={patient.id} circle={circle} resume={resume} />;
}
