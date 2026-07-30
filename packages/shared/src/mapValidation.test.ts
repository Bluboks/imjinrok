import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createBlankMap } from "./maps.js";
import { createContentRegistry, defaultContentPacks, imjinrokSourceContentPack } from "./contentPack.js";
import { assertValidMapDefinition, validateMapDefinition } from "./mapValidation.js";
import { createImjinrokMapScaffold } from "./imjinrokMaps.js";

test("maps select registered visual contracts", () => {
  const map = createBlankMap();
  const result = validateMapDefinition(map, createContentRegistry());

  assert.equal(result.ok, true);
});

test("unknown visual contract references fail loudly", () => {
  const map = createBlankMap();
  map.tilesetId = "missing-tileset";

  const result = validateMapDefinition(map, createContentRegistry());

  assert.deepEqual(result.issues, [{ path: "tilesetId", message: "Unknown tileset 'missing-tileset'." }]);
  assert.throws(() => assertValidMapDefinition(map, createContentRegistry()), /Invalid map definition 'blank-frontier': tilesetId/);
});

test("maps validate optional pathfinding profile selections against content metadata", () => {
  const map = createBlankMap();
  map.pathfindingProfileId = "mod:deterministic";
  const registry = createContentRegistry([
    ...defaultContentPacks,
    {
      id: "pathfinding-test-pack",
      displayName: "Pathfinding Test Pack",
      version: "1.0.0",
      pathfindingProfiles: {
        "mod:deterministic": { id: "mod:deterministic", displayName: "Deterministic Mod Pathfinder" },
      },
    },
  ]);

  assert.equal(validateMapDefinition(map, registry).ok, true);

  map.pathfindingProfileId = "missing:pathfinder";
  assert.deepEqual(validateMapDefinition(map, registry).issues, [
    { path: "pathfindingProfileId", message: "Unknown pathfinding profile 'missing:pathfinder'." },
  ]);

  map.pathfindingProfileId = "";
  assert.deepEqual(validateMapDefinition(map, registry).issues, [
    { path: "pathfindingProfileId", message: "Pathfinding profile id must not be empty." },
  ]);
});

test("legacy maps without visual references remain valid", () => {
  const map = createBlankMap();
  delete map.tilesetId;
  delete map.environmentVisualProfileId;
  delete map.resourceVisualSetId;

  assert.equal(validateMapDefinition(map, createContentRegistry()).ok, true);
});

test("explicit tile visuals require a selected tileset and assets from the correct collection", () => {
  const map = createBlankMap();
  const tile = map.layers[0]?.tiles[0];
  assert.ok(tile);
  tile.tilesetVisuals = { flatAssetKey: "grass", elevationAssetKey: "1" };
  delete map.tilesetId;

  assert.deepEqual(
    validateMapDefinition(map, createContentRegistry()).issues,
    [
      { path: "layers[0].tiles[0].tilesetVisuals.flatAssetKey", message: "Explicit flat asset selection requires map.tilesetId." },
      { path: "layers[0].tiles[0].tilesetVisuals.elevationAssetKey", message: "Explicit elevation asset selection requires map.tilesetId." },
    ],
  );

  map.tilesetId = "imjinrok-normal";
  tile.tilesetVisuals = { flatAssetKey: "1", elevationAssetKey: "missing" };
  assert.deepEqual(
    validateMapDefinition(map, createContentRegistry()).issues,
    [
      {
        path: "layers[0].tiles[0].tilesetVisuals.flatAssetKey",
        message: "Asset '1' belongs to elevationAssets, not the flat collection.",
      },
      {
        path: "layers[0].tiles[0].tilesetVisuals.elevationAssetKey",
        message: "Unknown elevation asset 'missing'.",
      },
    ],
  );
});

test("explicit tile visuals reject selected assets without valid geometry", () => {
  const registry = createContentRegistry();
  registry.tilesets["invalid-geometry"] = {
    id: "invalid-geometry",
    displayName: "Invalid Geometry",
    terrainAssets: {
      invalid: {
        url: "/invalid.png",
        frame: 0,
        imageGeometry: { width: 0, height: 16, footprintAnchor: { x: 20, y: -1 } },
      },
    },
    evidenceStatus: "source-backed-adaptation",
  };
  const map = createBlankMap();
  const tile = map.layers[0]?.tiles[0];
  assert.ok(tile);
  map.tilesetId = "invalid-geometry";
  tile.tilesetVisuals = { flatAssetKey: "invalid" };

  assert.deepEqual(
    validateMapDefinition(map, registry).issues,
    [
      { path: "layers[0].tiles[0].tilesetVisuals.flatAssetKey.imageGeometry.width", message: "Image width must be positive." },
      { path: "layers[0].tiles[0].tilesetVisuals.flatAssetKey.imageGeometry.footprintAnchor.x", message: "Footprint anchor x must be inside the image." },
      { path: "layers[0].tiles[0].tilesetVisuals.flatAssetKey.imageGeometry.footprintAnchor.y", message: "Footprint anchor y must be inside the image." },
    ],
  );
});

test("map validation rejects invalid elevation and unknown resource identities", () => {
  const map = createBlankMap({ width: 2, height: 2 });
  const firstTile = map.layers[0]?.tiles[0];
  assert.ok(firstTile);
  firstTile.elevation = -1;
  firstTile.resource = { id: "unknown", kind: "unknown-resource", amount: 1 };

  const result = validateMapDefinition(map, createContentRegistry());

  assert.equal(result.ok, false);
  assert.deepEqual(result.issues.map((entry) => entry.path), [
    "layers[0].tiles[0].elevation",
    "layers[0].tiles[0].resource.kind",
  ]);
});

test("map validation reports concrete invalid day/night curve paths", () => {
  const map = createBlankMap();
  map.environment = {
    dayNight: {
      cycleTicks: 0,
      dayStartTick: -1,
      nightStartTick: 1.5,
      nightSightMultiplier: -1,
      lightCurve: [
        { tick: 0, phase: "night", lightLevel01: 2 },
        { tick: 0, phase: "day", lightLevel01: Number.NaN },
      ],
      visualSteps: [
        { tick: 8, paletteId: "" },
        { tick: 8, paletteId: "night1" },
      ],
    },
  };

  const result = validateMapDefinition(map, createContentRegistry());

  assert.deepEqual(result.issues.map((entry) => entry.path), [
    "environment.dayNight.cycleTicks",
    "environment.dayNight.dayStartTick",
    "environment.dayNight.nightStartTick",
    "environment.dayNight.nightSightMultiplier",
    "environment.dayNight.lightCurve[0].tick",
    "environment.dayNight.lightCurve[0].lightLevel01",
    "environment.dayNight.lightCurve[1].tick",
    "environment.dayNight.lightCurve[1].lightLevel01",
    "environment.dayNight.visualSteps[0].tick",
    "environment.dayNight.visualSteps[0].paletteId",
    "environment.dayNight.visualSteps[1].tick",
    "environment.dayNight.visualSteps[0].paletteId",
    "environment.dayNight.visualSteps[1].paletteId",
  ]);
});

test("K01 opts into the source schedule identity without applying a sight modifier", () => {
  const map = createImjinrokMapScaffold("imjinrok-k01");
  assert.ok(map);

  assert.equal(map.tilesetId, "imjinrok-normal");
  assert.equal(map.environmentVisualProfileId, "imjinrok-source-day-night-palette");
  assert.deepEqual(map.environment?.dayNight, {
    cycleTicks: 8_640,
    dayStartTick: 0,
    nightStartTick: 4_320,
    visualSteps: [
      { tick: 0, paletteId: "night3" },
      { tick: 2, paletteId: "night2" },
      { tick: 4, paletteId: "night1" },
      { tick: 4_320, paletteId: "night1" },
      { tick: 4_322, paletteId: "night2" },
      { tick: 4_324, paletteId: "night3" },
      { tick: 4_326, paletteId: "night4" },
    ],
  });
  assert.equal(map.layers.every((layer) => layer.tiles.every((tile) => tile.tilesetVisuals?.flatAssetKey?.startsWith("k01-source:") === true)), true);
  assert.equal(validateMapDefinition(map, createContentRegistry()).ok, true);
});

test("day/night visual steps require a selected palette profile and known palette ids", () => {
  const map = createBlankMap();
  map.environment = {
    dayNight: {
      cycleTicks: 8,
      dayStartTick: 0,
      nightStartTick: 4,
      visualSteps: [{ tick: 0, paletteId: "missing" }],
    },
  };
  delete map.environmentVisualProfileId;
  assert.deepEqual(validateMapDefinition(map, createContentRegistry()).issues, [
    { path: "environmentVisualProfileId", message: "Day/night visual steps require an environment visual profile." },
  ]);

  map.environmentVisualProfileId = "imjinrok-source-day-night-palette";
  assert.deepEqual(validateMapDefinition(map, createContentRegistry()).issues, [
    { path: "environment.dayNight.visualSteps[0].paletteId", message: "Unknown palette 'missing' in environment visual profile 'imjinrok-source-day-night-palette'." },
  ]);
});

test("day/night visual steps reject duplicate cycle ticks", () => {
  const map = createBlankMap();
  map.environmentVisualProfileId = "imjinrok-source-day-night-palette";
  map.environment = {
    dayNight: {
      cycleTicks: 8,
      dayStartTick: 0,
      nightStartTick: 4,
      visualSteps: [
        { tick: 0, paletteId: "night1" },
        { tick: 0, paletteId: "night2" },
      ],
    },
  };

  assert.deepEqual(validateMapDefinition(map, createContentRegistry()).issues, [
    { path: "environment.dayNight.visualSteps[1].tick", message: "Duplicate visual step tick '0'." },
  ]);
});

test("source visual contracts retain catalogued source hashes without semantic promotion", () => {
  const fixture = JSON.parse(readFileSync(resolve("analysis/fixtures/imjinrok-environment-assets.json"), "utf8")) as {
    sourceFiles: { sourcePath: string; sha256: string }[];
  };
  const hashes = new Map(fixture.sourceFiles.map((entry) => [entry.sourcePath, entry.sha256]));
  const normalTileset = imjinrokSourceContentPack.tilesets["imjinrok-normal"];
  const resourceSet = imjinrokSourceContentPack.resourceVisualSets["imjinrok-source-resource-adaptation"];
  const paletteProfile = imjinrokSourceContentPack.environmentVisualProfiles["imjinrok-source-day-night-palette"];

  assert.equal(normalTileset.evidenceStatus, "unresolved");
  assert.equal(resourceSet.evidenceStatus, "source-backed-adaptation");
  assert.equal(paletteProfile.evidenceStatus, "source-backed-adaptation");
  assert.deepEqual(paletteProfile.paletteAssets?.map((asset) => [asset.id, asset.frame]), [["night1", 0], ["night2", 1], ["night3", 2], ["night4", 3]]);
  for (const asset of [...(normalTileset.sourceAssets ?? []), ...(resourceSet.sourceAssets ?? [])]) {
    assert.equal(hashes.get(asset.sourcePath), asset.sha256, asset.sourcePath);
  }
});
