import "server-only";
import type { CheckInView } from "@/lib/data/checkins";
import type { VisiblePatient } from "@/lib/data/circle";
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
  return Boolean(process.env.CLOSER_AI_URL && process.env.CLOSER_AI_TOKEN);
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
    // Mood, meal, activities and note only: photos and reactions never leave Supabase.
    checkins: checkins.map((c) => ({
      local_date: dayBefore(today, c.daysAgo),
      mood: c.mood,
      meals: c.meals,
      meal_amount: c.mealAmount,
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

export async function getWardMenu(day: string): Promise<WardMenu | null> {
  return call<WardMenu>("GET", `/v1/menu/${day}`);
}

export async function saveWardMenu(day: string, menu: WardMenu): Promise<WardMenu | null> {
  return call<WardMenu>("PUT", `/v1/menu/${day}`, menu);
}
