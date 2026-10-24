import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireSupabasePublicEnv } from "./env";

// Supabase client for Server Components, Server Actions and Route Handlers.
// It acts as the signed-in user (via auth cookies), so RLS applies.
export async function createClient() {
  const { url, publishableKey } = requireSupabasePublicEnv();
  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
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
