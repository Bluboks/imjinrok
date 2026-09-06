import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  extractSourceBuildingPlacementEvidence,
  replaySourceBuildingPlacement,
} from "./extract-source-building-placement-evidence.mjs";

const fixturePath = resolve("analysis/fixtures/source-building-placement-evidence.json");

test("extracts the hash-bound source building placement contract", () => {
  const fixture = readFileSync(fixturePath, "utf8");
  const first = `${JSON.stringify(extractSourceBuildingPlacementEvidence(), null, 2)}\n`;
  const second = `${JSON.stringify(extractSourceBuildingPlacementEvidence(), null, 2)}\n`;
  const report = JSON.parse(first);

  assert.equal(first, second);
  assert.equal(report.source.executableSha256, "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e");
  assert.equal(report.functionEvidence.length, 5);
  assert.equal(report.byteAnchors.length, 11);
  assert.deepEqual(report.vectors.map(({ id, result }) => ({ id, farCell: result.farCell })), [
    { id: "3x3-far-cell", farCell: { x: 6, y: 5 } },
    { id: "3x2-far-cell", farCell: { x: 6, y: 4 } },
    { id: "2x2-far-cell", farCell: { x: 5, y: 4 } },
    { id: "1x1-far-cell", farCell: { x: 5, y: 4 } },
    { id: "centered-pivot-with-runtime-offsets", farCell: { x: 6, y: 5 } },
    { id: "type-offset-pivot-with-runtime-offsets", farCell: { x: 6, y: 5 } },
    { id: "cached-far-cell", farCell: { x: 6, y: 5 } },
  ]);
  assert.match(report.pivotBoundary, /\+0x1e3\/\+0x1e4 are occupied-cell extents/u);
  assert.deepEqual(report.vectors.find(({ id }) => id === "3x3-far-cell")?.result.output, { screenX: 935, screenY: 1869 });
  assert.deepEqual(report.vectors.find(({ id }) => id === "centered-pivot-with-runtime-offsets")?.result.output, { screenX: -403, screenY: 176 });
  assert.deepEqual(report.vectors.find(({ id }) => id === "type-offset-pivot-with-runtime-offsets")?.result.output, { screenX: -403, screenY: 121 });
  assert.deepEqual(report.vectors.find(({ id }) => id === "cached-far-cell")?.result.output, { screenX: 268, screenY: -353 });
  assert.equal(fixture, `${JSON.stringify(JSON.parse(fixture), null, 2)}\n`);
});

test("replays signed runtime offsets and preserves native signed WORD output", () => {
  const result = replaySourceBuildingPlacement({
    operation: "place",
    input: {
      x: 32767,
      y: -32768,
      width: 1,
      height: 1,
      pixelWidth: 1,
      pixelHeight: 1,
      runtimeOffsetX: 32767,
      runtimeOffsetY: -32768,
      signedByte16: 127,
      typeOffset: -32768,
      flags: 0,
      viewportProjected: { x: 32767, y: -32768 },
    },
  });

  assert.deepEqual(result.output, { screenX: -2, screenY: -32642 });
});

test("rejects non-positive native pixel dimensions and non-positive extents", () => {
  const input = {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    pixelWidth: 32,
    pixelHeight: 16,
    runtimeOffsetX: 0,
    runtimeOffsetY: 0,
    signedByte16: 0,
    typeOffset: 0,
    flags: 0,
    viewportProjected: { x: 0, y: 0 },
  };
  assert.throws(() => replaySourceBuildingPlacement({ operation: "place", input: { ...input, pixelWidth: 0 } }), /pixelWidth must be positive/u);
  assert.throws(() => replaySourceBuildingPlacement({ operation: "place", input: { ...input, width: 0 } }), /width must be a positive/u);
  assert.throws(() => replaySourceBuildingPlacement({ operation: "place", input: { ...input, x: 32767, width: 3 } }), /farCell\.x must be a signed WORD/u);
  assert.throws(() => replaySourceBuildingPlacement({ operation: "place", input: { ...input, projectionPath: "unknown" } }), /unsupported projection path/u);
});
