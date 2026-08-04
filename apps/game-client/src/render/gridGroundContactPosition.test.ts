import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createBlankMap, createImjinrokMapScaffold, getTileAt } from "@shared";
import { resolveGridGroundContactWorldPosition } from "./gridGroundContactPosition.js";

const mapOrigin = { x: 320, y: 160 };
const mapGeometry = createBlankMap({ width: 3, height: 3, tileWidth: 64, tileHeight: 32 });

test("resolves every unit grid point to the center of its terrain diamond", () => {
  assert.deepEqual(resolveGridGroundContactWorldPosition({ x: 0, y: 0 }, mapOrigin, mapGeometry), mapOrigin);
  assert.deepEqual(resolveGridGroundContactWorldPosition({ x: 1, y: 0 }, mapOrigin, mapGeometry), { x: 352, y: 176 });
  assert.deepEqual(resolveGridGroundContactWorldPosition({ x: 0, y: 1 }, mapOrigin, mapGeometry), { x: 288, y: 176 });
});

test("anchors integer objects and fractional motion to the sampled elevation surface", () => {
  const elevatedMap = createBlankMap({ width: 3, height: 3, tileWidth: 64, tileHeight: 32 });
  const tiles = elevatedMap.layers[0]?.tiles;
  assert.ok(tiles);
  tiles[4] = { ...tiles[4]!, elevation: 2 };

  assert.deepEqual(
    resolveGridGroundContactWorldPosition({ x: 1, y: 1 }, mapOrigin, elevatedMap),
    { x: 320, y: 160 },
  );
  assert.deepEqual(
    resolveGridGroundContactWorldPosition({ x: 0.5, y: 1 }, mapOrigin, elevatedMap),
    { x: 304, y: 168 },
  );
});

test("moves continuously from a flat cell across a ramp onto an adjacent plateau", () => {
  const rampMap = createBlankMap({ width: 3, height: 1, tileWidth: 64, tileHeight: 32 });
  const tiles = rampMap.layers[0]?.tiles;
  assert.ok(tiles);
  tiles[1] = { ...tiles[1]!, elevation: 1 };
  tiles[2] = { ...tiles[2]!, elevation: 1 };

  const positions = [0, 0.25, 0.5, 0.75, 1, 1.25].map((x) => (
    resolveGridGroundContactWorldPosition({ x, y: 0 }, mapOrigin, rampMap)
  ));

  assert.deepEqual(positions, [
    { x: 320, y: 160 },
    { x: 328, y: 160 },
    { x: 336, y: 160 },
    { x: 344, y: 160 },
    { x: 352, y: 160 },
    { x: 360, y: 164 },
  ]);
});

test("K01 source placement offsets do not alter authored physical ground contact", () => {
  const map = createImjinrokMapScaffold("imjinrok-k01");
  assert.ok(map);
  const point = { x: 0, y: 0 };
  const tile = getTileAt(map, point.x, point.y);
  assert.equal(tile.elevation, 0);
  assert.deepEqual(tile.tilesetVisuals?.sourcePixelOffset, { x: 0, y: -16 });

  const sourceOffsetGroundContact = resolveGridGroundContactWorldPosition(point, mapOrigin, map);
  const fractionalGroundContact = resolveGridGroundContactWorldPosition({ x: 0, y: 0.5 }, mapOrigin, map);

  assert.deepEqual(sourceOffsetGroundContact, mapOrigin);
  assert.deepEqual(fractionalGroundContact, { x: 304, y: 168 });
});

test("rejects invalid grid and map-origin coordinates before producing a placement", () => {
  assert.throws(
    () => resolveGridGroundContactWorldPosition({ x: Number.NaN, y: 0 }, mapOrigin, mapGeometry),
    /Surface elevation coordinates must be finite; received NaN,0/u,
  );
  assert.throws(
    () => resolveGridGroundContactWorldPosition({ x: 0, y: 0 }, { x: Number.POSITIVE_INFINITY, y: 0 }, mapGeometry),
    /Map ground-contact origin coordinates must be finite; received Infinity,0/u,
  );
});

test("SkirmishScene uses the ground-contact helper without the legacy half-tile offset", () => {
  const scenePath = resolve(dirname(fileURLToPath(import.meta.url)), "../scenes/SkirmishScene.ts");
  const sceneSource = readFileSync(scenePath, "utf8");
  const method = sceneSource.match(/  private getGridPointWorldPosition\(point: GridPoint\): Phaser\.Math\.Vector2 \{[\s\S]*?\n  \}/)?.[0];

  assert.ok(method, "SkirmishScene grid-to-world position method must exist");
  assert.match(method, /resolveGridGroundContactWorldPosition\(point, this\.mapOrigin, this\.map\)/);
  assert.doesNotMatch(method, /tileHeight \/ 2/);
});

test("SkirmishScene routes unit, building, and resource anchors through one ground-contact contract", () => {
  const scenePath = resolve(dirname(fileURLToPath(import.meta.url)), "../scenes/SkirmishScene.ts");
  const sceneSource = readFileSync(scenePath, "utf8");
  const resourceMethod = sceneSource.match(/  private getResourceWorldPosition\(point: GridPoint\): \{ x: number; y: number; depth: number \} \{[\s\S]*?\n  \}/)?.[0];

  assert.ok(resourceMethod, "SkirmishScene resource ground-contact method must exist");
  assert.match(resourceMethod, /resolveGridGroundContactWorldPosition\(point, this\.mapOrigin, this\.map\)/);
  assert.doesNotMatch(resourceMethod, /cartToIso/);
  assert.match(sceneSource, /private getUnitWorldPosition\(unit: UnitState\): Phaser\.Math\.Vector2 \{\s+return this\.getGridPointWorldPosition\(unit\.position\);/);
  assert.match(sceneSource, /for \(const unit of Object\.values\(this\.worldState\.units\)\) \{[\s\S]*?const unitPosition = this\.getUnitWorldPosition\(unit\);/);
  assert.match(sceneSource, /unitDefinitions\[unit\.kind\]\.category === "building"/);
  assert.match(sceneSource, /const unitPosition = this\.getUnitWorldPosition\(unit\);/);
  assert.match(sceneSource, /private getObjectiveAreaWorldPoints[\s\S]*?this\.getGridGroundContactWorldPoint\(/);
});

test("projectile presentation shares the same ground-contact resolver", () => {
  const projectilePath = resolve(dirname(fileURLToPath(import.meta.url)), "./projectilePresentation.ts");
  const projectileSource = readFileSync(projectilePath, "utf8");

  assert.match(projectileSource, /resolveGridGroundContactWorldPosition\(projectile\.position, mapOrigin, map\)/);
  assert.match(projectileSource, /resolveGridGroundContactWorldPosition\(projectile\.start, mapOrigin, map\)/);
});

test("editor preview projects terrain, resources, and spawns through the shared surface sampler", () => {
  const editorPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../map-editor/src/phaser/createEditorGame.ts");
  const editorSource = readFileSync(editorPath, "utf8");

  assert.match(editorSource, /sampleMapSurfaceElevation\(map, point\)/);
  assert.match(editorSource, /resolveEditorPreviewGroundContact\(this\.mapDefinition, \{ x: originX, y: originY \}, \{ x, y \}\)/);
  assert.match(editorSource, /resolveEditorPreviewGroundContact\(this\.mapDefinition, \{ x: originX, y: originY \}, spawnPoint\)/);
});
