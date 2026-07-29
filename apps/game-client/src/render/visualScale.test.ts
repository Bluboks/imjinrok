import assert from "node:assert/strict";
import test from "node:test";
import type { FrameRef, VisualBase } from "@shared";
import { getGroundContactPlacement } from "./visualScale.js";

const visual: VisualBase = {
  id: "test-entity",
  kind: "entity",
  assetPath: "test",
  render: { srcPxPerWu: 32 },
  defaults: {
    size: { w: 60, h: 60 },
    pivot: { anchor: { x: 30, y: 52 } },
  },
};

test("frame size and source pivot changes preserve the simulation ground-contact placement", () => {
  const groundContact = { x: 432, y: 176 };
  const firstFrame: FrameRef = {
    textureKey: "first",
    size: { w: 60, h: 60 },
    pivot: { anchor: { x: 30, y: 52 } },
  };
  const secondFrame: FrameRef = {
    textureKey: "second",
    size: { w: 120, h: 96 },
    pivot: { anchor: { x: 17, y: 88 } },
  };

  const first = getGroundContactPlacement(visual, firstFrame, groundContact);
  const second = getGroundContactPlacement(visual, secondFrame, groundContact);

  assert.deepEqual(first.position, groundContact);
  assert.deepEqual(second.position, groundContact);
  assert.equal(first.scale, 1);
  assert.equal(second.scale, 1);
  assert.notDeepEqual(first.origin, second.origin);
});

test("visual lift is explicit and does not change the horizontal ground contact", () => {
  const placement = getGroundContactPlacement(
    visual,
    { textureKey: "elevated", pivot: { anchor: { x: 20, y: 50 }, liftPx: 16 } },
    { x: 100, y: 200 },
    2,
  );

  assert.deepEqual(placement.position, { x: 100, y: 168 });
  assert.equal(placement.scale, 1);
});

test("base and visual layers share the local ground-contact adapter across frame pivots and lifts", () => {
  const localGroundContact = { x: 0, y: 0 };
  const base = getGroundContactPlacement(
    visual,
    { textureKey: "base", size: { w: 60, h: 60 }, pivot: { anchor: { x: 30, y: 52 } } },
    localGroundContact,
  );
  const layer = getGroundContactPlacement(
    { ...visual, render: { srcPxPerWu: 16 } },
    { textureKey: "layer", size: { w: 96, h: 120 }, pivot: { anchor: { x: 12, y: 104 }, liftPx: 5 } },
    localGroundContact,
  );

  assert.deepEqual(base.position, localGroundContact);
  assert.deepEqual(layer.position, { x: 0, y: -10 });
  assert.equal(base.scale, 1);
  assert.equal(layer.scale, 2);
  assert.notDeepEqual(base.origin, layer.origin);
});
