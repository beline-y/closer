import assert from "node:assert/strict";
import { test } from "node:test";
import { maskNames } from "../src/lib/mask";

test("names are masked as whole words, any case, before anything goes to an AI", () => {
  const names = ["Leo", "Emma", "Nurse Sarah"];
  assert.equal(maskNames("leo loves dinosaurs with Emma", names), "[name] loves dinosaurs with [name]");
  assert.equal(maskNames("Ask nurse sarah about Léon's lego", names), "Ask [name] about Léon's lego");
  assert.equal(maskNames("the ocean", names), "the ocean");
});
