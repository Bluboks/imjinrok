import assert from "node:assert/strict";
import test from "node:test";
import {
  adaptSourceFogUnseenPixels,
  getSourceFogUnseenTextureKey,
  resolveSourceFogChunkDepth,
} from "./sourceFogPixelAdapter.js";

test("source state-8 product adapter maps intensity to dark-overlay alpha", () => {
  const sourcePixels = new Uint8ClampedArray([
    255, 255, 255, 255,
    0, 0, 0, 123,
    128, 128, 128, 255,
    10, 200, 100, 255,
    255, 255, 255, 0,
  ]);

  assert.deepEqual(
    [...adaptSourceFogUnseenPixels(sourcePixels, 0x020608)],
    [
      2, 6, 8, 0,
      2, 6, 8, 123,
      2, 6, 8, 127,
      2, 6, 8, 55,
      2, 6, 8, 0,
    ],
  );
  assert.deepEqual([...sourcePixels], [
    255, 255, 255, 255,
    0, 0, 0, 123,
    128, 128, 128, 255,
    10, 200, 100, 255,
    255, 255, 255, 0,
  ]);
});

test("source state-8 derived texture keys stay separate from source state-4 textures", () => {
  assert.equal(getSourceFogUnseenTextureKey("original-normal-fog-0-selector-03"), "original-normal-fog-0-selector-03-unseen-alpha-adapted");
  assert.throws(() => adaptSourceFogUnseenPixels(new Uint8ClampedArray(3), 0x020608), /complete RGBA/);
  assert.throws(() => getSourceFogUnseenTextureKey(""), /must not be empty/);
});

test("source raster fog chunks clear the terrain render-texture depth boundary", () => {
  assert.equal(resolveSourceFogChunkDepth(126, [128], true), 129);
  assert.equal(resolveSourceFogChunkDepth(126, [128], false), 127);
  assert.equal(resolveSourceFogChunkDepth(126, [], true), 127);
});
