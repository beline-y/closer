import "server-only";
import type { PatientRow } from "@/components/care/patients-table";
import { getCheckins, moodSeries } from "@/lib/data/checkins";
import { getVisiblePatients } from "@/lib/data/circle";
import { CARE_ALERTS, CARE_METRICS } from "@/lib/demo-fixtures";

// Patients and check-ins come from Supabase (only patients linked to the signed-in care
// team member; never photos). Time in app, family contact and alerts are placeholder data
// until the care dashboard feature.
export async function getCarePatientRows(): Promise<PatientRow[]> {
  const patients = await getVisiblePatients();
  const year = new Date().getFullYear();
  return Promise.all(
    patients.map(async (p) => {
      const checkins = await getCheckins(p.id, p.timezone, { days: 7 });
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
      };
    }),
  );
}
