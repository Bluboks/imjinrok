import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { extractSourceFogRenderEvidence, lookupFogNeighborMask, reproduceFogSubframeIndices } from "./extract-source-fog-render-evidence.mjs";

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
