#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readCString, readPeImage, toHex } from "./pe-image.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_SEEDS_PATH = "analysis/generated/imjinrok2/seeds.json";
const DEFAULT_REFERENCES_PATH =
  "analysis/generated/imjinrok2/references.json";
const DEFAULT_JUMP_TABLES_PATH =
  "analysis/generated/imjinrok2/jump-tables.json";
const EXPECTED_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";

const FUNCTION_ENTRIES = {
  intervalSelectorSetter: 0x0043f560,
  intervalSelector: 0x0043f580,
  timestampHistoryInitializer: 0x00443080,
  timestampHistoryReset: 0x00443090,
  timestampHistoryUpdate: 0x004430b0,
  feedbackAdjustmentProducer: 0x004430f0,
  intervalReset: 0x00446420,
  preUpdateGate: 0x004464c0,
  projectilePoolUpdate: 0x00447360,
  stepScheduler: 0x00447bc0,
  wallClockGate: 0x00447e10,
  feedbackMessageConsumer: 0x00473b50,
  mainMessageLoop: 0x0045f9c0,
  commandReadinessGate: 0x00477f50,
  executableEntry: 0x004ae539,
};

const REQUIRED_CALL_EDGES = [
  [0x004ae602, 0x004ae539, 0x0045f9c0],
  [0x0045fd5d, 0x0045f9c0, 0x00447bc0],
  [0x004602e4, 0x0045f9c0, 0x00447bc0],
  [0x00447bc8, 0x00447bc0, 0x00406af0],
  [0x00447bf6, 0x00447bc0, 0x0046f870],
  [0x00447c00, 0x00447bc0, 0x004400b0],
  [0x00447c18, 0x00447bc0, 0x004464c0],
  [0x00447c39, 0x00447bc0, 0x00447ed0],
  [0x00447c56, 0x00447bc0, 0x0043dc90],
  [0x00447c60, 0x00447bc0, 0x004676e0],
  [0x00447c65, 0x00447bc0, 0x00447e10],
  [0x00447c7c, 0x00447bc0, 0x00477f50],
  [0x00447c9e, 0x00447bc0, 0x00443080],
  [0x00447cb0, 0x00447bc0, 0x004430b0],
  [0x00447cb8, 0x00447bc0, 0x00447360],
  [0x00447ce9, 0x00447bc0, 0x0046feb0],
  [0x00447e17, 0x00447e10, 0x0043f580],
  [0x0043f567, 0x0043f560, 0x0043f580],
  [0x00473c7a, 0x00473b50, 0x004430f0],
  [0x00473d1b, 0x00473b50, 0x004430f0],
];

const CODE_ANCHORS = [
  {
    id: "entry-zero-register-for-module-handle-argument",
    va: 0x004ae590,
    bytes: "33 f6 56 e8 0c 33 00 00 59",
    meaning:
      "the entry function zeroes ESI; its full instruction listing contains no later direct ESI write before ESI is pushed as the GetModuleHandleA argument",
  },
  {
    id: "entry-calls-main-message-loop",
    va: 0x004ae5f9,
    bytes: "56 56 ff 15 70 71 4b 00 50 e8 b9 13 fb ff",
    meaning:
      "the entry passes zero to GetModuleHandleA, pushes its returned module handle, and calls 0x0045f9c0",
  },
  {
    id: "message-queue-drains-before-idle-update",
    va: 0x0045fc88,
    bytes:
      "55 55 55 8d 4c 24 20 55 51 ff 15 44 72 4b 00 85 c0 74 2e",
    meaning:
      "PeekMessageA is called with remove flag zero; a queued message takes the message-dispatch branch instead of the idle update branch",
  },
  {
    id: "idle-loop-samples-millisecond-clock",
    va: 0x0045fd02,
    bytes:
      "8b 15 04 2e 88 00 89 15 b0 c0 88 00 ff 15 70 72 4b 00 a3 04 2e 88 00",
    meaning:
      "the idle branch saves the prior current-time DWORD, calls imported timeGetTime, and stores the new DWORD at 0x00882e04",
  },
  {
    id: "main-loop-si-one-before-state-switch",
    va: 0x0045fd19,
    bytes:
      "a1 90 4c 63 00 be 01 00 00 00 3b c6 75 0f e8 64 32 01 00 e8 df 31 01 00 e8 ba 0c fe ff",
    meaning:
      "ESI is set to one before the main-state switch; the state-23 block later compares its mode WORD with SI",
  },
  {
    id: "state-switch-and-state-three-call",
    va: 0x0045fd36,
    bytes:
      "0f bf 05 c8 df 4b 00 83 f8 28 0f 8f be 06 00 00 0f 84 a5 06 00 00 48 83 f8 22 0f 87 32 ff ff ff ff 24 85 b0 07 46 00 e8 5e 7e fe ff",
    meaning:
      "the signed-WORD main-state switch dispatches original state 3 to a direct scheduler call",
  },
  {
    id: "state-twenty-three-mode-gate",
    va: 0x004602db,
    bytes:
      "66 39 35 20 6e c0 00 75 05 e8 d7 78 fe ff e8 a2 8d fe ff",
    meaning:
      "original state 23 calls the scheduler only when WORD 0x00c06e20 equals one",
  },
  {
    id: "scheduler-first-call-and-zero-step-clock-copy",
    va: 0x00447bc3,
    bytes:
      "b9 b0 af 4c 00 e8 23 ef fb ff a1 80 5f 7c 00 85 c0 75 0a a1 04 2e 88 00 a3 b8 6d c0 00",
    meaning:
      "the scheduler first calls 0x00406af0 with ECX 0x004cafb0, then copies current milliseconds to 0x00c06db8 only when the accepted-step counter is zero",
  },
  {
    id: "scheduler-special-transition-call-order",
    va: 0x00447be0,
    bytes:
      "66 83 3d 30 6e c0 00 01 75 2e 66 83 3d c8 df 4b 00 03 75 24 6a 02 e8 75 7c 02 00 68 b8 20 5e 00 e8 ab 84 ff ff 83 c4 08 66 c7 05 c8 df 4b 00 16 00 66 33 c0 83 c4 08 c3",
    meaning:
      "when WORD 0x00c06e30 is one and main state is three, calls 0x0046f870 then 0x004400b0, writes state 0x16, and returns before the ordinary gates",
  },
  {
    id: "scheduler-pre-update-failure",
    va: 0x00447c18,
    bytes: "e8 a3 e8 ff ff 83 f8 01 0f 84 ce 00 00 00",
    meaning:
      "pre-update return value one skips the remaining scheduling chain",
  },
  {
    id: "scheduler-pre-clock-raw-state-call-order",
    va: 0x00447c26,
    bytes:
      "66 83 3d 2e 6e c0 00 00 75 2b a1 70 27 55 00 85 c0 75 0f e8 92 02 00 00 c7 05 70 27 55 00 01 00 00 00 b9 80 bd bc 00 66 c7 05 90 27 55 00 00 00 e8 35 60 ff ff b9 f0 ff ab 00 e8 7b fa 01 00",
    meaning:
      "when WORD 0x00c06e2e is zero, optionally calls 0x00447ed0 and then calls 0x0043dc90; all ordinary paths then call 0x004676e0 immediately before the clock gate",
  },
  {
    id: "scheduler-clock-and-readiness-gates",
    va: 0x00447c5b,
    bytes:
      "b9 f0 ff ab 00 e8 7b fa 01 00 e8 a6 01 00 00 85 c0 0f 84 82 00 00 00 66 83 3d 2e 6e c0 00 00 75 09 e8 cf 02 03 00 85 c0 74 6f",
    meaning:
      "the wall-clock gate must pass; when WORD 0x00c06e2e is zero, the command-readiness gate must also return nonzero",
  },
  {
    id: "one-pool-call-per-accepted-step",
    va: 0x00447c85,
    bytes:
      "a1 80 5f 7c 00 40 83 f8 14 a3 80 5f 7c 00 72 23 75 11 8b 0d 04 2e 88 00 51 e8 dd b3 ff ff 83 c4 04 eb 10 8b 15 04 2e 88 00 52 50 e8 fb b3 ff ff 83 c4 08 e8 a3 f6 ff ff",
    meaning:
      "an accepted step increments the DWORD step counter, optionally updates timestamp history, then calls 0x00447360 exactly once",
  },
  {
    id: "base-interval-reset-to-fifty-ms",
    va: 0x00446420,
    bytes: "a1 c0 4a 63 00 c7 05 bc df 4b 00 32 00 00 00",
    meaning: "the reset routine writes DWORD 50 to the base interval",
  },
  {
    id: "selector-forwarder-raw-word",
    va: 0x004ac490,
    bytes:
      "0f bf 41 10 50 b9 b8 4a 63 00 e8 c1 30 f9 ff c3",
    meaning:
      "a small code island sign-extends WORD object+0x10 and forwards it to the selector setter; its human-facing producer is unresolved",
  },
  {
    id: "interval-selector-table",
    va: 0x0043f580,
    bytes:
      "66 83 3d 20 6e c0 00 01 75 06 a1 bc df 4b 00 c3 a1 cc 4a 63 00 83 f8 03 77 24 ff 24 85 c8 f5 43 00",
    meaning:
      "mode WORD one returns the base directly; otherwise an unsigned selector dispatches through the interval table",
  },
  {
    id: "interval-feedback-and-fifty-step-adjustment",
    va: 0x00447e12,
    bytes:
      "b9 b8 4a 63 00 e8 64 77 ff ff 8b f0 a1 a8 a4 54 00 33 d2 bb 32 00 00 00 8d 0c 30 a1 80 5f 7c 00 f7 f3 89 0d 94 27 55 00 c7 05 a8 a4 54 00 00 00 00 00 85 d2 75 30",
    meaning:
      "the clock gate adds the raw feedback DWORD with wrap, divides the step counter by 50, stores the interval, clears feedback, and conditionally adjusts every fiftieth step",
  },
  {
    id: "feedback-producer-writes-minus-or-plus-one",
    va: 0x00443129,
    bytes:
      "3b ce 76 0c c7 05 a8 a4 54 00 ff ff ff ff 5e c3 73 0a c7 05 a8 a4 54 00 01 00 00 00",
    meaning:
      "the feedback producer compares a selected timestamp DWORD with its raw input and writes -1 or +1; equality and unmet guards leave it unchanged",
  },
  {
    id: "clock-threshold-reject-and-accept",
    va: 0x00447e78,
    bytes:
      "8b 35 04 2e 88 00 a1 6c 27 55 00 8b d6 2b d0 3b d1 73 26 2b c6 8d 14 08 33 c0 3b c2 1b c0 23 c2 3b c1 73 08 33 c9 3b ca 1b c9 23 ca 8b d6 2b d6 3b d1 7d 0f 5e 33 c0 5b c3 2b d1 3b d1 73 02 8b ca 2b f1 89 35 6c 27 55 00 5e b8 01 00 00 00 5b c3",
    meaning:
      "unsigned DWORD elapsed/interval arithmetic either rejects without changing the accepted timestamp or accepts once and advances/catches up that timestamp without a backlog loop",
  },
  {
    id: "scheduler-post-pool-conditional-side-effects",
    va: 0x00447cbd,
    bytes:
      "83 3d 90 4c 63 00 01 75 28 8d 44 24 00 50 ff 15 c4 71 4b 00 66 8b 4c 24 00 66 8b 54 24 04 66 89 0d 12 40 aa 00 66 89 15 10 40 aa 00 e8 c2 81 02 00 ff 05 84 5f 7c 00",
    meaning:
      "after the pool call, DWORD 0x00634c90 equal to one runs an imported call, stores two raw WORDs, and calls 0x0046feb0; every accepted path then increments DWORD 0x007c5f84",
  },
  {
    id: "pool-updater-is-one-hundred-slot-pass",
    va: 0x004474bd,
    bytes:
      "33 f6 bd e8 85 aa 00 bf 00 25 84 00 66 39 1f 74 14 8b cd e8 eb 97 fc ff 85 c0 75 09 56 e8 a1 9c fc ff 83 c4 04 46 83 c7 02 81 c5 a0 03 00 00 66 83 fe 64 7c d7",
    meaning:
      "one invocation makes one forward pass over projectile slots 0 through 99",
  },
];

export function extractK01ProjectilePoolCadence({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  seedsPath = DEFAULT_SEEDS_PATH,
  referencesPath = DEFAULT_REFERENCES_PATH,
  jumpTablesPath = DEFAULT_JUMP_TABLES_PATH,
} = {}) {
  const absoluteExecutablePath = resolve(executablePath);
  const { buffer, image } = readPeImage(absoluteExecutablePath);
  const sourceSha256 = createHash("sha256").update(buffer).digest("hex");
  assertEqual(sourceSha256, EXPECTED_SHA256, "original EXE SHA-256");

  const seeds = readAnalysisJson(seedsPath, sourceSha256, "seed analysis");
  const referenceReport = readAnalysisJson(
    referencesPath,
    sourceSha256,
    "reference analysis",
  );
  const jumpTableReport = readAnalysisJson(
    jumpTablesPath,
    sourceSha256,
    "jump-table analysis",
  );
  const functions = Object.values(FUNCTION_ENTRIES).map((entry) =>
    summarizeFunction(requireFunction(seeds, entry)),
  );
  const callEdges = REQUIRED_CALL_EDGES.map(([callsite, caller, callee]) =>
    requireCallEdge(referenceReport.references, callsite, caller, callee),
  );

  const directPoolCallers = referenceReport.references.filter(
    (reference) =>
      reference.type.endsWith("CALL") &&
      reference.to === toHex(FUNCTION_ENTRIES.projectilePoolUpdate),
  );
  assertEqual(directPoolCallers.length, 1, "direct projectile-pool caller count");
  assertEqual(
    directPoolCallers[0].from,
    "0x00447cb8",
    "sole projectile-pool callsite",
  );

  const schedulerCallers = referenceReport.references.filter(
    (reference) =>
      reference.type.endsWith("CALL") &&
      reference.to === toHex(FUNCTION_ENTRIES.stepScheduler),
  );
  assertEqual(schedulerCallers.length, 2, "direct scheduler caller count");
  assertEqual(
    schedulerCallers.map((reference) => reference.from).join(","),
    "0x0045fd5d,0x004602e4",
    "scheduler callsites",
  );

  const stateSwitch = jumpTableReport.tables.find(
    (table) =>
      table.functionEntry === toHex(FUNCTION_ENTRIES.mainMessageLoop) &&
      table.switchAddress === "0x0045fd56",
  );
  if (!stateSwitch) {
    throw new Error("main message-loop state switch 0x0045fd56 is missing");
  }
  assertEqual(
    stateSwitch.cases.find((entry) => entry.label === 2)?.destination,
    "0x0045fd5d",
    "state 3 scheduler destination",
  );
  assertEqual(
    stateSwitch.cases.find((entry) => entry.label === 22)?.destination,
    "0x004602db",
    "state 23 scheduler-gate destination",
  );

  const imports = parsePeImports(buffer, image);
  const getModuleHandle = requireImport(
    imports,
    0x004b7170,
    "KERNEL32.dll",
    "GetModuleHandleA",
  );
  const timeGetTime = requireImport(imports, 0x004b7270, "WINMM.dll", "timeGetTime");
  const peekMessage = requireImport(imports, 0x004b7244, "USER32.dll", "PeekMessageA");

  return {
    question:
      "How often is original projectile-pool updater 0x00447360 invoked, what static scheduling/call-chain controls that cadence, and can that cadence be mapped exactly to this project's fixed simulation tick without an inferred multiplier?",
    source: {
      executablePath,
      sha256: sourceSha256,
    },
    evidenceStatus: "static-proven-original-pool-invocation-scheduling",
    reproductionStatus: "reproduction-complete",
    integrationStatus: "gated-no-exact-24hz-rule",
    exactScope:
      "the original idle-message-loop entry into 0x00447bc0, each scheduler gate represented by its raw input/return, the sole 0x00447360 call, exact DWORD/WORD scheduling arithmetic, and one pool pass per accepted step",
    invocationCount: {
      perAcceptedOriginalStep: 1,
      perRejectedSchedulerAttempt: 0,
      perPoolInvocationSlotPasses: 1,
      slotsVisitedPerPass: 100,
      backlogBehavior:
        "the timestamp is advanced or caught up once; no loop emits additional accepted steps or pool calls",
    },
    schedulingChain: {
      entry: "0x004ae539",
      mainMessageLoop: "0x0045f9c0",
      scheduler: "0x00447bc0",
      poolUpdater: "0x00447360",
      mainStates:
        "state 3 calls the scheduler; ESI is initialized to one at 0x0045fd1e before the switch, and state 23 calls it only when raw WORD 0x00c06e20 equals that SI value",
      queueRule:
        "a queued Windows message is retrieved/translated/dispatched and the loop restarts before sampling the update clock",
      schedulerRules: [
        "call 0x00406af0 first; when the accepted-step counter is zero, copy current milliseconds to 0x00c06db8",
        "raw transition condition WORD 0x00c06e30 == 1 and main state 3 calls 0x0046f870 then 0x004400b0 and returns",
        "raw pre-update result 1 rejects",
        "when raw WORD 0x00c06e2e == 0, raw DWORD 0x00552770 == 0 first calls 0x00447ed0, then 0x0043dc90 runs; ordinary paths call 0x004676e0 before the clock gate",
        "0x00447e10 result 0 rejects",
        "when raw WORD 0x00c06e2e == 0, raw 0x00477f50 result 0 rejects",
        "otherwise increment DWORD 0x007c5f80 and call 0x00447360 once",
        "after the pool, raw DWORD 0x00634c90 == 1 conditionally leads to 0x0046feb0 after an imported call and two WORD stores; accepted paths then increment 0x007c5f84",
      ],
      semanticBoundary:
        "the additional callees are retained as raw address/condition/order evidence; their large internal semantics are not claimed",
      unresolvedHumanMeanings:
        "the user-facing meanings and complete upstream state machines behind the raw pre-update and command-readiness return values are not renamed",
    },
    wallClock: {
      import: timeGetTime,
      currentMillisecondsAddress: "0x00882e04",
      lastAcceptedMillisecondsAddress: "0x0055276c",
      baseIntervalAddress: "0x004bdfbc",
      baseResetMilliseconds: 50,
      modeWordAddress: "0x00c06e20",
      selectorDwordAddress: "0x00634acc",
      selectorBaseIntervalsMilliseconds: {
        "0": 64,
        "1": 60,
        "2": 50,
        "3": 40,
        "unsigned-greater-than-3": 30,
      },
      rawFeedbackAdjustmentAddress: "0x0054a4a8",
      rawFeedbackProducer:
        "0x004430f0, called at 0x00473c7a and 0x00473d1b from the message-record consumer 0x00473b50; it writes DWORD -1 or +1 from an unsigned timestamp comparison",
      periodicCounterAddress: "0x00552788",
      effectiveIntervalAddress: "0x00552794",
      fixedFramesPerSecond: null,
      statement:
        "timeGetTime supplies millisecond timestamps, but message dispatch, selectable/dynamically adjusted thresholds, and two non-clock gates prevent a statically fixed wall-clock FPS claim",
    },
    projectTickComparison: {
      projectTickHz: 24,
      projectTickDurationMilliseconds: "125/3",
      exactDirectMultiplier: null,
      nominalBaseIntervalToProjectTicks: "6/5",
      conclusion:
        "no integer pool-updates-per-project-tick or project-ticks-per-pool-update multiplier is exact, and the original message-loop polling/gate state is not a fixed 24 Hz callback; any accumulator, resampling, or multiplier would be a port policy rather than recovered original behavior",
    },
    imports: [getModuleHandle, peekMessage, timeGetTime],
    stateSwitch: {
      switchAddress: stateSwitch.switchAddress,
      stateThreeCaseLabelAfterDecrement: 2,
      stateThreeDestination: "0x0045fd5d",
      stateTwentyThreeCaseLabelAfterDecrement: 22,
      stateTwentyThreeDestination: "0x004602db",
    },
    callEdges,
    analyzedFunctions: functions,
    codeAnchors: CODE_ANCHORS.map((anchor) =>
      validateCodeAnchor(buffer, image, anchor),
    ),
    testVectors: createReproductionVectors(),
    uncertainties: [
      "the selected raw speed value for a particular K01 run is not fixed by the recovered scheduling CFG",
      "the complete upstream producers and human meanings of the pre-update gate and command-readiness gate are outside this cadence question",
      "0x004430f0 proves the feedback adjustment writer and its two message-consumer callsites, but the message record's human-facing protocol meaning is unresolved",
      "the periodic counter has no direct-address producer reference in the recovered static output, so pointer-aliased production and human meaning remain unresolved",
      "actual wall-clock calls per second are not fixed because message availability and gate failures can delay accepted steps",
      "there is no static evidence for an exact mapping to the project's 24 Hz tick",
    ],
  };
}

export function selectOriginalBaseInterval({
  modeWord,
  selector,
  baseInterval = 50,
}) {
  validateUnsignedWord(modeWord, "modeWord");
  validateUnsignedDword(selector, "selector");
  validateUnsignedDword(baseInterval, "baseInterval");
  if (modeWord === 1) {
    return baseInterval;
  }
  if (selector === 0) {
    return addDword(baseInterval, 14);
  }
  if (selector === 1) {
    return addDword(baseInterval, 10);
  }
  if (selector === 2) {
    return baseInterval;
  }
  if (selector === 3) {
    return addDword(baseInterval, -10);
  }
  return addDword(baseInterval, -20);
}

export function deriveOriginalEffectiveInterval({
  modeWord,
  selector,
  baseInterval = 50,
  feedbackAdjustment,
  acceptedStepCounter,
  periodicCounterWord,
}) {
  validateSignedDwordBits(feedbackAdjustment, "feedbackAdjustment");
  validateUnsignedDword(acceptedStepCounter, "acceptedStepCounter");
  validateUnsignedWord(periodicCounterWord, "periodicCounterWord");
  const selectedBaseInterval = selectOriginalBaseInterval({
    modeWord,
    selector,
    baseInterval,
  });
  let effectiveInterval = addDword(
    selectedBaseInterval,
    feedbackAdjustment,
  );
  const periodicAdjustmentRan = acceptedStepCounter % 50 === 0;
  if (periodicAdjustmentRan) {
    const signedCounter = toSignedWord(periodicCounterWord);
    if (
      signedCounter > 10 &&
      effectiveInterval < addDword(selectedBaseInterval, 20)
    ) {
      effectiveInterval = addDword(effectiveInterval, 1);
    } else if (
      signedCounter < 4 &&
      effectiveInterval >= selectedBaseInterval
    ) {
      effectiveInterval = addDword(effectiveInterval, -1);
    }
  }
  return {
    selectedBaseInterval,
    effectiveInterval,
    feedbackAdjustmentAfter: 0,
    periodicCounterWordAfter: periodicAdjustmentRan
      ? 0
      : periodicCounterWord,
  };
}

export function deriveOriginalFeedbackAdjustment({
  historyReadyDword,
  comparisonInput,
  matchingRecordFound,
  selectedTimestamp,
  previousAdjustment,
}) {
  validateUnsignedDword(historyReadyDword, "historyReadyDword");
  validateUnsignedDword(comparisonInput, "comparisonInput");
  validateBoolean(matchingRecordFound, "matchingRecordFound");
  validateUnsignedDword(selectedTimestamp, "selectedTimestamp");
  validateSignedDwordBits(previousAdjustment, "previousAdjustment");
  if (
    historyReadyDword === 0 ||
    comparisonInput === 0 ||
    !matchingRecordFound ||
    selectedTimestamp === 0 ||
    selectedTimestamp === comparisonInput
  ) {
    return addDword(previousAdjustment, 0);
  }
  return selectedTimestamp > comparisonInput ? 0xffffffff : 1;
}

export function evaluateOriginalWallClockGate({
  currentMilliseconds,
  lastAcceptedMilliseconds,
  effectiveInterval,
}) {
  validateUnsignedDword(currentMilliseconds, "currentMilliseconds");
  validateUnsignedDword(
    lastAcceptedMilliseconds,
    "lastAcceptedMilliseconds",
  );
  validateUnsignedDword(effectiveInterval, "effectiveInterval");

  const elapsed = subtractDword(
    currentMilliseconds,
    lastAcceptedMilliseconds,
  );
  if (elapsed >= effectiveInterval) {
    const excess = subtractDword(elapsed, effectiveInterval);
    const correction =
      excess < effectiveInterval ? excess : effectiveInterval;
    return {
      accepted: true,
      elapsed,
      lastAcceptedMilliseconds: subtractDword(
        currentMilliseconds,
        correction,
      ),
    };
  }

  const gap = addDword(
    subtractDword(lastAcceptedMilliseconds, currentMilliseconds),
    effectiveInterval,
  );
  let comparisonInterval = effectiveInterval;
  if (gap !== 0 && gap < effectiveInterval) {
    comparisonInterval = gap;
  }
  if (toSignedDword(comparisonInterval) <= 0) {
    return {
      accepted: true,
      elapsed,
      lastAcceptedMilliseconds: currentMilliseconds,
    };
  }
  return {
    accepted: false,
    elapsed,
    lastAcceptedMilliseconds,
  };
}

export function evaluateOriginalSchedulerAttempt({
  transitionGuardWord,
  mainStateWord,
  preUpdateReturn,
  clockGateReturn,
  commandGateModeWord,
  commandReadinessReturn,
  acceptedStepCounter,
}) {
  validateUnsignedWord(transitionGuardWord, "transitionGuardWord");
  validateUnsignedWord(mainStateWord, "mainStateWord");
  validateUnsignedDword(preUpdateReturn, "preUpdateReturn");
  validateUnsignedDword(clockGateReturn, "clockGateReturn");
  validateUnsignedWord(commandGateModeWord, "commandGateModeWord");
  validateUnsignedDword(commandReadinessReturn, "commandReadinessReturn");
  validateUnsignedDword(acceptedStepCounter, "acceptedStepCounter");

  if (transitionGuardWord === 1 && mainStateWord === 3) {
    return schedulerResult("early-transition", acceptedStepCounter);
  }
  if (preUpdateReturn === 1) {
    return schedulerResult("pre-update-returned-one", acceptedStepCounter);
  }
  if (clockGateReturn === 0) {
    return schedulerResult("clock-gate-returned-zero", acceptedStepCounter);
  }
  if (commandGateModeWord === 0 && commandReadinessReturn === 0) {
    return schedulerResult(
      "command-readiness-returned-zero",
      acceptedStepCounter,
    );
  }

  const nextCounter = addDword(acceptedStepCounter, 1);
  return {
    accepted: true,
    rejection: null,
    acceptedStepCounter: nextCounter,
    timestampHistoryCall:
      nextCounter < 20 ? null : nextCounter === 20 ? "initialize" : "update",
    projectilePoolCallCount: 1,
  };
}

export function traceOriginalSchedulerCalls({
  transitionGuardWord,
  mainStateWord,
  preUpdateReturn,
  commandGateModeWord,
  preClockInitializedDword,
  clockGateReturn,
  commandReadinessReturn,
  acceptedStepCounter,
  postPoolSideEffectModeDword,
}) {
  validateUnsignedWord(transitionGuardWord, "transitionGuardWord");
  validateUnsignedWord(mainStateWord, "mainStateWord");
  validateUnsignedDword(preUpdateReturn, "preUpdateReturn");
  validateUnsignedWord(commandGateModeWord, "commandGateModeWord");
  validateUnsignedDword(
    preClockInitializedDword,
    "preClockInitializedDword",
  );
  validateUnsignedDword(clockGateReturn, "clockGateReturn");
  validateUnsignedDword(commandReadinessReturn, "commandReadinessReturn");
  validateUnsignedDword(acceptedStepCounter, "acceptedStepCounter");
  validateUnsignedDword(
    postPoolSideEffectModeDword,
    "postPoolSideEffectModeDword",
  );

  const preClockAndGateCalls = ["0x00406af0"];
  const acceptedStepCalls = [];
  const postPoolCalls = [];
  if (transitionGuardWord === 1 && mainStateWord === 3) {
    preClockAndGateCalls.push("0x0046f870", "0x004400b0");
    return {
      preClockAndGateCalls,
      acceptedStepCalls,
      postPoolCalls,
    };
  }

  preClockAndGateCalls.push("0x004464c0");
  if (preUpdateReturn === 1) {
    return {
      preClockAndGateCalls,
      acceptedStepCalls,
      postPoolCalls,
    };
  }
  if (commandGateModeWord === 0) {
    if (preClockInitializedDword === 0) {
      preClockAndGateCalls.push("0x00447ed0");
    }
    preClockAndGateCalls.push("0x0043dc90");
  }
  preClockAndGateCalls.push("0x004676e0", "0x00447e10");
  if (clockGateReturn === 0) {
    return {
      preClockAndGateCalls,
      acceptedStepCalls,
      postPoolCalls,
    };
  }
  if (commandGateModeWord === 0) {
    preClockAndGateCalls.push("0x00477f50");
    if (commandReadinessReturn === 0) {
      return {
        preClockAndGateCalls,
        acceptedStepCalls,
        postPoolCalls,
      };
    }
  }

  const nextCounter = addDword(acceptedStepCounter, 1);
  if (nextCounter === 20) {
    acceptedStepCalls.push("0x00443080");
  } else if (nextCounter > 20) {
    acceptedStepCalls.push("0x004430b0");
  }
  acceptedStepCalls.push("0x00447360");
  if (postPoolSideEffectModeDword === 1) {
    postPoolCalls.push("IAT[0x004b71c4]", "0x0046feb0");
  }
  return {
    preClockAndGateCalls,
    acceptedStepCalls,
    postPoolCalls,
  };
}

export function evaluateOriginalMainLoopIteration({
  messagePending,
  idleBlocked,
  mainStateWord,
  modeWord,
}) {
  validateBoolean(messagePending, "messagePending");
  validateBoolean(idleBlocked, "idleBlocked");
  validateUnsignedWord(mainStateWord, "mainStateWord");
  validateUnsignedWord(modeWord, "modeWord");
  if (messagePending) {
    return { clockSampled: false, schedulerAttemptCount: 0 };
  }
  if (idleBlocked) {
    return { clockSampled: false, schedulerAttemptCount: 0 };
  }
  return {
    clockSampled: true,
    schedulerAttemptCount:
      mainStateWord === 3 ||
      (mainStateWord === 23 && modeWord === 1)
        ? 1
        : 0,
  };
}

function createReproductionVectors() {
  return [
    {
      id: "base-selector-boundaries",
      results: [0, 1, 2, 3, 4].map((selector) =>
        selectOriginalBaseInterval({ modeWord: 0, selector }),
      ),
      expected: [64, 60, 50, 40, 30],
    },
    {
      id: "mode-one-ignores-selector",
      result: selectOriginalBaseInterval({
        modeWord: 1,
        selector: 0xffffffff,
      }),
      expected: 50,
    },
    {
      id: "fiftieth-step-high-counter-increments",
      result: deriveOriginalEffectiveInterval({
        modeWord: 0,
        selector: 2,
        feedbackAdjustment: 0,
        acceptedStepCounter: 50,
        periodicCounterWord: 11,
      }),
      expected: {
        selectedBaseInterval: 50,
        effectiveInterval: 51,
        feedbackAdjustmentAfter: 0,
        periodicCounterWordAfter: 0,
      },
    },
    {
      id: "fiftieth-step-low-counter-decrements",
      result: deriveOriginalEffectiveInterval({
        modeWord: 0,
        selector: 2,
        feedbackAdjustment: 0,
        acceptedStepCounter: 100,
        periodicCounterWord: 3,
      }),
      expected: {
        selectedBaseInterval: 50,
        effectiveInterval: 49,
        feedbackAdjustmentAfter: 0,
        periodicCounterWordAfter: 0,
      },
    },
    {
      id: "message-feedback-writes-minus-plus-or-unchanged",
      results: [
        deriveOriginalFeedbackAdjustment({
          historyReadyDword: 1,
          comparisonInput: 100,
          matchingRecordFound: true,
          selectedTimestamp: 101,
          previousAdjustment: 7,
        }),
        deriveOriginalFeedbackAdjustment({
          historyReadyDword: 1,
          comparisonInput: 100,
          matchingRecordFound: true,
          selectedTimestamp: 99,
          previousAdjustment: 7,
        }),
        deriveOriginalFeedbackAdjustment({
          historyReadyDword: 1,
          comparisonInput: 100,
          matchingRecordFound: true,
          selectedTimestamp: 100,
          previousAdjustment: 7,
        }),
      ],
      expected: [0xffffffff, 1, 7],
    },
    {
      id: "clock-rejects-before-boundary",
      result: evaluateOriginalWallClockGate({
        currentMilliseconds: 1049,
        lastAcceptedMilliseconds: 1000,
        effectiveInterval: 50,
      }),
      expected: {
        accepted: false,
        elapsed: 49,
        lastAcceptedMilliseconds: 1000,
      },
    },
    {
      id: "clock-accepts-at-boundary",
      result: evaluateOriginalWallClockGate({
        currentMilliseconds: 1050,
        lastAcceptedMilliseconds: 1000,
        effectiveInterval: 50,
      }),
      expected: {
        accepted: true,
        elapsed: 50,
        lastAcceptedMilliseconds: 1050,
      },
    },
    {
      id: "clock-drops-backlog-to-one-call",
      result: evaluateOriginalWallClockGate({
        currentMilliseconds: 1120,
        lastAcceptedMilliseconds: 1000,
        effectiveInterval: 50,
      }),
      expected: {
        accepted: true,
        elapsed: 120,
        lastAcceptedMilliseconds: 1070,
      },
    },
    {
      id: "clock-dword-wrap-boundary",
      result: evaluateOriginalWallClockGate({
        currentMilliseconds: 0x22,
        lastAcceptedMilliseconds: 0xfffffff0,
        effectiveInterval: 50,
      }),
      expected: {
        accepted: true,
        elapsed: 50,
        lastAcceptedMilliseconds: 0x22,
      },
    },
    {
      id: "scheduler-pre-update-failure",
      result: evaluateOriginalSchedulerAttempt({
        transitionGuardWord: 0,
        mainStateWord: 3,
        preUpdateReturn: 1,
        clockGateReturn: 1,
        commandGateModeWord: 0,
        commandReadinessReturn: 1,
        acceptedStepCounter: 19,
      }),
      expected: schedulerResult("pre-update-returned-one", 19),
    },
    {
      id: "scheduler-command-readiness-failure",
      result: evaluateOriginalSchedulerAttempt({
        transitionGuardWord: 0,
        mainStateWord: 3,
        preUpdateReturn: 0,
        clockGateReturn: 1,
        commandGateModeWord: 0,
        commandReadinessReturn: 0,
        acceptedStepCounter: 19,
      }),
      expected: schedulerResult("command-readiness-returned-zero", 19),
    },
    {
      id: "accepted-twentieth-step-calls-pool-once",
      result: evaluateOriginalSchedulerAttempt({
        transitionGuardWord: 0,
        mainStateWord: 3,
        preUpdateReturn: 0,
        clockGateReturn: 1,
        commandGateModeWord: 1,
        commandReadinessReturn: 0,
        acceptedStepCounter: 19,
      }),
      expected: {
        accepted: true,
        rejection: null,
        acceptedStepCounter: 20,
        timestampHistoryCall: "initialize",
        projectilePoolCallCount: 1,
      },
    },
    {
      id: "complete-accepted-scheduler-direct-call-order",
      result: traceOriginalSchedulerCalls({
        transitionGuardWord: 0,
        mainStateWord: 3,
        preUpdateReturn: 0,
        commandGateModeWord: 0,
        preClockInitializedDword: 0,
        clockGateReturn: 1,
        commandReadinessReturn: 1,
        acceptedStepCounter: 19,
        postPoolSideEffectModeDword: 1,
      }),
      expected: {
        preClockAndGateCalls: [
          "0x00406af0",
          "0x004464c0",
          "0x00447ed0",
          "0x0043dc90",
          "0x004676e0",
          "0x00447e10",
          "0x00477f50",
        ],
        acceptedStepCalls: ["0x00443080", "0x00447360"],
        postPoolCalls: ["IAT[0x004b71c4]", "0x0046feb0"],
      },
    },
    {
      id: "queued-message-prevents-scheduler-attempt",
      result: evaluateOriginalMainLoopIteration({
        messagePending: true,
        idleBlocked: false,
        mainStateWord: 3,
        modeWord: 1,
      }),
      expected: { clockSampled: false, schedulerAttemptCount: 0 },
    },
    {
      id: "state-twenty-three-mode-gate-failure",
      result: evaluateOriginalMainLoopIteration({
        messagePending: false,
        idleBlocked: false,
        mainStateWord: 23,
        modeWord: 0,
      }),
      expected: { clockSampled: true, schedulerAttemptCount: 0 },
    },
  ];
}

function schedulerResult(rejection, acceptedStepCounter) {
  return {
    accepted: false,
    rejection,
    acceptedStepCounter,
    timestampHistoryCall: null,
    projectilePoolCallCount: 0,
  };
}

function parsePeImports(buffer, image) {
  const peOffset = buffer.readUInt32LE(0x3c);
  const optionalHeaderOffset = peOffset + 24;
  if (buffer.readUInt16LE(optionalHeaderOffset) !== 0x10b) {
    throw new Error("original executable is not a PE32 image");
  }
  const importDirectoryRva = buffer.readUInt32LE(optionalHeaderOffset + 104);
  const importDirectoryOffset = image.vaToRawOffset(
    image.imageBase + importDirectoryRva,
  );
  if (importDirectoryOffset === undefined) {
    throw new Error("PE import directory is not file-backed");
  }

  const imports = [];
  for (
    let descriptorOffset = importDirectoryOffset;
    buffer.readUInt32LE(descriptorOffset) !== 0 ||
    buffer.readUInt32LE(descriptorOffset + 12) !== 0;
    descriptorOffset += 20
  ) {
    const originalFirstThunk = buffer.readUInt32LE(descriptorOffset);
    const nameRva = buffer.readUInt32LE(descriptorOffset + 12);
    const firstThunk = buffer.readUInt32LE(descriptorOffset + 16);
    const nameOffset = image.vaToRawOffset(image.imageBase + nameRva);
    const lookupOffset = image.vaToRawOffset(
      image.imageBase + (originalFirstThunk || firstThunk),
    );
    if (nameOffset === undefined || lookupOffset === undefined) {
      throw new Error("PE import descriptor points outside file-backed data");
    }
    const dll = readCString(buffer, nameOffset);
    for (let index = 0; ; index += 1) {
      const lookup = buffer.readUInt32LE(lookupOffset + index * 4);
      if (lookup === 0) {
        break;
      }
      if ((lookup & 0x80000000) !== 0) {
        continue;
      }
      const hintNameOffset = image.vaToRawOffset(image.imageBase + lookup);
      if (hintNameOffset === undefined) {
        throw new Error("PE import name points outside file-backed data");
      }
      imports.push({
        dll,
        name: readCString(buffer, hintNameOffset + 2),
        iatVa: image.imageBase + firstThunk + index * 4,
      });
    }
  }
  return imports;
}

function requireImport(imports, iatVa, expectedDll, expectedName) {
  const imported = imports.find((candidate) => candidate.iatVa === iatVa);
  if (!imported) {
    throw new Error(`PE import ${toHex(iatVa)} is missing`);
  }
  assertEqual(imported.dll, expectedDll, `${toHex(iatVa)} import DLL`);
  assertEqual(imported.name, expectedName, `${toHex(iatVa)} import name`);
  return { ...imported, iatVa: toHex(imported.iatVa) };
}

function readAnalysisJson(path, expectedSourceSha256, label) {
  const parsed = JSON.parse(readFileSync(resolve(path), "utf8"));
  assertEqual(
    parsed.sourceSha256,
    expectedSourceSha256,
    `${path} source SHA-256`,
  );
  if (typeof parsed.schemaVersion !== "number") {
    throw new Error(`${path} is not a supported ${label} document`);
  }
  return parsed;
}

function requireFunction(seeds, entry) {
  const functionReport = seeds.functions?.find(
    (candidate) => candidate.entry === toHex(entry),
  );
  if (!functionReport || !Array.isArray(functionReport.instructions)) {
    throw new Error(`seed analysis is missing function ${toHex(entry)}`);
  }
  return functionReport;
}

function summarizeFunction(functionReport) {
  return {
    entry: functionReport.entry,
    name: functionReport.name,
    bodyRanges: functionReport.bodyRanges,
    basicBlockCount: functionReport.basicBlocks.length,
    instructionCount: functionReport.instructions.length,
    instructionSha256: functionReport.instructionSha256,
  };
}

function requireCallEdge(references, callsite, caller, callee) {
  const match = references.find(
    (reference) =>
      reference.type.endsWith("CALL") &&
      reference.from === toHex(callsite) &&
      reference.fromFunctionEntry === toHex(caller) &&
      reference.to === toHex(callee),
  );
  if (!match) {
    throw new Error(
      `required call edge ${toHex(callsite)}: ${toHex(caller)} -> ${toHex(callee)} is missing`,
    );
  }
  return {
    callsite: match.from,
    caller: match.fromFunctionEntry,
    callee: match.to,
  };
}

function validateCodeAnchor(buffer, image, anchor) {
  const rawOffset = image.vaToRawOffset(anchor.va);
  if (rawOffset === undefined) {
    throw new RangeError(`${toHex(anchor.va)} is not file-backed`);
  }
  const expected = Buffer.from(anchor.bytes.replaceAll(" ", ""), "hex");
  const actual = buffer.subarray(rawOffset, rawOffset + expected.length);
  if (Buffer.compare(actual, expected) !== 0) {
    throw new Error(
      `code anchor ${anchor.id} mismatch at ${toHex(anchor.va)}: expected ${formatBytes(expected)}, got ${formatBytes(actual)}`,
    );
  }
  return {
    id: anchor.id,
    va: toHex(anchor.va),
    rawOffset: toHex(rawOffset),
    byteLength: expected.length,
    bytes: formatBytes(actual),
    meaning: anchor.meaning,
    matched: true,
  };
}

function addDword(left, right) {
  return Number(BigInt.asUintN(32, BigInt(left) + BigInt(right)));
}

function subtractDword(left, right) {
  return Number(BigInt.asUintN(32, BigInt(left) - BigInt(right)));
}

function toSignedDword(value) {
  return Number(BigInt.asIntN(32, BigInt(value)));
}

function toSignedWord(value) {
  return (value << 16) >> 16;
}

function validateBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw new TypeError(`${label} must be a boolean; got ${value}`);
  }
}

function validateSignedDwordBits(value, label) {
  if (
    !Number.isInteger(value) ||
    value < -0x80000000 ||
    value > 0xffffffff
  ) {
    throw new RangeError(
      `${label} must be signed value or raw DWORD bits (-2147483648..4294967295); got ${value}`,
    );
  }
}

function validateUnsignedDword(value, label) {
  validateIntegerRange(value, 0, 0xffffffff, label);
}

function validateUnsignedWord(value, label) {
  validateIntegerRange(value, 0, 0xffff, label);
}

function validateIntegerRange(value, minimum, maximum, label) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(
      `${label} must be an integer in ${minimum}..${maximum}; got ${value}`,
    );
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function formatBytes(buffer) {
  return [...buffer].map((value) => value.toString(16).padStart(2, "0")).join(" ");
}

function parseCliArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      options.json = true;
      continue;
    }
    const optionMap = {
      "--executable": "executablePath",
      "--seeds": "seedsPath",
      "--references": "referencesPath",
      "--jump-tables": "jumpTablesPath",
    };
    const key = optionMap[argument];
    if (!key || index + 1 >= argv.length) {
      throw new Error(`unknown or incomplete argument: ${argument}`);
    }
    options[key] = argv[index + 1];
    index += 1;
  }
  return options;
}

function main() {
  const options = parseCliArguments(process.argv.slice(2));
  const report = extractK01ProjectilePoolCadence(options);
  process.stdout.write(
    options.json
      ? `${JSON.stringify(report, null, 2)}\n`
      : `${report.evidenceStatus}: ${report.invocationCount.perAcceptedOriginalStep} pool call per accepted original step; ${report.integrationStatus}\n`,
  );
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
