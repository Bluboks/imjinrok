#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readPeImage } from "./pe-image.mjs";
import { assertEqual, sha256, verifyRawCodeRange } from "./static-evidence.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_FUNCTIONS_PATH = "analysis/generated/imjinrok2/functions.json";
const DEFAULT_REFERENCES_PATH = "analysis/generated/imjinrok2/references.json";
const DEFAULT_JUMP_TABLES_PATH = "analysis/generated/imjinrok2/jump-tables.json";

export const EXPECTED_EXECUTABLE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_FUNCTIONS_SHA256 =
  "c10ea2de1f4998411d52443419c9a7f52ff7f9c18e79bd4115ba197d2f5bebc3";
export const EXPECTED_REFERENCES_SHA256 =
  "df11ff3713988ef22b3390b5b0ae7b4a87464b5de547a4866e1c8ec8a0bcaf4c";
export const EXPECTED_JUMP_TABLES_SHA256 =
  "0ae517eb172f61b974ca7a4411e64c1cc42065c462ed53b3065ab2da633dfe2f";

const RAW_CODE_RANGES = [
  ["action-59-complete-body", 0x00416600, 0x00416861, "2b48386b4eebcc36b86ad2acd8db86640449948c95c947fc0fad8f7625843efc"],
  ["action-59-full-payload", 0x00416756, 0x00416803, "4d127acc585961ec3e2dcc5069e0eafb7bd51876f327090be56ec6d24cb3c256"],
  ["fixed-slot-admission", 0x00411160, 0x00411180, "3810d824d5e70036ad906aa66cf40e6e0374426f3324c138d92b46ffe8104046"],
  ["fixed-registry-reset", 0x00411190, 0x004111a5, "2721ed8c766562fcc441e4a0a991aeb753534077a7935a118214c5ece898d695"],
  ["record-creation-wrapper", 0x004111b0, 0x0041122a, "67db4f7b6aa965dfe519332904b668e9b1a828493a6900800fd074dc25476990"],
  ["record-initialization", 0x0040c6c0, 0x0040c96f, "06d2772801777b5cd8c32f61863a00fd6d7d23cab08fb5b912bf377be07d5a3a"],
  ["fixed-slot-update-cleanup", 0x004474bd, 0x004474f2, "2da6c3639d929d9ca7277855924df438a07b87c2f8801bb7d2e0e9e4359b771e"],
  ["shared-record-update", 0x00410cc0, 0x0041115c, "7c4875efe8d52c663aa98607f0e53c2dee62d0784bcc9c679acb527a5be75405"],
  ["path-initializer", 0x0040f9b0, 0x0040fc90, "fc7f6bdfa93fa5445aca0642c35462ef31ef6632522d2870108981bfc4f3a490"],
  ["subtype-0x0c-final-dispatch", 0x0040e270, 0x0040e2b6, "5aa4b4b781fbd145c478e3ec036907d9e671c96e47fb1715abb394ed3fde9ac0"],
  ["subtype-0x10-fallback-final-dispatch", 0x0040ee40, 0x0040ef42, "f36a5b1ed7b624082de61e19c04503760861e4b435d2937cfe3b5a4cc79dd4ba"],
  ["subtype-0x01-final-dispatch", 0x0040eab0, 0x0040ebc6, "fcc00f75ca0432a6de8b0b7b6657405d3e5dfbeca795195172f7b22af5a9ab95"],
  ["effect-kind-dispatch", 0x00413700, 0x00413b03, "9db8d0e66c796932913a99a0b602c50124b02b0a66923082a64afa6251bcdd4f"],
  ["effect-final-consumer", 0x00413b30, 0x00413dde, "2f22005b02a6f1d8f429b516f5c2b5bf68fb3ff46a4b861353ae9cdbb1e2aee1"],
  ["effect-damage-calculation", 0x00413070, 0x0041362e, "bf5305a61f1d72e59de4fae03dd34e36694e4a74503ec8839c1b6b8abf032a52"],
  ["effect-buffer-health-writer", 0x00438130, 0x0043819e, "9c65927e6cb70b97174d8132f7ea2c8374118e64b3e46fbebce6e1b3de6a8cc8"],
  ["candidate-map-admission", 0x00464cc0, 0x00464dde, "40b41b7ce95c3e7516c0bf2f6d01f1e86bf2848ed0ec5256f63d7858f55a1d10"],
].map(([id, start, endExclusive, digest]) => ({ id, start, endExclusive, sha256: digest }));

const FUNCTION_CATALOG = [
  ["0x00416600", 609, 174, "0a4ed025e0e6bdc4cfc62392ce53e0d11a783ee6b48266a462216b01c9f02c5d"],
  ["0x00411160", 32, 10, "b169d256320ae3adb546ab4082fcb2b2ab4c2b76f9a52a8fd2ef613da34347ba"],
  ["0x00411180", 16, 3, "e2511fe7c504ad180e2983d7aaa6663e593665c0404db3c0002edf52f6a9b773"],
  ["0x00411190", 21, 10, "0104e986625967fb422c890e9889abe878592ea8bc8b5e08403a9bfa8a1f2c48"],
  ["0x004111b0", 122, 44, "458657190d0d297c04a1d101ffd596043fba27ea20802e6c97f6d4b59cba3da3"],
  ["0x0040c6c0", 687, 165, "8fd5c3a7121986802e8317ef0b23c9342c2b0ba06cd945675b65607ba0fe9f76"],
  ["0x0040f0e0", 17, 4, "c851bd493ef9e4fd7bd14a3a75d16abe3b35190ad30f39b2ecbf1784ab56b90c"],
  ["0x00410cc0", 1180, 347, "b08dd839526f08a64011c07152f3f8b3373a1d48c4518bfa30c0905e8d80ac7a"],
  ["0x0040f9b0", 736, 242, "8400de915951c770d1e13db9614f8e4b47a3b88580271cdbfddbc410a327523e"],
  ["0x0040df10", 352, 150, "79914c88ed8049c0335f014afc75896b3e6a2ebd50e34ddd56df161f47e356d8"],
  ["0x0040e270", 70, 20, "cf2b48fb3f089711ee39ee77daea0d1f7bf0831a7cc9b83ab104e5f49b99f32d"],
  ["0x0040ee40", 258, 83, "b36394f5656d7a6ff05b8c9d26a85d91b4c49d69943218919e2b5d9970dfea8b"],
  ["0x0040eab0", 278, 90, "05fb97508df58af5ba747265afbfd0c4f31c46156a5c4ea827c93b9114adf92b"],
  ["0x00413700", 1027, 329, "8335ae650540b709ca72fd81b15f3270b41571f5bf26b960710f855c4e60d1eb"],
  ["0x00413b30", 686, 208, "5d58cb6970dae59ccb9ec512657baa1602977ee153db639453223baef2881e67"],
  ["0x00413070", 1470, 442, "72fa7cc42a95b6f8cdffa4d516ee9a0f3465e41789f47781a069f5c2161587c7"],
  ["0x00438130", 110, 29, "530ca10e347e7cf6810d9a71378af232e4fa1f63ad3bf28c9aea37d2594e4c9d"],
  ["0x00442b10", 114, 28, "ab8c9e2ced8e0bfeb650ca1670f17ed59520591c7879d74f7c3bd0bc1385c5c5"],
  ["0x00439400", 102, 28, "70d174baf8b04eed0c4ea6e5849b50771cabe24e6f2a7e5ec4b10d573b1e9b34"],
  ["0x004426f0", 91, 35, "9d038b924212f803d928b8aca3d0ca230bfe12e76031454629cef658afd1e52b"],
  ["0x00441db0", 41, 12, "12984df20c7bb82eb364b29180f75185fe17ac268bffb3d3c782a7fa6c5adf8e"],
  ["0x004426a0", 66, 23, "992c88ef4558ec0ce71340db71f7aa5dea19be134eeae9d64c62cd40e16e1ac1"],
  ["0x00441e40", 59, 19, "01b3c1652d8edf30a6c0dc948215f734475111fc734338603d847545c43e7cda"],
  ["0x00438e30", 25, 7, "7388a6a7bbba4fe247c5868e9a4a2c35dd61850e88314349a8de9b1268794862"],
  ["0x00464cc0", 286, 103, "0df728460a1833f756c0164f3968eda5de7312a64e87c52edc98aa5a33566781"],
  ["0x00447360", 570, 156, "8700298d4e2900a0f2833b1f9e1143c47d324478ef5fa419170e7945de7dd772"],
].map(([entry, bodySize, instructionCount, instructionSha256]) => ({
  entry, bodySize, instructionCount, instructionSha256,
}));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(extractK01Subtype16Path(), null, 2));
}

export function extractK01Subtype16Path({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  functionsPath = DEFAULT_FUNCTIONS_PATH,
  referencesPath = DEFAULT_REFERENCES_PATH,
  jumpTablesPath = DEFAULT_JUMP_TABLES_PATH,
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  const sources = {
    executable: buffer,
    functions: readFileSync(functionsPath),
    references: readFileSync(referencesPath),
    jumpTables: readFileSync(jumpTablesPath),
  };
  for (const [name, expected] of Object.entries({
    executable: EXPECTED_EXECUTABLE_SHA256,
    functions: EXPECTED_FUNCTIONS_SHA256,
    references: EXPECTED_REFERENCES_SHA256,
    jumpTables: EXPECTED_JUMP_TABLES_SHA256,
  })) assertEqual(sha256(sources[name]), expected, `${name} SHA-256`);

  const functions = parseJson(sources.functions, functionsPath);
  const references = parseJson(sources.references, referencesPath);
  const jumpTables = parseJson(sources.jumpTables, jumpTablesPath);
  for (const [name, document] of Object.entries({ functions, references, jumpTables }))
    assertEqual(document.sourceSha256, EXPECTED_EXECUTABLE_SHA256, `${name} source SHA-256`);

  const functionCatalog = FUNCTION_CATALOG.map((expected) => {
    const actual = functions.functions.find(({ entry }) => entry === expected.entry);
    if (!actual) throw new Error(`functions.json missing ${expected.entry}`);
    for (const key of ["bodySize", "instructionCount", "instructionSha256"])
      assertEqual(actual[key], expected[key], `${expected.entry} ${key}`);
    return { ...expected, bodyRanges: actual.bodyRanges, callers: actual.callers, callees: actual.callees };
  });
  const recordReferences = references.references
    .filter(({ to }) => to === "0x00aa85e8" || to === "0x00842500");
  assertEqual(recordReferences.length, 12, "record base/registry complete direct-reference count");

  return {
    analysisStatus: "static-confirmed-k01-subtype-16-bounded-chain",
    reproductionStatus: "partial-reproduction-bounded-projections",
    implementationStatus: "analysis-only-no-product-change",
    sourceHashes: Object.fromEntries(Object.entries(sources).map(([name, bytes]) => [name, sha256(bytes)])),
    rawCodeRanges: RAW_CODE_RANGES.map((range) => verifyRawCodeRange(buffer, image, range)),
    functionCatalog,
    recordReferences,
    jumpTables: {
      finalBySubtype: requireJumpTable(jumpTables, "0x0040df10", "0x0040df92"),
      finalEffectKind: requireJumpTable(jumpTables, "0x00413700", "0x00413722"),
    },
    record: {
      base: "0x00aa85e8",
      stride: "0x3a0",
      slotCount: 100,
      allocatableSlots: [1, 99],
      registryBase: "0x00842500",
      initializedBytes: "0x3a0",
      fields: {
        phase: ["WORD", "0x16"],
        activeState: ["WORD", "0x22", 1],
        slot: ["WORD", "0x24"],
        subtype: ["WORD", "0x26"],
        selectionModeByte: ["BYTE", "0x2e"],
        phaseDivisor: ["signed BYTE", "0x3c"],
        targetOrContextReference: ["DWORD low index/high generation", "0x9a"],
        payload: ["WORD from call DWORD arg13", "0x9e"],
        sourceReference: ["DWORD", "0xa0"],
        sourceOwner: ["signed WORD copied from live source BYTE +0x38, or -1", "0xa4"],
        pathIndex: ["WORD", "0xa6"],
        pathEnd: ["WORD", "0xa8"],
        pathX: ["WORD[160], promoted read index 0..159", "0x11c"],
        pathY: ["WORD[160], promoted read index 0..159", "0x25c"],
        trackingEnabled: ["WORD exact 1", "0x114"],
        trackingCount: ["WORD promoted domain 0..15", "0x116"],
      },
    },
    conclusion: {
      action59Payload:
        "xor edi,edi occurs once before the candidate loop. After bounds, fixed-slot admission, and FUN_00464cc0 map/geometry admission, each payload-construction-reached attempt computes EDI=(previous EDI high WORD)|u16(class-table WORD*25), EDX=(u32(705*i8(owner BYTE)) high WORD)|u16(entity payload WORD*3), then full-adds them; failure at either fixed-slot or map/geometry pre-payload gate preserves all of EDI",
      creation:
        "FUN_00411160 admits the first zero registry WORD in slots 1..99; zero means no call. FUN_004111b0 clears and initializes exactly one 0x3a0-byte fixed record and registers its slot without a failure branch",
      update:
        "FUN_00447360 calls FUN_00410cc0 for each registered slot and clears that registry WORD only when the updater returns zero. FUN_00411190 separately clears registry slots 0..99 without clearing fixed-record bytes",
      flight:
        "FUN_00410cc0 advances phase WORD +0x16 modulo signed BYTE +0x3c when global tick 0x007c5f80 is divisible by 3; every non-end update increments path index WORD +0xa6. Its bounded tracking branch requires +0x114==1, +0xa6>2, +0x116<15, a live low-WORD target index, and matching high-WORD generation from the full DWORD +0x9a before FUN_00438e30 reads target coordinates and requests a new path",
      subtype16:
        "at path end, scan the active entity list in registry-active, distance-below-5, FUN_004426f0-return-zero, strict-nearest order. FUN_004426f0 returns one only when both references are live/health-positive and same-team; zero also includes either invalid reference as well as different-team, and the caller accepts zero. A nonzero selected reference with accepted geometry reinitializes the current slot as subtype 1 and rewrites its registry value to 1; full DWORD zero is the no-candidate sentinel",
      subtype12:
        "shares creation, record, path update, final dispatcher, effect dispatcher, and cleanup; at path end it directly emits effect kind 9 and cleans up instead of the subtype-16 nearest-candidate/same-slot subtype-1 transition",
      finalEffect:
        "subtype 16 reaches selection mode 2/effect kind 2 either after its same-slot subtype-1 transition or through its fallback, forcing each reached loop iteration to the supplied target low index. The low-WORD primary comparison selects the full payload before optional same-owner halving, then the generic branch reloads and passes the target's current full active reference; subtype 12 reaches direct kind 9. Inactive low-index targets stop before FUN_00413b30, target class BYTE +0x37 equal to 95 takes its special callback path, and FUN_00413070 separately rechecks the passed full reference generation before defense/mode reads",
      damage:
        "reached action-59 generic kind 2 requires selection mode BYTE 2 and uses the full supplied payload, replacing it with its signed-WORD half only for same-owner. Because that branch passes the current full active reference it just reloaded, a downstream generation mismatch is structurally unreachable absent concurrent mutation. Direct dispatcher branches such as kind 9 can pass a raw supplied full reference; their mismatch skips defense/kind-9 mode reads but still calls FUN_00438130 with damage 0 and traverses its global/owner gate and buffer/health logic. On a match, kind 9 applies target mode 4/5 as 30/50 percent before signed-WORD truncation, and FUN_00413070 uses the wrapped WORD +0x50/+0x44 defense sum, optional BYTE +0xba exact-one half adjustment, and signed cap 90. FUN_00438130 global WORD 0x007c6282 equal to 1 plus its owner-derived gate byte zero returns 1 without buffer/health writes; otherwise zero buffer goes directly to health subtraction, nonzero buffer with signed WORD >= signed damage is reduced and returns 1, and every other nonzero buffer (including a signed-negative raw WORD) is cleared before the full original damage is subtracted from health",
    },
    unresolvedBoundary:
      "the complete semantic meaning of FUN_00464cc0 map fields, renderer-only fields, global-tick time unit, generic selection-mode-1 kind-2 downstream callback whole results, target-class-95 special callbacks, FUN_00438e30/path-initializer coordinate results, and entity death/reference invalidation after FUN_00442b10 or FUN_00439400 remain outside the promoted bounded projection; effect-registry cleanup does not clear stale fixed-record bytes or references",
  };
}

export function constructAction59Payload(input) {
  record(input, "input");
  const previousEdiDword = u32(input.previousEdiDword, "previousEdiDword");
  const ownerSigned = i8(u8(input.ownerByte, "ownerByte"));
  const ownerProduct = (ownerSigned * 705) >>> 0;
  const attackTimes3 = (u16(input.entityPayloadWord, "entityPayloadWord") * 3) & 0xffff;
  const classTimes25 = (u16(input.classModifierWord, "classModifierWord") * 25) & 0xffff;
  const ediBeforeAdd = ((previousEdiDword & 0xffff0000) | classTimes25) >>> 0;
  const edxDword = ((ownerProduct & 0xffff0000) | attackTimes3) >>> 0;
  const payloadDword = (ediBeforeAdd + edxDword) >>> 0;
  return {
    previousEdiDword,
    ediUpperWordBeforeAttempt: previousEdiDword >>> 16,
    ownerSigned,
    ownerProduct,
    attackTimes3,
    classTimes25,
    ediBeforeAdd,
    edxDword,
    payloadDword,
    nextEdiDword: payloadDword,
    payloadStoredSignedWord: i16(payloadDword & 0xffff, "payload low WORD"),
  };
}

export function reproduceAction59PayloadAttempts(input) {
  record(input, "input");
  if (!Array.isArray(input.attempts)) throw new TypeError("attempts must be an array");
  const initialEdiDword = 0;
  let ediDword = initialEdiDword;
  const attempts = input.attempts.map((attempt, index) => {
    record(attempt, `attempts[${index}]`);
    if (!bool(
      attempt.payloadConstructionReached,
      `attempts[${index}].payloadConstructionReached`,
    )) {
      return {
        payloadConstructionReached: false,
        ediUpperWordBeforeAttempt: ediDword >>> 16,
        payloadDword: null,
        nextEdiDword: ediDword,
      };
    }
    const transition = constructAction59Payload({ ...attempt, previousEdiDword: ediDword });
    ediDword = transition.nextEdiDword;
    return { payloadConstructionReached: true, ...transition };
  });
  return { initialEdiDword, attempts, finalEdiDword: ediDword };
}

export function admitFixedSlot(registry) {
  if (!Array.isArray(registry) || registry.length !== 100)
    throw new RangeError("registry must contain exactly 100 WORD values");
  for (let slot = 1; slot < 100; slot += 1)
    if (u16(registry[slot], `registry[${slot}]`) === 0) return slot;
  return 0;
}

export function resetFixedRegistry(registry) {
  normalizeRegistry(registry);
  return {
    clearedSlotCount: 100,
    firstClearedSlot: 0,
    lastClearedSlot: 99,
    registryAfter: { wordCount: 100, uniqueWords: [0] },
    fixedRecordBytesCleared: false,
    staleReferenceOffsets: ["0x9a", "0xa0"],
  };
}

export function reproduceCreation(input) {
  record(input, "input");
  const registry = normalizeRegistry(input.registry);
  const slot = admitFixedSlot(registry);
  if (slot === 0) return { created: false, slot: 0, registryWrite: null, record: null };
  const subtype = i16(input.subtype, "subtype");
  if (subtype < 0) throw new RangeError("subtype must be nonnegative in this projection");
  const recordProjection = {
    baseAddress: hex(0x00aa85e8 + slot * 0x3a0),
    clearedBytes: 0x3a0,
    activeState: 1,
    slot,
    subtype,
    selectionModeByte: u8(input.selectionModeByte, "selectionModeByte"),
    targetOrContextReferenceDword: u32(
      input.targetOrContextReferenceDword,
      "targetOrContextReferenceDword",
    ),
    payloadSignedWord: i16(u32(input.payloadDword, "payloadDword") & 0xffff, "payloadDword low WORD"),
    sourceReference: u32(input.sourceReference, "sourceReference"),
    sourceOwnerSigned: bool(input.sourceLive, "sourceLive")
      ? i8(u8(input.sourceOwnerByte, "sourceOwnerByte"))
      : -1,
    pathIndex: 0,
  };
  return { created: true, slot, registryWrite: { slot, value: subtype }, record: recordProjection };
}

export function reproduceFlightUpdate(input) {
  record(input, "input");
  const globalTick = u32(input.globalTick, "globalTick");
  const phaseBefore = u16(input.phaseWord, "phaseWord");
  let phaseWord = phaseBefore;
  if (globalTick % 3 === 0) {
    const divisor = i8(u8(input.phaseDivisorByte, "phaseDivisorByte"));
    if (divisor === 0) throw new RangeError("phaseDivisorByte must be nonzero when phase update is reached");
    phaseWord = (i16((phaseBefore + 1) & 0xffff, "incremented phase WORD") % divisor) & 0xffff;
  }

  const trackingEnabled = u16(input.trackingEnabledWord, "trackingEnabledWord") === 1;
  const pathIndex = boundedInteger(input.pathIndex, 0, 159, "pathIndex");
  const pathEnd = boundedInteger(input.pathEnd, 0, 159, "pathEnd");
  if (pathIndex > pathEnd)
    throw new RangeError("pathIndex must not exceed pathEnd in the promoted normal path domain");
  let trackingCount = null;
  let trackingGateReached = false;
  if (trackingEnabled && pathIndex > 2) {
    trackingCount = boundedInteger(input.trackingCount, 0, 15, "trackingCount");
    trackingGateReached = trackingCount < 15;
  }
  let targetLiveChecked = false;
  let generationMatched = false;
  let targetCoordinatesRead = false;
  let targetIndex = null;
  let targetGeneration = null;
  if (trackingGateReached) {
    const targetReference = u32(input.targetReferenceDword, "targetReferenceDword");
    targetIndex = i16(targetReference & 0xffff, "targetReferenceDword low WORD");
    targetGeneration = targetReference >>> 16;
    targetLiveChecked = bool(input.targetLive, "targetLive");
    if (targetLiveChecked) {
      const activeReference = u32(input.activeTargetReferenceDword, "activeTargetReferenceDword");
      generationMatched =
        (activeReference & 0xffff) === (targetReference & 0xffff)
        && (activeReference >>> 16) === targetGeneration;
      targetCoordinatesRead = generationMatched;
    }
  }

  const pathIndexBeforeStep = targetCoordinatesRead ? 0 : pathIndex;
  const pathEndForStep = targetCoordinatesRead
    ? boundedInteger(input.repathPathEnd, 0, 159, "repathPathEnd")
    : pathEnd;
  const nonEndUpdate = pathIndexBeforeStep !== pathEndForStep;
  return {
    phaseWord,
    trackingGateReached,
    targetLiveChecked,
    generationMatched,
    targetCoordinatesRead,
    targetIndex,
    targetGeneration,
    trackingCount: targetCoordinatesRead ? u16(trackingCount + 1) : trackingCount,
    pathIndicesResetBeforeRepath: targetCoordinatesRead,
    pathIndexBeforeStep,
    nonEndUpdate,
    pathIndexAfterUpdate: nonEndUpdate ? pathIndexBeforeStep + 1 : pathIndexBeforeStep,
  };
}

export function reproduceSubtypeEndpoint(input) {
  record(input, "input");
  const subtype = u16(input.subtype, "subtype");
  if (subtype === 12)
    return { updaterReturn: 0, cleanupRegistry: true, finalEffectKind: 9, sameSlotTransition: null };
  if (subtype !== 16)
    throw new RangeError("subtype must be 12 or 16 in this endpoint projection");
  if (!Array.isArray(input.candidates)) throw new TypeError("candidates must be an array");
  let selected = null;
  let bestDistance = 10000;
  for (const [index, candidate] of input.candidates.entries()) {
    record(candidate, `candidates[${index}]`);
    if (!bool(candidate.registryActive, `candidates[${index}].registryActive`)) continue;
    const distance = u16(candidate.chebyshevDistance, `candidates[${index}].chebyshevDistance`);
    if (distance >= 5) continue;
    if (bool(candidate.teamHelperReturnedSame, `candidates[${index}].teamHelperReturnedSame`)) continue;
    if (distance >= bestDistance) continue;
    bestDistance = distance;
    selected = { index, reference: u32(candidate.reference, `candidates[${index}].reference`), distance };
  }
  if (
    selected
    && selected.reference !== 0
    && bool(input.geometryAccepted, "geometryAccepted")
  ) {
    const slot = boundedInteger(input.currentSlot, 1, 99, "currentSlot");
    return {
      updaterReturn: 1,
      cleanupRegistry: false,
      finalEffectKind: null,
      sameSlotTransition: {
        slot,
        subtype: 1,
        registryWrite: { slot, value: 1 },
        targetReference: selected.reference,
        selectedCandidateIndex: selected.index,
        payloadSignedWord: i16(u32(input.payloadDword, "payloadDword") & 0xffff, "payloadDword low WORD"),
      },
    };
  }
  return { updaterReturn: 0, cleanupRegistry: true, finalEffectKind: 2, sameSlotTransition: null };
}

export function reproduceFinalDamage(input) {
  record(input, "input");
  const effectKind = u16(input.effectKind, "effectKind");
  if (effectKind !== 2 && effectKind !== 9)
    throw new RangeError("effectKind must be 2 or 9");
  if (!bool(input.targetActive, "targetActive"))
    return noHealthWrite("target-inactive-before-FUN_00413b30");
  let scaledPayload = null;
  if (effectKind === 2) {
    const payload = nonnegativePayload(input.payload);
    if (u8(input.selectionModeByte, "selectionModeByte") !== 2)
      throw new RangeError("selectionModeByte must be exactly 2 for promoted action-59 kind 2");
    scaledPayload = payload;
    if (bool(input.sameOwner, "sameOwner"))
      scaledPayload = Math.trunc(i16(scaledPayload & 0xffff, "kind 2 scaled payload WORD") / 2);
    scaledPayload = i16(scaledPayload & 0xffff, "scaled payload WORD");
  }
  if (u8(input.targetClassByte, "targetClassByte") === 95)
    return noHealthWrite("target-class-95-special-callback", scaledPayload);
  const targetGenerationMatches = bool(input.targetGenerationMatches, "targetGenerationMatches");
  let defenseWord = null;
  let defense = null;
  let damageWord = 0;
  let damage = 0;
  if (targetGenerationMatches && effectKind === 9) {
    const payload = nonnegativePayload(input.payload);
    scaledPayload = payload;
    const targetMode = u32(input.targetModeDword, "targetModeDword");
    if (targetMode === 4) scaledPayload += Math.trunc((payload * 30) / 100);
    else if (targetMode === 5) scaledPayload += Math.trunc((payload * 50) / 100);
    scaledPayload = i16(scaledPayload & 0xffff, "scaled payload WORD");
  }
  if (targetGenerationMatches) {
    defenseWord =
      (u16(input.defenseWord50, "defenseWord50") + u16(input.defenseWord44, "defenseWord44")) & 0xffff;
    if (u8(input.targetByteBa, "targetByteBa") === 1)
      defenseWord = (defenseWord + Math.trunc(i16(defenseWord, "defense WORD") / 2)) & 0xffff;
    defense = Math.min(i16(defenseWord, "adjusted defense WORD"), 90);
    const rawDamage = scaledPayload - Math.trunc((defense * scaledPayload) / 100);
    const rawDamageWord = rawDamage & 0xffff;
    damageWord = i16(rawDamageWord, "raw damage WORD") > 0 ? rawDamageWord : 1;
    damage = damageWord;
  }
  const writerGlobalWord = u16(input.writerGlobalWord, "writerGlobalWord");
  if (writerGlobalWord === 1) {
    u8(input.targetOwnerByte, "targetOwnerByte");
    if (u8(input.playerOwnerGateByte, "playerOwnerGateByte") === 0) {
      return {
        healthWriteReached: false,
        noWriteReason: "FUN_00438130-owner-gate-zero",
        scaledPayload,
        defenseWord,
        defense,
        damage,
        bufferWord: null,
        currentHealth: null,
        writerReturn: 1,
        nextFunction: "FUN_00439400",
      };
    }
  }
  const bufferBefore = u16(input.bufferWord, "bufferWord");
  const healthBefore = boundedInteger(input.currentHealth, 1, 0x7fff, "currentHealth");
  const bufferAbsorbed = i16(bufferBefore, "bufferWord") >= i16(damageWord, "damage WORD");
  let bufferWord = bufferBefore;
  let currentHealth = healthBefore;
  if (bufferBefore !== 0 && bufferAbsorbed) {
    bufferWord = (bufferBefore - damageWord) & 0xffff;
  } else {
    bufferWord = 0;
    const healthWord = (u16(healthBefore, "currentHealth") - damageWord) & 0xffff;
    currentHealth = Math.max(0, i16(healthWord, "health result WORD"));
  }
  const writerReturn = bufferBefore !== 0 && bufferAbsorbed ? 1 : currentHealth > 0 ? 1 : 0;
  return {
    healthWriteReached: true,
    noWriteReason: null,
    scaledPayload,
    defenseWord,
    defense,
    damage,
    bufferWord,
    currentHealth,
    writerReturn,
    nextFunction: writerReturn === 0 ? "FUN_00442b10" : "FUN_00439400",
  };
}

function noHealthWrite(reason, scaledPayload = null) {
  return {
    healthWriteReached: false,
    noWriteReason: reason,
    scaledPayload,
    defenseWord: null,
    defense: null,
    damage: null,
    bufferWord: null,
    currentHealth: null,
    writerReturn: null,
    nextFunction: null,
  };
}

function nonnegativePayload(value) {
  const payload = i16(value, "payload");
  if (payload < 0)
    throw new RangeError("payload must be nonnegative in the promoted damage projection");
  return payload;
}

function requireJumpTable(document, functionEntry, switchAddress) {
  const table = document.tables.find((candidate) =>
    candidate.functionEntry === functionEntry && candidate.switchAddress === switchAddress);
  if (!table) throw new Error(`jump-tables.json missing ${functionEntry} ${switchAddress}`);
  return table;
}

function normalizeRegistry(value) {
  if (!Array.isArray(value) || value.length !== 100)
    throw new RangeError("registry must contain exactly 100 WORD values");
  return value.map((entry, index) => u16(entry, `registry[${index}]`));
}

function parseJson(bytes, path) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`Invalid JSON in ${path}: ${error.message}`, { cause: error });
  }
}

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${label} must be an object`);
}

function bool(value, label) {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be boolean`);
  return value;
}

function u8(value, label) {
  integer(value, 0, 0xff, label);
  return value;
}

function u16(value, label = "value") {
  integer(value, 0, 0xffff, label);
  return value & 0xffff;
}

function i16(value, label) {
  integer(value, -0x8000, 0xffff, label);
  const word = value & 0xffff;
  return word >= 0x8000 ? word - 0x10000 : word;
}

function i8(value) {
  return value >= 0x80 ? value - 0x100 : value;
}

function u32(value, label = "value") {
  integer(value, 0, 0xffffffff, label);
  return value >>> 0;
}

function integer(value, minimum, maximum, label) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new RangeError(`${label} must be an integer in ${minimum}..${maximum}; got ${value}`);
}

function boundedInteger(value, minimum, maximum, label) {
  integer(value, minimum, maximum, label);
  return value;
}

function hex(value) {
  return `0x${value.toString(16).padStart(8, "0")}`;
}
