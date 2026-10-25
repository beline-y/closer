import type { Metadata } from "next";
import { Suspense } from "react";
import { AiOverviewCards } from "@/components/care/ai-overview";
import { AiOffline } from "@/components/care/ai-summary";
import { PatientsTable } from "@/components/care/patients-table";
import { StatTile } from "@/components/kit/stat-tile";
import { getCarePatientRows } from "@/lib/data/care";
import { missingAiSettings } from "@/lib/data/care-ai";

export const metadata: Metadata = { title: "Patients · Closer" };

export default function CarePatientsPage() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold">Hi Sarah</h1>
        <p className="text-muted-foreground">Your patients today. Mood, activity, meals and notes only: messages, cards and answers stay private.</p>
      </header>
      <Suspense fallback={<p className="text-muted-foreground">Loading patients and today&apos;s summaries…</p>}>
        <PatientsOverview />
      </Suspense>
    </>
  );
}

async function PatientsOverview() {
  const { rows } = await getCarePatientRows();
  const hasAi = rows.some((r) => r.ai);
  const checkedInToday = rows.filter((r) => r.lastCheckIn?.daysAgo === 0).length;
  const noFamily = rows.filter((r) => !r.familyContactToday).length;
  const alerts = rows.reduce((n, r) => n + r.alerts, 0);
  const needSupport = rows.filter((r) => r.ai && r.ai.level !== "stable").length;
  const cards = rows.flatMap((r) => (r.ai ? [{ id: r.id, name: r.name, member: r.member, ai: r.ai, storedAt: r.aiStoredAt }] : []));

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Patients" value={rows.length} />
        <StatTile label="Checked in today" value={`${checkedInToday}/${rows.length}`} />
        <StatTile label="No family contact today" value={noFamily} tone={noFamily ? "alert" : undefined} />
        <StatTile label="Open alerts" value={alerts} tone={alerts ? "alert" : undefined} />
        {hasAi && <StatTile label="Fragile or needs support" value={needSupport} tone={needSupport ? "alert" : undefined} hint="AI reading" />}
      </div>
      {hasAi ? <AiOverviewCards cards={cards} /> : <AiOffline missing={missingAiSettings()} />}
      <PatientsTable rows={rows} />
    </>
  );
}
