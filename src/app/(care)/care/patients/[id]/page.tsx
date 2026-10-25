import { ArrowLeft, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AiOffline, AiSummary } from "@/components/care/ai-summary";
import { NurseRoundForm } from "@/components/care/nurse-round-form";
import { PatientTabs } from "@/components/care/patient-tabs";
import { ThresholdsForm } from "@/components/care/thresholds-form";
import { AlertBadge } from "@/components/kit/alert-badge";
import { InteractionBars, MoodChart } from "@/components/kit/charts";
import { EmptyState } from "@/components/kit/empty-state";
import { MoodDot } from "@/components/kit/mood-dot";
import { PersonaAvatar } from "@/components/kit/persona-avatar";
import { getAiReport, missingAiSettings } from "@/lib/data/care-ai";
import { type CheckInView, getCheckins, moodSeries } from "@/lib/data/checkins";
import { getVisiblePatient, type VisiblePatient } from "@/lib/data/circle";
import { getThresholds } from "@/lib/data/nudges";
import { activitySummary } from "@/lib/checkin";
import { getActivityCounts } from "@/lib/data/activities";
import { type EngagementDay, getEngagement, todayOf } from "@/lib/data/engagement";
import { StatTile } from "@/components/kit/stat-tile";
import { dateTimeIn, relativeDay, timeIn, todayIn } from "@/lib/dates";
import { roundFromSaved } from "@/lib/nurse-round";
import { ALERT_LABELS, CARE_ALERTS, DEFAULT_THRESHOLDS } from "@/lib/demo-fixtures";
import { CloserIcon } from "@/components/icons/closer-icon";

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
  // No photos, no reactions: the care team reads mood, activity and note, plus counts.
  const [checkins, thresholds, activityCounts, engagement] = await Promise.all([
    getCheckins(id, patient.timezone, { days: 30 }),
    getThresholds(id),
    getActivityCounts(id, 7),
    getEngagement(id, 30),
  ]);
  const activitiesWeek = activityCounts.reduce((n, d) => n + d.completed, 0);
  const today = todayOf(engagement);
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
            <p className="text-muted-foreground">{today.familyContacts > 0 ? "Family in touch today" : "No family contact today"}</p>
          </div>
        </div>
        <AlertBadge count={alerts.length} />
      </header>
      <PatientTabs patientId={patient.id} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Check-ins, last 7 days" value={checkins.filter((c) => c.daysAgo < 7).length} />
        <StatTile label="Activities done, last 7 days" value={activitiesWeek} hint="Count only, no content" />
        <StatTile label="In app today" value={`${today.minutesInApp} min`} />
        <StatTile label="Latest mood" value={checkins[0] ? <MoodDot value={checkins[0].mood} className="text-xl" /> : "–"} />
      </div>

      {alerts.length > 0 && (
        <ul className="flex flex-col gap-2">
          {alerts.map((a) => (
            <li key={a.id} className="rounded-lg border border-alert/30 bg-alert-soft px-4 py-2">
              <span className="inline-flex items-center gap-1.5 font-bold text-alert"><CloserIcon name="alert" /> {ALERT_LABELS[a.kind]}</span> <span className="text-muted-foreground">· {a.detail}</span>
            </li>
          ))}
        </ul>
      )}

      <Suspense fallback={<AiLoading nickname={patient.nickname} />}>
        <AiSection patient={patient} checkins={checkins} engagement={engagement} />
      </Suspense>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border bg-card p-4">
          <MoodChart history={moodSeries(checkins, 30)} />
        </section>
        <section className="rounded-xl border bg-card p-4">
          <InteractionBars counts={engagement.slice(-14).map((d) => d.familyContacts)} />
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section aria-labelledby="timeline-title" className="flex flex-col gap-3">
          <h2 id="timeline-title" className="font-heading text-lg font-extrabold">
            Check-ins
          </h2>
          {checkins.length === 0 ? (
            <EmptyState icon="sprout" title="No check-ins yet">
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
                    {activitySummary(c.activities, c.activityNote)}
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

function AiLoading({ nickname }: { nickname: string }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
      <div className="flex min-h-64 animate-pulse flex-col gap-3 rounded-xl border bg-card p-5">
        <span className="h-5 w-40 rounded bg-muted" />
        <span className="h-4 w-24 rounded bg-muted" />
        <span className="mt-2 h-4 w-full rounded bg-muted" />
        <span className="h-4 w-5/6 rounded bg-muted" />
        <span className="mt-auto text-sm text-muted-foreground">Reading {nickname}&apos;s day…</span>
      </div>
      <div className="min-h-64 animate-pulse rounded-xl border bg-card" />
    </div>
  );
}

// Claude's summary next to the nurse's round: saving the round updates the summary. While
// the AI service is off, its last stored summary shows with its date, without the round.
async function AiSection({ patient, checkins, engagement }: { patient: VisiblePatient; checkins: CheckInView[]; engagement: EngagementDay[] }) {
  const today = todayIn(patient.timezone);
  const reading = await getAiReport({ patient, today, checkins, engagement });
  if (!reading) return <AiOffline missing={missingAiSettings()} />;
  const report = reading.value;
  const computed = report.assessment?.computed_at;
  if (reading.storedAt) {
    return (
      <AiSummary
        report={report}
        nickname={patient.nickname}
        computedAt={null}
        storedAt={dateTimeIn(reading.storedAt, patient.timezone)}
      />
    );
  }
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[1.1fr_1fr]">
      <AiSummary report={report} nickname={patient.nickname} computedAt={computed ? timeIn(computed, patient.timezone) : null} />
      <NurseRoundForm
        key={report.observation?.updated_at ?? "new"}
        patientId={patient.id}
        nickname={patient.nickname}
        initial={roundFromSaved(report.observation)}
        savedBy={report.observation ? (report.observation.observed_by ?? "the care team") : null}
        claude={report.claude}
      />
    </div>
  );
}
