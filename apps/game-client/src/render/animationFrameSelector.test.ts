import assert from "node:assert/strict";
import test from "node:test";

import { selectSourceGlobalFrameIndex } from "./animationFrameSelector.js";

const clip = {
  frames: [{ textureKey: "a" }, { textureKey: "b" }, { textureKey: "c" }],
  fps: 1,
  sourceGlobalTickDivisor: 4,
} as const;

test("source-global frame selection holds at boundaries and wraps", () => {
  assert.equal(selectSourceGlobalFrameIndex(clip, 0), 0);
  assert.equal(selectSourceGlobalFrameIndex(clip, 3), 0);
  assert.equal(selectSourceGlobalFrameIndex(clip, 4), 1);
  assert.equal(selectSourceGlobalFrameIndex(clip, 8), 2);
  assert.equal(selectSourceGlobalFrameIndex(clip, 12), 0);
});
test("source-global clips synchronize independently of render instance state", () => {
  assert.equal(selectSourceGlobalFrameIndex(clip, 17), selectSourceGlobalFrameIndex(clip, 17));
  assert.notEqual(selectSourceGlobalFrameIndex(clip, 17), selectSourceGlobalFrameIndex(clip, 21));
});

test("invalid source-global clock contracts fail loudly", () => {
  assert.throws(() => selectSourceGlobalFrameIndex({ ...clip, sourceGlobalTickDivisor: 0 }, 0), RangeError);
  assert.throws(() => selectSourceGlobalFrameIndex(clip, -1), RangeError);
});
