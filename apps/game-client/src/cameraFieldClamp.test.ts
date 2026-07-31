import test from "node:test";
import assert from "node:assert/strict";
import { clampCameraCenterToWorldField } from "./cameraFieldClamp";

const cameraViewport = { x: 0, y: 0, width: 1280, height: 577, originX: 0.5, originY: 0.5 };
const fieldViewport = { x: 0, y: 0, width: 1280, height: 399 };

test("keeps a fitting field viewport inside the world at its right and bottom edges", () => {
  assert.deepEqual(
    clampCameraCenterToWorldField({
      cameraCenter: { x: 9_999, y: 9_999 },
      worldBounds: { x: 100, y: 200, width: 4_000, height: 2_000 },
      cameraViewport,
      fieldViewport,
      zoom: 1,
    }),
    { x: 3_460, y: 2_089.5 },
  );
});

test("uses the zoomed world extent instead of the screen-pixel extent", () => {
  assert.deepEqual(
    clampCameraCenterToWorldField({
      cameraCenter: { x: -999, y: -999 },
      worldBounds: { x: 100, y: 200, width: 4_000, height: 2_000 },
      cameraViewport,
      fieldViewport,
      zoom: 2,
    }),
    { x: 420, y: 344.25 },
  );
});

test("centers an oversized playable field instead of oscillating at a world edge", () => {
  assert.deepEqual(
    clampCameraCenterToWorldField({
      cameraCenter: { x: 4_000, y: -2_000 },
      worldBounds: { x: 10, y: 20, width: 100, height: 100 },
      cameraViewport: { x: 0, y: 0, width: 200, height: 120, originX: 0.5, originY: 0.5 },
      fieldViewport: { x: 0, y: 0, width: 200, height: 90 },
      zoom: 1,
    }),
    { x: 60, y: 80 },
  );
});

test("centers independently on a degenerate world axis", () => {
  assert.deepEqual(
    clampCameraCenterToWorldField({
      cameraCenter: { x: 500, y: 500 },
      worldBounds: { x: 40, y: 50, width: 0, height: 1_000 },
      cameraViewport: { x: 0, y: 0, width: 100, height: 100, originX: 0.5, originY: 0.5 },
      fieldViewport: { x: 0, y: 0, width: 80, height: 60 },
      zoom: 1,
    }),
    { x: 50, y: 500 },
  );
});
