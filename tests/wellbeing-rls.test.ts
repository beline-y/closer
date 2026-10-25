import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { testDatabase } from "./database";

const ids = {
  child: "11111111-1111-4111-8111-111111111111", guardian: "22222222-2222-4222-8222-222222222222",
  brother: "33333333-3333-4333-8333-333333333333", nurse: "44444444-4444-4444-8444-444444444444",
  adult: "55555555-5555-4555-8555-555555555555", stranger: "66666666-6666-4666-8666-666666666666",
  patient: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", other: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
};
let db: PGlite;
before(async () => { db = await testDatabase(); });
after(async () => { await db.close(); });
beforeEach(async () => {
  await db.exec("reset role; truncate auth.users, public.patients cascade;");
  for (const user of [ids.child, ids.guardian, ids.brother, ids.nurse, ids.adult, ids.stranger]) {
    await db.query("insert into auth.users(id,email) values ($1, 'fictional@example.com')", [user]);
  }
  await db.query(`insert into public.patients(id,user_id,nickname,is_minor,status,timezone)
    values ($1,$2,'Louis',true,'active','UTC'), ($3,$4,'Maya',false,'active','UTC')`, [ids.patient, ids.child, ids.other, ids.adult]);
  await db.query(`insert into public.patient_links(patient_id,user_id,role,is_guardian) values
    ($1,$2,'family',true), ($1,$3,'family',false), ($1,$4,'care_team',false)`, [ids.patient, ids.guardian, ids.brother, ids.nurse]);
});

async function asUser(id: string) {
  await db.exec("reset role; set role authenticated;");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
}
async function admin() { await db.exec("reset role;"); }
async function grantConsent() {
  await asUser(ids.guardian);
  await db.query("select public.set_wellbeing_consent($1,true)", [ids.patient]);
  await admin();
}
async function claim() {
  await db.exec("reset role; set role service_role;");
  return (await db.query<{ review_id: string; token: string }>("select * from public.claim_daily_review($1,current_date-1)", [ids.patient])).rows[0];
}
async function complete(c: { review_id: string; token: string }, extra: Record<string, unknown> = {}) {
  await db.exec("reset role; set role service_role;");
  const result = { level: "check_in", source: "mistral", model: "test-double", summary: "Shared low mood warrants a conversation.",
    evidence: [], suggested_action: "Ask how they feel.", safeguarding_concern: false, prompt_version: "test", ...extra };
  return (await db.query<{ saved: boolean }>("select public.complete_daily_review($1,$2,$3::jsonb,'Ask Louis about the film','Want a little company?') as saved",
    [c.review_id, c.token, JSON.stringify(result)])).rows[0].saved;
}

test("every public table has RLS and no anonymous read access", async () => {
  const tables = await db.query<{ relname: string; relrowsecurity: boolean }>("select relname,relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'");
  assert.ok(tables.rows.length >= 9);
  assert.ok(tables.rows.every((t) => t.relrowsecurity));
  await db.exec("set role anon");
  await assert.rejects(db.query("select * from public.notifications"), /permission denied/);
});

test("only an active guardian or the adult patient can opt in", async () => {
  for (const user of [ids.child, ids.brother, ids.nurse, ids.stranger]) {
    await asUser(user);
    await assert.rejects(db.query("select public.set_wellbeing_consent($1,true)", [ids.patient]), /Only an active guardian/);
  }
  await asUser(ids.adult);
  await db.query("select public.set_wellbeing_consent($1,true)", [ids.other]);
  await grantConsent();
  await db.query("update public.patient_links set status='revoked' where user_id=$1", [ids.guardian]);
  assert.equal(await claim(), undefined);
});

test("opt-in is required and claims and deliveries are idempotent", async () => {
  assert.equal(await claim(), undefined);
  await grantConsent();
  const c = await claim();
  assert.ok(c);
  assert.equal(await claim(), undefined);
  assert.equal(await complete(c), true);
  assert.equal(await complete(c), false);
  assert.equal(await claim(), undefined);
  await admin();
  const counts = await db.query<{ count: number }>("select count(*)::int as count from public.notifications");
  assert.equal(counts.rows[0].count, 4); // care + guardian alert; guardian + child invitation
});

test("review evidence is care-only, including for the child and guardian", async () => {
  await grantConsent(); await complete(await claim());
  for (const user of [ids.child, ids.guardian, ids.brother, ids.stranger]) {
    await asUser(user);
    assert.equal((await db.query("select * from public.daily_wellbeing_reviews")).rows.length, 0);
    await assert.rejects(db.query("select * from public.claim_daily_review($1,current_date-1)", [ids.patient]), /permission denied/);
  }
  await asUser(ids.nurse);
  assert.equal((await db.query("select * from public.daily_wellbeing_reviews")).rows.length, 1);
});

test("notifications are owner-only and disappear on link revocation", async () => {
  await grantConsent(); await complete(await claim());
  await asUser(ids.child);
  const own = await db.query<{ kind: string }>("select kind from public.notifications");
  assert.deepEqual(own.rows.map((r) => r.kind), ["connection"]);
  await asUser(ids.brother);
  assert.equal((await db.query("select * from public.notifications")).rows.length, 0);
  await asUser(ids.guardian);
  assert.equal((await db.query("select * from public.notifications")).rows.length, 2);
  await assert.rejects(db.query("update public.notifications set body='changed'"), /permission denied/);
  await admin();
  await db.query("update public.patient_links set status='revoked' where user_id=$1", [ids.guardian]);
  await asUser(ids.guardian);
  assert.equal((await db.query("select * from public.notifications")).rows.length, 0);
});

test("opt-out in flight discards the result and delivers nothing", async () => {
  await grantConsent(); const c = await claim();
  await asUser(ids.guardian); await db.query("select public.set_wellbeing_consent($1,false)", [ids.patient]);
  assert.equal(await complete(c), false);
  await admin();
  assert.equal((await db.query("select * from public.notifications")).rows.length, 0);
  assert.equal((await db.query("select * from public.daily_wellbeing_reviews")).rows.length, 0);
});

test("safeguarding concerns reach care staff but do not notify guardians", async () => {
  await grantConsent(); await complete(await claim(), { level: "priority", safeguarding_concern: true });
  await asUser(ids.guardian);
  assert.equal((await db.query("select * from public.notifications")).rows.length, 0);
  await asUser(ids.nurse);
  assert.equal((await db.query("select * from public.notifications where kind='wellbeing_alert'")).rows.length, 1);
});

test("connection opt-out does not suppress care or guardian support alerts", async () => {
  await grantConsent();
  await asUser(ids.guardian);
  await db.query("insert into public.notification_prefs(user_id,connection_enabled) values ($1,false)", [ids.guardian]);
  await complete(await claim());
  await asUser(ids.guardian);
  assert.deepEqual((await db.query<{ kind: string }>("select kind from public.notifications")).rows.map((r) => r.kind), ["wellbeing_alert"]);
});

test("rules-only failures notify care staff and allow bounded retries", async () => {
  await grantConsent();
  const c = await claim(); await complete(c, { source: "rules", level: "routine" });
  assert.ok(await claim());
  await admin();
  await db.exec("update public.daily_wellbeing_reviews set status='rules_only', attempts=3");
  assert.equal(await claim(), undefined);
  await asUser(ids.nurse);
  assert.match((await db.query<{ title: string }>("select title from public.notifications where kind='wellbeing_alert'")).rows[0].title, /unavailable/);
});

test("patients can write today's check-in but cannot forge another patient or earlier day", async () => {
  await asUser(ids.child);
  await db.query("insert into public.mood_checkins(patient_id,mood,activities) values ($1,4,'{movie}')", [ids.patient]);
  await db.query("update public.mood_checkins set mood=3 where patient_id=$1", [ids.patient]);
  await assert.rejects(db.query("insert into public.mood_checkins(patient_id,local_date,mood) values ($1,current_date-1,4)", [ids.patient]), /permission denied/);
  await assert.rejects(db.query("insert into public.mood_checkins(patient_id,mood) values ($1,4)", [ids.other]), /row-level security/);
  await asUser(ids.guardian);
  assert.equal((await db.query("select * from public.mood_checkins")).rows.length, 1);
  assert.equal((await db.query("update public.mood_checkins set mood=5 returning id")).rows.length, 0);
});

test("only linked care staff can acknowledge reviews", async () => {
  await grantConsent(); const c = await claim(); await complete(c);
  await asUser(ids.guardian);
  await assert.rejects(db.query("select public.acknowledge_wellbeing_review($1)", [c.review_id]), /Review unavailable/);
  await asUser(ids.nurse);
  await db.query("select public.acknowledge_wellbeing_review($1)", [c.review_id]);
  assert.equal((await db.query<{ acknowledged_by: string }>("select acknowledged_by from public.daily_wellbeing_reviews")).rows[0].acknowledged_by, ids.nurse);
});
