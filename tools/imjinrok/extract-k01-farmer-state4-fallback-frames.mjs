#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { EXPECTED_EXECUTABLE_SHA256 } from "./extract-entity-type-catalog.mjs";
import { NORMAL_DIRECTION_PROFILES } from "./extract-k01-core-unit-animations.mjs";
import { selectK01JapaneseFarmerFrame } from "./extract-k01-japanese-farmer-frames.mjs";
import { selectK01KoreanFarmerCoreFrame } from "./extract-k01-korean-farmer-core-frames.mjs";
import { readPeImage, toHex } from "./pe-image.mjs";
import { verifyEvidencePoint, verifyRawCodeRange } from "./static-evidence.mjs";

const DEFAULTS = {
  executablePath: "original/imjinrok2/imjinrok2.exe",
  functionsPath: "analysis/generated/imjinrok2/functions.json",
  jumpTablesPath: "analysis/generated/imjinrok2/jump-tables.json",
  referencesPath: "analysis/generated/imjinrok2/references.json",
  seedsPath: "analysis/generated/imjinrok2/seeds.json",
};

const FARMERS = [
  { internalClass: 7, originalGameplayName: "조선 농부", typeFlags: 0x000a0801, idleSelector: selectK01KoreanFarmerCoreFrame },
  { internalClass: 31, originalGameplayName: "일본 농부", typeFlags: 0x00081001, idleSelector: selectK01JapaneseFarmerFrame },
];
const DIRECTIONS = NORMAL_DIRECTION_PROFILES.map(({ direction }) => direction);
const INITIALIZER_RANGES = [
  { internalClass: 7, start: 0x0042981d, endExclusive: 0x004298e8, sha256: "44f376cfea26ba90fece2a9723312b47b11cc6579aa5a0ce726a56bbcec19324" },
  { internalClass: 31, start: 0x00429b90, endExclusive: 0x00429c5a, sha256: "271f8446611acd779decee30b63035be075cd7adaa3c1dc197dceef373c16999" },
];
const FUNCTION_CONTRACTS = [
  ["0x00437650", ["0x00437650-0x00438025"], 539, "4605056775f6f43c9b2065ea5a4ddff5570137eb87587f4a09d2018618e13c28"],
  ["0x004291d0", ["0x004291d0-0x0042c547"], 4156, "1c05959938219ae4fa918ba3061b1856dcfb575f007a1a48281dd316709a7e96"],
  ["0x0041d210", ["0x0041d210-0x0041d277", "0x0041d2c0-0x0041d41a", "0x0041e200-0x0041e2f5"], 177, "dbc2f289ae0aacdc6d7ef785d7d8290d1153742003a389889f5ac881563ca278"],
  ["0x0041e370", ["0x0041e370-0x0041e3bd", "0x0041e3f0-0x0041e5db"], 115, "aa96086d04f698f4965205fa74803f0cc7d7db9a05ee610834a0ccffac293a61"],
  ["0x0041d870", ["0x0041d870-0x0041d976", "0x0041d9f0-0x0041dbdc"], 149, "725ef4a43130d35f9001bbd0b96ab9868b54ee4c000a49de36b96eccce7cdfc2"],
];
const RAW_CODE_RANGES = [
  { id: "creator-zero-through-initializer-call", start: 0x00437656, endExclusive: 0x00437f2e, sha256: "1ccf372a34e4af1011f3df38a5a4314e19b6ceb7ef574ed54f768da929c49336" },
  ...INITIALIZER_RANGES.map(({ internalClass, start, endExclusive, sha256 }) => ({ id: `class-${internalClass}-initializer`, start, endExclusive, sha256 })),
  { id: "state-dispatcher-through-case-4", start: 0x0041d210, endExclusive: 0x0041d235, sha256: "62bda37c0117ed92bb26d9904e28aeb05d1e25df1926bfe8f3cfd2ad8764b513" },
  { id: "state-4-class-gate-through-idle-fallback", start: 0x0041e370, endExclusive: 0x0041e3be, sha256: "e928645ac07fd1d76d34ed590a9b7ef88024bb6f861c9b420c3581471c43eece" },
  { id: "normal-idle-consumer", start: 0x0041d870, endExclusive: 0x0041d977, sha256: "f41066de45daf3fca974f594ad4697568fbf55c20f91f4eb296b8016e91b24ab" },
];
const EVIDENCE_POINTS = [
  { va: 0x00437656, bytes: "b9 56 01 00 00", meaning: "creator sets ECX to 0x156 DWORDs" },
  { va: 0x0043765b, bytes: "33 c0", meaning: "creator clears EAX before the fill" },
  { va: 0x00437666, bytes: "f3 ab", meaning: "creator zero-fills the 0x558-byte record" },
  { va: 0x00437f29, bytes: "e8 a2 12 ff ff", meaning: "creator calls the class initializer after the zero-fill" },
  { va: 0x0041d230, bytes: "e9 3b 11 00 00", meaning: "state dispatcher case 4 transfers to FUN_0041e370" },
  { va: 0x0041e3a0, bytes: "f7 41 74 00 00 00 80 75 14 66 83 b9 44 01 00 00 00", meaning: "state-4 default gate requires high bit clear then tests WORD +0x144" },
  { va: 0x0041e3b3, bytes: "e9 b8 f4 ff ff", meaning: "zero WORD +0x144 transfers to FUN_0041d870" },
  { va: 0x0041d880, bytes: "66 0f b6 81 93 00 00 00", meaning: "normal idle consumer reads BYTE +0x93" },
  { va: 0x0041d88c, bytes: "0f bf 81 e6 01 00 00", meaning: "normal idle consumer reads phase WORD +0x1b2" },
];
const REQUIRED_CALL_EDGES = [
  ["0x00437f29", "0x00437650", "0x004291d0"],
  ["0x0041d230", "0x0041d210", "0x0041e370"],
  ["0x0041e3b3", "0x0041e370", "0x0041d870"],
];

export function extractK01FarmerState4FallbackFrames(options = {}) {
  const paths = { ...DEFAULTS, ...options };
  const { buffer, image } = readPeImage(paths.executablePath);
  const executableSha256 = sha256(buffer);
  equal(executableSha256, EXPECTED_EXECUTABLE_SHA256, "EXE SHA-256");
  const functions = readArtifact(paths.functionsPath, executableSha256, "functions");
  const jumpTables = readArtifact(paths.jumpTablesPath, executableSha256, "jump tables");
  const references = readArtifact(paths.referencesPath, executableSha256, "references");
  const seeds = readArtifact(paths.seedsPath, executableSha256, "seeds");
  const functionEvidence = verifyFunctionContracts(functions);
  const rawCodeRanges = RAW_CODE_RANGES.map((range) => verifyRawCodeRange(buffer, image, range));
  const evidencePoints = EVIDENCE_POINTS.map((point) => verifyEvidencePoint(buffer, image, point));
  const callEdges = REQUIRED_CALL_EDGES.map(([from, fromFunctionEntry, to]) => verifyCallEdge(references, { from, fromFunctionEntry, to }));
  const initializer = verifyInitializerDefault(seeds, jumpTables);
  const state4 = verifyState4Fallback(jumpTables);
  const testVectors = FARMERS.flatMap(({ internalClass }) => DIRECTIONS.flatMap((direction) =>
    [0, 7].map((phase) => selectK01FarmerState4FallbackFrame({ internalClass, direction, phase })),
  ));
  return {
    schemaVersion: 1,
    question: "source-created class 7/31 농부의 creation-default WORD +0x144==0에서 original visual state 4는 어떤 visual selection을 하는가?",
    analysisStatus: "static-confirmed",
    reproductionStatus: "reproduction-complete",
    implementationStatus: "pending-audit",
    sources: {
      executable: { path: paths.executablePath, sha256: executableSha256 },
      functions: { path: paths.functionsPath, sourceSha256: functions.sourceSha256 },
      jumpTables: { path: paths.jumpTablesPath, sourceSha256: jumpTables.sourceSha256 },
      references: { path: paths.referencesPath, sourceSha256: references.sourceSha256 },
      seeds: { path: paths.seedsPath, sourceSha256: seeds.sourceSha256 },
    },
    functionEvidence,
    rawCodeRanges,
    evidencePoints,
    callEdges,
    initializer,
    state4,
    testVectors,
    acceptedInputScope: "source-created class 7/31 only, at creation-default high-bit-clear type flags and WORD +0x144 == 0; this records visual selection only.",
    unresolvedScope: "state-4 producer reachability, later runtime aliases/writes to +0x144, combat semantics/stats, human-facing attack meaning, timing/FPS, pivot, and behavior are outside this evidence.",
  };
}

export function selectK01FarmerState4FallbackFrame({ internalClass, direction, phase, creationWord = 0, typeFlags } = {}) {
  const farmer = FARMERS.find((candidate) => candidate.internalClass === internalClass);
  if (!farmer) throw new RangeError("internalClass is outside scoped classes 7,31");
  unsignedWord(creationWord, "creationWord");
  unsignedDword(typeFlags ?? farmer.typeFlags, "typeFlags");
  if (creationWord !== 0) throw new RangeError("WORD +0x144 must be zero for the creation-default fallback");
  if (((typeFlags ?? farmer.typeFlags) & 0x80000000) !== 0) throw new RangeError("state-4 fallback requires a high-bit-clear type flag");
  const idle = internalClass === 7
    ? farmer.idleSelector({ state: 8, direction, phase, resourceField: 0 })
    : farmer.idleSelector({ state: 8, direction, phase, initializerWord: 0 });
  return {
    internalClass,
    visualState: 4,
    visualStateName: "state4-creation-default-visual-fallback",
    fallbackState: 8,
    fallbackStateName: "idle",
    direction: idle.direction,
    facing: idle.facing,
    phase: idle.phase,
    spriteSlot: idle.spriteSlot,
    sourcePath: idle.sourcePath,
    frameIndex: idle.frameIndex,
    mirrorX: idle.mirrorX,
  };
}

function verifyInitializerDefault(seeds, jumpTables) {
  const initializer = requireSeed(seeds, "0x004291d0");
  const creator = requireSeed(seeds, "0x00437650");
  const creatorInstructions = new Map(creator.instructions.map(({ address, text }) => [address, text]));
  equal(creatorInstructions.get("0x00437656"), "MOV ECX,0x156", "creator zero-fill DWORD count");
  equal(creatorInstructions.get("0x0043765b"), "XOR EAX,EAX", "creator zero-fill value");
  equal(creatorInstructions.get("0x00437666"), "STOSD.REP ES:EDI", "creator zero-fill instruction");
  equal(creatorInstructions.get("0x00437f29"), "CALL 0x004291d0", "creator initializer call");
  const classSwitch = requireSwitch(jumpTables, 0x004291d0, 0x004292b3);
  const classes = INITIALIZER_RANGES.map((range) => {
    const scopedInstructions = initializer.instructions.filter(({ address }) => {
      const va = Number.parseInt(address, 16);
      return va >= range.start && va < range.endExclusive;
    });
    equal(scopedInstructions.length > 0, true, `class ${range.internalClass} initializer seed coverage`);
    equal(requireCase(classSwitch, range.internalClass).destination, toHex(range.start), `class ${range.internalClass} initializer destination`);
    const writes = scopedInstructions.filter(({ text }) => writesField(text, 0x144));
    equal(writes.length, 0, `class ${range.internalClass} initializer writes to WORD +0x144`);
    return {
      internalClass: range.internalClass,
      initializerRange: `${toHex(range.start)}-${toHex(range.endExclusive - 1)}`,
      seedInstructionCount: scopedInstructions.length,
      noWord144Write: { field: "+0x144", scope: "exact class initializer range", result: true },
    };
  });
  return {
    creator: { functionEntry: "0x00437650", zeroFill: { dwordCount: 0x156, byteCount: 0x558, repStosdVa: "0x00437666" }, initializerCallVa: "0x00437f29" },
    classes,
    result: { field: "+0x144", value: 0, status: "creation-default-static-confirmed" },
  };
}

function verifyState4Fallback(jumpTables) {
  const dispatcher = requireSwitch(jumpTables, 0x0041d210, 0x0041d21a);
  equal(requireCase(dispatcher, 4).destination, "0x0041d230", "state dispatcher case 4 destination");
  const classGate = requireSwitch(jumpTables, 0x0041e370, 0x0041e385);
  for (const internalClass of [7, 31]) equal(requireCase(classGate, internalClass).destination, "0x0041e3a0", `state-4 class ${internalClass} default gate`);
  return {
    dispatcher: { functionEntry: "0x0041d210", switchAddress: "0x0041d21a", state: 4, destination: "0x0041d230", callee: "0x0041e370" },
    classGate: { functionEntry: "0x0041e370", switchAddress: "0x0041e385", classes: [7, 31], destination: "0x0041e3a0", highBit: "clear", zeroWord144Destination: "0x0041e3b3 -> 0x0041d870" },
    idleConsumer: { functionEntry: "0x0041d870", byteDirectionField: "+0x93", frameBaseWords: ["+0x94", "+0x96", "+0x98", "+0x9a", "+0x9c"], phaseWord: "+0x1b2" },
  };
}

function verifyFunctionContracts(functions) {
  return FUNCTION_CONTRACTS.map(([entry, bodyRanges, instructionCount, instructionSha256]) => {
    const actual = functions.functions?.find((candidate) => candidate.entry === entry);
    if (!actual) throw new Error(`functions artifact is missing ${entry}`);
    deepEqual(actual.bodyRanges, bodyRanges, `${entry} body ranges`);
    equal(actual.instructionCount, instructionCount, `${entry} instruction count`);
    equal(actual.instructionSha256, instructionSha256, `${entry} instruction SHA-256`);
    return { entry, bodyRanges, instructionCount, instructionSha256 };
  });
}

function verifyCallEdge(references, expected) {
  const found = references.references?.find((reference) => reference.from === expected.from && reference.fromFunctionEntry === expected.fromFunctionEntry && reference.to === expected.to && reference.type === "UNCONDITIONAL_CALL");
  if (!found) throw new Error(`missing required call edge ${expected.from} -> ${expected.to}`);
  return expected;
}
function readArtifact(path, sourceSha256, label) {
  const artifact = JSON.parse(readFileSync(path, "utf8"));
  equal(artifact.sourceSha256, sourceSha256, `${label} source SHA-256`);
  return artifact;
}
function requireSeed(seeds, entry) {
  const seed = seeds.functions?.find((candidate) => candidate.entry === entry);
  if (!seed?.instructions) throw new Error(`seeds artifact is missing ${entry}`);
  return seed;
}
function requireSwitch(artifact, functionEntry, switchAddress) {
  const table = Object.values(artifact.tables ?? {}).find((candidate) => candidate.functionEntry === toHex(functionEntry) && candidate.switchAddress === toHex(switchAddress));
  if (!table) throw new Error(`missing switch ${toHex(switchAddress)}`);
  return table;
}
function requireCase(table, label) {
  const entry = table.cases.find((candidate) => candidate.label === label);
  if (!entry) throw new Error(`missing switch case ${label}`);
  return entry;
}
function writesField(text, offset) {
  const hex = `0x${offset.toString(16)}`;
  return /^(MOV|ADD|ADC|SUB|SBB|AND|OR|XOR|INC|DEC|SHL|SHR|SAR|ROL|ROR|IMUL|NEG|NOT|POP|XCHG|CMPXCHG)\b/u.test(text) && text.includes(`[ESI + ${hex}]`);
}
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function equal(actual, expected, label) { if (actual !== expected) throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`); }
function deepEqual(actual, expected, label) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
function unsignedWord(value, label) { if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new RangeError(`${label} must be an unsigned WORD`); }
function unsignedDword(value, label) { if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError(`${label} must be an unsigned DWORD`); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputIndex = process.argv.indexOf("--output");
  const report = extractK01FarmerState4FallbackFrames();
  if (outputIndex >= 0) writeFileSync(process.argv[outputIndex + 1], `${JSON.stringify(report, null, 2)}\n`);
  else console.log(JSON.stringify(report, null, 2));
}
