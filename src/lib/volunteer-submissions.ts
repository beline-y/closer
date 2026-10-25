import type { Database } from "@/lib/supabase/database.types";

export const SUBMISSION_FIELDS = "id,volunteer_name,kind,context_key,context_label,body,screening_state,categories,explanation,evidence,status,created_at" as const;
export type VolunteerSubmission = Pick<Database["public"]["Tables"]["volunteer_submissions"]["Row"],
  "id" | "volunteer_name" | "kind" | "context_key" | "context_label" | "body" | "screening_state" | "categories" | "explanation" | "evidence" | "status" | "created_at">;
export function submissionView(s: VolunteerSubmission): VolunteerSubmission {
  const { id, volunteer_name, kind, context_key, context_label, body, screening_state, categories, explanation, evidence, status, created_at } = s;
  return { id, volunteer_name, kind, context_key, context_label, body, screening_state, categories, explanation, evidence, status, created_at };
}
export const CATEGORY_LABELS: Record<string, string> = {
  aggression: "Aggressive language", vulgarity: "Vulgar language", harassment: "Harassment",
  hate: "Hateful language", sexual_content: "Sexual content", unsafe_contact: "Unsafe contact",
};
export function needsAttention(s: Pick<VolunteerSubmission, "screening_state" | "categories">) {
  return s.screening_state === "unavailable" || s.categories.length > 0;
}
