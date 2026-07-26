import assert from "node:assert/strict";
import test from "node:test";
import { actionDefinitions, unitDefinitions } from "./content.js";

test("uses the statically recovered original name for the swordk-bound unit", () => {
  assert.equal(unitDefinitions.swordsman.displayName, "조선 창병");
  assert.equal(actionDefinitions["train-swordsman"].label, "조선 창병 훈련");
});
