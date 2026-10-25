import { test } from "node:test";
import assert from "node:assert/strict";
import { CAST, PATIENT_IDS } from "../src/lib/cast";
import { demoInvitationRole } from "../src/lib/wellbeing/demo-access";
import { connectionMessages, ruleReview, type ReviewContext } from "../src/lib/wellbeing/core";

test("demo notification previews are restricted to the fictional patient and guardians", () => {
  assert.equal(demoInvitationRole(CAST.leo.userId!, PATIENT_IDS.leo, "patient"), "patient");
  for (const guardian of [CAST.emma, CAST.james]) assert.equal(demoInvitationRole(guardian.userId!, PATIENT_IDS.leo, "family"), "family");
  for (const denied of [CAST.noah, CAST.sarah, CAST.maya, CAST.daniel]) {
    assert.equal(demoInvitationRole(denied.userId!, PATIENT_IDS.leo, denied.role), null);
  }
  assert.equal(demoInvitationRole(CAST.emma.userId!, PATIENT_IDS.ava, "family"), null);
  assert.equal(demoInvitationRole("81000000-0000-4000-8000-000000000001", PATIENT_IDS.leo, "patient"), null);
  assert.equal(demoInvitationRole(CAST.emma.userId!, PATIENT_IDS.leo, "patient"), null);
});

test("today's preview is current and uses different patient and parent language", () => {
  const context: ReviewContext = { forDate: "2026-10-24", monitoringSince: "2026-10-24", lowMoodThreshold: 2, lowMoodStreak: 3, noCheckinDays: 2,
    checkins: [{ id: PATIENT_IDS.leo, local_date: "2026-10-24", mood: 4, activity: "Watched a movie", note: null }] };
  const messages = connectionMessages("Leo", { ...ruleReview(context), connection: { kind: "movie", checkin_id: PATIENT_IDS.leo } }, context.forDate, context.forDate);
  assert.match(messages.parent, /Ask Leo.*film.*today/);
  assert.match(messages.child, /your favorite part.*film today/);
  assert.doesNotMatch(messages.child, /Ask Leo|yesterday/);
  assert.notEqual(messages.parent, messages.child);
});
