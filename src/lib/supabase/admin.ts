import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { requireSupabasePublicEnv } from "./env";

export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Missing server database key");
  return createClient<Database>(requireSupabasePublicEnv().url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
