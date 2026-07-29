import assert from "node:assert/strict";
import test from "node:test";
import { createBlankMap, createContentRegistry } from "@shared";
import {
  getMapExplicitTileVisualPreloadDescriptors,
  getRegisteredExplicitTileVisualPreloadDescriptors,
  requireExplicitTileVisualTexture,
  resolveExplicitTileVisual,
  resolveExplicitTileVisualPlacement,
} from "./explicitTileVisualResolver";

test("resolves flat and elevation assets from each explicitly selected Imjinrok tileset", () => {
  const registry = createContentRegistry();

  for (const theme of ["normal", "snow", "brown"] as const) {
    const map = createBlankMap();
    const tile = map.layers[0]?.tiles[0];
    assert.ok(tile);
    map.tilesetId = `imjinrok-${theme}`;
    tile.tilesetVisuals = { flatAssetKey: "grass", elevationAssetKey: "1" };

    const flat = resolveExplicitTileVisual(registry, map, tile, "flat");
    const elevation = resolveExplicitTileVisual(registry, map, tile, "elevation");

    assert.equal(flat?.url, `/assets/themes/default/terrain/imjinrok-${theme}/grss1_0000.png`);
    assert.equal(elevation?.url, `/assets/themes/default/terrain/imjinrok-${theme}/hill0_0000.png`);
    assert.equal(flat?.textureKey, `tileset-visual:imjinrok-${theme}:flat:grass:frame-0`);
    assert.deepEqual(flat?.imageGeometry, {
      width: 64,
      height: 48,
      footprintAnchor: { x: 32, y: 16 },
    });
  }
});

test("uses the theme renderer unless a tile explicitly selects a tileset asset", () => {
  const map = createBlankMap();
  const tile = map.layers[0]?.tiles[0];
  assert.ok(tile);

  assert.equal(resolveExplicitTileVisual(createContentRegistry(), map, tile, "flat"), null);
  assert.equal(resolveExplicitTileVisual(createContentRegistry(), map, tile, "elevation"), null);
});

test("preload descriptors are deterministic, namespaced, and deduplicated for map selections", () => {
  const registry = createContentRegistry();
  const registered = getRegisteredExplicitTileVisualPreloadDescriptors(registry);
  const keys = registered.map((descriptor) => descriptor.textureKey);

  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(keys, [...keys].sort());

  const map = createBlankMap();
  const first = map.layers[0]?.tiles[0];
  const second = map.layers[0]?.tiles[1];
  assert.ok(first);
  assert.ok(second);
  map.tilesetId = "imjinrok-normal";
  first.tilesetVisuals = { flatAssetKey: "grass" };
  second.tilesetVisuals = { flatAssetKey: "grass", elevationAssetKey: "1" };

  assert.deepEqual(
    getMapExplicitTileVisualPreloadDescriptors(registry, map).map((descriptor) => descriptor.textureKey),
    [
      "tileset-visual:imjinrok-normal:elevation:1:frame-0",
      "tileset-visual:imjinrok-normal:flat:grass:frame-0",
    ],
  );
});

test("places source geometry by its footprint anchor and map elevation step", () => {
  const map = createBlankMap();
  const tile = map.layers[0]?.tiles[0];
  assert.ok(tile);
  map.tilesetId = "imjinrok-normal";
  tile.tilesetVisuals = { elevationAssetKey: "1" };
  const descriptor = resolveExplicitTileVisual(createContentRegistry(), map, tile, "elevation");
  assert.ok(descriptor);

  assert.deepEqual(
    resolveExplicitTileVisualPlacement(descriptor, { x: 120, y: 80 }, 96, 48, 2),
    {
      origin: { x: 0.5, y: 16 / 48 },
      position: { x: 120, y: 32 },
      scale: 1.5,
    },
  );
});

test("rejects missing tilesets, wrong collections, invalid geometry, and missing textures loudly", () => {
  const registry = createContentRegistry();
  const map = createBlankMap();
  const tile = map.layers[0]?.tiles[0];
  assert.ok(tile);
  tile.tilesetVisuals = { flatAssetKey: "grass" };
  delete map.tilesetId;
  assert.throws(() => resolveExplicitTileVisual(registry, map, tile, "flat"), /without tilesetId/);

  map.tilesetId = "imjinrok-normal";
  tile.tilesetVisuals = { flatAssetKey: "1" };
  assert.throws(() => resolveExplicitTileVisual(registry, map, tile, "flat"), /belongs to elevationAssets/);

  registry.tilesets.invalid = {
    id: "invalid",
    displayName: "Invalid",
    terrainAssets: {
      bad: { url: "/bad.png", frame: 0, imageGeometry: { width: 0, height: 16, footprintAnchor: { x: 0, y: 0 } } },
    },
    evidenceStatus: "source-backed-adaptation",
  };
  map.tilesetId = "invalid";
  tile.tilesetVisuals = { flatAssetKey: "bad" };
  assert.throws(() => resolveExplicitTileVisual(registry, map, tile, "flat"), /invalid imageGeometry dimensions/);
  assert.throws(() => requireExplicitTileVisualTexture("tileset-visual:invalid:flat:bad:frame-0", () => false), /not loaded/);
});
