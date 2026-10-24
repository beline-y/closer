import "server-only";
import { CAST, castByUserId, type CastMember } from "@/lib/cast";
import { createClient } from "@/lib/supabase/server";

export type VisiblePatient = { id: string; nickname: string; birthYear: number | null; timezone: string; member: CastMember | undefined };

// Seeded data read through RLS: each role only gets what it may see.
// Cast metadata (avatar, color) is merged in by user id or nickname.

export async function getVisiblePatients(): Promise<VisiblePatient[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("patients").select("id, nickname, birth_year, timezone").order("nickname");
  return (data ?? []).map((p) => ({
    id: p.id,
    nickname: p.nickname,
    birthYear: p.birth_year,
    timezone: p.timezone,
    member: Object.values(CAST).find((m) => m.role === "patient" && m.name === p.nickname),
  }));
}

export async function getVisiblePatient(id: string): Promise<VisiblePatient | null> {
  const patients = await getVisiblePatients();
  return patients.find((p) => p.id === id) ?? null;
}

/** Family and friends linked to the patient, as the signed-in user may see them. */
export async function getVisibleCircle(): Promise<CastMember[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id").neq("account_type", "patient");
  return (data ?? [])
    .map((p) => castByUserId(p.id))
    .filter((m): m is CastMember => m !== undefined && m.role === "family");
}
