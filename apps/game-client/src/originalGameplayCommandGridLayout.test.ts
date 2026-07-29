import test from "node:test";
import assert from "node:assert/strict";
import {
  findResolvedOriginalGameplayCommandGridSlot,
  resolveOriginalGameplayCommandGridLayout,
  resolveOriginalGameplayCommandGridLayoutForScenario,
} from "./originalGameplayCommandGridLayout";

test("resolves all nine source-bound command slots on the 640 by 480 canvas", () => {
  const layout = resolveOriginalGameplayCommandGridLayout(640, 480);

  assert.deepEqual(layout, {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    slots: [
      { x: 525, y: 363, width: 34, height: 34 },
      { x: 561, y: 363, width: 34, height: 34 },
      { x: 597, y: 363, width: 34, height: 34 },
      { x: 525, y: 399, width: 34, height: 34 },
      { x: 561, y: 399, width: 34, height: 34 },
      { x: 597, y: 399, width: 34, height: 34 },
      { x: 525, y: 435, width: 34, height: 34 },
      { x: 561, y: 435, width: 34, height: 34 },
      { x: 597, y: 435, width: 34, height: 34 },
    ],
  });
});

test("uniformly scales and centers the original canvas in a widescreen viewport", () => {
  assert.deepEqual(resolveOriginalGameplayCommandGridLayout(1280, 720), {
    scale: 1.5,
    offsetX: 160,
    offsetY: 0,
    slots: [
      { x: 947.5, y: 544.5, width: 51, height: 51 },
      { x: 1001.5, y: 544.5, width: 51, height: 51 },
      { x: 1055.5, y: 544.5, width: 51, height: 51 },
      { x: 947.5, y: 598.5, width: 51, height: 51 },
      { x: 1001.5, y: 598.5, width: 51, height: 51 },
      { x: 1055.5, y: 598.5, width: 51, height: 51 },
      { x: 947.5, y: 652.5, width: 51, height: 51 },
      { x: 1001.5, y: 652.5, width: 51, height: 51 },
      { x: 1055.5, y: 652.5, width: 51, height: 51 },
    ],
  });
});

test("admits only strict slot interiors and rejects gaps, edges, and out-of-range points", () => {
  const layout = resolveOriginalGameplayCommandGridLayout(640, 480);

  assert.equal(findResolvedOriginalGameplayCommandGridSlot(layout, 526, 364), 0);
  assert.equal(findResolvedOriginalGameplayCommandGridSlot(layout, 562, 364), 1);
  assert.equal(findResolvedOriginalGameplayCommandGridSlot(layout, 598, 436), 8);
  assert.equal(findResolvedOriginalGameplayCommandGridSlot(layout, 525, 364), null);
  assert.equal(findResolvedOriginalGameplayCommandGridSlot(layout, 559, 364), null);
  assert.equal(findResolvedOriginalGameplayCommandGridSlot(layout, 631, 452), null);
  assert.equal(findResolvedOriginalGameplayCommandGridSlot(layout, -1, 364), null);
  assert.equal(findResolvedOriginalGameplayCommandGridSlot(layout, 800, 600), null);
});

test("rejects invalid viewports and pointer coordinates", () => {
  assert.throws(() => resolveOriginalGameplayCommandGridLayout(0, 480), /viewportWidth/);
  assert.throws(() => resolveOriginalGameplayCommandGridLayout(640, Number.NaN), /viewportHeight/);

  const layout = resolveOriginalGameplayCommandGridLayout(640, 480);
  assert.throws(
    () => findResolvedOriginalGameplayCommandGridSlot(layout, Number.NaN, 364),
    /pointerX must be finite/,
  );
});

test("keeps the original layout available for the K01 research scenario", () => {
  assert.equal(
    resolveOriginalGameplayCommandGridLayoutForScenario("imjinrok-k01-opening", 640, 480)?.slots.length,
    9,
  );
  assert.equal(resolveOriginalGameplayCommandGridLayoutForScenario("imjinrok-k02-opening", 640, 480), undefined);
  assert.equal(resolveOriginalGameplayCommandGridLayoutForScenario(undefined, 640, 480), undefined);
});
