"use server";

import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/demo-mode";
import { getRole, isRoleKey, type RoleKey } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

// Seeded demo accounts (supabase/seed.sql). Passwords come from server-only env vars,
// so they never reach the client bundle. Patients sign in with their 6-digit PIN.
const DEMO_ACCOUNTS: Record<RoleKey, { email: string; secret: "DEMO_PASSWORD" | "DEMO_PATIENT_PIN" }> = {
  patient: { email: "leo.patient@example.com", secret: "DEMO_PATIENT_PIN" },
  family: { email: "camille@example.com", secret: "DEMO_PASSWORD" },
  care: { email: "ines.nurse@example.com", secret: "DEMO_PASSWORD" },
  volunteer: { email: "jordan.volunteer@example.com", secret: "DEMO_PASSWORD" },
};

export type DemoSignInState = { error: string | null };

// Signs in silently as the persona behind a role. RLS stays active: the session is a
// regular user session, so each role only sees its own data.
export async function signInAsDemoRole(_prev: DemoSignInState, formData: FormData): Promise<DemoSignInState> {
  if (!isDemoMode()) return { error: "Demo mode is off." };

  const role = formData.get("role");
  if (!isRoleKey(role)) return { error: "Unknown role." };

  const account = DEMO_ACCOUNTS[role];
  const password = process.env[account.secret];
  if (!password) return { error: `Demo sign-in is not configured (missing ${account.secret}).` };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: account.email, password });
  if (error) return { error: "Couldn't sign in to the demo account. Try again in a moment." };

  redirect(getRole(role).href);
}

export async function switchRole() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(isDemoMode() ? "/" : "/login");
}
