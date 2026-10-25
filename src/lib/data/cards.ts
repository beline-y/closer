import "server-only";
import { castByUserId, type CastMember } from "@/lib/cast";
import { daysBetween, todayIn } from "@/lib/dates";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

// RLS: the author reads their own cards; the patient reads a card only once opened (sealed
// ones come from sealed_cards(), without the text). No care team, no volunteers.

export type CardColor = Database["public"]["Enums"]["card_color"];
export type SealedCard = { id: string; from: CastMember; color: CardColor };
export type Card = { id: string; from: CastMember; color: CardColor; body: string; openedDaysAgo: number | null; openedAt: string | null };

const dayOf = (iso: string, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));

export async function getSealedCards(): Promise<SealedCard[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("sealed_cards");
  return (data ?? []).flatMap((c) => {
    const from = castByUserId(c.author_id);
    return from ? [{ id: c.id, from, color: c.color }] : [];
  });
}

/** Cards the patient opened (the archive), newest first. */
export async function getOpenedCards(patientId: string, timezone: string): Promise<Card[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("comfort_cards")
    .select("id, author_id, color, body, opened_at")
    .eq("patient_id", patientId)
    .not("opened_at", "is", null)
    .order("opened_at", { ascending: false });
  const today = todayIn(timezone);
  return (data ?? []).flatMap((c) => {
    const from = castByUserId(c.author_id);
    return from
      ? [{ id: c.id, from, color: c.color, body: c.body, openedAt: c.opened_at, openedDaysAgo: c.opened_at ? daysBetween(today, dayOf(c.opened_at, timezone)) : null }]
      : [];
  });
}

/** The signed-in author's cards for a patient (sealed and opened). */
export async function getMyCards(userId: string, patientId: string, timezone: string): Promise<Card[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("comfort_cards")
    .select("id, author_id, color, body, opened_at, created_at")
    .eq("author_id", userId)
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });
  const today = todayIn(timezone);
  return (data ?? []).flatMap((c) => {
    const from = castByUserId(c.author_id);
    return from
      ? [{ id: c.id, from, color: c.color, body: c.body, openedAt: c.opened_at, openedDaysAgo: c.opened_at ? daysBetween(today, dayOf(c.opened_at, timezone)) : null }]
      : [];
  });
}
