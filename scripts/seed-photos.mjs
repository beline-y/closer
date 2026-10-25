// Uploads the fictional seed images to the private buckets, signed in as Leo, so it goes
// through the same Storage RLS as the app. Paths match the rows written by supabase/seed.sql:
// - supabase/seed-photos/*.webp            -> checkin-photos/{leo}/seed-{name}.webp
// - supabase/seed-photos/activities/*.webp -> activity-results/{leo}/seed-act-{name}.webp
//   (holiday-emma is Emma's side of the holiday challenge: {leo}/{session}/partner.webp)
import { createClient } from "@supabase/supabase-js";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

process.loadEnvFile(".env.local");
const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key, DEMO_PATIENT_PIN: pin } = process.env;
if (!url || !key || !pin) throw new Error("Fill NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and DEMO_PATIENT_PIN in .env.local");

const LEO_PATIENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const HOLIDAY_CHALLENGE = "b0000000-0000-4000-8000-000000000006";
const supabase = createClient(url, key, { auth: { persistSession: false } });

const { error: signInError } = await supabase.auth.signInWithPassword({ email: "leo.patient@example.com", password: pin });
if (signInError) throw signInError;

async function upload(bucket, dir, pathFor) {
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".webp"))) {
    const path = pathFor(file.replace(/\.webp$/, ""));
    // Replace = delete + upload (buckets have no update policy on purpose).
    await supabase.storage.from(bucket).remove([path]);
    const { error } = await supabase.storage.from(bucket).upload(path, readFileSync(join(dir, file)), { contentType: "image/webp" });
    if (error) throw new Error(`${bucket}/${path}: ${error.message}`);
    console.log("uploaded", `${bucket}/${path}`);
  }
}

await upload("checkin-photos", "supabase/seed-photos", (name) => `${LEO_PATIENT_ID}/seed-${name}.webp`);
await upload("activity-results", "supabase/seed-photos/activities", (name) =>
  name === "holiday-emma" ? `${LEO_PATIENT_ID}/${HOLIDAY_CHALLENGE}/partner.webp` : `${LEO_PATIENT_ID}/seed-act-${name}.webp`,
);
await supabase.auth.signOut();
