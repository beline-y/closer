import type { RoleKey } from "@/lib/roles";

// The demo cast, shared by every role so the demo tells one story.
// Ids match supabase/seed.sql. Avatars are emoji "stickers" until real photos exist.
export type CastId = "leo" | "emma" | "james" | "noah" | "sarah" | "maya" | "daniel" | "ava" | "lucas";

export type CastMember = {
  id: CastId;
  userId: string | null;
  name: string;
  avatar: string;
  role: RoleKey;
  /** How the patient's circle refers to them ("Mom", "Best friend"…) */
  relationship?: string;
};

export const CAST: Record<CastId, CastMember> = {
  leo: { id: "leo", userId: "11111111-1111-4111-8111-111111111111", name: "Leo", avatar: "🦖", role: "patient" },
  emma: { id: "emma", userId: "22222222-2222-4222-8222-222222222222", name: "Emma", avatar: "🌻", role: "family", relationship: "Mom" },
  james: { id: "james", userId: "33333333-3333-4333-8333-333333333333", name: "James", avatar: "🎸", role: "family", relationship: "Dad" },
  noah: { id: "noah", userId: "77777777-7777-4777-8777-777777777777", name: "Noah", avatar: "⚽", role: "family", relationship: "Best friend" },
  sarah: { id: "sarah", userId: "44444444-4444-4444-8444-444444444444", name: "Sarah", avatar: "🩺", role: "care", relationship: "Nurse" },
  maya: { id: "maya", userId: "55555555-5555-4555-8555-555555555555", name: "Maya", avatar: "🐬", role: "volunteer" },
  daniel: { id: "daniel", userId: "66666666-6666-4666-8666-666666666666", name: "Daniel", avatar: "✈️", role: "volunteer" },
  ava: { id: "ava", userId: null, name: "Ava", avatar: "🦋", role: "patient" },
  lucas: { id: "lucas", userId: null, name: "Lucas", avatar: "🚂", role: "patient" },
};

/** Seeded patient ids (public.patients.id) */
export const PATIENT_IDS = {
  leo: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  ava: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  lucas: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
} as const;

const PATIENT_CAST: Record<string, CastMember> = {
  [PATIENT_IDS.leo]: CAST.leo,
  [PATIENT_IDS.ava]: CAST.ava,
  [PATIENT_IDS.lucas]: CAST.lucas,
};

export function castByPatientId(patientId: string): CastMember | undefined {
  return PATIENT_CAST[patientId];
}

export function castByUserId(userId: string): CastMember | undefined {
  return Object.values(CAST).find((m) => m.userId === userId);
}

/** Leo's circle in display order */
export const LEO_CIRCLE: CastMember[] = [CAST.emma, CAST.james, CAST.noah];
