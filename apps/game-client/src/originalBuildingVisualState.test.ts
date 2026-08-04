import assert from "node:assert/strict";
import test from "node:test";
import type { AnimationClip } from "@shared";
import {
  isBelowOriginalBuildingDamageThreshold,
  selectConstructionFrameIndex,
} from "./originalBuildingVisualState";

const frame = (index: number) => ({ textureKey: `frame-${index}` });

test("selects the statically recovered Imjinrok 2 construction bands", () => {
  const clip: AnimationClip = {
    frames: Array.from({ length: 8 }, (_value, index) => frame(index)),
    fps: 1,
    progressFrameThresholds: [0, 10, 20, 30, 40, 50, 70, 100],
  };
  const vectors = [
    [0, 0],
    [0.09, 0],
    [0.1, 1],
    [0.19, 1],
    [0.2, 2],
    [0.29, 2],
    [0.3, 3],
    [0.39, 3],
    [0.4, 4],
    [0.49, 4],
    [0.5, 5],
    [0.69, 5],
    [0.7, 6],
    [0.99, 6],
    [1, 7],
  ] as const;

  for (const [progress, expectedFrame] of vectors) {
    assert.equal(selectConstructionFrameIndex(progress, clip), expectedFrame, String(progress));
  }
});

test("keeps uniform construction selection for visuals without recovered thresholds", () => {
  const clip: AnimationClip = {
    frames: Array.from({ length: 4 }, (_value, index) => frame(index)),
    fps: 1,
  };

  assert.equal(selectConstructionFrameIndex(-1, clip), 0);
  assert.equal(selectConstructionFrameIndex(0.24, clip), 0);
  assert.equal(selectConstructionFrameIndex(0.25, clip), 1);
  assert.equal(selectConstructionFrameIndex(1, clip), 3);
});

test("rejects malformed construction progress metadata instead of hiding it", () => {
  assert.throws(
    () =>
      selectConstructionFrameIndex(0.5, {
        frames: [frame(0), frame(1)],
        fps: 1,
        progressFrameThresholds: [0],
      }),
    /2 frames but 1 progress thresholds/,
  );
  assert.throws(
    () =>
      selectConstructionFrameIndex(0.5, {
        frames: [frame(0), frame(1), frame(2)],
        fps: 1,
        progressFrameThresholds: [0, 20, 20],
      }),
    /not a strictly increasing integer percentage/,
  );
  assert.throws(
    () =>
      selectConstructionFrameIndex(0.5, {
        frames: [frame(0), frame(1)],
        fps: 1,
        progressFrameThresholds: [5, 20],
      }),
    /index 0 must be 0/,
  );
});

test("uses a strict below-50-percent boundary for completed building damage", () => {
  assert.equal(isBelowOriginalBuildingDamageThreshold({ current: 1_500, max: 1_500 }), false);
  assert.equal(isBelowOriginalBuildingDamageThreshold({ current: 750, max: 1_500 }), false);
  assert.equal(isBelowOriginalBuildingDamageThreshold({ current: 749, max: 1_500 }), true);
  assert.equal(isBelowOriginalBuildingDamageThreshold({ current: 50, max: 101 }), false);
  assert.equal(isBelowOriginalBuildingDamageThreshold({ current: 49, max: 101 }), true);
  assert.equal(isBelowOriginalBuildingDamageThreshold({ current: 0, max: 0 }), false);
});
