import "server-only";
import type { MealAmount, RatedDish } from "@/lib/checkin";
import type { CheckInView } from "@/lib/data/checkins";
import { getVisiblePatients, type VisiblePatient } from "@/lib/data/circle";
import { CONTACT_REQUESTS, VOLUNTEER_ROSTER } from "@/lib/demo-fixtures";
import type { DrawingsView } from "@/lib/drawings";
import type { MatchBoard, VisitOutcome } from "@/lib/matching";
import type { AiOverview, AiReport, NurseRoundInput, WardMenu } from "@/lib/nurse-round";
import { createClient } from "@/lib/supabase/server";

// The AI module (ml/, Python) runs as a small local service next to the app. Only this
// server code talks to it, with a shared secret, and only after Supabase RLS has shown that
// the signed-in care team member may see the child. The browser never reaches it.
// Every call fails soft: when the service is off, the care tab says so and carries on.

// A stale report waits for Claude: one summary, plus every new note read in parallel.
const TIMEOUT_MS = 45_000;
const OVERVIEW_TIMEOUT_MS = 90_000;

export function aiConfigured(): boolean {
  return missingAiSettings().length === 0;
}

/** Names of the settings this deployment lacks (never their values), to say what to fix. */
export function missingAiSettings(): string[] {
  return (["CLOSER_AI_URL", "CLOSER_AI_TOKEN"] as const).filter((name) => !process.env[name]?.trim());
}

async function call<T>(method: "GET" | "POST" | "PUT", path: string, body?: unknown, timeout = TIMEOUT_MS): Promise<T | null> {
  if (!aiConfigured()) return null;
  try {
    const response = await fetch(`${process.env.CLOSER_AI_URL}${path}`, {
      method,
      cache: "no-store",
      headers: { Authorization: `Bearer ${process.env.CLOSER_AI_TOKEN}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) {
      console.error(`AI service ${method} ${path.split("/").slice(0, 3).join("/")}: HTTP ${response.status}`);
      return null;
    }
    return (await response.json()) as T;
  } catch {
    console.error("AI service unreachable");
    return null;
  }
}

/** Interests and whether any family or friend is linked: what the AI needs beyond the check-ins. */
async function profiles(ids: string[]): Promise<Map<string, { interests: string[]; hasFamily: boolean }>> {
  const supabase = await createClient();
  const [{ data: patients }, { data: links }] = await Promise.all([
    supabase.from("patients").select("id, interests").in("id", ids),
    supabase.from("patient_links").select("patient_id").in("patient_id", ids).in("role", ["family", "friend"]).eq("status", "active"),
  ]);
  const linked = new Set((links ?? []).map((l) => l.patient_id));
  return new Map((patients ?? []).map((p) => [p.id, { interests: p.interests ?? [], hasFamily: linked.has(p.id) }]));
}

const SHARE: Record<MealAmount, number> = { all: 1, half: 0.5, a_little: 0.2 };

/** How much the child ate across the day's rated dishes, in the app's three amounts (null if none given). */
function amountEaten(dishes: RatedDish[]): MealAmount | null {
  const shares = dishes.flatMap((d) => (d.amount ? [SHARE[d.amount]] : []));
  if (shares.length === 0) return null;
  const mean = shares.reduce((a, b) => a + b, 0) / shares.length;
  return mean >= 0.75 ? "all" : mean >= 0.35 ? "half" : "a_little";
}

function dayBefore(today: string, days: number): string {
  return new Date(Date.parse(today) - days * 86_400_000).toISOString().slice(0, 10);
}

function syncPayload(patient: VisiblePatient, today: string, checkins: CheckInView[], profile?: { interests: string[]; hasFamily: boolean }) {
  return {
    today,
    patient: {
      nickname: patient.nickname,
      birth_year: patient.birthYear,
      interests: profile?.interests ?? [],
      has_family: profile?.hasFamily ?? true,
    },
    // Mood, how much was eaten, activities and note only: photos and reactions never leave Supabase.
    checkins: checkins.map((c) => ({
      local_date: dayBefore(today, c.daysAgo),
      mood: c.mood,
      meals: [...new Set(c.dishes.map((d) => d.meal))],
      meal_amount: amountEaten(c.dishes),
      activities: c.activities,
      note: c.note,
    })),
  };
}

/** Sends the child's check-ins, refreshes the assessment if anything changed, returns the report. */
export async function getAiReport(patient: VisiblePatient, today: string, checkins: CheckInView[]): Promise<AiReport | null> {
  const profile = (await profiles([patient.id])).get(patient.id);
  return call<AiReport>("POST", `/v1/patients/${patient.id}/sync`, syncPayload(patient, today, checkins, profile));
}

/** One line per child for the patients table, keyed by patient id. */
export async function getAiOverview(children: { patient: VisiblePatient; today: string; checkins: CheckInView[] }[]): Promise<Map<string, AiOverview> | null> {
  if (!aiConfigured() || children.length === 0) return null;
  const known = await profiles(children.map((c) => c.patient.id));
  const result = await call<{ patients: AiOverview[] }>("POST", "/v1/overview", {
    patients: children.map((c) => ({ id: c.patient.id, ...syncPayload(c.patient, c.today, c.checkins, known.get(c.patient.id)) })),
  }, OVERVIEW_TIMEOUT_MS);
  return result ? new Map(result.patients.map((p) => [p.patient_id, p])) : null;
}

export async function saveAiRound(patientId: string, today: string, round: NurseRoundInput, observedBy: string | null): Promise<AiReport | null> {
  return call<AiReport>("PUT", `/v1/patients/${patientId}/observations/${today}`, {
    observed_by: observedBy,
    observation: {
      lunch: round.lunch,
      dinner: round.dinner,
      affect: round.affect,
      engagement: round.engagement,
      pain: round.pain,
      night_sleep: round.nightSleep,
      refused_care: round.refusedCare,
      asks_psychologist: round.asksPsychologist,
      visits: round.visits,
      note: round.note,
    },
  });
}

/** Every drawing of the last 30 days and this week against the child's usual drawings. */
export async function getDrawingsView(patientId: string, today: string): Promise<DrawingsView | null> {
  return call<DrawingsView>("GET", `/v1/patients/${patientId}/drawings/${today}`);
}

/** A drawing (JPEG, base64) for Claude and the color analysis; the image itself is not kept. */
export async function sendDrawing(patientId: string, today: string, image: string, title: string | null): Promise<boolean> {
  const result = await call<{ drawing: unknown }>("POST", `/v1/patients/${patientId}/drawings`, { local_date: today, today, image, title });
  return result !== null;
}

export async function getWardMenu(day: string): Promise<WardMenu | null> {
  return call<WardMenu>("GET", `/v1/menu/${day}`);
}

export async function saveWardMenu(day: string, menu: WardMenu): Promise<WardMenu | null> {
  return call<WardMenu>("PUT", `/v1/menu/${day}`, menu);
}

// Volunteer matching. The children this care team member follows (RLS), with their age and interests
// only: never check-ins, notes or anything medical. The roster and the contact requests are still
// demo fixtures (docs/VOLUNTEER_SCREENING.md).
async function matchingPayload(today: string) {
  const patients = await getVisiblePatients();
  const known = await profiles(patients.map((p) => p.id));
  const visible = new Set(patients.map((p) => p.id));
  return {
    today,
    patients: patients.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      birth_year: p.birthYear,
      interests: known.get(p.id)?.interests ?? [],
      has_family: known.get(p.id)?.hasFamily ?? true,
    })),
    volunteers: VOLUNTEER_ROSTER.map((v) => ({
      id: v.id,
      first_name: v.firstName,
      job: v.job,
      story: v.story,
      passions: v.passions,
      dreams: v.dreams,
      fun_fact: v.funFact,
      languages: v.languages,
      slots: v.slotsPerWeek,
      ages: v.ages,
    })),
    requests: CONTACT_REQUESTS.filter((r) => visible.has(r.patientId)).map((r) => ({
      patient_id: r.patientId,
      volunteer_id: r.volunteer,
      status: r.status,
      local_date: dayBefore(today, r.daysAgo),
    })),
  };
}

/** This week's suggested volunteer for every child, the alternatives and the visits to rate. */
export async function getMatchBoard(today: string): Promise<MatchBoard | null> {
  if (!aiConfigured()) return null;
  return call<MatchBoard>("POST", "/v1/matching", await matchingPayload(today));
}

export async function saveVolunteerSuggestion(today: string, patientId: string, volunteerId: string, suggestedBy: string | null): Promise<MatchBoard | null> {
  if (!aiConfigured()) return null;
  return call<MatchBoard>("POST", "/v1/matching/suggestions", {
    ...(await matchingPayload(today)),
    suggestion: { patient_id: patientId, volunteer_id: volunteerId, suggested_by: suggestedBy },
  });
}

export async function saveVisitRating(today: string, patientId: string, volunteerId: string, localDate: string, outcome: VisitOutcome, ratedBy: string | null): Promise<MatchBoard | null> {
  if (!aiConfigured()) return null;
  return call<MatchBoard>("POST", "/v1/matching/visits", {
    ...(await matchingPayload(today)),
    visit: { patient_id: patientId, volunteer_id: volunteerId, local_date: localDate, outcome, rated_by: ratedBy },
  });
}
