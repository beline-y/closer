import "server-only";
import type { PatientRow } from "@/components/care/patients-table";
import { getVisiblePatients } from "@/lib/data/circle";
import { CARE_ALERTS, CARE_METRICS, CHECKINS, MOOD_HISTORY } from "@/lib/demo-fixtures";

// Patients come from Supabase (only those linked to the signed-in care team member).
// Metrics are placeholder data until mood check-ins and sessions exist.
export async function getCarePatientRows(): Promise<PatientRow[]> {
  const patients = await getVisiblePatients();
  const year = new Date().getFullYear();
  return patients.map((p) => {
    const last = CHECKINS[p.id]?.[0];
    const metrics = CARE_METRICS[p.id];
    return {
      id: p.id,
      name: p.nickname,
      member: p.member,
      age: p.birthYear ? year - p.birthYear : null,
      mood7: (MOOD_HISTORY[p.id] ?? []).slice(-7),
      lastCheckIn: last ? { daysAgo: last.daysAgo, time: last.time, mood: last.mood } : null,
      minutesToday: metrics?.minutesInAppToday ?? 0,
      familyContactToday: metrics?.familyContactToday ?? false,
      alerts: CARE_ALERTS.filter((a) => a.patientId === p.id).length,
    };
  });
}
