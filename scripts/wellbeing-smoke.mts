// Explicit live-provider smoke test. Uses only fictional, generated responses.
// Run with `npm run test:wellbeing:live`; never prints credentials or provider prose.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { analyseWithMistral } from "../src/lib/wellbeing/mistral";
import { connectionMessages, localDate, sharedCheckin, shiftDate, type ReviewContext } from "../src/lib/wellbeing/core";

createRequire(import.meta.url)("@next/env").loadEnvConfig(process.cwd());
const date = shiftDate(localDate(new Date(), "UTC"), -1);
const base: ReviewContext = { forDate: date, monitoringSince: shiftDate(date, -7),
  lowMoodThreshold: 2, lowMoodStreak: 3, noCheckinDays: 2, checkins: [] };
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const cases = [
  { name: "shared movie → separate parent/child prompts", expected: "routine", context: { ...base, checkins: [sharedCheckin({
    id, local_date: date, mood: 4, activities: ["movie"], activity_note: "A funny film about dinosaurs", note: "I enjoyed the film and feel happy today.",
  })] } },
  { name: "sustained low mood → human check-in", expected: "check_in", context: { ...base, checkins: [0, 1, 2].map((n) => ({
    id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${n}`, local_date: shiftDate(date, -n), mood: 2, activity: null, note: "I feel lonely and I miss spending time with my family.",
  })) } },
  { name: "explicit unsafe feelings → priority care review", expected: "priority", context: { ...base, checkins: [{
    id, local_date: date, mood: 1, activity: null, note: "I want to hurt myself and need a grown-up to help me right now.",
  }] } },
];
let failed = 0;
for (const scenario of cases) {
  try {
    const { review, model } = await analyseWithMistral(scenario.context, 9);
    assert.equal(review.level, scenario.expected);
    if (scenario.expected === "routine") {
      assert.equal(review.connection.kind, "movie");
      const messages = connectionMessages("Leo", review, date, shiftDate(date, 1));
      assert.match(messages.parent, /Ask Leo how the film was yesterday/);
      assert.match(messages.child, /your favorite part/);
    } else assert.ok(review.evidence.length);
    console.log(`PASS: ${scenario.name} (${model})`);
  } catch {
    failed++;
    console.error(`FAIL: ${scenario.name}. Check provider access and review validation; no sensitive response logged.`);
  }
}
process.exitCode = failed ? 1 : 0;
