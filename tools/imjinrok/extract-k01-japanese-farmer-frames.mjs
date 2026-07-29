#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseSpriteLikeHeader } from "./codec.mjs";
import { EXPECTED_EXECUTABLE_SHA256, extractEntityTypeCatalog } from "./extract-entity-type-catalog.mjs";
import { NORMAL_DIRECTION_PROFILES } from "./extract-k01-core-unit-animations.mjs";
import { extractOriginalSpriteTable } from "./extract-sprite-table.mjs";
import { extractMapEntities, parseMapHeader } from "./map-codec.mjs";
import { readPeImage, toHex } from "./pe-image.mjs";

const DEFAULTS = {
  executablePath: "original/imjinrok2/imjinrok2.exe",
  functionsPath: "analysis/generated/imjinrok2/functions.json",
  jumpTablesPath: "analysis/generated/imjinrok2/jump-tables.json",
  seedsPath: "analysis/generated/imjinrok2/seeds.json",
  mapPath: "original/imjinrok2/stagemap/k01.map",
  farmerjPath: "original/imjinrok2/char/Farmerj.spr",
};
const MAP_SHA256 = "43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb";
const FARMER = {
  internalClass: 31,
  originalGameplayName: "일본 농부",
  typeRecordAddress: "0x00885644",
  typeFlags: 0x00081001,
  sprite: {
    path: "char\\farmerj.spr", slot: 145, tableIndex: 45, pointerCell: "0x004bc2d8",
    sha256: "e6cc67849a872f391c977079fc04118bf06d57b99ad8b5137b02398e26d9cdc5",
    width: 66, height: 56, frameCount: 248,
  },
  states: {
    idle: { originalAnimationState: 8, frameStart: 0, frameStride: 8, phaseCount: 8 },
    move: { originalAnimationState: 1, frameStart: 160, frameStride: 8, phaseCount: 8 },
    death: { originalAnimationState: 7, frameStart: 240, frameStride: 0, phaseCount: 8 },
  },
};
const MAP_RECORDS = [
  { rawOwnerWord: 1, sourcePosition: { x: 7, y: 48 } },
  { rawOwnerWord: 1, sourcePosition: { x: 7, y: 47 } },
  { rawOwnerWord: 1, sourcePosition: { x: 48, y: 1 } },
];
const FUNCTION_CONTRACTS = [
  ["0x0048dbe0", ["0x0048dbe0-0x0048dda9"], 147, "f38e4577cf36c44f26097d94e200321d2a9bc6b0aa1696d572e40a600e7f7217"],
  ["0x00483c50", ["0x00483c50-0x00483c9f"], 26, "d33ed40b3a614bcc92bc4b3b429dd372e61b4ef6ccb03b290feffd80c7a9ab4e"],
  ["0x00437650", ["0x00437650-0x00438025"], 539, "4605056775f6f43c9b2065ea5a4ddff5570137eb87587f4a09d2018618e13c28"],
  ["0x004291d0", ["0x004291d0-0x0042c547"], 4156, "1c05959938219ae4fa918ba3061b1856dcfb575f007a1a48281dd316709a7e96"],
  ["0x00428fb0", ["0x00428fb0-0x00429193"], 148, "e5f8707e93a2c0b61922f9e44d828c88e6175c01176aef565f61c6d6b2cef31a"],
  ["0x00428e10", ["0x00428e10-0x00428f64"], 86, "665ce3064ad839771a84f6ab029b63f44cdfcb52e1c0706a26ec7a27037fae5b"],
];
const RAW_EVIDENCE = [
  [0x0048dcca, "e8815fffff", "map loader invokes the entity wrapper"],
  [0x00483c95, "e8b639fbff", "wrapper invokes the entity creator"],
  [0x00437656, "b95601000033c08bfe", "creator prepares ECX=0x156, EAX=0, EDI=entity"],
  [0x00437666, "f3ab", "creator zero-fills 0x156 DWORDs (0x558 bytes)"],
  [0x00437b86, "884e37", "creator writes the class field"],
  [0x00437f29, "e8a212ffff", "creator calls the class animation initializer after zero-fill"],
  [0x00429bfc, "e8aff3ffff", "class 31 initializer calls the idle helper"],
  [0x00429c03, "e808f2ffff", "class 31 initializer calls the move helper"],
  [0x00429c1a, "e891f40000", "class 31 initializer starts five death helper calls"],
  [0x00429108, "6683be7a04000000c6869200000008", "idle helper class 31 branch tests WORD +0x47a and sets state 8"],
  [0x00428f1a, "6683b97a04000000c681a600000008", "move helper class 31 branch tests WORD +0x47a and sets state 1"],
];

export function extractK01JapaneseFarmerFrames(options = {}) {
  const paths = { ...DEFAULTS, ...options };
  const { buffer, image } = readPeImage(paths.executablePath);
  const executableSha256 = sha256(buffer);
  equal(executableSha256, EXPECTED_EXECUTABLE_SHA256, "EXE SHA-256");
  const functions = readArtifact(paths.functionsPath, executableSha256, "functions");
  const jumpTables = readArtifact(paths.jumpTablesPath, executableSha256, "jump tables");
  const seeds = readArtifact(paths.seedsPath, executableSha256, "seeds");
  const catalog = extractEntityTypeCatalog({ executablePath: paths.executablePath, seedsPath: paths.seedsPath });
  const spriteTable = extractOriginalSpriteTable(paths.executablePath);
  const mapBuffer = readFileSync(paths.mapPath);
  equal(sha256(mapBuffer), MAP_SHA256, "K01 map SHA-256");
  const mapHeader = parseMapHeader(mapBuffer, paths.mapPath);
  const type = catalog.types.find(({ internalClass }) => internalClass === FARMER.internalClass);
  if (!type) throw new Error("entity catalog is missing class 31");
  equal(type.originalGameplayName, FARMER.originalGameplayName, "class 31 name");
  equal(type.definition.recordAddress, FARMER.typeRecordAddress, "class 31 catalog record");
  equal(type.definition.flags, toHex(FARMER.typeFlags), "class 31 catalog flags");
  equal(type.sprite.slot, FARMER.sprite.slot, "class 31 catalog slot");
  const sprite = inspectSprite(spriteTable, paths.farmerjPath);
  const classSwitch = requireSwitch(jumpTables, 0x004291d0, 0x004292b3);
  equal(requireCase(classSwitch, 31).destination, "0x00429b90", "class 31 initializer destination");
  const idleSwitch = requireSwitch(jumpTables, 0x00428fb0, 0x00428fcc);
  const moveSwitch = requireSwitch(jumpTables, 0x00428e10, 0x00428e29);
  equal(requireCase(idleSwitch, 31).destination, "0x00429108", "idle helper class 31 destination");
  equal(requireCase(moveSwitch, 31).destination, "0x00428f1a", "move helper class 31 destination");
  const initializer = seeds.functions?.find(({ entry }) => entry === "0x004291d0");
  const creator = seeds.functions?.find(({ entry }) => entry === "0x00437650");
  if (!initializer?.instructions || !creator?.instructions) throw new Error("seeds artifact is missing class 31 initializer or creator instructions");
  const initializerCalls = recoverInitializerCalls(initializer.instructions);
  const creation = recoverCreationOrder(creator.instructions);
  const records = extractMapEntities(mapBuffer, mapHeader).entities
    .filter((entity) => entity.active && entity.ownerId === 1 && entity.typeId === 31)
    .map((entity) => ({ rawOwnerWord: entity.ownerId, sourcePosition: { x: entity.x, y: entity.y } }));
  deepEqual(records, MAP_RECORDS, "K01 active owner-1 class 31 map records");
  const rawEvidence = RAW_EVIDENCE.map(([va, bytes, meaning]) => inspectBytes(buffer, image, va, bytes, meaning));
  if (rawEvidence.some(({ matched }) => !matched)) throw new Error("Japanese farmer raw byte evidence mismatch");
  const states = Object.fromEntries(Object.entries(FARMER.states).map(([name, state]) => [name, describeState(name, state)]));
  const testVectors = Object.values(FARMER.states).flatMap(({ originalAnimationState, phaseCount }) =>
    NORMAL_DIRECTION_PROFILES.flatMap(({ direction }) => [0, phaseCount - 1].map((phase) =>
      selectK01JapaneseFarmerFrame({ state: originalAnimationState, direction, phase }),
    )),
  );
  return {
    schemaVersion: 1,
    question: "K01 source-created class 31 일본 농부의 creation-default states 8/1/7은 어떤 Farmerj.spr frames를 선택하는가?",
    analysisStatus: "static-confirmed",
    reproductionStatus: "reproduction-complete",
    implementationStatus: "theme-level-mapping",
    sources: { executable: { path: paths.executablePath, sha256: executableSha256 }, functions: { path: paths.functionsPath, sourceSha256: functions.sourceSha256 }, jumpTables: { path: paths.jumpTablesPath, sourceSha256: jumpTables.sourceSha256 }, seeds: { path: paths.seedsPath, sourceSha256: seeds.sourceSha256 }, map: { path: paths.mapPath, sha256: sha256(mapBuffer), width: mapHeader.width, height: mapHeader.height } },
    identity: { internalClass: 31, originalGameplayName: FARMER.originalGameplayName, typeRecordAddress: FARMER.typeRecordAddress, typeFlags: toHex(FARMER.typeFlags), projectKind: "japanese-farmer", identityMapping: "exact-static-identity-source" },
    sprite,
    classDispatch: { initializer: "0x00429b90-0x00429c59", idleHelperBranch: "0x00429108", moveHelperBranch: "0x00428f1a" },
    creation,
    initializerCalls,
    directions: NORMAL_DIRECTION_PROFILES,
    states,
    mapRecords: records.map((record) => ({ ...record, projectKind: "japanese-farmer", identityMapping: "exact-static-identity-source" })),
    functionEvidence: verifyFunctions(functions),
    rawEvidence,
    testVectors,
    acceptedInputScope: "K01 map-loader source-created class 31 with initializer-time WORD +0x47a == 0, for states 8 idle, 1 move, and 7 death only.",
    unresolvedScope: "state 4 attack, WORD +0x47a nonzero branches, FPS, pivot, stats, commands, behavior, owner policy, later mutation, and death lifetime are outside this static mapping.",
  };
}

export function selectK01JapaneseFarmerFrame({ state, direction, phase, initializerWord = 0 }) {
  unsignedWord(initializerWord, "initializerWord");
  if (initializerWord !== 0) throw new RangeError("WORD +0x47a nonzero branch is outside the recovered source-created scope");
  signedWord(direction, "direction");
  const stateEntry = Object.entries(FARMER.states).find(([, value]) => value.originalAnimationState === state);
  if (!stateEntry) throw new RangeError("state is outside scoped set 1,7,8");
  const [stateName, stateSpec] = stateEntry;
  if (!Number.isInteger(phase) || phase < 0 || phase >= stateSpec.phaseCount) throw new RangeError(`phase is outside recovered 0..${stateSpec.phaseCount - 1}`);
  const profile = NORMAL_DIRECTION_PROFILES.find((candidate) => candidate.direction === direction);
  if (!profile) throw new RangeError("direction is outside recovered normal grid set");
  return { internalClass: 31, state, stateName, direction, facing: profile.facing, phase, spriteSlot: FARMER.sprite.slot, sourcePath: FARMER.sprite.path, frameIndex: stateSpec.frameStart + profile.frameBaseIndex * stateSpec.frameStride + phase, mirrorX: profile.mirrorX };
}

function describeState(name, state) {
  const directions = NORMAL_DIRECTION_PROFILES.map((profile) => {
    const frameBase = state.frameStart + profile.frameBaseIndex * state.frameStride;
    return { ...profile, frameBase, frameRange: [frameBase, frameBase + state.phaseCount - 1] };
  });
  return { name, ...state, spriteSlot: FARMER.sprite.slot, sourcePath: FARMER.sprite.path, directions };
}
function recoverCreationOrder(instructions) {
  const byAddress = new Map(instructions.map((instruction) => [instruction.address, instruction.text]));
  equal(byAddress.get("0x00437656"), "MOV ECX,0x156", "creator zero-fill DWORD count");
  equal(byAddress.get("0x0043765b"), "XOR EAX,EAX", "creator zero-fill EAX value");
  equal(byAddress.get("0x0043765d"), "MOV EDI,ESI", "creator zero-fill entity destination");
  equal(byAddress.get("0x00437666"), "STOSD.REP ES:EDI", "creator zero-fill instruction");
  equal(byAddress.get("0x00437b86"), "MOV byte ptr [ESI + 0x37],CL", "creator class write");
  equal(byAddress.get("0x00437f29"), "CALL 0x004291d0", "creator initializer call");
  const fieldWrites = instructions.filter(({ address, text }) => Number.parseInt(address, 16) >= 0x00437666 && Number.parseInt(address, 16) < 0x00437f29 && /\[ESI \+ 0x47a\]/.test(text));
  equal(fieldWrites.length, 0, "creator direct writes to WORD +0x47a before initializer");
  return { mapLoader: "0x0048dbe0", wrapper: "0x00483c50", creator: "0x00437650", zeroFill: { dwordCount: 0x156, byteCount: 0x558, instruction: "0x00437666" }, classWrite: "0x00437b86", initializerCall: "0x00437f29", initializerWordAtEntry: 0 };
}
function recoverInitializerCalls(instructions) {
  const selected = instructions.filter(({ address }) => Number.parseInt(address, 16) >= 0x00429b90 && Number.parseInt(address, 16) <= 0x00429c59);
  const texts = selected.map(({ text }) => text);
  const expected = ["CALL 0x00428fb0", "CALL 0x00428e10"];
  for (const value of expected) equal(texts.filter((text) => text === value).length, 1, `class 31 ${value}`);
  equal(texts.filter((text) => text === "CALL 0x004390b0").length, 4, "class 31 direct death helper call count");
  equal(texts.filter((text) => text === "JMP 0x00429997").length, 1, "class 31 fifth death helper shared tail jump");
  const sharedTail = instructions.find(({ address }) => address === "0x0042999c");
  equal(sharedTail?.text, "CALL 0x004390b0", "class 31 fifth death helper shared tail call");
  return { initializerRange: "0x00429b90-0x00429c59", idle: { helper: "0x00428fb0", state: 8, slot: 145, frameStart: 0, phaseCount: 8, branch: "0x00429108" }, move: { helper: "0x00428e10", state: 1, slot: 145, frameStart: 160, phaseCount: 8, branch: "0x00428f1a" }, death: { helper: "0x004390b0", state: 7, slot: 145, frameStart: 240, frameStride: 0, phaseCount: 8, facingCallCount: 5 } };
}
function inspectSprite(table, path) {
  const entry = table.entries[FARMER.sprite.tableIndex];
  if (!entry) throw new Error("Farmerj sprite-table entry is missing");
  equal(entry.tableVa, FARMER.sprite.pointerCell, "Farmerj pointer cell");
  equal(entry.sourcePath, FARMER.sprite.path, "Farmerj source path");
  const bytes = readFileSync(path);
  equal(sha256(bytes), FARMER.sprite.sha256, "Farmerj SHA-256");
  const header = parseSpriteLikeHeader(bytes, path);
  equal(header.width, FARMER.sprite.width, "Farmerj width");
  equal(header.height, FARMER.sprite.height, "Farmerj height");
  equal(header.frameCount, FARMER.sprite.frameCount, "Farmerj frame count");
  return { path, ...FARMER.sprite };
}
function verifyFunctions(functions) { return FUNCTION_CONTRACTS.map(([entry, bodyRanges, instructionCount, instructionSha256]) => { const actual = functions.functions.find((candidate) => candidate.entry === entry); if (!actual) throw new Error(`functions artifact is missing ${entry}`); deepEqual(actual.bodyRanges, bodyRanges, `${entry} body ranges`); equal(actual.instructionCount, instructionCount, `${entry} instruction count`); equal(actual.instructionSha256, instructionSha256, `${entry} instruction SHA-256`); return { entry, bodyRanges, instructionCount, instructionSha256 }; }); }
function inspectBytes(buffer, image, va, bytes, meaning) { const expected = Buffer.from(bytes, "hex"); const rawOffset = image.vaToRawOffset(va); const actual = rawOffset === undefined ? Buffer.alloc(0) : buffer.subarray(rawOffset, rawOffset + expected.length); return { va: toHex(va), rawOffset: rawOffset === undefined ? undefined : toHex(rawOffset), expectedBytes: bytes, actualBytes: actual.toString("hex"), meaning, matched: actual.equals(expected) }; }
function readArtifact(path, sourceSha256, label) { const artifact = JSON.parse(readFileSync(path, "utf8")); equal(artifact.sourceSha256, sourceSha256, `${label} source SHA-256`); return artifact; }
function requireSwitch(artifact, functionEntry, switchAddress) { const table = Object.values(artifact.tables ?? {}).find((candidate) => candidate.functionEntry === toHex(functionEntry) && candidate.switchAddress === toHex(switchAddress)); if (!table) throw new Error(`missing switch ${toHex(switchAddress)}`); return table; }
function requireCase(table, label) { const entry = table.cases.find((candidate) => candidate.label === label); if (!entry) throw new Error(`missing switch case ${label}`); return entry; }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function equal(actual, expected, label) { if (actual !== expected) throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`); }
function deepEqual(actual, expected, label) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
function unsignedWord(value, label) { if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new RangeError(`${label} must be an unsigned WORD`); }
function signedWord(value, label) { if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) throw new RangeError(`${label} must be a signed WORD`); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputIndex = process.argv.indexOf("--output");
  const report = extractK01JapaneseFarmerFrames();
  if (outputIndex >= 0) writeFileSync(process.argv[outputIndex + 1], `${JSON.stringify(report, null, 2)}\n`);
  else console.log(JSON.stringify(report, null, 2));
}
