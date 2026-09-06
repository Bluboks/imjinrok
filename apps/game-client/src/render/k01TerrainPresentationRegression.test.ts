import assert from "node:assert/strict";
import test from "node:test";
import {
  createBlankMap,
  createContentRegistry,
  createImjinrokMapScaffold,
  getTileAt,
  resolveElevationTerrainSlot,
} from "@shared";
import { cartToIso } from "@simulation";
import {
  resolveExplicitTileUnderlayVisual,
  resolveExplicitTileVisual,
  resolveExplicitTileVisualPlacement,
  resolveExplicitTileVisualWorldBounds,
} from "./explicitTileVisualResolver.js";
import { resolveGridGroundContactWorldPosition } from "./gridGroundContactPosition.js";
import {
  resolveTerrainElevationOverlayLiftPixels,
  resolveTerrainElevationPresentation,
} from "./terrainElevationPresentation.js";

const CLASSIC_SOURCE_PROFILE_ORIGIN = { x: 320, y: 160 };

test("K01 source raster keeps physical elevation neutral while retaining visual placement offsets", () => {
  const vector = createK01TerrainRasterVector();

  assert.deepEqual(vector, {
    cellCount: 3_600,
    sharedGroundContactFlatCount: 2_865,
    zeroSourceOffsetCount: 2_865,
    elevationCounts: { level0: 3_600, level1: 0 },
    footprint: { left: -1_600, top: 144, right: 2_240, bottom: 2_096 },
    flatCellEntity: {
      terrainSurface: { x: 288, y: 176 },
      entityGroundContact: { x: 288, y: 176 },
      elevationLiftPixels: 0,
    },
    raisedCellEntity: {
      terrainSurface: { x: 320, y: 160 },
      entityGroundContact: { x: 320, y: 160 },
      elevationLiftPixels: 0,
    },
  });
});

test("ramp boundaries share their plateau lift", () => {
  const map = createBlankMap({ width: 2, height: 1, tileWidth: 64, tileHeight: 32 });
  const raised = map.layers[0]?.tiles[1];
  assert.ok(raised);
  raised.elevation = 1;

  const lowerPresentation = resolveTerrainElevationPresentation(map, { x: 0, y: 0 });
  const raisedPresentation = resolveTerrainElevationPresentation(map, { x: 1, y: 0 });
  const rampSlot = resolveElevationTerrainSlot(0, [{ dx: 1, dy: 0, elevation: 1 }]);
  assert.equal(rampSlot, "ramp_nw");
  assert.equal(resolveTerrainElevationOverlayLiftPixels(lowerPresentation, rampSlot, 16), 16);
  assert.equal(resolveTerrainElevationOverlayLiftPixels(raisedPresentation, "plateauTop", 16), 16);
});

function createK01TerrainRasterVector() {
  const map = createImjinrokMapScaffold("imjinrok-k01");
  assert.ok(map);
  const registry = createContentRegistry();
  let sharedGroundContactFlatCount = 0;
  let zeroSourceOffsetCount = 0;
  let level0 = 0;
  let level1 = 0;
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const tile = getTileAt(map, x, y);
      const iso = cartToIso({ x, y }, map.tileWidth, map.tileHeight);
      const terrainSurface = {
        x: CLASSIC_SOURCE_PROFILE_ORIGIN.x + iso.x,
        y: CLASSIC_SOURCE_PROFILE_ORIGIN.y + iso.y,
      };
      const flat = resolveExplicitTileVisual(registry, map, tile, "flat");
      const underlay = resolveExplicitTileUnderlayVisual(registry, map, tile);
      assert.ok(flat, `K01 cell ${x},${y} must resolve its explicit source flat`);
      assert.equal(underlay, null, `K01 cell ${x},${y} must not use the retired coverage underlay`);

      const flatPlacement = resolveExplicitTileVisualPlacement(flat, terrainSurface, map.tileWidth, map.tileHeight);
      const expectedOffsetY = tile.tilesetVisuals?.sourcePixelOffset?.y ?? 0;
      assert.deepEqual(flatPlacement.position, { x: terrainSurface.x, y: terrainSurface.y + expectedOffsetY }, `K01 flat ${x},${y} must use recovered top-edge placement`);
      if (flatPlacement.position.y === terrainSurface.y) sharedGroundContactFlatCount += 1;
      if (flat.sourcePixelOffset.x === 0 && flat.sourcePixelOffset.y === 0) {
        zeroSourceOffsetCount += 1;
      }

      const bounds = resolveExplicitTileVisualWorldBounds(flat, terrainSurface, map.tileWidth, map.tileHeight);
      left = Math.min(left, bounds.left);
      top = Math.min(top, bounds.top);
      right = Math.max(right, bounds.right);
      bottom = Math.max(bottom, bounds.bottom);

      const elevation = resolveTerrainElevationPresentation(map, { x, y });
      if (elevation.level === 0) level0 += 1;
      if (elevation.level === 1) level1 += 1;
    }
  }

  return {
    cellCount: map.width * map.height,
    sharedGroundContactFlatCount,
    zeroSourceOffsetCount,
    elevationCounts: { level0, level1 },
    footprint: { left, top, right, bottom },
    flatCellEntity: resolveEntityGroundContactVector(map, { x: 0, y: 1 }),
    raisedCellEntity: resolveEntityGroundContactVector(map, { x: 0, y: 0 }),
  };
}

function resolveEntityGroundContactVector(
  map: NonNullable<ReturnType<typeof createImjinrokMapScaffold>>,
  point: { x: number; y: number },
) {
  const iso = cartToIso(point, map.tileWidth, map.tileHeight);
  const terrainSurface = {
    x: CLASSIC_SOURCE_PROFILE_ORIGIN.x + iso.x,
    y: CLASSIC_SOURCE_PROFILE_ORIGIN.y + iso.y,
  };
  const elevation = resolveTerrainElevationPresentation(map, point);

  return {
    terrainSurface,
    entityGroundContact: resolveGridGroundContactWorldPosition(point, CLASSIC_SOURCE_PROFILE_ORIGIN, map),
    elevationLiftPixels: elevation.liftPixels,
  };
}
