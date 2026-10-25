import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isDemoMode } from "@/lib/demo-mode";
import { ROLES, roleForAccountType } from "@/lib/roles";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

// Runs before every page request:
// 1. Refreshes the Supabase session and writes the new auth cookies.
// 2. Optimistic role routing: signed-out visitors go to the picker (or /login),
//    signed-in users land on their own dashboard. The real access control is RLS.
export async function proxy(request: NextRequest) {
  const env = getSupabasePublicEnv();
  if (!env) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // getClaims() verifies the JWT, so the role claim can be trusted.
  // account_type lives in app_metadata, which users can't edit.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const home = claims ? roleForAccountType(claims.app_metadata?.account_type) : undefined;

  const { pathname } = request.nextUrl;
  const roleArea = ROLES.find((r) => pathname === r.href || pathname.startsWith(`${r.href}/`));
  const entryPage = isDemoMode() ? "/" : "/login";

  if (!claims && roleArea) return redirectTo(entryPage, request, response);
  if (home && (pathname === "/" || pathname === "/login")) return redirectTo(home.href, request, response);
  if (home && roleArea && roleArea.key !== home.key) return redirectTo(home.href, request, response);

  return response;
}

// Keeps the refreshed auth cookies (and their no-cache headers) on the redirect.
function redirectTo(path: string, request: NextRequest, from: NextResponse) {
  const redirect = NextResponse.redirect(new URL(path, request.url));
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  for (const key of ["cache-control", "expires", "pragma"]) {
    const value = from.headers.get(key);
    if (value) redirect.headers.set(key, value);
  }
  return redirect;
}

export const config = {
  matcher: [
    // Everything except Next internals and static files.
    "/((?!_next/static|_next/image|manifest.webmanifest|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
