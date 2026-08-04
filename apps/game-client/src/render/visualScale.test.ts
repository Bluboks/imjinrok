import assert from "node:assert/strict";
import test from "node:test";
import { defaultTheme, type FrameRef, type VisualBase } from "@shared";
import { getFramePivot, getGroundContactPlacement, getGroundContactPlacementAtLiftPixels } from "./visualScale.js";

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

test("uses caller-resolved terrain lift pixels independently of source frame pivots", () => {
  const placement = getGroundContactPlacementAtLiftPixels(
    visual,
    { textureKey: "terrain", pivot: { anchor: { x: 20, y: 50 }, liftPx: 16 } },
    { x: 120, y: 80 },
    21,
  );

  assert.deepEqual(placement.position, { x: 120, y: 59 });
  assert.throws(
    () => getGroundContactPlacementAtLiftPixels(visual, { textureKey: "terrain" }, { x: 0, y: 0 }, -1),
    /non-negative finite pixel value/u,
  );
});

test("source profiles compute class-76 anchors from each current frame size", () => {
  const visual = defaultTheme.visuals["korean-gwon-yul"];
  assert.equal(visual.kind, "entity");
  if (visual.kind !== "entity") return;
  assert.deepEqual(getFramePivot(visual, { textureKey: "gwon", size: { w: 128, h: 108 } }), {
    anchor: { x: 64, y: 85 },
  });
  assert.deepEqual(getFramePivot(visual, { textureKey: "gwon-variant", size: { w: 129, h: 109 } }), {
    anchor: { x: 64, y: 86 },
  });
});

test("center-mode source profiles use truncated current frame centers", () => {
  const visual: VisualBase = {
    id: "center-source",
    kind: "entity",
    assetPath: "test",
    render: { srcPxPerWu: 32 },
    originalSourceProfile: { internalClass: 6 },
    defaults: { size: { w: 96, h: 96 }, pivot: { anchor: { x: 0, y: 0 } } },
  };
  assert.deepEqual(getFramePivot(visual, { textureKey: "center", size: { w: 95, h: 97 } }), {
    anchor: { x: 47, y: 48 },
  });
});
