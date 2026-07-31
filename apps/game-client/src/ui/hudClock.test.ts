import assert from "node:assert/strict";
import test from "node:test";
import { boundsOverlap, resolveHudClockHandAngles, resolveMinimapHudAncillaryLayout } from "./hudClock.js";

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

test("HUD clock hand adapter derives only from normalized simulation day progress", () => {
  assert.deepEqual(resolveHudClockHandAngles(0), { hourDegrees: 0, minuteDegrees: 0 });
  assert.deepEqual(resolveHudClockHandAngles(0.25), { hourDegrees: 90, minuteDegrees: 0 });
  assert.deepEqual(resolveHudClockHandAngles(0.5), { hourDegrees: 180, minuteDegrees: 0 });
  assert.deepEqual(resolveHudClockHandAngles(1), { hourDegrees: 0, minuteDegrees: 0 });
  assert.deepEqual(resolveHudClockHandAngles(Number.NaN), { hourDegrees: 0, minuteDegrees: 0 });
});
