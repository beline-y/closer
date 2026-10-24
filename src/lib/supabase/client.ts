import { createBrowserClient } from "@supabase/ssr";
import { requireSupabasePublicEnv } from "./env";

// Supabase client for Client Components (runs in the browser).
export function createClient() {
  const { url, publishableKey } = requireSupabasePublicEnv();
  return createBrowserClient(url, publishableKey);
}
