import type { Metadata } from "next";
import { Suspense } from "react";
import { AiOverviewCards } from "@/components/care/ai-overview";
import { AiOffline } from "@/components/care/ai-summary";
import { PatientsTable } from "@/components/care/patients-table";
import { WardMenuForm } from "@/components/care/ward-menu-form";
import { StatTile } from "@/components/kit/stat-tile";
import { getCarePatientRows } from "@/lib/data/care";
import { aiConfigured, getWardMenu, missingAiSettings } from "@/lib/data/care-ai";
import { getVisiblePatients } from "@/lib/data/circle";
import { todayIn } from "@/lib/dates";

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
      <Suspense fallback={null}>
        <TodaysMenu />
      </Suspense>
    </>
  );
}

async function PatientsOverview() {
  const { rows, aiAnswered } = await getCarePatientRows();
  const checkedInToday = rows.filter((r) => r.lastCheckIn?.daysAgo === 0).length;
  const noFamily = rows.filter((r) => !r.familyContactToday).length;
  const alerts = rows.reduce((n, r) => n + r.alerts, 0);
  const needSupport = rows.filter((r) => r.ai && r.ai.level !== "stable").length;
  const cards = rows.flatMap((r) => (r.ai ? [{ id: r.id, name: r.name, member: r.member, ai: r.ai }] : []));

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Patients" value={rows.length} />
        <StatTile label="Checked in today" value={`${checkedInToday}/${rows.length}`} />
        <StatTile label="No family contact today" value={noFamily} tone={noFamily ? "alert" : undefined} />
        <StatTile label="Open alerts" value={alerts} tone={alerts ? "alert" : undefined} />
        {aiAnswered && <StatTile label="Fragile or needs support" value={needSupport} tone={needSupport ? "alert" : undefined} hint="AI reading" />}
      </div>
      {aiAnswered ? cards.length > 0 && <AiOverviewCards cards={cards} /> : <AiOffline missing={missingAiSettings()} />}
      <PatientsTable rows={rows} />
    </>
  );
}

async function TodaysMenu() {
  if (!aiConfigured()) return null;
  const [first] = await getVisiblePatients();
  const menu = await getWardMenu(todayIn(first?.timezone ?? "UTC"));
  return menu ? <WardMenuForm initial={menu} /> : null;
}
