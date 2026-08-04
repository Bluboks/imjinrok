import assert from "node:assert/strict";
import test from "node:test";
import { createBlankMap, createImjinrokMapScaffold } from "@shared";

import { createSourceTerrainRasterPlan, usesSourceTerrainRasterComposition } from "./k01TerrainRasterPlan";

const K01_WORLD_BOUNDS = { left: -1600, top: 144, right: 2240, bottom: 2096 };

test("source terrain raster plans replay all K01 frames in the recovered global y-then-x order", () => {
  const map = createImjinrokMapScaffold("imjinrok-k01");
  assert.ok(map);
  const plan = createSourceTerrainRasterPlan(map, K01_WORLD_BOUNDS, 4096);
  assert.ok(plan);

  assert.equal(usesSourceTerrainRasterComposition(map), true);
  assert.equal(plan.drawOrder, "y-major then x-major");
  assert.equal(plan.regions.length, 1);
  assert.deepEqual(plan.regions[0], { ...K01_WORLD_BOUNDS, width: 3840, height: 1952 });
  assert.equal(plan.cells.length, 3600);
  assert.equal(plan.clearColor, 0x000000);
  assert.deepEqual(plan.coverage, {
    mode: "canonical-source-art",
    assetKey: "k01-source:grss1:0000",
    placement: "selected-frame-offset",
    evidenceStatus: "의도적 적응",
  });
  assert.deepEqual(plan.cells.slice(0, 3), [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]);
  assert.deepEqual(plan.cells[60], { x: 0, y: 1 });
  assert.deepEqual(plan.cells.at(-1), { x: 59, y: 59 });
});

test("source terrain raster partitions output pixels without changing global replay order", () => {
  const map = createImjinrokMapScaffold("imjinrok-k01");
  assert.ok(map);
  const plan = createSourceTerrainRasterPlan(map, K01_WORLD_BOUNDS, 1024);
  assert.ok(plan);

  assert.equal(plan.regions.every((region) => region.width <= 1024 && region.height <= 1024), true);
  assert.equal(plan.regions.length, 8);
  assert.deepEqual(plan.cells.slice(0, 2), [{ x: 0, y: 0 }, { x: 1, y: 0 }]);
  assert.throws(
    () => createSourceTerrainRasterPlan(map, K01_WORLD_BOUNDS, 0),
    /maximum texture size/u,
  );
});

test("source raster composition requires an explicit profile and does not couple to the K01 map id", () => {
  const genericMap = createBlankMap({ width: 2, height: 1 });
  for (const tile of genericMap.layers[0]?.tiles ?? []) {
    tile.tilesetVisuals = { flatAssetKey: "source-flat", flatArtworkEmbedsRelief: true };
  }
  assert.equal(usesSourceTerrainRasterComposition(genericMap), false);
  assert.equal(createSourceTerrainRasterPlan(genericMap, { left: 0, top: 0, right: 128, bottom: 64 }, 4096), null);

  genericMap.terrainCompositionProfile = "source-raster";
  const plan = createSourceTerrainRasterPlan(genericMap, { left: 0, top: 0, right: 128, bottom: 64 }, 4096);
  assert.ok(plan);
  assert.deepEqual(plan.cells, [{ x: 0, y: 0 }, { x: 1, y: 0 }]);
});

test("source raster clear color is an explicit optional generic composition contract", () => {
  const genericMap = createBlankMap({ width: 1, height: 1 });
  const tile = genericMap.layers[0]?.tiles[0];
  assert.ok(tile);
  tile.tilesetVisuals = { flatAssetKey: "source-flat", flatArtworkEmbedsRelief: true };
  genericMap.terrainCompositionProfile = "source-raster";
  genericMap.sourceRasterClearColor = 0x102030;
  const plan = createSourceTerrainRasterPlan(genericMap, { left: 0, top: 0, right: 64, bottom: 48 }, 4096);
  assert.equal(plan?.clearColor, 0x102030);
});

test("legacy source-raster-underlay retains authored per-cell coverage semantics", () => {
  const legacyMap = createBlankMap({ width: 1, height: 1 });
  const tile = legacyMap.layers[0]?.tiles[0];
  assert.ok(tile);
  tile.tilesetVisuals = { flatAssetKey: "source-flat", underlayAssetKey: "authored-underlay", flatArtworkEmbedsRelief: true };
  legacyMap.terrainCompositionProfile = "source-raster-underlay";
  const plan = createSourceTerrainRasterPlan(legacyMap, { left: 0, top: 0, right: 64, bottom: 48 }, 4096);
  assert.deepEqual(plan?.coverage, { mode: "legacy-authored-underlay", placement: "authored-per-cell" });
});
