import "server-only";
import { castByUserId, type CastMember } from "@/lib/cast";
import type { ActivityKind, MealAmount, MenuDish, RatedDish } from "@/lib/checkin";
import { daysBetween, timeIn, todayIn } from "@/lib/dates";
import type { MoodPoint, MoodValue } from "@/lib/mood";
import { computeStreak, type Streak } from "@/lib/streak";
import { createClient } from "@/lib/supabase/server";

// Every read goes through RLS: the care team gets no photo, volunteers get nothing.

const PHOTO_URL_TTL = 60 * 60; // signed URLs live 1 hour

export type CheckInView = {
  id: string;
  patientId: string;
  daysAgo: number;
  time: string;
  mood: number;
  /** Dishes of the day the patient rated (menu set by the care team) */
  dishes: RatedDish[];
  activities: ActivityKind[];
  activityNote: string | null;
  note: string | null;
  photoUrl: string | null;
  photoPath: string | null;
  reactions: { emoji: string; by: CastMember[]; byUserIds: string[] }[];
};

const COLUMNS = "id, patient_id, local_date, mood, activities, activity_note, note, created_at";

type Row = {
  id: string;
  patient_id: string;
  local_date: string;
  mood: number;
  activities: ActivityKind[];
  activity_note: string | null;
  note: string | null;
  created_at: string;
};

/** The signed-in patient's own record (null for everyone else). */
export async function getMyPatient() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return null;
  const { data } = await supabase.from("patients").select("id, nickname, timezone").eq("user_id", userId).maybeSingle();
  return data;
}

/**
 * Check-ins of one patient, newest first.
 * withPhotos / withReactions only return data for the patient and their circle (RLS).
 */
export async function getCheckins(
  patientId: string,
  timezone: string,
  { days = 30, withPhotos = false, withReactions = false }: { days?: number; withPhotos?: boolean; withReactions?: boolean } = {},
): Promise<CheckInView[]> {
  const supabase = await createClient();
  const today = todayIn(timezone);
  const since = new Date(Date.parse(today) - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("mood_checkins")
    .select(COLUMNS)
    .eq("patient_id", patientId)
    .gte("local_date", since)
    .order("local_date", { ascending: false });
  const rows = (data ?? []) as Row[];
  const ids = rows.map((r) => r.id);

  const [photos, reactions, ratings] = await Promise.all([
    withPhotos && ids.length ? supabase.from("checkin_photos").select("checkin_id, path").in("checkin_id", ids) : null,
    withReactions && ids.length ? supabase.from("checkin_reactions").select("checkin_id, user_id, emoji").in("checkin_id", ids).order("created_at") : null,
    ids.length
      ? supabase.from("meal_ratings").select("checkin_id, liking, amount, menu_items(meal, dish_name, icon, position)").in("checkin_id", ids)
      : null,
  ]);

  const paths = photos?.data ?? [];
  const signed = paths.length
    ? (await supabase.storage.from("checkin-photos").createSignedUrls(paths.map((p) => p.path), PHOTO_URL_TTL)).data ?? []
    : [];
  const urlByPath = new Map(signed.map((s) => [s.path, s.signedUrl]));

  return rows.map((r) => {
    const photoPath = paths.find((p) => p.checkin_id === r.id)?.path ?? null;
    const mine = (reactions?.data ?? []).filter((x) => x.checkin_id === r.id);
    const grouped = new Map<string, string[]>();
    mine.forEach((x) => grouped.set(x.emoji, [...(grouped.get(x.emoji) ?? []), x.user_id]));
    return {
      id: r.id,
      patientId: r.patient_id,
      daysAgo: daysBetween(today, r.local_date),
      time: timeIn(r.created_at, timezone),
      mood: r.mood,
      dishes: (ratings?.data ?? [])
        .filter((x) => x.checkin_id === r.id && x.menu_items)
        .sort((a, b) => MEAL_ORDER.indexOf(a.menu_items!.meal) - MEAL_ORDER.indexOf(b.menu_items!.meal) || a.menu_items!.position - b.menu_items!.position)
        .map((x) => ({ meal: x.menu_items!.meal, dish: x.menu_items!.dish_name, icon: x.menu_items!.icon, liking: x.liking, amount: x.amount as MealAmount | null })),
      activities: r.activities,
      activityNote: r.activity_note,
      note: r.note,
      photoPath,
      photoUrl: photoPath ? (urlByPath.get(photoPath) ?? null) : null,
      reactions: [...grouped].map(([emoji, byUserIds]) => ({
        emoji,
        byUserIds,
        by: byUserIds.map(castByUserId).filter((m): m is CastMember => !!m),
      })),
    };
  });
}

const MEAL_ORDER = ["breakfast", "lunch", "dinner", "snack"];

/** Today's dishes for the patient's unit, set by the care team, with the patient's ratings if any. */
export async function getTodayMenu(patientId: string, timezone: string, checkinId?: string) {
  const supabase = await createClient();
  const { data: patient } = await supabase.from("patients").select("unit_id").eq("id", patientId).maybeSingle();
  if (!patient?.unit_id) return { dishes: [] as MenuDish[], ratings: [] as { menuItemId: string; liking: number | null; amount: MealAmount | null }[] };
  const [{ data: menu }, ratings] = await Promise.all([
    supabase.from("menu_items").select("id, meal, dish_name, icon, position").eq("unit_id", patient.unit_id).eq("menu_date", todayIn(timezone)),
    checkinId ? supabase.from("meal_ratings").select("menu_item_id, liking, amount").eq("checkin_id", checkinId) : null,
  ]);
  return {
    dishes: (menu ?? [])
      .map((m) => ({ id: m.id, meal: m.meal, dish: m.dish_name, icon: m.icon, position: m.position }))
      .sort((a, b) => MEAL_ORDER.indexOf(a.meal) - MEAL_ORDER.indexOf(b.meal) || a.position - b.position),
    ratings: (ratings?.data ?? []).map((r) => ({ menuItemId: r.menu_item_id, liking: r.liking, amount: r.amount })),
  };
}

/** Every check-in day of a patient, for the streak (patient and circle may read them). */
export async function getCheckinDates(patientId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("mood_checkins").select("local_date").eq("patient_id", patientId).order("local_date");
  return (data ?? []).map((r) => r.local_date);
}

export async function getStreak(patientId: string, timezone: string): Promise<Streak> {
  return computeStreak(await getCheckinDates(patientId), todayIn(timezone));
}

/** Mood per day for charts: oldest first, null when there was no check-in. */
export function moodSeries(checkins: CheckInView[], days: number): MoodPoint[] {
  return Array.from({ length: days }, (_, i) => {
    const daysAgo = days - 1 - i;
    const c = checkins.find((x) => x.daysAgo === daysAgo);
    return { daysAgo, mood: (c?.mood ?? null) as MoodValue | null };
  });
}
