"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/app/checkin-actions";
import { castByUserId } from "@/lib/cast";
import { saveAiRound, saveWardMenu, sendDrawing } from "@/lib/data/care-ai";
import { getVisiblePatient, getVisiblePatients } from "@/lib/data/circle";
import { todayIn } from "@/lib/dates";
import { AFFECTS, ENGAGEMENTS, INTAKES, NIGHT_SLEEPS, NURSE_NOTE_MAX, type NurseRoundInput, VISITORS, type WardMenu } from "@/lib/nurse-round";
import { createClient } from "@/lib/supabase/server";

const one = <T extends string>(value: unknown, allowed: readonly { value: T }[]): T | null =>
  allowed.some((a) => a.value === value) ? (value as T) : null;
const many = <T extends string>(values: unknown, allowed: readonly { value: T }[]): T[] =>
  Array.isArray(values) ? [...new Set(values.filter((v): v is T => allowed.some((a) => a.value === v)))] : [];

/** The signed-in care team member's display name, or null for anyone else. */
async function careTeamMember(): Promise<{ name: string | null } | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims || claims.app_metadata?.account_type !== "care_team") return null;
  return { name: castByUserId(claims.sub)?.name ?? null };
}

// The nurse's round for today. RLS decides whether this care team member may see the child.
export async function saveNurseRound(patientId: string, input: NurseRoundInput): Promise<ActionResult> {
  const member = await careTeamMember();
  if (!member) return { ok: false, error: "Only the care team can add a round." };
  const patient = await getVisiblePatient(patientId);
  if (!patient) return { ok: false, error: "Patient not found." };

  const pain = Number.isInteger(input.pain) && input.pain! >= 0 && input.pain! <= 10 ? input.pain : null;
  const round: NurseRoundInput = {
    lunch: one(input.lunch, INTAKES),
    dinner: one(input.dinner, INTAKES),
    affect: many(input.affect, AFFECTS),
    engagement: one(input.engagement, ENGAGEMENTS),
    pain,
    nightSleep: one(input.nightSleep, NIGHT_SLEEPS),
    refusedCare: input.refusedCare === true,
    asksPsychologist: input.asksPsychologist === true,
    visits: many(input.visits, VISITORS),
    note: typeof input.note === "string" ? input.note.trim().slice(0, NURSE_NOTE_MAX) : "",
  };
  const report = await saveAiRound(patient.id, todayIn(patient.timezone), round, member.name);
  if (!report) return { ok: false, error: "The AI service didn't answer. Your round wasn't saved." };
  refresh();
  return { ok: true };
}

// A drawing the child made today, photographed or scanned by the care team. The browser
// shrinks it to a JPEG first; the AI service reads it and keeps only its reading.
export async function addDrawing(patientId: string, imageBase64: string, title: string): Promise<ActionResult> {
  if (!(await careTeamMember())) return { ok: false, error: "Only the care team can add a drawing." };
  const patient = await getVisiblePatient(patientId);
  if (!patient) return { ok: false, error: "Patient not found." };
  if (typeof imageBase64 !== "string" || !/^[A-Za-z0-9+/=]+$/.test(imageBase64) || imageBase64.length > 900_000) {
    return { ok: false, error: "This image can't be read. Try a JPEG or PNG photo." };
  }
  const sent = await sendDrawing(patient.id, todayIn(patient.timezone), imageBase64, typeof title === "string" ? title.trim().slice(0, 80) || null : null);
  if (!sent) return { ok: false, error: "The AI service didn't answer. The drawing wasn't added." };
  refresh();
  return { ok: true };
}

// Today's ward menu: it sets every child's baseline for "ate less than the others".
export async function saveTodaysMenu(menu: WardMenu): Promise<ActionResult> {
  if (!(await careTeamMember())) return { ok: false, error: "Only the care team can set the menu." };
  const [first] = await getVisiblePatients();
  const clean = (dish: unknown) => (typeof dish === "string" ? dish.trim().slice(0, 80) || null : null);
  const saved = await saveWardMenu(todayIn(first?.timezone ?? "UTC"), { lunch: clean(menu.lunch), dinner: clean(menu.dinner) });
  if (!saved) return { ok: false, error: "The AI service didn't answer. The menu wasn't saved." };
  refresh();
  return { ok: true };
}
