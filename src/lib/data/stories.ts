import "server-only";
import type { IconName } from "@/components/icons/closer-icon";
import { castByUserId, type CastMember } from "@/lib/cast";
import type { ReactionKey } from "@/lib/checkin";
import { timeIn, todayIn } from "@/lib/dates";
import { nudgeKind, type ReplyKey } from "@/lib/nudges";
import { createClient } from "@/lib/supabase/server";

// "Who's thinking of you": everything the patient's people sent today, one story per person,
// like Instagram stories. Real rows only, read with the patient's own RLS; story_seen says
// which items the patient already opened (own rows only).

export type StoryItem = {
  /** Stable id, stored in story_seen once opened */
  key: string;
  icon: IconName;
  /** REACTION_TONE key when the icon is a reaction */
  tone: ReactionKey | ReplyKey | null;
  title: string;
  body: string | null;
  time: string;
  at: string;
  href: string | null;
  seen: boolean;
};

export type Story = { person: CastMember; items: StoryItem[]; unseen: number };

/** How far the timezone is ahead of UTC at this instant (local - UTC), in ms. */
function offsetMs(timezone: string, date: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: timezone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - Math.floor(date.getTime() / 1000) * 1000;
}

/** The patient's local midnight today, as an ISO instant. */
const startOfToday = (timezone: string) => new Date(Date.parse(`${todayIn(timezone)}T00:00:00Z`) - offsetMs(timezone, new Date())).toISOString();

export async function getStories(patientId: string, timezone: string): Promise<Story[]> {
  const supabase = await createClient();
  const since = startOfToday(timezone);
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims.sub;

  const [replies, reactions, activityReactions, comments, sealed, question, seen] = await Promise.all([
    supabase
      .from("nudge_recipients")
      .select("nudge_id, user_id, reply_kind, reply_text, replied_at, nudges!inner(kind, patient_id)")
      .eq("nudges.patient_id", patientId)
      .gte("replied_at", since),
    supabase.from("checkin_reactions").select("checkin_id, user_id, kind, created_at, mood_checkins!inner(patient_id)").eq("mood_checkins.patient_id", patientId).gte("created_at", since),
    supabase
      .from("activity_reactions")
      .select("session_id, user_id, kind, created_at, activity_sessions!inner(patient_id, activities(title))")
      .eq("activity_sessions.patient_id", patientId)
      .gte("created_at", since),
    supabase
      .from("activity_comments")
      .select("id, session_id, user_id, body, created_at, activity_sessions!inner(patient_id, activities(title))")
      .eq("activity_sessions.patient_id", patientId)
      .gte("created_at", since),
    supabase.rpc("sealed_cards"),
    supabase.rpc("todays_question", { p_patient_id: patientId }),
    supabase.from("story_seen").select("item_key"),
  ]);

  const seenKeys = new Set((seen.data ?? []).map((s) => s.item_key));
  const items: (Omit<StoryItem, "seen" | "time"> & { userId: string })[] = [];

  for (const r of replies.data ?? []) {
    if (!r.replied_at) continue;
    items.push({
      key: `reply:${r.nudge_id}:${r.user_id}`,
      userId: r.user_id,
      icon: (r.reply_kind as ReplyKey | null) ?? "message",
      tone: r.reply_kind as ReplyKey | null,
      title: `replied to your “${nudgeKind(r.nudges.kind).label}”`,
      body: r.reply_text,
      at: r.replied_at,
      href: "/patient/connect",
    });
  }
  for (const r of reactions.data ?? []) {
    if (!r.kind) continue;
    const verb = { heart: "sent a heart", hug: "sent a hug", strong: "says you're strong", laugh: "laughed" }[r.kind as ReactionKey];
    items.push({ key: `reaction:${r.checkin_id}:${r.user_id}`, userId: r.user_id, icon: r.kind as ReactionKey, tone: r.kind as ReactionKey, title: `${verb} on your mood of the day`, body: null, at: r.created_at, href: null });
  }
  for (const r of activityReactions.data ?? []) {
    if (!r.kind) continue;
    const title = r.activity_sessions.activities?.title ?? "your creation";
    items.push({ key: `activity-reaction:${r.session_id}:${r.user_id}`, userId: r.user_id, icon: r.kind as ReactionKey, tone: r.kind as ReactionKey, title: `loved “${title}”`, body: null, at: r.created_at, href: "/patient/connect" });
  }
  for (const c of comments.data ?? []) {
    const title = c.activity_sessions.activities?.title ?? "your creation";
    items.push({ key: `comment:${c.id}`, userId: c.user_id, icon: "message", tone: null, title: `commented on “${title}”`, body: c.body, at: c.created_at, href: "/patient/connect" });
  }
  for (const c of sealed.data ?? []) {
    if (c.created_at < since) continue;
    items.push({ key: `card:${c.id}`, userId: c.author_id, icon: "card", tone: null, title: "left you a card", body: null, at: c.created_at, href: "/patient/connect" });
  }
  const q = question.data?.[0];
  for (const userId of q?.answered_by ?? []) {
    if (userId === me) continue;
    items.push({ key: `answer:${q!.id}:${userId}`, userId, icon: "idea", tone: null, title: "answered today's question", body: q!.text, at: since, href: "/patient/question" });
  }

  const byPerson = new Map<string, Story>();
  for (const item of items.sort((a, b) => a.at.localeCompare(b.at))) {
    const person = castByUserId(item.userId);
    if (!person || item.userId === me) continue;
    const story = byPerson.get(item.userId) ?? { person, items: [], unseen: 0 };
    const seenItem = seenKeys.has(item.key);
    story.items.push({ ...item, time: item.at === since ? "Today" : timeIn(item.at, timezone), seen: seenItem });
    if (!seenItem) story.unseen++;
    byPerson.set(item.userId, story);
  }
  // Unseen first, then the most recent.
  return [...byPerson.values()].sort((a, b) => Number(b.unseen > 0) - Number(a.unseen > 0) || b.items.at(-1)!.at.localeCompare(a.items.at(-1)!.at));
}
