import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
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

test("K01 source tiles retain shared-anchor underlay and flat placement across the complete map footprint", () => {
  const vector = createK01TerrainRasterVector();

  assert.deepEqual(vector, {
    cellCount: 3_600,
    sharedGroundContactFlatCount: 3_600,
    sharedGroundContactUnderlayCount: 3_600,
    zeroSourceOffsetCount: 3_600,
    elevationCounts: { level0: 2_865, level1: 735 },
    footprint: { left: -1_600, top: 144, right: 2_240, bottom: 2_080 },
    flatCellEntity: {
      terrainSurface: { x: 288, y: 176 },
      entityGroundContact: { x: 288, y: 176 },
      elevationLiftPixels: 0,
    },
    raisedCellEntity: {
      terrainSurface: { x: 320, y: 160 },
      entityGroundContact: { x: 320, y: 144 },
      elevationLiftPixels: 16,
    },
  });
});

test("ramp boundaries share their plateau lift and runtime terrain layers preserve base-before-overlay order", () => {
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

  assertRuntimeTerrainLayerOrder();
});

function createK01TerrainRasterVector() {
  const map = createImjinrokMapScaffold("imjinrok-k01");
  assert.ok(map);
  const registry = createContentRegistry();
  let sharedGroundContactFlatCount = 0;
  let sharedGroundContactUnderlayCount = 0;
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
      assert.ok(underlay, `K01 cell ${x},${y} must resolve its source-art underlay`);

      const flatPlacement = resolveExplicitTileVisualPlacement(flat, terrainSurface, map.tileWidth, map.tileHeight);
      const underlayPlacement = resolveExplicitTileVisualPlacement(underlay, terrainSurface, map.tileWidth, map.tileHeight);
      assert.deepEqual(flatPlacement.position, terrainSurface, `K01 flat ${x},${y} must use shared ground contact`);
      assert.deepEqual(underlayPlacement.position, terrainSurface, `K01 underlay ${x},${y} must precede at shared ground contact`);
      sharedGroundContactFlatCount += 1;
      sharedGroundContactUnderlayCount += 1;

      if (flat.sourcePixelOffset.x === 0 && flat.sourcePixelOffset.y === 0) {
        zeroSourceOffsetCount += 1;
      }

      const bounds = resolveExplicitTileVisualWorldBounds(underlay, terrainSurface, map.tileWidth, map.tileHeight);
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
    sharedGroundContactUnderlayCount,
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

function assertRuntimeTerrainLayerOrder(): void {
  const scenePath = resolve(dirname(fileURLToPath(import.meta.url)), "../scenes/SkirmishScene.ts");
  const sceneSource = readFileSync(scenePath, "utf8");
  const terrainBakeStart = sceneSource.indexOf("this.redrawTerrain();");
  const elevationBakeStart = sceneSource.indexOf("this.redrawElevationOverlay();");
  assert.ok(terrainBakeStart >= 0 && elevationBakeStart > terrainBakeStart, "terrain must bake before elevation overlays");

  const terrainMethodStart = sceneSource.indexOf("  private redrawTerrain(): void {");
  const terrainMethodEnd = sceneSource.indexOf("\n  private redrawElevationOverlay(): void {", terrainMethodStart);
  assert.ok(terrainMethodStart >= 0 && terrainMethodEnd > terrainMethodStart, "terrain render method must remain isolated");
  const terrainMethod = sceneSource.slice(terrainMethodStart, terrainMethodEnd);
  const underlayDraw = terrainMethod.indexOf("this.drawExplicitTileVisual(renderTexture, { minX, minY }, explicitUnderlay");
  const flatDraw = terrainMethod.indexOf("this.drawExplicitTileVisual(renderTexture, { minX, minY }, explicitVisual");
  assert.ok(underlayDraw >= 0 && flatDraw > underlayDraw, "source-art underlay must draw before its selected flat frame");

  const elevationMethod = sceneSource.slice(terrainMethodEnd);
  const sourceReliefGuard = elevationMethod.indexOf("if (!elevation.rendersGenericElevation) {");
  const genericNeighborLookup = elevationMethod.indexOf("const neighbors = this.getElevationNeighbors(x, y);");
  assert.ok(sourceReliefGuard >= 0 && genericNeighborLookup > sourceReliefGuard, "source flat relief must skip generic elevation overlays");
}
