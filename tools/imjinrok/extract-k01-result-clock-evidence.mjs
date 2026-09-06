#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolveMissionTimers,
  runDistinctRawTickResultCommit,
} from "./extract-k01-mission-result-lifecycle.mjs";
import { readCString, readPeImage, toHex } from "./pe-image.mjs";
import {
  assertEqual,
  sha256,
  verifyEvidencePoint,
  verifyRawCodeRange,
  verifySeededFunction,
} from "./static-evidence.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const EXPECTED_EXE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";

const DEFAULTS = {
  executablePath: resolve(ROOT, "original/imjinrok2/imjinrok2.exe"),
  functionsPath: resolve(ROOT, "analysis/generated/imjinrok2/functions.json"),
  referencesPath: resolve(ROOT, "analysis/generated/imjinrok2/references.json"),
  seedsPath: resolve(ROOT, "analysis/generated/imjinrok2/seeds.json"),
};

const EXPECTED_ARTIFACTS = {
  functions: {
    byteLength: 1468333,
    sha256:
      "7e071fdfe425d22447780c265fe1d3fd271a1bedd1773682bebcb8ddc6d2e16e",
  },
  references: {
    byteLength: 17206569,
    sha256:
      "f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5",
  },
  seeds: {
    byteLength: 9436451,
    sha256:
      "386b0f4e86c3376f34fe2b50fedb7e45b762c30784d4ebcc0387aa6f431811b2",
  },
};

const FUNCTION_CONTRACTS = [
  [
    0x0045f9c0,
    "0x0045f9c0-0x004607ac",
    801,
    "b694ee213a1b5f189ed7455e00690dcb29d970eca6ea87ef1f59c42c611cfb24",
  ],
  [
    0x00482340,
    "0x00482340-0x0048238c",
    22,
    "0f33a0727962c95b37e0fc232b1b921a85fe450b61dc295f73e316bc9cbdc35d",
  ],
  [
    0x00482390,
    "0x00482390-0x00482393",
    2,
    "0f019498e796041d4448ab24729aef7f664c3ce9d648fa54ddbe4eefc6a502ab",
  ],
  [
    0x004823a0,
    "0x004823a0-0x004823a3",
    2,
    "89917ca0f56c10aa67814cd5318e7dc1c9f1dd3e7b94e915eda062024850563e",
  ],
  [
    0x004823d0,
    "0x004823d0-0x004824b6",
    78,
    "bf77645626bb9b349beb9538b839627be0d0a05a4bf409a552793ca726c9e7c5",
  ],
  [
    0x004824c0,
    "0x004824c0-0x0048258b",
    62,
    "95f05a63f15937b7c68e7af68969cb1af50005fe2d2030b9319268fb19961281",
  ],
  [
    0x0048a5c0,
    "0x0048a5c0-0x0048a878",
    181,
    "c2a0e73fb0e208846f77187fa11310cdd4177f62c6fbd61732d822f513115791",
  ],
  [
    0x00482180,
    "0x00482180-0x004822f4",
    114,
    "acf831ee8a608862cb7c64595f3a90b7799a967b1c9b7b38b0da9fe6e1b20f8c",
  ],
  [
    0x004888b0,
    "0x004888b0-0x00488935",
    27,
    "c1d0633e74c828fdec79d86d00a83f2b50873092e4f1dc6ed3e58ae1d88fa2ab",
  ],
  [
    0x00482010,
    "0x00482010-0x00482146",
    101,
    "f498d313ccfd6c08016c2e612d0b579736fe8ada1348dc6d5a8fd4630a174ebd",
  ],
];

const SEEDED_FUNCTION_CONTRACTS = [
  [
    0x0045f9c0,
    "0x0045f9c0-0x004607ac",
    209,
    801,
    "7081ada042adc4fa3a7d7b838f717c52bbd63fae2c45be566b0351cfd12dc022",
  ],
  [
    0x004824c0,
    "0x004824c0-0x0048258b",
    16,
    62,
    "e3702a7856d2015dd125ebac0e5d52bf45476df74df70928beeebce1b657aa28",
  ],
];

const RAW_CODE_RANGES = [
  [
    "main-message-queue-and-gate",
    0x0045fc88,
    0x0045fd02,
    "48f824c120c214dfc793df3e8fe4c1fda9af00ef9f7ccc71e9048c1c09a104cf",
  ],
  [
    "main-result-clock-sample-and-pre-dispatch",
    0x0045fd02,
    0x0045fd36,
    "24f4cb133ecc36340ade50b10cf0ec5e463fc3660d720035d3c0f9ce5e24ce24",
  ],
  [
    "main-state-dispatch-entry",
    0x0045fd36,
    0x0045fd63,
    "043510726fef4410724c6785a48732ea7eb9a72a527f702a183acb77e35cc47b",
  ],
  [
    "script-run-flag-function",
    0x00482340,
    0x0048238d,
    "b141a423aa35bb79fe7532a6874929c54f62fed2706addbabefd8a3469beddae",
  ],
  [
    "script-stop-function",
    0x004823d0,
    0x004824b7,
    "55e726a80d109c3a79ef1f7930ffbc1567203d9ebea5c794447167c59840a003",
  ],
  [
    "script-record-consumer",
    0x004824c0,
    0x0048258c,
    "e3702a7856d2015dd125ebac0e5d52bf45476df74df70928beeebce1b657aa28",
  ],
  [
    "script-loader-function",
    0x00482180,
    0x004822f5,
    "e36885f3f9cce298d6ca89a85c606cdeb280cfaac6fe2a1a35752bb1ba8fd178",
  ],
  [
    "k01-script-context-consumer",
    0x004888b0,
    0x00488936,
    "19fe96bcb4b2f818b672fe0e842dfcaf121cc95d3ffb36de64339ffac1df6380",
  ],
  [
    "k01-script-context-cleanup",
    0x00482010,
    0x00482147,
    "1b6026efd4dc1dc53dc4a01f3f1335043508d8fb0a970058e396d627df9499e5",
  ],
];

const EVIDENCE_POINTS = [
  [
    0x0045fc88,
    "55 55 55 8d 4c 24 20 55 51 ff 15 44 72 4b 00 85 c0 74 2e",
    "PeekMessageA is checked before the idle branch; a queued message takes the dispatch path and the loop restarts before result-clock sampling",
  ],
  [
    0x0045fd02,
    "8b 15 04 2e 88 00 89 15 b0 c0 88 00 ff 15 70 72 4b 00 a3 04 2e 88 00",
    "idle path copies the old result-clock DWORD to 0x0088c0b0, calls the timeGetTime IAT, and stores the returned DWORD at 0x00882e04",
  ],
  [
    0x0045fd36,
    "0f bf 05 c8 df 4b 00 83 f8 28 0f 8f be 06 00 00 0f 84 a5 06 00 00 48 83 f8 22 0f 87 32 ff ff ff",
    "signed main-state dispatch follows the clock sample and includes the original state 3/23 branches",
  ],
  [
    0x00482340,
    "56 8b f1 8b 46 04 85 c0 74 41 8b 46 08 85 c0 75 3a 6a 00 b9 80 36 5e 00 e8 d3 5d 02 00 b9 80 36 5e 00 e8 39 5e 02 00 c7 46 08 01 00 00 00 66 c7 86 18 0c 00 00 00 00 c7 46 0c 00 00 00 00 33 c0 81 c6 20 0c 00 00 89 06 89 46 04 5e c3",
    "script-run helper requires object+0x4 nonzero and object+0x8 zero, then sets object+0x8 to one and clears its run metadata fields",
  ],
  [
    0x004823d0,
    "56 8b f1 57 33 ff 83 7e 04 01 75 10 83 7e 08 01 75 03 89 7e 08 66 89 be 18 0c 00 00",
    "script-stop helper clears object+0x8 only when object+0x4 and object+0x8 are both exactly one, then continues cleanup",
  ],
  [
    0x004824a7,
    "7e 14 68 e8 03 00 00 ff 15 68 71 4b 00 5f 5e c3",
    "stop helper performs additional cleanup, pushes Sleep(1000), and returns after the projected run-flag clear",
  ],
  [
    0x0048256e,
    "75 13 83 f8 01 75 0e 8b 46 0c 85 c0 75 07 8b ce e8 4d fe ff ff",
    "completed-record readiness path calls script-stop only when readiness is one and object+0xc is zero",
  ],
  [
    0x0048a775,
    "b9 08 be bc 00 66 89 35 dc 38 84 00 e8 1a 7c ff ff 85 c0 75 19 68 38 2f 4c 00 b9 08 be bc 00 e8 e7 79 ff ff b9 08 be bc 00 e8 9d 7b ff ff",
    "K01 calls the +0x4 getter at 0x0048a781; a nonzero result marks script-busy and skips the K0120 start call",
  ],
  [
    0x0048a7f2,
    "66 39 35 dc 38 84 00 75 17 b9 08 be bc 00 e8 8b 7b ff ff 85 c0 75 09 66 8b c6 5e 5d 83 c4 50 c3",
    "after the K01 scan, the +0x8 getter at 0x0048a800 gates the direct return-one path",
  ],
  [
    0x0048218f,
    "8b 46 04 85 c0 74 05 e8 75 fe ff ff 8b 9c 24 10 10 00 00 8b ce 53",
    "script loader checks object+0x4 and clears/replaces an existing loaded script before its new load attempt",
  ],
  [
    0x004822c5,
    "68 18 94 55 00 e8 71 8d fc ff 83 c4 10 c7 46 04 01 00 00 00 66 c7 06 01 00 66 c7 46 02 01 00 5f 5e b8 01 00 00 00 5b 81 c4 00 10 00 00 c2",
    "successful script loader path sets object+0x4 to one and returns one after initializing its loaded record",
  ],
  [
    0x0048a6e8,
    "e8 c3 e1 ff ff a1 80 5f 7c 00 3b c5 77 11 33 d2 b9 c8 00 00 00 f7 f1 85 d2 0f 85 69 01 00 00",
    "K01 calls the script-context consumer before the general source/presence update at 0x0048a707",
  ],
  [
    0x004888b0,
    "b9 08 be bc 00 e8 e6 9a ff ff 83 f8 01 75 76",
    "K01 script-context consumer reads object+0x4 through FUN_004823a0 and gates the completed-record consumer on readiness one",
  ],
  [
    0x004888c4,
    "e8 f7 9b ff ff",
    "the K01 script-context consumer calls FUN_004824c0 using the same 0x00bcbe08 context",
  ],
  [
    0x00488919,
    "e8 72 9a ff ff 85 c0 75 13 b9 08 be bc 00",
    "after consuming records, K01 reads object+0x8 and enters cleanup only when the projected run flag is clear",
  ],
  [
    0x00488927,
    "e8 e4 96 ff ff 66 c7 05 2e 6e c0 00 00 00",
    "the K01 script-context consumer calls FUN_00482010 to finish the loaded-context cleanup",
  ],
  [
    0x00482010,
    "55 56 8b f1 83 7e 08 01 75 05 e8 b1 03 00 00",
    "FUN_00482010 checks object+0x8 and calls FUN_004823d0 when the script is still running before its remaining cleanup",
  ],
  [
    0x0048212c,
    "8b ce e8 1d 0f 00 00 66 89 ae 18 0c 00 00 66 89 ae 1a 0c 00 00 89 6e 04 5e 5d c3",
    "FUN_00482010 calls FUN_00483050, clears record counters, and finally clears object+0x4 before returning",
  ],
];

const REQUIRED_CALLS = [
  [0x0048257e, 0x004824c0, 0x004823d0],
  [0x0048de12, 0x0048ddb0, 0x0048a5c0],
  [0x0048a6e3, 0x0048a5c0, 0x00482340],
  [0x0048a794, 0x0048a5c0, 0x00482180],
  [0x0048a781, 0x0048a5c0, 0x004823a0],
  [0x0048a79e, 0x0048a5c0, 0x00482340],
  [0x0048a800, 0x0048a5c0, 0x00482390],
  [0x0048a6e8, 0x0048a5c0, 0x004888b0],
  [0x004888b5, 0x004888b0, 0x004823a0],
  [0x004888c4, 0x004888b0, 0x004824c0],
  [0x00488919, 0x004888b0, 0x00482390],
  [0x00488927, 0x004888b0, 0x00482010],
  [0x0048201a, 0x00482010, 0x004823d0],
  [0x0048212e, 0x00482010, 0x00483050],
];

const MAIN_RESULT_CLOCK_REFERENCES = [
  ["0x0045fd02", "0x0045f9c0", "0x00882e04", "READ"],
  ["0x0045fd14", "0x0045f9c0", "0x00882e04", "WRITE"],
  ["0x0045fd62", "0x0045f9c0", "0x00882e04", "READ"],
];

const DIRECT_RESULT_CLOCK_WRITES = [
  ["0x0045fd14", "0x0045f9c0", "0x00882e04", "WRITE"],
];

export function replayResultClockSample({
  previousClock,
  unsignedSample,
  messageQueuePending = false,
  mainGateBlocked = false,
}) {
  dword(previousClock, "previousClock");
  dword(unsignedSample, "unsignedSample");
  bool(messageQueuePending, "messageQueuePending");
  bool(mainGateBlocked, "mainGateBlocked");

  if (messageQueuePending || mainGateBlocked) {
    return {
      sampled: false,
      reason: messageQueuePending ? "message-queue" : "main-gate",
      previousClock: previousClock >>> 0,
      unsignedSample: null,
      resultClock: previousClock >>> 0,
      elapsed: null,
      wrapped: false,
    };
  }

  const next = unsignedSample >>> 0;
  return {
    sampled: true,
    reason: "idle-gate-passed",
    previousClock: previousClock >>> 0,
    unsignedSample: next,
    resultClock: next,
    elapsed: (next - (previousClock >>> 0)) >>> 0,
    wrapped: next < (previousClock >>> 0),
  };
}

export function replayScriptLoader({ loaderReturn, readinessBefore = 0 }) {
  word(loaderReturn, "loaderReturn");
  dword(readinessBefore, "readinessBefore");
  if (loaderReturn !== 0 && loaderReturn !== 1) {
    throw new RangeError("loaderReturn must be either zero or one in the bounded K01 loader projection");
  }
  if (readinessBefore !== 0) {
    throw new RangeError(
      "replayScriptLoader models the K01 load call only when object+0x4 is zero; use replayScriptFlagLifecycle for an already-loaded context",
    );
  }
  if (loaderReturn === 1) {
    return {
      returnValue: 1,
      readinessBefore: readinessBefore >>> 0,
      readinessAfter: 1,
      loaderCalled: true,
      source: "loader-success-writes-object-plus-0x4",
    };
  }
  return {
    returnValue: 0,
    readinessBefore: readinessBefore >>> 0,
    readinessAfter: 0,
    loaderCalled: true,
    source: "loader-zero-return-before-success-write",
  };
}

export function replayScriptFlagLifecycle({
  readinessBefore = 0,
  runFlagBefore = 0,
  loaderReturn = 0,
  loadRequested = true,
  startRequested = true,
  completedRecordReady = false,
  completionGate = 0,
}) {
  dword(readinessBefore, "readinessBefore");
  dword(runFlagBefore, "runFlagBefore");
  word(loaderReturn, "loaderReturn");
  bool(loadRequested, "loadRequested");
  bool(startRequested, "startRequested");
  bool(completedRecordReady, "completedRecordReady");
  dword(completionGate, "completionGate");

  let readiness = readinessBefore >>> 0;
  let runFlag = runFlagBefore >>> 0;
  let loader = null;
  const events = [];
  if (readiness === 0 && loadRequested) {
    loader = replayScriptLoader({ loaderReturn, readinessBefore: 0 });
    readiness = loader.readinessAfter;
    events.push({ kind: "loader", ...loader });
  } else {
    events.push({
      kind: "load-skipped",
      reason: readiness !== 0 ? "already-loaded" : "load-not-requested",
      loaderCalled: false,
      readiness,
    });
  }
  if (startRequested) {
    if (readinessBefore === 0 && readiness !== 0 && runFlag === 0) {
      runFlag = 1;
      events.push({ kind: "run", precondition: "object+0x4 != 0 && object+0x8 == 0", runFlag });
    } else {
      events.push({
        kind: "run-skipped",
        reason: readiness === 0 ? "loader-not-ready" : readinessBefore !== 0 ? "already-loaded-context" : "script-busy",
        runFlag,
      });
    }
  }

  let stopped = false;
  let cleanedUp = false;
  if (completedRecordReady && completionGate === 0 && readiness === 1 && runFlag === 1) {
    runFlag = 0;
    stopped = true;
    events.push({ kind: "stop", precondition: "record-ready && object+0xc == 0", runFlag, sleepMs: 1000 });
  }
  if (readiness === 1 && runFlag === 0) {
    readiness = 0;
    cleanedUp = true;
    events.push({
      kind: "cleanup",
      function: "FUN_00482010",
      projectedWrite: "object+0x4 = 0",
      runFlag,
    });
  }
  return {
    loader,
    readiness,
    runFlag,
    stopped,
    cleanedUp,
    events,
  };
}

export function replayResultClockToMission({
  previousClock,
  unsignedSample,
  messageQueuePending = false,
  mainGateBlocked = false,
  rawGlobalTick,
  cachedGlobalTick,
  winTimer,
  lossTimer,
}) {
  const sample = replayResultClockSample({
    previousClock,
    unsignedSample,
    messageQueuePending,
    mainGateBlocked,
  });
  dword(rawGlobalTick, "rawGlobalTick");
  dword(cachedGlobalTick, "cachedGlobalTick");
  dword(winTimer, "winTimer");
  dword(lossTimer, "lossTimer");

  if (!sample.sampled) {
    return { sample, timerResolution: null, commit: null };
  }

  let timerResolution = null;
  const commit = runDistinctRawTickResultCommit({
    rawGlobalTick,
    cachedGlobalTick,
    runDispatcher: () => {
      timerResolution = resolveMissionTimers({
        winTimer,
        lossTimer,
        resultClock: sample.resultClock,
      });
      return {
        resultAx:
          timerResolution.result === 1
            ? 1
            : timerResolution.result === -1
              ? 0xffff
              : 0,
        events: timerResolution.events,
      };
    },
  });
  return { sample, timerResolution, commit };
}

export function extractK01ResultClockEvidence({
  executablePath = DEFAULTS.executablePath,
  functionsPath = DEFAULTS.functionsPath,
  referencesPath = DEFAULTS.referencesPath,
  seedsPath = DEFAULTS.seedsPath,
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  assertEqual(sha256(buffer), EXPECTED_EXE_SHA256, `${executablePath} SHA-256`);
  const functions = readArtifact(functionsPath, "functions");
  const references = readArtifact(referencesPath, "references");
  const seeds = readArtifact(seedsPath, "seeds");
  for (const [label, artifact] of [
    ["functions", functions],
    ["references", references],
    ["seeds", seeds],
  ]) {
    assertEqual(
      artifact.document.sourceSha256,
      EXPECTED_EXE_SHA256,
      `${label} source SHA-256`,
    );
  }

  const functionEvidence = FUNCTION_CONTRACTS.map((contract) =>
    requireFunction(functions.document.functions, ...contract),
  );
  const seededFunctions = SEEDED_FUNCTION_CONTRACTS.map((contract) =>
    verifySeededFunction(buffer, image, seeds.document, {
      entry: toHex(contract[0]),
      bodyRange: contract[1],
      blockCount: contract[2],
      instructionCount: contract[3],
      bodySha256: contract[4],
    }),
  );
  const callEdges = REQUIRED_CALLS.map(([site, caller, callee]) =>
    requireCall(references.document.references, site, caller, callee),
  );
  const mainResultClockReferences = requireExactReferenceSet(
    references.document.references.filter(
      (reference) =>
        reference.fromFunctionEntry === "0x0045f9c0" &&
        reference.to === "0x00882e04",
    ),
    MAIN_RESULT_CLOCK_REFERENCES,
    "2fc3e2c8bf4fff945a973fec584344d8b223f6bed5cb4d8491a73712401abd19",
    "main result-clock reference set",
  );
  const directResultClockWrites = requireExactReferenceSet(
    references.document.references.filter(
      (reference) =>
        reference.type === "WRITE" && reference.to === "0x00882e04",
    ),
    DIRECT_RESULT_CLOCK_WRITES,
    "e1eaea242e6fc3ab23e784cab2a11f094b8c3997bc9eb2615b1d4dc2b31851cc",
    "direct result-clock write set",
  );
  const imports = parsePeImports(buffer, image);
  const timeGetTime = requireImport(
    imports,
    0x004b7270,
    "WINMM.dll",
    "timeGetTime",
    152,
  );
  const sleep = requireImport(imports, 0x004b7168, "KERNEL32.dll", "Sleep", 662);

  return {
    question:
      "What exact original DWORD result clock is sampled by the main idle loop, how is its script-run flag sourced for K01, and what bounded downstream result gates consume the sample?",
    evidenceStatus: "static-confirmed-bounded-result-clock-and-script-flag-source",
    reproductionStatus: "reproduction-complete",
    integrationStatus: "gated-no-native-24hz-or-wall-clock-policy",
    source: {
      executable: {
        path: relative(ROOT, executablePath),
        sha256: EXPECTED_EXE_SHA256,
      },
      generatedArtifacts: {
        functions: functions.provenance,
        references: references.provenance,
        seeds: seeds.provenance,
      },
    },
    imports: {
      timeGetTime,
      sleep,
      timeGetTimeSemantics: {
        type: "DWORD",
        unit: "milliseconds since system start",
        wrap: "modulo 2^32",
        precision: "system-dependent; no fixed native Hz claim",
        documentation:
          "https://learn.microsoft.com/en-us/windows/win32/api/timeapi/nf-timeapi-timegettime",
      },
    },
    analyzedFunctions: functionEvidence,
    seededFunctions,
    rawCodeRanges: RAW_CODE_RANGES.map(([id, start, endExclusive, digest]) =>
      verifyRawCodeRange(buffer, image, {
        id,
        start,
        endExclusive,
        sha256: digest,
      }),
    ),
    codeAnchors: EVIDENCE_POINTS.map(([va, bytes, meaning]) =>
      verifyEvidencePoint(buffer, image, { va, bytes, meaning }),
    ),
    callEdges,
    referenceSets: {
      mainResultClock: {
        entries: mainResultClockReferences,
        sha256:
          "2fc3e2c8bf4fff945a973fec584344d8b223f6bed5cb4d8491a73712401abd19",
      },
      directResultClockWrites: {
        entries: directResultClockWrites,
        sha256:
          "e1eaea242e6fc3ab23e784cab2a11f094b8c3997bc9eb2615b1d4dc2b31851cc",
        statement:
          "The canonical direct WRITE inventory has one entry: main idle sample 0x0045fd14 -> DWORD 0x00882e04.",
      },
    },
    fields: {
      resultClock: "DWORD 0x00882e04; overwritten by main idle timeGetTime sample",
      previousClockCopy:
        "DWORD 0x0088c0b0 receives the prior 0x00882e04 value at 0x0045fd08",
      rawGlobalTick: "DWORD 0x007c5f80; separate from result clock and used by result commit gating",
      scriptContext: {
        base: "ECX = 0x00bcbe08",
        readiness: "DWORD +0x4",
        runFlag: "DWORD +0x8",
        completionReady: "DWORD +0xc",
      },
    },
    mainLoop: {
      queueAndGate:
        "PeekMessageA drains queued messages first; the main gate repeats while WORD 0x00c06e24 is nonzero or (when DWORD 0x00634c90 is zero) the signed state is outside accepted states {3, 23, 24, 26}. A nonzero 0x00634c90 therefore overrides the state list and permits the sample after the queue is empty.",
      sampleOrder: [
        "read 0x00882e04",
        "write prior value to 0x0088c0b0",
        "call WINMM.dll!timeGetTime through IAT 0x004b7270",
        "write returned DWORD to 0x00882e04",
        "dispatch the signed main state",
      ],
      stateDispatchFollowsSample: true,
      sourceBoundary:
        "The loop and state dispatch are static evidence; no fixed native update frequency is inferred.",
    },
    scriptFlagLifecycle: {
      loader: {
        function: "FUN_00482180",
        success: "loader success writes object+0x4 = 1 and returns one",
        failure: "when K01 has object+0x4 == 0, loader zero returns before the success write; K01 does not use the loader return as its run gate",
        k01Callsite: "0x0048a794",
      },
      run: {
        function: "FUN_00482340",
        preconditions: ["object+0x4 != 0", "object+0x8 == 0"],
        writes: [
          "object+0x8 = 1",
          "object+0xc18 = 0",
          "object+0xc = 0",
          "object+0xc20 = 0",
          "object+0xc24 = 0",
        ],
      },
      stop: {
        function: "FUN_004823d0",
        preconditions: ["object+0x4 == 1", "object+0x8 == 1"],
        projectedWrite: "object+0x8 = 0",
        beyondProjection:
          "The stop routine continues resource and record cleanup and calls Sleep(1000) through KERNEL32.dll!Sleep; those effects are not collapsed into the run flag.",
      },
      completionChain: {
        contextFunction: "FUN_004888b0",
        k01Callsite: "0x0048a6e8",
        context: "ECX = 0x00bcbe08",
        order: [
          "FUN_004823a0 checks object+0x4 before FUN_004824c0 consumes completed records",
          "FUN_00482390 checks object+0x8 after the consumer",
          "when object+0x8 is clear, FUN_00482010 performs loaded-context cleanup",
          "FUN_00482010 calls FUN_004823d0 when object+0x8 is one and clears object+0x4 at its tail",
        ],
        cleanupFunction: "FUN_00482010",
        cleanupProjectedWrite: "object+0x4 = 0",
        cleanupTail: "FUN_00483050 and record-counter cleanup precede the object+0x4 clear at 0x00482141",
      },
      readinessConsumer: {
        function: "FUN_004824c0",
        branch:
          "When the completed-record index reaches the count, readiness is one, and object+0xc is zero, it calls FUN_004823d0; K01 reaches this consumer through FUN_004888b0.",
      },
      k01: {
        function: "FUN_0048a5c0",
        contextConsumer: "FUN_004888b0 at callsite 0x0048a6e8, before the general source/presence update at 0x0048a707",
        busyGetter: "FUN_004823a0 reads object+0x4 at callsite 0x0048a781",
        postGetter: "FUN_00482390 reads object+0x8 at callsite 0x0048a800",
        startCalls: ["0x0048a6e3", "0x0048a79e"],
        directReturn:
          "After the K01 scan, exact runFlag zero permits AX one; nonzero runFlag continues the later failure/hero checks.",
      },
    },
    scriptFlagVectors: scriptFlagVectors(),
    downstream: {
      sourceModule:
        "tools/imjinrok/extract-k01-mission-result-lifecycle.mjs",
      timerResolver: {
        helper: "resolveMissionTimers",
        thresholdMilliseconds: 0x7d0,
        comparison: "signed absolute DWORD delta > 2000; equality remains immature",
        vectors: timerVectors(),
      },
      distinctRawTickGate: {
        helper: "runDistinctRawTickResultCommit",
        rule:
          "equal rawGlobalTick and cachedGlobalTick skips the dispatcher; a distinct tick writes the cache before dispatcher evaluation",
        vectors: distinctTickVectors(),
      },
      unitBoundary:
        "The result clock and raw global tick are separate DWORD values. No native 24 Hz conversion, fixed FPS, or project adapter is claimed here.",
    },
    testVectors: buildTestVectors(),
    uncertainties: [
      "timeGetTime precision is variable and the main message/gate loop does not establish a fixed wall-clock frequency",
      "0x00882e04 result-clock units are bounded to the imported millisecond API; relationship to project 24 Hz remains an integration policy boundary",
      "stop-routine resource cleanup beyond the projected object+0x8/object+0x4 transitions and Sleep(1000) is retained as raw behavior but not modeled by the bounded flag replay",
      "the full script/compositor/scheduler state machines are outside this evidence unit",
    ],
  };
}

function buildTestVectors() {
  const replay = (id, input) => ({ id, input, result: replayResultClockSample(input) });
  return [
    replay("idle-samples-unsigned-milliseconds", {
      previousClock: 100,
      unsignedSample: 151,
      messageQueuePending: false,
      mainGateBlocked: false,
    }),
    replay("queued-message-does-not-sample", {
      previousClock: 100,
      unsignedSample: 151,
      messageQueuePending: true,
      mainGateBlocked: false,
    }),
    replay("main-gate-does-not-sample", {
      previousClock: 100,
      unsignedSample: 151,
      messageQueuePending: false,
      mainGateBlocked: true,
    }),
    replay("dword-wrap-sample", {
      previousClock: 0xfffffffe,
      unsignedSample: 1,
      messageQueuePending: false,
      mainGateBlocked: false,
    }),
  ];
}

function scriptFlagVectors() {
  return [
    {
      id: "successful-load",
      input: { loaderReturn: 1, readinessBefore: 0, runFlagBefore: 0, loadRequested: true, startRequested: false, completedRecordReady: false, completionGate: 0 },
      result: replayScriptFlagLifecycle({ loaderReturn: 1, readinessBefore: 0, runFlagBefore: 0, loadRequested: true, startRequested: false, completedRecordReady: false, completionGate: 0 }),
    },
    {
      id: "successful-load-starts-script",
      input: { loaderReturn: 1, readinessBefore: 0, runFlagBefore: 0, loadRequested: true, startRequested: true, completedRecordReady: false, completionGate: 0 },
      result: replayScriptFlagLifecycle({ loaderReturn: 1, readinessBefore: 0, runFlagBefore: 0, loadRequested: true, startRequested: true, completedRecordReady: false, completionGate: 0 }),
    },
    {
      id: "loader-zero-leaves-readiness-unset",
      input: { loaderReturn: 0, readinessBefore: 0, runFlagBefore: 0, loadRequested: true, startRequested: true, completedRecordReady: false, completionGate: 0 },
      result: replayScriptFlagLifecycle({ loaderReturn: 0, readinessBefore: 0, runFlagBefore: 0, loadRequested: true, startRequested: true, completedRecordReady: false, completionGate: 0 }),
    },
    {
      id: "busy-start-does-not-restart",
      input: { loaderReturn: 1, readinessBefore: 1, runFlagBefore: 1, loadRequested: true, startRequested: true, completedRecordReady: false, completionGate: 0 },
      result: replayScriptFlagLifecycle({ loaderReturn: 1, readinessBefore: 1, runFlagBefore: 1, loadRequested: true, startRequested: true, completedRecordReady: false, completionGate: 0 }),
    },
    {
      id: "final-record-stops-and-sleeps",
      input: { loaderReturn: 1, readinessBefore: 1, runFlagBefore: 1, loadRequested: false, startRequested: false, completedRecordReady: true, completionGate: 0 },
      result: replayScriptFlagLifecycle({ loaderReturn: 1, readinessBefore: 1, runFlagBefore: 1, loadRequested: false, startRequested: false, completedRecordReady: true, completionGate: 0 }),
    },
  ];
}

function timerVectors() {
  return [
    {
      id: "strict-2000-remains-immature",
      input: { winTimer: 1, lossTimer: 0, resultClock: 2001 },
      result: resolveMissionTimers({ winTimer: 1, lossTimer: 0, resultClock: 2001 }),
    },
    {
      id: "strict-2001-matures",
      input: { winTimer: 1, lossTimer: 0, resultClock: 2002 },
      result: resolveMissionTimers({ winTimer: 1, lossTimer: 0, resultClock: 2002 }),
    },
  ];
}

function distinctTickVectors() {
  let sameTickDispatches = 0;
  const sameTick = runDistinctRawTickResultCommit({
    rawGlobalTick: 7,
    cachedGlobalTick: 7,
    runDispatcher: () => {
      sameTickDispatches += 1;
      return { resultAx: 0, events: [] };
    },
  });
  const distinctTick = runDistinctRawTickResultCommit({
    rawGlobalTick: 8,
    cachedGlobalTick: 7,
    runDispatcher: () => ({ resultAx: 0, events: [] }),
  });
  return [
    { id: "same-tick-skips-dispatch", input: { rawGlobalTick: 7, cachedGlobalTick: 7 }, result: sameTick, dispatches: sameTickDispatches },
    { id: "distinct-tick-caches-before-dispatch", input: { rawGlobalTick: 8, cachedGlobalTick: 7 }, result: distinctTick },
  ];
}

function readArtifact(path, label) {
  const expected = EXPECTED_ARTIFACTS[label];
  const buffer = readFileSync(path);
  assertEqual(buffer.byteLength, expected.byteLength, `${label} artifact byte length`);
  const digest = sha256(buffer);
  assertEqual(digest, expected.sha256, `${label} artifact SHA-256`);
  let document;
  try {
    document = JSON.parse(buffer.toString("utf8"));
  } catch (error) {
    throw new Error(`${label} artifact JSON parse failed: ${error.message}`, { cause: error });
  }
  return { document, provenance: { path: relative(ROOT, path), byteLength: buffer.byteLength, sha256: digest } };
}

function requireFunction(functions, entry, bodyRange, instructionCount, instructionSha256) {
  const found = functions.find((candidate) => candidate.entry === toHex(entry));
  if (!found) throw new Error(`functions artifact is missing ${toHex(entry)}`);
  assertEqual(found.bodyRanges?.length, 1, `${toHex(entry)} body range count`);
  assertEqual(found.bodyRanges[0], bodyRange, `${toHex(entry)} body range`);
  assertEqual(found.instructionCount, instructionCount, `${toHex(entry)} instruction count`);
  assertEqual(found.instructionSha256, instructionSha256, `${toHex(entry)} instruction SHA-256`);
  return {
    entry: found.entry,
    name: found.name,
    bodySize: found.bodySize,
    bodyRanges: found.bodyRanges,
    instructionCount: found.instructionCount,
    instructionSha256: found.instructionSha256,
  };
}

function requireCall(references, site, caller, callee) {
  const found = references.find(
    (reference) =>
      reference.type.endsWith("CALL") &&
      reference.from === toHex(site) &&
      reference.fromFunctionEntry === toHex(caller) &&
      reference.to === toHex(callee),
  );
  if (!found) throw new Error(`required call edge ${toHex(site)}: ${toHex(caller)} -> ${toHex(callee)} is missing`);
  return { callsite: found.from, caller: found.fromFunctionEntry, callee: found.to, type: found.type };
}

function requireExactReferenceSet(references, expectedEntries, expectedSha256, label) {
  const actual = references
    .map((reference) => ({ site: reference.from, caller: reference.fromFunctionEntry, target: reference.to, type: reference.type }))
    .sort((left, right) => left.site.localeCompare(right.site));
  const expected = expectedEntries
    .map(([site, caller, target, type]) => ({ site, caller, target, type }))
    .sort((left, right) => left.site.localeCompare(right.site));
  assertEqual(JSON.stringify(actual), JSON.stringify(expected), `${label} entries`);
  assertEqual(sha256(JSON.stringify(actual)), expectedSha256, `${label} SHA-256`);
  return actual;
}

function parsePeImports(buffer, image) {
  const peOffset = buffer.readUInt32LE(0x3c);
  const optionalHeaderOffset = peOffset + 24;
  assertEqual(buffer.readUInt16LE(optionalHeaderOffset), 0x10b, "original executable PE32 magic");
  const importDirectoryRva = buffer.readUInt32LE(optionalHeaderOffset + 104);
  const importDirectoryOffset = image.vaToRawOffset(image.imageBase + importDirectoryRva);
  if (importDirectoryOffset === undefined) throw new Error("PE import directory is not file-backed");

  const imports = [];
  for (let descriptorOffset = importDirectoryOffset; ; descriptorOffset += 20) {
    if (descriptorOffset + 20 > buffer.length) throw new Error("PE import descriptor exceeds executable");
    const originalFirstThunkRva = buffer.readUInt32LE(descriptorOffset);
    const nameRva = buffer.readUInt32LE(descriptorOffset + 12);
    const firstThunkRva = buffer.readUInt32LE(descriptorOffset + 16);
    if (originalFirstThunkRva === 0 && nameRva === 0 && firstThunkRva === 0) break;
    const nameOffset = image.vaToRawOffset(image.imageBase + nameRva);
    const lookupOffset = image.vaToRawOffset(image.imageBase + (originalFirstThunkRva || firstThunkRva));
    if (nameOffset === undefined || lookupOffset === undefined) throw new Error("PE import descriptor points outside file-backed data");
    const dll = readCString(buffer, nameOffset);
    for (let index = 0; ; index += 1) {
      const lookupOffsetAtIndex = lookupOffset + index * 4;
      if (lookupOffsetAtIndex + 4 > buffer.length) throw new Error(`PE import lookup for ${dll} exceeds executable`);
      const lookup = buffer.readUInt32LE(lookupOffsetAtIndex);
      if (lookup === 0) break;
      const iatVa = image.imageBase + firstThunkRva + index * 4;
      if ((lookup & 0x80000000) !== 0) {
        imports.push({ dll, ordinal: lookup & 0xffff, iatVa: toHex(iatVa) });
        continue;
      }
      const hintNameOffset = image.vaToRawOffset(image.imageBase + lookup);
      if (hintNameOffset === undefined || hintNameOffset + 2 > buffer.length) throw new Error("PE import name points outside file-backed data");
      imports.push({
        dll,
        name: readCString(buffer, hintNameOffset + 2),
        hint: buffer.readUInt16LE(hintNameOffset),
        iatVa: toHex(iatVa),
        lookupRva: toHex(lookup),
      });
    }
  }
  return imports;
}

function requireImport(imports, iatVa, expectedDll, expectedName, expectedHint) {
  const expectedIat = toHex(iatVa);
  const imported = imports.find((candidate) => candidate.iatVa === expectedIat);
  if (!imported) throw new Error(`PE import ${expectedIat} is missing`);
  assertEqual(imported.dll, expectedDll, `${expectedIat} import DLL`);
  assertEqual(imported.name, expectedName, `${expectedIat} import name`);
  assertEqual(imported.hint, expectedHint, `${expectedIat} import hint`);
  return imported;
}

function dword(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError(`${label} must be an unsigned DWORD`);
}

function word(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new RangeError(`${label} must be an unsigned WORD`);
}

function bool(value, label) {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be a boolean`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(extractK01ResultClockEvidence(), null, 2)}\n`);
}
