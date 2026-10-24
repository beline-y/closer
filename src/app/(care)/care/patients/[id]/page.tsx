import { ArrowLeft, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ThresholdsForm } from "@/components/care/thresholds-form";
import { AlertBadge } from "@/components/kit/alert-badge";
import { InteractionBars, MoodChart } from "@/components/kit/charts";
import { EmptyState } from "@/components/kit/empty-state";
import { MoodDot } from "@/components/kit/mood-dot";
import { PersonaAvatar } from "@/components/kit/persona-avatar";
import { getCheckins, moodSeries } from "@/lib/data/checkins";
import { getVisiblePatient } from "@/lib/data/circle";
import { getThresholds } from "@/lib/data/nudges";
import { activitySummary, mealSummary } from "@/lib/checkin";
import { relativeDay } from "@/lib/dates";
import { ALERT_LABELS, CARE_ALERTS, CARE_METRICS, DEFAULT_THRESHOLDS } from "@/lib/demo-fixtures";

export const metadata: Metadata = { title: "Patient · Closer" };

export default function CarePatientPage({ params }: PageProps<"/care/patients/[id]">) {
  return (
    <>
      <Link href="/care" className="inline-flex min-h-11 items-center gap-2 self-start font-bold text-role-care-ink hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> All patients
      </Link>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <PatientDetail params={params} />
      </Suspense>
    </>
  );
}

async function PatientDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // RLS: only returns the patient if Sarah is linked to them.
  const patient = await getVisiblePatient(id);
  if (!patient) notFound();

  const alerts = CARE_ALERTS.filter((a) => a.patientId === id);
  // No photos, no reactions: the care team reads mood, activity, meal and note only.
  const [checkins, thresholds] = await Promise.all([getCheckins(id, patient.timezone, { days: 30 }), getThresholds(id)]);
  const metrics = CARE_METRICS[id];
  const age = patient.birthYear ? new Date().getFullYear() - patient.birthYear : null;

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {patient.member && <PersonaAvatar person={patient.member} size="lg" decorative />}
          <div>
            <h1 className="text-2xl font-extrabold">
              {patient.nickname}
              {age !== null && <span className="ml-2 font-normal text-muted-foreground">{age} years</span>}
            </h1>
            <p className="text-muted-foreground">{metrics?.familyContactToday ? "Family in touch today" : "No family contact today"}</p>
          </div>
        </div>
        <AlertBadge count={alerts.length} />
      </header>

      {alerts.length > 0 && (
        <ul className="flex flex-col gap-2">
          {alerts.map((a) => (
            <li key={a.id} className="rounded-lg border border-alert/30 bg-alert-soft px-4 py-2">
              <span className="font-bold text-alert">⚠ {ALERT_LABELS[a.kind]}</span> <span className="text-muted-foreground">· {a.detail}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border bg-card p-4">
          <MoodChart history={moodSeries(checkins, 30)} />
        </section>
        <section className="rounded-xl border bg-card p-4">
          <InteractionBars counts={metrics?.interactions ?? []} />
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section aria-labelledby="timeline-title" className="flex flex-col gap-3">
          <h2 id="timeline-title" className="font-heading text-lg font-extrabold">
            Check-ins
          </h2>
          {checkins.length === 0 ? (
            <EmptyState emoji="🌱" title="No check-ins yet">
              They&apos;ll appear here as soon as {patient.nickname} shares a mood.
            </EmptyState>
          ) : (
            <ol className="flex flex-col gap-2">
              {checkins.slice(0, 14).map((c) => (
                <li key={c.id} className="flex flex-col gap-1 rounded-lg border bg-card px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                  <span className="w-36 shrink-0 text-sm text-muted-foreground">
                    {relativeDay(c.daysAgo)}, {c.time}
                  </span>
                  <MoodDot value={c.mood} className="w-32 shrink-0 font-bold" />
                  <span className="text-sm">
                    {[activitySummary(c.activities, c.activityNote), mealSummary(c.meals, c.mealAmount, c.mealNote)].filter(Boolean).join(" · ")}
                    {c.note && <span className="block text-muted-foreground">“{c.note}”</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Lock className="size-4" aria-hidden /> Photos, cards, question answers, memories and the private journal are never shown to the care team.
          </p>
        </section>
        <ThresholdsForm title={`Thresholds for ${patient.nickname}`} patientId={id} initial={thresholds ?? DEFAULT_THRESHOLDS} />
      </div>
    </>
  );
}
