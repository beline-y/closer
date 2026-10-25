import "server-only";
import { createClient } from "@/lib/supabase/server";
import { SUBMISSION_FIELDS, type VolunteerSubmission } from "@/lib/volunteer-submissions";

export async function getVolunteerSubmissions(): Promise<{ submissions: VolunteerSubmission[]; error?: string }> {
  try {
    const db = await createClient();
    // Own messages for volunteers; all applicant messages for authenticated care
    // staff. RLS returns none for patients and families.
    const { data, error } = await db.from("volunteer_submissions").select(SUBMISSION_FIELDS).order("created_at", { ascending: false });
    if (error) return { submissions: [], error: "Applicant message review is unavailable. Please refresh or contact the team." };
    return { submissions: data ?? [] };
  } catch {
    return { submissions: [], error: "Applicant message review is unavailable. Please sign in and try again." };
  }
}
