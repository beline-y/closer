import "server-only";
import type { PatientRow } from "@/components/care/patients-table";
import { getAiOverview } from "@/lib/data/care-ai";
import { getCheckins, moodSeries } from "@/lib/data/checkins";
import { getVisiblePatients } from "@/lib/data/circle";
import { getEngagement, todayOf } from "@/lib/data/engagement";
import { dateTimeIn, todayIn } from "@/lib/dates";
import { CARE_ALERTS } from "@/lib/demo-fixtures";

// Patients, check-ins and engagement counts come from Supabase (only patients linked to the
// signed-in care team member; never photos or content). The AI reading comes from the AI
// service when it runs, else its last stored summary. Alerts are placeholder data until the
// care dashboard feature.
export async function getCarePatientRows(): Promise<{ rows: PatientRow[] }> {
  const patients = await getVisiblePatients();
  const year = new Date().getFullYear();
  // 30 days: the AI reads up to a month back; the table only shows the last 7.
  const children = await Promise.all(
    patients.map(async (p) => {
      const [checkins, engagement] = await Promise.all([getCheckins(p.id, p.timezone, { days: 30 }), getEngagement(p.id, 30)]);
      return { patient: p, today: todayIn(p.timezone), checkins, engagement };
    }),
  );
  const ai = await getAiOverview(children);
  const rows = children.map(({ patient: p, checkins, engagement }) => {
    const last = checkins[0];
    const today = todayOf(engagement);
    const reading = ai.get(p.id);
    return {
      id: p.id,
      name: p.nickname,
      member: p.member,
      age: p.birthYear ? year - p.birthYear : null,
      mood7: moodSeries(checkins, 7),
      lastCheckIn: last ? { daysAgo: last.daysAgo, time: last.time, mood: last.mood } : null,
      minutesToday: today.minutesInApp,
      familyContactToday: today.familyContacts > 0,
      alerts: CARE_ALERTS.filter((a) => a.patientId === p.id).length,
      ai: reading?.value ?? null,
      aiStoredAt: reading?.storedAt ? dateTimeIn(reading.storedAt, p.timezone) : null,
    };
  });
  return { rows };
}
