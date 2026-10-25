import "server-only";
import type { PatientRow } from "@/components/care/patients-table";
import { getAiOverview } from "@/lib/data/care-ai";
import { getCheckins, moodSeries } from "@/lib/data/checkins";
import { getVisiblePatients } from "@/lib/data/circle";
import { todayIn } from "@/lib/dates";
import { CARE_ALERTS, CARE_METRICS } from "@/lib/demo-fixtures";

// Patients and check-ins come from Supabase (only patients linked to the signed-in care
// team member; never photos). The AI reading comes from the AI service when it runs.
// Time in app, family contact and alerts are placeholder data until the care dashboard feature.
export async function getCarePatientRows(): Promise<{ rows: PatientRow[]; aiAnswered: boolean }> {
  const patients = await getVisiblePatients();
  const year = new Date().getFullYear();
  // 30 days: the AI reads up to a month back; the table only shows the last 7.
  const children = await Promise.all(
    patients.map(async (p) => ({ patient: p, today: todayIn(p.timezone), checkins: await getCheckins(p.id, p.timezone, { days: 30 }) })),
  );
  const ai = await getAiOverview(children);
  const rows = children.map(({ patient: p, checkins }) => {
    const last = checkins[0];
    const metrics = CARE_METRICS[p.id];
    return {
      id: p.id,
      name: p.nickname,
      member: p.member,
      age: p.birthYear ? year - p.birthYear : null,
      mood7: moodSeries(checkins, 7),
      lastCheckIn: last ? { daysAgo: last.daysAgo, time: last.time, mood: last.mood } : null,
      minutesToday: metrics?.minutesInAppToday ?? 0,
      familyContactToday: metrics?.familyContactToday ?? false,
      alerts: CARE_ALERTS.filter((a) => a.patientId === p.id).length,
      ai: ai?.get(p.id) ?? null,
    };
  });
  return { rows, aiAnswered: ai !== null };
}
