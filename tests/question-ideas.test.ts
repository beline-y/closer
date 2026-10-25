import { afterEach, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { generateQuestionIdeas } from "../src/lib/ai-questions";

const originalKey = process.env.MISTRAL_API_KEY;
const questions = ["What would your dream treehouse look like?", "Which animal would you invite to a picnic?", "What sound always makes you laugh?"];
beforeEach(() => { process.env.MISTRAL_API_KEY = "fictional-question-key"; });
afterEach(() => {
  mock.restoreAll();
  if (originalKey === undefined) delete process.env.MISTRAL_API_KEY; else process.env.MISTRAL_API_KEY = originalKey;
});
const response = (value: unknown, reason = "stop") => Response.json({ choices: [{ finish_reason: reason, message: { content: JSON.stringify(value) } }] });

test("fresh Mistral question requests contain no patient responses or card drafts", async () => {
  const previous = ["What would you name a friendly dragon?"];
  mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "https://api.mistral.ai/v1/chat/completions");
    assert.equal(new Headers(init.headers).get("authorization"), "Bearer fictional-question-key");
    assert.equal(init.cache, "no-store");
    assert.ok(init.signal);
    const body = JSON.parse(String(init.body));
    assert.equal(body.response_format.type, "json_schema");
    assert.deepEqual(JSON.parse(body.messages[1].content), { previous_questions: previous });
    assert.match(body.messages[0].content, /Never send anything/);
    return response({ questions });
  });
  assert.deepEqual(await generateQuestionIdeas(previous), questions);
});

test("duplicate, repeated, malformed and truncated ideas cannot appear as a new AI batch", async () => {
  for (const [value, reason, previous] of [
    [{ questions: [questions[0], questions[0], questions[2]] }, "stop", []],
    [{ questions }, "stop", [questions[0].toUpperCase()]],
    [{ questions: ["Not a question", ...questions.slice(1)] }, "stop", []],
    [{ questions }, "length", []],
  ] as const) {
    mock.method(globalThis, "fetch", async () => response(value, reason));
    await assert.rejects(generateQuestionIdeas([...previous]));
    mock.restoreAll();
  }
});

test("missing keys and provider failures return errors instead of fake AI ideas", async () => {
  delete process.env.MISTRAL_API_KEY;
  const fetch = mock.method(globalThis, "fetch", async () => new Response("private provider body", { status: 429 }));
  await assert.rejects(generateQuestionIdeas(), /not configured/);
  assert.equal(fetch.mock.callCount(), 0);
  process.env.MISTRAL_API_KEY = "fictional-question-key";
  await assert.rejects(generateQuestionIdeas(), { message: "Mistral request failed" });
});
