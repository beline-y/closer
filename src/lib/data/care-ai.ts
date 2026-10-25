import "server-only";
import type { MealAmount, RatedDish } from "@/lib/checkin";
import type { CheckInView } from "@/lib/data/checkins";
import type { VisiblePatient } from "@/lib/data/circle";
import type { EngagementDay } from "@/lib/data/engagement";
import type { DrawingsView } from "@/lib/drawings";
import type { AiOverview, AiReport, NurseRoundInput } from "@/lib/nurse-round";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

// The AI module (ml/, Python) runs as a small local service next to the app. Only this
// server code talks to it, with a shared secret, and only after Supabase RLS has shown that
// the signed-in care team member may see the child. The browser never reaches it.
// Every call fails soft: when the service is off, the care tab shows the last summary it
// stored in Supabase (ai_summaries, care team only), with its date.

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

type Child = { patient: VisiblePatient; today: string; checkins: CheckInView[]; engagement: EngagementDay[] };

function syncPayload({ patient, today, checkins, engagement }: Child, profile?: { interests: string[]; hasFamily: boolean }) {
  return {
    today,
    // Counts only, oldest first, the last one is today: never who, never what was said.
    family_contacts_per_day: engagement.map((d) => d.familyContacts),
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

/** An AI reading, live (storedAt null) or the last one kept while the service is off. */
export type Reading<T> = { value: T; storedAt: string | null };

type SummaryKind = "overview" | "report";

async function store(kind: SummaryKind, rows: { patientId: string; value: AiOverview | AiReport }[]) {
  if (rows.length === 0) return;
  const supabase = await createClient();
  const storedAt = new Date().toISOString();
  const { error } = await supabase.from("ai_summaries").upsert(
    rows.map((r) => ({ patient_id: r.patientId, kind, payload: r.value as unknown as Json, stored_at: storedAt })),
    { onConflict: "patient_id,kind" },
  );
  if (error) console.error("ai_summaries store failed", error.code);
}

async function stored<T>(kind: SummaryKind, ids: string[]): Promise<Map<string, Reading<T>>> {
  const supabase = await createClient();
  const { data } = await supabase.from("ai_summaries").select("patient_id, payload, stored_at").eq("kind", kind).in("patient_id", ids);
  return new Map((data ?? []).map((r) => [r.patient_id, { value: r.payload as unknown as T, storedAt: r.stored_at }]));
}

/** Sends the child's check-ins and counts, refreshes the assessment if anything changed, returns the report. */
export async function getAiReport(child: Child): Promise<Reading<AiReport> | null> {
  const profile = (await profiles([child.patient.id])).get(child.patient.id);
  const report = await call<AiReport>("POST", `/v1/patients/${child.patient.id}/sync`, syncPayload(child, profile));
  if (report) {
    await store("report", [{ patientId: child.patient.id, value: report }]);
    return { value: report, storedAt: null };
  }
  return (await stored<AiReport>("report", [child.patient.id])).get(child.patient.id) ?? null;
}

/** One line per child for the patients table, keyed by patient id. */
export async function getAiOverview(children: Child[]): Promise<Map<string, Reading<AiOverview>>> {
  if (children.length === 0) return new Map();
  const known = await profiles(children.map((c) => c.patient.id));
  const result = aiConfigured()
    ? await call<{ patients: AiOverview[] }>("POST", "/v1/overview", {
        patients: children.map((c) => ({ id: c.patient.id, ...syncPayload(c, known.get(c.patient.id)) })),
      }, OVERVIEW_TIMEOUT_MS)
    : null;
  if (result) {
    await store("overview", result.patients.map((p) => ({ patientId: p.patient_id, value: p })));
    return new Map(result.patients.map((p) => [p.patient_id, { value: p, storedAt: null }]));
  }
  return stored<AiOverview>("overview", children.map((c) => c.patient.id));
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

