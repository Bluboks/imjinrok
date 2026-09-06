import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  extractK01TilePlacementElevationEvidence,
  replayFUN00462b80RuntimeWordTableInitialization,
  replayFUN0046d650LookupAddress,
  reproduceFUN00464cc0Projection,
  reproduceFUN00469510Placement,
  reproduceK01PlacementHelper,
  reproducePlacementLevel,
  reproduceRuntimeWordTableOutputYAdjustment,
} from "./extract-k01-tile-placement-elevation-evidence.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const executablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const mapPath = join(repositoryRoot, "original/imjinrok2/stagemap/k01.map");
const functionsPath = join(repositoryRoot, "analysis/generated/imjinrok2/functions.json");
const referencesPath = join(repositoryRoot, "analysis/generated/imjinrok2/references.json");
const fixturePath = join(repositoryRoot, "analysis/fixtures/k01-tile-placement-elevation-evidence.json");
const extractorPath = join(dirname(fileURLToPath(import.meta.url)), "extract-k01-tile-placement-elevation-evidence.mjs");

test("hash-bound extractor reproduces all K01 placement/object/frame vectors", () => {
  const report = extractK01TilePlacementElevationEvidence({ executablePath, mapPath, functionsPath, referencesPath });
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  assert.deepEqual(report, fixture);
  assert.equal(report.cellStream.count, 3600);
  assert.equal(report.cellStream.sha256, "510f65ea32bf993466e31126b0528dbd127175f3c6bb91ab42e20f3e6ed3c496");
  assert.deepEqual(report.placement.helper.K01Distribution.placementLevel, { 0: 1639, 1: 616, 2: 1115, 3: 74, 4: 156 });
  assert.equal(report.placement.helper.K01Distribution.placementLookupStreamSha256, "e7331ac9f6c848074249f9b44c2fa4da3b372afff01b8a34efa6695aa66d9260");
  assert.equal(report.placement.helper.K01Distribution.placementLevelStreamSha256, "5c14adcd99b36ea2c0e8dcd5e97fb7f367d0a1c99b2eea8ab52976e28b6a9133");
  assert.deepEqual(report.placement.lowNibbleBranch.K01Distribution.verticalShift, { 0: 1331, 16: 617, 32: 1335, 48: 128, 64: 189 });
  assert.deepEqual(report.cellProjection.K01Distribution.helperLookup, { 1: 61, 2: 38, 3: 95, 4: 54, 5: 79, 6: 1, 7: 55, 8: 36, 10: 95, 11: 35, 12: 101, 13: 52, 14: 33, 15: 2865 });
  assert.deepEqual(report.cellProjection.K01Distribution.helperReturn, { 0: 1639, 1: 616, 2: 1115, 3: 74, 4: 156 });
  assert.deepEqual(report.cellProjection.K01Distribution.sourceBackedRawRelativeComponent.values, { 0: 1331, 16: 617, 32: 1335, 48: 128, 64: 189 });
  assert.equal(report.cellProjection.K01Distribution.sourceBackedRawRelativeComponent.sha256, "4b58471674a5e89bb553cb995474a3847458eb9e295d68aef057439093b0fb52");
  assert.equal(report.sources.sourceTileSelector.allK01ObjectFramesWithinValidatedSourceHeaders, true);
  assert.equal(report.sources.sourceTileSelector.pairStream.count, 3600);
  assert.deepEqual(report.sourceRaster, {
    function: "FUN_00466f20",
    dimensions: "surfaceWidth = map.width * 64; surfaceHeight = map.height * 32 + 200",
    drawOrder: "y outer, x inner",
    baseScreenPoint: "screenX = (x - y) * 32 + map.width * 32; screenY = (x + y) * 16 + 200",
    dispatch: "FUN_00469510(argument1=screenX, argument2=screenY, argument3=x, argument4=y)",
    drawRectangle: "drawLeft = argument1 - 32; drawTop = argument2 - verticalShift, where verticalShift follows the branch formulas above",
    boundary: "This bounded full-map raster establishes draw order and rectangle arithmetic, not broader pivot, clip/mode, palette, or renderer parity semantics.",
  });
  assert.equal(report.sources.staticAnalysis.references.requiredCallEdges.some((edge) => edge.from === "0x00467160" && edge.to === "0x00469510"), true);
  assert.equal(report.sources.staticAnalysis.references.runtimeWordTableDirectReferenceInventory.length, 6);
  assert.deepEqual(report.runtimeWordAdjustmentTable.initialization.indexedFamilyDomain, { first: 0, last: 14, count: 15 });
  assert.equal(report.runtimeWordAdjustmentTable.initialization.indexedWordWrites.at(0).value, 0);
  assert.equal(report.runtimeWordAdjustmentTable.initialization.indexedWordWrites.at(-1).value, 9);
  assert.deepEqual(report.runtimeWordAdjustmentTable.readerContract.K01FogFamilyDistribution, { 0: 2865, 1: 95, 2: 95, 3: 101, 4: 79, 5: 38, 6: 36, 7: 54, 8: 61, 9: 52, 10: 33, 11: 35, 12: 55, 14: 1 });
});

test("FUN_00462b80 byte replay fixes every indexed and adjacent WORD write", () => {
  const initialization = replayFUN00462b80RuntimeWordTableInitialization();
  assert.deepEqual(initialization.indexedFamilyDomain, { first: 0, last: 14, count: 15 });
  assert.deepEqual(initialization.indexedWordWrites, [
    { family: 0, wordOffset: 0, value: 0 },
    ...Array.from({ length: 14 }, (_, index) => ({ family: index + 1, wordOffset: (index + 1) * 8, value: 9 })),
  ]);
  assert.deepEqual(initialization.adjacentZeroWordWrites, { count: 15, firstWordOffset: -2, lastWordOffset: 110, strideBytes: 8, value: 0 });
});

test("FUN_0046d650 instruction-order address replay preserves the final x4 selector lookup stride", () => {
  assert.equal(replayFUN0046d650LookupAddress({ selector: 2, x: 0, y: 0 }), 0x61c74);
  assert.equal(replayFUN0046d650LookupAddress({ selector: 3, x: 0, y: 25 }), 0x69b1d);
  assert.equal(replayFUN0046d650LookupAddress({ selector: 1, x: 0, y: 32 }), 0x59e04);
  assert.equal(replayFUN0046d650LookupAddress({ selector: 0, x: 0, y: 33 }), 0x51f75);
  assert.equal(replayFUN0046d650LookupAddress({ selector: 4, x: 46, y: 49 }), 0x73a1d);
  assert.throws(() => replayFUN0046d650LookupAddress({ selector: 256, x: 0, y: 0 }), /unsigned byte/u);
});

test("shared runtime WORD-table reader contract preserves both low-nibble formulas", () => {
  const words = replayFUN00462b80RuntimeWordTableInitialization().indexedWordWrites.map(({ value }) => value);
  assert.deepEqual(reproduceRuntimeWordTableOutputYAdjustment(words, { family: 0, lowNibble: 2, helperReturn: 3 }), {
    family: 0,
    lowNibble: 2,
    helperReturn: 3,
    tableWord: 0,
    relativeComponent: -32,
    outputYAdjustment: -32,
  });
  assert.deepEqual(reproduceRuntimeWordTableOutputYAdjustment(words, { family: 14, lowNibble: 1, helperReturn: -2 }), {
    family: 14,
    lowNibble: 1,
    helperReturn: -2,
    tableWord: 9,
    relativeComponent: -32,
    outputYAdjustment: -23,
  });
});

test("FUN_00464cc0 reproducer fixes bounded base projection and separates the unresolved table input", () => {
  const map = readFileSync(mapPath);
  assert.deepEqual(reproduceFUN00464cc0Projection(map, { x: 0, y: 1, runtimeWord: 7 }), {
    admitted: true,
    x: 0,
    y: 1,
    fogFamily: 0,
    lowNibble: 2,
    placementLevel: 2,
    outputX: -32,
    outputY: 7,
    relativeComponent: -16,
  });
  assert.deepEqual(reproduceFUN00464cc0Projection(map, { x: 0, y: 0, runtimeWord: -3 }), {
    admitted: true,
    x: 0,
    y: 0,
    fogFamily: 10,
    lowNibble: 1,
    placementLevel: 1,
    outputX: 0,
    outputY: -19,
    relativeComponent: -16,
  });
  assert.deepEqual(reproduceFUN00464cc0Projection(map, { x: -1, y: 0 }), { admitted: false });
});

test("pure FUN_00469510 reproducer keeps the low-nibble-two and other branches separate at map corners", () => {
  const map = readFileSync(mapPath);
  assert.deepEqual(reproduceFUN00469510Placement(map, { argument1: 50, verticalArgument2: 100, x: 0, y: 1 }), {
    x: 0,
    y: 1,
    storageOffset: 1,
    lowNibble: 2,
    placementSelector: 2,
    placementLookup: 15,
    placementLevel: 2,
    placementBranch: "low-nibble-equals-2",
    verticalShift: 32,
    argument1AfterFixedSubtract: 18,
    adjustedVerticalArgument2: 68,
    objectIndex: 0,
    frameIndex: 4,
  });
  assert.deepEqual(reproduceFUN00469510Placement(map, { argument1: 50, verticalArgument2: 100, x: 0, y: 0 }), {
    x: 0,
    y: 0,
    storageOffset: 0,
    lowNibble: 1,
    placementSelector: 2,
    placementLookup: 14,
    placementLevel: 1,
    placementBranch: "other-low-nibble",
    verticalShift: 32,
    argument1AfterFixedSubtract: 18,
    adjustedVerticalArgument2: 68,
    objectIndex: 0,
    frameIndex: 39,
  });
  for (const [x, y, objectIndex, frameIndex] of [[0, 59, 0, 40], [59, 0, 0, 4], [59, 59, 31, 18]]) {
    const result = reproduceFUN00469510Placement(map, { argument1: 0, verticalArgument2: 100, x, y });
    assert.equal(result.objectIndex, objectIndex);
    assert.equal(result.frameIndex, frameIndex);
  }
});

test("helper reproducer fixes every direct branch and exercises synthetic out-of-bounds values", () => {
  assert.equal(reproducePlacementLevel(4, 15), 4);
  assert.equal(reproducePlacementLevel(4, 1), 3);
  assert.equal(reproducePlacementLevel(0, 1), -1);
  assert.equal(reproducePlacementLevel(4, 0), 0);
  assert.equal(reproducePlacementLevel(4, null), -1);
  const map = readFileSync(mapPath);
  assert.equal(reproduceK01PlacementHelper(map, -1, 0), -1);
  assert.equal(reproduceK01PlacementHelper(map, 60, 0), -1);
  assert.equal(reproduceK01PlacementHelper(map, 0, 60), -1);
});

test("pure reference functions fail closed for malformed, out-of-range, and non-canonical inputs", () => {
  const map = readFileSync(mapPath);
  assert.throws(() => reproduceFUN00469510Placement(map, { argument1: 0, verticalArgument2: 0, x: -1, y: 0 }), /unsafe outside map bounds/u);
  assert.throws(() => reproduceFUN00469510Placement(map, { argument1: 0, verticalArgument2: 0, x: 60, y: 0 }), /unsafe outside map bounds/u);
  assert.throws(() => reproduceFUN00469510Placement(map, { argument1: 0, verticalArgument2: 0, x: 0.5, y: 0 }), /signed 16-bit/u);
  assert.throws(() => reproduceFUN00469510Placement(map, { argument1: 0x80000000, verticalArgument2: 0, x: 0, y: 0 }), /signed 32-bit/u);
  assert.throws(() => reproduceK01PlacementHelper(Buffer.alloc(1), 0, 0), /too short/u);
  assert.throws(() => reproduceFUN00464cc0Projection(Buffer.alloc(0x4a0c4), { x: 0, y: 0 }), /too short/u);
  assert.throws(() => reproducePlacementLevel(256, 0), /unsigned byte/u);
  assert.throws(() => reproducePlacementLevel(0, -1), /unsigned byte/u);
  assert.throws(() => reproduceFUN00464cc0Projection(map, { x: 0, y: 0, runtimeWord: 0x8000 }), /signed 16-bit/u);
  const words = replayFUN00462b80RuntimeWordTableInitialization().indexedWordWrites.map(({ value }) => value);
  assert.throws(() => reproduceRuntimeWordTableOutputYAdjustment(words.slice(0, -1), { family: 0, lowNibble: 2, helperReturn: 0 }), /exactly 15/u);
  assert.throws(() => reproduceRuntimeWordTableOutputYAdjustment(words, { family: 15, lowNibble: 2, helperReturn: 0 }), /outside the FUN_00462b80 initialized table domain/u);
  assert.throws(() => reproduceRuntimeWordTableOutputYAdjustment(words, { family: 0, lowNibble: 16, helperReturn: 0 }), /must be a nibble/u);
});

test("extractor rejects single-byte tampering of every hash-bound primary input", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "k01-tile-placement-elevation-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const [label, source, option, expected] of [
    ["executable", executablePath, "executablePath", /not an MZ executable|SHA-256 mismatch/u],
    ["map", mapPath, "mapPath", /SHA-256 mismatch/u],
    ["functions", functionsPath, "functionsPath", /static functions SHA-256 mismatch/u],
    ["references", referencesPath, "referencesPath", /static references SHA-256 mismatch/u],
  ]) {
    const target = join(directory, label);
    copyFileSync(source, target);
    flipByte(target, 0);
    assert.throws(() => extractK01TilePlacementElevationEvidence({ executablePath, mapPath, functionsPath, referencesPath, [option]: target }), expected);
  }
});

test("CLI is deterministic with explicit canonical source paths", () => {
  const args = [extractorPath, "--executable", executablePath, "--map", mapPath, "--functions", functionsPath, "--references", referencesPath];
  const first = spawnSync(process.execPath, args, { cwd: repositoryRoot, encoding: "utf8" });
  const second = spawnSync(process.execPath, args, { cwd: repositoryRoot, encoding: "utf8" });
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stdout, second.stdout);
  const report = JSON.parse(first.stdout);
  assert.equal(report.sources.executable.sha256, "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e");
});

function flipByte(path, offset) {
  const bytes = readFileSync(path);
  bytes[offset] ^= 0xff;
  writeFileSync(path, bytes);
}
