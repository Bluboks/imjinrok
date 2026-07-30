import assert from "node:assert/strict";
import test from "node:test";

import { decideMouseInputAction } from "./input/mouseInputPolicy.js";
import { createGameplayRuntimeSpeed, stepGameplayRuntimeSpeed } from "./gameplayInputRuntime.js";
import { readGameplayPreferences, writeGameplayPreferences } from "./gameplayPreferences.js";

test("runtime speed initialization and stepping use only the five source-derived preset multipliers", () => {
  const normal = { version: 1 as const, gameSpeed: "normal" as const, mouseControlMode: "two-button" as const };

  assert.deepEqual(createGameplayRuntimeSpeed(normal), { preferences: normal, playbackSpeed: 1 });
  assert.deepEqual(stepGameplayRuntimeSpeed(normal, -1), {
    preferences: { ...normal, gameSpeed: "slow" },
    playbackSpeed: 50 / 60,
  });
  assert.deepEqual(stepGameplayRuntimeSpeed(normal, 1), {
    preferences: { ...normal, gameSpeed: "fast" },
    playbackSpeed: 50 / 40,
  });
  assert.equal(stepGameplayRuntimeSpeed({ ...normal, gameSpeed: "slowest" }, -1).playbackSpeed, 50 / 64);
  assert.equal(stepGameplayRuntimeSpeed({ ...normal, gameSpeed: "fastest" }, 1).playbackSpeed, 50 / 30);
});

test("stepped runtime preferences persist the exact selected preset", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
  const next = stepGameplayRuntimeSpeed(
    { version: 1, gameSpeed: "normal", mouseControlMode: "two-button" },
    1,
  );

  assert.equal(writeGameplayPreferences(next.preferences, storage), true);
  assert.deepEqual(readGameplayPreferences(storage), next.preferences);
});

test("one-button routing emits one default action at most and keeps secondary cancellation", () => {
  const base = {
    dragging: false,
    hasPendingTargetAction: false,
    hasControllableSelection: true,
    hit: "world" as const,
  };

  assert.deepEqual(decideMouseInputAction("one-button", { ...base, button: "primary" }), { kind: "issue-default-action" });
  assert.deepEqual(decideMouseInputAction("one-button", { ...base, button: "primary", dragging: true }), { kind: "select" });
  assert.deepEqual(decideMouseInputAction("one-button", { ...base, button: "secondary" }), { kind: "ignore" });
  assert.deepEqual(
    decideMouseInputAction("one-button", { ...base, button: "secondary", hasPendingTargetAction: true }),
    { kind: "cancel-pending-action" },
  );
});
