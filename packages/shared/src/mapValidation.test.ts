import assert from "node:assert/strict";
import test from "node:test";
import { createBlankMap } from "./maps.js";
import { createContentRegistry } from "./contentPack.js";
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
