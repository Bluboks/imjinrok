#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertEqual,
  readJson,
  sha256,
  verifyEvidencePoint,
  verifySeededFunction,
} from "./static-evidence.mjs";
import {
  readPeImage,
  toHex,
} from "./pe-image.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_SEEDS_PATH = "analysis/generated/imjinrok2/seeds.json";
const DEFAULT_FUNCTIONS_PATH = "analysis/generated/imjinrok2/functions.json";
const DEFAULT_REFERENCES_PATH = "analysis/generated/imjinrok2/references.json";
const DEFAULT_FIXTURE_PATH =
  "analysis/fixtures/k01-source-handle-lifecycle-vectors.json";
const EXPECTED_EXECUTABLE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";

export const ENTITY_SLOT_COUNT = 1200;
export const ENTITY_FIRST_ALLOCATABLE_SLOT = 1;
export const ENTITY_LAST_ALLOCATABLE_SLOT = ENTITY_SLOT_COUNT - 1;

const FUNCTION_CONTRACTS = [
  [0x00460ba0, "0x00460ba0-0x00460e20", 17, 144, "47f5f8e1743260ffdbc0f378f46510ec4126c2accc74cc41e2464dd77a5f3b32"],
  [0x0048dbe0, "0x0048dbe0-0x0048dda9", 21, 147, "cae832cc2a5ec11a0edb02a33dac3ee255d9d392861e4408f2eea21f0ad16bd2"],
  [0x00488420, "0x00488420-0x004884b5", 11, 59, "766634f8416fab982a2ec68cac1fa15d689f1a6ba2b386d7165f25f853a4370b"],
  [0x00483a60, "0x00483a60-0x00483a9c", 7, 25, "dbc15708a3c22962006fa2210c4045c97eec80e00b26734d3fc152048746bc75"],
  [0x00483aa0, "0x00483aa0-0x00483c2e", 12, 95, "c797f8481671ac722264660d8803269764116daa084af99502a9173b07dbb6f5"],
  [0x00483c50, "0x00483c50-0x00483c9f", 1, 26, "e268694e2d2c2fc57c5b0e9a547004b77a6ccb1c700f9b30f5f3329d6e602ac9"],
  [0x00437650, "0x00437650-0x00438025", 39, 539, "16282bd634d28738d1f1e5eba179069f154537c1c86ce7fbcf57aa1f54bd5fd6"],
  [0x00441db0, "0x00441db0-0x00441dd8", 3, 12, "2210003ad3d1ea0dfb2e9e83e060b0566285a2f1eac5c0c92dd591e0c6ec4dc1"],
  [0x00441de0, "0x00441de0-0x00441e36", 8, 30, "a405fadefaeda07790e43c713602632aeccc1fc1c019bf4d639232f1773c29e6"],
  [0x00441e40, "0x00441e40-0x00441e7a", 5, 19, "a43ab36d3a8ffdbe265feaad703c178ba7f3ce4ed4445b891ffd92a2faf69df0"],
  [0x00441e80, "0x00441e80-0x00441ee4", 10, 36, "95d0fdedb49457844787cad59022d244d0ecd2fa4a975b95f46e610fc0a34596"],
  [0x004885e0, "0x004885e0-0x0048866f", 7, 53, "98d746bba7e96f274f287b029b29510970dacb43b722f1e854f343c257c48db8"],
  [0x00447360, "0x00447360-0x00447599", 35, 156, "a0f7e7b9b9a6cc54bcd994921b60e94bb2f34a2a85f581ec0371a777887e79fb"],
  [0x00410cc0, "0x00410cc0-0x0041115b", 70, 347, "7c4875efe8d52c663aa98607f0e53c2dee62d0784bcc9c679acb527a5be75405"],
  [0x004111b0, "0x004111b0-0x00411229", 1, 44, "67db4f7b6aa965dfe519332904b668e9b1a828493a6900800fd074dc25476990"],
  [0x00411160, "0x00411160-0x0041117f", 5, 10, "3810d824d5e70036ad906aa66cf40e6e0374426f3324c138d92b46ffe8104046"],
  [0x00411180, "0x00411180-0x0041118f", 1, 3, "40495c9aed7a1def1c6553ca14015390c73830727999227ce8f9e8dc0d887ca5"],
].map(([entry, bodyRange, blockCount, instructionCount, bodySha256]) => ({
  entry: toHex(entry),
  bodyRange,
  blockCount,
  instructionCount,
  bodySha256,
}));

const CALL_EDGES = [
  [0x0048dbe9, 0x0048dbe0, 0x00460ba0],
  [0x0048dcca, 0x0048dbe0, 0x00483c50],
  [0x00488440, 0x00488420, 0x00483a60],
  [0x00488494, 0x00488420, 0x00483c50],
  [0x00483c95, 0x00483c50, 0x00437650],
  [0x00447499, 0x00447360, 0x0043c9c0],
  [0x004474a6, 0x00447360, 0x00483aa0],
  [0x00410d31, 0x00410cc0, 0x00441e40],
  [0x00411218, 0x004111b0, 0x0040c6c0],
  [0x0041121f, 0x004111b0, 0x0040f0e0],
  [0x00488630, 0x004885e0, 0x00441db0],
];

const CODE_ANCHORS = [
  [0x00460d73, "b9 b0 04 00 00", "mission-entry zero-fill loop has 0x4b0 WORD pairs (active and reuse-age tables)"],
  [0x00460d78, "66 89 98 a0 f6 ff ff", "mission-entry zero-fill starts at active-table slot zero"],
  [0x0048dbe9, "e8 b2 2f fd ff", "K01 map loader calls the common entity-pool initializer before descriptors"],
  [0x00483a71, "66 83 b9 a0 f6 ff ff 00", "allocator skips nonzero active-table entries"],
  [0x00483a89, "46", "allocator increments every visited inactive reuse-age WORD with byte-size arithmetic"],
  [0x00483c58, "66 a1 98 5f 7c 00", "create wrapper reads the global generation WORD"],
  [0x00483c6d, "66 40", "create wrapper increments generation before initializer"],
  [0x00483c95, "e8 b6 39 fb ff", "create wrapper calls the 0x558-byte entity initializer"],
  [0x0043782e, "66 89 86 b6 01 00 00", "initializer writes slot WORD at entity +0x1b6"],
  [0x00437847, "66 89 8e b8 01 00 00", "initializer writes generation WORD at entity +0x1b8"],
  [0x00483b22, "66 8b 8e 12 54 63 00", "release reads the record active-list position before swap-last removal"],
  [0x00483c1b, "66 89 1c 7d d8 0e 7d 00", "release clears active-table WORD after list cleanup"],
  [0x00410d31, "e8 0a 11 03 00", "subtype-0c projectile update calls active target validation"],
  [0x00488440, "e8 1b b6 ff ff", "native descriptor helper allocates before coordinate bounds"],
  [0x00488494, "e8 b7 b7 ff ff", "native descriptor helper creates only after signed bounds pass"],
  [0x004884a6, "33 c0", "native descriptor allocation failure returns zero"],
  [0x004884ae, "b8 01 00 00 00", "native descriptor terminator returns one"],
  [0x00411160, "b8 01 00 00 00", "separate projectile pool allocator starts at slot one"],
  [0x0041117c, "66 33 c0", "projectile pool exhaustion returns zero"],
];

export function extractK01SourceHandleLifecycle({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  seedsPath = DEFAULT_SEEDS_PATH,
  functionsPath = DEFAULT_FUNCTIONS_PATH,
  referencesPath = DEFAULT_REFERENCES_PATH,
  fixturePath = DEFAULT_FIXTURE_PATH,
} = {}) {
  const absoluteExecutablePath = resolve(executablePath);
  const { buffer, image } = readPeImage(absoluteExecutablePath);
  const sourceSha256 = sha256(buffer);
  assertEqual(sourceSha256, EXPECTED_EXECUTABLE_SHA256, "original EXE SHA-256");
  const seeds = readArtifact(seedsPath, sourceSha256, "seed analysis");
  const functions = readArtifact(functionsPath, sourceSha256, "function analysis");
  const references = readArtifact(referencesPath, sourceSha256, "reference analysis");
  const fixture = readFixture(fixturePath, sourceSha256);

  const functionArtifacts = FUNCTION_CONTRACTS.map((contract) =>
    verifyFunctionArtifact(functions, contract),
  );
  const analyzedFunctions = FUNCTION_CONTRACTS.map((contract) =>
    verifySeededFunction(buffer, image, seeds, contract),
  );
  const callEdges = CALL_EDGES.map(([site, caller, callee]) =>
    verifyCallEdge(references, site, caller, callee),
  );
  const codeAnchors = CODE_ANCHORS.map(([va, bytes, meaning]) =>
    verifyEvidencePoint(buffer, image, { va, bytes, meaning }),
  );
  const testVectors = fixture.vectors.map((vector) => replayFixtureVector(vector));

  return {
    question:
      "한 K01 source slot이 free → allocated → active → dying/retained → released → same-slot new generation으로 이동하는 정확한 lifecycle과 slot/generation handle validity predicate는 무엇인가?",
    source: {
      path: DEFAULT_EXECUTABLE_PATH,
      sha256: sourceSha256,
      format: "PE32 x86",
    },
    evidenceStatus: "static-proven-scoped-source-handle-lifecycle",
    reproductionStatus: "reproduction-complete",
    implementationStatus: "analysis-only-no-production-change",
    scope: {
      pool: {
        base: "0x00635258",
        recordStride: "0x558",
        count: ENTITY_SLOT_COUNT,
        allocatableSlots: [ENTITY_FIRST_ALLOCATABLE_SLOT, ENTITY_LAST_ALLOCATABLE_SLOT],
        activeTable: "0x007d0ed8[slot] WORD",
        reuseAgeTable: "0x007d1838[slot] signed WORD",
        activeList: "0x00842dd8[] WORD with count 0x00843738",
      },
      handle: {
        slotField: "entity +0x1b6 WORD",
        generationField: "entity +0x1b8 WORD",
        generationGlobal: "0x007c5f98 WORD",
        minimumGenerationAwarePredicate:
          "slot in 1..1199 ∧ activeTable[slot] != 0 ∧ signed health(+0x3e) > 0 ∧ entity(+0x1b6,+0x1b8) == supplied(slot,generation)",
        activeConsumerPredicate:
          "the +0x1f0-gated consumers add BYTE +0x1f0 != 0 after active-table and positive-health checks",
        generationZero: "zero is not a sentinel: a matching wrapped generation is accepted",
      },
    },
    allocation: {
      scanOrder: "slot 1 through 1199 inclusive; slot 0 is the failure/reserved result",
      selection: "inactive active-table entries whose signed reuse-age is >= best age; later ties win",
      ageSideEffect: "every visited inactive age increments with signed WORD wrap, including non-selected candidates",
      failure: "all active entries, or all inactive ages negative, leave selected slot 0 and native descriptor creation returns 0",
      generationOrder: "generation WORD increments before record initializer; initializer zeroes 0x558 bytes then writes slot and generation fields",
    },
    lifecycle: {
      transitions:
        "free(active=0) → allocated(slot selected, generation incremented) → active(active-table nonzero) → dying/retained (health <= 0 can fail validity while record remains on active list) → released(active-list removal then active/reuse-age clear) → same-slot reuse(new generation)",
      deathRetention: "state-7 dispatcher return 1 retains active slot when +0x74 bit 0x80 is set; return 0 reaches release in the same outer pass",
      release: {
        successOrder: "record cleanup → active-list swap-last/count decrement/position rewrite → category cleanup → active-table=0 → reuse-age=0",
        earlyReturn: "active-table WORD already zero returns without list or record mutation",
        repeat: "second release of the same slot takes the same inactive early return",
        recordRetention: "release does not write entity health, +0x1f0, or +0x1b6/+0x1b8",
      },
    },
    consumers: {
      basePositiveHealth: "0x00441db0: active-table nonzero then signed health > 0; no generation comparison",
      fullReference: "0x00441de0: active-table → signed health > 0 → low/high WORD full-reference equality",
      activeGate: "0x00441e40: active-table → signed health > 0 → +0x1f0 nonzero; no generation comparison",
      fullReferenceActive: "0x00441e80: active-table → signed health > 0 → +0x1f0 nonzero → full-reference equality",
      k01ProtectedHeroes: "0x004885e0 selects positive records by owner/class and K01 passes the result to 0x00441de0",
      ryuProjectile: "0x00410cc0 calls 0x00441e40 before subtype-0c target retracking; projectile pool itself is a separate 100-slot table 0x00842500",
      nativeCreate: "0x00488420 calls allocator before bounds, aborts the descriptor batch on slot 0, skips only OOB coordinates, and preserves prior creates",
    },
    analyzedFunctions,
    functionArtifacts,
    callEdges,
    codeAnchors,
    testVectors,
    fixture: {
      path: fixturePath,
      sha256: sha256(Buffer.from(JSON.stringify(fixture))),
      vectorCount: fixture.vectors.length,
    },
    unresolved: [
      "The complete producer set for runtime +0x74/+0x1f0 writers in every mission instance is not closed here.",
      "The source update-unit to project 24 Hz/FPS mapping and a project identity policy are not proven.",
      "Alias/computed writes outside the confirmed entity record layout are not promoted to exact-static handle writers.",
      "The 16-bit generation wrap duration and any long-run policy after reuse are not known.",
    ],
  };
}

export function selectSourceEntitySlot({ active, reuseAges }) {
  validatePoolArrays(active, reuseAges);
  const nextReuseAges = reuseAges.map((age) => signedWord(age));
  let selectedSlot = 0;
  let bestAge = 0;
  for (let slot = ENTITY_FIRST_ALLOCATABLE_SLOT; slot <= ENTITY_LAST_ALLOCATABLE_SLOT; slot += 1) {
    if (active[slot] !== 0) continue;
    const age = nextReuseAges[slot];
    if (age >= bestAge) {
      bestAge = age;
      selectedSlot = slot;
    }
    nextReuseAges[slot] = signedWord(age + 1);
  }
  return { selectedSlot, reuseAges: nextReuseAges };
}

export function incrementSourceGeneration(generationWord) {
  validateUnsignedWord(generationWord, "generationWord");
  return unsignedWord(generationWord + 1);
}

export function evaluateSourceHandleValidity({
  slot,
  generation,
  activeTableWord,
  healthWord,
  recordSlot,
  recordGeneration,
  activeGateByte = 1,
  requireGeneration = true,
  requireActiveGate = false,
}) {
  validateSlot(slot, "slot");
  validateUnsignedWord(generation, "generation");
  validateUnsignedWord(activeTableWord, "activeTableWord");
  validateSignedWord(healthWord, "healthWord");
  validateSlot(recordSlot, "recordSlot");
  validateUnsignedWord(recordGeneration, "recordGeneration");
  validateByte(activeGateByte, "activeGateByte");
  if (activeTableWord === 0) return { valid: false, reason: "inactive-slot" };
  if (healthWord <= 0) return { valid: false, reason: "non-positive-health" };
  if (requireActiveGate && activeGateByte === 0) {
    return { valid: false, reason: "inactive-record-gate" };
  }
  if (requireGeneration && (recordSlot !== slot || recordGeneration !== generation)) {
    return { valid: false, reason: "generation-mismatch" };
  }
  return { valid: true, reason: "valid" };
}

export function releaseSourceEntitySlot({
  slot,
  activeTable,
  reuseAges,
  activeList,
  recordPosition,
}) {
  validateSlotArrays(activeTable, reuseAges);
  validateSlot(slot, "slot");
  if (!Array.isArray(activeList) || activeList.some((value) => !Number.isInteger(value))) {
    throw new TypeError("activeList must be an integer slot array");
  }
  if (!Number.isInteger(recordPosition) || recordPosition < 0 || recordPosition >= activeList.length) {
    throw new RangeError("recordPosition must point into the active list");
  }
  const nextActive = [...activeTable];
  const nextAges = reuseAges.map((age) => signedWord(age));
  const nextList = [...activeList];
  if (nextActive[slot] === 0) {
    return {
      released: false,
      reason: "inactive-slot",
      activeTable: nextActive,
      reuseAges: nextAges,
      activeList: nextList,
      events: ["early-return-before-list-or-record-mutation"],
    };
  }
  const lastPosition = nextList.length - 1;
  const movedSlot = nextList[lastPosition];
  const events = [
    "record-cleanup-before-list-swap",
    "active-list-swap-last",
    "active-list-last-entry-zero",
    "active-count-decrement",
  ];
  nextList[recordPosition] = movedSlot;
  nextList[lastPosition] = 0;
  if (recordPosition !== lastPosition) events.push("moved-record-position-rewrite");
  events.push("category-cleanup");
  nextActive[slot] = 0;
  nextAges[slot] = 0;
  events.push("active-table-clear", "reuse-age-clear");
  return {
    released: true,
    reason: "released",
    activeTable: nextActive,
    reuseAges: nextAges,
    activeList: nextList,
    movedSlot,
    events,
  };
}

function replayFixtureVector(vector) {
  const result = (() => {
    switch (vector.operation) {
      case "allocate": {
        const pool = makePool(vector.input);
        const allocation = selectSourceEntitySlot(pool);
        return {
          selectedSlot: allocation.selectedSlot,
          ageAtFirst: allocation.reuseAges[1],
          ageAtLast: allocation.reuseAges[ENTITY_LAST_ALLOCATABLE_SLOT],
          ageAtSlot: allocation.reuseAges[vector.input.inspectSlot ?? 1],
        };
      }
      case "generation":
        return { nextGeneration: incrementSourceGeneration(vector.input.generation) };
      case "validity":
        return evaluateSourceHandleValidity(vector.input);
      case "release": {
        const pool = makePool(vector.input);
        const released = releaseSourceEntitySlot({
          slot: vector.input.slot,
          activeTable: pool.active,
          reuseAges: pool.reuseAges,
          activeList: vector.input.activeList,
          recordPosition: vector.input.recordPosition,
        });
        return {
          released: released.released,
          reason: released.reason,
          events: released.events,
          activeTableWordAfter: released.activeTable[vector.input.slot],
          reuseAgeAfter: released.reuseAges[vector.input.slot],
          activeListAfter: released.activeList,
        };
      }
      case "same-slot-reuse":
        return replaySameSlotReuse(vector.input);
      case "placement":
        return replayPlacementFailure(vector.input);
      case "death-release":
        return {
          dispatcherReturn: vector.input.retain ? 1 : 0,
          releaseCalled: !vector.input.retain,
          activeAfter: vector.input.retain,
          slotTableWordAfter: vector.input.retain ? 1 : 0,
        };
      default:
        throw new Error(`unknown source-handle fixture operation: ${vector.operation}`);
    }
  })();
  assertEqual(JSON.stringify(result), JSON.stringify(vector.expected), `${vector.id} expected result`);
  const outputSha256 = sha256(Buffer.from(JSON.stringify(result)));
  assertEqual(outputSha256, vector.expectedSha256, `${vector.id} output SHA-256`);
  return { id: vector.id, result, expected: vector.expected };
}

function replaySameSlotReuse(input) {
  const pool = makePool({ mode: "all-active-except", inactiveSlots: [input.slot], ageOverrides: {} });
  const first = selectSourceEntitySlot(pool);
  const firstGeneration = incrementSourceGeneration(input.generationBeforeFirstCreate);
  pool.active[first.selectedSlot] = 1;
  const released = releaseSourceEntitySlot({
    slot: first.selectedSlot,
    activeTable: pool.active,
    reuseAges: first.reuseAges,
    activeList: [first.selectedSlot],
    recordPosition: 0,
  });
  const second = selectSourceEntitySlot({ active: released.activeTable, reuseAges: released.reuseAges });
  const secondGeneration = incrementSourceGeneration(firstGeneration);
  return {
    firstHandle: { slot: first.selectedSlot, generation: firstGeneration },
    release: { released: released.released, activeAfter: released.activeTable[first.selectedSlot] },
    secondHandle: { slot: second.selectedSlot, generation: secondGeneration },
    staleReference: evaluateSourceHandleValidity({
      slot: first.selectedSlot,
      generation: firstGeneration,
      activeTableWord: 1,
      healthWord: 100,
      recordSlot: second.selectedSlot,
      recordGeneration: secondGeneration,
    }),
    newReference: evaluateSourceHandleValidity({
      slot: second.selectedSlot,
      generation: secondGeneration,
      activeTableWord: 1,
      healthWord: 100,
      recordSlot: second.selectedSlot,
      recordGeneration: secondGeneration,
    }),
  };
}

function replayPlacementFailure(input) {
  const pool = makePool(input.pool);
  const active = pool.active;
  const reuseAges = pool.reuseAges;
  let generation = input.generation;
  const records = [];
  const allocations = [];
  let returnValue = 1;
  for (let index = 0; index < input.descriptors.length; index += 1) {
    const descriptor = input.descriptors[index];
    if (descriptor.internalClass === 0) break;
    const allocation = selectSourceEntitySlot({ active, reuseAges });
    allocations.push({ index, slot: allocation.selectedSlot });
    for (let slot = 0; slot < ENTITY_SLOT_COUNT; slot += 1) reuseAges[slot] = allocation.reuseAges[slot];
    if (allocation.selectedSlot === 0) {
      returnValue = 0;
      break;
    }
    const x = signedWord(input.origin.x + descriptor.dx);
    const y = signedWord(input.origin.y + descriptor.dy);
    if (x < 0 || x >= input.mapWidth || y < 0 || y >= input.mapHeight) continue;
    generation = incrementSourceGeneration(generation);
    active[allocation.selectedSlot] = 1;
    records.push({ index, slot: allocation.selectedSlot, generation, x, y });
  }
  return { returnValue, allocations, records, generation };
}

function readArtifact(path, sourceSha256, label) {
  const artifact = readJson(path);
  assertEqual(artifact.sourceSha256, sourceSha256, `${label} sourceSha256`);
  return artifact;
}

function readFixture(path, sourceSha256) {
  const fixture = readJson(path);
  assertEqual(fixture.sourceSha256, sourceSha256, "source-handle fixture sourceSha256");
  if (!Array.isArray(fixture.vectors) || fixture.vectors.length < 10) {
    throw new Error("source-handle fixture must contain at least ten vectors");
  }
  fixture.vectors.forEach((vector) => {
    if (typeof vector.expectedSha256 !== "string" || !/^[0-9a-f]{64}$/u.test(vector.expectedSha256)) {
      throw new Error(`source-handle fixture vector ${vector.id} must contain a 64-character expectedSha256`);
    }
  });
  return fixture;
}

function verifyCallEdge(references, site, caller, callee) {
  const expected = { from: toHex(site), fromFunctionEntry: toHex(caller), to: toHex(callee) };
  const found = references.references?.find(
    (reference) => reference.from === expected.from && reference.fromFunctionEntry === expected.fromFunctionEntry && reference.to === expected.to && reference.type.endsWith("CALL"),
  );
  if (!found) throw new Error(`source-handle call edge missing: ${expected.from}`);
  return { callsite: expected.from, caller: expected.fromFunctionEntry, callee: expected.to, type: found.type };
}

function verifyFunctionArtifact(functions, contract) {
  const found = functions.functions?.find(({ entry }) => entry === contract.entry);
  if (!found) throw new Error(`function analysis missing ${contract.entry}`);
  assertEqual(found.bodyRanges?.length, 1, `${contract.entry} function body range count`);
  assertEqual(found.bodyRanges[0], contract.bodyRange, `${contract.entry} function body range`);
  assertEqual(found.instructionCount, contract.instructionCount, `${contract.entry} function instruction count`);
  return {
    entry: contract.entry,
    bodyRange: found.bodyRanges[0],
    instructionCount: found.instructionCount,
    instructionSha256: found.instructionSha256,
  };
}

function makePool(input) {
  const active = new Array(ENTITY_SLOT_COUNT).fill(0);
  const reuseAges = new Array(ENTITY_SLOT_COUNT).fill(0);
  if (input.mode === "all-active") {
    for (let slot = ENTITY_FIRST_ALLOCATABLE_SLOT; slot <= ENTITY_LAST_ALLOCATABLE_SLOT; slot += 1) active[slot] = 1;
  } else if (input.mode === "all-active-except") {
    for (let slot = ENTITY_FIRST_ALLOCATABLE_SLOT; slot <= ENTITY_LAST_ALLOCATABLE_SLOT; slot += 1) active[slot] = 1;
    for (const slot of input.inactiveSlots ?? []) active[slot] = 0;
  } else if (input.mode === "custom") {
    for (const slot of input.activeSlots ?? []) active[slot] = 1;
  } else if (input.mode !== "all-inactive") {
    throw new Error(`unknown pool mode: ${input.mode}`);
  }
  for (const [slotText, age] of Object.entries(input.ageOverrides ?? {})) {
    reuseAges[Number(slotText)] = signedWord(age);
  }
  return { active, reuseAges };
}

function validatePoolArrays(active, reuseAges) {
  if (!Array.isArray(active) || active.length !== ENTITY_SLOT_COUNT) throw new RangeError(`active must contain exactly ${ENTITY_SLOT_COUNT} slots`);
  if (!Array.isArray(reuseAges) || reuseAges.length !== ENTITY_SLOT_COUNT) throw new RangeError(`reuseAges must contain exactly ${ENTITY_SLOT_COUNT} slots`);
  active.forEach((value, slot) => validateUnsignedWord(value, `active[${slot}]`));
  reuseAges.forEach((value, slot) => validateSignedWord(value, `reuseAges[${slot}]`));
}

function validateSlotArrays(active, reuseAges) {
  validatePoolArrays(active, reuseAges);
}

function validateSlot(slot, label) {
  if (!Number.isInteger(slot) || slot < ENTITY_FIRST_ALLOCATABLE_SLOT || slot > ENTITY_LAST_ALLOCATABLE_SLOT) {
    throw new RangeError(`${label} must be an allocatable entity slot 1..1199`);
  }
}

function validateUnsignedWord(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new RangeError(`${label} must be an unsigned WORD`);
}

function validateSignedWord(value, label) {
  if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) throw new RangeError(`${label} must be a signed WORD`);
}

function validateByte(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) throw new RangeError(`${label} must be a byte`);
}

function signedWord(value) {
  const wrapped = value & 0xffff;
  return wrapped >= 0x8000 ? wrapped - 0x10000 : wrapped;
}

function unsignedWord(value) {
  return value & 0xffff;
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--input") options.executablePath = args[++index];
    else if (arg === "--seeds") options.seedsPath = args[++index];
    else if (arg === "--functions") options.functionsPath = args[++index];
    else if (arg === "--references") options.referencesPath = args[++index];
    else if (arg === "--fixture") options.fixturePath = args[++index];
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = extractK01SourceHandleLifecycle(parseArgs(process.argv.slice(2)));
  if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else console.log(`${report.evidenceStatus}: ${report.testVectors.length} vectors; ${report.analyzedFunctions.length} functions; ${report.codeAnchors.length} anchors`);
}
