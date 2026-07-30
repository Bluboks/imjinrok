import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createBlankMap } from "@shared";
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

test("SkirmishScene uses the ground-contact helper without the legacy half-tile offset", () => {
  const scenePath = resolve(dirname(fileURLToPath(import.meta.url)), "../scenes/SkirmishScene.ts");
  const sceneSource = readFileSync(scenePath, "utf8");
  const method = sceneSource.match(/  private getGridPointWorldPosition\(point: GridPoint\): Phaser\.Math\.Vector2 \{[\s\S]*?\n  \}/)?.[0];

  assert.ok(method, "SkirmishScene grid-to-world position method must exist");
  assert.match(method, /resolveGridGroundContactWorldPosition\(point, this\.mapOrigin, this\.map\)/);
  assert.doesNotMatch(method, /tileHeight \/ 2/);
});

test("SkirmishScene routes resource anchors through the same ground-contact contract as units", () => {
  const scenePath = resolve(dirname(fileURLToPath(import.meta.url)), "../scenes/SkirmishScene.ts");
  const sceneSource = readFileSync(scenePath, "utf8");
  const resourceMethod = sceneSource.match(/  private getResourceWorldPosition\(point: GridPoint\): \{ x: number; y: number; depth: number \} \{[\s\S]*?\n  \}/)?.[0];

  assert.ok(resourceMethod, "SkirmishScene resource ground-contact method must exist");
  assert.match(resourceMethod, /resolveGridGroundContactWorldPosition\(point, this\.mapOrigin, this\.map\)/);
  assert.doesNotMatch(resourceMethod, /cartToIso/);
  assert.match(sceneSource, /const unitPosition = this\.getUnitWorldPosition\(unit\);/);
  assert.match(sceneSource, /private getObjectiveAreaWorldPoints[\s\S]*?this\.getGridGroundContactWorldPoint\(/);
});

test("editor preview projects terrain, resources, and spawns through the shared surface sampler", () => {
  const editorPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../map-editor/src/phaser/createEditorGame.ts");
  const editorSource = readFileSync(editorPath, "utf8");

  assert.match(editorSource, /sampleMapSurfaceElevation\(map, point\)/);
  assert.match(editorSource, /resolveEditorPreviewGroundContact\(this\.mapDefinition, \{ x: originX, y: originY \}, \{ x, y \}\)/);
  assert.match(editorSource, /resolveEditorPreviewGroundContact\(this\.mapDefinition, \{ x: originX, y: originY \}, spawnPoint\)/);
});
