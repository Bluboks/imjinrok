import assert from "node:assert/strict";
import test from "node:test";
import { resolveEntityPortraitFrame } from "./entityPortrait.js";
import type { EntityVisual } from "./visuals.js";

const frame = (textureKey: string, frameName?: string) => ({ textureKey, ...(frameName === undefined ? {} : { frameName }) });

function createVisual(overrides: Partial<EntityVisual> = {}): EntityVisual {
  return {
    id: "test-entity",
    kind: "entity",
    assetPath: "entities/test",
    render: { srcPxPerWu: 32 },
    defaults: { size: { w: 32, h: 32 }, pivot: { anchor: { x: 16, y: 16 } } },
    states: {},
    ...overrides,
  };
}

test("entity portrait resolver prioritizes explicit theme metadata", () => {
  const explicit = frame("portrait-texture", "portrait-frame");
  const resolved = resolveEntityPortraitFrame(createVisual({
    portrait: explicit,
    states: {
      idle: { clips: { default: { frames: [frame("idle-texture")], fps: 1, mirrorX: true } } },
    },
  }));

  assert.deepEqual(resolved, { frame: explicit, mirrorX: false });
});

test("entity portrait resolver uses the idle default frame before other clips", () => {
  const resolved = resolveEntityPortraitFrame(createVisual({
    states: {
      attack: { clips: { default: { frames: [frame("attack-texture")], fps: 1 } } },
      idle: {
        clips: {
          n: { frames: [frame("idle-n")], fps: 1 },
          default: { frames: [frame("idle-default")], fps: 1, mirrorX: true },
        },
      },
    },
  }));

  assert.deepEqual(resolved, { frame: frame("idle-default"), mirrorX: true });
});

test("entity portrait resolver uses a stable first valid fallback clip", () => {
  const resolved = resolveEntityPortraitFrame(createVisual({
    states: {
      move: { clips: { e: { frames: [frame("move-east")], fps: 1, mirrorX: true } } },
      attack: { clips: { default: { frames: [], fps: 1 }, s: { frames: [frame("attack-south")], fps: 1 } } },
    },
  }));

  assert.deepEqual(resolved, { frame: frame("attack-south"), mirrorX: false });
});

test("entity portrait resolver returns null when no state contains a frame", () => {
  assert.equal(resolveEntityPortraitFrame(createVisual({
    states: { idle: { clips: { default: { frames: [], fps: 1 } } } },
  })), null);
});
