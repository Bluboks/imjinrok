#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readCString, readPeImage } from "./pe-image.mjs";
import { assertEqual, sha256, verifyEvidencePoint, verifyRawCodeRange } from "./static-evidence.mjs";

export const EXPECTED_EXECUTABLE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_FUNCTIONS_SHA256 =
  "7e071fdfe425d22447780c265fe1d3fd271a1bedd1773682bebcb8ddc6d2e16e";
export const EXPECTED_REFERENCES_SHA256 =
  "f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5";
export const EXPECTED_CATALOG_SHA256 =
  "485344664b278c97a4ceed0756832abadbf2a71bd4a997b117b85c336d620708";
export const EXPECTED_CATALOG_SCHEMA_VERSION = 2;

const DEFAULT_FUNCTIONS_PATH = "analysis/generated/imjinrok2/functions.json";
const DEFAULT_REFERENCES_PATH = "analysis/generated/imjinrok2/references.json";
const DEFAULT_CATALOG_PATH = "analysis/generated/entity-type-catalog.json";

const RAW_CODE_RANGES = [
  ["demolition-update", 0x0041aa90, 0x0041ad8c, "cfba88acf96779624d7448c490e1db98f82a3a9fe82dfa72cae14f472d14db23"],
  ["progress-decrement", 0x00438090, 0x004380f1, "c2bf94e1b787f46fa3b5ecc05694869962746a36f3a9890e0bba52270fc189ec"],
  ["action-13-dispatch-arm", 0x004271c0, 0x00427271, "3ccc22bca8af3e6d7761385860dd9ac8ee797f21c5856da518f937fc0b9d4f60"],
  ["action-13-tick-arm", 0x0043d276, 0x0043d289, "e09b7dd04eb66eebc145e9b84fe76d446dc899ec6f5696e3503ad361446aa655"],
  ["action-13-command-record", 0x00457787, 0x004577a2, "ab2cb4d685a27b358363d0b272d043ec7f6c0e1fef32771a27e8b095240aaa41"],
].map(([id, start, endExclusive, digest]) => ({ id, start, endExclusive, sha256: digest }));

const STATIC_EVIDENCE = [
  [0x00457787, "6a 00 68 88 4b aa 00 6a 64 6a 44 6a 00 6a 0d 6a 0d b9 90 3f 5e 00 e8 1e ff ff ff", "command record binds action 13, button.spr frame 13, runtime label 0x00aa4b88, and enabled flag zero"],
  [0x0048f2df, "bf fc 84 4c 00", "common message initialization reads the CP949 source label at 0x004c84fc"],
  [0x004c7764, "b0 c7 b9 b0 c0 bb 20 c7 d8 c3 bc c7 cf bf a9 20 be f8 be db b4 cf b4 d9 2e 00", "complete CP949 help string is 건물을 해체하여 없앱니다. including its terminator"],
  [0x0041aa96, "6a 0d e8 e3 37 01 00", "demolition update invokes FUN_0042e280 with action 13"],
  [0x0041aaa3, "c6 46 03 0c 80 f9 0a", "demolition reads progress byte +0x8c before phase thresholds"],
  [0x0041ab57, "66 89 86 b2 01 00 00 66 89 46 34 c6 46 04 01", "a changed visual phase writes +0x1b2, +0x34, and marks visual state dirty"],
  [0x0041ab66, "84 c9 0f 8f f9 01 00 00", "positive progress takes the decrement path; zero-or-negative takes completion"],
  [0x0041aba6, "81 c1 80 c4 82 00 e8 4f 37 06 00", "completion calls FUN_0047e300 with the owner player record after deriving resource values"],
  [0x0041abbf, "f6 04 85 30 2e 88 00 10 0f 84 90 01 00 00", "only type flags bit 0x10 takes the transformation path"],
  [0x0041ace4, "51 e8 b6 8d 06 00", "flag-0x10 completion removes the old entity through FUN_00483aa0"],
  [0x0041ad04, "6a 00 6a 01 50 51 52 6a 4b e8 3e 8f 06 00", "flag-0x10 completion constructs internal class 75 through FUN_00483c50"],
  [0x0041ad67, "80 f9 02 7c 10 6a 02 8b ce e8 1b d3 01 00", "progress at least two invokes FUN_00438090 with decrement two"],
  [0x0041ad7c, "6a 01 8b ce e8 0b d3 01 00", "progress one invokes FUN_00438090 with decrement one"],
  [0x00438090, "8a 81 8c 00 00 00 66 8b 54 24 04", "progress helper reads byte +0x8c and WORD decrement argument"],
  [0x004380a6, "2a c2 0f bf 51 3c 88 81 8c 00 00 00", "non-completing decrement subtracts delta and writes progress byte +0x8c"],
  [0x004380b2, "0f be c0 0f af d0 b8 1f 85 eb 51 f7 ea c1 fa 05 8b c2 c1 e8 1f 03 d0", "helper computes truncTowardZero(maximum +0x3c times progress / 100)"],
  [0x004380c9, "66 85 d2 7f 05 ba 01 00 00 00 66 39 51 3e 7e 04 66 89 51 3e", "computed health is clamped to at least one and only lowers current +0x3e"],
  [0x004380e2, "c6 81 8c 00 00 00 00 b8 01 00 00 00", "when progress is below delta, helper zeroes +0x8c and returns completion one"],
  [0x004271c0, "8b ce 66 89 ae b2 01 00 00 e8 22 fa ff ff", "action-13 command arm clears visual substate then calls the common command reset helper"],
  [0x004271ce, "66 8b 0f 8b 96 6c 02 00 00 8b 86 70 02 00 00 66 89 8e b0 01 00 00", "action-13 arm copies queued action into entity +0x1b0"],
  [0x00427232, "81 c6 f2 03 00 00 bd 02 00 00 00", "action-13 arm iterates two linked identifiers beginning at entity +0x3f2"],
  [0x0043d276, "8b ce e8 53 e0 ff ff 8b ce e8 0c d8 fd ff", "main entity update dispatches action 13 through cleanup then FUN_0041aa90"],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

const EXPECTED_FUNCTIONS = [
  ["0x0041aa90", "0x0041aa90-0x0041ad8b", 219, "96ccb30ff66351650eba02fea5ab898146f1a08301bd7019d379272f9ef755fa"],
  ["0x00438090", "0x00438090-0x004380f0", 29, "a9a8555faca0bcaa320ab0f5af815c4ea871a198953b0f8624e603f5199b9d7e"],
  ["0x00426c20", "0x00426c20-0x00428154", 1428, "95c3358341e594a04aef234beb0838edc8bb296bd6a691ff41b376d9e4f8452c"],
  ["0x0043c9c0", "0x0043c9c0-0x0043d35f", 684, "eb1c7c21a9af5a2099a2d716ad1253db65fff75ef0befcae871e3462f4d3bcfa"],
  ["0x00483aa0", "0x00483aa0-0x00483c2e", 95, "f9b1728467f73a29667e631456c36d26eda15b6f44e8c89b78c6b1ec25f27be9"],
  ["0x00483c50", "0x00483c50-0x00483c9f", 26, "d33ed40b3a614bcc92bc4b3b429dd372e61b4ef6ccb03b290feffd80c7a9ab4e"],
].map(([entry, bodyRange, instructionCount, instructionSha256]) => ({ entry, bodyRange, instructionCount, instructionSha256 }));

const VECTORS = [
  { id: "phase-boundaries", operation: "phase", progress: [0, 9, 10, 19, 20, 29, 30, 39, 40, 49, 50, 69, 70, 99, 100] },
  { id: "decrement-two-noncompletion", operation: "decrement", state: { progress: 3, maximumHealth: 1000, currentHealth: 1000 }, delta: 2 },
  { id: "decrement-one-last-step", operation: "decrement", state: { progress: 1, maximumHealth: 1000, currentHealth: 1000 }, delta: 1 },
  { id: "decrement-underflow-completion", operation: "decrement", state: { progress: 1, maximumHealth: 1000, currentHealth: 7 }, delta: 2 },
  { id: "minimum-health-and-no-increase", operation: "decrement", state: { progress: 2, maximumHealth: 10, currentHealth: 1 }, delta: 2 },
  { id: "nonship-completion-refund", operation: "complete", typeFlags: 0, state: { grain: 30, wood: 40, typeGrainCost: 70, typeWoodCost: 80, entityIdentifier: 5, owner: 1 } },
  { id: "ship-completion-refund-and-transform", operation: "complete", typeFlags: 0x10, state: { grain: 30, wood: 40, typeGrainCost: 70, typeWoodCost: 80, entityIdentifier: 5, owner: 1, originX: 20, originY: 30, eligibleCells: [{ x: 19, y: 30 }, { x: 21, y: 30 }, { x: 20, y: 29 }] } },
  { id: "ship-strict-tie-keeps-first-candidate", operation: "complete", typeFlags: 0x10, state: { grain: 0, wood: 0, typeGrainCost: 0, typeWoodCost: 0, entityIdentifier: 5, owner: 1, originX: 20, originY: 30, eligibleCells: [{ x: 19, y: 30 }, { x: 21, y: 30 }] } },
];

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputPath = readOutputPath(process.argv.slice(2));
  const report = extractBuildingDemolitionEvidence();
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath) writeFileSync(outputPath, text);
  else process.stdout.write(text);
}

export function extractBuildingDemolitionEvidence({
  executablePath = "original/imjinrok2/imjinrok2.exe",
  functionsPath = DEFAULT_FUNCTIONS_PATH,
  referencesPath = DEFAULT_REFERENCES_PATH,
  catalogPath = DEFAULT_CATALOG_PATH,
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  assertEqual(sha256(buffer), EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);
  const functionsBytes = readFileSync(functionsPath);
  const referencesBytes = readFileSync(referencesPath);
  const catalogBytes = readFileSync(catalogPath);
  assertEqual(sha256(functionsBytes), EXPECTED_FUNCTIONS_SHA256, `${functionsPath} SHA-256`);
  assertEqual(sha256(referencesBytes), EXPECTED_REFERENCES_SHA256, `${referencesPath} SHA-256`);
  assertEqual(sha256(catalogBytes), EXPECTED_CATALOG_SHA256, `${catalogPath} SHA-256`);
  const functions = parseJson(functionsBytes, functionsPath).functions;
  const references = parseJson(referencesBytes, referencesPath).references;
  const catalog = parseJson(catalogBytes, catalogPath);
  assertEqual(catalog.schemaVersion, EXPECTED_CATALOG_SCHEMA_VERSION, `${catalogPath} schema version`);
  const shipTypes = deriveShipTypes(catalog);
  verifyReferenceSet(references);
  const helpCStringBytes = readFullCStringBytes(buffer, requireRawOffset(image, 0x004c7764));
  assertEqual(sha256(helpCStringBytes), "1bc5358ae5413b83c49d2b0151d0b3aaa5115e9d4b924e6eb8d6ccb1b4a85dd5", "demolition help CString SHA-256");

  return {
    schemaVersion: 1,
    question: "Which original action-13 paths decrement demolition progress, select the visual phase, refund resources, and apply the flags-0x10 transformation?",
    statuses: {
      analysis: "static-confirmed-for-bounded-action-13-progress-refund-and-ship-transform",
      reproduction: "reproduction-complete-for-phase-decrement-refund-and-ship-boundary-vectors",
      implementation: "analysis-only-no-gameplay-change",
    },
    source: {
      executable: { path: executablePath, sha256: EXPECTED_EXECUTABLE_SHA256 },
      functions: { path: functionsPath, sha256: EXPECTED_FUNCTIONS_SHA256, verified: EXPECTED_FUNCTIONS.map((expected) => verifyFunction(functions, expected)) },
      references: { path: referencesPath, sha256: EXPECTED_REFERENCES_SHA256 },
      entityTypeCatalog: { path: catalogPath, sha256: EXPECTED_CATALOG_SHA256, schemaVersion: EXPECTED_CATALOG_SCHEMA_VERSION },
    },
    rawCodeRanges: RAW_CODE_RANGES.map((range) => verifyRawCodeRange(buffer, image, range)),
    evidencePoints: STATIC_EVIDENCE.map((point) => verifyEvidencePoint(buffer, image, point)),
    labels: {
      label: readCp949CString(buffer, image, 0x004c84fc),
      labelSourceVa: "0x004c84fc",
      runtimeLabelVa: "0x00aa4b88",
      help: readCp949CString(buffer, image, 0x004c7764),
      helpSourceVa: "0x004c7764",
      helpCStringSha256: "1bc5358ae5413b83c49d2b0151d0b3aaa5115e9d4b924e6eb8d6ccb1b4a85dd5",
      action: 13,
      buttonSpriteFrame: 13,
    },
    fields: {
      progress: { offset: "+0x8c", width: "BYTE" },
      maximumHealth: { offset: "+0x3c", width: "signed WORD" },
      currentHealth: { offset: "+0x3e", width: "signed WORD" },
      action: { offset: "+0x1b0", width: "signed WORD" },
      visualPhase: { offset: "+0x1b2", width: "signed WORD" },
      linkedIdentifiers: { offset: "+0x3f2", count: 2, width: "DWORD" },
    },
    phaseThresholds: [
      { lessThan: 10, phase: 0 }, { lessThan: 20, phase: 1 }, { lessThan: 30, phase: 2 }, { lessThan: 40, phase: 3 },
      { lessThan: 50, phase: 4 }, { lessThan: 70, phase: 5 }, { lessThan: 100, phase: 6 }, { otherwise: true, phase: 7 },
    ],
    completion: {
      refund: "FUN_0047e300 receives type +0x10 grain cost, type +0x12 wood cost, and zero pending-war-expense delta.",
      nonFlag0x10: "returns after full grain/wood refund; this bounded analysis does not name the broader deletion/UI lifecycle.",
      flag0x10: {
        exactClasses: shipTypes,
        path: "removes the old entity, scans eligible cells in the inclusive +/-2 square, retains only a strictly smaller squared distance, then constructs class 75 with the same identifier and owner.",
        constructedClass: deriveClass75(catalog),
      },
    },
    unresolved: [
      "Which selected entity classes expose action 13 in the command producer/UI.",
      "The exact semantics of linked identifier cleanup and any queue cancellation/refund at command start.",
      "The complete selection/UI compositor lifecycle around action 13.",
      "The human gameplay rationale for converting the flags-0x10 classes to class 75.",
    ],
    vectors: VECTORS.map((input) => ({ input, output: replayBuildingDemolition(input) })),
  };
}

export function replayBuildingDemolition(vector) {
  switch (vector.operation) {
    case "phase":
      return { id: vector.id, operation: vector.operation, phases: vector.progress.map((progress) => ({ progress, phase: phaseFor(progress) })) };
    case "decrement":
      return replayDecrement(vector);
    case "complete":
      return replayCompletion(vector);
    default:
      throw new TypeError(`Unknown building-demolition vector operation: ${vector.operation}`);
  }
}

function replayDecrement(vector) {
  const { progress, maximumHealth, currentHealth } = vector.state;
  if (progress < vector.delta) {
    return { id: vector.id, operation: vector.operation, completed: true, state: { ...vector.state, progress: 0 } };
  }
  const nextProgress = progress - vector.delta;
  const targetHealth = Math.max(1, Math.trunc((maximumHealth * nextProgress) / 100));
  return {
    id: vector.id,
    operation: vector.operation,
    completed: false,
    state: { ...vector.state, progress: nextProgress, currentHealth: Math.min(currentHealth, targetHealth) },
  };
}

function replayCompletion(vector) {
  const { state } = vector;
  const refundedResources = { grain: state.grain + state.typeGrainCost, wood: state.wood + state.typeWoodCost };
  if ((vector.typeFlags & 0x10) === 0) {
    return { id: vector.id, operation: vector.operation, refund: refundedResources, pendingWarExpenseDelta: 0, transformation: null };
  }
  const destination = findNearestEligibleCell(state.originX, state.originY, state.eligibleCells);
  return {
    id: vector.id,
    operation: vector.operation,
    refund: refundedResources,
    pendingWarExpenseDelta: 0,
    transformation: { removeOldEntity: true, internalClass: 75, entityIdentifier: state.entityIdentifier, owner: state.owner, destination },
  };
}

function findNearestEligibleCell(originX, originY, cells) {
  let selected;
  let bestDistanceSquared = 10000;
  for (const cell of cells) {
    if (Math.abs(cell.x - originX) > 2 || Math.abs(cell.y - originY) > 2) continue;
    const distanceSquared = (cell.x - originX) ** 2 + (cell.y - originY) ** 2;
    if (distanceSquared < bestDistanceSquared) {
      selected = { x: cell.x, y: cell.y };
      bestDistanceSquared = distanceSquared;
    }
  }
  return selected ?? null;
}

function phaseFor(progress) {
  if (progress < 10) return 0;
  if (progress < 20) return 1;
  if (progress < 30) return 2;
  if (progress < 40) return 3;
  if (progress < 50) return 4;
  if (progress < 70) return 5;
  if (progress < 100) return 6;
  return 7;
}

function deriveShipTypes(catalog) {
  const expectedClasses = [18, 19, 26, 27, 29, 30, 38];
  const types = catalog.types.filter((type) => (Number.parseInt(type.definition.flags, 16) & 0x10) !== 0);
  assertEqual(JSON.stringify(types.map(({ internalClass }) => internalClass)), JSON.stringify(expectedClasses), "flags-0x10 type classes");
  return types.map(({ internalClass, originalGameplayName, definition, sprite }) => ({ internalClass, originalGameplayName, flags: definition.flags, spritePath: sprite.sourcePathNormalized }));
}

function deriveClass75(catalog) {
  const type = catalog.types.find(({ internalClass }) => internalClass === 75);
  if (!type) throw new Error("Entity type catalog lacks internal class 75");
  return { internalClass: type.internalClass, originalGameplayName: type.originalGameplayName, spritePath: type.sprite.sourcePathNormalized };
}

function verifyFunction(functions, expected) {
  const actual = functions.find(({ entry }) => entry === expected.entry);
  if (!actual) throw new Error(`Missing generated function ${expected.entry}`);
  assertEqual(actual.bodyRanges?.length, 1, `${expected.entry} body range count`);
  assertEqual(actual.bodyRanges[0], expected.bodyRange, `${expected.entry} body range`);
  assertEqual(actual.instructionCount, expected.instructionCount, `${expected.entry} instruction count`);
  assertEqual(actual.instructionSha256, expected.instructionSha256, `${expected.entry} instruction SHA-256`);
  return expected;
}

function verifyReferenceSet(references) {
  const demolitionLabelReferences = references.filter(({ to }) => to === "0x00aa4b88");
  assertEqual(demolitionLabelReferences.length, 2, "runtime demolition label reference count");
  assertEqual(demolitionLabelReferences[0].from, "0x00457789", "first runtime demolition label reference");
  const sourceLabelReferences = references.filter(({ to }) => to === "0x004c84fc");
  assertEqual(sourceLabelReferences.length, 2, "source demolition label reference count");
  assertEqual(sourceLabelReferences[0].from, "0x0048f2df", "first source demolition label reference");
}

function readCp949CString(buffer, image, va) {
  const offset = image.vaToRawOffset(va);
  if (offset === undefined) throw new Error(`VA 0x${va.toString(16)} is outside the PE image`);
  const bytes = readFullCStringBytes(buffer, offset);
  return bytes.length === 0 ? "" : decodeCp949(bytes.subarray(0, -1));
}

function requireRawOffset(image, va) {
  const offset = image.vaToRawOffset(va);
  if (offset === undefined) throw new Error(`VA 0x${va.toString(16)} is outside the PE image`);
  return offset;
}

function readFullCStringBytes(buffer, offset) {
  const terminator = buffer.indexOf(0, offset);
  if (terminator < 0) throw new Error(`CString at raw offset 0x${offset.toString(16)} is unterminated`);
  const bytes = buffer.subarray(offset, terminator + 1);
  assertEqual(readCString(buffer, offset).length, bytes.length - 1, `CString length at raw offset 0x${offset.toString(16)}`);
  return bytes;
}

function decodeCp949(bytes) {
  return new TextDecoder("euc-kr").decode(bytes);
}

function parseJson(bytes, path) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`Cannot parse ${path}: ${error.message}`, { cause: error });
  }
}

function readOutputPath(argv) {
  if (argv.length === 0 || (argv.length === 1 && argv[0] === "--json")) return undefined;
  if (argv.length === 2 && argv[0] === "--output" && argv[1]) return argv[1];
  throw new Error("Usage: extract-building-demolition-evidence.mjs [--json | --output <path>]");
}
