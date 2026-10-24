"use server";

import { refresh } from "next/cache";
import { NUDGE_KINDS, type NudgeKind, QUICK_REPLIES, type Thresholds } from "@/lib/nudges";
import { createClient } from "@/lib/supabase/server";

export type NudgeResult = { ok: true } | { ok: false; error: string; availableAt?: string };

// The cooldown and the "circle only" rule are enforced by send_nudge() in the database.
export async function sendNudge(kind: NudgeKind, recipients: string[]): Promise<NudgeResult> {
  if (!NUDGE_KINDS.some((k) => k.kind === kind)) return { ok: false, error: "Unknown nudge." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("send_nudge", { p_kind: kind, p_recipients: recipients.length ? recipients : undefined });
  if (error) {
    if (error.message === "cooldown") return { ok: false, error: "Sent a moment ago!", availableAt: error.hint ?? undefined };
    return { ok: false, error: "Couldn't send. Try again?" };
  }
  refresh();
  return { ok: true };
}

// A family member answers a nudge sent to them (RLS: only their own row).
export async function replyToNudge(nudgeId: string, emoji: string, text: string): Promise<NudgeResult> {
  const reply = QUICK_REPLIES.find((r) => r.emoji === emoji);
  if (!reply) return { ok: false, error: "Pick a reply." };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { ok: false, error: "Not signed in." };
  const now = new Date().toISOString();
  const { error, count } = await supabase
    .from("nudge_recipients")
    .update({ reply_emoji: reply.emoji, reply_text: text.trim().slice(0, 140) || reply.text, replied_at: now, seen_at: now }, { count: "exact" })
    .match({ nudge_id: nudgeId, user_id: userId });
  if (error || !count) return { ok: false, error: "Couldn't send your reply." };
  refresh();
  return { ok: true };
}

// Care team: per-patient cooldown and alert thresholds (RLS: care team of that patient only).
export async function saveThresholds(patientId: string, t: Thresholds): Promise<NudgeResult> {
  const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(n) || 0)));
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { ok: false, error: "Not signed in." };
  const { error, count } = await supabase
    .from("patient_settings")
    .update(
      {
        nudge_cooldown_minutes: clamp(t.nudgeCooldownMinutes, 0, 240),
        low_mood_threshold: clamp(t.lowMoodThreshold, 1, 4),
        low_mood_streak: clamp(t.lowMoodStreak, 1, 14),
        no_checkin_days: clamp(t.noCheckinDays, 1, 14),
        no_family_contact_days: clamp(t.noFamilyContactDays, 1, 14),
        updated_by: userId,
      },
      { count: "exact" },
    )
    .eq("patient_id", patientId);
  if (error || !count) return { ok: false, error: "Couldn't save the settings." };
  refresh();
  return { ok: true };
}
