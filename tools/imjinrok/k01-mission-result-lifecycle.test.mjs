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
  evaluateGeneralPresence,
  extractK01MissionResultLifecycle,
  fullReferenceIsAlive,
  resolveMissionTimers,
  runDistinctRawTickResultCommit,
  runK01MissionDispatcher,
  runK01MissionUpdateResultPath,
  selectOwnerClassReference,
} from "./extract-k01-mission-result-lifecycle.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const analysisDirectory = join(
  repositoryRoot,
  "analysis/generated/imjinrok2",
);
const executablePath = join(
  repositoryRoot,
  "original/imjinrok2/imjinrok2.exe",
);

const acceptedPresenceEntry = {
  slotIndex: 3,
  slotTableWord: 1,
  recordPositiveWord: 1,
  flags74: 0x00020002,
  ownerSignedByte: -1,
};

function heroInput(classByte, overrides = {}) {
  const fullReference = 0x00020003;
  return {
    listCount: 1,
    entries: [
      {
        fullReference,
        slotTableWord: 1,
        recordPositiveWord: 1,
        recordClassByte: classByte,
      },
    ],
    fallbackReference: 0,
    record: {
      slotTableWord: 1,
      healthSignedWord: 1,
      storedFullReference: fullReference,
    },
    ...overrides,
  };
}

test("extracts exact K01 updater, timer, dispatcher, and distinct-tick evidence", () => {
  const report = extractK01MissionResultLifecycle();

  assert.equal(
    report.question,
    "For K01, in what exact order and under what raw conditions does FUN_0048a5c0 first latch DWORD 0x00843740 for the general-presence and protected-hero failures, how can its beacon post-state return bypass the hero checks, how does FUN_0048d6f0 resolve DWORD 0x0084373c/0x00843740 across the strict 0x7d0 boundary, signed DWORD subtraction/absolute-value overflow and simultaneous timers, and how do FUN_0048ddb0 and FUN_004481d0 gate, notify, and commit the final result once per distinct raw global tick?",
  );
  assert.equal(
    report.source.sha256,
    "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e",
  );
  assert.equal(
    report.evidenceStatus,
    "static-proven-k01-mission-result-lifecycle",
  );
  assert.equal(report.reproductionStatus, "reproduction-complete");
  assert.equal(
    report.integrationStatus,
    "gated-no-raw-clock-result-transition-or-identity-policy-mapping",
  );
  assert.equal(report.analyzedFunctions.length, 9);
  assert.equal(report.callEdges.length, 13);
  assert.equal(report.codeAnchors.length, 7);
  assert.ok(report.codeAnchors.every(({ matched }) => matched));
  assert.deepEqual(
    report.analyzedFunctions.map(
      ({ entry, instructionCount, basicBlockCount }) => ({
        entry,
        instructionCount,
        basicBlockCount,
      }),
    ),
    [
      { entry: "0x004481d0", instructionCount: 21, basicBlockCount: 6 },
      { entry: "0x00488080", instructionCount: 32, basicBlockCount: 7 },
      { entry: "0x004492f0", instructionCount: 2, basicBlockCount: 1 },
      { entry: "0x0048d6f0", instructionCount: 31, basicBlockCount: 7 },
      { entry: "0x0048ddb0", instructionCount: 105, basicBlockCount: 36 },
      { entry: "0x0048a5c0", instructionCount: 181, basicBlockCount: 32 },
      { entry: "0x004885e0", instructionCount: 53, basicBlockCount: 7 },
      { entry: "0x00441de0", instructionCount: 30, basicBlockCount: 8 },
      { entry: "0x00441db0", instructionCount: 12, basicBlockCount: 3 },
    ],
  );
  assert.deepEqual(report.scopedReferences.k01WinTimer.references, []);
  assert.deepEqual(
    report.scopedReferences.k01LossTimer.references.map(
      ({ from, type }) => [from, type],
    ),
    [
      ["0x0048a710", "READ"],
      ["0x0048a71e", "WRITE"],
      ["0x0048a82e", "READ"],
      ["0x0048a83b", "WRITE"],
      ["0x0048a85c", "READ"],
      ["0x0048a86a", "WRITE"],
    ],
  );
  assert.deepEqual(report.stageDispatch, {
    switchAddress: "0x0048de0b",
    caseCount: 27,
    k01Label: 1,
    k01Destination: "0x0048de12",
    k01CallSite: "0x0048de12",
    k01Callee: "0x0048a5c0",
  });
  assert.equal(
    report.k01Updater.generalPresenceReproductionContract,
    "each active-list entry carries its signed slot index and the explicit slot-table/record raw values selected by that index",
  );
  assert.equal(
    report.k01Updater.ownerClassReproductionContract,
    "entries are the explicit raw list selected by signed owner WORD; the helper validates that selector and reproduces the list scan",
  );
  assert.deepEqual(report.testVectors, [
    {
      id: "strict-boundary-2000",
      input: { winTimer: 1, lossTimer: 0, resultClock: 2001 },
      result: 0,
      distances: [
        {
          timer: "win",
          delta: 2000,
          absoluteBits: 2000,
          absoluteSigned: 2000,
        },
      ],
    },
    {
      id: "strict-boundary-2001",
      input: { winTimer: 1, lossTimer: 0, resultClock: 2002 },
      result: 1,
      distances: [
        {
          timer: "win",
          delta: 2001,
          absoluteBits: 2001,
          absoluteSigned: 2001,
        },
      ],
    },
    {
      id: "signed-absolute-minimum-overflow",
      input: {
        winTimer: 1,
        lossTimer: 0,
        resultClock: 0x80000001,
      },
      result: 0,
      distances: [
        {
          timer: "win",
          delta: 0x80000000,
          absoluteBits: 0x80000000,
          absoluteSigned: -0x80000000,
        },
      ],
    },
    {
      id: "win-immature-loss-mature",
      input: { winTimer: 100, lossTimer: 1, resultClock: 2002 },
      result: -1,
      distances: [
        {
          timer: "win",
          delta: 1902,
          absoluteBits: 1902,
          absoluteSigned: 1902,
        },
        {
          timer: "loss",
          delta: 2001,
          absoluteBits: 2001,
          absoluteSigned: 2001,
        },
      ],
    },
  ]);
});

test("replays the complete raw active-list general-presence predicate", () => {
  for (const flags74 of [0x00000002, 0x00020000]) {
    assert.equal(
      evaluateGeneralPresence({
        activeCount: 1,
        activeEntries: [{ ...acceptedPresenceEntry, flags74 }],
        currentPlayer: -1,
      }),
      1,
      `either independent TEST mask bit accepts: flags74=0x${flags74.toString(16)}`,
    );
  }
  for (const [field, value] of [
    ["slotTableWord", 0],
    ["recordPositiveWord", 0],
    ["recordPositiveWord", -1],
    ["flags74", 0],
    ["ownerSignedByte", 1],
  ]) {
    assert.equal(
      evaluateGeneralPresence({
        activeCount: 1,
        activeEntries: [
          { ...acceptedPresenceEntry, [field]: value },
        ],
        currentPlayer: -1,
      }),
      0,
      `${field}=${value}`,
    );
  }
  assert.equal(
    evaluateGeneralPresence({
      activeCount: 0,
      activeEntries: [],
      currentPlayer: -1,
    }),
    0,
  );
  assert.equal(
    evaluateGeneralPresence({
      activeCount: -1,
      activeEntries: [],
      currentPlayer: -1,
    }),
    0,
  );
});

test("replays owner/class first-match lookup and full-reference alive gates", () => {
  const firstReference = 0x00020003;
  const secondReference = 0x00030004;
  assert.equal(
    selectOwnerClassReference({
      ownerSignedWord: -1,
      listCount: 3,
      entries: [
        {
          fullReference: 1,
          slotTableWord: 0,
          recordPositiveWord: 1,
          recordClassByte: 76,
        },
        {
          fullReference: firstReference,
          slotTableWord: 1,
          recordPositiveWord: 1,
          recordClassByte: 76,
        },
        {
          fullReference: secondReference,
          slotTableWord: 1,
          recordPositiveWord: 1,
          recordClassByte: 76,
        },
      ],
      classByte: 76,
      fallbackReference: 0xdeadbeef,
    }),
    firstReference,
  );
  assert.equal(
    selectOwnerClassReference({
      ownerSignedWord: -1,
      listCount: 0,
      entries: [],
      classByte: 76,
      fallbackReference: 0xdeadbeef,
    }),
    0xdeadbeef,
  );
  assert.equal(
    fullReferenceIsAlive({
      reference: firstReference,
      slotTableWord: 1,
      healthSignedWord: 1,
      storedFullReference: firstReference,
    }),
    1,
  );
  for (const input of [
    {
      reference: firstReference,
      slotTableWord: 0,
      healthSignedWord: 1,
      storedFullReference: firstReference,
    },
    {
      reference: firstReference,
      slotTableWord: 1,
      healthSignedWord: 0,
      storedFullReference: firstReference,
    },
    {
      reference: firstReference,
      slotTableWord: 1,
      healthSignedWord: -1,
      storedFullReference: firstReference,
    },
    {
      reference: firstReference,
      slotTableWord: 1,
      healthSignedWord: 1,
      storedFullReference: secondReference,
    },
  ]) {
    assert.equal(fullReferenceIsAlive(input), 0);
  }
});

test("latches general then hero failures with zero-sentinel and beacon bypass order", () => {
  const bypass = runK01MissionUpdateResultPath({
    lossTimer: 0,
    resultClock: 123,
    currentPlayer: -1,
    activeCount: 0,
    activeEntries: [],
    beaconReturn: 1,
    hero76: heroInput(76),
    hero78: heroInput(78),
  });
  assert.equal(bypass.returnAx, 1);
  assert.equal(bypass.lossTimer, 123);
  assert.deepEqual(bypass.events, [
    { kind: "general-presence-result", value: 0 },
    {
      kind: "loss-timer-write",
      reason: "general-presence",
      value: 123,
    },
    { kind: "beacon-result", value: 1 },
  ]);

  const firstWriteWins = runK01MissionUpdateResultPath({
    lossTimer: 0,
    resultClock: 123,
    currentPlayer: -1,
    activeCount: 0,
    activeEntries: [],
    beaconReturn: 0,
    hero76: heroInput(76, {
      record: {
        slotTableWord: 1,
        healthSignedWord: 0,
        storedFullReference: 0x00020003,
      },
    }),
    hero78: heroInput(78, {
      record: {
        slotTableWord: 1,
        healthSignedWord: 0,
        storedFullReference: 0x00020003,
      },
    }),
  });
  assert.equal(firstWriteWins.lossTimer, 123);
  assert.deepEqual(
    firstWriteWins.events
      .filter(({ kind }) => kind === "loss-timer-write")
      .map(({ reason, value }) => [reason, value]),
    [["general-presence", 123]],
  );
  assert.deepEqual(
    firstWriteWins.events
      .filter(({ kind }) => kind === "hero-reference-lookup")
      .map(({ hero }) => hero),
    ["class-76", "class-78"],
  );

  const existingTimer = runK01MissionUpdateResultPath({
    lossTimer: 77,
    resultClock: 123,
    currentPlayer: -1,
    activeCount: 0,
    activeEntries: [],
    beaconReturn: 0,
    hero76: heroInput(76, {
      record: {
        slotTableWord: 0,
        healthSignedWord: 1,
        storedFullReference: 0x00020003,
      },
    }),
    hero78: heroInput(78, {
      record: {
        slotTableWord: 0,
        healthSignedWord: 1,
        storedFullReference: 0x00020003,
      },
    }),
  });
  assert.equal(existingTimer.lossTimer, 77);
  assert.equal(
    existingTimer.events.some(
      ({ kind }) => kind === "loss-timer-write",
    ),
    false,
  );

  const zeroClock = runK01MissionUpdateResultPath({
    lossTimer: 0,
    resultClock: 0,
    currentPlayer: -1,
    activeCount: 0,
    activeEntries: [],
    beaconReturn: 0,
    hero76: heroInput(76, {
      record: {
        slotTableWord: 0,
        healthSignedWord: 1,
        storedFullReference: 0x00020003,
      },
    }),
    hero78: heroInput(78, {
      record: {
        slotTableWord: 0,
        healthSignedWord: 1,
        storedFullReference: 0x00020003,
      },
    }),
  });
  assert.equal(zeroClock.lossTimer, 0);
  assert.deepEqual(
    zeroClock.events
      .filter(({ kind }) => kind === "loss-timer-write")
      .map(({ reason, value }) => [reason, value]),
    [
      ["general-presence", 0],
      ["class-76", 0],
      ["class-78", 0],
    ],
  );
});

test("replays strict timer boundary, wrap, overflow, and simultaneous priority", () => {
  for (const [distance, expected] of [
    [2000, 0],
    [2001, 1],
  ]) {
    assert.equal(
      resolveMissionTimers({
        winTimer: 1,
        lossTimer: 0,
        resultClock: 1 + distance,
      }).result,
      expected,
    );
  }
  for (const [distance, expected] of [
    [2000, 0],
    [2001, -1],
  ]) {
    assert.equal(
      resolveMissionTimers({
        winTimer: 0,
        lossTimer: 1,
        resultClock: 1 + distance,
      }).result,
      expected,
      `loss timer distance ${distance}`,
    );
  }
  assert.equal(
    resolveMissionTimers({
      winTimer: 101,
      lossTimer: 0,
      resultClock: 100,
    }).events.find(({ kind }) => kind === "timer-distance").absoluteSigned,
    1,
  );
  assert.equal(
    resolveMissionTimers({
      winTimer: (1 - 2001) >>> 0,
      lossTimer: 0,
      resultClock: 1,
    }).result,
    1,
  );
  assert.deepEqual(
    resolveMissionTimers({
      winTimer: 1,
      lossTimer: 0,
      resultClock: 0x80000001,
    }).events.find(({ kind }) => kind === "timer-distance"),
    {
      kind: "timer-distance",
      timer: "win",
      delta: 0x80000000,
      absoluteBits: 0x80000000,
      absoluteSigned: -0x80000000,
    },
  );
  const bothMature = resolveMissionTimers({
    winTimer: 1,
    lossTimer: 1,
    resultClock: 2002,
  });
  assert.equal(bothMature.result, 1);
  assert.equal(
    bothMature.events.some(
      ({ kind, timer }) => kind === "timer-read" && timer === "loss",
    ),
    false,
  );
  assert.equal(
    resolveMissionTimers({
      winTimer: 100,
      lossTimer: 1,
      resultClock: 2002,
    }).result,
    -1,
  );
});

test("applies dispatcher pre-gates and timer-before-K01 order exactly", () => {
  const base = {
    gateC06e34: 0,
    gate7c627c: 0,
    gate7c627e: 0,
    winTimer: 0,
    lossTimer: 0,
    resultClock: 0,
    stageSelector: 1,
  };
  assert.equal(
    runK01MissionDispatcher({
      ...base,
      gateC06e34: 1,
      runK01Updater: () => assert.fail("updater must not run"),
    }).resultAx,
    0,
  );
  assert.equal(
    runK01MissionDispatcher({
      ...base,
      gate7c627c: 1,
      runK01Updater: () => assert.fail("updater must not run"),
    }).resultAx,
    1,
  );
  assert.equal(
    runK01MissionDispatcher({
      ...base,
      gate7c627e: 1,
      runK01Updater: () => assert.fail("updater must not run"),
    }).resultAx,
    0xffff,
  );

  const firstGateWins = runK01MissionDispatcher({
    ...base,
    gateC06e34: 1,
    gate7c627c: 1,
    gate7c627e: 1,
    winTimer: 1,
    lossTimer: 1,
    resultClock: 2002,
    runK01Updater: () => assert.fail("updater must not run"),
  });
  assert.equal(firstGateWins.resultAx, 0);
  assert.equal(firstGateWins.timerCommitFlag, undefined);
  assert.equal(
    firstGateWins.events.some(
      ({ kind }) => kind === "timer-result-global-flag-write",
    ),
    false,
  );

  const victoryGateWins = runK01MissionDispatcher({
    ...base,
    gate7c627c: 1,
    gate7c627e: 1,
    winTimer: 1,
    lossTimer: 1,
    resultClock: 2002,
    runK01Updater: () => assert.fail("updater must not run"),
  });
  assert.equal(victoryGateWins.resultAx, 1);
  assert.equal(victoryGateWins.timerCommitFlag, undefined);
  assert.equal(
    victoryGateWins.events.some(
      ({ kind }) => kind === "timer-result-global-flag-write",
    ),
    false,
  );

  let updaterCalled = false;
  const maturedLoss = runK01MissionDispatcher({
    ...base,
    lossTimer: 1,
    resultClock: 2002,
    runK01Updater() {
      updaterCalled = true;
      return { returnAx: 1, events: [] };
    },
  });
  assert.equal(updaterCalled, false);
  assert.equal(maturedLoss.resultAx, 0xffff);
  assert.equal(maturedLoss.timerCommitFlag, 1);
  assert.deepEqual(maturedLoss.events.at(-1), {
    kind: "timer-result-global-flag-write",
    address: "0x0055299c",
    value: 1,
  });

  const update = runK01MissionDispatcher({
    ...base,
    runK01Updater: () => ({
      returnAx: 1,
      events: [{ kind: "k01-update-observable" }],
    }),
  });
  assert.equal(update.resultAx, 1);
  assert.deepEqual(update.events.slice(-2), [
    { kind: "stage-dispatch", stageSelector: 1, target: "0x0048a5c0" },
    { kind: "k01-update-observable" },
  ]);
});

test("combines general-loss latch with beacon victory and bypasses matured loss before updater", () => {
  const updaterInput = {
    lossTimer: 0,
    resultClock: 500,
    currentPlayer: -1,
    activeCount: 0,
    activeEntries: [],
    beaconReturn: 1,
    hero76: heroInput(76),
    hero78: heroInput(78),
  };
  const dispatch = runK01MissionDispatcher({
    gateC06e34: 0,
    gate7c627c: 0,
    gate7c627e: 0,
    winTimer: 0,
    lossTimer: 0,
    resultClock: 500,
    stageSelector: 1,
    runK01Updater: () => runK01MissionUpdateResultPath(updaterInput),
  });
  assert.equal(dispatch.resultAx, 1);
  assert.deepEqual(
    dispatch.events
      .filter(({ kind }) =>
        ["loss-timer-write", "beacon-result"].includes(kind),
      ),
    [
      {
        kind: "loss-timer-write",
        reason: "general-presence",
        value: 500,
      },
      { kind: "beacon-result", value: 1 },
    ],
  );

  let updaterCalled = false;
  const defeat = runK01MissionDispatcher({
    gateC06e34: 0,
    gate7c627c: 0,
    gate7c627e: 0,
    winTimer: 0,
    lossTimer: 1,
    resultClock: 2002,
    stageSelector: 1,
    runK01Updater() {
      updaterCalled = true;
      return runK01MissionUpdateResultPath(updaterInput);
    },
  });
  assert.equal(defeat.resultAx, 0xffff);
  assert.equal(updaterCalled, false);
});

test("commits final result once per distinct raw global tick", () => {
  let calls = 0;
  const sameTick = runDistinctRawTickResultCommit({
    rawGlobalTick: 10,
    cachedGlobalTick: 10,
    runDispatcher() {
      calls += 1;
      return { resultAx: 1, events: [] };
    },
  });
  assert.equal(calls, 0);
  assert.deepEqual(sameTick, {
    returnValue: 0,
    cachedGlobalTick: 10,
    events: [],
  });

  const victory = runDistinctRawTickResultCommit({
    rawGlobalTick: 11,
    cachedGlobalTick: 10,
    runDispatcher: () => ({
      resultAx: 1,
      events: [{ kind: "dispatcher-observable" }],
    }),
  });
  assert.equal(victory.returnValue, 1);
  assert.deepEqual(
    victory.events.map(({ kind }) => kind),
    [
      "global-tick-cache-write",
      "mission-dispatcher-call",
      "dispatcher-observable",
      "raw-word-write",
      "result-code-write",
      "final-result-call",
    ],
  );
  assert.deepEqual(victory.events.slice(-3), [
    { kind: "raw-word-write", address: "0x007c6614", value: 1 },
    { kind: "result-code-write", address: "0x004bdfc8", value: 0x18 },
    { kind: "final-result-call", target: "0x00446420" },
  ]);

  const defeat = runDistinctRawTickResultCommit({
    rawGlobalTick: 12,
    cachedGlobalTick: 11,
    runDispatcher: () => ({ resultAx: 0xffff, events: [] }),
  });
  assert.deepEqual(defeat.events.slice(-2), [
    { kind: "result-code-write", address: "0x004bdfc8", value: 0x1a },
    { kind: "final-result-call", target: "0x00446420" },
  ]);
  assert.equal(defeat.returnValue, 1);

  const noResult = runDistinctRawTickResultCommit({
    rawGlobalTick: 13,
    cachedGlobalTick: 12,
    runDispatcher: () => ({ resultAx: 0, events: [] }),
  });
  assert.equal(noResult.returnValue, 0);
  assert.equal(noResult.cachedGlobalTick, 13);
  assert.deepEqual(
    noResult.events.map(({ kind }) => kind),
    ["global-tick-cache-write", "mission-dispatcher-call"],
  );
});

test("rejects malformed and out-of-width reproduction inputs loudly", () => {
  assert.throws(
    () =>
      selectOwnerClassReference({
        ownerSignedWord: 0x8000,
        listCount: 0,
        entries: [],
        classByte: 76,
        fallbackReference: 0,
      }),
    /ownerSignedWord must be an integer in -32768\.\.32767/,
  );
  assert.throws(
    () =>
      evaluateGeneralPresence({
        activeCount: 1,
        activeEntries: [],
        currentPlayer: 0,
      }),
    /activeEntries must contain at least activeCount/,
  );
  assert.throws(
    () =>
      evaluateGeneralPresence({
        activeCount: 1,
        activeEntries: [
          { ...acceptedPresenceEntry, ownerSignedByte: 128 },
        ],
        currentPlayer: 0,
      }),
    /ownerSignedByte must be an integer in -128\.\.127/,
  );
  assert.throws(
    () =>
      resolveMissionTimers({
        winTimer: -1,
        lossTimer: 0,
        resultClock: 0,
      }),
    /winTimer must be an integer in 0\.\.4294967295/,
  );
  assert.throws(
    () =>
      runK01MissionDispatcher({
        gateC06e34: 0,
        gate7c627c: 0,
        gate7c627e: 0,
        winTimer: 0,
        lossTimer: 0,
        resultClock: 0,
        stageSelector: 2,
        runK01Updater: () => ({ returnAx: 0, events: [] }),
      }),
    /only stageSelector 1 is within the K01 reproduction contract/,
  );
  assert.throws(
    () =>
      runDistinctRawTickResultCommit({
        rawGlobalTick: 0x100000000,
        cachedGlobalTick: 0,
        runDispatcher: () => ({ resultAx: 0, events: [] }),
      }),
    /rawGlobalTick must be an integer in 0\.\.4294967295/,
  );
});

test("rejects stale analysis and tampered CFG, references, jump-table, or executable", (t) => {
  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), "k01-mission-result-lifecycle-"),
  );
  t.after(() =>
    rmSync(temporaryDirectory, { recursive: true, force: true }),
  );

  const staleSeeds = readJson("seeds.json");
  staleSeeds.sourceSha256 = "0".repeat(64);
  assert.throws(
    () =>
      extractK01MissionResultLifecycle({
        seeds: writeJson(temporaryDirectory, "stale-seeds.json", staleSeeds),
      }),
    /seed CFG canonical analysis source SHA-256 mismatch/,
  );

  const missingSeeds = readJson("seeds.json");
  missingSeeds.functions = missingSeeds.functions.filter(
    ({ entry }) => entry !== "0x004481d0",
  );
  assert.throws(
    () =>
      extractK01MissionResultLifecycle({
        seeds: writeJson(
          temporaryDirectory,
          "missing-seeds.json",
          missingSeeds,
        ),
      }),
    /Ghidra seeds omit function 0x004481d0/,
  );

  const tamperedSeeds = readJson("seeds.json");
  tamperedSeeds.functions
    .find(({ entry }) => entry === "0x004481d0")
    .instructions.find(({ address }) => address === "0x004481e4").text =
    "CALL 0x0048ddc0";
  assert.throws(
    () =>
      extractK01MissionResultLifecycle({
        seeds: writeJson(
          temporaryDirectory,
          "tampered-seeds.json",
          tamperedSeeds,
        ),
      }),
    /Missing call edge 0x004481e4/,
  );

  const tamperedReferences = readJson("references.json");
  tamperedReferences.references.push({
    from: "0x0048a700",
    to: "0x0084373c",
    type: "WRITE",
    fromFunctionEntry: "0x0048a5c0",
  });
  assert.throws(
    () =>
      extractK01MissionResultLifecycle({
        references: writeJson(
          temporaryDirectory,
          "tampered-references.json",
          tamperedReferences,
        ),
      }),
    /k01WinTimer references/,
  );

  const tamperedJumpTables = readJson("jump-tables.json");
  tamperedJumpTables.tables
    .find(
      ({ functionEntry, switchAddress }) =>
        functionEntry === "0x0048ddb0" &&
        switchAddress === "0x0048de0b",
    )
    .cases.find(({ label }) => label === 1).destination = "0x0048de19";
  assert.throws(
    () =>
      extractK01MissionResultLifecycle({
        jumpTables: writeJson(
          temporaryDirectory,
          "tampered-jump-tables.json",
          tamperedJumpTables,
        ),
      }),
    /Mission stage 1 does not map to K01 call block/,
  );

  const tamperedExecutablePath = join(temporaryDirectory, "tampered.exe");
  copyFileSync(executablePath, tamperedExecutablePath);
  const executable = readFileSync(tamperedExecutablePath);
  executable[0x481d0] ^= 0xff;
  writeFileSync(tamperedExecutablePath, executable);
  assert.throws(
    () =>
      extractK01MissionResultLifecycle({
        input: tamperedExecutablePath,
      }),
    /original executable SHA-256 mismatch/,
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
