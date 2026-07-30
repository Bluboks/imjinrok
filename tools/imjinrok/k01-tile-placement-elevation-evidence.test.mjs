import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  extractK01TilePlacementElevationEvidence,
  reproduceFUN00469510Placement,
  reproduceK01PlacementHelper,
  reproducePlacementLevel,
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
  assert.equal(report.cellStream.sha256, "78d0d96e0157e60cf9d2e2e4325941510f8911dbc9a57422ad00220874ad406c");
  assert.deepEqual(report.placement.helper.K01Distribution.placementLevel, { 0: 3600 });
  assert.deepEqual(report.placement.lowNibbleBranch.K01Distribution.verticalShift, { 0: 2865, 16: 735 });
  assert.equal(report.sources.sourceTileSelector.allK01ObjectFramesWithinValidatedSourceHeaders, true);
  assert.equal(report.sources.sourceTileSelector.pairStream.count, 3600);
});

test("pure FUN_00469510 reproducer keeps the low-nibble-two and other branches separate at map corners", () => {
  const map = readFileSync(mapPath);
  assert.deepEqual(reproduceFUN00469510Placement(map, { argument1: 50, verticalArgument2: 100, x: 0, y: 1 }), {
    x: 0,
    y: 1,
    storageOffset: 1,
    lowNibble: 2,
    placementSelector: 2,
    placementLookup: 0,
    placementLevel: 0,
    placementBranch: "low-nibble-equals-2",
    verticalShift: 0,
    argument1AfterFixedSubtract: 18,
    adjustedVerticalArgument2: 100,
    objectIndex: 0,
    frameIndex: 4,
  });
  assert.deepEqual(reproduceFUN00469510Placement(map, { argument1: 50, verticalArgument2: 100, x: 0, y: 0 }), {
    x: 0,
    y: 0,
    storageOffset: 0,
    lowNibble: 1,
    placementSelector: 2,
    placementLookup: 0,
    placementLevel: 0,
    placementBranch: "other-low-nibble",
    verticalShift: 16,
    argument1AfterFixedSubtract: 18,
    adjustedVerticalArgument2: 84,
    objectIndex: 0,
    frameIndex: 39,
  });
  for (const [x, y, objectIndex, frameIndex] of [[0, 59, 0, 40], [59, 0, 0, 4], [59, 59, 31, 18]]) {
    const result = reproduceFUN00469510Placement(map, { argument1: 0, verticalArgument2: 100, x, y });
    assert.equal(result.objectIndex, objectIndex);
    assert.equal(result.frameIndex, frameIndex);
  }
});

test("helper reproducer fixes every direct branch while recording that positive and negative values are synthetic, not K01 values", () => {
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
  assert.throws(() => reproducePlacementLevel(256, 0), /unsigned byte/u);
  assert.throws(() => reproducePlacementLevel(0, -1), /unsigned byte/u);
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
