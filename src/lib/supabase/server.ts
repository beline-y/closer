import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { requireSupabasePublicEnv } from "./env";

// Supabase client for Server Components, Server Actions and Route Handlers.
// It acts as the signed-in user (via auth cookies), so RLS applies.
export async function createClient() {
  // cookies() first: it defers the work to request time, so builds without env vars (CI) still prerender.
  const cookieStore = await cookies();
  const { url, publishableKey } = requireSupabasePublicEnv();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components can't set cookies. Session refresh will be handled
          // in src/proxy.ts when the auth feature lands.
        }
      },
    },
  });
}
