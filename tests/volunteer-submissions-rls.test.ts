import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { testDatabase } from "./database";

const ids = {
  volunteer: "55555555-5555-4555-8555-555555555555", other: "66666666-6666-4666-8666-666666666666",
  child: "11111111-1111-4111-8111-111111111111", family: "22222222-2222-4222-8222-222222222222",
  care: "44444444-4444-4444-8444-444444444444", submission: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};
let db: PGlite;
before(async () => { db = await testDatabase(); });
after(async () => { await db.close(); });
beforeEach(async () => {
  await db.exec("reset role; truncate auth.users cascade;");
  for (const [role, id] of Object.entries(ids).filter(([key]) => key !== "submission")) {
    await db.query("insert into auth.users(id,email) values ($1,'fictional@example.com')", [id]);
    await db.query("update public.profiles set account_type=$1 where id=$2", [role === "other" ? "volunteer" : role === "child" ? "patient" : role === "care" ? "care_team" : role, id]);
  }
  await db.query(`insert into public.volunteer_submissions(id,volunteer_id,volunteer_name,kind,context_key,context_label,body,screening_state,categories,explanation,evidence)
    values ($1,$2,'Fictional volunteer','event_application','ev-1','Board games','Threatening sample','classified','{aggression}','Threatening language.','{"Threatening sample"}')`, [ids.submission, ids.volunteer]);
});
async function asUser(id: string) {
  await db.exec("reset role; set role authenticated;");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}

test("only the author and care staff can read applicant messages, even after approval", async () => {
  for (const id of [ids.volunteer, ids.care]) {
    await asUser(id);
    assert.equal((await db.query("select * from public.volunteer_submissions")).rows.length, 1);
  }
  await asUser(ids.care);
  await db.query("select public.review_volunteer_submission($1,'approved')", [ids.submission]);
  for (const id of [ids.other, ids.child, ids.family]) {
    await asUser(id);
    assert.equal((await db.query("select * from public.volunteer_submissions")).rows.length, 0);
  }
  await db.exec("reset role; set role anon;");
  await assert.rejects(db.query("select * from public.volunteer_submissions"), /permission denied/);
});

test("volunteers cannot bypass screening, forge approval or review each other's messages", async () => {
  for (const id of [ids.volunteer, ids.other, ids.child, ids.family]) {
    await asUser(id);
    await assert.rejects(db.query("update public.volunteer_submissions set status='approved'"), /permission denied/);
    await assert.rejects(db.query("insert into public.volunteer_submissions select * from public.volunteer_submissions"), /permission denied/);
    await assert.rejects(db.query("select public.review_volunteer_submission($1,'approved')", [ids.submission]), /Care team access required/);
  }
});

test("care decisions are persisted with the real reviewer and cannot overwrite a prior decision", async () => {
  await asUser(ids.care);
  assert.equal((await db.query<{ saved: boolean }>("select public.review_volunteer_submission($1,'rejected') as saved", [ids.submission])).rows[0].saved, true);
  assert.equal((await db.query<{ saved: boolean }>("select public.review_volunteer_submission($1,'approved') as saved", [ids.submission])).rows[0].saved, false);
  const row = (await db.query<{ status: string; reviewed_by: string; reviewed_at: string }>("select * from public.volunteer_submissions")).rows[0];
  assert.equal(row.status, "rejected"); assert.equal(row.reviewed_by, ids.care); assert.ok(row.reviewed_at);
  await assert.rejects(db.query("select public.review_volunteer_submission($1,'anything')", [ids.submission]), /Invalid decision/);
});

test("AI failure stays pending for manual review; care staff can make a decision", async () => {
  await db.query("update public.volunteer_submissions set screening_state='unavailable', categories='{}', evidence='{}', model=null");
  await asUser(ids.care);
  await db.query("select public.review_volunteer_submission($1,'approved')", [ids.submission]);
  const row = (await db.query<{ screening_state: string; status: string }>("select * from public.volunteer_submissions")).rows[0];
  assert.equal(row.screening_state, "unavailable"); assert.equal(row.status, "approved");
});
