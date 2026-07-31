import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  boundsOverlap,
  ORIGINAL_SOURCE_CLOCK_FRAME_ASSETS,
  resolveMinimapHudAncillaryLayout,
  resolveSourceClockFrameIndex,
} from "./hudClock.js";
import { resolveMinimapZoomRailLayout } from "./minimapZoom.js";

test("HUD clock is minimap-relative and leaves the left zoom rail unused", () => {
  for (const minimapBounds of [
    { x: 16, y: 302, width: 190, height: 136 },
    { x: 16, y: 584, width: 280, height: 178 },
  ]) {
    const layout = resolveMinimapHudAncillaryLayout(minimapBounds);
    assert.equal(boundsOverlap(layout.clockBounds, layout.zoomRailBounds), false);
    assert.equal(layout.clockBounds.x + layout.clockBounds.width <= minimapBounds.x + minimapBounds.width, true);
    assert.equal(layout.clockBounds.y + layout.clockBounds.height <= minimapBounds.y + minimapBounds.height, true);
    assert.equal(layout.zoomRailBounds.x >= minimapBounds.x, true);
    assert.equal(layout.zoomRailBounds.y >= minimapBounds.y, true);
  }
});

test("HUD clock does not overlap either minimap zoom control", () => {
  for (const minimapBounds of [
    { x: 16, y: 302, width: 190, height: 136 },
    { x: 16, y: 584, width: 280, height: 178 },
  ]) {
    const { clockBounds } = resolveMinimapHudAncillaryLayout(minimapBounds);
    const zoomRail = resolveMinimapZoomRailLayout(minimapBounds);

    assert.equal(boundsOverlap(clockBounds, zoomRail.increase), false);
    assert.equal(boundsOverlap(clockBounds, zoomRail.decrease), false);
  }
});

test("HUD clock adapter cycles only the nonblank source frame subset from simulation progress", () => {
  assert.deepEqual(ORIGINAL_SOURCE_CLOCK_FRAME_ASSETS.map((asset) => asset.sourceFrameIndex), Array.from({ length: 16 }, (_value, index) => index));
  assert.equal(resolveSourceClockFrameIndex(0), 0);
  assert.equal(resolveSourceClockFrameIndex(0.0625), 1);
  assert.equal(resolveSourceClockFrameIndex(0.25), 4);
  assert.equal(resolveSourceClockFrameIndex(0.9999), 15);
  assert.equal(resolveSourceClockFrameIndex(1), 0);
  assert.equal(resolveSourceClockFrameIndex(Number.NaN), 0);
});

test("UIScene preloads one source texture per selectable frame and reuses one non-interactive image", () => {
  const sceneSource = readFileSync(resolve("apps/game-client/src/scenes/UIScene.ts"), "utf8");

  assert.match(sceneSource, /for \(const asset of ORIGINAL_SOURCE_CLOCK_FRAME_ASSETS\) \{\s+if \(!this\.textures\.exists\(asset\.textureKey\)\) \{\s+this\.load\.image\(asset\.textureKey, asset\.assetPath\);/u);
  assert.match(sceneSource, /private minimapClockImage: Phaser\.GameObjects\.Image \| null = null;/u);
  assert.match(sceneSource, /\.image\(clockBounds\.x, clockBounds\.y, ORIGINAL_SOURCE_CLOCK_FRAME_ASSETS\[0\]!\.textureKey\)/u);
  assert.match(sceneSource, /image\.setTexture\(resolveSourceClockFrame\(environment\.timeOfDay01\)\.textureKey\);/u);
  assert.doesNotMatch(sceneSource, /drawHudClock/u);
});
