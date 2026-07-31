import assert from "node:assert/strict";
import test from "node:test";
import {
  MINIMAP_ZOOM_MAX,
  MINIMAP_ZOOM_MIN,
  MINIMAP_ZOOM_PRESETS,
  formatMinimapZoomPercent,
  resolveAdjacentMinimapZoomPreset,
  resolveMinimapZoomRailLayout,
} from "./minimapZoom.js";

test("minimap zoom presets cover the 50% through 200% tactical range", () => {
  assert.deepEqual(MINIMAP_ZOOM_PRESETS, [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);
  assert.equal(MINIMAP_ZOOM_MIN, 0.5);
  assert.equal(MINIMAP_ZOOM_MAX, 2);
});

test("preset controls move strictly beyond exact and continuous zoom values", () => {
  assert.equal(resolveAdjacentMinimapZoomPreset(1, 1), 1.25);
  assert.equal(resolveAdjacentMinimapZoomPreset(1, -1), 0.75);
  assert.equal(resolveAdjacentMinimapZoomPreset(1.11, 1), 1.25);
  assert.equal(resolveAdjacentMinimapZoomPreset(1.11, -1), 1);
  assert.equal(resolveAdjacentMinimapZoomPreset(0.75, -1), 0.5);
});

test("preset controls report disabled boundaries and zoom text reflects the live value", () => {
  assert.equal(resolveAdjacentMinimapZoomPreset(MINIMAP_ZOOM_MIN, -1), null);
  assert.equal(resolveAdjacentMinimapZoomPreset(MINIMAP_ZOOM_MAX, 1), null);
  assert.equal(formatMinimapZoomPercent(0.5), "50%");
  assert.equal(formatMinimapZoomPercent(1.25), "125%");
  assert.equal(formatMinimapZoomPercent(1.137), "114%");
});

test("zoom rail layout remains local to resized minimap bounds", () => {
  const compact = resolveMinimapZoomRailLayout({ x: 16, y: 310, width: 190, height: 136 });
  const wide = resolveMinimapZoomRailLayout({ x: 24, y: 420, width: 280, height: 178 });

  assert.deepEqual(compact.increase, { x: 24, y: 350, width: 24, height: 24 });
  assert.equal(compact.decrease.y, 414);
  assert.equal(wide.increase.x, 32);
  assert.equal(wide.increase.y, 460);
  assert.equal(wide.decrease.y, 564);
  assert.ok(wide.decrease.y > wide.increase.y);
});
