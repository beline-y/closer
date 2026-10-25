"use server";

import { createClient } from "@/lib/supabase/server";

// Marks stories as seen by the signed-in person (RLS: own rows only). Already seen is fine.
export async function markStoriesSeen(keys: string[]): Promise<{ ok: boolean }> {
  const clean = [...new Set(keys.filter((k) => typeof k === "string" && k.length > 0 && k.length <= 120))].slice(0, 50);
  if (clean.length === 0) return { ok: true };
  const supabase = await createClient();
  const { error } = await supabase.from("story_seen").upsert(
    clean.map((item_key) => ({ item_key })),
    { onConflict: "user_id,item_key", ignoreDuplicates: true },
  );
  return { ok: !error };
}
