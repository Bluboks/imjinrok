import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  extractK01OpeningFootprintAnchor,
  replayOpeningFootprint,
} from "./extract-k01-opening-footprint-anchor.mjs";

const root = resolve(import.meta.dirname, "../..");
const paths = {
  executablePath: join(root, "original/imjinrok2/imjinrok2.exe"),
  functionsPath: join(root, "analysis/generated/imjinrok2/functions.json"),
  referencesPath: join(root, "analysis/generated/imjinrok2/references.json"),
  seedsPath: join(root, "analysis/generated/imjinrok2/seeds.json"),
  catalogPath: join(root, "analysis/generated/entity-type-catalog.json"),
  mapPath: join(root, "original/imjinrok2/stagemap/k01.map"),
  fixturePath: join(root, "analysis/fixtures/k01-opening-footprint-anchor-vectors.json"),
};

test("recovers source footprint extents, all 15 K01 opening building records, and centered cells", () => {
  const report = extractK01OpeningFootprintAnchor(paths);
  assert.equal(report.analysisStatus, "static-confirmed-opening-footprint-anchor");
  assert.equal(report.reproductionStatus, "reproduction-complete");
  assert.equal(report.implementationStatus, "analysis-only-no-production-change");
  assert.equal(report.functionEvidence.length, 7);
  assert.equal(report.byteAnchors.length, 9);
  assert.equal(report.callEdges.length, 6);
  assert.equal(report.openingRecords.length, 15);
  assert.deepEqual(
    report.footprints.map(({ internalClass, width, height }) => [internalClass, width, height]),
    [[48, 3, 3], [49, 3, 3], [50, 3, 3], [51, 3, 3], [57, 3, 2], [58, 3, 3], [60, 3, 3], [62, 3, 3], [63, 2, 2], [7, 1, 1]],
  );
  assert.deepEqual(
    report.openingRecords.map(({ sourceEntityIndex, internalClass, width, height }) => [sourceEntityIndex, internalClass, width, height]),
    [[9, 49, 3, 3], [10, 58, 3, 3], [11, 58, 3, 3], [12, 48, 3, 3], [13, 50, 3, 3], [14, 60, 3, 3], [15, 62, 3, 3], [16, 57, 3, 2], [17, 57, 3, 2], [18, 60, 3, 3], [26, 51, 3, 3], [39, 63, 2, 2], [40, 63, 2, 2], [42, 63, 2, 2], [43, 63, 2, 2]],
  );
  const class49 = report.openingRecords.find(({ sourceEntityIndex }) => sourceEntityIndex === 9);
  assert.deepEqual(class49.occupiedCells, [
    { x: 4, y: 3 }, { x: 5, y: 3 }, { x: 6, y: 3 },
    { x: 4, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 },
    { x: 4, y: 5 }, { x: 5, y: 5 }, { x: 6, y: 5 },
  ]);
  const class7 = replayOpeningFootprint({ operation: "write", input: { mapWidth: 60, mapHeight: 60, slot: 9, x: 7, y: 6, width: 1, height: 1 } });
  assert.deepEqual(class7.writes.map(({ x, y }) => [x, y]), [[7, 6]]);
  assert.equal(report.vectors.length, 8);
});

test("pins even and mixed extents, edge skips, overwrite order, and initialization gates", () => {
  const base = { mapWidth: 8, mapHeight: 8, slot: 9 };
  const even = replayOpeningFootprint({ operation: "write", input: { ...base, x: 2, y: 2, width: 2, height: 2 } });
  assert.deepEqual(even.writes.filter(({ result }) => result !== "skip-oob").map(({ x, y }) => [x, y]), [[1, 1], [2, 1], [1, 2], [2, 2]]);
  const mixed = replayOpeningFootprint({ operation: "write", input: { ...base, x: 2, y: 2, width: 3, height: 2 } });
  assert.deepEqual(mixed.writes.filter(({ result }) => result !== "skip-oob").map(({ x, y }) => [x, y]), [[1, 1], [2, 1], [3, 1], [1, 2], [2, 2], [3, 2]]);
  const edge = replayOpeningFootprint({ operation: "write", input: { ...base, x: 0, y: 0, width: 3, height: 3 } });
  assert.equal(edge.writes.filter(({ result }) => result === "skip-oob").length, 5);
  const overwrite = replayOpeningFootprint({ operation: "write", input: { ...base, x: 1, y: 1, width: 1, height: 1, existingOwner: { x: 1, y: 1, value: 7 }, existingMask: { x: 1, y: 1, value: 0x3000 } } });
  assert.deepEqual(overwrite.writes[0], { x: 1, y: 1, result: "mask-or-then-owner-store", beforeOwner: 7, afterOwner: 9, beforeMask: 0x3000, afterMask: 0x3000 });
  assert.equal(replayOpeningFootprint({ operation: "write", input: { ...base, x: 1, y: 1, width: 3, height: 3, activeGate: 0 } }).status, "skipped-active-gate");
  assert.equal(replayOpeningFootprint({ operation: "write", input: { ...base, x: 1, y: 1, width: 3, height: 3, footprintReady: false } }).status, "skipped-before-footprint-copy");
});

test("rejects tampered source-bound artifacts and preserves root-independent report paths", (t) => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "k01-opening-footprint-"));
  t.after(() => rmSync(temporaryDirectory, { recursive: true, force: true }));
  const copiedFunctions = join(temporaryDirectory, "functions.json");
  const functions = JSON.parse(readFileSync(paths.functionsPath, "utf8"));
  functions.functions.find(({ entry }) => entry === "0x0045bd00").instructionCount = 102;
  writeFileSync(copiedFunctions, `${JSON.stringify(functions)}\n`);
  assert.throws(() => extractK01OpeningFootprintAnchor({ ...paths, functionsPath: copiedFunctions }), /instruction count/);
  const copiedSeeds = join(temporaryDirectory, "seeds.json");
  const seeds = JSON.parse(readFileSync(paths.seedsPath, "utf8"));
  seeds.functions.find(({ entry }) => entry === "0x0045bf50").instructions[0].text = "NOP";
  writeFileSync(copiedSeeds, `${JSON.stringify(seeds)}\n`);
  assert.throws(() => extractK01OpeningFootprintAnchor({ ...paths, seedsPath: copiedSeeds }), /seeds artifact SHA-256/);
  const copiedFixture = join(temporaryDirectory, "fixture.json");
  const fixture = JSON.parse(readFileSync(paths.fixturePath, "utf8"));
  fixture.vectors[0].expectedSha256 = "0".repeat(64);
  writeFileSync(copiedFixture, `${JSON.stringify(fixture)}\n`);
  assert.throws(() => extractK01OpeningFootprintAnchor({ ...paths, fixturePath: copiedFixture }), /replay SHA-256/);

  const alternate = join(temporaryDirectory, "alternate");
  for (const relative of ["original/imjinrok2", "original/imjinrok2/stagemap", "analysis/generated/imjinrok2", "analysis/fixtures"]) mkdirSync(join(alternate, relative), { recursive: true });
  for (const relative of ["original/imjinrok2/imjinrok2.exe", "analysis/generated/imjinrok2/functions.json", "analysis/generated/imjinrok2/references.json", "analysis/generated/imjinrok2/seeds.json", "analysis/generated/entity-type-catalog.json", "original/imjinrok2/stagemap/k01.map", "analysis/fixtures/k01-opening-footprint-anchor-vectors.json"]) symlinkSync(join(root, relative), join(alternate, relative));
  const report = extractK01OpeningFootprintAnchor({
    executablePath: join(alternate, "original/imjinrok2/imjinrok2.exe"),
    functionsPath: join(alternate, "analysis/generated/imjinrok2/functions.json"),
    referencesPath: join(alternate, "analysis/generated/imjinrok2/references.json"),
    seedsPath: join(alternate, "analysis/generated/imjinrok2/seeds.json"),
    catalogPath: join(alternate, "analysis/generated/entity-type-catalog.json"),
    mapPath: join(alternate, "original/imjinrok2/stagemap/k01.map"),
    fixturePath: join(alternate, "analysis/fixtures/k01-opening-footprint-anchor-vectors.json"),
  });
  assert.deepEqual(report, extractK01OpeningFootprintAnchor(paths));
  assert.equal(JSON.stringify(report).includes(alternate), false);
});
