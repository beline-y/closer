import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AiOffline } from "@/components/care/ai-summary";
import { DrawingUpload } from "@/components/care/drawing-upload";
import { DrawingsView } from "@/components/care/drawings-view";
import { PatientTabs } from "@/components/care/patient-tabs";
import { PersonaAvatar } from "@/components/kit/persona-avatar";
import { getDrawingsView, missingAiSettings } from "@/lib/data/care-ai";
import { getVisiblePatient, type VisiblePatient } from "@/lib/data/circle";
import { todayIn } from "@/lib/dates";

export const metadata: Metadata = { title: "Drawings · Closer" };

export default function CarePatientDrawingsPage({ params }: PageProps<"/care/patients/[id]/drawings">) {
  return (
    <>
      <Link href="/care" className="inline-flex min-h-11 items-center gap-2 self-start font-bold text-role-care-ink hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> All patients
      </Link>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Drawings params={params} />
      </Suspense>
    </>
  );
}

async function Drawings({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // RLS: only returns the patient if this care team member is linked to them.
  const patient = await getVisiblePatient(id);
  if (!patient) notFound();
  const age = patient.birthYear ? new Date().getFullYear() - patient.birthYear : null;

  return (
    <>
      <header className="flex items-center gap-4">
        {patient.member && <PersonaAvatar person={patient.member} size="lg" decorative />}
        <h1 className="text-2xl font-extrabold">
          {patient.nickname}
          {age !== null && <span className="ml-2 font-normal text-muted-foreground">{age} years</span>}
        </h1>
      </header>
      <PatientTabs patientId={patient.id} />
      <Suspense fallback={<p className="text-muted-foreground">Loading {patient.nickname}&apos;s drawings…</p>}>
        <DrawingsSection patient={patient} />
      </Suspense>
    </>
  );
}

async function DrawingsSection({ patient }: { patient: VisiblePatient }) {
  const view = await getDrawingsView(patient.id, todayIn(patient.timezone));
  if (!view) return <AiOffline missing={missingAiSettings()} />;
  return (
    <>
      <DrawingUpload patientId={patient.id} nickname={patient.nickname} />
      <DrawingsView view={view} nickname={patient.nickname} />
    </>
  );
}
