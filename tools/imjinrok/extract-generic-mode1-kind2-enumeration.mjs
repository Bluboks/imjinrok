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

const SHARED_BRANCH_KINDS = [2, 3, 4, 13, 14, 18, 24, 25, 26, 27];
const KIND_2_CALL_SITES = ["0x0040ebb4", "0x0040ef30"];
const RELEVANT_DATA_REFERENCES = [
  ["0x00412ff0", "0x0052dc38", "WRITE", "0x00412ff0"],
  ["0x00413000", "0x0052dc38", "READ", "0x00413000"],
  ["0x00413017", "0x0052dbfc", "READ", "0x00413000"],
  ["0x00413040", "0x0052dc38", "READ", "0x00413040"],
  ["0x00413056", "0x0052dbfc", "DATA", "0x00413040"],
  ["0x0041305e", "0x0052dc38", "WRITE", "0x00413040"],
  ["0x0041392b", "0x00ac2d90", "READ", "0x00413700"],
  ["0x00413946", "0x00ac2d94", "READ", "0x00413700"],
  ["0x00413986", "0x00ac2da4", "DATA", "0x00413700"],
  ["0x00413a16", "0x00635290", "DATA", "0x00413700"],
  ["0x00413a46", "0x0063540e", "DATA", "0x00413700"],
  ["0x00441e44", "0x007d0ed8", "DATA", "0x00441e40"],
  ["0x00441e5e", "0x00635296", "DATA", "0x00441e40"],
  ["0x00441e6b", "0x00635448", "DATA", "0x00441e40"],
].map(([from, to, type, fromFunctionEntry]) => ({ from, to, type, fromFunctionEntry }));
const ALL_CALL_SITES = [
  "0x0040e257", "0x0040e2a8", "0x0040e2f8", "0x0040e348", "0x0040e464",
  "0x0040e584", "0x0040e6a4", "0x0040e6f8", "0x0040e814", "0x0040e934",
  "0x0040ea90", "0x0040ebb4", "0x0040ed04", "0x0040ee24", "0x0040ef30",
  "0x0040ef88", "0x0040efd8", "0x0040f028", "0x0040f078", "0x0040f0c8",
  "0x0041774a", "0x00417aac", "0x00423a20", "0x00428b74", "0x0046f6d7",
  "0x0047fbbd",
];

const RAW_CODE_RANGES = [
  ["effect-kind-dispatch-complete", 0x00413700, 0x00413b03,
    "9db8d0e66c796932913a99a0b602c50124b02b0a66923082a64afa6251bcdd4f"],
  ["shared-multi-cell-branch", 0x0041388b, 0x00413abd,
    "624d6cf5940aceffa60b7540aa0957baacc11fde72158ecb91b2c4427771713c"],
  ["exclusion-reset-complete", 0x00412ff0, 0x00412ffa,
    "e95173f43b2f191d97b75180dc67bc730eea7e5c326b821c128ae8da4f871894"],
  ["exclusion-contains-complete", 0x00413000, 0x00413032,
    "2540d564b87656101000fb1083e174c424f574f269efcefb6aa19240b4ad1d6e"],
  ["exclusion-append-complete", 0x00413040, 0x00413065,
    "5fc1d4027a65b4e23d3b49047744f52691036f16bcb496583ffc0e8e0fac3b63"],
  ["candidate-live-gate-complete", 0x00441e40, 0x00441e7b,
    "a43ab36d3a8ffdbe265feaad703c178ba7f3ce4ed4445b891ffd92a2faf69df0"],
  ["kind-2-caller-subtype-1-complete", 0x0040eab0, 0x0040ebc6,
    "fcc00f75ca0432a6de8b0b7b6657405d3e5dfbeca795195172f7b22af5a9ab95"],
  ["kind-2-caller-subtype-16-complete", 0x0040ee40, 0x0040ef42,
    "f36a5b1ed7b624082de61e19c04503760861e4b435d2937cfe3b5a4cc79dd4ba"],
].map(([id, start, endExclusive, digest]) => ({ id, start, endExclusive, sha256: digest }));

const FUNCTION_CATALOG = [
  ["0x00413700", 1027, 329, "8335ae650540b709ca72fd81b15f3270b41571f5bf26b960710f855c4e60d1eb"],
  ["0x00412ff0", 10, 2, "d8234eb3fda40816356baae08336db31aa19dab3f31312b3cb40e7bb916efe09"],
  ["0x00413000", 50, 18, "74e28462322be0b55bf16c17b0c9bd9162118cfb2e44ad9d61c01825b4773a76"],
  ["0x00413040", 37, 9, "004da08eeb362f7b3cf6f48b37ad8342c9097b3c75275c739edd79aa8282ba8a"],
  ["0x00441e40", 59, 19, "01b3c1652d8edf30a6c0dc948215f734475111fc734338603d847545c43e7cda"],
  ["0x00413b30", 686, 208, "5d58cb6970dae59ccb9ec512657baa1602977ee153db639453223baef2881e67"],
  ["0x00413070", 1470, 442, "72fa7cc42a95b6f8cdffa4d516ee9a0f3465e41789f47781a069f5c2161587c7"],
  ["0x0040eab0", 278, 90, "05fb97508df58af5ba747265afbfd0c4f31c46156a5c4ea827c93b9114adf92b"],
  ["0x0040ee40", 258, 83, "b36394f5656d7a6ff05b8c9d26a85d91b4c49d69943218919e2b5d9970dfea8b"],
].map(([entry, bodySize, instructionCount, instructionSha256]) => ({
  entry, bodySize, instructionCount, instructionSha256,
}));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(extractGenericMode1Kind2Enumeration(), null, 2));
}

export function extractGenericMode1Kind2Enumeration({
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
  const expectedHashes = {
    executable: EXPECTED_EXECUTABLE_SHA256,
    functions: EXPECTED_FUNCTIONS_SHA256,
    references: EXPECTED_REFERENCES_SHA256,
    jumpTables: EXPECTED_JUMP_TABLES_SHA256,
  };
  for (const [name, expected] of Object.entries(expectedHashes))
    assertEqual(sha256(sources[name]), expected, `${name} SHA-256`);

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

  const dispatcher = requireJumpTable(jumpTables, "0x00413700", "0x00413722");
  const sharedBranchKinds = dispatcher.cases
    .filter(({ destination }) => destination === "0x0041388b")
    .map(({ label }) => label);
  assertEqual(JSON.stringify(sharedBranchKinds), JSON.stringify(SHARED_BRANCH_KINDS),
    "shared branch effect kinds");

  const callerReferences = references.references
    .filter(({ to, type }) => to === "0x00413700" && type === "UNCONDITIONAL_CALL");
  assertEqual(JSON.stringify(callerReferences.map(({ from }) => from)), JSON.stringify(ALL_CALL_SITES),
    "FUN_00413700 complete direct caller set");

  const genericCallAddresses = new Set([
    "0x0041389b", "0x0041399c", "0x004139ad", "0x00413a4f", "0x00413a55",
  ]);
  const genericCalls = references.references.filter(({ from }) => genericCallAddresses.has(from));
  assertEqual(genericCalls.length, 5, "generic branch structured call count");

  const dataFromEntries = new Set([
    "0x00412ff0", "0x00413000", "0x00413040", "0x00413700", "0x00441e40",
  ]);
  const relevantDataReferences = references.references.filter((reference) =>
    dataFromEntries.has(reference.fromFunctionEntry)
    && ["DATA", "READ", "WRITE"].includes(reference.type)
    && (
      reference.fromFunctionEntry !== "0x00413700"
      || (parseAddress(reference.from) >= 0x0041388b && parseAddress(reference.from) < 0x00413abd)
    ))
    .map(({ from, to, type, fromFunctionEntry }) => ({ from, to, type, fromFunctionEntry }));
  assertEqual(
    JSON.stringify(relevantDataReferences),
    JSON.stringify(RELEVANT_DATA_REFERENCES),
    "generic branch/helper exact structured data references",
  );

  return {
    analysisStatus: "static-confirmed-generic-mode1-kind2-callback-boundary",
    reproductionStatus: "partial-reproduction-complete-enumeration-input-projection",
    implementationStatus: "analysis-only-no-product-change",
    sourceHashes: Object.fromEntries(Object.entries(sources).map(([name, bytes]) => [name, sha256(bytes)])),
    rawCodeRanges: RAW_CODE_RANGES.map((range) => verifyRawCodeRange(buffer, image, range)),
    functionCatalog,
    dispatcher: {
      table: dispatcher,
      sharedBranchAddress: "0x0041388b",
      sharedBranchKinds,
      promotedEffectKind: 2,
    },
    directCallers: {
      allCallSites: callerReferences.map(({ from }) => from),
      staticallyIdentifiedKind2CallSites: KIND_2_CALL_SITES,
      kind2CallerFunctionEntries: ["0x0040eab0", "0x0040ee40"],
      k01Mode1ProducerEstablished: false,
    },
    genericCalls,
    relevantDataReferences,
    argumentLayout: [
      ["sourceReferenceDword", "DWORD", "arg1"],
      ["sourceOwnerWord", "low signed WORD", "arg2"],
      ["effectKindWord", "low WORD", "arg3"],
      ["radiusWord", "low signed WORD, nonpositive normalized to 1", "arg4"],
      ["selectionModeWord", "low WORD, exact 1 selects map table", "arg5"],
      ["payloadWord", "low signed WORD", "arg6"],
      ["suppliedTargetReferenceDword", "DWORD; low WORD used by generic selection/override", "arg7"],
      ["centerXWord", "low signed WORD", "arg8"],
      ["centerYWord", "low signed WORD", "arg9"],
    ],
    conclusion: {
      enumeration:
        "reset exclusion count, then enumerate center and successive Chebyshev perimeters in ring/row-major order; skip coordinates outside 0<=x<width and 0<=y<height",
      selection:
        "selection mode WORD exactly 1 loads a candidate low index from map[x*180+y]; every other mode reuses the supplied target low index at each reached cell",
      callbackBoundary:
        "after live and exclusion checks, compute signed-WORD distance falloff, compare only candidate/supplied low WORD for the primary payload override, optionally halve for equal signed owners, reload the candidate current full active reference, call FUN_00413b30, then call FUN_00413040 regardless of the consumer return",
      generation:
        "the generic branch passes the current full active reference it just reloaded, so the downstream FUN_00413070 generation mismatch is structurally unreachable absent concurrent mutation; direct dispatcher branches such as kind 9 may pass a raw supplied full reference and retain that mismatch boundary",
      callbackResult:
        "FUN_00413b30 return and downstream state changes do not control enumeration and are outside this input/call-boundary projection",
    },
  };
}

export function enumerateChebyshevCells(input) {
  record(input, "input");
  const radiusInput = i16FromWord(input.radiusWord, "radiusWord");
  const radius = radiusInput <= 0 ? 1 : radiusInput;
  if (radius > 8) throw new RangeError("radiusWord exceeds promoted bounded maximum 8");
  const centerX = i16FromWord(input.centerXWord, "centerXWord");
  const centerY = i16FromWord(input.centerYWord, "centerYWord");
  const mapWidth = positiveBound(input.mapWidth, "mapWidth");
  const mapHeight = positiveBound(input.mapHeight, "mapHeight");
  const cells = [];
  for (let ring = 0; ring <= radius; ring += 1) {
    for (let dy = -ring; dy <= ring; dy += 1) {
      for (let dx = -ring; dx <= ring; dx += 1) {
        if (Math.abs(dy) !== ring && Math.abs(dx) !== ring) continue;
        const normalizedDx = Object.is(dx, -0) ? 0 : dx;
        const normalizedDy = Object.is(dy, -0) ? 0 : dy;
        const x = i16FromWord((centerX + dx) & 0xffff, "centerX+dx");
        const y = i16FromWord((centerY + dy) & 0xffff, "centerY+dy");
        cells.push({
          ring, dx: normalizedDx, dy: normalizedDy, x, y,
          inBounds: x >= 0 && x < mapWidth && y >= 0 && y < mapHeight,
        });
      }
    }
  }
  return { radiusInput, radius, centerX, centerY, mapWidth, mapHeight, cells };
}

export function evaluateCandidateLiveGate(input) {
  record(input, "input");
  const targetIndex = safeIndex(input.targetIndex, "targetIndex");
  const registryWord = u16(input.registryWord, "registryWord");
  if (registryWord === 0) return {
    targetIndex, registryWord, currentHealth: null, activeByte: null,
    live: false, reason: "registry-zero",
  };
  const currentHealth = i16FromWord(input.currentHealthWord, "currentHealthWord");
  if (currentHealth <= 0) return {
    targetIndex, registryWord, currentHealth, activeByte: null,
    live: false, reason: "health-nonpositive",
  };
  const activeByte = u8(input.activeByte, "activeByte");
  if (activeByte === 0) return {
    targetIndex, registryWord, currentHealth, activeByte,
    live: false, reason: "active-byte-zero",
  };
  return {
    targetIndex, registryWord, currentHealth, activeByte, live: true, reason: null,
  };
}

export function computeKind2Payload(input) {
  record(input, "input");
  const radius = i16FromWord(input.radiusWord, "radiusWord");
  if (radius <= 0) throw new RangeError("radiusWord must be normalized positive");
  const distance = nonnegative(input.distance, "distance");
  if (distance > radius) throw new RangeError("distance must not exceed radius");
  const targetIndex = safeIndex(input.targetIndex, "targetIndex");
  const payload = i16FromWord(input.payloadWord, "payloadWord");
  const falloffPercent = Math.trunc((distance * 100) / (radius + 1));
  const reduction = Math.trunc((falloffPercent * payload) / 100);
  const falloffPayload = payload - reduction;
  const suppliedTargetReferenceDword = u32(
    input.suppliedTargetReferenceDword, "suppliedTargetReferenceDword");
  const primaryLowIndexOverride = targetIndex === (suppliedTargetReferenceDword & 0xffff);
  const payloadAfterPrimaryOverride = primaryLowIndexOverride ? payload : falloffPayload;
  const targetOwnerSigned = i8(input.targetOwnerByte, "targetOwnerByte");
  const sourceOwnerSigned = i16FromWord(input.sourceOwnerWord, "sourceOwnerWord");
  const sameOwner = targetOwnerSigned === sourceOwnerSigned;
  return {
    radius, distance, falloffPercent, payload, reduction, falloffPayload,
    primaryLowIndexOverride, payloadAfterPrimaryOverride,
    sourceOwnerSigned, targetOwnerSigned, sameOwner,
    callbackPayload: sameOwner ? Math.trunc(payloadAfterPrimaryOverride / 2) : payloadAfterPrimaryOverride,
  };
}

export function reproduceExclusionHelpers(candidates) {
  if (!Array.isArray(candidates)) throw new TypeError("candidates must be an array");
  const list = [];
  const consumerCallOrder = [];
  const skippedDuplicates = [];
  const capacityRejectedAppends = [];
  candidates.forEach((value, index) => {
    const targetIndex = safeIndex(value, `candidates[${index}]`);
    const alreadyPresent = list.includes(targetIndex);
    if (alreadyPresent) {
      skippedDuplicates.push({ inputIndex: index, targetIndex });
      return;
    }
    consumerCallOrder.push(targetIndex);
    if (list.length < 30) list.push(targetIndex);
    else capacityRejectedAppends.push({ inputIndex: index, targetIndex });
  });
  return {
    resetCount: 0,
    capacity: 30,
    consumerCallOrder,
    skippedDuplicates,
    capacityRejectedAppends,
    finalCount: list.length,
    finalList: list,
  };
}

export function reproduceGenericKind2Enumeration(input) {
  record(input, "input");
  if (u16(input.effectKindWord, "effectKindWord") !== 2)
    throw new RangeError("effectKindWord must be exactly 2");
  const geometry = enumerateChebyshevCells(input);
  let reachedSelectionModeWord = null;
  const exclusion = [];
  const cellResults = [];
  const calls = [];
  for (const cell of geometry.cells) {
    const base = { ring: cell.ring, dx: cell.dx, dy: cell.dy, x: cell.x, y: cell.y };
    if (!cell.inBounds) {
      cellResults.push({ ...base, status: "out-of-bounds" });
      continue;
    }
    if (reachedSelectionModeWord === null)
      reachedSelectionModeWord = u16(input.selectionModeWord, "selectionModeWord");
    let targetIndex;
    let candidateSource;
    let mapLinearIndex;
    if (reachedSelectionModeWord === 1) {
      const mapCell = findReachedRecord(
        input.mapCells,
        "mapCells",
        ({ x, y }) => x === cell.x && y === cell.y,
        cellKey(cell),
      );
      targetIndex = safeIndex(mapCell.targetIndex, `mapCells ${cellKey(cell)}.targetIndex`);
      candidateSource = "map";
      mapLinearIndex = cell.x * 180 + cell.y;
    } else {
      const suppliedTargetReferenceDword = u32(
        input.suppliedTargetReferenceDword, "suppliedTargetReferenceDword");
      targetIndex = suppliedTargetReferenceDword & 0xffff;
      candidateSource = "supplied-target";
      mapLinearIndex = null;
    }
    const candidate = { targetIndex, candidateSource, mapLinearIndex };
    const entity = findReachedRecord(
      input.entities,
      "entities",
      (candidateEntity) => candidateEntity.targetIndex === targetIndex,
      `target ${targetIndex}`,
    );
    const liveGate = evaluateCandidateLiveGate({
      targetIndex,
      get registryWord() {
        return entity.registryWord;
      },
      get currentHealthWord() {
        return entity.currentHealthWord;
      },
      get activeByte() {
        return entity.activeByte;
      },
    });
    if (!liveGate.live) {
      cellResults.push({ ...base, ...candidate, status: "live-rejected",
        liveReason: liveGate.reason });
      continue;
    }
    if (exclusion.includes(targetIndex)) {
      cellResults.push({ ...base, ...candidate, status: "duplicate" });
      continue;
    }
    const payload = computeKind2Payload({
      radiusWord: geometry.radius,
      distance: Math.max(Math.abs(cell.dx), Math.abs(cell.dy)),
      targetIndex,
      get payloadWord() {
        return input.payloadWord;
      },
      get suppliedTargetReferenceDword() {
        return input.suppliedTargetReferenceDword;
      },
      get targetOwnerByte() {
        return entity.ownerByte;
      },
      get sourceOwnerWord() {
        return input.sourceOwnerWord;
      },
    });
    const currentActiveReferenceDword = u32(
      entity.currentActiveReferenceDword, "currentActiveReferenceDword");
    const sourceReferenceDword = u32(input.sourceReferenceDword, "sourceReferenceDword");
    const appended = exclusion.length < 30;
    calls.push({
      callIndex: calls.length,
      cell: { ring: cell.ring, x: cell.x, y: cell.y },
      targetIndex,
      currentActiveReferenceDword,
      payload,
      consumerArguments: {
        sourceReferenceDword,
        targetReferenceDword: currentActiveReferenceDword,
        sourceOwnerSigned: payload.sourceOwnerSigned,
        effectKindWord: 2,
        payloadSignedWord: payload.callbackPayload,
      },
      consumerReturnUsed: false,
      postConsumerAppend: { appended, countAfter: appended ? exclusion.length + 1 : exclusion.length },
    });
    if (appended) exclusion.push(targetIndex);
    cellResults.push({ ...base, ...candidate, status: "consumer-called",
      appended });
  }
  return {
    effectKindWord: 2,
    selectionModeWord: reachedSelectionModeWord,
    normalizedRadius: geometry.radius,
    resetExclusionCount: 0,
    cellResults,
    calls,
    finalExclusionCount: exclusion.length,
    finalExclusionList: exclusion,
    returnWord: 0,
  };
}

function parseJson(bytes, path) {
  try {
    return JSON.parse(bytes);
  } catch (error) {
    throw new Error(`Cannot parse static-analysis JSON ${path}: ${error.message}`, { cause: error });
  }
}

function requireJumpTable(document, functionEntry, switchAddress) {
  const table = document.tables?.find((candidate) =>
    candidate.functionEntry === functionEntry && candidate.switchAddress === switchAddress);
  if (!table) throw new Error(`jump-tables.json missing ${functionEntry} ${switchAddress}`);
  return table;
}

function parseAddress(value) {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/u.test(value))
    throw new TypeError(`invalid address ${String(value)}`);
  return Number.parseInt(value.slice(2), 16);
}

function record(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${label} must be an object`);
}

function u8(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xff)
    throw new RangeError(`${label} must be an unsigned BYTE`);
  return value;
}

function u16(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff)
    throw new RangeError(`${label} must be an unsigned WORD`);
  return value;
}

function u32(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff)
    throw new RangeError(`${label} must be an unsigned DWORD`);
  return value >>> 0;
}

function i8(value, label) {
  const raw = u8(value, label);
  return raw >= 0x80 ? raw - 0x100 : raw;
}

function i16FromWord(value, label) {
  const raw = u16(value, label);
  return raw >= 0x8000 ? raw - 0x10000 : raw;
}

function positiveBound(value, label) {
  if (!Number.isInteger(value) || value <= 0 || value > 32767)
    throw new RangeError(`${label} must be in 1..32767`);
  return value;
}

function nonnegative(value, label) {
  if (!Number.isInteger(value) || value < 0)
    throw new RangeError(`${label} must be a nonnegative integer`);
  return value;
}

function safeIndex(value, label) {
  const index = u16(value, label);
  if (index > 32767) throw new RangeError(`${label} exceeds promoted nonnegative index boundary`);
  return index;
}

function cellKey({ x, y }) {
  return `${x},${y}`;
}

function findReachedRecord(values, label, matches, reachedKey) {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array on a reached path`);
  const found = values.filter((value) =>
    value !== null && typeof value === "object" && !Array.isArray(value) && matches(value));
  if (found.length === 0)
    throw new RangeError(`${label} ${reachedKey} is required by a reached path`);
  if (found.length > 1)
    throw new RangeError(`${label} contains duplicate reached key ${reachedKey}`);
  return found[0];
}
