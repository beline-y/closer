import { afterEach, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { analyseWithMistral } from "../src/lib/wellbeing/mistral";
import { ruleReview, type ReviewContext } from "../src/lib/wellbeing/core";
import { GET } from "../src/app/api/cron/wellbeing/route";

const saved = { key: process.env.MISTRAL_API_KEY, model: process.env.MISTRAL_MODEL, cron: process.env.CRON_SECRET, db: process.env.SUPABASE_SECRET_KEY };
const context: ReviewContext = {
  forDate: "2026-10-23", monitoringSince: "2026-10-20", lowMoodThreshold: 2, lowMoodStreak: 3, noCheckinDays: 2,
  checkins: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", local_date: "2026-10-23", mood: 4, activity: "Watched a movie", note: "It was fun" }],
};
beforeEach(() => { process.env.MISTRAL_API_KEY = "fictional-test-key"; process.env.MISTRAL_MODEL = "test-model"; });
afterEach(() => {
  mock.restoreAll();
  for (const [key, value] of Object.entries({ MISTRAL_API_KEY: saved.key, MISTRAL_MODEL: saved.model, CRON_SECRET: saved.cron, SUPABASE_SECRET_KEY: saved.db })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

function response(value: unknown, finishReason = "stop") {
  return Response.json({ choices: [{ finish_reason: finishReason, message: { content: JSON.stringify(value) } }] });
}

test("Mistral uses server auth, structured output and minimized shared context", async () => {
  let body: Record<string, unknown> | undefined;
  mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "https://api.mistral.ai/v1/chat/completions");
    assert.equal(new Headers(init.headers).get("authorization"), "Bearer fictional-test-key");
    assert.equal(init.cache, "no-store");
    assert.ok(init.signal);
    body = JSON.parse(String(init.body));
    return response(ruleReview(context));
  });
  const result = await analyseWithMistral(context, 9);
  assert.equal(result.model, "test-model");
  assert.equal((body?.response_format as { type: string }).type, "json_schema");
  const user = (body?.messages as { role: string; content: string }[]).find((m) => m.role === "user")!;
  const input = JSON.parse(user.content);
  assert.equal(input.age, 9);
  assert.equal(input.checkins.length, 1);
  assert.doesNotMatch(user.content, /nickname|birth_year|patient_id|user_id|journal|comfort_card/);
});

test("provider failures never return a fabricated successful review", async () => {
  mock.method(globalThis, "fetch", async () => new Response("sensitive provider body", { status: 429 }));
  await assert.rejects(analyseWithMistral(context, 9), { message: "Mistral request failed" });
});

test("truncated or semantically unsupported provider results are rejected", async () => {
  mock.method(globalThis, "fetch", async () => response(ruleReview(context), "length"));
  await assert.rejects(analyseWithMistral(context, 9), /Incomplete/);
  mock.restoreAll();
  mock.method(globalThis, "fetch", async () => response({ ...ruleReview(context), evidence: [{ checkin_id: context.checkins[0].id, quote: "invented" }] }));
  await assert.rejects(analyseWithMistral(context, 9), /Unsupported evidence/);
});

test("missing provider configuration fails before sending shared data", async () => {
  delete process.env.MISTRAL_API_KEY;
  const fetch = mock.method(globalThis, "fetch", async () => { throw new Error("Must not call"); });
  await assert.rejects(analyseWithMistral(context, 9), /not configured/);
  assert.equal(fetch.mock.callCount(), 0);
});

test("scheduler rejects missing, incorrect and multibyte credentials", async () => {
  process.env.CRON_SECRET = "aaaa";
  for (const token of [null, "Bearer nope", "Bearer éééé"]) {
    const request = new Request("http://localhost/api/cron/wellbeing", token ? { headers: { authorization: token } } : undefined);
    assert.equal((await GET(request)).status, 401);
  }
  delete process.env.CRON_SECRET;
  assert.equal((await GET(new Request("http://localhost/api/cron/wellbeing"))).status, 401);
});

test("authorized but unconfigured scheduler is visibly unavailable", async () => {
  process.env.CRON_SECRET = "test-scheduler";
  delete process.env.SUPABASE_SECRET_KEY;
  const response = await GET(new Request("http://localhost/api/cron/wellbeing", { headers: { authorization: "Bearer test-scheduler" } }));
  assert.equal(response.status, 503);
});
