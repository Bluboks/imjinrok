import test from "node:test";
import assert from "node:assert/strict";
import {
  acquirePhaserObjectiveModalInputOwnership,
  toObjectiveModalPointer,
} from "./objectiveModalPhaserView.js";

test("exclusively owns Phaser scene input and restores each prior state once", () => {
  const owner = {
    input: {
      enabled: true,
      keyboard: { enabled: true },
    },
  };
  const gameplay = {
    input: {
      enabled: true,
      keyboard: { enabled: true },
    },
  };
  const alreadyDisabledOverlay = {
    input: {
      enabled: false,
      keyboard: { enabled: false },
    },
  };

  const ownership = acquirePhaserObjectiveModalInputOwnership(owner, [
    gameplay,
    owner,
    alreadyDisabledOverlay,
  ]);

  assert.deepEqual(owner.input, {
    enabled: true,
    keyboard: { enabled: true },
  });
  assert.deepEqual(gameplay.input, {
    enabled: false,
    keyboard: { enabled: false },
  });
  assert.deepEqual(alreadyDisabledOverlay.input, {
    enabled: false,
    keyboard: { enabled: false },
  });
  assert.deepEqual(
    [gameplay, owner].filter((scene) => scene.input.enabled),
    [owner],
    "only UIScene receives pointer input while the modal owns input",
  );
  assert.deepEqual(
    [gameplay, owner].filter((scene) => scene.input.keyboard.enabled),
    [owner],
    "registered-first gameplay keyboard cannot consume Escape before UIScene",
  );

  ownership.release();
  ownership.release();

  assert.deepEqual(gameplay.input, {
    enabled: true,
    keyboard: { enabled: true },
  });
  assert.deepEqual(alreadyDisabledOverlay.input, {
    enabled: false,
    keyboard: { enabled: false },
  });
});

test("rejects input ownership when the UIScene owner is not active", () => {
  const owner = {
    input: {
      enabled: true,
      keyboard: { enabled: true },
    },
  };

  assert.throws(
    () => acquirePhaserObjectiveModalInputOwnership(owner, []),
    /requires its UIScene owner to be active/,
  );
});

test("classifies the current Phaser pointer event without borrowing held-button state", () => {
  assert.deepEqual(
    toObjectiveModalPointer({
      x: 455,
      y: 279,
      button: 0,
      buttons: 0,
      wasTouch: false,
    }),
    { x: 455, y: 279, primaryButton: true },
  );
  assert.deepEqual(
    toObjectiveModalPointer({
      x: 455,
      y: 279,
      button: 2,
      buttons: 1,
      wasTouch: false,
    }),
    { x: 455, y: 279, primaryButton: false },
  );
  assert.deepEqual(
    toObjectiveModalPointer({
      x: 455,
      y: 279,
      button: -1,
      buttons: 0,
      wasTouch: true,
    }),
    { x: 455, y: 279, primaryButton: true },
  );
});
