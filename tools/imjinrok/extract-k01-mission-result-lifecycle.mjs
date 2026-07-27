#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readPeImage, toHex } from "./pe-image.mjs";

export const EXPECTED_EXE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../..", import.meta.url)),
);
const DEFAULT_PATHS = {
  input: resolve(repositoryRoot, "original/imjinrok2/imjinrok2.exe"),
  seeds: resolve(
    repositoryRoot,
    "analysis/generated/imjinrok2/seeds.json",
  ),
  functions: resolve(
    repositoryRoot,
    "analysis/generated/imjinrok2/functions.json",
  ),
  references: resolve(
    repositoryRoot,
    "analysis/generated/imjinrok2/references.json",
  ),
  jumpTables: resolve(
    repositoryRoot,
    "analysis/generated/imjinrok2/jump-tables.json",
  ),
};

const EXPECTED_FUNCTIONS = new Map([
  [
    0x004481d0,
    [
      "0x004481d0-0x00448225",
      21,
      6,
      "3c4ad59801dd66dcb03339fb810c187160b58ccdc18848f6e80ee39bd77b4d91",
    ],
  ],
  [
    0x00488080,
    [
      "0x00488080-0x004880e4",
      32,
      7,
      "329a17acba64de024a67a0e61cfde1782db422d657ac5c2a89556ed20cebeca5",
    ],
  ],
  [
    0x004492f0,
    [
      "0x004492f0-0x004492fa",
      2,
      1,
      "db1aafb4547828393fb63a1866d2d905456d693b577cdbd67ad50fa5c18d78c5",
    ],
  ],
  [
    0x0048d6f0,
    [
      "0x0048d6f0-0x0048d73a",
      31,
      7,
      "387402e726dae19fdb34ebfe157422a3f02a64b67f29e5b1067ff05386466ff3",
    ],
  ],
  [
    0x0048ddb0,
    [
      "0x0048ddb0-0x0048deca",
      105,
      36,
      "276da99513996baa45d73bd4c09da0fe231fb10e65b762b4bbf3bfb144908981",
    ],
  ],
  [
    0x0048a5c0,
    [
      "0x0048a5c0-0x0048a878",
      181,
      32,
      "c2a0e73fb0e208846f77187fa11310cdd4177f62c6fbd61732d822f513115791",
    ],
  ],
  [
    0x004885e0,
    [
      "0x004885e0-0x0048866f",
      53,
      7,
      "09d7b2ff5ca83aef9a91e08043581e56378ee4374634b1e8a8bdaf5d0f62a175",
    ],
  ],
  [
    0x00441de0,
    [
      "0x00441de0-0x00441e36",
      30,
      8,
      "089aff03f0dfdb520bdbf644b5070da4937027184f506790454cd129c6092528",
    ],
  ],
  [
    0x00441db0,
    [
      "0x00441db0-0x00441dd8",
      12,
      3,
      "12984df20c7bb82eb364b29180f75185fe17ac268bffb3d3c782a7fa6c5adf8e",
    ],
  ],
]);

const REQUIRED_CALL_EDGES = [
  [0x004481e4, 0x004481d0, 0x0048ddb0],
  [0x004481fe, 0x004481d0, 0x00446420],
  [0x00448218, 0x004481d0, 0x00446420],
  [0x0048dde5, 0x0048ddb0, 0x0048d6f0],
  [0x0048ddf0, 0x0048ddb0, 0x004492f0],
  [0x0048de12, 0x0048ddb0, 0x0048a5c0],
  [0x0048a707, 0x0048a5c0, 0x00488080],
  [0x0048a81c, 0x0048a5c0, 0x004885e0],
  [0x0048a822, 0x0048a5c0, 0x00441de0],
  [0x0048a84a, 0x0048a5c0, 0x004885e0],
  [0x0048a850, 0x0048a5c0, 0x00441de0],
  [0x00488099, 0x00488080, 0x00441db0],
  [0x00488630, 0x004885e0, 0x00441db0],
];

const CODE_ANCHORS = [
  {
    id: "distinct-global-tick-result-wrapper",
    va: 0x004481d0,
    bytes:
      "a1 80 5f 7c 00 8b 0d 80 27 55 00 3b c1 74 44 a3 80 27 55 00 e8 c7 5b 04 00 66 3d 01 00 75 1a 66 a3 14 66 7c 00 66 c7 05 c8 df 4b 00 18 00 e8 1d e2 ff ff b8 01 00 00 00 c3 66 3d ff ff 75 14 66 c7 05 c8 df 4b 00 1a 00 e8 03 e2 ff ff b8 01 00 00 00 c3 33 c0 c3",
    meaning:
      "cache raw global tick before dispatch; only AX 1/ffff writes result globals and calls 0x00446420",
  },
  {
    id: "active-list-raw-presence-check",
    va: 0x00488080,
    bytes:
      "56 57 33 ff 66 39 3d 38 37 84 00 7e 4b 0f bf c7 0f bf 34 45 d8 2d 84 00 56 e8 12 9d fb ff 83 c4 04 85 c0 74 29 8d 0c f6 8d 04 4e 8d 04 c0 c1 e0 03 f7 80 cc 52 63 00 02 00 02 00 74 11 66 0f be 90 90 52 63 00 66 3b 15 44 cc bc 00 74 0f 47 66 3b 3d 38 37 84 00 7c b5 5f 33 c0 5e c3 5f b8 01 00 00 00 5e c3",
    meaning:
      "signed active-count/list scan with slot/positive check, raw mask, and signed owner/current-player equality",
  },
  {
    id: "timer-result-global-flag-write",
    va: 0x004492f0,
    bytes: "c7 05 9c 29 55 00 01 00 00 00 c3",
    meaning: "write DWORD 0x0055299c=1 and return",
  },
  {
    id: "strict-wrapped-timer-resolution",
    va: 0x0048d6f0,
    bytes:
      "8b 0d 3c 37 84 00 56 8b 35 04 2e 88 00 85 c9 74 17 8b c6 2b c1 99 33 c2 2b c2 3d d0 07 00 00 7e 07 b8 01 00 00 00 5e c3 8b 0d 40 37 84 00 85 c9 74 15 8b c6 2b c1 99 33 c2 2b c2 3d d0 07 00 00 7e 05 83 c8 ff 5e c3 33 c0 5e c3",
    meaning:
      "win then loss: disabled zero sentinel, wrapped SUB, CDQ/XOR/SUB, signed JLE 0x7d0",
  },
  {
    id: "dispatcher-pre-timer-and-k01-order",
    va: 0x0048ddb0,
    bytes:
      "b8 01 00 00 00 56 66 39 05 34 6e c0 00 75 05 66 33 c0 5e c3 66 39 05 7c 62 7c 00 0f 84 f8 00 00 00 66 39 05 7e 62 7c 00 75 06 66 0d ff ff 5e c3 b9 68 f0 ab 00 e8 06 f9 ff ff 8b f0 85 f6 74 0a e8 fb b4 fb ff 66 8b c6 5e c3 0f bf 05 cc af 88 00 48 83 f8 1a 0f 87 a8 00 00 00 ff 24 85 cc de 48 00 e8 a9 c7 ff ff 5e c3",
    meaning:
      "three WORD pre-gates, timer result/flag writer before signed stage selector, stage 1 call to K01 updater",
  },
  {
    id: "general-failure-first-latch",
    va: 0x0048a707,
    bytes:
      "e8 74 d9 ff ff 85 c0 75 14 39 2d 40 37 84 00 75 0c 8b 15 04 2e 88 00 89 15 40 37 84 00",
    meaning:
      "general-presence zero and loss timer zero write current result clock before beacon processing",
  },
  {
    id: "beacon-bypass-then-two-hero-latches",
    va: 0x0048a7f2,
    bytes:
      "66 39 35 dc 38 84 00 75 17 b9 08 be bc 00 e8 8b 7b ff ff 85 c0 75 09 66 8b c6 5e 5d 83 c4 50 c3 66 8b 15 44 cc bc 00 52 6a 4c e8 bf dd ff ff 50 e8 b9 75 fb ff 83 c4 0c 85 c0 75 12 39 2d 40 37 84 00 75 0a a1 04 2e 88 00 a3 40 37 84 00 66 8b 0d 44 cc bc 00 51 6a 4e e8 91 dd ff ff 50 e8 8b 75 fb ff 83 c4 0c 85 c0 75 14 39 2d 40 37 84 00 75 0c 8b 15 04 2e 88 00 89 15 40 37 84 00 5e 66 33 c0 5d 83 c4 50 c3",
    meaning:
      "beacon exact-one/post-state-zero returns AX one before class 76 then class 78 lookup/alive checks and zero-sentinel writes",
  },
];

const EXPECTED_SCOPED_REFERENCES = {
  k01LossTimer: [
    ["0x0048a710", "READ"],
    ["0x0048a71e", "WRITE"],
    ["0x0048a82e", "READ"],
    ["0x0048a83b", "WRITE"],
    ["0x0048a85c", "READ"],
    ["0x0048a86a", "WRITE"],
  ],
  k01WinTimer: [],
  resolverWinTimer: [["0x0048d6f0", "READ"]],
  resolverLossTimer: [["0x0048d718", "READ"]],
  resolverClock: [["0x0048d6f7", "READ"]],
  wrapperGlobalTick: [["0x004481d0", "READ"]],
  wrapperCachedTick: [
    ["0x004481d5", "READ"],
    ["0x004481df", "WRITE"],
  ],
  wrapperResultWord: [["0x004481ef", "WRITE"]],
  wrapperResultCode: [
    ["0x004481f5", "WRITE"],
    ["0x0044820f", "WRITE"],
  ],
  timerCommitFlag: [["0x004492f0", "WRITE"]],
};

export function evaluateGeneralPresence({
  activeCount,
  activeEntries,
  currentPlayer,
}) {
  validateSigned16(activeCount, "activeCount");
  validateSigned16(currentPlayer, "currentPlayer");
  if (!Array.isArray(activeEntries)) {
    throw new TypeError("activeEntries must be an array");
  }
  if (activeCount <= 0) return 0;
  if (activeEntries.length < activeCount) {
    throw new RangeError(
      `activeEntries must contain at least activeCount (${activeCount}) records`,
    );
  }

  for (let index = 0; index < activeCount; index += 1) {
    const entry = activeEntries[index];
    validateActiveEntry(entry, index);
    if (entry.slotTableWord === 0 || entry.recordPositiveWord <= 0) {
      continue;
    }
    if (((entry.flags74 >>> 0) & 0x00020002) === 0) continue;
    if (entry.ownerSignedByte === currentPlayer) return 1;
  }
  return 0;
}

export function selectOwnerClassReference({
  ownerSignedWord,
  listCount,
  entries,
  classByte,
  fallbackReference,
}) {
  validateSigned16(ownerSignedWord, "ownerSignedWord");
  validateSigned16(listCount, "listCount");
  validateByte(classByte, "classByte");
  validateUnsigned32(fallbackReference, "fallbackReference");
  if (!Array.isArray(entries)) throw new TypeError("entries must be an array");
  if (listCount > 0 && entries.length < listCount) {
    throw new RangeError(
      `entries must contain at least listCount (${listCount}) records`,
    );
  }
  if (listCount <= 0) return fallbackReference >>> 0;

  for (let index = 0; index < listCount; index += 1) {
    const entry = entries[index];
    validateLookupEntry(entry, index);
    if (entry.slotTableWord === 0 || entry.recordPositiveWord <= 0) {
      continue;
    }
    if (entry.recordClassByte === classByte) {
      return entry.fullReference >>> 0;
    }
  }
  return fallbackReference >>> 0;
}

export function fullReferenceIsAlive({
  reference,
  slotTableWord,
  healthSignedWord,
  storedFullReference,
}) {
  validateUnsigned32(reference, "reference");
  validateUnsigned16(slotTableWord, "slotTableWord");
  validateSigned16(healthSignedWord, "healthSignedWord");
  validateUnsigned32(storedFullReference, "storedFullReference");
  if (slotTableWord === 0 || healthSignedWord <= 0) return 0;
  return (reference >>> 0) === (storedFullReference >>> 0) ? 1 : 0;
}

export function runK01MissionUpdateResultPath({
  lossTimer,
  resultClock,
  currentPlayer,
  activeCount,
  activeEntries,
  beaconReturn,
  hero76,
  hero78,
}) {
  validateUnsigned32(lossTimer, "lossTimer");
  validateUnsigned32(resultClock, "resultClock");
  validateSigned16(currentPlayer, "currentPlayer");
  validateIntegerRange(beaconReturn, 0, 1, "beaconReturn");
  validateHeroInput(hero76, "hero76");
  validateHeroInput(hero78, "hero78");

  let nextLossTimer = lossTimer >>> 0;
  const events = [];
  const presence = evaluateGeneralPresence({
    activeCount,
    activeEntries,
    currentPlayer,
  });
  events.push({ kind: "general-presence-result", value: presence });
  if (presence === 0 && nextLossTimer === 0) {
    nextLossTimer = resultClock >>> 0;
    events.push({
      kind: "loss-timer-write",
      reason: "general-presence",
      value: nextLossTimer,
    });
  }

  events.push({ kind: "beacon-result", value: beaconReturn });
  if (beaconReturn === 1) {
    return {
      returnAx: 1,
      lossTimer: nextLossTimer,
      events,
    };
  }

  for (const [classByte, hero, label] of [
    [76, hero76, "class-76"],
    [78, hero78, "class-78"],
  ]) {
    const reference = selectOwnerClassReference({
      ownerSignedWord: currentPlayer,
      listCount: hero.listCount,
      entries: hero.entries,
      classByte,
      fallbackReference: hero.fallbackReference,
    });
    events.push({
      kind: "hero-reference-lookup",
      hero: label,
      ownerSignedWord: currentPlayer,
      reference,
    });
    const alive = fullReferenceIsAlive({
      reference,
      ...hero.record,
    });
    events.push({ kind: "hero-alive-result", hero: label, value: alive });
    if (alive === 0 && nextLossTimer === 0) {
      nextLossTimer = resultClock >>> 0;
      events.push({
        kind: "loss-timer-write",
        reason: label,
        value: nextLossTimer,
      });
    }
  }

  return {
    returnAx: 0,
    lossTimer: nextLossTimer,
    events,
  };
}

export function resolveMissionTimers({
  winTimer,
  lossTimer,
  resultClock,
}) {
  validateUnsigned32(winTimer, "winTimer");
  validateUnsigned32(lossTimer, "lossTimer");
  validateUnsigned32(resultClock, "resultClock");
  const events = [];
  for (const [kind, timer, result] of [
    ["win", winTimer, 1],
    ["loss", lossTimer, -1],
  ]) {
    events.push({ kind: "timer-read", timer: kind, value: timer >>> 0 });
    if (timer === 0) continue;
    const delta = (resultClock - timer) >>> 0;
    const absoluteBits = x86Abs32Bits(delta);
    const absoluteSigned = signed32(absoluteBits);
    events.push({
      kind: "timer-distance",
      timer: kind,
      delta,
      absoluteBits,
      absoluteSigned,
    });
    if (absoluteSigned > 0x7d0) {
      return { result, events };
    }
  }
  return { result: 0, events };
}

export function runK01MissionDispatcher({
  gateC06e34,
  gate7c627c,
  gate7c627e,
  winTimer,
  lossTimer,
  resultClock,
  stageSelector,
  runK01Updater,
}) {
  validateUnsigned16(gateC06e34, "gateC06e34");
  validateUnsigned16(gate7c627c, "gate7c627c");
  validateUnsigned16(gate7c627e, "gate7c627e");
  validateSigned16(stageSelector, "stageSelector");
  if (typeof runK01Updater !== "function") {
    throw new TypeError("runK01Updater must be a function");
  }
  const events = [
    { kind: "pre-gate-read", gate: "0x00c06e34", value: gateC06e34 },
  ];
  if (gateC06e34 === 1) return { resultAx: 0, events };
  events.push({
    kind: "pre-gate-read",
    gate: "0x007c627c",
    value: gate7c627c,
  });
  if (gate7c627c === 1) return { resultAx: 1, events };
  events.push({
    kind: "pre-gate-read",
    gate: "0x007c627e",
    value: gate7c627e,
  });
  if (gate7c627e === 1) return { resultAx: 0xffff, events };

  const timer = resolveMissionTimers({ winTimer, lossTimer, resultClock });
  events.push({ kind: "timer-resolver-call" }, ...timer.events);
  if (timer.result !== 0) {
    events.push({
      kind: "timer-result-global-flag-write",
      address: "0x0055299c",
      value: 1,
    });
    return {
      resultAx: timer.result === 1 ? 1 : 0xffff,
      events,
      timerCommitFlag: 1,
    };
  }

  if (stageSelector !== 1) {
    throw new RangeError(
      "only stageSelector 1 is within the K01 reproduction contract",
    );
  }
  events.push({ kind: "stage-dispatch", stageSelector, target: "0x0048a5c0" });
  const update = runK01Updater();
  if (
    !update ||
    !Number.isInteger(update.returnAx) ||
    update.returnAx < 0 ||
    update.returnAx > 0xffff ||
    !Array.isArray(update.events)
  ) {
    throw new TypeError(
      "runK01Updater must return { returnAx: unsigned WORD, events: array }",
    );
  }
  events.push(...update.events);
  return {
    resultAx: update.returnAx,
    events,
    update,
  };
}

export function runDistinctRawTickResultCommit({
  rawGlobalTick,
  cachedGlobalTick,
  runDispatcher,
}) {
  validateUnsigned32(rawGlobalTick, "rawGlobalTick");
  validateUnsigned32(cachedGlobalTick, "cachedGlobalTick");
  if (typeof runDispatcher !== "function") {
    throw new TypeError("runDispatcher must be a function");
  }
  if (rawGlobalTick === cachedGlobalTick) {
    return {
      returnValue: 0,
      cachedGlobalTick,
      events: [],
    };
  }

  const events = [
    {
      kind: "global-tick-cache-write",
      value: rawGlobalTick >>> 0,
    },
    { kind: "mission-dispatcher-call" },
  ];
  const dispatch = runDispatcher();
  validateUnsigned16(dispatch?.resultAx, "dispatcher resultAx");
  if (!Array.isArray(dispatch.events)) {
    throw new TypeError("dispatcher result events must be an array");
  }
  events.push(...dispatch.events);
  if (dispatch.resultAx === 1) {
    events.push(
      { kind: "raw-word-write", address: "0x007c6614", value: 1 },
      { kind: "result-code-write", address: "0x004bdfc8", value: 0x18 },
      { kind: "final-result-call", target: "0x00446420" },
    );
    return {
      returnValue: 1,
      cachedGlobalTick: rawGlobalTick >>> 0,
      events,
    };
  }
  if (dispatch.resultAx === 0xffff) {
    events.push(
      { kind: "result-code-write", address: "0x004bdfc8", value: 0x1a },
      { kind: "final-result-call", target: "0x00446420" },
    );
    return {
      returnValue: 1,
      cachedGlobalTick: rawGlobalTick >>> 0,
      events,
    };
  }
  return {
    returnValue: 0,
    cachedGlobalTick: rawGlobalTick >>> 0,
    events,
  };
}

export function extractK01MissionResultLifecycle(options = {}) {
  const paths = { ...DEFAULT_PATHS, ...options };
  const { buffer: executableBuffer, image } = readPeImage(paths.input);
  const executableSha256 = sha256(executableBuffer);
  if (executableSha256 !== EXPECTED_EXE_SHA256) {
    throw new Error(
      `original executable SHA-256 mismatch: expected ${EXPECTED_EXE_SHA256}, got ${executableSha256}`,
    );
  }
  const seeds = readAnalysisJson(paths.seeds, "seed CFG");
  const functions = readAnalysisJson(paths.functions, "function");
  const references = readAnalysisJson(paths.references, "reference");
  const jumpTables = readAnalysisJson(paths.jumpTables, "jump-table");
  for (const [label, document] of [
    ["seed CFG", seeds],
    ["function", functions],
    ["reference", references],
    ["jump-table", jumpTables],
  ]) {
    if (document.sourceSha256 !== executableSha256) {
      throw new Error(
        `${label} canonical analysis source SHA-256 mismatch: expected ${executableSha256}, got ${document.sourceSha256}`,
      );
    }
  }

  const analyzedFunctions = [...EXPECTED_FUNCTIONS].map(([entry, expected]) =>
    validateFunction(seeds, functions, entry, expected),
  );
  const callEdges = REQUIRED_CALL_EDGES.map(([site, caller, callee]) =>
    requireCallEdge(seeds, functions, site, caller, callee),
  );
  const codeAnchors = CODE_ANCHORS.map((anchor) =>
    validateCodeAnchor(executableBuffer, image, anchor),
  );
  const scopedReferences = validateScopedReferences(references);
  const stageDispatch = validateK01JumpTable(jumpTables);

  return {
    question:
      "For K01, in what exact order and under what raw conditions does FUN_0048a5c0 first latch DWORD 0x00843740 for the general-presence and protected-hero failures, how can its beacon post-state return bypass the hero checks, how does FUN_0048d6f0 resolve DWORD 0x0084373c/0x00843740 across the strict 0x7d0 boundary, signed DWORD subtraction/absolute-value overflow and simultaneous timers, and how do FUN_0048ddb0 and FUN_004481d0 gate, notify, and commit the final result once per distinct raw global tick?",
    evidenceStatus: "static-proven-k01-mission-result-lifecycle",
    reproductionStatus: "reproduction-complete",
    integrationStatus:
      "gated-no-raw-clock-result-transition-or-identity-policy-mapping",
    source: {
      path: paths.input,
      sha256: executableSha256,
    },
    analyzedFunctions,
    callEdges,
    codeAnchors,
    scopedReferences,
    stageDispatch,
    rawGlobals: {
      rawGlobalTick: "0x007c5f80",
      cachedGlobalTick: "0x00552780",
      resultClock: "0x00882e04",
      winTimer: "0x0084373c",
      lossTimer: "0x00843740",
      timerResultCommitFlag: "0x0055299c",
      resultWord: "0x007c6614",
      resultCode: "0x004bdfc8",
    },
    k01Updater: {
      lossOrder: [
        "general-presence",
        "beacon direct-return gate",
        "class-76 lookup/alive",
        "class-78 lookup/alive",
      ],
      zeroSentinel:
        "each failure writes result clock only while loss timer is zero; result clock zero leaves the sentinel zero and permits later same-invocation writes",
      winTimerDirectWrites: 0,
      normalVictory:
        "beacon flag WORD exactly one and script context +8 zero returns AX one directly; it does not write the win timer",
      ownerClassReproductionContract:
        "entries are the explicit raw list selected by signed owner WORD; the helper validates that selector and reproduces the list scan",
      generalPresenceReproductionContract:
        "each active-list entry carries its signed slot index and the explicit slot-table/record raw values selected by that index",
    },
    timerResolver: {
      threshold: 0x7d0,
      comparison: "signed absoluteBits > 0x7d0",
      order: ["win", "loss"],
      zeroSentinel: "disabled",
      arithmetic:
        "wrapped DWORD SUB followed by CDQ/XOR/SUB; 0x80000000 remains signed-negative and is not mature",
    },
    dispatcher: {
      preGates: [
        "WORD 0x00c06e34 == 1 returns AX 0",
        "WORD 0x007c627c == 1 returns AX 1",
        "WORD 0x007c627e == 1 returns AX 0xffff",
      ],
      timerBeforeStage: true,
      timerNonzeroEffect: "call 0x004492f0 then return timer result",
      k01Stage: "signed WORD 0x0088afcc == 1 -> 0x0048a5c0",
    },
    oncePerTick: {
      equalityInput: "raw global tick versus cached global tick",
      cacheWriteOrder: "cache write precedes 0x0048ddb0",
      victory:
        "AX 1 writes WORD 0x007c6614=1, WORD 0x004bdfc8=0x18, calls 0x00446420, returns 1",
      defeat:
        "AX 0xffff writes WORD 0x004bdfc8=0x1a, calls 0x00446420, returns 1",
      otherOrSameTick: "return 0",
    },
    testVectors: buildReferenceVectors(),
    uncertainties: [
      "raw result clock and raw global tick units and their mapping to project 24 Hz are unresolved",
      "FUN_00446420 internal state changes are outside this unit; only its exact call sites and order are proven",
      "the human meaning of FUN_00488080 flags and owner equality is not generalized beyond the raw presence predicate",
      "original slot/reference identity and project result-policy mapping are unresolved",
      "beacon minimap enable/disable lifecycle is user-reported and awaits independent static analysis",
    ],
  };
}

function buildReferenceVectors() {
  return [
    summarizeTimerVector("strict-boundary-2000", {
      winTimer: 1,
      lossTimer: 0,
      resultClock: 2001,
    }),
    summarizeTimerVector("strict-boundary-2001", {
      winTimer: 1,
      lossTimer: 0,
      resultClock: 2002,
    }),
    summarizeTimerVector("signed-absolute-minimum-overflow", {
      winTimer: 1,
      lossTimer: 0,
      resultClock: 0x80000001,
    }),
    summarizeTimerVector("win-immature-loss-mature", {
      winTimer: 100,
      lossTimer: 1,
      resultClock: 2002,
    }),
  ];
}

function summarizeTimerVector(id, input) {
  const output = resolveMissionTimers(input);
  return {
    id,
    input,
    result: output.result,
    distances: output.events
      .filter(({ kind }) => kind === "timer-distance")
      .map(({ timer, delta, absoluteBits, absoluteSigned }) => ({
        timer,
        delta,
        absoluteBits,
        absoluteSigned,
      })),
  };
}

function validateK01JumpTable(jumpTables) {
  const table = jumpTables.tables?.find(
    (candidate) =>
      candidate.functionEntry === "0x0048ddb0" &&
      candidate.switchAddress === "0x0048de0b",
  );
  if (!table) {
    throw new Error("Missing mission stage jump table at 0x0048de0b");
  }
  if (table.cases.length !== 27) {
    throw new Error(
      `Mission stage jump table must contain 27 cases, got ${table.cases.length}`,
    );
  }
  const k01 = table.cases.find(({ label }) => label === 1);
  if (k01?.destination !== "0x0048de12") {
    throw new Error(
      `Mission stage 1 does not map to K01 call block 0x0048de12: ${JSON.stringify(k01)}`,
    );
  }
  return {
    switchAddress: table.switchAddress,
    caseCount: table.cases.length,
    k01Label: 1,
    k01Destination: k01.destination,
    k01CallSite: "0x0048de12",
    k01Callee: "0x0048a5c0",
  };
}

function validateScopedReferences(document) {
  const definitions = [
    ["k01LossTimer", "0x0048a5c0", "0x00843740"],
    ["k01WinTimer", "0x0048a5c0", "0x0084373c"],
    ["resolverWinTimer", "0x0048d6f0", "0x0084373c"],
    ["resolverLossTimer", "0x0048d6f0", "0x00843740"],
    ["resolverClock", "0x0048d6f0", "0x00882e04"],
    ["wrapperGlobalTick", "0x004481d0", "0x007c5f80"],
    ["wrapperCachedTick", "0x004481d0", "0x00552780"],
    ["wrapperResultWord", "0x004481d0", "0x007c6614"],
    ["wrapperResultCode", "0x004481d0", "0x004bdfc8"],
    ["timerCommitFlag", "0x004492f0", "0x0055299c"],
  ];
  const output = {};
  for (const [id, functionEntry, target] of definitions) {
    const actual = document.references
      .filter(
        (reference) =>
          reference.fromFunctionEntry === functionEntry &&
          reference.to === target,
      )
      .map(({ from, type }) => [from, type]);
    assertDeepEqual(actual, EXPECTED_SCOPED_REFERENCES[id], `${id} references`);
    output[id] = {
      functionEntry,
      target,
      references: actual.map(([from, type]) => ({ from, type })),
    };
  }
  return output;
}

function validateFunction(seeds, functions, entry, expected) {
  const seed = requireFunction(seeds, entry);
  const summary = functions.functions?.find(
    (candidate) => candidate.entry === toHex(entry),
  );
  if (!summary) throw new Error(`Missing function summary ${toHex(entry)}`);
  const [range, instructionCount, blockCount, instructionSha256] = expected;
  assertDeepEqual(seed.bodyRanges, [range], `${toHex(entry)} body range`);
  assertEqual(
    seed.instructions.length,
    instructionCount,
    `${toHex(entry)} instruction count`,
  );
  assertEqual(
    seed.basicBlocks.length,
    blockCount,
    `${toHex(entry)} basic-block count`,
  );
  assertEqual(
    summary.instructionSha256,
    instructionSha256,
    `${toHex(entry)} instruction SHA-256`,
  );
  return {
    entry: toHex(entry),
    name: summary.name,
    bodyRanges: seed.bodyRanges,
    instructionCount,
    basicBlockCount: blockCount,
    instructionSha256,
  };
}

function requireCallEdge(seeds, functions, site, caller, callee) {
  const callerSeed = requireFunction(seeds, caller);
  const instruction = callerSeed.instructions.find(
    (candidate) =>
      Number(candidate.address) === site &&
      candidate.text === `CALL ${toHex(callee)}`,
  );
  if (!instruction) {
    throw new Error(
      `Missing call edge ${toHex(site)}: ${toHex(caller)} -> ${toHex(callee)}`,
    );
  }
  const callerSummary = functions.functions?.find(
    (candidate) => candidate.entry === toHex(caller),
  );
  if (!callerSummary?.callees?.includes(toHex(callee))) {
    throw new Error(
      `Function summary omits ${toHex(caller)} -> ${toHex(callee)}`,
    );
  }
  return {
    callSite: toHex(site),
    caller: toHex(caller),
    callee: toHex(callee),
    bytes: instruction.bytes,
  };
}

function validateCodeAnchor(buffer, image, anchor) {
  const rawOffset = image.vaToRawOffset(anchor.va);
  if (rawOffset === undefined) {
    throw new Error(`${toHex(anchor.va)} is not file-backed`);
  }
  const expected = Buffer.from(anchor.bytes.replaceAll(" ", ""), "hex");
  const actual = buffer.subarray(rawOffset, rawOffset + expected.length);
  if (!actual.equals(expected)) {
    throw new Error(
      `Static code anchor ${anchor.id} mismatch at ${toHex(anchor.va)}: expected ${formatBytes(expected)}, got ${formatBytes(actual)}`,
    );
  }
  return {
    id: anchor.id,
    va: toHex(anchor.va),
    rawOffset: toHex(rawOffset),
    byteLength: expected.length,
    bytes: formatBytes(expected),
    meaning: anchor.meaning,
    matched: true,
  };
}

function validateActiveEntry(entry, index) {
  if (!entry || typeof entry !== "object") {
    throw new TypeError(`activeEntries[${index}] must be an object`);
  }
  validateSigned16(entry.slotIndex, `activeEntries[${index}].slotIndex`);
  validateUnsigned16(
    entry.slotTableWord,
    `activeEntries[${index}].slotTableWord`,
  );
  validateSigned16(
    entry.recordPositiveWord,
    `activeEntries[${index}].recordPositiveWord`,
  );
  validateUnsigned32(entry.flags74, `activeEntries[${index}].flags74`);
  validateSigned8(
    entry.ownerSignedByte,
    `activeEntries[${index}].ownerSignedByte`,
  );
}

function validateLookupEntry(entry, index) {
  if (!entry || typeof entry !== "object") {
    throw new TypeError(`entries[${index}] must be an object`);
  }
  validateUnsigned32(entry.fullReference, `entries[${index}].fullReference`);
  validateUnsigned16(
    entry.slotTableWord,
    `entries[${index}].slotTableWord`,
  );
  validateSigned16(
    entry.recordPositiveWord,
    `entries[${index}].recordPositiveWord`,
  );
  validateByte(entry.recordClassByte, `entries[${index}].recordClassByte`);
}

function validateHeroInput(hero, label) {
  if (!hero || typeof hero !== "object") {
    throw new TypeError(`${label} must be an object`);
  }
  validateSigned16(hero.listCount, `${label}.listCount`);
  if (!Array.isArray(hero.entries)) {
    throw new TypeError(`${label}.entries must be an array`);
  }
  validateUnsigned32(hero.fallbackReference, `${label}.fallbackReference`);
  if (!hero.record || typeof hero.record !== "object") {
    throw new TypeError(`${label}.record must be an object`);
  }
}

function x86Abs32Bits(value) {
  const bits = value >>> 0;
  const signMask = signed32(bits) < 0 ? 0xffffffff : 0;
  return ((bits ^ signMask) - signMask) >>> 0;
}

function signed32(value) {
  return value >> 0;
}

function validateSigned8(value, label) {
  validateIntegerRange(value, -0x80, 0x7f, label);
}

function validateByte(value, label) {
  validateIntegerRange(value, 0, 0xff, label);
}

function validateSigned16(value, label) {
  validateIntegerRange(value, -0x8000, 0x7fff, label);
}

function validateUnsigned16(value, label) {
  validateIntegerRange(value, 0, 0xffff, label);
}

function validateUnsigned32(value, label) {
  validateIntegerRange(value, 0, 0xffffffff, label);
}

function validateIntegerRange(value, minimum, maximum, label) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(
      `${label} must be an integer in ${minimum}..${maximum}, got ${value}`,
    );
  }
}

function readAnalysisJson(path, label) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read ${label} analysis from ${path}: ${error.message}`, {
      cause: error,
    });
  }
  if (!parsed || typeof parsed.sourceSha256 !== "string") {
    throw new Error(`${path} is not a supported ${label} analysis document`);
  }
  return parsed;
}

function requireFunction(seeds, entry) {
  const report = seeds.functions?.find(
    (candidate) => candidate.entry === toHex(entry),
  );
  if (!report?.instructions || !report?.basicBlocks) {
    throw new Error(`Ghidra seeds omit function ${toHex(entry)}`);
  }
  return report;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertDeepEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function formatBytes(buffer) {
  return [...buffer].map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.stdout.write(
    `${JSON.stringify(extractK01MissionResultLifecycle(), null, 2)}\n`,
  );
}
