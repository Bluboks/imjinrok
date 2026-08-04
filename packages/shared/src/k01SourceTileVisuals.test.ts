import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  K01_SOURCE_TILE_VISUAL_DIMENSIONS,
  K01_SOURCE_TILE_VISUAL_PLACEMENT_OFFSET_DIGEST,
  K01_SOURCE_TILE_VISUAL_PAIR_DIGEST,
  K01_SOURCE_CELL_PROJECTION_OUTPUT_Y_ADDITIONS,
  K01_SOURCE_FOG_DIMENSIONS,
  K01_SOURCE_FOG_FAMILY_DIGEST,
  applyK01SourceFogVisuals,
  assertK01SourceFogArtifact,
  applyK01SourceTileVisuals,
  assertK01SourceTileVisualArtifact,
  createBlankMap,
  createContentRegistry,
  createImjinrokMapScaffold,
  getK01SourceTileFlatAssetKey,
  getK01SourceTileRawPlacementArgumentDelta,
  getK01SourceTilePlacementOffset,
  getK01SourceTileVisualAssets,
  getK01SourceFogFamilyIndex,
  getTileAt,
  validateMapDefinition,
} from "./index.js";
import { K01_SOURCE_TILE_VISUAL_ARTIFACT } from "./generated/k01SourceTileVisualArtifact.js";
import { K01_SOURCE_FOG_ARTIFACT } from "./generated/k01SourceFogArtifact.js";

test("K01 source fog artifact preserves the exact x-major family stream and distribution", () => {
  assertK01SourceFogArtifact();
  assert.deepEqual(K01_SOURCE_FOG_DIMENSIONS, { width: 60, height: 60 });
  assert.equal(K01_SOURCE_FOG_ARTIFACT.cellCount, 3600);
  assert.equal(createHash("sha256").update(Buffer.from(K01_SOURCE_FOG_ARTIFACT.familyBytesBase64, "base64")).digest("hex"), K01_SOURCE_FOG_FAMILY_DIGEST);
  assert.deepEqual(K01_SOURCE_FOG_ARTIFACT.distribution, [
    { value: 0, count: 2865 }, { value: 1, count: 95 }, { value: 2, count: 95 }, { value: 3, count: 101 },
    { value: 4, count: 79 }, { value: 5, count: 38 }, { value: 6, count: 36 }, { value: 7, count: 54 },
    { value: 8, count: 61 }, { value: 9, count: 52 }, { value: 10, count: 33 }, { value: 11, count: 35 },
    { value: 12, count: 55 }, { value: 14, count: 1 },
  ]);
  assert.equal(getK01SourceFogFamilyIndex(0, 0), 10);
  assert.equal(getK01SourceFogFamilyIndex(59, 59), 0);
  assert.throws(() => getK01SourceFogFamilyIndex(60, 0), /outside/u);
});

test("K01 source tile artifact preserves every hash-bound x-major source pair", () => {
  assertK01SourceTileVisualArtifact();
  assert.deepEqual(K01_SOURCE_CELL_PROJECTION_OUTPUT_Y_ADDITIONS, { base: 16, raised: 9 });
  assert.deepEqual(K01_SOURCE_TILE_VISUAL_DIMENSIONS, { width: 60, height: 60 });
  assert.equal(K01_SOURCE_TILE_VISUAL_ARTIFACT.pairCount, 3600);
  assert.equal(getK01SourceTileVisualAssets().length, 243);
  assert.equal(new Set(getK01SourceTileVisualAssets().map((asset) => asset.assetKey)).size, 243);
  const bytes = Buffer.from(K01_SOURCE_TILE_VISUAL_ARTIFACT.pairBytesBase64, "base64");
  assert.equal(createHash("sha256").update(bytes).digest("hex"), K01_SOURCE_TILE_VISUAL_PAIR_DIGEST);
  const placementOffsetBytes = Buffer.from(K01_SOURCE_TILE_VISUAL_ARTIFACT.placementOffsetYBytesBase64, "base64");
  assert.equal(createHash("sha256").update(placementOffsetBytes).digest("hex"), K01_SOURCE_TILE_VISUAL_PLACEMENT_OFFSET_DIGEST);
  assert.deepEqual(K01_SOURCE_TILE_VISUAL_ARTIFACT.placementOffsetYDistribution, { zero: 2865, negative16: 735 });
  assert.equal(placementOffsetBytes.filter((value) => value === 0).length, 2865);
  assert.equal(placementOffsetBytes.filter((value) => value === 0xf0).length, 735);
  assert.equal(getK01SourceTileFlatAssetKey(0, 0), "k01-source:hill0:0039");
  assert.equal(getK01SourceTileFlatAssetKey(59, 59), "k01-source:grss1:0018");
  assert.equal(getK01SourceTileRawPlacementArgumentDelta(0, 0), 16);
  assert.equal(getK01SourceTileRawPlacementArgumentDelta(0, 1), 0);
  assert.deepEqual(getK01SourceTilePlacementOffset(0, 0), { x: 0, y: -16 });
  assert.deepEqual(getK01SourceTilePlacementOffset(0, 1), { x: 0, y: 0 });
  assert.deepEqual(getK01SourceTilePlacementOffset(59, 59), { x: 0, y: 0 });
  assert.throws(() => getK01SourceTileFlatAssetKey(60, 0), /outside/u);
  assert.throws(() => getK01SourceTilePlacementOffset(60, 0), /outside/u);
  const registry = createContentRegistry();
  const key = getK01SourceTileFlatAssetKey(45, 40);
  const asset = registry.tilesets["imjinrok-normal"]?.terrainAssets[key];
  assert.deepEqual(asset, {
    url: "/assets/themes/default/terrain/imjinrok-normal/hill0_0004.png",
    frame: 4,
    imageGeometry: { width: 64, height: 48, footprintAnchor: { x: 32, y: 0 } },
  });
});

test("only K01 applies source tile visuals after gameplay terrain mutations", () => {
  const k01 = createImjinrokMapScaffold("imjinrok-k01");
  const k02 = createImjinrokMapScaffold("imjinrok-k02");
  assert.ok(k01);
  assert.ok(k02);
  const sourceKeys = k01.layers[0]?.tiles.map((tile) => tile.tilesetVisuals?.flatAssetKey);

  assert.equal(sourceKeys?.length, 3600);
  assert.equal(new Set(sourceKeys).size, 243);
  assert.deepEqual(getTileAt(k01, 0, 0).tilesetVisuals?.sourcePixelOffset, { x: 0, y: -16 });
  assert.equal(getTileAt(k01, 0, 0).tilesetVisuals?.sourceRawRasterVerticalShiftPx, 16);
  assert.equal(k01.layers[0]?.tiles.every((tile) => tile.tilesetVisuals?.underlayAssetKey === undefined), true);
  assert.deepEqual(getTileAt(k01, 0, 1).tilesetVisuals?.sourcePixelOffset, { x: 0, y: 0 });
  assert.equal(getTileAt(k01, 0, 1).tilesetVisuals?.sourceRawRasterVerticalShiftPx, 0);
  assert.equal(getTileAt(k01, 45, 40).terrain, "shallowWater");
  assert.equal(getTileAt(k01, 45, 40).elevation, 0);
  assert.equal(getTileAt(k01, 0, 0).elevation, 0);
  assert.equal(getTileAt(k01, 6, 6).terrain, "grass");
  assert.equal(getTileAt(k01, 6, 6).elevation, 0);
  const elevations = k01.layers[0]?.tiles.map((tile) => tile.elevation) ?? [];
  assert.equal(elevations.filter((level) => level === 0).length, 3600);
  assert.equal(elevations.filter((level) => level !== 0).length, 0);
  assert.equal(k01.layers[0]?.tiles.every((tile) => tile.tilesetVisuals?.flatArtworkEmbedsRelief === true), true);
  assert.equal(k01.elevationProfile, undefined);
  assert.equal(k01.terrainCompositionProfile, "source-raster");
  assert.equal(k01.sourceRasterClearColor, 0x000000);
  assert.deepEqual(k01.sourceRasterCoverage, {
    mode: "canonical-source-art",
    assetKey: "k01-source:grss1:0000",
    placement: "selected-frame-offset",
    evidenceStatus: "의도적 적응",
  });
  assert.equal(k02.layers.every((layer) => layer.tiles.every((tile) => tile.tilesetVisuals === undefined)), true);
  assert.equal(k01.fogVisualProfileId, "imjinrok-source-fog-composite");
  assert.equal(k01.layers[0]?.tiles.every((tile) => tile.fogVisuals?.familyIndex !== undefined), true);
  assert.equal(k02.layers.every((layer) => layer.tiles.every((tile) => tile.fogVisuals === undefined)), true);
  assert.equal(validateMapDefinition(k01, createContentRegistry()).ok, true);
});

test("K01 source visual assignment rejects incompatible product grids", () => {
  const map = createBlankMap({ width: 2, height: 2 });
  const tiles = map.layers[0]?.tiles;
  assert.ok(tiles);
  assert.throws(() => applyK01SourceTileVisuals(tiles, 2, 2), /require 60x60/u);
  assert.throws(() => applyK01SourceFogVisuals(tiles, 2, 2), /require 60x60/u);
});

test("source placement assignment never overwrites authored physical elevation", () => {
  const map = createBlankMap({ width: 60, height: 60 });
  const first = map.layers[0]?.tiles[0];
  assert.ok(first);
  first.elevation = 3;

  applyK01SourceTileVisuals(map.layers[0]?.tiles ?? [], 60, 60);

  assert.equal(map.layers[0]?.tiles[0]?.elevation, 3);
  assert.deepEqual(map.layers[0]?.tiles[0]?.tilesetVisuals?.sourcePixelOffset, { x: 0, y: -16 });
});
