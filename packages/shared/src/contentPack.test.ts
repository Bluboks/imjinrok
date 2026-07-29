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
