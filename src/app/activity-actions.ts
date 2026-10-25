"use server";

import { refresh } from "next/cache";
import { ACTIVITY_TYPES, type ShareChoice } from "@/lib/activities";
import { REACTIONS } from "@/lib/checkin";
import { getMyPatient } from "@/lib/data/checkins";
import { todayIn } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

export type ActivityActionResult = { ok: true; status?: "completed" | "waiting_partner" } | { ok: false; error: string };

type Finish = {
  activityId: string;
  resultPath?: string | null;
  resultText?: string | null;
  score?: number | null;
  scoreTotal?: number | null;
  share: ShareChoice;
  partnerId?: string | null;
};

// Saves a finished activity. A challenge waits for the family member's side; everything
// else is completed right away and counts in today's check-in activities.
export async function finishActivity(input: Finish): Promise<ActivityActionResult> {
  const patient = await getMyPatient();
  if (!patient) return { ok: false, error: "Only the patient can do activities." };
  const supabase = await createClient();
  const { data: activity } = await supabase.from("activities").select("id, type").eq("id", input.activityId).maybeSingle();
  if (!activity) return { ok: false, error: "Unknown activity." };

  if (input.resultPath && !input.resultPath.startsWith(`${patient.id}/`)) return { ok: false, error: "Invalid file." };
  const isChallenge = activity.type === "challenge";
  if (isChallenge && !input.partnerId) return { ok: false, error: "Pick who to challenge." };
  const status = isChallenge ? "waiting_partner" : "completed";

  const { error } = await supabase.from("activity_sessions").insert({
    patient_id: patient.id,
    activity_id: activity.id,
    status,
    result_path: input.resultPath ?? null,
    result_text: typeof input.resultText === "string" ? input.resultText.trim().slice(0, 4000) || null : null,
    score: Number.isInteger(input.score) ? input.score : null,
    score_total: Number.isInteger(input.scoreTotal) ? input.scoreTotal : null,
    visibility: isChallenge || input.share === "family" ? "family" : "private",
    in_memories: !isChallenge && input.share === "memories",
    partner_id: isChallenge ? input.partnerId : null,
    completed_at: isChallenge ? null : new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.code === "42501" ? "You can only challenge your family or friends." : "Couldn't save. Try again?" };

  // The activity of the day fills itself in today's check-in, if there is one.
  const kind = ACTIVITY_TYPES[activity.type].kind;
  const { data: checkin } = await supabase
    .from("mood_checkins")
    .select("id, activities")
    .eq("patient_id", patient.id)
    .eq("local_date", todayIn(patient.timezone))
    .maybeSingle();
  if (checkin && !checkin.activities.includes(kind)) {
    await supabase.from("mood_checkins").update({ activities: [...checkin.activities, kind] }).eq("id", checkin.id);
  }

  refresh();
  return { ok: true, status };
}

// The family member's side of a challenge. Completing it reveals both drawings (trigger).
export async function submitChallengeEntry(sessionId: string, resultPath: string): Promise<ActivityActionResult> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { ok: false, error: "Not signed in." };
  // The empty entry was created when the challenge was sent (RLS: the partner's own row).
  const { error, count } = await supabase
    .from("challenge_entries")
    .update({ result_path: resultPath, completed_at: new Date().toISOString() }, { count: "exact" })
    .match({ session_id: sessionId, user_id: userId });
  if (error || !count) return { ok: false, error: "Couldn't send your drawing." };
  refresh();
  return { ok: true, status: "completed" };
}

// One reaction per person on a shared result: same emoji removes it, another changes it.
export async function reactToResult(sessionId: string, emoji: string): Promise<ActivityActionResult> {
  if (!REACTIONS.some((r) => r.emoji === emoji)) return { ok: false, error: "Unknown reaction." };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { ok: false, error: "Not signed in." };
  const match = { session_id: sessionId, user_id: userId };
  const { data: existing } = await supabase.from("activity_reactions").select("emoji").match(match).maybeSingle();
  const { error } = !existing
    ? await supabase.from("activity_reactions").insert({ ...match, emoji })
    : existing.emoji === emoji
      ? await supabase.from("activity_reactions").delete().match(match)
      : await supabase.from("activity_reactions").update({ emoji }).match(match);
  if (error) return { ok: false, error: "Couldn't react." };
  refresh();
  return { ok: true };
}

export async function commentOnResult(sessionId: string, body: string): Promise<ActivityActionResult> {
  const text = body.trim().slice(0, 200);
  if (!text) return { ok: false, error: "Write something first." };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { ok: false, error: "Not signed in." };
  const { error } = await supabase.from("activity_comments").insert({ session_id: sessionId, user_id: userId, body: text });
  if (error) return { ok: false, error: "Couldn't post the comment." };
  refresh();
  return { ok: true };
}
