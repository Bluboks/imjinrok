import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  K01_SOURCE_TILE_VISUAL_DIMENSIONS,
  K01_SOURCE_TILE_VISUAL_PAIR_DIGEST,
  applyK01SourceTileVisuals,
  assertK01SourceTileVisualArtifact,
  createBlankMap,
  createContentRegistry,
  createImjinrokMapScaffold,
  getK01SourceTileFlatAssetKey,
  getK01SourceTileVisualAssets,
  getTileAt,
  validateMapDefinition,
} from "./index.js";
import { K01_SOURCE_TILE_VISUAL_ARTIFACT } from "./generated/k01SourceTileVisualArtifact.js";

test("K01 source tile artifact preserves every hash-bound x-major source pair", () => {
  assertK01SourceTileVisualArtifact();
  assert.deepEqual(K01_SOURCE_TILE_VISUAL_DIMENSIONS, { width: 60, height: 60 });
  assert.equal(K01_SOURCE_TILE_VISUAL_ARTIFACT.pairCount, 3600);
  assert.equal(getK01SourceTileVisualAssets().length, 243);
  assert.equal(new Set(getK01SourceTileVisualAssets().map((asset) => asset.assetKey)).size, 243);
  const bytes = Buffer.from(K01_SOURCE_TILE_VISUAL_ARTIFACT.pairBytesBase64, "base64");
  assert.equal(createHash("sha256").update(bytes).digest("hex"), K01_SOURCE_TILE_VISUAL_PAIR_DIGEST);
  assert.equal(getK01SourceTileFlatAssetKey(0, 0), "k01-source:hill0:0039");
  assert.equal(getK01SourceTileFlatAssetKey(59, 59), "k01-source:grss1:0018");
  assert.throws(() => getK01SourceTileFlatAssetKey(60, 0), /outside/u);
  const registry = createContentRegistry();
  const key = getK01SourceTileFlatAssetKey(45, 40);
  const asset = registry.tilesets["imjinrok-normal"]?.terrainAssets[key];
  assert.deepEqual(asset, {
    url: "/assets/themes/default/terrain/imjinrok-normal/hill0_0004.png",
    frame: 4,
    imageGeometry: { width: 64, height: 48, footprintAnchor: { x: 32, y: 16 } },
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
  assert.equal(getTileAt(k01, 45, 40).terrain, "shallowWater");
  assert.equal(getTileAt(k01, 45, 40).elevation, 0);
  assert.equal(getTileAt(k01, 6, 6).terrain, "grass");
  assert.equal(getTileAt(k01, 6, 6).elevation, 0);
  assert.equal(k02.layers.every((layer) => layer.tiles.every((tile) => tile.tilesetVisuals === undefined)), true);
  assert.equal(validateMapDefinition(k01, createContentRegistry()).ok, true);
});

test("K01 source visual assignment rejects incompatible product grids", () => {
  const map = createBlankMap({ width: 2, height: 2 });
  const tiles = map.layers[0]?.tiles;
  assert.ok(tiles);
  assert.throws(() => applyK01SourceTileVisuals(tiles, 2, 2), /require 60x60/u);
});
