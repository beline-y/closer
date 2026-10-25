import "server-only";
import { castByUserId, type CastMember } from "@/lib/cast";
import { daysBetween, timeIn, todayIn } from "@/lib/dates";
import type { NudgeKind, ReplyKey, Thresholds } from "@/lib/nudges";
import { createClient } from "@/lib/supabase/server";

// RLS: the patient sees their nudges and every reply; a family member sees only the
// nudges sent to them and their own reply; the care team and volunteers see nothing.

export type NudgeReply = {
  nudgeId: string;
  kind: NudgeKind;
  from: CastMember;
  replyKey: ReplyKey | null;
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
  reply: { kind: ReplyKey | null; text: string | null } | null;
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
    .select("nudge_id, user_id, reply_kind, reply_text, replied_at, nudges!inner(kind, patient_id)")
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
      replyKey: r.reply_kind as ReplyKey | null,
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
    .select("nudge_id, reply_kind, reply_text, replied_at, nudges!inner(kind, created_at)")
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
      reply: r.replied_at ? { kind: r.reply_kind as ReplyKey | null, text: r.reply_text } : null,
    }))
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
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
