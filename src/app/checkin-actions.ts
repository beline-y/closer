"use server";

import { refresh } from "next/cache";
import { ACTIVITIES, type CheckInInput, MEAL_AMOUNTS, REACTIONS } from "@/lib/checkin";
import { getMyPatient, getStreak } from "@/lib/data/checkins";
import { todayIn } from "@/lib/dates";
import type { Streak } from "@/lib/streak";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };
export type SaveCheckinResult = { ok: true; streak: Streak } | { ok: false; error: string };

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) || null : null);
const pick = <T extends string>(values: unknown, allowed: readonly T[]): T[] =>
  Array.isArray(values) ? [...new Set(values.filter((v): v is T => allowed.includes(v as T)))] : [];

// Creates or edits today's check-in and its dish ratings. The database sets the day and
// refuses other days and dishes from another day or unit (RLS).
export async function saveCheckin(input: CheckInInput): Promise<SaveCheckinResult> {
  const patient = await getMyPatient();
  if (!patient) return { ok: false, error: "Only the patient can check in." };

  const mood = Number(input.mood);
  if (!Number.isInteger(mood) || mood < 1 || mood > 5) return { ok: false, error: "Pick a mood first." };

  const fields = {
    mood,
    activities: pick(input.activities, ACTIVITIES.map((a) => a.value)),
    activity_note: text(input.activityNote, 120),
    note: text(input.note, 280),
  };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("mood_checkins")
    .select("id")
    .eq("patient_id", patient.id)
    .eq("local_date", todayIn(patient.timezone))
    .maybeSingle();
  const { data: checkin, error } = existing
    ? await supabase.from("mood_checkins").update(fields).eq("id", existing.id).select("id").single()
    : await supabase.from("mood_checkins").insert({ patient_id: patient.id, ...fields }).select("id").single();
  if (error || !checkin) return { ok: false, error: "Couldn't save. Try again?" };

  // Ratings: replace today's set with what the patient sent (only rated dishes are kept).
  const amounts = MEAL_AMOUNTS.map((a) => a.value);
  const ratings = (Array.isArray(input.ratings) ? input.ratings : [])
    .map((r) => ({
      checkin_id: checkin.id,
      patient_id: patient.id,
      menu_item_id: String(r.menuItemId),
      liking: Number.isInteger(r.liking) && r.liking! >= 1 && r.liking! <= 5 ? r.liking : null,
      amount: amounts.includes(r.amount as (typeof amounts)[number]) ? r.amount : null,
    }))
    .filter((r) => r.liking !== null || r.amount !== null);
  await supabase.from("meal_ratings").delete().eq("checkin_id", checkin.id);
  if (ratings.length) {
    const { error: ratingError } = await supabase.from("meal_ratings").insert(ratings);
    if (ratingError) return { ok: false, error: "The meal ratings couldn't be saved." };
  }

  if (input.photoPath !== undefined) {
    const { data: previous } = await supabase.from("checkin_photos").select("path").eq("checkin_id", checkin.id).maybeSingle();
    if (input.photoPath === null) {
      await supabase.from("checkin_photos").delete().eq("checkin_id", checkin.id);
    } else {
      // The path must be in the patient's own folder (also enforced by a check constraint and Storage RLS).
      if (!input.photoPath.startsWith(`${patient.id}/`)) return { ok: false, error: "Invalid photo." };
      const { error: photoError } = previous
        ? await supabase.from("checkin_photos").update({ path: input.photoPath }).eq("checkin_id", checkin.id)
        : await supabase.from("checkin_photos").insert({ checkin_id: checkin.id, patient_id: patient.id, path: input.photoPath });
      if (photoError) return { ok: false, error: "The photo couldn't be saved." };
    }
    if (previous && previous.path !== input.photoPath) {
      await supabase.storage.from("checkin-photos").remove([previous.path]);
    }
  }

  const streak = await getStreak(patient.id, patient.timezone);
  refresh();
  return { ok: true, streak };
}

// One reaction per person per check-in: tap another to change it, the same one to remove it.
export async function setCheckinReaction(checkinId: string, emoji: string): Promise<ActionResult> {
  if (!REACTIONS.some((r) => r.emoji === emoji)) return { ok: false, error: "Unknown reaction." };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { ok: false, error: "Not signed in." };

  const { data: existing } = await supabase.from("checkin_reactions").select("emoji").match({ checkin_id: checkinId, user_id: userId }).maybeSingle();
  const match = { checkin_id: checkinId, user_id: userId };
  const { error } = !existing
    ? await supabase.from("checkin_reactions").insert({ ...match, emoji })
    : existing.emoji === emoji
      ? await supabase.from("checkin_reactions").delete().match(match)
      : await supabase.from("checkin_reactions").update({ emoji }).match(match);
  if (error) return { ok: false, error: "Couldn't react." };

  refresh();
  return { ok: true };
}
