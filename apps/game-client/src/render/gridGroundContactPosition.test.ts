import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolveGridGroundContactWorldPosition } from "./gridGroundContactPosition.js";

const mapOrigin = { x: 320, y: 160 };
const mapGeometry = { tileWidth: 64, tileHeight: 32 };

test("resolves every unit grid point to the center of its terrain diamond", () => {
  assert.deepEqual(resolveGridGroundContactWorldPosition({ x: 0, y: 0 }, mapOrigin, mapGeometry), mapOrigin);
  assert.deepEqual(resolveGridGroundContactWorldPosition({ x: 1, y: 0 }, mapOrigin, mapGeometry), { x: 352, y: 176 });
  assert.deepEqual(resolveGridGroundContactWorldPosition({ x: 0, y: 1 }, mapOrigin, mapGeometry), { x: 288, y: 176 });
});

test("SkirmishScene uses the ground-contact helper without the legacy half-tile offset", () => {
  const scenePath = resolve(dirname(fileURLToPath(import.meta.url)), "../scenes/SkirmishScene.ts");
  const sceneSource = readFileSync(scenePath, "utf8");
  const method = sceneSource.match(/  private getGridPointWorldPosition\(point: GridPoint\): Phaser\.Math\.Vector2 \{[\s\S]*?\n  \}/)?.[0];

  assert.ok(method, "SkirmishScene grid-to-world position method must exist");
  assert.match(method, /resolveGridGroundContactWorldPosition\(point, this\.mapOrigin, this\.map\)/);
  assert.doesNotMatch(method, /tileHeight \/ 2/);
});
