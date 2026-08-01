#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  extractK01ClockSelectorInitializationEvidence,
  replayColdStartSelector,
} from "./extract-k01-clock-selector-initialization-evidence.mjs";
import {
  extractK01ClockModeProducers,
  selectOriginalBaseInterval,
} from "./extract-k01-clock-mode-producers.mjs";
import {
  extractK01ModeDirectWriters,
  replayModeRoutine,
} from "./extract-k01-mode-direct-writers.mjs";
import {
  extractK01ModeReachability,
  replayK01StageOneLifecycle,
} from "./extract-k01-mode-reachability.mjs";
import {
  extractK01MissionResultLifecycle,
} from "./extract-k01-mission-result-lifecycle.mjs";
import {
  extractK01ProjectilePoolCadence,
} from "./extract-k01-projectile-pool-cadence.mjs";
import {
  extractK01StateThreeModeBoundary,
} from "./extract-k01-state-three-mode-boundary.mjs";
import { readPeImage } from "./pe-image.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DEFAULT_PATHS = {
  executablePath: resolve(ROOT, "original/imjinrok2/imjinrok2.exe"),
  functionsPath: resolve(ROOT, "analysis/generated/imjinrok2/functions.json"),
  referencesPath: resolve(ROOT, "analysis/generated/imjinrok2/references.json"),
  jumpTablesPath: resolve(ROOT, "analysis/generated/imjinrok2/jump-tables.json"),
  seedsPath: resolve(ROOT, "analysis/generated/imjinrok2/seeds.json"),
};
const CANONICAL_PATHS = {
  executablePath: "original/imjinrok2/imjinrok2.exe",
  functionsPath: "analysis/generated/imjinrok2/functions.json",
  referencesPath: "analysis/generated/imjinrok2/references.json",
  jumpTablesPath: "analysis/generated/imjinrok2/jump-tables.json",
  seedsPath: "analysis/generated/imjinrok2/seeds.json",
};
const EXPECTED_EXE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";

const FUNCTION_ENTRIES = [
  ["mainMessageLoop", "0x0045f9c0"],
  ["configStartup", "0x0045f190"],
  ["settingsDefaultInitializer", "0x0043f4f0"],
  ["configLoader", "0x0043f6e0"],
  ["stageMapDispatcher", "0x0048d410"],
  ["stageMapCopy", "0x0048d740"],
  ["stepScheduler", "0x00447bc0"],
  ["preUpdateDispatcher", "0x004464c0"],
  ["distinctTickResultWrapper", "0x004481d0"],
  ["missionDispatcher", "0x0048ddb0"],
  ["timerResolver", "0x0048d6f0"],
  ["k01StageUpdater", "0x0048a5c0"],
  ["entityAndProjectileUpdater", "0x00447360"],
  ["entityUpdateDispatcher", "0x0043c9c0"],
  ["projectileSubtypeUpdate", "0x00410cc0"],
  ["projectileSlotCleanup", "0x00411180"],
  ["secondaryProjectileUpdate", "0x00401440"],
  ["secondaryProjectileCleanup", "0x00401ac0"],
  ["modeWriter", "0x00485890"],
];

const REQUIRED_CALLS = [
  ["0x0045fa3b", "0x0045f9c0", "0x0045f190", "stage/session startup"],
  ["0x0045f20c", "0x0045f190", "0x0043f6e0", "config load"],
  ["0x0045f21a", "0x0045f190", "0x0043f4f0", "load failure default"],
  ["0x0043f728", "0x0043f6e0", "0x004adf44", "persisted settings transfer"],
  ["0x0045fd5d", "0x0045f9c0", "0x00447bc0", "state 3 scheduler"],
  ["0x0048dc6d", "0x0048dbe0", "0x0048d410", "stage dispatch"],
  ["0x0048d42b", "0x0048d410", "0x0048d740", "K01 map source"],
  ["0x00447c18", "0x00447bc0", "0x004464c0", "pre-update"],
  ["0x004464f5", "0x004464c0", "0x004481d0", "distinct tick result wrapper"],
  ["0x004481e4", "0x004481d0", "0x0048ddb0", "mission result resolver"],
  ["0x0048dde5", "0x0048ddb0", "0x0048d6f0", "win/loss timer resolver"],
  ["0x0048de12", "0x0048ddb0", "0x0048a5c0", "K01 stage 1 updater"],
  ["0x00447c65", "0x00447bc0", "0x00447e10", "wall-clock acceptance gate"],
  ["0x00447cb8", "0x00447bc0", "0x00447360", "accepted entity/projectile pass"],
  ["0x00447499", "0x00447360", "0x0043c9c0", "active entity update"],
  ["0x004474d0", "0x00447360", "0x00410cc0", "projectile pool A update"],
  ["0x004474da", "0x00447360", "0x00411180", "projectile pool A cleanup"],
  ["0x00447505", "0x00447360", "0x00401440", "projectile pool B update"],
  ["0x0044750f", "0x00447360", "0x00401ac0", "projectile pool B cleanup"],
];

const CODE_ANCHORS = [
  ["stage-one-main-state-entry", 0x004600cb, "e8 a0 56 fe ff e8 0b db 02 00 e8 f6 56 fe ff 66 89 3d c8 df 4b 00", "main state 1 enters standard mission startup and then stores continuation state 3"],
  ["stage-one-k01-case", 0x0048d410, "0f bf 44 24 04 48 56 83 f8 1b 8b f1 0f 87 f8 00 00 00 ff 24 85 98 d5 48 00 8b ce e8 10 03 00 00", "signed stage selector case 1 reaches the K01 map source copier"],
  ["state-three-scheduler-call", 0x0045fd5d, "e8 5e 7e fe ff", "raw main state 3 calls the accepted-update scheduler"],
  ["pre-update-result-call", 0x00447c18, "e8 a3 e8 ff ff 83 f8 01 0f 84 ce 00 00 00", "pre-update returns one and rejects the scheduler attempt before wall-clock acceptance"],
  ["result-wrapper-order", 0x004481d0, "a1 80 5f 7c 00 8b 0d 80 27 55 00 3b c1 74 44 a3 80 27 55 00 e8 c7 5b 04 00", "raw global tick is compared, cached first on a distinct value, then mission dispatch is called"],
  ["timer-before-stage", 0x0048ddb0, "b8 01 00 00 00 56 66 39 05 34 6e c0 00 75 05 66 33 c0 5e c3 66 39 05 7c 62 7c 00", "dispatcher pre-gates and timer resolution precede signed stage dispatch"],
  ["accepted-pool-call", 0x00447c85, "a1 80 5f 7c 00 40 83 f8 14 a3 80 5f 7c 00 72 23 75 11 8b 0d 04 2e 88 00 51 e8 dd b3 ff ff 83 c4 04 eb 10 8b 15 04 2e 88 00 52 50 e8 fb b3 ff ff 83 c4 08 e8 a3 f6 ff ff", "an accepted step increments the raw tick and calls the outer entity/projectile updater once"],
  ["entity-loop-and-pools", 0x004474bd, "33 f6 bd e8 85 aa 00 bf 00 25 84 00 66 39 1f 74 14 8b cd e8 eb 97 fc ff 85 c0 75 09 56 e8 a1 9c fc ff 83 c4 04 46 83 c7 02 81 c5 a0 03 00 00 66 83 fe 64 7c d7", "the updater performs an active entity pass and a 100-slot projectile pass; its adjacent loop also covers 60 raw slots"],
  ["config-default-selector", 0x0043f504, "c7 42 14 02 00 00 00", "load failure calls the initializer, which writes selector DWORD 2 at settings object +0x14"],
  ["config-success-transfer", 0x0043f71f, "57 6a 01 68 d4 01 00 00 56 e8 17 e8 06 00", "successful config load transfers 0x1d4 bytes into the settings object, including selector +0x14"],
  ["mode-guard-branch", 0x00485900, "83 3d f4 df 4b 00 00 75 31 66 8b 44 24 04 66 3d 01 00 75 16 66 a1 14 c8 c5 00 66 c7 05 20 6e c0 00 01 00", "mode writer accepts only argument WORD 1 and chooses mode 1 for guard zero or mode 0 for nonzero guard"],
];

export function extractK01AcceptedUpdateScheduler(options = {}) {
  const paths = { ...DEFAULT_PATHS, ...options };
  const sourceSha256 = hash(readFileSync(paths.executablePath));
  if (sourceSha256 !== EXPECTED_EXE_SHA256) {
    throw new Error(`original EXE SHA-256: expected ${EXPECTED_EXE_SHA256}, got ${sourceSha256}`);
  }

  // These existing extractors are independent, source-bound witnesses. Calling them here
  // keeps this packet fail-closed when any shared generated artifact, call edge, or anchor is
  // stale or tampered, without treating a child report as dynamic evidence.
  const selector = extractK01ClockSelectorInitializationEvidence({
    executablePath: paths.executablePath,
    functionsPath: paths.functionsPath,
    referencesPath: paths.referencesPath,
  });
  const mode = extractK01ClockModeProducers({
    executablePath: paths.executablePath,
    functionsPath: paths.functionsPath,
    referencesPath: paths.referencesPath,
    jumpTablesPath: paths.jumpTablesPath,
  });
  const modeReachability = extractK01ModeReachability({
    executablePath: paths.executablePath,
    functionsPath: paths.functionsPath,
    referencesPath: paths.referencesPath,
    jumpTablesPath: paths.jumpTablesPath,
  });
  const modeWriters = extractK01ModeDirectWriters({
    executablePath: paths.executablePath,
    functionsPath: paths.functionsPath,
    referencesPath: paths.referencesPath,
    jumpTablesPath: paths.jumpTablesPath,
  });
  const projectile = extractK01ProjectilePoolCadence({
    executablePath: paths.executablePath,
    seedsPath: paths.seedsPath,
    referencesPath: paths.referencesPath,
    jumpTablesPath: paths.jumpTablesPath,
  });
  const mission = extractK01MissionResultLifecycle({
    input: paths.executablePath,
    seeds: paths.seedsPath,
    functions: paths.functionsPath,
    references: paths.referencesPath,
    jumpTables: paths.jumpTablesPath,
  });
  const stateThree = extractK01StateThreeModeBoundary({
    executablePath: paths.executablePath,
    functionsPath: paths.functionsPath,
    referencesPath: paths.referencesPath,
    jumpTablesPath: paths.jumpTablesPath,
  });

  const { image, buffer } = readPeImage(paths.executablePath);
  const referenceDocument = JSON.parse(readFileSync(paths.referencesPath, "utf8"));
  const functionEvidence = mergeFunctionEvidence([
    selector.functionEvidence,
    mode.functionEvidence,
    modeReachability.functionEvidence,
    modeWriters.functionEvidence,
    projectile.analyzedFunctions,
    mission.analyzedFunctions,
    stateThree.functionEvidence,
  ]);
  const callEdges = mergeCallEdges([
    selector.callEdges,
    mode.callEdges,
    modeReachability.callEdges,
    modeWriters.callEdges,
    projectile.callEdges,
    mission.callEdges,
    stateThree.callEdges,
  ]);
  for (const reference of referenceDocument.references) {
    if (reference.type.endsWith("CALL")) {
      callEdges.push({
        callsite: reference.from,
        caller: reference.fromFunctionEntry,
        callee: reference.to,
      });
    }
  }
  const calls = REQUIRED_CALLS.map(([site, caller, callee, role]) => {
    const found = callEdges.find(
      (edge) => edge.callsite === site && edge.caller === caller && edge.callee === callee,
    );
    if (!found) throw new Error(`accepted-update call edge missing: ${site}`);
    return { callsite: site, caller, callee, role };
  });

  return {
    question:
      "After K01 stage 1 entry, which concrete source-bound producers determine scheduler mode, selector, guard, and persisted config, and in what order and count do the K01 updater, entity updates, projectile pools, and result resolver run in one accepted source update?",
    source: {
      executablePath: CANONICAL_PATHS.executablePath,
      byteLength: buffer.byteLength,
      sha256: sourceSha256,
    },
    analysisStatus: "static-confirmed-bounded-chain-with-unresolved-mode-producer",
    reproductionStatus: "reproduction-complete",
    implementationStatus: "none",
    generatedArtifacts: {
      functions: artifactProvenance(paths.functionsPath, sourceSha256, "functions", CANONICAL_PATHS.functionsPath),
      references: artifactProvenance(paths.referencesPath, sourceSha256, "references", CANONICAL_PATHS.referencesPath),
      jumpTables: artifactProvenance(paths.jumpTablesPath, sourceSha256, "jump tables", CANONICAL_PATHS.jumpTablesPath),
      seeds: artifactProvenance(paths.seedsPath, sourceSha256, "seeds", CANONICAL_PATHS.seedsPath),
    },
    functionEvidence,
    rawCodeRanges: functionEvidence.map((entry) => ({
      entry: entry.entry,
      ranges: entry.bodyRanges ?? (entry.bodyRange ? [entry.bodyRange] : []),
    })),
    callEdges: calls,
    codeAnchors: CODE_ANCHORS.map(([id, va, bytes, meaning]) =>
      validateAnchor(buffer, image, { id, va, bytes, meaning }),
    ),
    producerInventory: {
      stageReachability: {
        mainStateEntry: "raw WORD 1 at 0x004600cb",
        stageSelector: "signed WORD 1 at 0x0048d410/0x0048d422",
        mapSource: "0x0048d740 (stagemap\\k01.map)",
        continuation: "main loop continuation DI=3 writes raw main state 3",
        scheduler: "0x0045fd5d -> FUN_00447bc0",
        sourceBound: true,
      },
      persistedSelector: {
        address: "0x00634acc",
        width: "DWORD",
        object: "0x00634ab8 + 0x14",
        failure: "FUN_0045f9c0 -> FUN_0045f190 -> FUN_0043f6e0 returns zero -> FUN_0043f4f0 writes 2",
        success: "FUN_0043f6e0 transfers 0x1d4 bytes to the settings object; persisted +0x14 bytes are retained",
        producerStatus: "static-confirmed-cold-start-boundary",
      },
      schedulerMode: {
        address: "0x00c06e20",
        width: "WORD",
        consumer: "raw state 23 calls FUN_00447bc0 only when mode equals 1; raw state 3 calls scheduler directly",
        argumentOne: "FUN_00485890 writes 1 when guard WORD 0x004bdff4 is zero, otherwise writes 0",
        argumentOther: "argument WORD 2 and all other values perform no mode write",
        directWriters: modeWriters.directModeWrites,
        k01Reachability: modeReachability.k01Lifecycle,
        producerStatus: "K01-stage-1-value-unresolved",
      },
      guard: {
        address: "0x004bdff4",
        width: "WORD",
        directWriters: canonicalizeGuardDirectWrites(modeReachability.guardDirectWrites),
        accepted: "guard == 0 allows argument WORD 1 to write scheduler mode 1",
        rejected: "guard != 0 makes argument WORD 1 write scheduler mode 0",
        aliasBoundary: modeWriters.contract.boundary,
        producerStatus: "direct-reference-inventory-only",
      },
      clock: {
        modeAddress: "0x00c06e20",
        selectorAddress: "0x00634acc",
        resultClockAddress: "0x00882e04",
        rawGlobalTickAddress: "0x007c5f80",
        cachedGlobalTickAddress: "0x00552780",
        lastAcceptedMillisecondsAddress: "0x0055276c",
        feedbackAddress: "0x0054a4a8",
        effectiveIntervalAddress: "0x00552794",
        periodicCounterAddress: "0x00552788",
        semanticBoundary: "raw millisecond fields and raw DWORD tick are source fields; no fixed-Hz or 24 Hz multiplier is inferred",
      },
    },
    acceptedStep: {
      scheduler: "FUN_00447bc0",
      orderedCalls: [
        "FUN_00447bc0",
        "FUN_004464c0 (pre-update)",
        "FUN_004481d0 (distinct raw-tick result wrapper)",
        "FUN_0048ddb0 (pre-gates -> timer resolver -> stage dispatch)",
        "FUN_0048d6f0 (timer resolver; before K01 stage updater)",
        "FUN_0048a5c0 (stage 1 K01 updater, only on distinct tick and no prior result)",
        "FUN_00447e10 (wall-clock acceptance gate)",
        "FUN_00447360 (exactly once after acceptance)",
        "FUN_0043c9c0 (once per active entity record in the pass)",
        "FUN_00410cc0/FUN_00401440 (conditional active projectile slots)",
      ],
      resultOrdering: "K01 updater/result resolver runs in pre-update before entity/projectile updates. A result AX 1/0xffff makes FUN_004464c0 return 1 and prevents the accepted-step pool call.",
      invocationCounts: {
        k01StageUpdater: "at most one per FUN_004481d0 call; same raw tick skips wrapper dispatch",
        entityUpdater: "one FUN_0043c9c0 per active-list entry observed by FUN_00447360",
        outerProjectilePool: "one FUN_00447360 call per accepted scheduler step",
        projectilePoolA: "one forward pass over 100 raw slots per FUN_00447360 call",
        projectilePoolB: "one forward pass over 60 raw slots per FUN_00447360 call",
        resultResolver: "one FUN_0048d6f0 call per distinct-tick dispatcher call unless an earlier pre-gate returns",
      },
      rejectionOrder: [
        "state-23 mode != 1 (main-loop gate only)",
        "scheduler transition branch",
        "pre-update result == 1",
        "clock gate == 0",
        "command readiness == 0 when command gate mode == 0",
      ],
      sourceBound: true,
    },
    vectors: createVectors(),
    linkedEvidence: {
      selector: selector.question,
      mode: mode.question,
      modeReachability: modeReachability.question,
      modeWriters: modeWriters.question,
      projectile: projectile.question,
      mission: mission.question,
    },
    proposedAdapter: {
      inputs: [
        "raw source mode WORD and selector DWORD (or explicit unresolved policy) ",
        "raw global tick, cached tick, current/result-clock DWORDs",
        "accepted/rejected scheduler gate outcomes",
        "active entity records and projectile pool slot snapshots",
      ],
      outputs: [
        "ordered source-update event trace",
        "entity update count and projectile pool pass count",
        "raw mission result AX and result-code side effects",
      ],
      integration: "analysis-only contract; no package/runtime adapter is authorized until raw clock units, identity mapping, and mode/guard producer reachability are separately closed",
    },
    uncertainties: [
      "K01 stage-one state 1 -> state 3 -> scheduler reachability is closed, but no source-bound edge proves the concrete mode WORD value at a K01 run.",
      "The guard direct-write set is exact for canonical direct references but serialization/address aliases and indirect writers remain unresolved.",
      "Successful config transfer retains selector bytes in the destination range; config validity and the selected K01 session are not inferred.",
      "FUN_00446420 and the internal entity/projectile callees are retained as raw call contracts; their human semantics are outside this packet.",
      "The raw result clock and raw global tick units are not mapped to project time, and no fixed-Hz multiplier is claimed.",
    ],
  };
}

export function replayStageOneEntry({ mainStateWord, stageSelector, state23ModeWord = 1 }) {
  word(mainStateWord, "mainStateWord");
  word(stageSelector, "stageSelector");
  word(state23ModeWord, "state23ModeWord");
  const stage = replayK01StageOneLifecycle({ mainStateWord, stageWord: stageSelector });
  if (mainStateWord === 23) {
    return {
      ...stage,
      stageEntryReached: false,
      stageOneCaseReached: false,
      nextMainStateWord: 23,
      schedulerReached: state23ModeWord === 1,
      modeGate: state23ModeWord === 1 ? "accepted" : "rejected",
    };
  }
  return { ...stage, modeGate: "not-applicable" };
}

export function replayModeGuard({ previousModeWord, guardWord, argumentWord }) {
  word(previousModeWord, "previousModeWord");
  word(guardWord, "guardWord");
  word(argumentWord, "argumentWord");
  const result = replayModeRoutine({ previousModeWord, guardWord, argumentWord });
  return {
    ...result,
    write: argumentWord === 1 ? result.modeWord : null,
    guardAccepted: guardWord === 0,
    modeInput: previousModeWord,
  };
}

export function replayAcceptedUpdate({
  mainStateWord = 3,
  state23ModeWord = 1,
  stageSelector = 1,
  rawGlobalTick,
  cachedGlobalTick,
  transitionGuardWord = 0,
  preUpdateResultAx = 0,
  preGateResultAx = 0,
  dispatcherResultAx = 0,
  timerResolverResult = 0,
  clockGateResult = 1,
  commandGateModeWord = 1,
  commandReadinessResult = 1,
  acceptedStepCounter = 0,
  activeEntityCount = 0,
  projectilePoolAActiveCount = 0,
  projectilePoolBActiveCount = 0,
}) {
  word(mainStateWord, "mainStateWord");
  word(state23ModeWord, "state23ModeWord");
  word(stageSelector, "stageSelector");
  dword(rawGlobalTick, "rawGlobalTick");
  dword(cachedGlobalTick, "cachedGlobalTick");
  word(transitionGuardWord, "transitionGuardWord");
  word(preUpdateResultAx, "preUpdateResultAx");
  word(preGateResultAx, "preGateResultAx");
  word(dispatcherResultAx, "dispatcherResultAx");
  word(timerResolverResult, "timerResolverResult");
  dword(clockGateResult, "clockGateResult");
  word(commandGateModeWord, "commandGateModeWord");
  dword(commandReadinessResult, "commandReadinessResult");
  dword(acceptedStepCounter, "acceptedStepCounter");
  nonNegativeInteger(activeEntityCount, "activeEntityCount");
  nonNegativeInteger(projectilePoolAActiveCount, "projectilePoolAActiveCount");
  nonNegativeInteger(projectilePoolBActiveCount, "projectilePoolBActiveCount");

  const events = [];
  if (mainStateWord !== 3 && mainStateWord !== 23) {
    return rejected(events, "main-state-not-scheduler");
  }
  if (mainStateWord === 23) {
    events.push({ kind: "state-23-mode-read", value: state23ModeWord });
    if (state23ModeWord !== 1) return rejected(events, "state-23-mode-reject");
  }
  events.push({ kind: "call", target: "0x00447bc0" });
  events.push({ kind: "call", target: "0x004464c0" });
  if (transitionGuardWord === 1 && mainStateWord === 3) {
    events.push({ kind: "scheduler-reject", reason: "early-transition" });
    return rejected(events, "early-transition");
  }
  events.push({ kind: "call", target: "0x004481d0" });
  if (rawGlobalTick !== cachedGlobalTick) {
    events.push({ kind: "raw-tick-cache-write", value: rawGlobalTick });
    events.push({ kind: "call", target: "0x0048ddb0" });
    if (preGateResultAx !== 0) {
      events.push({ kind: "dispatcher-pre-gate-result", value: preGateResultAx });
    } else if (timerResolverResult !== 0) {
      events.push({ kind: "call", target: "0x0048d6f0" });
      events.push({ kind: "timer-result", value: timerResolverResult });
    } else if (dispatcherResultAx === 0 || dispatcherResultAx === 1 || dispatcherResultAx === 0xffff) {
      events.push({ kind: "call", target: "0x0048d6f0" });
      if (stageSelector !== 1) return rejected(events, "non-k01-stage");
      events.push({ kind: "call", target: "0x0048a5c0" });
    }
    if (preGateResultAx === 1 || preGateResultAx === 0xffff || dispatcherResultAx === 1 || dispatcherResultAx === 0xffff || timerResolverResult === 1 || timerResolverResult === 0xffff) {
      events.push({ kind: "result-commit", value: preGateResultAx || dispatcherResultAx || timerResolverResult });
      events.push({ kind: "call", target: "0x00446420" });
      return rejected(events, "pre-update-result");
    }
  }
  if (preUpdateResultAx === 1) return rejected(events, "pre-update-result");
  events.push({ kind: "call", target: "0x00447e10" });
  if (clockGateResult === 0) return rejected(events, "clock-gate-reject");
  if (commandGateModeWord === 0) {
    events.push({ kind: "command-readiness", value: commandReadinessResult });
    if (commandReadinessResult === 0) return rejected(events, "command-readiness-reject");
  }
  events.push({ kind: "raw-tick-increment", value: (rawGlobalTick + 1) >>> 0 });
  events.push({ kind: "call", target: "0x00447360" });
  events.push({ kind: "entity-update-pass", count: activeEntityCount, target: "0x0043c9c0" });
  events.push({ kind: "projectile-pool-pass", pool: "A", slots: 100, activeCalls: projectilePoolAActiveCount, target: "0x00410cc0" });
  events.push({ kind: "projectile-pool-pass", pool: "B", slots: 60, activeCalls: projectilePoolBActiveCount, target: "0x00401440" });
  return {
    accepted: true,
    rejection: null,
    acceptedStepCounter: (acceptedStepCounter + 1) >>> 0,
    projectilePoolCallCount: 1,
    entityUpdateCallCount: activeEntityCount,
    events,
  };
}

function createVectors() {
  const modeSelector = [0, 1, 2, 3, 4].map((selector) => selectOriginalBaseInterval({ modeWord: 0, selector }));
  const sameTick = replayAcceptedUpdate({ rawGlobalTick: 7, cachedGlobalTick: 7, activeEntityCount: 2 });
  const nextTick = replayAcceptedUpdate({ rawGlobalTick: 8, cachedGlobalTick: 7, activeEntityCount: 2 });
  const accepted = replayAcceptedUpdate({ rawGlobalTick: 1, cachedGlobalTick: 0, activeEntityCount: 3, projectilePoolAActiveCount: 2, projectilePoolBActiveCount: 1 });
  const resultBeforePass = replayAcceptedUpdate({ rawGlobalTick: 2, cachedGlobalTick: 1, dispatcherResultAx: 1, activeEntityCount: 3 });
  return [
    { id: "config-open-failure-default-selector", result: replayColdStartSelector({ configLoadSucceeded: false }), expected: { selector: 2, source: "initializer-after-load-failure" } },
    { id: "config-success-retains-selector", result: replayColdStartSelector({ configLoadSucceeded: true, persistedSelector: 3 }), expected: { selector: 3, source: "config-hq-transfer" } },
    { id: "selector-0-through-4", result: modeSelector, expected: [64, 60, 50, 40, 30] },
    { id: "mode-one-bypasses-selector", result: selectOriginalBaseInterval({ modeWord: 1, selector: 0xffffffff }), expected: 50 },
    { id: "mode-non-one-uses-selector", result: selectOriginalBaseInterval({ modeWord: 0, selector: 3 }), expected: 40 },
    { id: "guard-reject-and-accept", result: [replayModeGuard({ previousModeWord: 0, guardWord: 0, argumentWord: 1 }), replayModeGuard({ previousModeWord: 1, guardWord: 1, argumentWord: 1 })].map(({ modeWord, guardAccepted, write }) => ({ modeWord, guardAccepted, write })), expected: [{ modeWord: 1, guardAccepted: true, write: 1 }, { modeWord: 0, guardAccepted: false, write: 0 }] },
    { id: "same-raw-tick-skips-result-dispatch", result: sameTick.events.filter(({ target }) => target === "0x0048ddb0").length, expected: 0 },
    { id: "next-distinct-raw-tick-dispatches-result", result: nextTick.events.filter(({ target }) => target === "0x0048ddb0").length, expected: 1 },
    { id: "dispatcher-pre-gate-skips-k01", result: replayAcceptedUpdate({ rawGlobalTick: 9, cachedGlobalTick: 8, preGateResultAx: 1 }).events.filter(({ target }) => target === "0x0048a5c0").length, expected: 0 },
    { id: "accepted-step-pool-once", result: { poolCalls: accepted.projectilePoolCallCount, entityCalls: accepted.entityUpdateCallCount }, expected: { poolCalls: 1, entityCalls: 3 } },
    { id: "result-before-entity-and-pool", result: [resultBeforePass.events.findIndex(({ target }) => target === "0x0048a5c0"), resultBeforePass.events.findIndex(({ target }) => target === "0x00447360")], expected: [6, -1] },
    { id: "raw-tick-wrap-distinct", result: replayAcceptedUpdate({ rawGlobalTick: 0, cachedGlobalTick: 0xffffffff }).events.filter(({ kind }) => kind === "raw-tick-cache-write").length, expected: 1 },
    { id: "clock-gate-boundary-reject", result: replayAcceptedUpdate({ rawGlobalTick: 4, cachedGlobalTick: 3, clockGateResult: 0 }).rejection, expected: "clock-gate-reject" },
    { id: "command-gate-boundary-reject", result: replayAcceptedUpdate({ rawGlobalTick: 5, cachedGlobalTick: 4, commandGateModeWord: 0, commandReadinessResult: 0 }).rejection, expected: "command-readiness-reject" },
  ];
}

function mergeFunctionEvidence(groups) {
  const map = new Map();
  for (const group of groups) {
    for (const entry of group) {
      const key = entry.entry;
      if (!map.has(key)) map.set(key, entry);
    }
  }
  return [...map.values()].sort((left, right) => left.entry.localeCompare(right.entry));
}

function mergeCallEdges(groups) {
  const map = new Map();
  for (const group of groups) {
    for (const edge of group) {
      const normalized = {
        callsite: edge.callsite ?? edge.callSite ?? edge.from,
        caller: edge.caller ?? edge.fromFunctionEntry,
        callee: edge.callee ?? edge.to,
      };
      map.set(`${normalized.callsite}:${normalized.caller}:${normalized.callee}`, normalized);
    }
  }
  return [...map.values()];
}

function validateAnchor(buffer, image, { id, va, bytes, meaning }) {
  const offset = image.vaToRawOffset(va);
  if (offset === undefined) throw new RangeError(`${id} is not file-backed`);
  const expected = Buffer.from(bytes.replaceAll(" ", ""), "hex");
  if (Buffer.compare(buffer.subarray(offset, offset + expected.length), expected) !== 0) {
    throw new Error(`code anchor ${id} mismatch at 0x${va.toString(16)}`);
  }
  return { id, va: `0x${va.toString(16).padStart(8, "0")}`, rawOffset: `0x${offset.toString(16)}`, bytes, meaning, matched: true };
}

function rejected(events, reason) {
  events.push({ kind: "scheduler-reject", reason });
  return { accepted: false, rejection: reason, acceptedStepCounter: undefined, projectilePoolCallCount: 0, entityUpdateCallCount: 0, events };
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}
function artifactProvenance(path, sourceSha256, label, canonicalPath) {
  const buffer = readFileSync(path);
  const digest = hash(buffer);
  const document = JSON.parse(buffer.toString("utf8"));
  if (document.sourceSha256 !== sourceSha256) {
    throw new Error(`${label} source SHA-256: expected ${sourceSha256}, got ${document.sourceSha256}`);
  }
  return { path: canonicalPath, byteLength: buffer.byteLength, sha256: digest };
}
function canonicalizeGuardDirectWrites(directWriters) {
  if (!directWriters.referenceArtifact) return directWriters;
  return {
    ...directWriters,
    referenceArtifact: {
      ...directWriters.referenceArtifact,
      path: CANONICAL_PATHS.referencesPath,
    },
  };
}
function word(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new RangeError(`${label} must be an unsigned WORD; got ${value}`);
}
function dword(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError(`${label} must be an unsigned DWORD; got ${value}`);
}
function nonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative integer; got ${value}`);
}

function writeOutputIfRequested(report) {
  const outputIndex = process.argv.indexOf("--output");
  if (outputIndex === -1) return;
  const output = process.argv[outputIndex + 1];
  if (!output) throw new Error("--output requires a path");
  writeFileSync(resolve(output), `${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = extractK01AcceptedUpdateScheduler();
  writeOutputIfRequested(report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
