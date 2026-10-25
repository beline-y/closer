import "server-only";
import { ACTIVITY_TYPES, type Activity, type ActivityType } from "@/lib/activities";
import { castByUserId, type CastMember } from "@/lib/cast";
import { daysBetween, timeIn, todayIn } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

// RLS: the patient reads all their results; the circle reads only shared, finished ones
// (a challenge only once both sides are done). The care team only gets counts.

const RESULT_URL_TTL = 60 * 60;

export type ActivityResult = {
  id: string;
  activity: Pick<Activity, "id" | "type" | "title" | "emoji" | "theme">;
  status: "started" | "waiting_partner" | "completed";
  daysAgo: number;
  time: string;
  imageUrl: string | null;
  text: string | null;
  score: number | null;
  scoreTotal: number | null;
  visibility: "private" | "family";
  inMemories: boolean;
  partner: CastMember | null;
  partnerEntry: { imageUrl: string | null; text: string | null } | null;
  reactions: { emoji: string; by: CastMember; userId: string }[];
  comments: { id: string; by: CastMember; body: string }[];
};

type Row = {
  id: string;
  local_date: string;
  status: ActivityResult["status"];
  result_path: string | null;
  result_text: string | null;
  score: number | null;
  score_total: number | null;
  visibility: "private" | "family";
  in_memories: boolean;
  partner_id: string | null;
  completed_at: string | null;
  created_at: string;
  activities: { id: string; type: ActivityType; title: string; emoji: string; theme: string | null } | null;
};

export async function getActivities(): Promise<Activity[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("activities").select("id, type, title, emoji, instructions, theme, steps, quiz, minutes").order("type").order("title");
  return (data ?? []).map((a) => ({ ...a, quiz: (a.quiz as Activity["quiz"]) ?? null }));
}

export async function getActivity(id: string): Promise<Activity | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("activities").select("id, type, title, emoji, instructions, theme, steps, quiz, minutes").eq("id", id).maybeSingle();
  return data ? { ...data, quiz: (data.quiz as Activity["quiz"]) ?? null } : null;
}

/** Results of a patient, newest first. `sharedOnly` for the family feed. */
export async function getResults(patientId: string, timezone: string, { days = 14, sharedOnly = false, memoriesOnly = false } = {}): Promise<ActivityResult[]> {
  const supabase = await createClient();
  const today = todayIn(timezone);
  const since = new Date(Date.parse(today) - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  let query = supabase
    .from("activity_sessions")
    .select("id, local_date, status, result_path, result_text, score, score_total, visibility, in_memories, partner_id, completed_at, created_at, activities(id, type, title, emoji, theme)")
    .eq("patient_id", patientId)
    .gte("local_date", since)
    .neq("status", "started")
    .order("created_at", { ascending: false });
  if (sharedOnly) query = query.eq("status", "completed").or("visibility.eq.family,in_memories.eq.true");
  if (memoriesOnly) query = query.eq("in_memories", true);
  const { data } = await query;
  const rows = (data ?? []) as Row[];
  const ids = rows.map((r) => r.id);
  if (!ids.length) return [];

  const [entries, reactions, comments] = await Promise.all([
    supabase.from("challenge_entries").select("session_id, result_path, result_text").in("session_id", ids),
    supabase.from("activity_reactions").select("session_id, user_id, emoji").in("session_id", ids),
    supabase.from("activity_comments").select("id, session_id, user_id, body, created_at").in("session_id", ids).order("created_at"),
  ]);
  const paths = [...rows.map((r) => r.result_path), ...(entries.data ?? []).map((e) => e.result_path)].filter((p): p is string => !!p);
  const signed = paths.length ? ((await supabase.storage.from("activity-results").createSignedUrls(paths, RESULT_URL_TTL)).data ?? []) : [];
  const url = (p: string | null) => (p ? (signed.find((s) => s.path === p)?.signedUrl ?? null) : null);

  return rows.map((r) => {
    const entry = (entries.data ?? []).find((e) => e.session_id === r.id);
    return {
      id: r.id,
      activity: r.activities ?? { id: "", type: "draw", title: "Activity", emoji: "✨", theme: null },
      status: r.status,
      daysAgo: daysBetween(today, r.local_date),
      time: timeIn(r.completed_at ?? r.created_at, timezone),
      imageUrl: url(r.result_path),
      text: r.result_text,
      score: r.score,
      scoreTotal: r.score_total,
      visibility: r.visibility,
      inMemories: r.in_memories,
      partner: r.partner_id ? (castByUserId(r.partner_id) ?? null) : null,
      partnerEntry: entry ? { imageUrl: url(entry.result_path), text: entry.result_text } : null,
      reactions: (reactions.data ?? [])
        .filter((x) => x.session_id === r.id)
        .flatMap((x) => {
          const by = castByUserId(x.user_id);
          return by ? [{ emoji: x.emoji, by, userId: x.user_id }] : [];
        }),
      comments: (comments.data ?? [])
        .filter((x) => x.session_id === r.id)
        .flatMap((x) => {
          const by = castByUserId(x.user_id);
          return by ? [{ id: x.id, by, body: x.body }] : [];
        }),
    };
  });
}

/** Unfinished activities of the patient (last 7 days) and challenges waiting for family. */
export async function getUnfinished(patientId: string, timezone: string) {
  const supabase = await createClient();
  const today = todayIn(timezone);
  const since = new Date(Date.parse(today) - 6 * 86_400_000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("activity_sessions")
    .select("id, status, result_text, local_date, partner_id, activities(id, type, title, emoji)")
    .eq("patient_id", patientId)
    .in("status", ["started", "waiting_partner"])
    .gte("local_date", since)
    .order("created_at", { ascending: false });
  return (data ?? []).flatMap((s) =>
    s.activities
      ? [{
          id: s.id,
          status: s.status,
          draft: s.result_text,
          daysAgo: daysBetween(today, s.local_date),
          partner: s.partner_id ? (castByUserId(s.partner_id) ?? null) : null,
          activity: s.activities,
        }]
      : [],
  );
}

/** The draft of one unfinished session (patient only). */
export async function getDraft(sessionId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("activity_sessions").select("id, result_text").eq("id", sessionId).eq("status", "started").maybeSingle();
  return data ? { sessionId: data.id, text: data.result_text ?? "" } : null;
}

/** Challenges waiting for the signed-in family member (title only, never the patient's side). */
export async function getMyPendingChallenges() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_pending_challenges");
  return data ?? [];
}

/** Care team: completed activities per day, no content. */
export async function getActivityCounts(patientId: string, days = 14): Promise<{ date: string; completed: number }[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("activity_counts", { p_patient_id: patientId, p_days: days });
  return (data ?? []).map((r) => ({ date: r.local_date, completed: r.completed }));
}

/** Activity kinds done today in the app (they count in the check-in automatically). */
export async function getTodayActivityKinds(patientId: string, timezone: string) {
  const results = await getResults(patientId, timezone, { days: 1 });
  return [...new Set(results.filter((r) => r.daysAgo === 0).map((r) => ACTIVITY_TYPES[r.activity.type].kind))];
}
