#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractEntityTypeCatalog } from "./extract-entity-type-catalog.mjs";
import { readPeImage, toHex } from "./pe-image.mjs";

const EXPECTED_EXE_SHA256 = "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_FUNCTIONS_PATH = "analysis/generated/imjinrok2/functions.json";
const DEFAULT_REFERENCES_PATH = "analysis/generated/imjinrok2/references.json";
const DEFAULT_JUMP_TABLES_PATH = "analysis/generated/imjinrok2/jump-tables.json";
const DEFAULT_SEEDS_PATH = "analysis/generated/imjinrok2/seeds.json";

const FUNCTION_CONTRACTS = [
  ["0x0043c9c0", 684, "eb1c7c21a9af5a2099a2d716ad1253db65fff75ef0befcae871e3462f4d3bcfa"],
  ["0x00416c60", 2, "93ad3160226d88c5054de0873c15e8ee92753a82d1e1e91c1376c9268c749803"],
  ["0x00416c70", 555, "1aa33927309774ef7f107445f4678d1ffa5998447b7b76f2e7bd51d9f297ba57"],
  ["0x00416ad0", 96, "c197dbc091a4dfa8bb04eae17b055cbb82ff736cf6477f5be6f5c6333a8b59ff"],
  ["0x00425af0", 11, "272a5455b2f3c25d58ce435d1823c517615c8b739dc4952c8aec1f8cb03ce29c"],
  ["0x00425b20", 506, "088a31ecaf83338b1823a4a21e14bb859690289d56f8bc53338145492a8e24c7"],
  ["0x004262e0", 256, "4f570bc4b850c47ad406d5f9b5e6e3dace6ac2085bba150eb3b212c473265034"],
  ["0x0043d450", 10, "68070666ba954c3ee6d0b5fc857e6bdbb5fe86416ad724e22eb1986cc0724ced"],
  ["0x004381c0", 84, "3bda3c12b28b9cd641aa3d8af3d133754554800f3212d45c778e538ea022be4d"],
];

const CALL_EDGES = [
  [0x0043d168, 0x0043c9c0, 0x00416c70],
  [0x00416f5f, 0x00416c70, 0x00416ad0],
  [0x004171ef, 0x00416c70, 0x00425af0],
  [0x004172a3, 0x00416c70, 0x00425af0],
  [0x00425b01, 0x00425af0, 0x004262e0],
  [0x00425b09, 0x00425af0, 0x00425b20],
  [0x00416b1c, 0x00416ad0, 0x0043d450],
  [0x00416b44, 0x00416ad0, 0x0043d450],
  [0x00416bc8, 0x00416ad0, 0x0043d450],
  [0x00416beb, 0x00416ad0, 0x0043d450],
  [0x00416c48, 0x00416ad0, 0x0043d450],
  [0x00425ec9, 0x00425b20, 0x0043d450],
  [0x0042649f, 0x004262e0, 0x0043d450],
  [0x0043d45e, 0x0043d450, 0x004381c0],
];

const ANCHORS = [
  ["action-five-dispatch", 0x0043cd88, "0f bf 86 b0 01 00 00 8d 48 ff 83 f9 44 0f 87 87 05 00 00 33 d2 8a 91 08 d4 43 00 ff 24 95 60 d3 43 00", "WORD +0x1b0 selects the entity action case"],
  ["action-five-call-gate", 0x0043d153, "8b ce e8 76 e1 ff ff 8b ce e8 ff 9a fd ff 83 f8 01 75 07 8b ce e8 03 9b fd ff", "case 5 calls 0x00416c70 only when 0x00416c60 returns one"],
  ["basic-action-substate-switch", 0x00416d23, "8b 86 88 00 00 00 48 83 f8 04 0f 87 45 06 00 00 ff 24 85 80 73 41 00", "DWORD +0x88 accepts only selectors 1..5"],
  ["substate-one-precheck-call", 0x00416f58, "66 89 86 ea 01 00 00 e8 6c fb ff ff 85 c0", "substate 1 writes target WORD +0x1ea then calls the precheck"],
  ["precheck-mode-dispatch", 0x00416ad0, "33 c0 8a 41 37 83 c0 fb 83 f8 20 77 23 33 d2 8a 90 68 6b 41 00 ff 24 95 54 6b 41 00", "BYTE +0x37 in 5..37 selects the compact precheck mode table"],
  ["precheck-fallback-guards", 0x00416b00, "8b 41 74 a9 00 00 00 80 74 2e 8a 81 e8 00 00 00 84 c0 66 8b 81 ea 01 00 00 75 0b", "fallback guards the wrapper by high flag, BYTE +0xe8, and target comparison"],
  ["precheck-wrapper-sites", 0x00416bc0, "66 8b 81 ea 01 00 00 50 e8 83 68 02 00 f7 d8 1b c0 f7 d8 c3", "mode 3 calls the wrapper; the other mode call sites are separately call-edge bound"],
  ["movement-variant-dispatch", 0x00425af0, "8a 41 74 8b 54 24 04 a8 08 8b 44 24 08 50 52 74 08 e8 da 07 00 00 c2 08 00 e8 12 00 00 00 c2 08 00", "flag bit 0x08 selects the two movement variants"],
  ["normal-movement-wrapper-guard", 0x00425ec2, "3b fb 74 16 57 8b ce e8 82 75 01 00 85 c0 75 0a", "normal variant calls the wrapper only for a nonzero steering direction"],
  ["special-movement-wrapper-call", 0x00426491, "8b 44 24 2c 8b ce 50 66 89 96 e0 01 00 00 e8 ac 6f 01 00 85 c0", "bit-0x08 variant writes +0x1e0 then calls the wrapper"],
  ["turn-wrapper-special-gate", 0x0043d450, "f7 41 74 08 00 00 80 74 0d 8b 44 24 04 50 e8 5d ad ff ff c2 04 00", "flags&0x80000008 selects 0x004381c0"],
];

const EXPECTED_PRECHECK_MODES = [
  0, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1,
  4, 4, 4, 4, 4, 4, 4, 4, 2, 4, 4,
  4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 3,
];
const EXPECTED_LOCAL_SELECTOR_DESTINATIONS = [
  0x00416d3a, 0x00417359, 0x00417333, 0x004171e3, 0x0041729c,
];

export function extractK01TurtleTankActionReachability({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  functionsPath = DEFAULT_FUNCTIONS_PATH,
  referencesPath = DEFAULT_REFERENCES_PATH,
  jumpTablesPath = DEFAULT_JUMP_TABLES_PATH,
  seedsPath = DEFAULT_SEEDS_PATH,
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  const sourceSha256 = sha256(buffer);
  assertEqual(sourceSha256, EXPECTED_EXE_SHA256, "original EXE SHA-256");
  const functions = readArtifact(functionsPath, sourceSha256, "functions");
  const references = readArtifact(referencesPath, sourceSha256, "references");
  const jumpTables = readArtifact(jumpTablesPath, sourceSha256, "jump tables");
  const typeCatalog = extractEntityTypeCatalog({ executablePath, seedsPath });
  const class14 = requireClass14(typeCatalog);
  const precheckModes = readPrecheckModes(buffer, image);
  const localActionSelectors = readLocalActionSelectors(buffer, image);

  return {
    question: "For original K01 class 14 Japanese turtle tank, which action-state paths reach the 16-ring turn wrapper, and which guards, no-op, and failure branches stop them?",
    source: { executablePath, sha256: sourceSha256 },
    analysisStatus: "static-confirmed",
    reproductionStatus: "reproduction-complete",
    implementationStatus: "none-analysis-only",
    exactScope: "entity action WORD +0x1b0=5 through its local DWORD +0x88 selectors and the seven direct wrapper calls; scheduler cadence and combat semantics outside these reachability guards are excluded",
    functionEvidence: FUNCTION_CONTRACTS.map(([entry, count, hash]) => requireFunction(functions.functions, entry, count, hash)),
    callEdges: CALL_EDGES.map(([callsite, caller, callee]) => requireCallEdge(references.references, callsite, caller, callee)),
    codeAnchors: ANCHORS.map(([id, va, bytes, meaning]) => validateAnchor(buffer, image, { id, va, bytes, meaning })),
    actionFive: requireActionFive(jumpTables),
    class14,
    localActionSelectors,
    precheckModes,
    reachingPaths: [
      "selector 1 -> 0x00416ee8 -> 0x00416f5f -> 0x00416ad0: +0x37 values 15, 24, and 37 use dedicated wrapper sites; all other values use the fallback guard",
      "selector 4 -> 0x004171ef -> 0x00425af0: bit +0x74&0x08 selects normal 0x00425b20 or bit-0x08 0x004262e0 movement variant",
      "selector 5 -> 0x004172a3 -> 0x00425af0: the same two movement variants and wrapper guards",
    ],
    turnWrapper: {
      entry: "0x0043d450",
      specialGuard: "DWORD +0x74 & 0x80000008 != 0",
      ringCallee: "0x004381c0",
      normalCallee: "0x004381a0",
      class14CreationDefault: "0x80143205 & 0x80000008 = 0x80000000, so creation-default class 14 selects the ring callee whenever it reaches the wrapper",
      mutationBoundary: "later writes to runtime +0x74 are not closed here; a wrapper call with a cleared special mask is a normal-direction write, not a 16-ring invocation",
    },
    testVectors: createVectors(),
    unresolvedBoundary: "The byte +0x37 and the helper-return predicates are deliberately left role-neutral; this unit proves their exact reachability effect but does not rename them as gameplay commands or claim every producer of action 5/substate values.",
  };
}

export function replayTurtleTankActionFiveReachability({
  action = 5,
  actionGate = true,
  localSelector,
  route,
  flags = 0x80143205,
  precheckMode = 0,
  precheckE8 = 0,
  targetMatches11a = false,
  activeBit = true,
  readiness = true,
  steeringDirectionNonzero = true,
  wrapperReturn = 0,
}) {
  if (action !== 5) return outcome("action-not-five");
  if (!actionGate) return outcome("action-five-gate-returned-not-one");
  if (![1, 2, 3, 4, 5].includes(localSelector)) return outcome("local-selector-out-of-range");
  if ([2, 3].includes(localSelector)) return outcome("local-selector-has-no-wrapper-call");
  if (route === "precheck") return replayPrecheck({ localSelector, flags, precheckMode, precheckE8, targetMatches11a, wrapperReturn });
  if (route === "movement") return replayMovement({ localSelector, flags, activeBit, readiness, steeringDirectionNonzero, wrapperReturn });
  throw new TypeError("route must be precheck or movement");
}

function replayPrecheck({ localSelector, flags, precheckMode, precheckE8, targetMatches11a, wrapperReturn }) {
  if (localSelector !== 1) return outcome("precheck-only-occurs-from-local-selector-one");
  if ([15, 24, 37].includes(precheckMode)) return wrapperOutcome(`precheck-mode-${precheckMode}`, flags, wrapperReturn);
  if ((flags & 0x80000000) !== 0) {
    if (precheckE8 === 0) return wrapperOutcome("precheck-fallback-high-flag-e8-zero", flags, wrapperReturn);
    return outcome(targetMatches11a ? "precheck-fallback-target-already-matches" : "precheck-fallback-e8-target-mismatch");
  }
  if ((flags & 0x2) !== 0) return outcome("precheck-fallback-flag-bit-0x02");
  return wrapperOutcome("precheck-fallback-low-flag", flags, wrapperReturn);
}

function replayMovement({ localSelector, flags, activeBit, readiness, steeringDirectionNonzero, wrapperReturn }) {
  if (![4, 5].includes(localSelector)) return outcome("movement-only-occurs-from-local-selector-four-or-five");
  if (!activeBit) return outcome("movement-active-bit-clear");
  if (!readiness) return outcome("movement-readiness-returned-zero");
  if ((flags & 0x8) !== 0) return wrapperOutcome("movement-bit-0x08-variant", flags, wrapperReturn);
  if (!steeringDirectionNonzero) return outcome("normal-movement-zero-steering-direction");
  return wrapperOutcome("normal-movement-nonzero-steering-direction", flags, wrapperReturn);
}

function wrapperOutcome(path, flags, wrapperReturn) {
  const invokesRing = (flags & 0x80000008) !== 0;
  return { wrapperCalls: 1, invokesRing, path, wrapperReturn, continuation: wrapperReturn === 0 ? "wrapper-returned-zero" : "wrapper-returned-nonzero" };
}

function outcome(path) { return { wrapperCalls: 0, invokesRing: false, path, wrapperReturn: null, continuation: "no-wrapper" }; }

function createVectors() {
  return [
    { id: "non-five-action", result: replayTurtleTankActionFiveReachability({ action: 4, localSelector: 1, route: "precheck" }) },
    { id: "selector-one-mode-15-reaches-ring", result: replayTurtleTankActionFiveReachability({ localSelector: 1, route: "precheck", precheckMode: 15 }) },
    { id: "selector-one-fallback-e8-blocks", result: replayTurtleTankActionFiveReachability({ localSelector: 1, route: "precheck", precheckMode: 6, precheckE8: 1, targetMatches11a: false }) },
    { id: "selector-four-normal-zero-steering", result: replayTurtleTankActionFiveReachability({ localSelector: 4, route: "movement", flags: 0x80143205, steeringDirectionNonzero: false }) },
    { id: "selector-four-bit8-reaches-ring", result: replayTurtleTankActionFiveReachability({ localSelector: 4, route: "movement", flags: 0x8014320d, wrapperReturn: 0 }) },
    { id: "selector-five-normal-reaches-ring", result: replayTurtleTankActionFiveReachability({ localSelector: 5, route: "movement", wrapperReturn: 1 }) },
    { id: "selector-two-no-wrapper", result: replayTurtleTankActionFiveReachability({ localSelector: 2, route: "movement" }) },
    { id: "wrapper-special-mask-cleared", result: replayTurtleTankActionFiveReachability({ localSelector: 5, route: "movement", flags: 0x00000001 }) },
  ];
}

function requireClass14(typeCatalog) {
  const type = typeCatalog.types.find(({ internalClass }) => internalClass === 14);
  if (!type) throw new Error("type catalog is missing class 14");
  assertEqual(type.definition.recordAddress, "0x00884038", "class 14 type record address");
  assertEqual(type.definition.flags, "0x80143205", "class 14 raw flags");
  return { internalClass: 14, typeRecordAddress: type.definition.recordAddress, rawFlags: type.definition.flags, flagsField: "+0x74 DWORD", specialMask: "0x80000008" };
}

function readPrecheckModes(buffer, image) {
  const rawOffset = image.vaToRawOffset(0x00416b68);
  if (rawOffset === undefined) throw new Error("precheck mode table is not file-backed");
  const bytes = [...buffer.subarray(rawOffset, rawOffset + EXPECTED_PRECHECK_MODES.length)];
  if (JSON.stringify(bytes) !== JSON.stringify(EXPECTED_PRECHECK_MODES)) throw new Error("precheck mode table mismatch at 0x00416b68");
  return { dataRange: "0x00416b68-0x00416b88", field: "+0x37 BYTE", values: bytes.map((mode, index) => ({ value: index + 5, mode })), outsideRangeMode: 4 };
}

function readLocalActionSelectors(buffer, image) {
  const rawOffset = image.vaToRawOffset(0x00417380);
  if (rawOffset === undefined) throw new Error("local selector jump table is not file-backed");
  const destinations = EXPECTED_LOCAL_SELECTOR_DESTINATIONS.map((_, index) => buffer.readUInt32LE(rawOffset + index * 4));
  if (JSON.stringify(destinations) !== JSON.stringify(EXPECTED_LOCAL_SELECTOR_DESTINATIONS)) throw new Error("local selector jump table mismatch at 0x00417380");
  return {
    field: "+0x88 DWORD",
    jumpTable: "0x00417380-0x00417393",
    cases: Object.fromEntries(destinations.map((destination, index) => [index + 1, toHex(destination)])),
    noWrapperCases: [2, 3],
    invalidSelector: "<1 or >5 returns at 0x00417378 without a wrapper call",
  };
}

function readArtifact(path, sourceSha256, label) {
  const artifact = JSON.parse(readFileSync(resolve(path), "utf8"));
  assertEqual(artifact.sourceSha256, sourceSha256, `${label} source SHA-256`);
  return artifact;
}

function requireFunction(functions, entry, count, hash) {
  const found = functions.find((candidate) => candidate.entry === entry);
  if (!found) throw new Error(`functions artifact is missing ${entry}`);
  assertEqual(found.instructionCount, count, `${entry} instruction count`);
  assertEqual(found.instructionSha256, hash, `${entry} instruction SHA-256`);
  return { entry, bodyRanges: found.bodyRanges, instructionCount: count, instructionSha256: hash };
}

function requireCallEdge(references, callsite, caller, callee) {
  const match = references.find((reference) =>
    reference.type.endsWith("CALL")
      && reference.from === toHex(callsite)
      && reference.fromFunctionEntry === toHex(caller)
      && reference.to === toHex(callee),
  );
  if (!match) throw new Error(`required call edge ${toHex(callsite)} is missing`);
  return { callsite: match.from, caller: match.fromFunctionEntry, callee: match.to };
}

function requireActionFive(jumpTables) {
  const table = Object.values(jumpTables.tables).find((candidate) =>
    candidate.functionEntry === "0x0043c9c0" && candidate.switchAddress === "0x0043cda3",
  );
  const destination = table?.cases.find((entry) => entry.label === 5)?.destination;
  assertEqual(destination, "0x0043d153", "action 5 destination");
  return { switchAddress: table.switchAddress, action: 5, destination };
}

function validateAnchor(buffer, image, { id, va, bytes, meaning }) {
  const rawOffset = image.vaToRawOffset(va);
  if (rawOffset === undefined) throw new RangeError(`${toHex(va)} is not file-backed`);
  const expected = Buffer.from(bytes.replaceAll(" ", ""), "hex");
  const actual = buffer.subarray(rawOffset, rawOffset + expected.length);
  if (Buffer.compare(actual, expected) !== 0) {
    throw new Error(`code anchor ${id} mismatch at ${toHex(va)}`);
  }
  return { id, va: toHex(va), rawOffset: toHex(rawOffset), bytes, meaning, matched: true };
}
function sha256(buffer) { return createHash("sha256").update(buffer).digest("hex"); }
function assertEqual(actual, expected, label) { if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.stdout.write(`${JSON.stringify(extractK01TurtleTankActionReachability(), null, 2)}\n`);
