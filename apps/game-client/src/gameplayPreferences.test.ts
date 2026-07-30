import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_GAMEPLAY_PREFERENCES,
  GAMEPLAY_PREFERENCES_STORAGE_KEY,
  gameSpeedPresetToIntervalMs,
  gameSpeedPresetToPlaybackMultiplier,
  gameSpeedPresetToSourceState,
  parseGameplayPreferences,
  readGameplayPreferences,
  sourceStateToGameSpeedPreset,
  sourceStateToIntervalMs,
  stepGameSpeedPreset,
  writeGameplayPreferences,
} from "./gameplayPreferences.js";

test("game speed presets reproduce the five source states and fixed-tick multipliers", () => {
  const presets = ["slowest", "slow", "normal", "fast", "fastest"] as const;

  assert.deepEqual(
    presets.map((preset) => ({
      preset,
      state: gameSpeedPresetToSourceState(preset),
      interval: gameSpeedPresetToIntervalMs(preset),
      multiplier: gameSpeedPresetToPlaybackMultiplier(preset),
    })),
    [
      { preset: "slowest", state: 0, interval: 64, multiplier: 50 / 64 },
      { preset: "slow", state: 1, interval: 60, multiplier: 50 / 60 },
      { preset: "normal", state: 2, interval: 50, multiplier: 1 },
      { preset: "fast", state: 3, interval: 40, multiplier: 50 / 40 },
      { preset: "fastest", state: 4, interval: 30, multiplier: 50 / 30 },
    ],
  );
  assert.equal(sourceStateToIntervalMs(9), 30);
  assert.equal(sourceStateToGameSpeedPreset(9), "fastest");
  assert.equal(sourceStateToGameSpeedPreset(-1), "fastest");
});

test("game speed steps stop at each adjacent endpoint", () => {
  assert.equal(stepGameSpeedPreset("normal", -1), "slow");
  assert.equal(stepGameSpeedPreset("normal", 1), "fast");
  assert.equal(stepGameSpeedPreset("slowest", -1), "slowest");
  assert.equal(stepGameSpeedPreset("fastest", 1), "fastest");
});

test("preferences reject stale, unknown, and corrupt persisted data", () => {
  assert.deepEqual(parseGameplayPreferences(null), DEFAULT_GAMEPLAY_PREFERENCES);
  assert.deepEqual(parseGameplayPreferences("{not json"), DEFAULT_GAMEPLAY_PREFERENCES);
  assert.deepEqual(
    parseGameplayPreferences(JSON.stringify({ version: 2, gameSpeed: "normal", mouseControlMode: "two-button" })),
    DEFAULT_GAMEPLAY_PREFERENCES,
  );
  assert.deepEqual(
    parseGameplayPreferences(JSON.stringify({ version: 1, gameSpeed: "turbo", mouseControlMode: "two-button" })),
    DEFAULT_GAMEPLAY_PREFERENCES,
  );
});

test("preferences safely handle unavailable or throwing browser storage", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
  const preferences = { version: 1 as const, gameSpeed: "fast" as const, mouseControlMode: "one-button" as const };

  assert.equal(writeGameplayPreferences(preferences, storage), true);
  assert.deepEqual(readGameplayPreferences(storage), preferences);
  assert.equal(values.has(GAMEPLAY_PREFERENCES_STORAGE_KEY), true);
  assert.deepEqual(readGameplayPreferences({ getItem: () => { throw new Error("blocked"); }, setItem: () => undefined }), DEFAULT_GAMEPLAY_PREFERENCES);
  assert.equal(writeGameplayPreferences(preferences, { getItem: () => null, setItem: () => { throw new Error("quota"); } }), false);
});
