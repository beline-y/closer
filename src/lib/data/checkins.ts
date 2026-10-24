import "server-only";
import { castByUserId, type CastMember } from "@/lib/cast";
import type { ActivityKind, MealAmount, MealKind } from "@/lib/checkin";
import { daysBetween, timeIn, todayIn } from "@/lib/dates";
import type { MoodPoint, MoodValue } from "@/lib/mood";
import { createClient } from "@/lib/supabase/server";

// Every read goes through RLS: the care team gets no photo, volunteers get nothing.

const PHOTO_URL_TTL = 60 * 60; // signed URLs live 1 hour

export type CheckInView = {
  id: string;
  patientId: string;
  daysAgo: number;
  time: string;
  mood: number;
  meals: MealKind[];
  mealAmount: MealAmount | null;
  mealNote: string | null;
  activities: ActivityKind[];
  activityNote: string | null;
  note: string | null;
  photoUrl: string | null;
  photoPath: string | null;
  reactions: { emoji: string; by: CastMember[]; byUserIds: string[] }[];
};

const COLUMNS = "id, patient_id, local_date, mood, meals, meal_amount, meal_note, activities, activity_note, note, created_at";

type Row = {
  id: string;
  patient_id: string;
  local_date: string;
  mood: number;
  meals: MealKind[];
  meal_amount: MealAmount | null;
  meal_note: string | null;
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

  const [photos, reactions] = await Promise.all([
    withPhotos && ids.length ? supabase.from("checkin_photos").select("checkin_id, path").in("checkin_id", ids) : null,
    withReactions && ids.length ? supabase.from("checkin_reactions").select("checkin_id, user_id, emoji").in("checkin_id", ids).order("created_at") : null,
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
      meals: r.meals,
      mealAmount: r.meal_amount,
      mealNote: r.meal_note,
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

/** Mood per day for charts: oldest first, null when there was no check-in. */
export function moodSeries(checkins: CheckInView[], days: number): MoodPoint[] {
  return Array.from({ length: days }, (_, i) => {
    const daysAgo = days - 1 - i;
    const c = checkins.find((x) => x.daysAgo === daysAgo);
    return { daysAgo, mood: (c?.mood ?? null) as MoodValue | null };
  });
}
