import assert from "node:assert/strict";
import test from "node:test";
import {
  FOG_VISIBILITY_CHUNK_SIZE,
  getChunkGridSize,
  TERRAIN_RENDER_CHUNK_SIZE,
} from "./chunkPolicy.js";

test("K01-size map keeps 16-tile fog locality while reducing static terrain FBO count", () => {
  const fog = getChunkGridSize(60, 60, FOG_VISIBILITY_CHUNK_SIZE);
  const terrain = getChunkGridSize(60, 60, TERRAIN_RENDER_CHUNK_SIZE);

  assert.deepEqual(fog, { columns: 4, rows: 4, count: 16 });
  assert.deepEqual(terrain, { columns: 2, rows: 2, count: 4 });
});

test("chunk grid rejects invalid dimensions instead of silently creating a malformed mask", () => {
  assert.throws(() => getChunkGridSize(0, 60, 16), /positive integers/u);
  assert.throws(() => getChunkGridSize(60, 60, 0), /positive integer/u);
});
