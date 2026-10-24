import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export async function loadWellbeingDashboard(role: "patient" | "family" | "care") {
  if (!getSupabasePublicEnv()) return { state: "setup" as const };
  try {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return { state: "signed_out" as const };
    const { data: profile, error: profileError } = await db.from("profiles").select("display_name,account_type").eq("id", user.id).single();
    if (profileError || !profile) return { state: "error" as const };
    const expected = role === "care" ? "care_team" : role;
    if (profile.account_type !== expected) {
      return { state: "wrong_role" as const, href: profile.account_type === "care_team" ? "/care" : `/${profile.account_type}` };
    }
    // All dashboard reads use the viewer's session and database RLS, never admin.
    const [patients, links, notifications, reviews, permissions, prefs] = await Promise.all([
      db.from("patients").select("id,nickname,is_minor,user_id,timezone,status").order("nickname"),
      db.from("patient_links").select("patient_id,is_guardian").eq("user_id", user.id).eq("status", "active"),
      db.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30),
      role === "care" ? db.from("daily_wellbeing_reviews").select("*").order("for_date", { ascending: false }).limit(30)
        : Promise.resolve({ data: [], error: null }),
      db.from("wellbeing_permissions").select("patient_id,enabled"),
      db.from("notification_prefs").select("connection_enabled").eq("user_id", user.id).maybeSingle(),
    ]);
    const errors = [patients, links, notifications, reviews, permissions, prefs].flatMap((r) => r.error ? [r.error] : []);
    if (errors.length) {
      return { state: errors.some((e) => ["PGRST205", "42P01"].includes(e.code)) ? "migration_pending" as const : "error" as const };
    }
    return { state: "ready" as const, userId: user.id, name: profile.display_name,
      patients: patients.data!, links: links.data!, notifications: notifications.data!, reviews: reviews.data!,
      permissions: permissions.data!, connectionEnabled: prefs.data?.connection_enabled ?? true,
    };
  } catch { return { state: "error" as const }; }
}
