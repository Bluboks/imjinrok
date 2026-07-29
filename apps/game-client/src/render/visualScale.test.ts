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
});
