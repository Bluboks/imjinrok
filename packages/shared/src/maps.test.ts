import assert from "node:assert/strict";
import test from "node:test";
import { defaultMap } from "./maps.js";

test("default river-crossing map opts into a deterministic ten-minute light cycle", () => {
  assert.deepEqual(defaultMap.environment?.dayNight, {
    cycleTicks: 6_000,
    dayStartTick: 600,
    nightStartTick: 4_800,
    nightSightMultiplier: 0.6,
    lightCurve: [
      { tick: 0, phase: "dawn", lightLevel01: 0.65 },
      { tick: 600, phase: "day", lightLevel01: 1 },
      { tick: 4_200, phase: "dusk", lightLevel01: 0.65 },
      { tick: 4_800, phase: "night", lightLevel01: 0.3 },
    ],
  });
});
