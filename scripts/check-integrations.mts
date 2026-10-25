// Read-only integration checks, apart from isolated demo auth sessions.
// No patient text, keys, access tokens or provider bodies are printed.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";

createRequire(import.meta.url)("@next/env").loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !publicKey || !secretKey || /your-project|replace_me/.test(url)) {
  console.error("BLOCKED: configure the real Supabase URL, public key and server key in the ignored .env.");
  process.exit(2);
}
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin: SupabaseClient<Database> = createClient<Database>(url, secretKey, options);
let failures = 0;
let pending = 0;
for (const table of ["patients", "mood_checkins", "checkin_photos", "checkin_reactions", "wellbeing_permissions", "wellbeing_settings", "daily_wellbeing_reviews", "notifications", "notification_prefs"] as const) {
  try {
    const result = await admin.from(table).select("*").limit(0);
    if (result.error) {
      if (result.error.code === "PGRST205") {
        pending++;
        console.log(`BLOCKED: ${table} needs the pending wellbeing migration.`);
      } else { failures++; console.error(`FAIL: ${table} access (HTTP ${result.status}).`); }
    } else console.log(`PASS: ${table} is available.`);
  } catch { failures++; console.error(`FAIL: ${table} connection.`); }
}
for (const [role, email, passwordName] of [
  ["patient", "leo.patient@example.com", "DEMO_PATIENT_PIN"],
  ["family", "emma@example.com", "DEMO_PASSWORD"],
  ["care", "sarah.nurse@example.com", "DEMO_PASSWORD"],
  ["volunteer", "maya.volunteer@example.com", "DEMO_PASSWORD"],
] as const) {
  const db: SupabaseClient<Database> = createClient<Database>(url, publicKey, options);
  try {
    const password = process.env[passwordName];
    assert.ok(password, "Demo credentials are not configured");
    const { data: session, error } = await db.auth.signInWithPassword({ email, password });
    assert.equal(error, null);
    assert.ok(session.user);
    assert.equal(session.user.app_metadata.account_type, role === "care" ? "care_team" : role);
    const [patients, checkins, photos] = await Promise.all([
      db.from("patients").select("id"),
      db.from("mood_checkins").select("patient_id").limit(100),
      db.from("checkin_photos").select("id").limit(100),
    ]);
    assert.equal(patients.error, null); assert.equal(checkins.error, null); assert.equal(photos.error, null);
    if (role === "volunteer") {
      assert.equal(patients.data?.length, 0); assert.equal(checkins.data?.length, 0); assert.equal(photos.data?.length, 0);
    } else {
      const visiblePatients = patients.data ?? [];
      assert.ok(visiblePatients.length);
      if (role !== "care") assert.equal(visiblePatients.length, 1);
      assert.ok(checkins.data?.every((c) => visiblePatients.some((p) => p.id === c.patient_id)));
      if (role === "care") assert.equal(photos.data?.length, 0);
    }
    console.log(`PASS: ${role} demo sign-in and patient/check-in/photo boundaries.`);
  } catch {
    failures++;
    console.error(`FAIL: ${role} demo access. No session or response content logged.`);
  } finally {
    await db.auth.signOut({ scope: "local" });
  }
}
console.log(`Integration checks: ${failures} failure(s), ${pending} pending migration table(s).`);
process.exitCode = failures ? 1 : pending ? 2 : 0;
