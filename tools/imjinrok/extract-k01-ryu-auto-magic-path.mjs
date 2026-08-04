#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractActionDefinitions } from "./extract-hero-priority-queue-gate.mjs";
import { readPeImage } from "./pe-image.mjs";
import { assertEqual, sha256, verifyRawCodeRange } from "./static-evidence.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_SEEDS_PATH = "analysis/generated/imjinrok2/seeds.json";
const DEFAULT_FUNCTIONS_PATH = "analysis/generated/imjinrok2/functions.json";
const DEFAULT_REFERENCES_PATH = "analysis/generated/imjinrok2/references.json";
const DEFAULT_JUMP_TABLES_PATH = "analysis/generated/imjinrok2/jump-tables.json";

export const EXPECTED_EXECUTABLE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_SEEDS_SHA256 =
  "386b0f4e86c3376f34fe2b50fedb7e45b762c30784d4ebcc0387aa6f431811b2";
export const EXPECTED_FUNCTIONS_SHA256 =
  "7e071fdfe425d22447780c265fe1d3fd271a1bedd1773682bebcb8ddc6d2e16e";
export const EXPECTED_REFERENCES_SHA256 =
  "f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5";
export const EXPECTED_JUMP_TABLES_SHA256 =
  "0ae517eb172f61b974ca7a4411e64c1cc42065c462ed53b3065ab2da633dfe2f";

const RAW_CODE_RANGES = [
  ["class-78-case", 0x00419930, 0x00419a08, "703836533abe81b4cdb88b91f0dccb49ac94981184c313e997db64ed5952ea34"],
  ["target-admission", 0x0041c870, 0x0041c991, "b36c85ce3b4b3971ff68479a561f8164bee2015789e8f04b483b1d5f8f186311"],
  ["delivery-core", 0x00478320, 0x004783a5, "6a781b7a06f29edae1e5ac7fe234c5e0419d20c93c2f3f4c5b1cf581099031f0"],
  ["action-40-wrapper", 0x004784c0, 0x004784f1, "8092b185325931bb2f4a2e457b2773713b264262ff72e53676c4c2ea3948eabc"],
  ["action-59-wrapper", 0x004788b0, 0x004788d5, "74a25c28c4be9d9ae21ef3bc4b404b3d0da4ba199844ad64b42d6a8442281897"],
  ["pending-store", 0x00426740, 0x004267ff, "8dbf09b2ffd03bebde48d70613dd8237bd25a66b665250de34547513d66e9f9c"],
  ["pending-consumer", 0x00426c20, 0x00428155, "04ed69acd326a5bcf2858a42dfacf8dacfe674de2f2e941fd0d4be157a654576"],
  ["action-40-admission", 0x0041c840, 0x0041c86d, "3338d6b4178cef04d31ce8ce258713ac6b4b5a046af6bc47f12641e2eb13251e"],
  ["action-40-state", 0x0041c9a0, 0x0041cb0b, "a2b0dc14dc5f057bcbfa86a6831669b2aaa686cc4f623393780ac803e4c016e2"],
  ["action-40-effect", 0x0041cb10, 0x0041ccc5, "eb626a3e52c452ae728cb14689253fd58dc4c88a3e51e982086028c5428ad4bd"],
  ["action-59-admission", 0x004165d0, 0x004165fe, "4c554c05b82b6a86164a9bbc61af3f8362ea05aaa8ca341a85ce19b52d5a7211"],
  ["action-59-state-effect", 0x00416600, 0x00416861, "2b48386b4eebcc36b86ad2acd8db86640449948c95c947fc0fad8f7625843efc"],
  ["target-status-write", 0x00420cb0, 0x00420cd8, "67607965578780406ece47b9ed3196321237a8b4ad37ddb60d4e53ff35cd283a"],
  ["target-owner-transfer", 0x0041c290, 0x0041c3b8, "3d335205f5ab10f488de1d749cee56cc27d52cf290e229bbfa6a9750ae458b85"],
  ["normal-attack-boundary", 0x00416c70, 0x0041737f, "64a73cde6d1acefe57c3490898765095069c5daa7dce7f7ac96543e11f765451"],
  ["entity-state-dispatch", 0x0043c9c0, 0x0043d360, "722a1b8544178408f988bd70b5a221408ffc8064acf142c719723bf92db81c4d"],
  ["source-live-admission", 0x00441db0, 0x00441dd9, "2210003ad3d1ea0dfb2e9e83e060b0566285a2f1eac5c0c92dd591e0c6ec4dc1"],
  ["target-live-active-admission", 0x00441e40, 0x00441e7b, "a43ab36d3a8ffdbe265feaad703c178ba7f3ce4ed4445b891ffd92a2faf69df0"],
  ["same-team-comparison", 0x004426a0, 0x004426e2, "2e3f9a63a641b72a43a05596e1df3c1452c9042f7ce0d0fec2366e02f1037244"],
].map(([id, start, endExclusive, digest]) => ({ id, start, endExclusive, sha256: digest }));

const FUNCTION_CATALOG = [
  ["0x004196e0", 2154, 665, "7f47169185d935011244d7291327fb4c6e99c76c375fd40ccca284e04a6a192e"],
  ["0x0041c870", 289, 101, "769c6b000ad6459e3d68268e09f1aace97de72f35065cacf9b07c90587a23068"],
  ["0x00478320", 133, 43, "4cb4b2aafe7744fa02b8aa320d475d777aa6048078263563234228129f5315d0"],
  ["0x004784c0", 49, 17, "6d6621ca791ab338b5314a646f3361e8944533d6649b2481223efb0249cca862"],
  ["0x004788b0", 37, 13, "d86470730f8dd7d4acd1bc3ff2be624c6b58ed578a2b627870e70e83449623f9"],
  ["0x00426740", 191, 44, "8b533246c3f83af3e8ce085202fa9be3ddc2bc9e91911f474ce5ba7201d89525"],
  ["0x00426c20", 5429, 1428, "95c3358341e594a04aef234beb0838edc8bb296bd6a691ff41b376d9e4f8452c"],
  ["0x0041c840", 45, 14, "7d5ee56f2f277261c4a1f615c6c9f975dae605c3ddc7e0cbb508626f42c6843a"],
  ["0x0041c9a0", 363, 113, "81323bcf4b4365727e20209805c3489a1468fb04419ee9ff12232087768b2ead"],
  ["0x0041cb10", 437, 128, "a8393ba75ffc1df01352188fbbdc5bea5c6d1d6233d4451aae7576cdbcac924f"],
  ["0x004165d0", 46, 16, "c197487e32db4de9b95c00b91a482a1b17d7f5c5f3f163824d536c032620dfbf"],
  ["0x00416600", 609, 174, "0a4ed025e0e6bdc4cfc62392ce53e0d11a783ee6b48266a462216b01c9f02c5d"],
  ["0x00420cb0", 40, 8, "b674c61016a2c961e587e382520a81779bb91849a6f5d17ed538ec082c21595e"],
  ["0x0041c290", 296, 85, "304c5f7fe25daef6c6f51c4518a424d341ecca85eefc03692e5b170d6677f144"],
  ["0x00416c70", 1807, 555, "1aa33927309774ef7f107445f4678d1ffa5998447b7b76f2e7bd51d9f297ba57"],
  ["0x0043c9c0", 2464, 684, "eb1c7c21a9af5a2099a2d716ad1253db65fff75ef0befcae871e3462f4d3bcfa"],
  ["0x00441db0", 41, 12, "12984df20c7bb82eb364b29180f75185fe17ac268bffb3d3c782a7fa6c5adf8e"],
  ["0x00441e40", 59, 19, "01b3c1652d8edf30a6c0dc948215f734475111fc734338603d847545c43e7cda"],
  ["0x004426a0", 66, 23, "992c88ef4558ec0ce71340db71f7aa5dea19be134eeae9d64c62cd40e16e1ac1"],
].map(([entry, bodySize, instructionCount, instructionSha256]) => ({
  entry, bodySize, instructionCount, instructionSha256,
}));

const REFERENCE_SPECS = [
  ["FUN_0041c870 callers", "to", "0x0041c870", 6, "9532003bab58fdd2896ec9934ce1856c2fd7b4877cdf8874c8501003b130b112"],
  ["FUN_0041c870 outgoing calls", "fromFunctionEntry", "0x0041c870", 2, "60e21b0e5f22503c790905ad59edb96aa269fdfa4a72ab91c91ea5ab338c018a"],
  ["FUN_004784c0 callers", "to", "0x004784c0", 2, "1757dd6e2b9907a65f226d7a78c4c24ad8d3fc9c78e7eb6f5f14a2f47c139fed"],
  ["FUN_004788b0 callers", "to", "0x004788b0", 1, "6c57f78bec9c725404626c7a3a60a9d7926bc66f541900648309e1c9a85bf1e7"],
  ["pending-store callers", "to", "0x00426740", 5, "9eaad15960e87ed2ef4eae2796aec6d7a37fd16c14b4307ba8cf749ae78a473c"],
  ["pending consumer outgoing calls", "fromFunctionEntry", "0x00426c20", 87, "f6111cfaf56a079ad678b2cbb3c904d5892b83d6470bb0821ff183aea9040f87"],
  ["action 40 effect outgoing calls", "fromFunctionEntry", "0x0041cb10", 12, "9c8bbc2d8a2a6944d9963fc9d22612012bcdb1d5fcc519d0bab374568cdbf08b"],
  ["action 59 effect outgoing calls", "fromFunctionEntry", "0x00416600", 7, "3cc3b714a964dcbcc65709598cb92665660103988fa73e03e8d400d4eb04d1b3"],
  ["FUN_00441db0 callers", "to", "0x00441db0", 43, "a3df62e22710626cbdbc6c61790d36b0d620d170aff620c78cf70bc42f511708"],
  ["FUN_00441e40 callers", "to", "0x00441e40", 174, "476114ecbcf11774e164276899d4906895d2e6396263c3d25481de020f9b5125"],
  ["FUN_004426a0 callers", "to", "0x004426a0", 38, "284fb93141a3158de5122dd2262172f913c44649d423db6b887b57b4e0490169"],
].map(([label, key, value, count, digest]) => ({ label, key, value, count, digest }));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(extractK01RyuAutoMagicPath(), null, 2));
}

export function extractK01RyuAutoMagicPath({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  seedsPath = DEFAULT_SEEDS_PATH,
  functionsPath = DEFAULT_FUNCTIONS_PATH,
  referencesPath = DEFAULT_REFERENCES_PATH,
  jumpTablesPath = DEFAULT_JUMP_TABLES_PATH,
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  const sources = {
    executable: buffer,
    seeds: readFileSync(seedsPath),
    functions: readFileSync(functionsPath),
    references: readFileSync(referencesPath),
    jumpTables: readFileSync(jumpTablesPath),
  };
  for (const [name, expected] of Object.entries({
    executable: EXPECTED_EXECUTABLE_SHA256,
    seeds: EXPECTED_SEEDS_SHA256,
    functions: EXPECTED_FUNCTIONS_SHA256,
    references: EXPECTED_REFERENCES_SHA256,
    jumpTables: EXPECTED_JUMP_TABLES_SHA256,
  })) assertEqual(sha256(sources[name]), expected, `${name} SHA-256`);
  const functions = parseJson(sources.functions, functionsPath);
  const references = parseJson(sources.references, referencesPath);
  const jumpTables = parseJson(sources.jumpTables, jumpTablesPath);
  for (const [name, document] of Object.entries({
    seeds: parseJson(sources.seeds, seedsPath), functions, references, jumpTables,
  })) assertEqual(document.sourceSha256, EXPECTED_EXECUTABLE_SHA256, `${name} source SHA-256`);

  const functionCatalog = FUNCTION_CATALOG.map((expected) => {
    const actual = functions.functions.find(({ entry }) => entry === expected.entry);
    if (!actual) throw new Error(`functions.json missing ${expected.entry}`);
    for (const key of ["bodySize", "instructionCount", "instructionSha256"])
      assertEqual(actual[key], expected[key], `${expected.entry} ${key}`);
    return { ...expected, bodyRanges: actual.bodyRanges, callers: actual.callers, callees: actual.callees };
  });
  const referenceSets = REFERENCE_SPECS.map((spec) => verifyReferenceSet(references, spec));
  const pendingSwitch = verifyJumpTable(jumpTables, "0x00426c20", "0x00426cdb", 68,
    "a746217e53a9fe2e6d85b6b655e34b548f0f501834c4e7223eeffa54257e709b");
  const stateSwitch = verifyJumpTable(jumpTables, "0x0043c9c0", "0x0043cda3", 69,
    "e2d386377bb0174533300b6cdd992f67082d741da2b5765a66ced30af9d29ebf");
  const definitions = extractActionDefinitions(buffer, image, references)
    .filter(({ actionId }) => actionId === 40 || actionId === 59);
  assertEqual(definitions.length, 2, "action 40/59 definition count");

  return {
    analysisStatus: "static-confirmed-k01-class-78-auto-magic-issued-effects-and-command-boundary",
    reproductionStatus: "partial-reproduction-bounded-projections",
    implementationStatus: "analysis-only-no-product-change",
    sourceHashes: Object.fromEntries(Object.entries(sources).map(([name, bytes]) => [name, sha256(bytes)])),
    rawCodeRanges: RAW_CODE_RANGES.map((range) => verifyRawCodeRange(buffer, image, range)),
    functionCatalog,
    referenceSets,
    jumpTables: { pendingSwitch, stateSwitch },
    actionDefinitions: definitions,
    fields: {
      entity: {
        internalClass: ["BYTE", "0x37"], playerIndex: ["signed BYTE", "0x38"],
        maximumHealth: ["signed WORD", "0x3c"], currentHealth: ["signed WORD", "0x3e"],
        payloadWord: ["WORD", "0x46"], fallbackSelector: ["BYTE", "0x68"],
        flags: ["DWORD", "0x74"], activeGate: ["BYTE", "0x1f0"],
        currentTargetReference: ["DWORD", "0x122"], phase: ["DWORD", "0x12a"],
        state: ["WORD", "0x1b0"], sourceReference: ["WORD", "0x1b6"],
        targetX: ["WORD", "0x1bc"], targetY: ["WORD", "0x1be"],
        casterResource: ["signed WORD", "0x448"],
        pendingAuxiliaryWord: ["WORD", "0x266"],
        pendingAction: ["WORD", "0x268"],
        pendingOrigin: ["BYTE", "0x26a"], pendingByte3: ["BYTE", "0x26b"],
        pendingPayload: ["DWORD", "0x26c"], pendingContext: ["DWORD", "0x270"],
      },
      target: {
        base: "common entity object at 0x00635258 + index*0x558",
        internalClass: ["BYTE", "0x37"], owner: ["signed BYTE", "0x38"],
        maximumHealth: ["signed WORD", "0x3c"], currentHealth: ["signed WORD", "0x3e"],
        kind: ["BYTE", "0x68"], flags: ["DWORD", "0x74"], active: ["BYTE", "0x1f0"],
        x: ["WORD", "0x1bc"], y: ["WORD", "0x1be"],
        status: ["WORD", "0x252"], statusPhase: ["WORD", "0x254"],
      },
      player: {
        team: ["BYTE", "0x05"], action59Charges: ["WORD read as signed at effect", "0x2542"],
        targetRuleMode: ["WORD", "0x240a"], targetRuleGate: ["WORD", "0x23f6"],
        globalMagicAutoUse: ["WORD", "0x254c"],
      },
    },
    conclusion: {
      selection:
        "gate nonzero and updated LCG remainder modulo 3 zero: eligible target chooses action 40; otherwise target kind byte exact 2 chooses action 59; other paths return 0",
      action40:
        "at its effect phase, revalidate the enemy low-health target, subtract 70 from caster signed-WORD resource with zero clamp, set target status 1/phase 0, and transfer target owner to caster player",
      action59:
        "at its effect phase, require signed-positive player WORD +0x2542, decrement it once, clamp a negative entity signed-WORD +0x448 to zero, and gate eight surrounding {-2,0,2} offsets excluding center before subtype-16 creation calls",
      commandBoundary:
        "automatic records use origin byte 1; a pending non-idle manual-origin byte 0 record blocks the store, while manual may replace automatic. Reached wrappers still return 1, so the normal-attack preparation is skipped for that update even on invalid source or rejected store",
    },
    unresolvedBoundary:
      "the full DWORD subtype payload passed by push edi beyond the reproduced low WORD, FUN_00411160/FUN_00464cc0 helper-gate semantics, FUN_004111b0 subtype-16 downstream flight/collision/final effect, action-40 callbacks/bookkeeping outside selected projected fields, and the outer input-vs-entity-update scheduler beyond FUN_00477cc0→FUN_00478250→FUN_00426740 remain static-only unresolved",
  };
}

export function advanceClass78Cadence(value) {
  const oldValue = u32(value, "value");
  const wrappedProduct = Number((BigInt(oldValue) * 65411n) & 0xffffffffn);
  const nextValue = wrappedProduct % 65531;
  return { oldValue, wrappedProduct, nextValue, selected: nextValue % 3 === 0 };
}

export function reproduceTargetAdmission(input) {
  record(input, "input");
  if (u16(input.targetRuleGate, "targetRuleGate") === 0)
    return rejectedAdmission("target-rule-gate-zero");
  if (!bool(input.registrySlotNonzero, "registrySlotNonzero"))
    return rejectedAdmission("registry-slot-zero");
  if (i16(input.currentHealth, "currentHealth") <= 0)
    return rejectedAdmission("target-health-not-positive");
  if (!bool(input.targetActive, "targetActive"))
    return rejectedAdmission("target-inactive");
  if (i16(input.casterResource, "casterResource") < 70)
    return rejectedAdmission("caster-resource-below-70");
  if (u8(input.targetClass, "targetClass") === 81)
    return rejectedAdmission("excluded-class-81");

  const mode = u16(input.targetRuleMode, "targetRuleMode");
  const casterClass = u8(input.casterClass, "casterClass");
  const flags = u32(input.targetFlags, "targetFlags");
  const requiredFlagPresent = mode === 1 && casterClass === 78
    ? (flags & 2) !== 0
    : (flags & 0x80000) !== 0;
  if (!requiredFlagPresent)
    return rejectedAdmission("required-target-flag-missing");
  if (bool(input.typeDefinitionMask0x08Set, "typeDefinitionMask0x08Set"))
    return rejectedAdmission("type-definition-mask-0x08-set");
  if (u8(input.casterTeam, "casterTeam") === u8(input.targetTeam, "targetTeam"))
    return rejectedAdmission("same-team");

  const threshold = Math.trunc((i16(input.maximumHealth, "maximumHealth") * 2) / 3);
  if (i16(input.currentHealth, "currentHealth") >= threshold)
    return rejectedAdmission("target-not-below-threshold", threshold);
  return { eligible: true, failedReason: null, healthThreshold: threshold };
}

export function reproducePendingStore(input) {
  record(input, "input");
  record(input.existing, "existing");
  record(input.incoming, "incoming");
  const incomingActionWord = u16(input.incoming.actionWord, "incoming.actionWord");
  if (incomingActionWord === 21)
    throw new RangeError("incoming.actionWord 21 is outside this bounded pending-store projection");
  const existingActionWord = u16(input.existing.actionWord, "existing.actionWord");
  const existingOriginByte = u8(input.existing.originByte, "existing.originByte");
  const incomingOriginByte = u8(input.incoming.originByte, "incoming.originByte");
  const stored = !(
    existingActionWord !== 1
    && existingOriginByte !== 1
    && incomingOriginByte === 1
  );
  if (!stored)
    return { stored: false, final: normalizePending(input.existing, "existing") };
  const incoming = {
    actionWord: incomingActionWord,
    originByte: incomingOriginByte,
    byte3: u8(input.incoming.byte3, "incoming.byte3"),
    payload: u32(input.incoming.payload, "incoming.payload"),
    context: u32(input.incoming.context, "incoming.context"),
    pendingAuxiliaryWord: u16(input.incoming.pendingAuxiliaryWord, "incoming.pendingAuxiliaryWord"),
  };
  return { stored: true, final: incoming };
}

export function reproduceAutoIssue(input) {
  record(input, "input");
  if (u16(input.globalGate, "globalGate") === 0)
    return autoResult(null, null, false, input.pending);
  const cadence = advanceClass78Cadence(input.randomValue);
  if (!cadence.selected) return autoResult(cadence, null, false, input.pending);
  let actionWord = null;
  if (bool(input.targetEligible, "targetEligible")) {
    actionWord = 40;
  } else if (u8(input.targetKind, "targetKind") === 2) {
    actionWord = 59;
  }
  if (actionWord === null) return autoResult(cadence, null, false, input.pending);
  if (!bool(input.sourceValid, "sourceValid"))
    return autoResult(cadence, actionWord, true, input.pending, false);
  const incoming = actionWord === 40
    ? { actionWord: 40, originByte: 1, byte3: 0, payload: u32(input.packedCoordinates, "packedCoordinates"),
        context: u32(input.targetReference, "targetReference"), pendingAuxiliaryWord: 1 }
    : { actionWord: 59, originByte: 1, byte3: 0, payload: 0,
        context: u32(input.action59Context, "action59Context"), pendingAuxiliaryWord: 1 };
  const store = reproducePendingStore({ existing: input.pending, incoming });
  return { cadence, issuedAction: actionWord, dispatcherReturn: 1, normalAttackPrepared: false,
    storeReached: true, stored: store.stored, finalPending: store.final };
}

export function reproduceAction40Effect(input) {
  record(input, "input");
  const resource = i16(input.casterResource, "casterResource");
  if (!bool(input.targetStillEligible, "targetStillEligible")) {
    return {
      applied: false,
      casterResource: resource,
      targetOwner: i8(input.targetOwner, "targetOwner"),
      targetStatus: u16(input.targetStatus, "targetStatus"),
      targetStatusPhase: u16(input.targetStatusPhase, "targetStatusPhase"),
    };
  }
  return {
    applied: true,
    casterResource: Math.max(0, resource - 70),
    targetOwner: i8(input.casterPlayer, "casterPlayer"),
    targetStatus: 1,
    targetStatusPhase: 0,
  };
}

export function reproduceAction59Effect(input) {
  record(input, "input");
  const rawCharges = u16(input.chargeWord, "chargeWord");
  const signedCharges = rawCharges < 0x8000 ? rawCharges : rawCharges - 0x10000;
  if (signedCharges <= 0)
    return {
      chargeConsumed: false,
      finalChargeWord: rawCharges,
      casterResourceClamped: false,
      finalCasterResource: null,
      attempts: [],
    };
  const casterResource = i16(input.casterResource, "casterResource");
  const finalCasterResource = Math.max(0, casterResource);
  const accepted = input.accepted;
  if (
    !Array.isArray(accepted)
    || accepted.length !== 8
    || accepted.some((value) => typeof value !== "boolean")
  ) {
    throw new TypeError("accepted must contain exactly eight booleans");
  }
  const subtypePayloadLowWord = accepted.some(Boolean)
    ? ((u16(input.entityPayloadWord, "entityPayloadWord") * 3)
      + (u16(input.classModifier, "classModifier") * 25)) & 0xffff
    : null;
  const offsets = [-2, 0, 2];
  const attempts = [];
  let index = 0;
  for (const yOffset of offsets) {
    for (const xOffset of offsets) {
      if (xOffset === 0 && yOffset === 0) continue;
      attempts.push({
        xOffset,
        yOffset,
        accepted: accepted[index],
        subtype: accepted[index] ? 16 : null,
        subtypePayloadLowWord: accepted[index] ? subtypePayloadLowWord : null,
      });
      index += 1;
    }
  }
  return {
    chargeConsumed: true,
    finalChargeWord: (rawCharges - 1) & 0xffff,
    casterResourceClamped: casterResource < 0,
    finalCasterResource,
    attempts,
  };
}

function autoResult(cadence, issuedAction, dispatcherReturnOne, pending, stored = false) {
  const finalPending = normalizePending(pending, "pending");
  return { cadence, issuedAction, dispatcherReturn: dispatcherReturnOne ? 1 : 0,
    normalAttackPrepared: !dispatcherReturnOne, storeReached: false, stored, finalPending };
}

function rejectedAdmission(failedReason, healthThreshold = null) {
  return { eligible: false, failedReason, healthThreshold };
}

function normalizePending(value, label) {
  record(value, label);
  return {
    actionWord: u16(value.actionWord, `${label}.actionWord`),
    originByte: u8(value.originByte, `${label}.originByte`),
    byte3: u8(value.byte3, `${label}.byte3`),
    payload: u32(value.payload, `${label}.payload`),
    context: u32(value.context, `${label}.context`),
    pendingAuxiliaryWord: u16(value.pendingAuxiliaryWord, `${label}.pendingAuxiliaryWord`),
  };
}

function verifyJumpTable(document, functionEntry, switchAddress, count, digest) {
  const table = document.tables.find((candidate) =>
    candidate.functionEntry === functionEntry && candidate.switchAddress === switchAddress);
  if (!table) throw new Error(`jump table missing ${switchAddress}`);
  const projection = table.cases.map(({ label, destination }) => ({ label, destination }));
  assertEqual(projection.length, count, `${switchAddress} case count`);
  assertEqual(hashJson(projection), digest, `${switchAddress} cases SHA-256`);
  return { functionEntry, switchAddress, count, digest, cases: projection };
}

function verifyReferenceSet(document, spec) {
  const references = document.references
    .filter((reference) => reference[spec.key] === spec.value && reference.type === "UNCONDITIONAL_CALL")
    .map(({ from, to, type, fromFunctionEntry }) => ({ from, to, type, fromFunctionEntry }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  assertEqual(references.length, spec.count, `${spec.label} count`);
  assertEqual(hashJson(references), spec.digest, `${spec.label} SHA-256`);
  return { ...spec, references };
}

function hashJson(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function parseJson(bytes, path) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch (error) { throw new Error(`${path} is not valid JSON: ${error.message}`, { cause: error }); }
}

function record(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${label} must be an object`);
}
function bool(value, label) {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be boolean`);
  return value;
}
function integer(value, minimum, maximum, label) {
  if (!Number.isInteger(value) || value < minimum || value > maximum)
    throw new RangeError(`${label} must be an integer in ${minimum}..${maximum}; got ${value}`);
  return value;
}
function u8(value, label) { return integer(value, 0, 0xff, label); }
function i8(value, label) { return integer(value, -0x80, 0x7f, label); }
function u16(value, label) { return integer(value, 0, 0xffff, label); }
function i16(value, label) { return integer(value, -0x8000, 0x7fff, label); }
function u32(value, label) { return integer(value, 0, 0xffffffff, label) >>> 0; }
