import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { Database } from "./database.types";
import { requireSupabasePublicEnv } from "./env";

// Supabase client for Server Components, Server Actions and Route Handlers.
// It acts as the signed-in user (via auth cookies), so RLS applies.
export async function createClient() {
  // The SDK reads the clock during construction. Keep it after the request
  // boundary so Cache Components never tries to prerender that clock read.
  await connection();
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
          // Server Components can't set cookies. src/proxy.ts persists session
          // refreshes on the authenticated dashboard routes.
        }
      },
    },
  });
}
