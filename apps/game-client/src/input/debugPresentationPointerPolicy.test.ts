import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyDebugPresentationTarget,
  decideDebugPresentationPointerAction,
  type DebugPresentationPointerFacts,
} from "./debugPresentationPointerPolicy.js";

const baseFacts: DebugPresentationPointerFacts = {
  locked: true,
  phase: "down",
  button: "primary",
  target: "button",
  pressConsumed: false,
  releaseMatchesPress: false,
};

test("target classification keeps only panel controls activatable", () => {
  assert.equal(classifyDebugPresentationTarget(null, false), "outside");
  assert.equal(classifyDebugPresentationTarget("div", true), "panel");
  assert.equal(classifyDebugPresentationTarget("button", true), "button");
  assert.equal(classifyDebugPresentationTarget("input", true), "input");
  assert.equal(classifyDebugPresentationTarget("label", true), "label");
});

test("locked panel down/up gestures are consumed instead of reaching the world", () => {
  assert.equal(decideDebugPresentationPointerAction(baseFacts), "consume");
  assert.equal(decideDebugPresentationPointerAction({ ...baseFacts, button: "secondary" }), "consume");
  assert.equal(decideDebugPresentationPointerAction({
    ...baseFacts,
    phase: "up",
    pressConsumed: true,
    releaseMatchesPress: true,
  }), "activate");
  assert.equal(decideDebugPresentationPointerAction({
    ...baseFacts,
    phase: "up",
    button: "secondary",
    pressConsumed: true,
    releaseMatchesPress: true,
  }), "consume");
});

test("only a matching primary release activates a control", () => {
  assert.equal(decideDebugPresentationPointerAction({
    ...baseFacts,
    phase: "up",
    target: "input",
    pressConsumed: true,
    releaseMatchesPress: true,
  }), "activate");
  assert.equal(decideDebugPresentationPointerAction({
    ...baseFacts,
    phase: "up",
    target: "label",
    pressConsumed: true,
    releaseMatchesPress: false,
  }), "consume");
  assert.equal(decideDebugPresentationPointerAction({
    ...baseFacts,
    phase: "up",
    target: "outside",
    pressConsumed: true,
  }), "consume");
});

test("unlocked native DOM input and world input remain pass-through", () => {
  assert.equal(decideDebugPresentationPointerAction({ ...baseFacts, locked: false }), "pass-through");
  assert.equal(decideDebugPresentationPointerAction({
    ...baseFacts,
    locked: true,
    target: "outside",
  }), "pass-through");
  assert.equal(decideDebugPresentationPointerAction({
    ...baseFacts,
    phase: "move",
    target: "outside",
  }), "pass-through");
});
