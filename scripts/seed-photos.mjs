// Uploads the fictional seed photos (supabase/seed-photos/) to the private
// "checkin-photos" bucket, signed in as Leo, so it goes through the same Storage RLS
// as the app. Paths match the checkin_photos rows written by supabase/seed.sql.
import { createClient } from "@supabase/supabase-js";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

process.loadEnvFile(".env.local");
const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key, DEMO_PATIENT_PIN: pin } = process.env;
if (!url || !key || !pin) throw new Error("Fill NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and DEMO_PATIENT_PIN in .env.local");

const LEO_PATIENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const dir = "supabase/seed-photos";
const supabase = createClient(url, key, { auth: { persistSession: false } });

const { error: signInError } = await supabase.auth.signInWithPassword({ email: "leo.patient@example.com", password: pin });
if (signInError) throw signInError;

for (const file of readdirSync(dir).filter((f) => f.endsWith(".webp"))) {
  const path = `${LEO_PATIENT_ID}/seed-${file}`;
  const { error } = await supabase.storage
    .from("checkin-photos")
    .upload(path, readFileSync(join(dir, file)), { contentType: "image/webp", upsert: true });
  if (error) throw new Error(`${path}: ${error.message}`);
  console.log("uploaded", path);
}
await supabase.auth.signOut();
