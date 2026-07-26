import test from "node:test";
import assert from "node:assert/strict";
import { getOriginalSpeechSlot, resolveOriginalSpeechLayout } from "./originalSpeechLayout";

test("preserves the original SPEECH coordinates at 640x480", () => {
  assert.deepEqual(resolveOriginalSpeechLayout(640, 480, 0), {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    portrait: { x: 26, y: 49, width: 130, height: 120 },
    text: { x: 188, centerY: 190, maxWidth: 278 },
  });
  assert.deepEqual(resolveOriginalSpeechLayout(640, 480, 3).portrait, {
    x: 490,
    y: 210,
    width: 130,
    height: 120,
  });
});

test("scales uniformly and centers the original canvas without distorting it", () => {
  assert.deepEqual(resolveOriginalSpeechLayout(1280, 960, 2), {
    scale: 2,
    offsetX: 0,
    offsetY: 0,
    portrait: { x: 52, y: 420, width: 260, height: 240 },
    text: { x: 376, centerY: 380, maxWidth: 556 },
  });
  assert.deepEqual(resolveOriginalSpeechLayout(1280, 720, 1), {
    scale: 1.5,
    offsetX: 160,
    offsetY: 0,
    portrait: { x: 895, y: 73.5, width: 195, height: 180 },
    text: { x: 442, centerY: 285, maxWidth: 417 },
  });
});

test("keeps the source numeric slot and rejects invalid layout inputs", () => {
  assert.equal(getOriginalSpeechSlot({ speechSlot: 2 }), 2);
  assert.throws(() => resolveOriginalSpeechLayout(0, 480, 0), /viewportWidth/);
  assert.throws(() => resolveOriginalSpeechLayout(640, Number.NaN, 0), /viewportHeight/);
  assert.throws(
    () => resolveOriginalSpeechLayout(640, 480, 4 as never),
    /Unsupported original SPEECH slot 4/,
  );
});
