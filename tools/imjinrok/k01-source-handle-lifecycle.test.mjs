import assert from "node:assert/strict";
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  ENTITY_LAST_ALLOCATABLE_SLOT,
  ENTITY_SLOT_COUNT,
  evaluateSourceHandleValidity,
  extractK01SourceHandleLifecycle,
  incrementSourceGeneration,
  releaseSourceEntitySlot,
  selectSourceEntitySlot,
} from "./extract-k01-source-handle-lifecycle.mjs";

const root = resolve(import.meta.dirname, "../..");
const paths = {
  executablePath: join(root, "original/imjinrok2/imjinrok2.exe"),
  seedsPath: join(root, "analysis/generated/imjinrok2/seeds.json"),
  functionsPath: join(root, "analysis/generated/imjinrok2/functions.json"),
  referencesPath: join(root, "analysis/generated/imjinrok2/references.json"),
  fixturePath: join(root, "analysis/fixtures/k01-source-handle-lifecycle-vectors.json"),
};
const temporaryDirectories = [];

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "k01-source-handle-"));
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

test("extracts the scoped source handle lifecycle with canonical static evidence", () => {
  const report = extractK01SourceHandleLifecycle(paths);

  assert.equal(report.evidenceStatus, "static-proven-scoped-source-handle-lifecycle");
  assert.equal(report.reproductionStatus, "reproduction-complete");
  assert.equal(report.implementationStatus, "analysis-only-no-production-change");
  assert.deepEqual(report.scope.pool.allocatableSlots, [1, ENTITY_LAST_ALLOCATABLE_SLOT]);
  assert.equal(report.scope.pool.count, ENTITY_SLOT_COUNT);
  assert.equal(report.analyzedFunctions.length, 17);
  assert.equal(report.callEdges.length, 11);
  assert.equal(report.codeAnchors.length, 19);
  assert.equal(report.testVectors.length, 19);
  assert.ok(report.testVectors.every(({ expected, result }) => JSON.stringify(expected) === JSON.stringify(result)));
  assert.deepEqual(report.testVectors.find(({ id }) => id === "same-slot-reuse-rejects-stale-and-accepts-new-generation").result, {
    firstHandle: { slot: 1199, generation: 1 },
    release: { released: true, activeAfter: 0 },
    secondHandle: { slot: 1199, generation: 2 },
    staleReference: { valid: false, reason: "generation-mismatch" },
    newReference: { valid: true, reason: "valid" },
  });
});

test("reproduces allocator, generation, validity, and release boundaries", () => {
  const active = Array(ENTITY_SLOT_COUNT).fill(0);
  const reuseAges = Array(ENTITY_SLOT_COUNT).fill(0);
  const allocation = selectSourceEntitySlot({ active, reuseAges });
  assert.equal(allocation.selectedSlot, ENTITY_LAST_ALLOCATABLE_SLOT);
  assert.equal(allocation.reuseAges[ENTITY_LAST_ALLOCATABLE_SLOT], 1);
  assert.equal(selectSourceEntitySlot({
    active: Array(ENTITY_SLOT_COUNT).fill(1),
    reuseAges: Array(ENTITY_SLOT_COUNT).fill(0),
  }).selectedSlot, 0);
  active[1] = 0;
  reuseAges[1] = 0x7fff;
  const wrappedAge = selectSourceEntitySlot({ active, reuseAges });
  assert.equal(wrappedAge.selectedSlot, 1);
  assert.equal(wrappedAge.reuseAges[1], -0x8000);
  assert.equal(incrementSourceGeneration(0xffff), 0);

  assert.deepEqual(evaluateSourceHandleValidity({
    slot: 1199,
    generation: 0,
    activeTableWord: 1,
    healthWord: 1,
    recordSlot: 1199,
    recordGeneration: 0,
  }), { valid: true, reason: "valid" });
  assert.deepEqual(evaluateSourceHandleValidity({
    slot: 1199,
    generation: 2,
    activeTableWord: 1,
    healthWord: 1,
    recordSlot: 1199,
    recordGeneration: 1,
  }), { valid: false, reason: "generation-mismatch" });

  const released = releaseSourceEntitySlot({
    slot: 1199,
    activeTable: Array(ENTITY_SLOT_COUNT).fill(1),
    reuseAges: Array(ENTITY_SLOT_COUNT).fill(4),
    activeList: [1199, 100],
    recordPosition: 0,
  });
  assert.equal(released.released, true);
  assert.deepEqual(released.activeList, [100, 0]);
  assert.equal(released.activeTable[1199], 0);
  assert.equal(released.reuseAges[1199], 0);
  assert.equal(releaseSourceEntitySlot({
    slot: 1199,
    activeTable: released.activeTable,
    reuseAges: released.reuseAges,
    activeList: released.activeList,
    recordPosition: 1,
  }).released, false);
});

test("rejects tampered executable, generated artifacts, references, and vectors", () => {
  const staleFunctions = copyJson(paths.functionsPath, (value) => {
    value.functions.find(({ entry }) => entry === "0x00483a60").instructionCount = 24;
  });
  assert.throws(
    () => extractK01SourceHandleLifecycle({ ...paths, functionsPath: staleFunctions }),
    /instruction count/,
  );

  const tamperedSeeds = copyJson(paths.seedsPath, (value) => {
    value.functions.find(({ entry }) => entry === "0x00483a60").bodyRanges[0] = "0x00483a60-0x00483a9b";
  });
  assert.throws(
    () => extractK01SourceHandleLifecycle({ ...paths, seedsPath: tamperedSeeds }),
    /body range/,
  );

  const tamperedReferences = copyJson(paths.referencesPath, (value) => {
    value.references.find(({ from }) => from === "0x00483c95").to = "0x00483aa0";
  });
  assert.throws(
    () => extractK01SourceHandleLifecycle({ ...paths, referencesPath: tamperedReferences }),
    /call edge missing/,
  );

  const tamperedFixture = copyJson(paths.fixturePath, (value) => {
    value.vectors[0].expected.selectedSlot = 1;
  });
  assert.throws(
    () => extractK01SourceHandleLifecycle({ ...paths, fixturePath: tamperedFixture }),
    /expected result/,
  );

  const executable = join(temporaryDirectory(), "imjinrok2.exe");
  copyFileSync(paths.executablePath, executable);
  const bytes = readFileSync(executable);
  bytes[0x100] ^= 0xff;
  writeFileSync(executable, bytes);
  assert.throws(
    () => extractK01SourceHandleLifecycle({ ...paths, executablePath: executable }),
    /EXE SHA-256/,
  );
});

test("rejects malformed source-handle inputs", () => {
  assert.throws(
    () => selectSourceEntitySlot({ active: [], reuseAges: [] }),
    /exactly 1200/,
  );
  assert.throws(
    () => incrementSourceGeneration(0x10000),
    /unsigned WORD/,
  );
  assert.throws(
    () => evaluateSourceHandleValidity({
      slot: 0,
      generation: 1,
      activeTableWord: 1,
      healthWord: 1,
      recordSlot: 0,
      recordGeneration: 1,
    }),
    /allocatable entity slot/,
  );
});
