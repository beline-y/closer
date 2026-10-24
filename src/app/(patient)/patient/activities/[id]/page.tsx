import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ActivityRunner } from "@/components/activities/activity-runner";
import { getActivity } from "@/lib/data/activities";
import { getMyPatient } from "@/lib/data/checkins";
import { getVisibleCircle } from "@/lib/data/circle";

export const metadata: Metadata = { title: "Activity · Closer" };

export default function PatientActivityPage({ params }: PageProps<"/patient/activities/[id]">) {
  return (
    <Suspense fallback={<p className="text-xl text-muted-foreground">Getting ready…</p>}>
      <Runner params={params} />
    </Suspense>
  );
}

async function Runner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [patient, activity, circle] = await Promise.all([getMyPatient(), getActivity(id), getVisibleCircle()]);
  if (!patient) redirect("/");
  if (!activity) notFound();
  return <ActivityRunner activity={activity} patientId={patient.id} circle={circle} />;
}
