import assert from "node:assert/strict";
import test from "node:test";
import type { EntityVisual } from "@shared";
import {
  advanceEntityTerminalPlayback,
  createEntityTerminalPlayback,
  reconcileEntityRenderableIds,
  resolveEntityTerminalPresentation,
} from "./entityTerminalPresentation.js";

const deathVisual = (overrides: Partial<EntityVisual> = {}): Pick<EntityVisual, "id" | "states" | "terminalPresentation"> => ({
  id: "test-unit",
  terminalPresentation: { state: "death" },
  states: {
    death: {
      clips: {
        s: {
          frames: [
            { textureKey: "test", frameName: "death-0" },
            { textureKey: "test", frameName: "death-1" },
          ],
          fps: 10,
          loop: false,
        },
        e: {
          frames: [{ textureKey: "test", frameName: "death-east" }],
          fps: 10,
          loop: false,
          mirrorX: true,
        },
      },
    },
  },
  ...overrides,
});

test("terminal presentation selects the configured directional death frame without changing source state", () => {
  const visual = deathVisual();
  const terminal = resolveEntityTerminalPresentation(visual, "e");

  assert.equal(terminal?.key, "test-unit:death:e");
  assert.equal(terminal?.clip.frames[0]?.frameName, "death-east");
  assert.equal(terminal?.clip.mirrorX, true);
  assert.equal(terminal?.lifetimeMs, 100);
  assert.deepEqual(visual.states.death?.clips.e?.frames[0], { textureKey: "test", frameName: "death-east" });
});

test("terminal playback is one-shot, holds its final frame, and expires at its clip-derived lifetime", () => {
  const terminal = resolveEntityTerminalPresentation(deathVisual(), "s");
  assert.ok(terminal);

  const firstFrame = advanceEntityTerminalPlayback(createEntityTerminalPlayback(), terminal, 100);
  assert.deepEqual(firstFrame, { elapsedMs: 100, frameElapsedMs: 0, frameIndex: 1 });

  const heldFinalFrame = advanceEntityTerminalPlayback(firstFrame, terminal, 50);
  assert.deepEqual(heldFinalFrame, { elapsedMs: 150, frameElapsedMs: 50, frameIndex: 1 });
  assert.equal(advanceEntityTerminalPlayback(heldFinalFrame, terminal, 50), null);
});

test("unsupported terminal clips do not create a presentation or replay through a fallback state", () => {
  assert.equal(resolveEntityTerminalPresentation(deathVisual({ terminalPresentation: undefined }), "s"), null);
  assert.equal(resolveEntityTerminalPresentation(deathVisual({ terminalPresentation: { state: "idle" } }), "s"), null);
  assert.equal(resolveEntityTerminalPresentation(deathVisual({ states: { death: { clips: { s: { frames: [], fps: 10, loop: false } } } } }), "s"), null);
  assert.equal(resolveEntityTerminalPresentation(deathVisual({ states: { death: { clips: { s: { frames: [{ textureKey: "test" }], fps: 10, loop: true } } } } }), "s"), null);
});

test("renderable reconciliation detects in-place deletion without resurrecting units or replaying unchanged ids", () => {
  const renderedIds = Object.freeze(["zulu", "hidden", "dead", "reappeared"]);
  const authoritativeIds = new Set(["hidden", "reappeared"]);
  const visibleIds = new Set(["reappeared"]);

  assert.deepEqual(
    reconcileEntityRenderableIds(renderedIds, authoritativeIds, visibleIds),
    { retain: ["reappeared"], destroy: ["hidden"], terminal: ["dead", "zulu"] },
  );
  assert.deepEqual([...authoritativeIds].sort(), ["hidden", "reappeared"]);
  // Loaded-snapshot reset clears stale live renderables before forced sync, so
  // entities that existed only in the previous save cannot become tombstones.
  assert.deepEqual(
    reconcileEntityRenderableIds([], authoritativeIds, visibleIds),
    { retain: [], destroy: [], terminal: [] },
  );
});
