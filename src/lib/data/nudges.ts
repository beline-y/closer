import "server-only";
import { castByUserId, type CastMember } from "@/lib/cast";
import { daysBetween, timeIn, todayIn } from "@/lib/dates";
import type { NudgeKind, Thresholds } from "@/lib/nudges";
import { createClient } from "@/lib/supabase/server";

// RLS: the patient sees their nudges and every reply; a family member sees only the
// nudges sent to them and their own reply; the care team and volunteers see nothing.

export type NudgeReply = {
  nudgeId: string;
  kind: NudgeKind;
  from: CastMember;
  emoji: string | null;
  text: string | null;
  daysAgo: number;
  time: string;
};

export type MyNudge = {
  id: string;
  kind: NudgeKind;
  daysAgo: number;
  time: string;
  sentAt: string;
  reply: { emoji: string | null; text: string | null } | null;
};

/** Last send time per nudge type + the patient's cooldown, for the buttons. */
export async function getNudgeState(patientId: string) {
  const supabase = await createClient();
  const [{ data: settings }, { data: recent }] = await Promise.all([
    supabase.from("patient_settings").select("nudge_cooldown_minutes").eq("patient_id", patientId).maybeSingle(),
    supabase
      .from("nudges")
      .select("kind, created_at")
      .eq("patient_id", patientId)
      .gte("created_at", new Date(Date.now() - 4 * 60 * 60_000).toISOString())
      .order("created_at", { ascending: false }),
  ]);
  const lastSent: Partial<Record<NudgeKind, string>> = {};
  for (const n of recent ?? []) lastSent[n.kind] ??= n.created_at;
  return { cooldownMinutes: settings?.nudge_cooldown_minutes ?? 10, lastSent, serverNow: new Date().toISOString() };
}

/** Replies to the patient's nudges, newest first (the patient never sees "no reply"). */
export async function getRepliesForPatient(patientId: string, timezone: string, days = 7): Promise<NudgeReply[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("nudge_recipients")
    .select("nudge_id, user_id, reply_emoji, reply_text, replied_at, nudges!inner(kind, patient_id)")
    .eq("nudges.patient_id", patientId)
    .not("replied_at", "is", null)
    .gte("replied_at", new Date(Date.now() - days * 86_400_000).toISOString())
    .order("replied_at", { ascending: false });
  const today = todayIn(timezone);
  return (data ?? []).flatMap((r) => {
    const from = castByUserId(r.user_id);
    if (!from || !r.replied_at) return [];
    const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(r.replied_at));
    return [{
      nudgeId: r.nudge_id,
      kind: r.nudges.kind,
      from,
      emoji: r.reply_emoji,
      text: r.reply_text,
      daysAgo: daysBetween(today, localDate),
      time: timeIn(r.replied_at, timezone),
    }];
  });
}

/** Nudges sent to the signed-in family member, newest first. */
export async function getMyNudges(userId: string, timezone: string, days = 7): Promise<MyNudge[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("nudge_recipients")
    .select("nudge_id, reply_emoji, reply_text, replied_at, nudges!inner(kind, created_at)")
    .eq("user_id", userId)
    .gte("nudges.created_at", new Date(Date.now() - days * 86_400_000).toISOString());
  const today = todayIn(timezone);
  return (data ?? [])
    .map((r) => ({
      id: r.nudge_id,
      kind: r.nudges.kind,
      sentAt: r.nudges.created_at,
      daysAgo: daysBetween(today, new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(r.nudges.created_at))),
      time: timeIn(r.nudges.created_at, timezone),
      reply: r.replied_at ? { emoji: r.reply_emoji, text: r.reply_text } : null,
    }))
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

/** Who replied to a nudge or reacted to a check-in today (the "thinking of you" row). */
export async function getThinkingOfYouToday(patientId: string, timezone: string): Promise<string[]> {
  const supabase = await createClient();
  const today = todayIn(timezone);
  const since = new Date(Date.now() - 36 * 60 * 60_000).toISOString();
  const [replies, reactions] = await Promise.all([
    supabase.from("nudge_recipients").select("user_id, replied_at, nudges!inner(patient_id)").eq("nudges.patient_id", patientId).gte("replied_at", since),
    supabase.from("checkin_reactions").select("user_id, created_at, mood_checkins!inner(patient_id)").eq("mood_checkins.patient_id", patientId).gte("created_at", since),
  ]);
  const isToday = (iso: string | null) => !!iso && new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(iso)) === today;
  const ids = [
    ...(replies.data ?? []).filter((r) => isToday(r.replied_at)).map((r) => r.user_id),
    ...(reactions.data ?? []).filter((r) => isToday(r.created_at)).map((r) => r.user_id),
  ];
  return [...new Set(ids)];
}

export async function getThresholds(patientId: string): Promise<Thresholds | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("patient_settings")
    .select("nudge_cooldown_minutes, low_mood_threshold, low_mood_streak, no_checkin_days, no_family_contact_days")
    .eq("patient_id", patientId)
    .maybeSingle();
  if (!data) return null;
  return {
    nudgeCooldownMinutes: data.nudge_cooldown_minutes,
    lowMoodThreshold: data.low_mood_threshold,
    lowMoodStreak: data.low_mood_streak,
    noCheckinDays: data.no_checkin_days,
    noFamilyContactDays: data.no_family_contact_days,
  };
}
