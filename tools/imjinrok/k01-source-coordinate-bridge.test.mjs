import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import test from "node:test";

import {
  extractK01SourceCoordinateBridge,
  interpretSourceWord,
  mapCellToSemanticGridPoint,
  placementToSemanticGridPoint,
  replaySourceCoordinateBridgeVector,
} from "./extract-k01-source-coordinate-bridge.mjs";

const root = resolve(import.meta.dirname, "../..");
const paths = {
  executablePath: join(root, "original/imjinrok2/imjinrok2.exe"),
  mapPath: join(root, "original/imjinrok2/stagemap/k01.map"),
  functionsPath: join(root, "analysis/generated/imjinrok2/functions.json"),
  referencesPath: join(root, "analysis/generated/imjinrok2/references.json"),
  seedsPath: join(root, "analysis/generated/imjinrok2/seeds.json"),
  jumpTablesPath: join(root, "analysis/generated/imjinrok2/jump-tables.json"),
  catalogPath: join(root, "analysis/generated/entity-type-catalog.json"),
  spriteDirectory: join(root, "original/imjinrok2/char"),
  fixturePath: join(root, "analysis/fixtures/k01-source-coordinate-bridge-vectors.json"),
};

test("extracts the four coordinate domains with explicit closed conversion scope", () => {
  const report = extractK01SourceCoordinateBridge(paths);
  assert.equal(report.analysisStatus, "static-confirmed-for-closed-coordinate-domains");
  assert.equal(report.reproductionStatus, "reproduction-complete-for-accepted-vectors-and-fail-closed-boundaries");
  assert.equal(report.implementationStatus, "analysis-only-no-production-change");
  assert.deepEqual(report.sources.executable, {
    path: "original/imjinrok2/imjinrok2.exe",
    byteLength: 843833,
    sha256: "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e",
  });
  assert.deepEqual(report.coordinateDomains.map(({ id }) => id), [
    "k01-map-cell",
    "k01-exact-placement-coordinate",
    "k01-entity-current-and-raw-locomotion",
    "k01-movement-accumulator-commit",
    "k01-projectile-start-end-route",
  ]);
  assert.equal(report.evidence.functionRanges.length, 19);
  assert.equal(report.evidence.rawCodeRanges.length, 12);
  assert.equal(report.evidence.codeAnchors.length, 13);
  assert.equal(report.evidence.callEdges.length, 12);
  assert.equal(report.vectors.length, 19);
  assert.ok(report.vectors.every(({ expected, result }) => subsetMatches(result, expected)));
  assert.deepEqual(report.sourceRecords.reinforcement.descriptorCoordinates, [
    { x: 53, y: 51 }, { x: 55, y: 51 }, { x: 57, y: 51 },
    { x: 53, y: 53 }, { x: 55, y: 53 }, { x: 57, y: 53 },
    { x: 53, y: 55 }, { x: 55, y: 55 }, { x: 57, y: 55 },
  ]);
  assert.equal(report.linkedEvidence.C01.sourceUpdateToEntityAndProjectile.at(-1), "FUN_00447360");
  assert.equal(report.linkedEvidence.E01.sourceHandle.allocator, "FUN_00483a60 slots 1..1199");
  assert.equal(report.proposedAdapter.direction.semanticToSource, "identity only for integer in-bounds GridPoint; otherwise reject");
});

test("replays signed WORD boundaries, exact placement, and fail-closed domains", () => {
  assert.deepEqual(interpretSourceWord(0), { unsignedWord: 0, signedWord: 0 });
  assert.deepEqual(interpretSourceWord(0xffff), { unsignedWord: 0xffff, signedWord: -1 });
  assert.deepEqual(interpretSourceWord(0x8000), { unsignedWord: 0x8000, signedWord: -0x8000 });
  assert.deepEqual(mapCellToSemanticGridPoint({ x: 59, y: 59 }), { accepted: true, gridPoint: { x: 59, y: 59 }, rounding: "none", scale: 1 });
  assert.deepEqual(mapCellToSemanticGridPoint({ x: 60, y: 0 }), { accepted: false, reason: "out-of-bounds" });
  assert.deepEqual(mapCellToSemanticGridPoint({ x: -32768, y: 0 }), { accepted: false, reason: "out-of-bounds" });
  assert.deepEqual(placementToSemanticGridPoint({ origin: { x: 55, y: 53 }, offset: { x: -2, y: -2 } }), {
    accepted: true,
    sourceCoordinate: { x: 53, y: 51 },
    gridPoint: { x: 53, y: 51 },
    rounding: "none",
    scale: 1,
  });
  assert.deepEqual(placementToSemanticGridPoint({ origin: { x: 32767, y: 0 }, offset: { x: 1, y: 0 } }), {
    accepted: false,
    reason: "out-of-bounds",
    sourceCoordinate: { x: -32768, y: 0 },
  });
  assert.throws(() => interpretSourceWord(-1), /unsigned WORD/);
  assert.throws(() => mapCellToSemanticGridPoint({ x: 32768, y: 0 }), /signed WORD/);
  assert.throws(() => replaySourceCoordinateBridgeVector({ operation: "projectile-route", input: { startX: -1, startY: 0, endX: 1, endY: 1, sampleInterval: 14 } }), /0\.\.32767/);
});

test("uses canonical root-independent provenance through alternate symlink roots", () => {
  const report = extractK01SourceCoordinateBridge(paths);
  const alternateRoot = mkdtempSync(join(tmpdir(), "k01-source-coordinate-bridge-alt-"));
  try {
    symlinkSync(join(root, "original"), join(alternateRoot, "original"), "dir");
    symlinkSync(join(root, "analysis"), join(alternateRoot, "analysis"), "dir");
    const alternate = extractK01SourceCoordinateBridge({
      executablePath: join(alternateRoot, "original/imjinrok2/imjinrok2.exe"),
      mapPath: join(alternateRoot, "original/imjinrok2/stagemap/k01.map"),
      functionsPath: join(alternateRoot, "analysis/generated/imjinrok2/functions.json"),
      referencesPath: join(alternateRoot, "analysis/generated/imjinrok2/references.json"),
      seedsPath: join(alternateRoot, "analysis/generated/imjinrok2/seeds.json"),
      jumpTablesPath: join(alternateRoot, "analysis/generated/imjinrok2/jump-tables.json"),
      catalogPath: join(alternateRoot, "analysis/generated/entity-type-catalog.json"),
      spriteDirectory: join(alternateRoot, "original/imjinrok2/char"),
      fixturePath: join(alternateRoot, "analysis/fixtures/k01-source-coordinate-bridge-vectors.json"),
    });
    assert.deepEqual(alternate, report);
    const serialized = JSON.stringify(alternate);
    assert.equal(serialized.includes(root), false);
    assert.equal(serialized.includes(alternateRoot), false);
    assert.equal(serialized.includes(`${basename(root)}/`), false);
  } finally {
    rmSync(alternateRoot, { recursive: true, force: true });
  }
});

test("rejects tampered executable, generated provenance, and vector fixture", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "k01-source-coordinate-bridge-tamper-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const executable = join(directory, "changed.exe");
  const executableBytes = Buffer.from(readFileSync(paths.executablePath));
  executableBytes[0x100] ^= 0xff;
  writeFileSync(executable, executableBytes);
  assert.throws(() => extractK01SourceCoordinateBridge({ ...paths, executablePath: executable }), /EXE SHA-256/);

  const functions = join(directory, "functions.json");
  const functionsValue = JSON.parse(readFileSync(paths.functionsPath, "utf8"));
  functionsValue.functions.find(({ entry }) => entry === "0x00464cc0").instructionCount += 1;
  writeFileSync(functions, `${JSON.stringify(functionsValue)}\n`);
  assert.throws(() => extractK01SourceCoordinateBridge({ ...paths, functionsPath: functions }), /functions artifact SHA-256/);

  const fixture = join(directory, "vectors.json");
  const fixtureValue = JSON.parse(readFileSync(paths.fixturePath, "utf8"));
  fixtureValue.vectors[0].expected.signedWord = 1;
  writeFileSync(fixture, `${JSON.stringify(fixtureValue)}\n`);
  assert.throws(() => extractK01SourceCoordinateBridge({ ...paths, fixturePath: fixture }), /expected result/);
});

function subsetMatches(actual, expected) {
  if (expected === null || typeof expected !== "object") return actual === expected;
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((value, index) => subsetMatches(actual[index], value));
  return actual !== null && typeof actual === "object" && Object.entries(expected).every(([key, value]) => subsetMatches(actual[key], value));
}
