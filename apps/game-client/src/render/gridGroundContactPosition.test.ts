import assert from "node:assert/strict";
import test from "node:test";
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
