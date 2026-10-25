"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Answers today's question (RLS: today only, patient or circle; only the patient may share
// with volunteers). Answering unlocks the others' answers.
export async function answerTodayQuestion(dailyQuestionId: string, body: string, share: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const text = body.trim().slice(0, 500);
  if (!text) return { ok: false, error: "Write your answer first." };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { ok: false, error: "Not signed in." };
  const { data: patient } = await supabase.from("patients").select("id").eq("user_id", userId).maybeSingle();
  const { error } = await supabase
    .from("question_answers")
    .insert({ daily_question_id: dailyQuestionId, user_id: userId, body: text, share_with_volunteers: !!patient && share });
  if (error) return { ok: false, error: error.code === "23505" ? "You already answered today." : "Couldn't send your answer. Try again?" };
  refresh();
  return { ok: true };
}
