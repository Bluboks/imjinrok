import assert from "node:assert/strict";
import test from "node:test";

import { decideMouseInputAction, type MouseInputFacts } from "./mouseInputPolicy.js";

const baseFacts: MouseInputFacts = {
  button: "primary",
  dragging: false,
  hasPendingTargetAction: false,
  hasControllableSelection: true,
  hit: "world",
};

test("two-button policy keeps primary selection and secondary default actions", () => {
  assert.deepEqual(decideMouseInputAction("two-button", baseFacts), { kind: "select" });
  assert.deepEqual(decideMouseInputAction("two-button", { ...baseFacts, button: "secondary", hit: "enemy" }), { kind: "issue-default-action" });
  assert.deepEqual(decideMouseInputAction("two-button", { ...baseFacts, dragging: true }), { kind: "select" });
  assert.deepEqual(decideMouseInputAction("two-button", { ...baseFacts, hasPendingTargetAction: true }), { kind: "confirm-pending-action" });
  assert.deepEqual(decideMouseInputAction("two-button", { ...baseFacts, button: "secondary", hasPendingTargetAction: true }), { kind: "cancel-pending-action" });
});

test("one-button policy chooses contextual actions without duplicating secondary commands", () => {
  assert.deepEqual(decideMouseInputAction("one-button", { ...baseFacts, hit: "enemy" }), { kind: "issue-default-action" });
  assert.deepEqual(decideMouseInputAction("one-button", { ...baseFacts, hit: "resource" }), { kind: "issue-default-action" });
  assert.deepEqual(decideMouseInputAction("one-button", { ...baseFacts, hit: "friendly-selectable" }), { kind: "select" });
  assert.deepEqual(decideMouseInputAction("one-button", { ...baseFacts, hasControllableSelection: false, hit: "world" }), { kind: "select" });
  assert.deepEqual(decideMouseInputAction("one-button", { ...baseFacts, button: "secondary" }), { kind: "ignore" });
  assert.deepEqual(decideMouseInputAction("one-button", { ...baseFacts, button: "secondary", hasPendingTargetAction: true }), { kind: "cancel-pending-action" });
});
