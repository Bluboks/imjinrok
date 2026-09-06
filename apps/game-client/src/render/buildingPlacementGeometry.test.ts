import assert from "node:assert/strict";
import { createBlankMap } from "@shared";
import test from "node:test";
import { resolveBuildingPlacementGeometry } from "./buildingPlacementGeometry.js";

const mapOrigin = { x: 640, y: 160 };
const map = createBlankMap({ width: 16, height: 16, tileWidth: 64, tileHeight: 32 });

function geometry(width: number, height: number, position = { x: 5, y: 4 }) {
  return resolveBuildingPlacementGeometry({
    position,
    footprint: { width, height, blocksMovement: true },
    mapOrigin,
    map,
  });
}

test("uses the actual HQ 4x4 footprint and adapts the source far-cell contact", () => {
  const result = geometry(4, 4);

  assert.deepEqual(result.actualTiles, [
    { x: 4, y: 3 }, { x: 5, y: 3 }, { x: 6, y: 3 }, { x: 7, y: 3 },
    { x: 4, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 }, { x: 7, y: 4 },
    { x: 4, y: 5 }, { x: 5, y: 5 }, { x: 6, y: 5 }, { x: 7, y: 5 },
    { x: 4, y: 6 }, { x: 5, y: 6 }, { x: 6, y: 6 }, { x: 7, y: 6 },
  ]);
  assert.deepEqual(result.farCell, { x: 7, y: 6 });
  assert.deepEqual(result.semanticCenterWorld, { x: 672, y: 304 });
  assert.deepEqual(result.footprintCenterWorld, { x: 672, y: 320 });
  assert.deepEqual(result.projectedSpriteGroundContact, { x: 672, y: 368 });
  assert.deepEqual(result.localSpriteOffset, { x: 0, y: 64 });
});

test("keeps even, mixed, and one-cell footprint goldens aligned to the far cell", () => {
  assert.deepEqual(geometry(3, 3).localSpriteOffset, { x: 0, y: 32 });
  assert.deepEqual(geometry(3, 2).farCell, { x: 6, y: 5 });
  assert.deepEqual(geometry(3, 2).localSpriteOffset, { x: 0, y: 32 });
  assert.deepEqual(geometry(4, 2).farCell, { x: 7, y: 5 });
  assert.deepEqual(geometry(4, 2).localSpriteOffset, { x: 32, y: 48 });
  assert.deepEqual(geometry(2, 2).farCell, { x: 6, y: 5 });
  assert.deepEqual(geometry(2, 2).localSpriteOffset, { x: 0, y: 32 });
  assert.deepEqual(geometry(1, 1).farCell, { x: 5, y: 4 });
  assert.deepEqual(geometry(1, 1).localSpriteOffset, { x: 0, y: 0 });
});

test("projects the far contact and polygon through sampled map elevation", () => {
  const elevated = createBlankMap({ width: 16, height: 16, tileWidth: 64, tileHeight: 32 });
  elevated.layers[0]!.tiles[2 * elevated.width + 2] = { ...elevated.layers[0]!.tiles[2 * elevated.width + 2]!, elevation: 2 };
  const result = resolveBuildingPlacementGeometry({
    position: { x: 1, y: 1 },
    footprint: { width: 2, height: 2, blocksMovement: true },
    mapOrigin,
    map: elevated,
  });

  assert.deepEqual(result.semanticCenterWorld, { x: 640, y: 192 });
  assert.deepEqual(result.footprintCenterWorld, { x: 640, y: 200 });
  assert.deepEqual(result.projectedSpriteGroundContact, { x: 640, y: 192 });
  assert.deepEqual(result.localSpriteOffset, { x: 0, y: 0 });
  assert.equal(result.footprintPolygon.length, 4);
  const flat = geometry(2, 2, { x: 1, y: 1 });
  assert.notDeepEqual(result.footprintPolygon, flat.footprintPolygon);
});

test("rejects an invalid footprint instead of inventing a placement", () => {
  assert.throws(() => geometry(0, 1), /positive footprint/u);
});
