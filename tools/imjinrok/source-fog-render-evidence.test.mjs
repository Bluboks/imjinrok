import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  extractSourceFogRenderEvidence,
  lookupFogNeighborMask,
  reproduceFogCallerProjection,
  reproduceFogCompositorPlacement,
  reproduceFogSubframeIndices,
} from "./extract-source-fog-render-evidence.mjs";

const fixturePath = resolve("analysis/fixtures/source-fog-render-evidence.json");
const executablePath = resolve("original/imjinrok2/imjinrok2.exe");
const normalTileDirectory = resolve("original/imjinrok2/tile/normal");
const k01MapPath = resolve("original/imjinrok2/stagemap/k01.map");

test("extracts the hash-bound source fog render contract byte-identically", () => {
  const fixture = readFileSync(fixturePath, "utf8");
  const first = `${JSON.stringify(extractSourceFogRenderEvidence(), null, 2)}\n`;
  const second = `${JSON.stringify(extractSourceFogRenderEvidence(), null, 2)}\n`;
  assert.equal(first, fixture);
  assert.equal(second, fixture);

  const report = JSON.parse(first);
  assert.deepEqual(report.neighborLookup.vectors, [
    { input: 0, output: 0 }, { input: 1, output: 9 }, { input: 2, output: 8 }, { input: 3, output: 2 },
    { input: 4, output: 10 }, { input: 5, output: 1 }, { input: 6, output: 12 }, { input: 7, output: 5 },
    { input: 8, output: 11 }, { input: 9, output: 13 }, { input: 10, output: 3 }, { input: 11, output: 6 },
    { input: 12, output: 0 }, { input: 13, output: 4 }, { input: 14, output: 7 }, { input: 15, output: 0 },
  ]);
  assert.deepEqual(report.resources.fog.map(({ resourceIndex, fileName, header }) => [resourceIndex, fileName, header]), Array.from({ length: 15 }, (_value, index) => [60 + index, `fog${index}.spr`, { width: 32, height: 16, frameCount: 96, atlasWidth: 1024, atlasHeight: 48 }]));
  assert.deepEqual(report.resources.black, { resourceIndex: 75, recordAddress: "0x00c061a0", fileName: "black.spr", sourcePath: "original/imjinrok2/tile/normal/black.spr", sha256: "9ef53a565bfe804e8a272f73f9749c05681b6b9e3af4090f7e4eea61237292d0", header: { width: 64, height: 32, frameCount: 1 } });
  assert.deepEqual(report.composition.subframeGrid, { columns: 3, rows: 2, subframeCount: 6 });
  assert.deepEqual(report.callerContract.separateNeighborStateValues, [4, 8]);
  assert.deepEqual(report.callerContract.argumentOrder, ["projectedX", "projectedY", "cellX", "cellY", "literalState", "lookupSelector"]);
  assert.deepEqual(report.callerContract.projection.callerRange, { label: "FUN_00468600 caller range within FUN_00467de0", address: "0x00468600" });
  assert.deepEqual(report.callerContract.projection.syntheticVectors, [
    {
      input: { x: 3, y: 5, cameraX: 1, cameraY: 2, viewportLeft: 10, viewportRight: 109, viewportTop: 20, viewportBottom: 79 },
      output: { projectedX: 28, projectedY: 130 },
    },
    {
      input: { x: -2, y: 4, cameraX: -3, cameraY: 5, viewportLeft: -100, viewportRight: 100, viewportTop: -50, viewportBottom: 50 },
      output: { projectedX: 64, projectedY: 0 },
    },
  ]);
  assert.deepEqual(report.placement.syntheticVectors, [
    {
      input: { projectedX: 200, projectedY: 100, x: 2, y: 3, lowNibble: 2, helperReturn: 3 },
      output: { x: 2, y: 3, lowNibble: 2, helperReturn: 3, placementBranch: "low-nibble-equals-2", verticalShift: 48, drawLeft: 168, drawTop: 52 },
    },
    {
      input: { projectedX: 200, projectedY: 100, x: 2, y: 3, lowNibble: 1, helperReturn: -1 },
      output: { x: 2, y: 3, lowNibble: 1, helperReturn: -1, placementBranch: "other-low-nibble", verticalShift: 32, drawLeft: 168, drawTop: 68 },
    },
  ]);
  assert.deepEqual(report.placement.k01.allCellDistribution, {
    cellCount: 3600,
    helperReturn: { 0: 1639, 1: 616, 2: 1115, 3: 74, 4: 156 },
    lowNibble: { 1: 735, 2: 2865 },
    verticalShift: { 0: 1331, 16: 617, 32: 1335, 48: 128, 64: 189 },
    streamSha256: "f76633cb3803d2293fab5d19e2b9ba2966e4307e2189b61101740f35de4dff81",
  });
  assert.deepEqual(report.placement.localCompositePlacement, {
    compositeSize: { width: 64, height: 48 },
    imageAnchor: { x: 32, y: 0 },
    formula: "drawLeft = projectedX - 32; drawTop = projectedY - rawVerticalShift",
    K01RawVerticalShift: "derived per cell by the branch formulas above; observed values are 0, 16, 32, 48, and 64",
    boundary: "This caller/callee-local image anchor does not assign renderer-wide pivot semantics, viewport ownership, clip/mode, alpha/blend, or web placement policy.",
  });
  assert.deepEqual(report.placement.k01.vectors.map(({ input, projection, draw }) => ({ input, projection, draw })), [
    {
      input: { x: 0, y: 0, cameraX: 13, cameraY: 8, viewportLeft: 0, viewportRight: 639, viewportTop: 0, viewportBottom: 479 },
      projection: { projectedX: 160, projectedY: -96 },
      draw: { x: 0, y: 0, lowNibble: 1, helperReturn: 1, placementBranch: "other-low-nibble", verticalShift: 32, drawLeft: 128, drawTop: -128 },
    },
    {
      input: { x: 0, y: 1, cameraX: 13, cameraY: 8, viewportLeft: 0, viewportRight: 639, viewportTop: 0, viewportBottom: 479 },
      projection: { projectedX: 128, projectedY: -80 },
      draw: { x: 0, y: 1, lowNibble: 2, helperReturn: 2, placementBranch: "low-nibble-equals-2", verticalShift: 32, drawLeft: 96, drawTop: -112 },
    },
    {
      input: { x: 6, y: 6, cameraX: 13, cameraY: 8, viewportLeft: 0, viewportRight: 639, viewportTop: 0, viewportBottom: 479 },
      projection: { projectedX: 160, projectedY: 96 },
      draw: { x: 6, y: 6, lowNibble: 2, helperReturn: 2, placementBranch: "low-nibble-equals-2", verticalShift: 32, drawLeft: 128, drawTop: 64 },
    },
    {
      input: { x: 59, y: 59, cameraX: 13, cameraY: 8, viewportLeft: 0, viewportRight: 639, viewportTop: 0, viewportBottom: 479 },
      projection: { projectedX: 160, projectedY: 1792 },
      draw: { x: 59, y: 59, lowNibble: 2, helperReturn: 4, placementBranch: "low-nibble-equals-2", verticalShift: 64, drawLeft: 128, drawTop: 1728 },
    },
  ]);
  assert.deepEqual(report.callEdges, [
    { from: "0x00468864", to: "0x0046a530", bytes: "e8 c7 1c 00 00", label: "state-4 caller dispatch" },
    { from: "0x00468982", to: "0x0046a530", bytes: "e8 a9 1b 00 00", label: "state-8 caller dispatch" },
    { from: "0x0046a591", to: "0x0046d650", bytes: "e8 ba 30 00 00", label: "low-nibble-equals-2 placement helper" },
    { from: "0x0046a5a9", to: "0x0046d650", bytes: "e8 a2 30 00 00", label: "other-low-nibble placement helper" },
  ]);
  assert.deepEqual(report.frameSelection.vectors, [
    { selector: 0, frames: [0, 1, 32, 33, 64, 65] },
    { selector: 9, frames: [18, 19, 50, 51, 82, 83] },
    { selector: 13, frames: [26, 27, 58, 59, 90, 91] },
  ]);
  assert.deepEqual(report.frameSelection.callerSelectorDomain, Array.from({ length: 14 }, (_value, index) => index));
  assert.deepEqual(report.resources.k01FamilyBytes, {
    scope: "K01 hash-bound map bytes only; this neither identifies the runtime producer nor generalizes to other maps.",
    mapOffset: "0x4a0c4",
    coordinateStorage: "map + 0x4a0c4 + x * 180 + y",
    dimensions: { width: 60, height: 60 },
    cellCount: 3600,
    valueStreamSha256: "7a9fcc150cf0128af19d57f742a6c160c6b5b8b003a81c069fb3167427208f88",
    domain: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14],
    distribution: [
      { value: 0, count: 2865 }, { value: 1, count: 95 }, { value: 2, count: 95 }, { value: 3, count: 101 },
      { value: 4, count: 79 }, { value: 5, count: 38 }, { value: 6, count: 36 }, { value: 7, count: 54 },
      { value: 8, count: 61 }, { value: 9, count: 52 }, { value: 10, count: 33 }, { value: 11, count: 35 },
      { value: 12, count: 55 }, { value: 14, count: 1 },
    ],
  });
});

test("reproduces the byte-proven six-subframe selector formula only for caller-reachable selectors", () => {
  assert.deepEqual(reproduceFogSubframeIndices(0), [0, 1, 32, 33, 64, 65]);
  assert.deepEqual(reproduceFogSubframeIndices(9), [18, 19, 50, 51, 82, 83]);
  assert.deepEqual(reproduceFogSubframeIndices(13), [26, 27, 58, 59, 90, 91]);
  assert.throws(() => reproduceFogSubframeIndices(-1), /0\.\.13/u);
  assert.throws(() => reproduceFogSubframeIndices(14), /0\.\.13/u);
  assert.throws(() => reproduceFogSubframeIndices(1.5), /0\.\.13/u);
});

test("lookup helper accepts only the byte-proven table domain", () => {
  assert.equal(lookupFogNeighborMask(0), 0);
  assert.equal(lookupFogNeighborMask(13), 4);
  assert.equal(lookupFogNeighborMask(15), 0);
  assert.throws(() => lookupFogNeighborMask(-1), /0\.\.15/u);
  assert.throws(() => lookupFogNeighborMask(16), /0\.\.15/u);
  assert.throws(() => lookupFogNeighborMask(1.5), /0\.\.15/u);
});

test("reproduces caller projection and compositor placement for synthetic and K01-reachable branches", () => {
  assert.deepEqual(
    reproduceFogCallerProjection({ x: 3, y: 5, cameraX: 1, cameraY: 2, viewportLeft: 10, viewportRight: 109, viewportTop: 20, viewportBottom: 79 }),
    { projectedX: 28, projectedY: 130 },
  );
  assert.deepEqual(
    reproduceFogCompositorPlacement({ projectedX: 200, projectedY: 100, x: 2, y: 3, lowNibble: 2, helperReturn: 3 }),
    { x: 2, y: 3, lowNibble: 2, helperReturn: 3, placementBranch: "low-nibble-equals-2", verticalShift: 48, drawLeft: 168, drawTop: 52 },
  );
  assert.deepEqual(
    reproduceFogCompositorPlacement({ projectedX: 200, projectedY: 100, x: 2, y: 3, lowNibble: 1, helperReturn: -1 }),
    { x: 2, y: 3, lowNibble: 1, helperReturn: -1, placementBranch: "other-low-nibble", verticalShift: 32, drawLeft: 168, drawTop: 68 },
  );
  assert.deepEqual(
    reproduceFogCompositorPlacement({ projectedX: 160, projectedY: -96, x: 0, y: 0, lowNibble: 1, helperReturn: 0 }),
    { x: 0, y: 0, lowNibble: 1, helperReturn: 0, placementBranch: "other-low-nibble", verticalShift: 16, drawLeft: 128, drawTop: -112 },
  );
});

test("caller and compositor reproducers fail closed for malformed or outside-contract inputs", () => {
  assert.throws(() => reproduceFogCallerProjection({ x: 0.5, y: 0, cameraX: 0, cameraY: 0, viewportLeft: 0, viewportRight: 1, viewportTop: 0, viewportBottom: 1 }), /signed 16-bit/u);
  assert.throws(() => reproduceFogCallerProjection({ x: 0, y: 0, cameraX: 0, cameraY: 0, viewportLeft: 2, viewportRight: 1, viewportTop: 0, viewportBottom: 1 }), /viewport bounds/u);
  assert.throws(() => reproduceFogCallerProjection({ x: 0, y: 0, cameraX: 0, cameraY: 0, viewportLeft: 0, viewportRight: 0x80000000, viewportTop: 0, viewportBottom: 1 }), /signed 32-bit/u);
  assert.throws(() => reproduceFogCompositorPlacement({ projectedX: 0, projectedY: 0, x: 0, y: 0, lowNibble: 16, helperReturn: 0 }), /0\.\.15/u);
  assert.throws(() => reproduceFogCompositorPlacement({ projectedX: 0, projectedY: 0, x: 0, y: 0, lowNibble: 2, helperReturn: 0x8000 }), /signed 16-bit/u);
});

test("rejects a changed original executable before emitting evidence", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "source-fog-render-evidence-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const alteredExecutable = join(directory, "imjinrok2.exe");
  const bytes = readFileSync(executablePath);
  bytes[0x000bf9c4] ^= 0xff;
  writeFileSync(alteredExecutable, bytes);
  assert.throws(() => extractSourceFogRenderEvidence({ executablePath: alteredExecutable }), /SHA-256 mismatch/u);
});

test("rejects a fog atlas-header mutation before emitting evidence", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "source-fog-render-evidence-input-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const copiedTileDirectory = join(directory, "normal");
  cpSync(normalTileDirectory, copiedTileDirectory, { recursive: true });
  const alteredFog = join(copiedTileDirectory, "fog0.spr");
  const bytes = readFileSync(alteredFog);
  bytes[0x0bcc] ^= 0xff;
  writeFileSync(alteredFog, bytes);
  assert.throws(() => extractSourceFogRenderEvidence({ normalTileDirectory: copiedTileDirectory }), /fog0\.spr SHA-256 mismatch/u);
});

test("rejects a changed K01 family-byte source map before emitting evidence", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "source-fog-render-evidence-map-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const alteredMap = join(directory, "k01.map");
  const bytes = readFileSync(k01MapPath);
  bytes[0x4a0c4] ^= 0xff;
  writeFileSync(alteredMap, bytes);
  assert.throws(() => extractSourceFogRenderEvidence({ mapPath: alteredMap }), /SHA-256 mismatch/u);
});
