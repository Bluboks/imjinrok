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
  advanceTargetStateRelay,
  consumeFinalPostResult,
  consumeResultPoll,
  enterSharedPostResult,
  extractK01FinalResultTransition,
  initializeCommittedResultState,
  initializeResultPresentation,
  mapPresentationPollWrapperResult,
  pollResultPresentation,
  runResultPresentationCleanup,
  runSharedSessionTeardown,
} from "./extract-k01-final-result-transition.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const analysisDirectory = join(
  repositoryRoot,
  "analysis/generated/imjinrok2",
);
const executablePath = join(
  repositoryRoot,
  "original/imjinrok2/imjinrok2.exe",
);
const winLogoPath = join(
  repositoryRoot,
  "original/imjinrok2/yfnt/winlogo.spr",
);

const emptyCleanup = {
  spriteHandle: 0,
  audioHandle: 0,
  audioStopResult: 0,
};

test("extracts exact teardown, presentation, relay, and final routing evidence", () => {
  const report = extractK01FinalResultTransition();
  assert.equal(
    report.question,
    "For a K01 result already committed as raw state 0x18 or 0x1a, what exact shared teardown order has already run, how do main-loop states 0x18/0x19 and 0x1a/0x1b initialize and poll the two original result presentations across unsigned 32-bit timing and exact completion gates, how does the 0x8c→0x96 target-state relay reach the shared 0x1c/0x1d post-result path, and how does the final consumer route by external-mode, result flag, campaign stage, WORD wrap, and overwrite precedence?",
  );
  assert.equal(
    report.source.sha256,
    "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e",
  );
  assert.equal(report.analyzedFunctions.length, 9);
  assert.equal(report.callEdges.length, 47);
  assert.equal(report.codeAnchors.length, 10);
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
      { entry: "0x00446420", instructionCount: 33, basicBlockCount: 9 },
      { entry: "0x0045f9c0", instructionCount: 801, basicBlockCount: 209 },
      { entry: "0x00493290", instructionCount: 5, basicBlockCount: 1 },
      { entry: "0x004932a0", instructionCount: 9, basicBlockCount: 1 },
      { entry: "0x004932c0", instructionCount: 5, basicBlockCount: 1 },
      { entry: "0x004932d0", instructionCount: 9, basicBlockCount: 1 },
      { entry: "0x004932f0", instructionCount: 69, basicBlockCount: 8 },
      { entry: "0x00493400", instructionCount: 99, basicBlockCount: 13 },
      { entry: "0x00493540", instructionCount: 25, basicBlockCount: 7 },
    ],
  );
  assert.deepEqual(
    report.mainLoopDispatch.resultStates.map(
      ({ rawState, label, destination }) => [rawState, label, destination],
    ),
    [
      ["0x00000018", 23, "0x00460164"],
      ["0x00000019", 24, "0x004601b9"],
      ["0x0000001a", 25, "0x004601c3"],
      ["0x0000001b", 26, "0x004601d6"],
      ["0x0000001c", 27, "0x004601e0"],
      ["0x0000001d", 28, "0x004601f3"],
    ],
  );
  assert.deepEqual(report.mainLoopDispatch.relayStates, [
    {
      rawState: "0x0000008c",
      label: 0x8c,
      destination: "0x00460525",
    },
    {
      rawState: "0x00000096",
      label: 0x96,
      destination: "0x00460538",
    },
  ]);
  assert.deepEqual(report.phaseTable.pairs, [
    [0, 0],
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
    [0, 5],
    [0, 6],
    [0, 7],
    [0, 8],
    [0, 9],
    [0, 10],
    [0, 11],
    [0, 12],
    [0, 13],
    [0, 14],
    [0, 15],
    [0, 16],
    [0, 17],
    [0, 18],
    [0, 19],
    [0, 20],
  ]);
  for (const id of ["winLogo", "loseLogo"]) {
    assert.deepEqual(report.sources[id].header, {
      width: 250,
      height: 100,
      frameCount: 28,
    });
  }
  assert.equal(
    report.tailEdge.text,
    "JMP 0x00482010",
  );
  assert.ok(report.teardown.sharedCallers.length > 2);
});

test("replays shared teardown exact predicates and event order", () => {
  const full = runSharedSessionTeardown({
    raw634ac0: 1,
    rawC06e20: 1,
    scriptPostState: 1,
    scriptBusy: 1,
  });
  assert.equal(full.tailJumped, true);
  assert.deepEqual(
    full.events.map(({ kind, target, address }) => [
      kind,
      target ?? address,
    ]),
    [
      ["write-dword", "0x004bdfbc"],
      ["write-word", "0x00bccc44"],
      ["write-dword", "0x00c06e74"],
      ["call", "0x004145b0"],
      ["call", "0x0046f870"],
      ["call", "0x004400b0"],
      ["call", "0x00483c30"],
      ["call", "0x00411190"],
      ["call", "0x00401ad0"],
      ["call", "0x00474ae0"],
      ["write-word", "0x00c06e20"],
      ["call-result", "0x00482390"],
      ["call", "0x004823d0"],
      ["call-result", "0x004823a0"],
      ["tail-jump", "0x00482010"],
    ],
  );

  const nonOne = runSharedSessionTeardown({
    raw634ac0: 2,
    rawC06e20: 2,
    scriptPostState: 2,
    scriptBusy: 2,
  });
  assert.equal(nonOne.tailJumped, false);
  for (const target of ["0x004145b0", "0x00474ae0", "0x004823d0", "0x00482010"]) {
    assert.equal(
      nonOne.events.some((event) => event.target === target),
      false,
      `${target} requires exact one`,
    );
  }
});

test("initializes exact win/loss assets and preserves one time sample", () => {
  const win = initializeResultPresentation({
    selector: 1,
    timeSample: 0xffffffff,
    spriteLoadResult: 0,
    audioHandle: 7,
  });
  assert.equal(win.spritePath, "yfnt\\winlogo.spr");
  assert.equal(win.audioPath, "music\\win.YAV");
  assert.equal(win.phase, 0);
  assert.equal(win.cadenceClock, 0xffffffff);
  assert.equal(win.startClock, 0xffffffff);
  assert.equal(
    win.events.filter(({ kind }) => kind === "timeGetTime").length,
    1,
  );
  assert.ok(
    win.events.some(({ kind }) => kind === "optional-load-failure-log"),
  );

  for (const selector of [0, 2, 0xffffffff]) {
    const loss = initializeResultPresentation({
      selector,
      timeSample: 3,
      spriteLoadResult: 1,
      audioHandle: 0,
    });
    assert.equal(loss.spritePath, "yfnt\\loselogo.spr");
    assert.equal(loss.audioPath, "music\\lose.YAV");
    assert.equal(
      loss.events.some(
        ({ kind }) => kind === "optional-load-failure-log",
      ),
      false,
    );
  }
});

test("replays committed state initialization and signed stage argument order", () => {
  assert.deepEqual(
    initializeCommittedResultState({
      currentState: 0x1a,
      stageWord: 0xffff,
      rawStageCompanionWord: 0x1234,
    }),
    {
      currentState: 0x1b,
      events: [
        { kind: "call", target: "0x004932c0", selector: 0 },
        { kind: "write-word", address: "0x004bdfc8", value: 0x1b },
      ],
    },
  );
  const stageZero = initializeCommittedResultState({
    currentState: 0x18,
    stageWord: 0,
    rawStageCompanionWord: 0xabcd,
  });
  assert.equal(stageZero.currentState, 0x19);
  assert.equal(stageZero.events.length, 2);

  const signedStage = initializeCommittedResultState({
    currentState: 0x18,
    stageWord: 0xffff,
    rawStageCompanionWord: 0x1234,
  });
  assert.deepEqual(signedStage.events[2], {
    kind: "signed-idiv-10",
    stageSignedWord: -1,
    quotient: 0,
    remainder: -1,
  });
  assert.deepEqual(signedStage.events[3], {
    kind: "call",
    target: "0x0043fbe0",
    rawPushOrder: [0xffffffff, 0xffff1234],
  });
});

test("replays unsigned cadence 50/51, phase 20, and separate samples", () => {
  const at50 = pollResultPresentation({
    activeDword: 1,
    uiHelperResult: 1,
    phase: 19,
    cadenceClock: 0,
    startClock: 0,
    timeSamples: [50, 2000],
    finishFlag: 0,
  });
  assert.equal(at50.phase, 19);
  assert.equal(at50.returnValue, 0);

  const at51 = pollResultPresentation({
    activeDword: 1,
    uiHelperResult: 1,
    phase: 19,
    cadenceClock: 0,
    startClock: 0,
    timeSamples: [51, 52, 2000],
    finishFlag: 0,
  });
  assert.equal(at51.phase, 20);
  assert.equal(at51.cadenceClock, 52);
  assert.deepEqual(
    at51.events
      .filter(({ kind }) => kind === "timeGetTime")
      .map(({ purpose, value }) => [purpose, value]),
    [
      ["cadence", 51],
      ["cadence-clock-update", 52],
      ["completion", 2000],
    ],
  );

  const phase20 = pollResultPresentation({
    activeDword: 1,
    uiHelperResult: 1,
    phase: 20,
    cadenceClock: 0,
    startClock: 0,
    timeSamples: [51, 2000],
    finishFlag: 0,
  });
  assert.equal(phase20.phase, 20);

  const wrappedCadence = pollResultPresentation({
    activeDword: 1,
    uiHelperResult: 1,
    phase: 0,
    cadenceClock: 0xfffffff0,
    startClock: 0,
    timeSamples: [0x23, 0x24, 2000],
    finishFlag: 0,
  });
  assert.equal(
    wrappedCadence.events.find(({ kind }) => kind === "cadence-delta").value,
    51,
  );
  assert.equal(wrappedCadence.phase, 1);
});

test("replays completion 2000/2001, unsigned wrap, and sequential keys", () => {
  const at2000 = pollResultPresentation({
    activeDword: 1,
    uiHelperResult: 0,
    phase: 0,
    cadenceClock: 0,
    startClock: 0,
    timeSamples: [2000],
    finishFlag: 1,
  });
  assert.equal(at2000.returnValue, 0);
  assert.equal(
    at2000.events.some(({ kind }) => kind === "finish-flag-read"),
    false,
  );

  const wrapped2001 = pollResultPresentation({
    activeDword: 1,
    uiHelperResult: 2,
    phase: 0,
    cadenceClock: 0,
    startClock: 0xfffffff0,
    timeSamples: [0x7c1],
    finishFlag: 1,
    cleanupInput: emptyCleanup,
  });
  assert.equal(wrapped2001.returnValue, 1);
  assert.equal(
    wrapped2001.events.find(({ kind }) => kind === "completion-delta").value,
    2001,
  );

  const enterKey = pollResultPresentation({
    activeDword: 1,
    uiHelperResult: 0,
    phase: 0,
    cadenceClock: 0,
    startClock: 0,
    timeSamples: [2001],
    finishFlag: 0,
    keyStates: [0, -1],
    cleanupInput: emptyCleanup,
  });
  assert.equal(enterKey.returnValue, 1);
  assert.deepEqual(
    enterKey.events
      .filter(({ kind }) => kind === "GetAsyncKeyState")
      .map(({ key, value }) => [key, value]),
    [
      [0x1b, 0],
      [0x0d, -1],
    ],
  );

  const none = pollResultPresentation({
    activeDword: 1,
    uiHelperResult: 0,
    phase: 0,
    cadenceClock: 0,
    startClock: 0,
    timeSamples: [2001],
    finishFlag: 0,
    keyStates: [0, 0, 0],
  });
  assert.equal(none.returnValue, 0);
});

test("keeps inactive and non-drawing paths exact and variants invariant", () => {
  assert.deepEqual(
    pollResultPresentation({
      activeDword: 0,
      uiHelperResult: 1,
      phase: 0,
      cadenceClock: 9,
      startClock: 9,
      timeSamples: [],
      finishFlag: 0,
    }),
    { returnValue: 0, phase: 0, cadenceClock: 9, events: [] },
  );
  const nonDrawing = pollResultPresentation({
    activeDword: 1,
    uiHelperResult: 2,
    phase: 3,
    cadenceClock: 5,
    startClock: 0,
    timeSamples: [2000],
    finishFlag: 0,
  });
  assert.equal(
    nonDrawing.events.some(({ kind }) => kind === "draw-table-pair"),
    false,
  );
  for (const eax of [0, 2, 0xffffffff]) {
    assert.equal(mapPresentationPollWrapperResult(eax), 0);
  }
  assert.equal(mapPresentationPollWrapperResult(1), 0x1c);
  assert.equal(
    consumeResultPoll({ currentState: 0x19, pollResultEax: 1 }).currentState,
    0x8c,
  );
  assert.equal(
    consumeResultPoll({ currentState: 0x1b, pollResultEax: 1 }).currentState,
    0x8c,
  );
});

test("replays cleanup exact-one branch and unconditional release order", () => {
  const exact = runResultPresentationCleanup({
    spriteHandle: 4,
    audioHandle: 5,
    audioStopResult: 1,
  });
  assert.deepEqual(
    exact.events.map(({ kind, target, address }) => [
      kind,
      target ?? address,
    ]),
    [
      ["call", "0x00443440"],
      ["call-result", "0x00441b50"],
      ["call", "0x004413c0"],
      ["call", "0x00441550"],
      ["write-dword", "0x00c7a7a8"],
    ],
  );
  const nonOne = runResultPresentationCleanup({
    spriteHandle: 0,
    audioHandle: 5,
    audioStopResult: 2,
  });
  assert.deepEqual(
    nonOne.events.map(({ target, address }) => target ?? address),
    ["0x00441b50", "0x00441550", "0x00c7a7a8"],
  );
  assert.deepEqual(
    runResultPresentationCleanup({
      spriteHandle: 0,
      audioHandle: 0,
      audioStopResult: 1,
    }).events,
    [],
  );
});

test("replays the 0x8c to 0x96 exact-one target relay", () => {
  const initialized = advanceTargetStateRelay({
    currentState: 0x8c,
    targetState: 0x1c,
    transitionPollResult: 0,
  });
  assert.equal(initialized.currentState, 0x96);
  assert.equal(initialized.targetState, 0x1c);

  for (const value of [0, 2, 0xffffffff]) {
    assert.equal(
      advanceTargetStateRelay({
        currentState: 0x96,
        targetState: 0x1c,
        transitionPollResult: value,
      }).currentState,
      0x96,
    );
  }
  assert.equal(
    advanceTargetStateRelay({
      currentState: 0x96,
      targetState: 0x1c,
      transitionPollResult: 1,
    }).currentState,
    0x1c,
  );
  assert.deepEqual(enterSharedPostResult(), {
    currentState: 0x1d,
    events: [
      { kind: "call-return-ignored", target: "0x00480180" },
      { kind: "write-word", address: "0x004bdfc8", value: 0x1d },
    ],
  });
});

test("replays final external, raw-word, campaign, and overwrite routes", () => {
  const waiting = consumeFinalPostResult({
    resultFlag: 1,
    postPollWord: 0,
    transientGate: 1,
    externalMode: 1,
    stageWord: 8,
  });
  assert.equal(waiting.currentState, 0x1d);
  assert.equal(waiting.events.length, 2);

  const external = consumeFinalPostResult({
    resultFlag: 1,
    postPollWord: 0x3456,
    transientGate: 1,
    externalMode: 1,
    stageWord: 8,
  });
  assert.equal(external.currentState, 0x8c);
  assert.equal(external.targetState, 0x140);
  assert.deepEqual(
    external.events.slice(-4).map(({ value, route }) => route ?? value),
    [0x0a, 1, 0x140, 0x8c],
  );
  const externalNonOne = consumeFinalPostResult({
    resultFlag: 2,
    postPollWord: 1,
    transientGate: 0,
    externalMode: 1,
    stageWord: 0,
  });
  assert.equal(
    externalNonOne.events.find(({ target }) => target === "0x00409790").route,
    2,
  );

  const raw = consumeFinalPostResult({
    resultFlag: 1,
    postPollWord: 0xffff,
    transientGate: 1,
    externalMode: 0,
    stageWord: 0,
  });
  assert.equal(raw.currentState, 0xffff);
  assert.deepEqual(
    raw.events.slice(-2).map(({ value }) => value),
    [0x0a, 0xffff],
  );

  for (const stageWord of [8, 0x12, 0x1b]) {
    const special = consumeFinalPostResult({
      resultFlag: 1,
      postPollWord: 1,
      transientGate: 0,
      externalMode: 0,
      stageWord,
    });
    assert.equal(special.currentState, 0x64);
    assert.equal(special.stageWord, stageWord);
  }
  for (const stageWord of [7, 9, 0x11, 0x13, 0x1a, 0x1c]) {
    const adjacent = consumeFinalPostResult({
      resultFlag: 1,
      postPollWord: 1,
      transientGate: 0,
      externalMode: 0,
      stageWord,
    });
    assert.equal(adjacent.currentState, 0x10);
    assert.equal(adjacent.stageWord, stageWord + 1);
  }
  const wrapped = consumeFinalPostResult({
    resultFlag: 1,
    postPollWord: 1,
    transientGate: 1,
    externalMode: 0,
    stageWord: 0xffff,
  });
  assert.equal(wrapped.currentState, 0x10);
  assert.equal(wrapped.stageWord, 0);
  assert.deepEqual(
    wrapped.events.slice(-3).map(({ value }) => value),
    [0x0a, 0x10, 0],
  );

  for (const resultFlag of [0, 2, 0xffff]) {
    const loss = consumeFinalPostResult({
      resultFlag,
      postPollWord: 1,
      transientGate: 0,
      externalMode: 0,
      stageWord: 1,
    });
    assert.equal(loss.currentState, 0x20);
    assert.equal(loss.stageWord, 1);
  }
});

test("rejects malformed fixed-width and incomplete callback vectors loudly", () => {
  assert.throws(
    () =>
      initializeCommittedResultState({
        currentState: 0x19,
        stageWord: 0,
        rawStageCompanionWord: 0,
      }),
    /currentState must be 0x18 or 0x1a/,
  );
  assert.throws(
    () =>
      pollResultPresentation({
        activeDword: 1,
        uiHelperResult: 1,
        phase: -1,
        cadenceClock: 0,
        startClock: 0,
        timeSamples: [],
        finishFlag: 0,
      }),
    /phase must be an integer in 0\.\.20/,
  );
  assert.throws(
    () =>
      pollResultPresentation({
        activeDword: 1,
        uiHelperResult: 0,
        phase: 0,
        cadenceClock: 0,
        startClock: 0,
        timeSamples: [],
        finishFlag: 0,
      }),
    /timeSamples is missing the completion sample/,
  );
  assert.throws(
    () =>
      pollResultPresentation({
        activeDword: 1,
        uiHelperResult: 0,
        phase: 0,
        cadenceClock: 0,
        startClock: 0,
        timeSamples: [2001],
        finishFlag: 0,
        keyStates: [0],
      }),
    /keyStates is missing GetAsyncKeyState\(0xd\)/,
  );
  assert.throws(
    () =>
      consumeFinalPostResult({
        resultFlag: 0x10000,
        postPollWord: 1,
        transientGate: 0,
        externalMode: 0,
        stageWord: 1,
      }),
    /resultFlag must be an integer in 0\.\.65535/,
  );
});

test("rejects stale, missing, tampered CFG, jump-table, asset, and executable inputs", (t) => {
  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), "k01-final-result-transition-"),
  );
  t.after(() =>
    rmSync(temporaryDirectory, { recursive: true, force: true }),
  );

  const staleSeeds = readJson("seeds.json");
  staleSeeds.sourceSha256 = "0".repeat(64);
  assert.throws(
    () =>
      extractK01FinalResultTransition({
        seeds: writeJson(temporaryDirectory, "stale-seeds.json", staleSeeds),
      }),
    /seeds canonical analysis source SHA-256/,
  );

  const missingSeeds = readJson("seeds.json");
  missingSeeds.functions = missingSeeds.functions.filter(
    ({ entry }) => entry !== "0x00493400",
  );
  assert.throws(
    () =>
      extractK01FinalResultTransition({
        seeds: writeJson(temporaryDirectory, "missing-seeds.json", missingSeeds),
      }),
    /Ghidra seeds omit function 0x00493400/,
  );

  const tamperedCall = readJson("seeds.json");
  const pollWrapper = tamperedCall.functions.find(
    ({ entry }) => entry === "0x004932a0",
  );
  pollWrapper.instructions.find(
    ({ address }) => address === "0x004932a2",
  ).text = "CALL 0x004932f0";
  assert.throws(
    () =>
      extractK01FinalResultTransition({
        seeds: writeJson(temporaryDirectory, "tampered-call.json", tamperedCall),
      }),
    /Missing instruction 0x004932a2/,
  );

  const tamperedJumpTable = readJson("jump-tables.json");
  const table = tamperedJumpTable.tables.find(
    ({ switchAddress }) => switchAddress === "0x0046042b",
  );
  table.cases.find(({ label }) => label === 0x96).destination = "0x0045fc88";
  assert.throws(
    () =>
      extractK01FinalResultTransition({
        jumpTables: writeJson(
          temporaryDirectory,
          "tampered-jump-table.json",
          tamperedJumpTable,
        ),
      }),
    /relay 0x00000096/,
  );

  const badAsset = join(temporaryDirectory, "winlogo.spr");
  copyFileSync(winLogoPath, badAsset);
  const badAssetBuffer = readFileSync(badAsset);
  badAssetBuffer[0] ^= 0xff;
  writeFileSync(badAsset, badAssetBuffer);
  assert.throws(
    () => extractK01FinalResultTransition({ winLogo: badAsset }),
    /winLogo SHA-256/,
  );

  const badExecutable = join(temporaryDirectory, "imjinrok2.exe");
  copyFileSync(executablePath, badExecutable);
  const executableBuffer = readFileSync(badExecutable);
  executableBuffer[0x100] ^= 0xff;
  writeFileSync(badExecutable, executableBuffer);
  assert.throws(
    () => extractK01FinalResultTransition({ input: badExecutable }),
    /original executable SHA-256/,
  );
});

function readJson(name) {
  return JSON.parse(readFileSync(join(analysisDirectory, name), "utf8"));
}

function writeJson(directory, name, value) {
  const path = join(directory, name);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
}
