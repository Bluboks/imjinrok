import assert from "node:assert/strict";
import test from "node:test";

import {
  IMJINROK_CLASSIC_MAIN_MENU_GEOMETRY,
  getMainMenuSourcePoint,
  projectMainMenuSourcePoint,
  projectMainMenuSourceRect,
  resolveMainMenuCanvasLayout,
  scaleMainMenuSourceMetric,
} from "./mainMenuLayout.js";

test("main menu keeps the 640 by 480 source canvas uniform and letterboxed", () => {
  assert.deepEqual(
    resolveMainMenuCanvasLayout(640, 480, IMJINROK_CLASSIC_MAIN_MENU_GEOMETRY),
    {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      canvas: { x: 0, y: 0, width: 640, height: 480 },
    },
  );
  assert.deepEqual(
    resolveMainMenuCanvasLayout(1280, 720, IMJINROK_CLASSIC_MAIN_MENU_GEOMETRY),
    {
      scale: 1.5,
      offsetX: 160,
      offsetY: 0,
      canvas: { x: 160, y: 0, width: 960, height: 720 },
    },
  );
});

test("main menu projects source art and hit regions through the same transform", () => {
  const layout = resolveMainMenuCanvasLayout(
    960,
    960,
    IMJINROK_CLASSIC_MAIN_MENU_GEOMETRY,
  );
  const rect = projectMainMenuSourceRect(
    layout,
    IMJINROK_CLASSIC_MAIN_MENU_GEOMETRY.projectAdaptationHitRects.main.scenario,
  );

  assert.deepEqual(rect, { x: 696, y: 165, width: 219, height: 147 });
  assert.deepEqual(getMainMenuSourcePoint(layout, { x: 805.5, y: 238.5 }), {
    x: 537,
    y: 79,
  });
  assert.equal(getMainMenuSourcePoint(layout, { x: 10, y: 10 }), null);
});

test("main menu preserves pointer source coordinates through a letterboxed non-integer scale", () => {
  const layout = resolveMainMenuCanvasLayout(
    1280,
    577,
    IMJINROK_CLASSIC_MAIN_MENU_GEOMETRY,
  );
  const projected = projectMainMenuSourceRect(
    layout,
    IMJINROK_CLASSIC_MAIN_MENU_GEOMETRY.projectAdaptationHitRects.main.scenario,
  );
  const restored = getMainMenuSourcePoint(layout, {
    x: projected.x + projected.width / 2,
    y: projected.y + projected.height / 2,
  });

  assert.equal(layout.offsetX > 0, true);
  assert.ok(restored);
  assert.ok(Math.abs(restored.x - 537) < Number.EPSILON * 1024);
  assert.ok(Math.abs(restored.y - 79) < Number.EPSILON * 1024);
});

test("screen-space companions use the source-art projection without inheriting container scaling", () => {
  const hdLayout = resolveMainMenuCanvasLayout(
    1280,
    720,
    IMJINROK_CLASSIC_MAIN_MENU_GEOMETRY,
  );
  assert.deepEqual(projectMainMenuSourcePoint(hdLayout, { x: 305, y: 380 }), {
    x: 617.5,
    y: 570,
  });
  assert.equal(scaleMainMenuSourceMetric(hdLayout, 12), 18);

  const ultrawideLayout = resolveMainMenuCanvasLayout(
    3440,
    1440,
    IMJINROK_CLASSIC_MAIN_MENU_GEOMETRY,
  );
  assert.deepEqual(
    projectMainMenuSourcePoint(ultrawideLayout, { x: 305, y: 380 }),
    { x: 1675, y: 1140 },
  );
  assert.equal(scaleMainMenuSourceMetric(ultrawideLayout, 12), 36);
});

test("main menu rejects invalid viewport dimensions", () => {
  assert.throws(
    () =>
      resolveMainMenuCanvasLayout(0, 480, IMJINROK_CLASSIC_MAIN_MENU_GEOMETRY),
    /viewportWidth/,
  );
  assert.throws(
    () =>
      resolveMainMenuCanvasLayout(
        640,
        Number.NaN,
        IMJINROK_CLASSIC_MAIN_MENU_GEOMETRY,
      ),
    /viewportHeight/,
  );
});

test("a remastered logical canvas is not forced through the classic 640 by 480 profile", () => {
  const remastered = {
    ...IMJINROK_CLASSIC_MAIN_MENU_GEOMETRY,
    logicalWidth: 1920,
    logicalHeight: 1080,
  };

  assert.deepEqual(resolveMainMenuCanvasLayout(1920, 1200, remastered), {
    scale: 1,
    offsetX: 0,
    offsetY: 60,
    canvas: { x: 0, y: 60, width: 1920, height: 1080 },
  });
});
