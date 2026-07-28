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
  extractK01ReinforcementPlacementPolicy,
  replayK01ReinforcementPlacement,
  selectInactiveReinforcementSlot,
} from "./extract-k01-reinforcement-placement-policy.mjs";

const root = resolve(import.meta.dirname, "../..");
const paths = {
  executablePath: join(root, "original/imjinrok2/imjinrok2.exe"),
  functionsPath: join(root, "analysis/generated/imjinrok2/functions.json"),
  seedsPath: join(root, "analysis/generated/imjinrok2/seeds.json"),
};
const temporaryDirectories = [];

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "k01-placement-"));
  temporaryDirectories.push(directory);
  return directory;
}

test.after(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function emptySlotState() {
  return {
    active: Array(1200).fill(false),
    reuseAges: Array(1200).fill(0),
  };
}

function replay(overrides = {}) {
  return replayK01ReinforcementPlacement({
    origin: { x: 55, y: 53 },
    mapWidth: 60,
    mapHeight: 60,
    generation: 0,
    ...emptySlotState(),
    occupancy: Array(60 * 60).fill(0),
    ...overrides,
  });
}

test("extracts static K01 placement proof and canonical nine-record replay", () => {
  const report = extractK01ReinforcementPlacementPolicy();

  assert.equal(report.analysisStatus, "static-proven");
  assert.equal(report.reproductionStatus, "reproduction-complete");
  assert.equal(report.implementationStatus, "none");
  assert.deepEqual(
    report.testVectors.canonicalRequestedCoordinates,
    [
      { x: 53, y: 51 },
      { x: 55, y: 51 },
      { x: 57, y: 51 },
      { x: 53, y: 53 },
      { x: 55, y: 53 },
      { x: 57, y: 53 },
      { x: 53, y: 55 },
      { x: 55, y: 55 },
      { x: 57, y: 55 },
    ],
  );
  assert.deepEqual(
    report.testVectors.canonicalSlots,
    [1199, 1198, 1197, 1196, 1195, 1194, 1193, 1192, 1191],
  );
  assert.deepEqual(report.testVectors.canonicalGenerations, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(report.callEdges.length, 10);
  assert.deepEqual(
    report.callEdges.slice(-3).map(({ callSite, callee }) => ({ callSite, callee })),
    [
      { callSite: "0x00437f9c", callee: "0x0043aa80" },
      { callSite: "0x00438013", callee: "0x00438790" },
      { callSite: "0x0043801a", callee: "0x0043c9c0" },
    ],
  );
  assert.deepEqual(
    report.typeFootprints.map(({ internalClass, width, height, flagBit08, mobileOccupancyMode }) => ({
      internalClass,
      width,
      height,
      flagBit08,
      mobileOccupancyMode,
    })),
    [12, 13, 14, 82].map((internalClass) => ({
      internalClass,
      width: 1,
      height: 1,
      flagBit08: "clear",
      mobileOccupancyMode: 1,
    })),
  );
  assert.equal(report.byteAnchors.every(({ rawOffset }) => /^0x[0-9a-f]+$/.test(rawOffset)), true);
  assert.equal(
    report.coordinateAndOccupancyPolicy.mobileOccupancy.includes("no existing-occupant zero check"),
    true,
  );
  assert.equal(report.coordinateAndOccupancyPolicy.immediatePositionReads.every(({ access }) => access === "read"), true);
});

test("selects later inactive ties and increments every inactive signed reuse age", () => {
  const state = emptySlotState();
  state.reuseAges[1] = 4;
  state.reuseAges[2] = 4;
  state.reuseAges[3] = 0x7fff;
  state.active[4] = true;
  const result = selectInactiveReinforcementSlot(state);

  assert.equal(result.selectedSlot, 3);
  assert.equal(result.reuseAges[1], 5);
  assert.equal(result.reuseAges[2], 5);
  assert.equal(result.reuseAges[3], -0x8000);
  assert.equal(result.reuseAges[4], 0);
  assert.equal(state.reuseAges[3], 0x7fff);
});

test("replays exact occupancy overwrite without terrain or existing-occupant rejection", () => {
  const state = emptySlotState();
  const occupancy = Array(9).fill(0);
  occupancy[4] = 77;
  const result = replayK01ReinforcementPlacement({
    origin: { x: 1, y: 1 },
    mapWidth: 3,
    mapHeight: 3,
    generation: 0xffff,
    ...state,
    occupancy,
    descriptors: [
      [12, 1, 0, 0],
      [13, 1, 0, 0],
      [0],
    ],
  });

  assert.equal(result.returnValue, 1);
  assert.equal(result.records.length, 2);
  assert.deepEqual(result.records.map(({ x, y }) => ({ x, y })), [{ x: 1, y: 1 }, { x: 1, y: 1 }]);
  assert.deepEqual(result.records.map(({ generation }) => generation), [0, 1]);
  assert.equal(result.active[1199], true);
  assert.equal(result.active[1198], true);
  assert.equal(result.occupancy[4], 1198);
  assert.equal(occupancy[4], 77);
});

test("allocates and ages before OOB skip, then continues to the next descriptor", () => {
  const result = replay({
    origin: { x: 0, y: 0 },
    mapWidth: 2,
    mapHeight: 2,
    occupancy: Array(4).fill(0),
    descriptors: [
      [12, 1, -1, 0],
      [13, 1, 0, 0],
      [0],
    ],
  });

  assert.deepEqual(result.allocations, [{ index: 0, slot: 1199 }, { index: 1, slot: 1199 }]);
  assert.deepEqual(result.skippedOutOfBounds, [
    { index: 0, internalClass: 12, slot: 1199, x: -1, y: 0 },
  ]);
  assert.deepEqual(result.records.map(({ slot, generation, x, y }) => ({ slot, generation, x, y })), [
    { slot: 1199, generation: 1, x: 0, y: 0 },
  ]);
  assert.equal(result.reuseAges[1199], 2);
});

test("aborts on allocation failure while retaining prior creates and honors terminator success", () => {
  const allActive = Array(1200).fill(true);
  const failed = replay({
    active: allActive,
    descriptors: [[12, 1, 0, 0], [0]],
  });
  assert.equal(failed.returnValue, 0);
  assert.equal(failed.aborted, true);
  assert.equal(failed.records.length, 0);

  const negativeAges = emptySlotState();
  negativeAges.reuseAges.fill(-1);
  negativeAges.reuseAges[1199] = 0;
  const afterPriorCreate = replay({
    active: [false, ...Array(1198).fill(true), false],
    reuseAges: negativeAges.reuseAges,
    descriptors: [[12, 1, 0, 0], [13, 1, 1, 0], [0]],
  });
  assert.equal(afterPriorCreate.returnValue, 0);
  assert.equal(afterPriorCreate.terminated, false);
  assert.deepEqual(afterPriorCreate.allocations, [{ index: 0, slot: 1199 }, { index: 1, slot: 0 }]);
  assert.deepEqual(afterPriorCreate.records.map(({ slot }) => slot), [1199]);

  const allNegative = emptySlotState();
  allNegative.reuseAges.fill(-1);
  const selected = selectInactiveReinforcementSlot(allNegative);
  assert.equal(selected.selectedSlot, 0);
  assert.equal(selected.reuseAges[0], -1);
  assert.equal(selected.reuseAges.slice(1).every((age) => age === 0), true);
  const immediateFailure = replay({
    reuseAges: allNegative.reuseAges,
    descriptors: [[12, 1, 0, 0], [13, 1, 1, 0], [0]],
  });
  assert.equal(immediateFailure.returnValue, 0);
  assert.equal(immediateFailure.terminated, false);
  assert.deepEqual(immediateFailure.allocations, [{ index: 0, slot: 0 }]);
  assert.equal(immediateFailure.records.length, 0);

  const terminated = replay({ descriptors: [[0]] });
  assert.equal(terminated.returnValue, 1);
  assert.equal(terminated.terminated, true);
  assert.deepEqual(terminated.allocations, []);
});

test("rejects malformed replay input and stale static artifacts", () => {
  assert.throws(
    () => selectInactiveReinforcementSlot({ active: [], reuseAges: [] }),
    /exactly 1200/,
  );
  assert.throws(
    () => replay({ descriptors: [[12, 1, 0, 0]] }),
    /class-zero terminator/,
  );
  assert.throws(
    () => replay({ occupancy: [] }),
    /occupancy length/,
  );

  const copyJson = (source, mutate) => {
    const target = join(temporaryDirectory(), "artifact.json");
    const value = JSON.parse(readFileSync(source, "utf8"));
    mutate(value);
    writeFileSync(target, `${JSON.stringify(value)}\n`);
    return target;
  };
  const staleFunctions = copyJson(paths.functionsPath, (value) => {
    value.functions.find(({ entry }) => entry === "0x00483a60").instructionCount = 24;
  });
  assert.throws(
    () => extractK01ReinforcementPlacementPolicy({ functionsPath: staleFunctions }),
    /instruction count/,
  );
  const tamperedSeeds = copyJson(paths.seedsPath, (value) => {
    value.functions
      .find(({ entry }) => entry === "0x0045bf50")
      .instructions.find(({ address }) => address === "0x0045c3a4").text = "PUSH 0x0";
  });
  assert.throws(
    () => extractK01ReinforcementPlacementPolicy({ seedsPath: tamperedSeeds }),
    /1x1 type footprint/,
  );
  const executable = join(temporaryDirectory(), "imjinrok2.exe");
  copyFileSync(paths.executablePath, executable);
  const bytes = readFileSync(executable);
  bytes[0x100] ^= 0xff;
  writeFileSync(executable, bytes);
  assert.throws(
    () => extractK01ReinforcementPlacementPolicy({ executablePath: executable }),
    /EXE SHA-256/,
  );
});
