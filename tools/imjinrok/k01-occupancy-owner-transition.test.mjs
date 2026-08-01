import assert from "node:assert/strict";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  extractK01OccupancyOwnerTransition,
  replayCommit,
  replayCreate,
  replayHandle,
  replayRelease,
} from "./extract-k01-occupancy-owner-transition.mjs";

const root = resolve(import.meta.dirname, "../..");
const paths = {
  executablePath: join(root, "original/imjinrok2/imjinrok2.exe"),
  functionsPath: join(root, "analysis/generated/imjinrok2/functions.json"),
  referencesPath: join(root, "analysis/generated/imjinrok2/references.json"),
  seedsPath: join(root, "analysis/generated/imjinrok2/seeds.json"),
  fixturePath: join(root, "analysis/fixtures/k01-occupancy-owner-transition-vectors.json"),
};
const temporaryDirectories = [];

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "k01-occupancy-owner-"));
  temporaryDirectories.push(directory);
  return directory;
}

function copyJson(source, mutate) {
  const target = join(temporaryDirectory(), "artifact.json");
  const value = JSON.parse(readFileSync(source, "utf8"));
  mutate(value);
  writeFileSync(target, `${JSON.stringify(value)}\n`);
  return target;
}

test.after(() => {
  for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true });
});

test("extracts bounded occupancy-owner transition with source-bound evidence", () => {
  const report = extractK01OccupancyOwnerTransition(paths);

  assert.equal(report.analysisStatus, "static-confirmed-bounded-occupancy-owner-transition");
  assert.equal(report.reproductionStatus, "reproduction-complete");
  assert.equal(report.implementationStatus, "analysis-only-no-production-change");
  assert.equal(report.functionEvidence.length, 16);
  assert.equal(report.byteAnchors.length, 16);
  assert.equal(report.callEdges.length, 14);
  assert.equal(report.vectors.length, 20);
  assert.equal(report.source.executablePath, "original/imjinrok2/imjinrok2.exe");
  assert.equal(report.fixture.path, "analysis/fixtures/k01-occupancy-owner-transition-vectors.json");
  assert.ok(report.vectors.every(({ result }) => result));
  assert.match(report.unresolved.join("\n"), /alternate\/non-mobile/);
  assert.match(report.handleLink.staleGenerationConsumer, /stale slot WORD/);
});

test("produces the same root-independent report through an alternate symlink root", () => {
  const alternate = temporaryDirectory();
  for (const relative of [
    "original/imjinrok2",
    "analysis/generated/imjinrok2",
    "analysis/fixtures",
  ]) mkdirSync(join(alternate, relative), { recursive: true });
  for (const relative of Object.values({
    executablePath: "original/imjinrok2/imjinrok2.exe",
    functionsPath: "analysis/generated/imjinrok2/functions.json",
    referencesPath: "analysis/generated/imjinrok2/references.json",
    seedsPath: "analysis/generated/imjinrok2/seeds.json",
    fixturePath: "analysis/fixtures/k01-occupancy-owner-transition-vectors.json",
  })) symlinkSync(join(root, relative), join(alternate, relative));

  const report = extractK01OccupancyOwnerTransition({
    executablePath: join(alternate, "original/imjinrok2/imjinrok2.exe"),
    functionsPath: join(alternate, "analysis/generated/imjinrok2/functions.json"),
    referencesPath: join(alternate, "analysis/generated/imjinrok2/references.json"),
    seedsPath: join(alternate, "analysis/generated/imjinrok2/seeds.json"),
    fixturePath: join(alternate, "analysis/fixtures/k01-occupancy-owner-transition-vectors.json"),
  });
  assert.deepEqual(report, extractK01OccupancyOwnerTransition(paths));
  assert.equal(JSON.stringify(report).includes(alternate), false);
});

test("rejects tampered source, generated evidence, and replay fixture", () => {
  const executable = join(temporaryDirectory(), "imjinrok2.exe");
  copyFileSync(paths.executablePath, executable);
  const bytes = readFileSync(executable);
  bytes[0x100] ^= 0xff;
  writeFileSync(executable, bytes);
  assert.throws(() => extractK01OccupancyOwnerTransition({ ...paths, executablePath: executable }), /EXE SHA-256/);

  const functions = copyJson(paths.functionsPath, (value) => {
    value.functions.find(({ entry }) => entry === "0x00483a60").instructionCount = 24;
  });
  assert.throws(() => extractK01OccupancyOwnerTransition({ ...paths, functionsPath: functions }), /instruction count/);

  const references = copyJson(paths.referencesPath, (value) => {
    value.references.find(({ from }) => from === "0x00483c95").to = "0x00483aa0";
  });
  assert.throws(() => extractK01OccupancyOwnerTransition({ ...paths, referencesPath: references }), /call edge missing/);

  const seeds = copyJson(paths.seedsPath, (value) => {
    value.sourceSha256 = "0".repeat(64);
  });
  assert.throws(() => extractK01OccupancyOwnerTransition({ ...paths, seedsPath: seeds }), /seeds source SHA-256/);

  const fixture = copyJson(paths.fixturePath, (value) => {
    value.vectors[0].expectedSha256 = "0".repeat(64);
  });
  assert.throws(() => extractK01OccupancyOwnerTransition({ ...paths, fixturePath: fixture }), /replay SHA-256/);
});

test("replays overwrite, movement commit, release failure, and stale-generation boundaries", () => {
  const ownerGrid = Array(16).fill(0);
  const maskGrid = Array(16).fill(0);
  ownerGrid[5] = 3;
  maskGrid[5] = 0x3000;
  for (const occupantOwner of [1, 2, null]) {
    const created = replayCreate({ x: 1, y: 1, slot: 9, generation: 2, mapWidth: 4, mapHeight: 4, ownerGrid, maskGrid, occupantOwner });
    assert.equal(created.ownerGrid[5], 9);
    assert.equal(created.maskGrid[5], 0x3000);
  }
  assert.equal(replayCommit({ current: { x: 1, y: 1 }, target: { x: 2, y: 1 }, slot: 9, progress: 50, collision: "blocked" }).committed, false);
  assert.deepEqual(replayCommit({ current: { x: 1, y: 1 }, target: { x: 2, y: 1 }, slot: 9, progress: 50, collision: "clear" }).coordinatesAfter, { x: 2, y: 1 });
  const stale = replayRelease({ activeTableWord: 1, activeGateByte: 0, occupancyReady: 1, slot: 9, x: 1, y: 1, mapWidth: 4, mapHeight: 4, ownerGrid, maskGrid });
  assert.equal(stale.staleOccupancyPossible, true);
  assert.equal(stale.ownerGrid[5], 3);
  assert.equal(replayHandle({ slot: 1199, generation: 1, recordSlot: 1199, recordGeneration: 2, activeTableWord: 1, healthWord: 100, occupancyWord: 1199 }).generationValid, false);
});
