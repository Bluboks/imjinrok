import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createBlankMap } from "./maps.js";
import { createContentRegistry, imjinrokSourceContentPack } from "./contentPack.js";
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

test("legacy maps without visual references remain valid", () => {
  const map = createBlankMap();
  delete map.tilesetId;
  delete map.environmentVisualProfileId;
  delete map.resourceVisualSetId;

  assert.equal(validateMapDefinition(map, createContentRegistry()).ok, true);
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

test("K01 retains only its normal tileset identity without an inferred night cycle", () => {
  const map = createImjinrokMapScaffold("imjinrok-k01");
  assert.ok(map);

  assert.equal(map.tilesetId, "imjinrok-normal");
  assert.equal(map.environmentVisualProfileId, "core-default");
  assert.equal(map.environment, undefined);
  assert.equal(validateMapDefinition(map, createContentRegistry()).ok, true);
});

test("source visual contracts retain catalogued source hashes without semantic promotion", () => {
  const fixture = JSON.parse(readFileSync(resolve("analysis/fixtures/imjinrok-environment-assets.json"), "utf8")) as {
    sourceFiles: { sourcePath: string; sha256: string }[];
  };
  const hashes = new Map(fixture.sourceFiles.map((entry) => [entry.sourcePath, entry.sha256]));
  const normalTileset = imjinrokSourceContentPack.tilesets["imjinrok-normal"];
  const resourceSet = imjinrokSourceContentPack.resourceVisualSets["imjinrok-source-resource-adaptation"];

  assert.equal(normalTileset.evidenceStatus, "unresolved");
  assert.equal(resourceSet.evidenceStatus, "unresolved");
  for (const asset of [...(normalTileset.sourceAssets ?? []), ...(resourceSet.sourceAssets ?? [])]) {
    assert.equal(hashes.get(asset.sourcePath), asset.sha256, asset.sourcePath);
  }
});
