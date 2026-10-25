import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";

// In-memory SQL/RLS verification only; never connects to the shared dev project.
export async function testDatabase() {
  const db = new PGlite();
  await db.exec(`
    -- Fixtures use UTC patients; don't inherit the developer machine's date.
    set time zone 'UTC';
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text unique, owner_id text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated, service_role;
    grant select, insert, update, delete on storage.objects to authenticated;
    create publication supabase_realtime;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to service_role;
  `);
  for (const name of (await readdir("supabase/migrations")).filter((n) => n.endsWith(".sql")).sort()) {
    await db.exec(await readFile(`supabase/migrations/${name}`, "utf8"));
  }
  return db;
}
