import assert from "node:assert/strict";
import test from "node:test";
import { createBlankMap, resolveElevationTerrainSlot } from "@shared";
import {
  resolveTerrainElevationOverlayLiftPixels,
  resolveTerrainElevationPresentation,
  resolveTerrainElevationStepHeight,
  shouldRenderSourceFogComposite,
} from "./terrainElevationPresentation.js";

test("terrain cells consume the shared nearest elevation profile lift", () => {
  const map = createBlankMap({ width: 2, height: 1, tileHeight: 48 });
  const elevated = map.layers[0]?.tiles[1];
  assert.ok(elevated);
  elevated.elevation = 2;
  map.elevationProfile = { stepHeight: 18, sampling: "bilinear" };

  assert.equal(resolveTerrainElevationStepHeight(map), 18);
  assert.deepEqual(resolveTerrainElevationPresentation(map, { x: 1, y: 0 }), {
    level: 2,
    liftPixels: 36,
    rendersGenericElevation: true,
  });
});

test("ramp and corner overlays use the next shared elevation step above their cell", () => {
  const presentation = { level: 1, liftPixels: 18, rendersGenericElevation: true };

  assert.equal(resolveTerrainElevationOverlayLiftPixels(presentation, "plateauTop", 18), 18);
  assert.equal(resolveTerrainElevationOverlayLiftPixels(presentation, "ramp_ne", 18), 36);
  assert.throws(
    () => resolveTerrainElevationOverlayLiftPixels(presentation, "ramp_ne", 0),
    /finite and positive/u,
  );
  assert.throws(
    () => resolveTerrainElevationOverlayLiftPixels({ liftPixels: Number.NaN }, "plateauTop", 18),
    /non-negative finite pixel value; received NaN/u,
  );
});

test("adjacent plateau and ramp boundaries share the custom elevation profile step", () => {
  const map = createBlankMap({ width: 2, height: 1, tileHeight: 48 });
  const raisedTile = map.layers[0]?.tiles[1];
  assert.ok(raisedTile);
  raisedTile.elevation = 1;
  map.elevationProfile = { stepHeight: 18 };

  const lower = resolveTerrainElevationPresentation(map, { x: 0, y: 0 });
  const raised = resolveTerrainElevationPresentation(map, { x: 1, y: 0 });
  const rampSlot = resolveElevationTerrainSlot(0, [{ dx: 1, dy: 0, elevation: 1 }]);

  assert.equal(rampSlot, "ramp_nw");
  assert.equal(resolveTerrainElevationOverlayLiftPixels(lower, rampSlot, 18), 18);
  assert.equal(resolveTerrainElevationOverlayLiftPixels(raised, "plateauTop", 18), 18);
});

test("source flat artwork with embedded relief keeps coverage while skipping generic overlays", () => {
  const map = createBlankMap({ width: 1, height: 1 });
  const tile = map.layers[0]?.tiles[0];
  assert.ok(tile);
  tile.elevation = 1;
  tile.tilesetVisuals = { flatArtworkEmbedsRelief: true };

  const presentation = resolveTerrainElevationPresentation(map, { x: 0, y: 0 });
  assert.deepEqual(presentation, {
    level: 1,
    liftPixels: map.tileHeight / 2,
    rendersGenericElevation: false,
  });
  assert.equal(shouldRenderSourceFogComposite(presentation), true);
  assert.equal(shouldRenderSourceFogComposite({ level: 1, rendersGenericElevation: true }), false);
});

test("terrain presentation rejects fractional and out-of-bounds cell inputs", () => {
  const map = createBlankMap({ width: 1, height: 1 });

  assert.throws(
    () => resolveTerrainElevationPresentation(map, { x: 0.5, y: 0 }),
    /in-bounds integer cell/u,
  );
  assert.throws(
    () => resolveTerrainElevationPresentation(map, { x: 1, y: 0 }),
    /in-bounds integer cell/u,
  );
});
