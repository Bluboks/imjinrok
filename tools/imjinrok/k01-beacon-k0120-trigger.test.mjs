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
  applySelectorFivePattern,
  createDescriptorEntities,
  evaluateRawRelationBlocker,
  extractK01BeaconK0120Trigger,
  K01_REINFORCEMENT_DESCRIPTORS,
  runK01BeaconTrigger,
} from "./extract-k01-beacon-k0120-trigger.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const analysisDirectory = join(
  repositoryRoot,
  "analysis/generated/imjinrok2",
);
const executablePath = join(
  repositoryRoot,
  "original/imjinrok2/imjinrok2.exe",
);
const scriptPath = join(
  repositoryRoot,
  "original/imjinrok2/script/K0120",
);

const completedBeacon = {
  index: 7,
  slotTableWord: 1,
  healthSignedWord: 1,
  activeByte: 1,
  ownerSignedByte: -1,
  classByte: 52,
  progressByte: 100,
};

test("extracts exact K01 beacon trigger CFG, descriptor data, selector pattern, and script", () => {
  const report = extractK01BeaconK0120Trigger();

  assert.equal(report.evidenceStatus, "static-proven-k01-beacon-k0120-trigger");
  assert.equal(report.reproductionStatus, "reproduction-complete");
  assert.equal(report.integrationStatus, "gated-no-exact-original-project-type-mapping");
  assert.equal(report.sources.executable.sha256, "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e");
  assert.deepEqual(
    {
      sha256: report.sources.script.sha256,
      size: report.sources.script.size,
      encoding: report.sources.script.encoding,
    },
    {
      sha256: "6d9b8043f4634c8b8f1696e6d9b49b17dff99b53280b9934c1dfbd998be6054d",
      size: 519,
      encoding: "CP949/EUC-KR",
    },
  );
  assert.equal(report.analyzedFunctions.length, 16);
  assert.equal(report.callEdges.length, 15);
  assert.equal(report.codeAnchors.length, 14);
  assert.ok(report.codeAnchors.every((anchor) => anchor.matched));
  assert.deepEqual(
    report.analyzedFunctions.map(({ entry, instructionCount, basicBlockCount }) => ({
      entry,
      instructionCount,
      basicBlockCount,
    })),
    [
      { entry: "0x0048ddb0", instructionCount: 105, basicBlockCount: 36 },
      { entry: "0x0048a5c0", instructionCount: 181, basicBlockCount: 32 },
      { entry: "0x00487fa0", instructionCount: 37, basicBlockCount: 7 },
      { entry: "0x00488420", instructionCount: 59, basicBlockCount: 11 },
      { entry: "0x00442ca0", instructionCount: 82, basicBlockCount: 25 },
      { entry: "0x004648d0", instructionCount: 3, basicBlockCount: 1 },
      { entry: "0x00461570", instructionCount: 6, basicBlockCount: 1 },
      { entry: "0x00482390", instructionCount: 2, basicBlockCount: 1 },
      { entry: "0x004823a0", instructionCount: 2, basicBlockCount: 1 },
      { entry: "0x00482180", instructionCount: 114, basicBlockCount: 16 },
      { entry: "0x00482340", instructionCount: 22, basicBlockCount: 4 },
      { entry: "0x00441db0", instructionCount: 12, basicBlockCount: 3 },
      { entry: "0x00441e40", instructionCount: 19, basicBlockCount: 5 },
      { entry: "0x004426a0", instructionCount: 23, basicBlockCount: 1 },
      { entry: "0x00483a60", instructionCount: 25, basicBlockCount: 7 },
      { entry: "0x00483c50", instructionCount: 26, basicBlockCount: 1 },
    ],
  );
  assert.deepEqual(
    report.descriptorCreation.descriptors,
    K01_REINFORCEMENT_DESCRIPTORS,
  );
  assert.deepEqual(report.entityScan.activeLookupConditions, [
    "WORD slot table entry != 0",
    "signed WORD record+0x3e > 0",
    "BYTE record+0x1f0 != 0",
  ]);
  assert.deepEqual(report.entityScan.reproductionRecordInputs, {
    slotTableWord: "unsigned WORD raw bits",
    healthSignedWord: "signed WORD record+0x3e",
    activeByte: "BYTE record+0x1f0",
  });
  assert.deepEqual(report.rawRelationBlocker.acceptedRecordConditions, [
    "WORD slot table entry != 0",
    "signed WORD record+0x3e > 0",
  ]);
  assert.deepEqual(
    report.selectorFive,
    {
      selector: 5,
      tableAddress: "0x004bbe54",
      centerRow: 5,
      rowOffsets: [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5],
      halfWidths: [1, 2, 3, 4, 4, 4, 4, 4, 3, 2, 1],
      terminator: 100,
      mutation:
        "for each in-bounds cell in the row spans, if first raw grid byte is nonzero, write it to zero then write second raw grid byte to one",
    },
  );
  assert.deepEqual(
    report.scriptBehavior.commands.map(({ command, args }) => [
      command,
      ...args.slice(0, 3),
    ]),
    [
      ["SPEECH", "K1", "0", "K01120"],
      ["SPEECH", "K3", "1", "K01130"],
      ["SPEECH", "K1", "0", "K01140"],
    ],
  );
  assert.equal(report.scriptBehavior.noSpawnCommand, true);
  assert.deepEqual(report.scriptBehavior.loaderReturnValues, [0, 1]);
  assert.equal(report.scriptBehavior.loaderResultObservedByCaller, false);
  assert.equal(report.scriptBehavior.startReturnContract, "void");
  assert.equal(
    report.scriptBehavior.postStateReadGate,
    "final flag WORD == 1 exactly",
  );
  for (const vector of report.testVectors) {
    assert.deepEqual(vector.result, vector.expected, vector.id);
  }
});

test("replays raw-relation blocker active, flag, and relation boundaries", () => {
  const relationValue = (owner) => (owner === -1 ? 3 : 7);
  const accepted = {
    slotIndex: 1,
    slotTableWord: 1,
    recordPositiveWord: 1,
    flags74: 0x00020002,
    ownerSignedByte: -1,
  };

  assert.equal(
    evaluateRawRelationBlocker({
      activeCount: 1,
      activeEntries: [accepted],
      currentPlayer: 1,
      relationValue,
    }),
    1,
  );
  assert.equal(
    evaluateRawRelationBlocker({
      activeCount: 1,
      activeEntries: [{ ...accepted, flags74: 0 }],
      currentPlayer: 1,
      relationValue,
    }),
    0,
  );
  assert.equal(
    evaluateRawRelationBlocker({
      activeCount: 1,
      activeEntries: [{ ...accepted, slotTableWord: 0 }],
      currentPlayer: 1,
      relationValue,
    }),
    0,
  );
  assert.equal(
    evaluateRawRelationBlocker({
      activeCount: 1,
      activeEntries: [{ ...accepted, recordPositiveWord: 0 }],
      currentPlayer: 1,
      relationValue,
    }),
    0,
  );
  assert.equal(
    evaluateRawRelationBlocker({
      activeCount: 0,
      activeEntries: [],
      currentPlayer: 1,
      relationValue,
    }),
    0,
  );
  assert.equal(
    evaluateRawRelationBlocker({
      activeCount: 1,
      activeEntries: [accepted],
      currentPlayer: -1,
      relationValue,
    }),
    0,
  );
});

test("replays loader 0/1, void start, and native effect order", () => {
  for (const loadResult of [0, 1]) {
    const idle = runK01BeaconTrigger({
      blockerPresent: false,
      initialFlagWord: 0,
      currentPlayer: -1,
      records: [completedBeacon],
      scriptBusyResults: [0],
      loadResults: [loadResult],
      descriptorAllocationResults: Array(9).fill(1),
      scriptPostState: 0,
    });
    assert.equal(idle.returnValue, 1);
    assert.deepEqual(idle.matches, [7]);
    assert.deepEqual(
      idle.events.map(({ kind }) => kind),
      [
        "flag-write",
        "script-busy-read",
        "script-load",
        "script-start",
        "descriptor-create-helper",
        "selector-five",
        "raw-byte-write",
        "raw-coordinate-write",
        "script-post-state-read",
      ],
    );
    assert.deepEqual(idle.events[2], {
      kind: "script-load",
      index: 7,
      path: "script\\k0120",
      returnValue: loadResult,
      callerChecked: false,
    });
    assert.deepEqual(idle.events[3], {
      kind: "script-start",
      index: 7,
    });
    assert.deepEqual(idle.events[6], {
      kind: "raw-byte-write",
      index: 7,
      address: "0x00abfff2",
      value: 1,
    });
    assert.deepEqual(idle.events[7].values, {
      "0x00843674": 1,
      "0x00843678": 55,
      "0x0084367c": 53,
    });
  }

  const busy = runK01BeaconTrigger({
    blockerPresent: false,
    initialFlagWord: 0,
    currentPlayer: -1,
    records: [completedBeacon],
    scriptBusyResults: [1],
    loadResults: [],
    descriptorAllocationResults: Array(9).fill(1),
    scriptPostState: 1,
  });
  assert.equal(busy.returnValue, 0);
  assert.equal(
    busy.events.some(({ kind }) => kind === "script-load"),
    false,
  );
  assert.equal(
    busy.events.some(({ kind }) => kind === "script-start"),
    false,
  );
  assert.deepEqual(
    busy.events.slice(2).map(({ kind }) => kind),
    [
      "descriptor-create-helper",
      "selector-five",
      "raw-byte-write",
      "raw-coordinate-write",
      "script-post-state-read",
    ],
  );
});

test("keeps scanning after a match and repeats the complete block for same-scan matches", () => {
  const result = runK01BeaconTrigger({
    blockerPresent: false,
    initialFlagWord: 0,
    currentPlayer: -1,
    records: [
      completedBeacon,
      { ...completedBeacon, index: 0x4af },
    ],
    scriptBusyResults: [1, 0],
    loadResults: [1],
    descriptorAllocationResults: Array(18).fill(1),
    scriptPostState: 0,
  });

  assert.deepEqual(result.matches, [7, 0x4af]);
  assert.deepEqual(
    result.events.map(({ kind, index }) => [kind, index]),
    [
      ["flag-write", 7],
      ["script-busy-read", 7],
      ["descriptor-create-helper", 7],
      ["selector-five", 7],
      ["raw-byte-write", 7],
      ["raw-coordinate-write", 7],
      ["flag-write", 0x4af],
      ["script-busy-read", 0x4af],
      ["script-load", 0x4af],
      ["script-start", 0x4af],
      ["descriptor-create-helper", 0x4af],
      ["selector-five", 0x4af],
      ["raw-byte-write", 0x4af],
      ["raw-coordinate-write", 0x4af],
      ["script-post-state-read", undefined],
    ],
  );
  assert.deepEqual(result.events[1], {
    kind: "script-busy-read",
    index: 7,
    value: 1,
  });
  assert.deepEqual(result.events[7], {
    kind: "script-busy-read",
    index: 0x4af,
    value: 0,
  });
  assert.deepEqual(result.events[8], {
    kind: "script-load",
    index: 0x4af,
    path: "script\\k0120",
    returnValue: 1,
    callerChecked: false,
  });
  assert.deepEqual(result.events[9], {
    kind: "script-start",
    index: 0x4af,
  });
  assert.deepEqual(result.events.at(-1), {
    kind: "script-post-state-read",
    value: 0,
  });
  assert.equal(result.returnValue, 1);
});

test("distinguishes blocker, nonzero flag, exact flag one, and every scan match field", () => {
  const variants = [
    { field: "slotTableWord", value: 0 },
    { field: "healthSignedWord", value: 0 },
    { field: "healthSignedWord", value: -1 },
    { field: "activeByte", value: 0 },
    { field: "ownerSignedByte", value: 0 },
    { field: "classByte", value: 51 },
    { field: "progressByte", value: 99 },
  ];
  for (const { field, value } of variants) {
    const result = runK01BeaconTrigger({
      blockerPresent: false,
      initialFlagWord: 0,
      currentPlayer: -1,
      records: [{ ...completedBeacon, [field]: value }],
      scriptBusyResults: [],
      loadResults: [],
      descriptorAllocationResults: [],
    });
    assert.deepEqual(result.matches, [], field);
    assert.equal(result.flagWord, 0, field);
    assert.equal(result.returnValue, 0, field);
  }

  const blocked = runK01BeaconTrigger({
    blockerPresent: true,
    initialFlagWord: 0,
    currentPlayer: -1,
    records: [completedBeacon],
    scriptBusyResults: [],
    loadResults: [],
    descriptorAllocationResults: [],
  });
  assert.equal(blocked.scanRan, false);
  assert.deepEqual(blocked.events, []);

  for (const initialFlagWord of [0, 2, 0xffff]) {
    const result = runK01BeaconTrigger({
      blockerPresent: false,
      initialFlagWord,
      currentPlayer: -1,
      records: [],
      scriptBusyResults: [],
      loadResults: [],
      descriptorAllocationResults: [],
    });
    assert.equal(result.scanRan, initialFlagWord === 0);
    assert.equal(result.returnValue, 0);
    assert.equal(
      result.events.some(({ kind }) => kind === "script-post-state-read"),
      false,
    );
  }

  const exactOne = runK01BeaconTrigger({
    blockerPresent: false,
    initialFlagWord: 1,
    currentPlayer: -1,
    records: [],
    scriptBusyResults: [],
    loadResults: [],
    descriptorAllocationResults: [],
    scriptPostState: 0,
  });
  assert.equal(exactOne.returnValue, 1);
  assert.deepEqual(exactOne.events, [
    { kind: "script-post-state-read", value: 0 },
  ]);
  assert.throws(
    () =>
      runK01BeaconTrigger({
        blockerPresent: false,
        initialFlagWord: 1,
        currentPlayer: -1,
        records: [],
        scriptBusyResults: [],
        loadResults: [],
        descriptorAllocationResults: [],
      }),
    /scriptPostState is required when the final flag word is exactly 1/,
  );
});

test("replays descriptor allocation exhaustion, coordinate bounds, and prior creation retention", () => {
  const allocations = [1, 2, 0];
  const exhausted = createDescriptorEntities({
    originX: 55,
    originY: 53,
    rawArgument: 0x10,
    mapWidth: 180,
    mapHeight: 180,
    allocateSlot: (_, index) => allocations[index],
  });
  assert.equal(exhausted.returnValue, 0);
  assert.deepEqual(
    exhausted.creations.map(({ entityClass, slot, x, y }) => ({
      entityClass,
      slot,
      x,
      y,
    })),
    [
      { entityClass: 13, slot: 1, x: 53, y: 51 },
      { entityClass: 82, slot: 2, x: 55, y: 51 },
    ],
  );

  const compositeExhausted = runK01BeaconTrigger({
    blockerPresent: false,
    initialFlagWord: 0,
    currentPlayer: -1,
    records: [completedBeacon],
    scriptBusyResults: [1],
    loadResults: [],
    descriptorAllocationResults: allocations,
    scriptPostState: 0,
  });
  assert.deepEqual(
    compositeExhausted.events.map(({ kind }) => kind),
    [
      "flag-write",
      "script-busy-read",
      "descriptor-create-helper",
      "selector-five",
      "raw-byte-write",
      "raw-coordinate-write",
      "script-post-state-read",
    ],
  );
  assert.equal(compositeExhausted.events[2].ignoredResult, 0);
  assert.deepEqual(
    compositeExhausted.events[2].creations.map(
      ({ entityClass, slot, x, y }) => ({ entityClass, slot, x, y }),
    ),
    [
      { entityClass: 13, slot: 1, x: 53, y: 51 },
      { entityClass: 82, slot: 2, x: 55, y: 51 },
    ],
  );
  assert.deepEqual(compositeExhausted.events.at(-1), {
    kind: "script-post-state-read",
    value: 0,
  });
  assert.equal(compositeExhausted.returnValue, 1);

  const bounded = createDescriptorEntities({
    originX: 1,
    originY: 1,
    rawArgument: 0x10,
    mapWidth: 4,
    mapHeight: 4,
    allocateSlot: (_, index) => index + 1,
  });
  assert.equal(bounded.returnValue, 1);
  assert.deepEqual(
    bounded.creations.map(({ index, x, y }) => ({ index, x, y })),
    [
      { index: 4, x: 1, y: 1 },
      { index: 5, x: 3, y: 1 },
      { index: 7, x: 1, y: 3 },
      { index: 8, x: 3, y: 3 },
    ],
  );
  assert.deepEqual(
    bounded.skippedOutOfBounds.map(({ index }) => index),
    [0, 1, 2, 3, 6],
  );

  for (const invalidSlot of [-1, 1200]) {
    assert.throws(
      () =>
        createDescriptorEntities({
          originX: 55,
          originY: 53,
          rawArgument: 0x10,
          mapWidth: 180,
          mapHeight: 180,
          allocateSlot: () => invalidSlot,
        }),
      /allocated slot for descriptor 0 must be an integer in 0\.\.1199/,
    );
  }
});

test("replays selector-five exact row spans, source-byte gate, and map clipping", () => {
  const all = applySelectorFivePattern({
    centerX: 10,
    centerY: 10,
    mapWidth: 30,
    mapHeight: 30,
    sourceValue: () => 1,
  });
  assert.equal(all.length, 75);
  assert.deepEqual(
    all.filter(({ y }) => y === 5).map(({ x }) => x),
    [9, 10, 11],
  );
  assert.deepEqual(
    all.filter(({ y }) => y === 10).map(({ x }) => x),
    [6, 7, 8, 9, 10, 11, 12, 13, 14],
  );
  assert.deepEqual(
    all.filter(({ y }) => y === 15).map(({ x }) => x),
    [9, 10, 11],
  );
  assert.ok(
    all.every(
      ({ firstGridAfter, secondGridAfter }) =>
        firstGridAfter === 0 && secondGridAfter === 1,
    ),
  );

  const clipped = applySelectorFivePattern({
    centerX: 0,
    centerY: 0,
    mapWidth: 3,
    mapHeight: 3,
    sourceValue: (x, y) => (x === 1 && y === 1 ? 1 : 0),
  });
  assert.deepEqual(clipped, [
    { x: 1, y: 1, firstGridAfter: 0, secondGridAfter: 1 },
  ]);
});

test("rejects invalid fixed-width inputs and malformed descriptor contracts loudly", () => {
  assert.throws(
    () =>
      runK01BeaconTrigger({
        blockerPresent: 0,
        initialFlagWord: 0,
        currentPlayer: 0,
        records: [],
        scriptBusyResults: [],
        loadResults: [],
        descriptorAllocationResults: [],
      }),
    /blockerPresent must be a boolean/,
  );
  assert.throws(
    () =>
      runK01BeaconTrigger({
        blockerPresent: false,
        initialFlagWord: 0x10000,
        currentPlayer: 0,
        records: [],
        scriptBusyResults: [],
        loadResults: [],
        descriptorAllocationResults: [],
      }),
    /initialFlagWord must be an integer in 0\.\.65535/,
  );
  assert.throws(
    () =>
      evaluateRawRelationBlocker({
        activeCount: 2,
        activeEntries: [],
        currentPlayer: 0,
        relationValue: () => 0,
      }),
    /activeEntries must contain at least activeCount/,
  );
  assert.throws(
    () =>
      runK01BeaconTrigger({
        blockerPresent: false,
        initialFlagWord: 0,
        currentPlayer: -1,
        records: [completedBeacon],
        scriptBusyResults: [],
        loadResults: [],
        descriptorAllocationResults: [],
      }),
    /scriptBusyResults\[0\] is required for this path/,
  );
  assert.throws(
    () =>
      runK01BeaconTrigger({
        blockerPresent: false,
        initialFlagWord: 0,
        currentPlayer: -1,
        records: [completedBeacon],
        scriptBusyResults: [0],
        loadResults: [2],
        descriptorAllocationResults: Array(9).fill(1),
        scriptPostState: 0,
      }),
    /loadResults\[0\] must be an integer in 0\.\.1/,
  );
  for (const [field, value, expected] of [
    ["slotTableWord", 0x10000, /slotTableWord must be an integer in 0\.\.65535/],
    ["healthSignedWord", 0x8000, /healthSignedWord must be an integer in -32768\.\.32767/],
    ["activeByte", 0x100, /activeByte must be an integer in 0\.\.255/],
  ]) {
    assert.throws(
      () =>
        runK01BeaconTrigger({
          blockerPresent: false,
          initialFlagWord: 2,
          currentPlayer: -1,
          records: [{ ...completedBeacon, [field]: value }],
          scriptBusyResults: [],
          loadResults: [],
          descriptorAllocationResults: [],
        }),
      expected,
    );
  }
  for (const invalidSlot of [-1, 1200]) {
    assert.throws(
      () =>
        runK01BeaconTrigger({
          blockerPresent: false,
          initialFlagWord: 0,
          currentPlayer: -1,
          records: [completedBeacon],
          scriptBusyResults: [1],
          loadResults: [],
          descriptorAllocationResults: [invalidSlot],
          scriptPostState: 0,
        }),
      /descriptorAllocationResults\[0\] must be an integer in 0\.\.1199/,
    );
  }
  assert.throws(
    () =>
      createDescriptorEntities({
        originX: 0,
        originY: 0,
        rawArgument: 0x10,
        mapWidth: 10,
        mapHeight: 10,
        descriptors: [[1, 2], [0]],
        allocateSlot: () => 1,
      }),
    /must contain four signed words/,
  );
  assert.throws(
    () =>
      createDescriptorEntities({
        originX: 0,
        originY: 0,
        rawArgument: 0x10,
        mapWidth: 10,
        mapHeight: 10,
        descriptors: [[1, 1, 0, 0]],
        allocateSlot: () => 1,
      }),
    /missing its class-zero terminator/,
  );
});

test("rejects stale analysis, tampered CFG data, executable bytes, and K0120 content", (t) => {
  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), "k01-beacon-k0120-trigger-"),
  );
  t.after(() =>
    rmSync(temporaryDirectory, { recursive: true, force: true }),
  );

  const staleSeeds = readJson("seeds.json");
  staleSeeds.sourceSha256 = "0".repeat(64);
  const staleSeedsPath = writeJson(
    temporaryDirectory,
    "stale-seeds.json",
    staleSeeds,
  );
  assert.throws(
    () => extractK01BeaconK0120Trigger({ seeds: staleSeedsPath }),
    /canonical analysis source SHA-256 mismatch/,
  );

  const tamperedSeeds = readJson("seeds.json");
  const mission = tamperedSeeds.functions.find(
    ({ entry }) => entry === "0x0048a5c0",
  );
  mission.instructions.find(
    ({ address }) => address === "0x0048a7ae",
  ).text = "CALL 0x004884c0";
  const tamperedSeedsPath = writeJson(
    temporaryDirectory,
    "tampered-seeds.json",
    tamperedSeeds,
  );
  assert.throws(
    () => extractK01BeaconK0120Trigger({ seeds: tamperedSeedsPath }),
    /Missing call edge 0x0048a7ae/,
  );

  const tamperedJumpTables = readJson("jump-tables.json");
  const selectorTable = tamperedJumpTables.tables.find(
    ({ functionEntry }) => functionEntry === "0x00442ca0",
  );
  selectorTable.cases.find(({ label }) => label === 5).destination =
    "0x00442cce";
  const tamperedJumpTablesPath = writeJson(
    temporaryDirectory,
    "tampered-jump-tables.json",
    tamperedJumpTables,
  );
  assert.throws(
    () =>
      extractK01BeaconK0120Trigger({
        jumpTables: tamperedJumpTablesPath,
      }),
    /does not map selector 5/,
  );

  const tamperedExecutablePath = join(
    temporaryDirectory,
    "tampered.exe",
  );
  copyFileSync(executablePath, tamperedExecutablePath);
  const executable = readFileSync(tamperedExecutablePath);
  executable[0x8a724] ^= 0xff;
  writeFileSync(tamperedExecutablePath, executable);
  assert.throws(
    () => extractK01BeaconK0120Trigger({ input: tamperedExecutablePath }),
    /original executable SHA-256 mismatch/,
  );

  const tamperedScriptPath = join(temporaryDirectory, "K0120");
  copyFileSync(scriptPath, tamperedScriptPath);
  const script = readFileSync(tamperedScriptPath);
  script[0xf0] ^= 1;
  writeFileSync(tamperedScriptPath, script);
  assert.throws(
    () => extractK01BeaconK0120Trigger({ script: tamperedScriptPath }),
    /K0120 SHA-256 mismatch/,
  );
});

function readJson(name) {
  return JSON.parse(readFileSync(join(analysisDirectory, name), "utf8"));
}

function writeJson(directory, name, value) {
  const path = join(directory, name);
  writeFileSync(path, `${JSON.stringify(value)}\n`);
  return path;
}
