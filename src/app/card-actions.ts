"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type CardColor = "sun" | "coral" | "sky" | "lilac";
const COLORS: CardColor[] = ["sun", "coral", "sky", "lilac"];

export type CardResult = { ok: true } | { ok: false; error: string };

// A family member or friend writes a sealed card for the patient they're linked to (RLS).
export async function writeCard(body: string, color: CardColor): Promise<CardResult> {
  const text = body.trim().slice(0, 1000);
  if (!text) return { ok: false, error: "Write something first." };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { ok: false, error: "Not signed in." };
  const { data: patient } = await supabase.from("patients").select("id").eq("status", "active").limit(1).maybeSingle();
  if (!patient) return { ok: false, error: "Cards are for a patient's family and friends." };
  const { error } = await supabase
    .from("comfort_cards")
    .insert({ patient_id: patient.id, author_id: userId, body: text, color: COLORS.includes(color) ? color : "coral" });
  if (error) return { ok: false, error: "Couldn't seal the card. Try again?" };
  refresh();
  return { ok: true };
}

// Takes back a card that wasn't opened yet (RLS: author, sealed only).
export async function takeBackCard(id: string): Promise<CardResult> {
  const supabase = await createClient();
  const { error, count } = await supabase.from("comfort_cards").delete({ count: "exact" }).eq("id", id);
  if (error || !count) return { ok: false, error: "This card can't be taken back (maybe it was just opened)." };
  refresh();
  return { ok: true };
}

// The patient opens a card: the first opening is kept, the author sees it live.
export async function openCard(id: string): Promise<{ ok: true; body: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_comfort_card", { p_card_id: id });
  const card = data?.[0];
  if (error || !card) return { ok: false, error: "This card couldn't open. Try again?" };
  return { ok: true, body: card.body };
}
