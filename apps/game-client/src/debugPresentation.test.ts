import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_DEBUG_PRESENTATION_STATE,
  clampGridViewportBounds,
  derivePaddedGridViewportBounds,
  mergeDebugPresentationRecords,
  readDebugPresentationState,
  resolveDebugPresentationVisibility,
  shouldRevealDebugPresentationFog,
  toggleDebugPresentation,
  writeDebugPresentationState,
} from "./debugPresentation.js";

test("debug presentation state is typed, conservative, and storage-safe", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
  assert.deepEqual(readDebugPresentationState(storage), DEFAULT_DEBUG_PRESENTATION_STATE);
  const next = toggleDebugPresentation(DEFAULT_DEBUG_PRESENTATION_STATE, "fogEnabled");
  assert.equal(shouldRevealDebugPresentationFog(next), true);
  const authoritative = { tile: "unexplored" };
  assert.equal(resolveDebugPresentationVisibility(next, authoritative, { tile: "visible" }).tile, "visible");
  assert.equal(authoritative.tile, "unexplored");
  writeDebugPresentationState(storage, next);
  assert.deepEqual(readDebugPresentationState(storage), next);
  values.set("isorts.debug.presentation.v1", "not json");
  assert.deepEqual(readDebugPresentationState(storage), DEFAULT_DEBUG_PRESENTATION_STATE);
  assert.deepEqual(readDebugPresentationState({ getItem: () => { throw new Error("blocked"); }, setItem: () => undefined }), DEFAULT_DEBUG_PRESENTATION_STATE);
  assert.doesNotThrow(() => writeDebugPresentationState({ getItem: () => null, setItem: () => { throw new Error("blocked"); } }, next));
});

test("debug wireframe bounds cull and clamp without accepting invalid maps", () => {
  assert.deepEqual(clampGridViewportBounds({ minX: -2, maxX: 8.2, minY: 3.1, maxY: 20 }, 8, 10), { minX: 0, maxX: 7, minY: 3, maxY: 9 });
  assert.equal(clampGridViewportBounds({ minX: 1, maxX: 2, minY: 1, maxY: 2 }, 0, 10), null);
});

test("wireframe culling includes both isometric side wedges, not only diagonal corners", () => {
  const upperLeft = { x: 4, y: 4 };
  const upperRight = { x: 9, y: 1 };
  const lowerRight = { x: 6, y: 6 };
  const lowerLeft = { x: 1, y: 9 };
  const twoCornerBounds = derivePaddedGridViewportBounds([upperLeft, lowerRight], 0, 12, 12);
  const allCornerBounds = derivePaddedGridViewportBounds([upperLeft, upperRight, lowerRight, lowerLeft], 0, 12, 12);
  assert.deepEqual(twoCornerBounds, { minX: 4, maxX: 6, minY: 4, maxY: 6 });
  assert.deepEqual(allCornerBounds, { minX: 1, maxX: 9, minY: 1, maxY: 9 });
  assert.equal(allCornerBounds?.maxX, 9, "upper-right wedge must remain in the cull bounds");
  assert.equal(allCornerBounds?.maxY, 9, "lower-left wedge must remain in the cull bounds");
});

test("fog-off resource presentation is transient and does not teach discovery memory", () => {
  const remembered = [{ id: "seen-rice" }];
  const mapResources = [...remembered, { id: "unseen-gold" }];
  const revealed = mergeDebugPresentationRecords(true, remembered, mapResources, (resource) => resource.id);
  assert.deepEqual(revealed.map((resource) => resource.id), ["seen-rice", "unseen-gold"]);
  assert.deepEqual(remembered.map((resource) => resource.id), ["seen-rice"]);
  const restored = mergeDebugPresentationRecords(false, remembered, mapResources, (resource) => resource.id);
  assert.deepEqual(restored.map((resource) => resource.id), ["seen-rice"]);
});
