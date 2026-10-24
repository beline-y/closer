import { test } from "node:test";
import assert from "node:assert/strict";
import { connectionMessages, localDate, ruleReview, sharedCheckin, shiftDate, validateReview, type ReviewContext } from "../src/lib/wellbeing/core";

const checkinId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const context: ReviewContext = {
  forDate: "2026-10-23", monitoringSince: "2026-10-20", lowMoodThreshold: 2, lowMoodStreak: 3, noCheckinDays: 2,
  checkins: [{ id: checkinId, local_date: "2026-10-23", mood: 4, activity: "I watched a film", note: "The dinosaur was my favorite!" }],
};
const movieReview = () => ({ ...ruleReview(context), connection: { kind: "movie" as const, checkin_id: checkinId } });

test("canonical check-in activity chips ground prompts without sending photo data", () => {
  const normalized = sharedCheckin({ id: checkinId, local_date: context.forDate, mood: 4,
    activities: ["movie"], activity_note: "Dinosaurs", note: "It was fun!" });
  assert.match(normalized.activity!, /Watched a movie/);
  assert.equal(validateReview(movieReview(), { ...context, checkins: [normalized] }).connection.kind, "movie");
  assert.deepEqual(Object.keys(normalized).sort(), ["activity", "id", "local_date", "mood", "note"]);
});

test("local dates handle both sides of UTC and DST", () => {
  assert.equal(localDate(new Date("2026-10-24T01:00:00Z"), "America/Los_Angeles"), "2026-10-23");
  assert.equal(localDate(new Date("2026-10-24T23:30:00Z"), "Pacific/Auckland"), "2026-10-25");
  assert.equal(shiftDate("2026-03-08", -1), "2026-03-07");
  assert.equal(shiftDate("2026-01-01", -1), "2025-12-31");
});

test("movie context produces separate parent and child prompts", () => {
  const review = validateReview(movieReview(), context);
  const messages = connectionMessages("Louis", review, "2026-10-23", "2026-10-24");
  assert.match(messages.parent, /Ask Louis how the film was yesterday/);
  assert.match(messages.child, /your favorite part/);
  assert.doesNotMatch(messages.child, /mental|risk|diagnos|score/i);
  assert.doesNotMatch(connectionMessages("Louis", review, "2026-10-22", "2026-10-24").parent, /yesterday/);
});

test("interests, hallucinated events, and stale activities cannot ground prompts", () => {
  assert.throws(() => validateReview({ ...movieReview(), connection: { kind: "game", checkin_id: checkinId } }, context));
  assert.throws(() => validateReview(movieReview(), { ...context, checkins: [{ ...context.checkins[0], local_date: "2026-10-22" }] }));
  assert.throws(() => validateReview({ ...movieReview(), connection: { kind: "movie", checkin_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } }, context));
});

test("obvious denials, plans and earlier events do not become yesterday's activity", () => {
  for (const activity of ["I did not watch a movie", "I want to watch a film", "I watched a film yesterday", "Film demain"]) {
    assert.throws(() => validateReview(movieReview(), { ...context, checkins: [{ ...context.checkins[0], activity }] }));
  }
});

test("threshold fallback preserves safeguarding routing", () => {
  const low = { ...context, checkins: [{ ...context.checkins[0], mood: 1 }] };
  assert.equal(validateReview({ ...movieReview(), safeguarding_concern: true }, low).safeguarding_concern, true);
});

test("invented quotes, IDs and unsupported priority are rejected", () => {
  assert.throws(() => validateReview({ ...movieReview(), evidence: [{ checkin_id: checkinId, quote: "not in the shared response" }] }, context));
  assert.throws(() => validateReview({ ...movieReview(), level: "priority" }, context));
  assert.throws(() => validateReview({ ...movieReview(), level: "depression", confidence: 0.99 }, context));
});

test("a model cannot downgrade low-mood thresholds", () => {
  const low = { ...context, checkins: [{ ...context.checkins[0], mood: 1 }] };
  assert.equal(validateReview(movieReview(), low).level, "check_in");
  assert.doesNotMatch(connectionMessages("Louis", validateReview(movieReview(), low), context.forDate, "2026-10-24").parent, /film/);
});

test("missing answers are described as missing data and new opt-ins get no premature alert", () => {
  const missing = ruleReview({ ...context, checkins: [] });
  assert.equal(missing.level, "check_in");
  assert.match(missing.summary, /missing-data reminder/);
  assert.equal(ruleReview({ ...context, monitoringSince: context.forDate, checkins: [] }).level, "insufficient_data");
});

test("only consecutive calendar days form a low-mood streak", () => {
  const review = ruleReview({ ...context, checkins: [0, 1, 2].map((n) => ({ ...context.checkins[0], local_date: shiftDate(context.forDate, -n), mood: 2 })) });
  assert.match(review.summary, /consecutive/);
  const sparse = ruleReview({ ...context, checkins: [0, 2, 4].map((n) => ({ ...context.checkins[0], local_date: shiftDate(context.forDate, -n), mood: 2 })) });
  assert.doesNotMatch(sparse.summary, /consecutive/);
});
