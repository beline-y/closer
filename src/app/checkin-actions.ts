"use server";

import { refresh } from "next/cache";
import { ACTIVITIES, type CheckInInput, MEAL_AMOUNTS, MEALS, REACTIONS } from "@/lib/checkin";
import { getMyPatient } from "@/lib/data/checkins";
import { todayIn } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) || null : null);
const pick = <T extends string>(values: unknown, allowed: readonly T[]): T[] =>
  Array.isArray(values) ? [...new Set(values.filter((v): v is T => allowed.includes(v as T)))] : [];

// Creates or edits today's check-in. The database sets the day and refuses other days (RLS).
export async function saveCheckin(input: CheckInInput): Promise<ActionResult> {
  const patient = await getMyPatient();
  if (!patient) return { ok: false, error: "Only the patient can check in." };

  const mood = Number(input.mood);
  if (!Number.isInteger(mood) || mood < 1 || mood > 5) return { ok: false, error: "Pick a mood first." };

  const amount = MEAL_AMOUNTS.some((a) => a.value === input.mealAmount) ? input.mealAmount : null;
  const fields = {
    mood,
    meals: pick(input.meals, MEALS.map((m) => m.value)),
    meal_amount: amount,
    meal_note: text(input.mealNote, 120),
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

  refresh();
  return { ok: true };
}

// Family and friends react to a check-in; tapping again removes the reaction.
export async function toggleCheckinReaction(checkinId: string, emoji: string): Promise<ActionResult> {
  if (!REACTIONS.includes(emoji as (typeof REACTIONS)[number])) return { ok: false, error: "Unknown reaction." };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { ok: false, error: "Not signed in." };

  const { data: existing, error: readError } = await supabase
    .from("checkin_reactions")
    .select("emoji")
    .match({ checkin_id: checkinId, user_id: userId })
    .maybeSingle();
  if (readError) return { ok: false, error: "Couldn't load your reaction." };
  const { error } = existing?.emoji === emoji
    ? await supabase.from("checkin_reactions").delete().match({ checkin_id: checkinId, user_id: userId, emoji })
    : existing
      ? await supabase.from("checkin_reactions").update({ emoji }).match({ checkin_id: checkinId, user_id: userId })
      : await supabase.from("checkin_reactions").insert({ checkin_id: checkinId, user_id: userId, emoji });
  if (error) return { ok: false, error: "Couldn't react." };

  refresh();
  return { ok: true };
}
