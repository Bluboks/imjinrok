import assert from "node:assert/strict";
import test from "node:test";
import { createBlankMap, createContentRegistry } from "@shared";
import {
  getMapExplicitTileVisualPreloadDescriptors,
  getRegisteredExplicitTileVisualPreloadDescriptors,
  requireExplicitTileVisualTexture,
  resolveTileImagePlacement,
  resolveExplicitTileVisual,
  resolveExplicitTileUnderlayVisual,
  resolveExplicitTileVisualPlacement,
  resolveExplicitTileVisualWorldBounds,
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
  assert.equal(resolveExplicitTileUnderlayVisual(createContentRegistry(), map, tile), null);
});

test("resolves a source-art underlay at shared ground contact without the flat artwork offset", () => {
  const map = createBlankMap();
  const tile = map.layers[0]?.tiles[0];
  assert.ok(tile);
  map.tilesetId = "imjinrok-normal";
  tile.tilesetVisuals = { flatAssetKey: "grass", underlayAssetKey: "grass", sourcePixelOffset: { x: 8, y: -16 } };

  const underlay = resolveExplicitTileUnderlayVisual(createContentRegistry(), map, tile);
  assert.equal(underlay?.textureKey, "tileset-visual:imjinrok-normal:flat:grass:frame-0");
  assert.deepEqual(underlay?.sourcePixelOffset, { x: 0, y: 0 });
});

test("preload descriptors are deterministic, namespaced, and deduplicated for map selections", () => {
  const registry = createContentRegistry();
  const registered = getRegisteredExplicitTileVisualPreloadDescriptors(registry);
  const keys = registered.map((descriptor) => descriptor.textureKey);

  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(keys, [...keys].sort((left, right) => left.localeCompare(right)));

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

  assert.deepEqual(
    resolveExplicitTileVisualWorldBounds(descriptor, { x: 120, y: 80 }, 96, 48, 2),
    { left: 72, top: 8, right: 168, bottom: 80 },
  );
});

test("uses the map elevation profile step height for source-art placement and bounds", () => {
  const map = createBlankMap();
  const tile = map.layers[0]?.tiles[0];
  assert.ok(tile);
  map.tilesetId = "imjinrok-normal";
  tile.tilesetVisuals = { elevationAssetKey: "1" };
  const descriptor = resolveExplicitTileVisual(createContentRegistry(), map, tile, "elevation");
  assert.ok(descriptor);

  assert.deepEqual(
    resolveExplicitTileVisualPlacement(descriptor, { x: 120, y: 80 }, 96, 48, 2, 18),
    { origin: { x: 0.5, y: 16 / 48 }, position: { x: 120, y: 44 }, scale: 1.5 },
  );
  assert.deepEqual(
    resolveExplicitTileVisualWorldBounds(descriptor, { x: 120, y: 80 }, 96, 48, 2, 18),
    { left: 72, top: 20, right: 168, bottom: 92 },
  );
  assert.throws(
    () => resolveExplicitTileVisualPlacement(descriptor, { x: 0, y: 0 }, 96, 48, 1, 0),
    /elevation step height/u,
  );
});

test("keeps base and underlay coverage at the raw tile anchor while an elevation layer meets the sampled plateau surface", () => {
  const map = createBlankMap();
  const tile = map.layers[0]?.tiles[0];
  assert.ok(tile);
  map.tilesetId = "imjinrok-normal";
  tile.tilesetVisuals = { flatAssetKey: "grass", underlayAssetKey: "grass", elevationAssetKey: "1" };

  const registry = createContentRegistry();
  const base = resolveExplicitTileVisual(registry, map, tile, "flat");
  const underlay = resolveExplicitTileUnderlayVisual(registry, map, tile);
  const elevation = resolveExplicitTileVisual(registry, map, tile, "elevation");
  assert.ok(base);
  assert.ok(underlay);
  assert.ok(elevation);

  const rawTileAnchor = { x: 120, y: 80 };
  const plateauSurface = { x: 120, y: 62 };
  assert.deepEqual(resolveExplicitTileVisualPlacement(base, rawTileAnchor, 64, 32, 0, 18).position, rawTileAnchor);
  assert.deepEqual(resolveExplicitTileVisualPlacement(underlay, rawTileAnchor, 64, 32, 0, 18).position, rawTileAnchor);
  assert.deepEqual(resolveExplicitTileVisualPlacement(elevation, rawTileAnchor, 64, 32, 1, 18).position, plateauSurface);
  assert.deepEqual(resolveExplicitTileVisualPlacement(elevation, plateauSurface, 64, 32, 0, 18).position, plateauSurface);
});

test("applies finite asset-native offsets consistently to placement and world bounds", () => {
  const map = createBlankMap();
  const tile = map.layers[0]?.tiles[0];
  assert.ok(tile);
  map.tilesetId = "imjinrok-normal";
  tile.tilesetVisuals = { flatAssetKey: "grass", sourcePixelOffset: { x: 8, y: -16 } };
  const descriptor = resolveExplicitTileVisual(createContentRegistry(), map, tile, "flat");
  assert.ok(descriptor);

  assert.deepEqual(
    resolveExplicitTileVisualPlacement(descriptor, { x: 120, y: 80 }, 96, 48),
    { origin: { x: 0.5, y: 16 / 48 }, position: { x: 132, y: 56 }, scale: 1.5 },
  );
  assert.deepEqual(
    resolveExplicitTileVisualWorldBounds(descriptor, { x: 120, y: 80 }, 96, 48),
    { left: 84, top: 32, right: 180, bottom: 104 },
  );
  assert.throws(
    () => resolveTileImagePlacement({ imageGeometry: descriptor.imageGeometry, sourcePixelOffset: { x: Number.NaN, y: 0 } }, { x: 0, y: 0 }, 64, 32),
    /sourcePixelOffset/,
  );
  assert.throws(
    () => resolveTileImagePlacement({ imageGeometry: descriptor.imageGeometry }, { x: Number.NaN, y: 0 }, 64, 32),
    /ground-contact coordinates must be finite; received NaN,0/u,
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
