"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/app/checkin-actions";
import { castByUserId } from "@/lib/cast";
import { saveAiRound, saveVisitRating, saveVolunteerSuggestion, sendDrawing } from "@/lib/data/care-ai";
import { getVisiblePatient } from "@/lib/data/circle";
import { todayIn } from "@/lib/dates";
import { VOLUNTEER_ROSTER } from "@/lib/demo-fixtures";
import { VISIT_OUTCOMES, type VisitOutcome } from "@/lib/matching";
import { AFFECTS, ENGAGEMENTS, INTAKES, NIGHT_SLEEPS, NURSE_NOTE_MAX, type NurseRoundInput, VISITORS } from "@/lib/nurse-round";
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

// Volunteer matching. A suggestion only means the care team tells the child about a volunteer: the
// child decides whether to ask for a visit. A rating teaches the matching how visits go.
export async function suggestVolunteer(patientId: string, volunteerId: string): Promise<ActionResult> {
  const member = await careTeamMember();
  if (!member) return { ok: false, error: "Only the care team can suggest a volunteer." };
  const patient = await getVisiblePatient(patientId);
  if (!patient) return { ok: false, error: "Patient not found." };
  if (!VOLUNTEER_ROSTER.some((v) => v.id === volunteerId)) return { ok: false, error: "Volunteer not found." };
  const board = await saveVolunteerSuggestion(todayIn(patient.timezone), patient.id, volunteerId, member.name);
  if (!board) return { ok: false, error: "The AI service didn't answer. Nothing was saved." };
  refresh();
  return { ok: true };
}

export async function rateVolunteerVisit(patientId: string, volunteerId: string, localDate: string, outcome: VisitOutcome): Promise<ActionResult> {
  const member = await careTeamMember();
  if (!member) return { ok: false, error: "Only the care team can rate a visit." };
  const patient = await getVisiblePatient(patientId);
  if (!patient) return { ok: false, error: "Patient not found." };
  const valid = VOLUNTEER_ROSTER.some((v) => v.id === volunteerId) && /^\d{4}-\d{2}-\d{2}$/.test(localDate) && VISIT_OUTCOMES.some((o) => o.value === outcome);
  if (!valid) return { ok: false, error: "This rating can't be saved." };
  const board = await saveVisitRating(todayIn(patient.timezone), patient.id, volunteerId, localDate, outcome, member.name);
  if (!board) return { ok: false, error: "The AI service didn't answer. Your rating wasn't saved." };
  refresh();
  return { ok: true };
}

