import "server-only";
import { castByUserId, type CastMember } from "@/lib/cast";
import { createClient } from "@/lib/supabase/server";

// RLS: you read the others' answers only after answering; the care team and volunteers never.

export type TodayQuestion = {
  id: string;
  text: string;
  /** Who answered (never what), for "Dad answered! Answer to see it" */
  answeredBy: CastMember[];
  myAnswer: { body: string; shared: boolean } | null;
  /** The others' answers, only once I answered */
  answers: { by: CastMember; body: string }[];
};

export async function getTodayQuestion(patientId: string): Promise<TodayQuestion | null> {
  const supabase = await createClient();
  const [{ data: claims }, { data: q }] = await Promise.all([supabase.auth.getClaims(), supabase.rpc("todays_question", { p_patient_id: patientId })]);
  const me = claims?.claims.sub;
  const today = q?.[0];
  if (!today || !me) return null;
  const { data: rows } = await supabase.from("question_answers").select("user_id, body, share_with_volunteers").eq("daily_question_id", today.id).order("created_at");
  const mine = (rows ?? []).find((r) => r.user_id === me);
  return {
    id: today.id,
    text: today.text,
    answeredBy: today.answered_by.filter((id) => id !== me).flatMap((id) => castByUserId(id) ?? []),
    myAnswer: mine ? { body: mine.body, shared: mine.share_with_volunteers } : null,
    answers: (rows ?? []).filter((r) => r.user_id !== me).flatMap((r) => {
      const by = castByUserId(r.user_id);
      return by ? [{ by, body: r.body }] : [];
    }),
  };
}

/** Care team review queue: only answers the patient shared, names masked. */
export async function getAnswersToReview() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("answers_to_review");
  return data ?? [];
}
