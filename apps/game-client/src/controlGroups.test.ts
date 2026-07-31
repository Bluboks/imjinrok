import assert from "node:assert/strict";
import test from "node:test";

import {
  decideControlGroupAssignmentOutcome,
  decideControlGroupKeyIntent,
  decideControlGroupRecallOutcome,
  shouldCenterControlGroupOnRecall,
  type ControlGroupKeyFacts,
} from "./controlGroups.js";

const baseFacts: ControlGroupKeyFacts = {
  code: "Digit1",
  key: "1",
  repeat: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  isCheatInputOpen: false,
  isBlockingModalOpen: false,
};

test("control-group shortcut resolves Ctrl before Shift and supports Meta", () => {
  assert.deepEqual(decideControlGroupKeyIntent({ ...baseFacts, ctrlKey: true, shiftKey: true }), { kind: "assign", group: 1 });
  assert.deepEqual(decideControlGroupKeyIntent({ ...baseFacts, metaKey: true }), { kind: "assign", group: 1 });
  assert.deepEqual(decideControlGroupKeyIntent({ ...baseFacts, shiftKey: true }), { kind: "add", group: 1 });
  assert.deepEqual(decideControlGroupKeyIntent(baseFacts), { kind: "recall", group: 1 });
});

test("control-group shortcut supports top-row, numpad, and key fallback including zero", () => {
  assert.deepEqual(decideControlGroupKeyIntent({ ...baseFacts, code: "Digit0", key: "0" }), { kind: "recall", group: 0 });
  assert.deepEqual(decideControlGroupKeyIntent({ ...baseFacts, code: "Numpad7", key: "7" }), { kind: "recall", group: 7 });
  assert.deepEqual(decideControlGroupKeyIntent({ ...baseFacts, code: "Unidentified", key: "9" }), { kind: "recall", group: 9 });
});

test("control-group shortcut ignores invalid modifiers, repeats, modals, and cheat input", () => {
  assert.equal(decideControlGroupKeyIntent({ ...baseFacts, altKey: true }), null);
  assert.equal(decideControlGroupKeyIntent({ ...baseFacts, repeat: true }), null);
  assert.equal(decideControlGroupKeyIntent({ ...baseFacts, isCheatInputOpen: true }), null);
  assert.equal(decideControlGroupKeyIntent({ ...baseFacts, isBlockingModalOpen: true }), null);
  assert.equal(decideControlGroupKeyIntent({ ...baseFacts, code: "KeyQ", key: "q" }), null);
});

test("empty Ctrl assignment clears its group", () => {
  assert.equal(decideControlGroupAssignmentOutcome(3), "assign");
  assert.equal(decideControlGroupAssignmentOutcome(0), "clear");
  assert.equal(decideControlGroupAssignmentOutcome(-1), "clear");
});

test("empty recall reports an empty group without issuing a selection", () => {
  assert.equal(decideControlGroupRecallOutcome(2), "recall");
  assert.equal(decideControlGroupRecallOutcome(0), "empty");
  assert.equal(decideControlGroupRecallOutcome(-1), "empty");
});

test("double-tap centering includes the window boundary and rejects stale or backward timestamps", () => {
  const lastRecall = { group: 2, time: 1_000 };

  assert.equal(shouldCenterControlGroupOnRecall(lastRecall, 2, 1_449, 450), true);
  assert.equal(shouldCenterControlGroupOnRecall(lastRecall, 2, 1_450, 450), true);
  assert.equal(shouldCenterControlGroupOnRecall(lastRecall, 2, 1_451, 450), false);
  assert.equal(shouldCenterControlGroupOnRecall(lastRecall, 3, 1_200, 450), false);
  assert.equal(shouldCenterControlGroupOnRecall(lastRecall, 2, 999, 450), false);
});
