import assert from "node:assert/strict";
import test from "node:test";

import { createBlankMap, resolveMapElevationProfile, sampleMapSurfaceElevation } from "./index.js";

test("map elevation profile defaults to a half-tile bilinear surface", () => {
  const map = createBlankMap({ width: 2, height: 2, tileHeight: 40 });
  assert.deepEqual(resolveMapElevationProfile(map), { stepHeight: 20, sampling: "bilinear" });
  assert.deepEqual(sampleMapSurfaceElevation(map, { x: 0, y: 0 }), { level: 0, liftPixels: 0 });
});

test("bilinear sampling interpolates ramps while preserving flat plateaus", () => {
  const map = createBlankMap({ width: 2, height: 2, tileHeight: 32 });
  const tiles = map.layers[0]?.tiles;
  assert.ok(tiles);
  tiles[0].elevation = 0;
  tiles[1].elevation = 1;
  tiles[2].elevation = 1;
  tiles[3].elevation = 2;

  assert.deepEqual(sampleMapSurfaceElevation(map, { x: 0.5, y: 0.5 }), { level: 1, liftPixels: 16 });
  assert.deepEqual(sampleMapSurfaceElevation(map, { x: 0.25, y: 0.25 }), { level: 0.5, liftPixels: 8 });

  for (const tile of tiles) tile.elevation = 3;
  assert.deepEqual(sampleMapSurfaceElevation(map, { x: 0.25, y: 0.75 }), { level: 3, liftPixels: 48 });
});

test("sampling clamps edges and permits a nearest-level override", () => {
  const map = createBlankMap({ width: 2, height: 2 });
  const tiles = map.layers[0]?.tiles;
  assert.ok(tiles);
  tiles[0].elevation = 0;
  tiles[1].elevation = 2;
  tiles[2].elevation = 4;
  tiles[3].elevation = 6;

  assert.deepEqual(sampleMapSurfaceElevation(map, { x: -10, y: 8 }), { level: 4, liftPixels: 64 });
  assert.deepEqual(sampleMapSurfaceElevation(map, { x: 0.51, y: 0.49 }, { sampling: "nearest" }), { level: 2, liftPixels: 32 });
});

test("profile and surface sampling fail closed for invalid authored data", () => {
  const map = createBlankMap({ width: 2, height: 2 });
  map.elevationProfile = { stepHeight: 0 };
  assert.throws(() => resolveMapElevationProfile(map), /finite and positive/u);
  map.elevationProfile = { sampling: "unsupported" as never };
  assert.throws(() => resolveMapElevationProfile(map), /bilinear.*nearest/u);
  map.elevationProfile = undefined;
  const tile = map.layers[0]?.tiles[0];
  assert.ok(tile);
  tile.elevation = 0.5;
  assert.throws(() => sampleMapSurfaceElevation(map, { x: 0, y: 0 }), /invalid discrete elevation/u);
  assert.throws(
    () => sampleMapSurfaceElevation(map, { x: Number.NaN, y: 0 }),
    /Surface elevation coordinates must be finite; received NaN,0/u,
  );
});
