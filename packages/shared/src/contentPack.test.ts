import assert from "node:assert/strict";
import test from "node:test";
import { coreContentPack, createContentRegistry, imjinrokSourceContentPack, validateContentRegistry } from "./contentPack.js";

test("default core and source catalog packs have distinct definition ownership", () => {
  const result = validateContentRegistry(createContentRegistry());

  assert.equal(result.ok, true);
});

test("content registry rejects duplicate namespace ownership even for the same object", () => {
  const duplicatePack = {
    id: "duplicate-core-definitions",
    displayName: "Duplicate Core Definitions",
    version: "0.1.0",
    terrains: { grass: coreContentPack.terrains.grass },
    tilesets: { "core-default": coreContentPack.tilesets["core-default"] },
  };
  const result = validateContentRegistry(createContentRegistry([coreContentPack, duplicatePack]));

  assert.equal(result.ok, false);
  assert.deepEqual(result.issues.filter((issue) => issue.severity === "error").map((issue) => issue.path), [
    "packs[1].terrains.grass",
    "packs[1].tilesets.core-default",
  ]);
});

test("source catalog pack does not claim gameplay definition ownership", () => {
  assert.deepEqual(imjinrokSourceContentPack.terrains, {});
  assert.deepEqual(imjinrokSourceContentPack.resources, {});
  assert.deepEqual(imjinrokSourceContentPack.units, {});
});

test("source catalog marks the K01 source-greedy navigation adapter as a source-backed adaptation", () => {
  assert.deepEqual(imjinrokSourceContentPack.pathfindingProfiles["imjinrok:source-greedy-local-adapter"], {
    id: "imjinrok:source-greedy-local-adapter",
    displayName: "Imjinrok Source Greedy Local Adapter",
    evidenceStatus: "source-backed-adaptation",
  });
});

test("core collision profile remains explicitly project-only", () => {
  assert.deepEqual(coreContentPack.movementCollisionProfiles?.["core:strict-footprint-reservation"], {
    id: "core:strict-footprint-reservation",
    displayName: "Core Strict Footprint Reservation",
    evidenceStatus: "project-only",
  });
});

test("movement collision profile validation rejects empty display names", () => {
  const registry = createContentRegistry();
  registry.movementCollisionProfiles.invalid = { id: "invalid", displayName: "" };

  assert.deepEqual(
    validateContentRegistry(registry).issues.filter((issue) => issue.path.startsWith("movementCollisionProfiles.invalid")).map((issue) => issue.path),
    ["movementCollisionProfiles.invalid.displayName"],
  );
});

test("resource visual catalog maps only crop and tree project adaptations", () => {
  const resourceSet = imjinrokSourceContentPack.resourceVisualSets["imjinrok-source-resource-adaptation"];

  assert.equal(resourceSet.evidenceStatus, "source-backed-adaptation");
  assert.deepEqual(resourceSet.resources.rice, resourceSet.resources.potato);
  assert.deepEqual(resourceSet.resources.tree, resourceSet.resources.bamboo);
  assert.deepEqual(resourceSet.resources.rice?.states.active, {
    url: "/assets/themes/default/resources/imjinrok/crop0_0000.png",
    frame: 0,
  });
  assert.deepEqual(resourceSet.resources.tree?.states.active, {
    url: "/assets/themes/default/resources/imjinrok/tree0_0000.png",
    frame: 0,
  });
  assert.equal(resourceSet.resources.gold, undefined);
  assert.equal(resourceSet.resources.stone, undefined);
  assert.ok(resourceSet.sourceAssets?.some((asset) => asset.sourcePath === "fnt/resource.spr"));
});

test("environment palette profiles reject duplicate ids and invalid source frame metadata", () => {
  const registry = createContentRegistry();
  registry.environmentVisualProfiles.invalid = {
    id: "invalid",
    displayName: "Invalid palette profile",
    evidenceStatus: "source-backed-adaptation",
    paletteAssets: [
      { id: "night", url: "", frame: -1, sourceSha256: "stale" },
      { id: "night", url: "/palette.json", frame: 0, sourceSha256: "a".repeat(64) },
    ],
  };

  assert.deepEqual(
    validateContentRegistry(registry).issues.filter((issue) => issue.path.startsWith("environmentVisualProfiles.invalid")).map((issue) => issue.path),
    [
      "environmentVisualProfiles.invalid.paletteAssets[0].frame",
      "environmentVisualProfiles.invalid.paletteAssets[0].url",
      "environmentVisualProfiles.invalid.paletteAssets[0].sourceSha256",
      "environmentVisualProfiles.invalid.paletteAssets[1].id",
    ],
  );
});
