import "server-only";
import { createClient } from "@/lib/supabase/server";

// The one source for "is the family in touch" and "time in app": the patients table, the
// interactions chart and the AI input all read this, so they always tell the same story.
// Counts only (care_engagement() never returns content), care team of the child only.

export type EngagementDay = { date: string; familyContacts: number; minutesInApp: number };

/** The last `days` days, oldest first, ending with the child's today. Empty if not allowed. */
export async function getEngagement(patientId: string, days: number): Promise<EngagementDay[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("care_engagement", { p_patient_id: patientId, p_days: days });
  if (error) {
    console.error("care_engagement failed", error.code);
    return [];
  }
  return (data ?? []).map((d) => ({ date: d.local_date, familyContacts: d.family_contacts, minutesInApp: d.minutes_in_app }));
}

export const todayOf = (days: EngagementDay[]) => days.at(-1) ?? { date: "", familyContacts: 0, minutesInApp: 0 };
