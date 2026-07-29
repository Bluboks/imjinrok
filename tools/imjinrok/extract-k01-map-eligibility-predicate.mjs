#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePeImage } from "./pe-image.mjs";

export const EXPECTED_EXECUTABLE_SHA256 = "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_EXECUTABLE_SIZE = 843_833;
export const EXPECTED_FUNCTIONS_SHA256 = "7e071fdfe425d22447780c265fe1d3fd271a1bedd1773682bebcb8ddc6d2e16e";
export const EXPECTED_REFERENCES_SHA256 = "f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5";

export const K01_MAP_ELIGIBILITY_PREDICATE = {
  functionEntry: "0x00465960",
  coordinateInput: "x and y are signed int16 values read from the two stack argument words; width and height are raw uint32 DWORDs compared as signed int32 by JGE",
  coordinateIndex: "index = x * 180 + y",
  occupancy: { baseOffset: 0x00002db4, elementWidthBytes: 2, signedness: "bit-pattern uint16", xStrideElements: 180, yStrideElements: 1 },
  primaryGate: { baseOffset: 0x000cc90c, elementWidthBytes: 1, signedness: "uint8", xStrideBytes: 180, yStrideBytes: 1 },
  auxiliaryGate: { baseOffset: 0x000dc62c, elementWidthBytes: 1, signedness: "uint8", xStrideBytes: 180, yStrideBytes: 1 },
  lowNibbleField: { baseOffset: 0x00032514, elementWidthBytes: 1, signedness: "uint8", xStrideBytes: 180, yStrideBytes: 1, rejectLowNibble: 1 },
  derivedFlags: { baseOffset: 0x000227f4, elementWidthBytes: 2, signedness: "bit-pattern uint16", xStrideElements: 180, yStrideElements: 1 },
  forcedDerivedFlagMask: 0x2004,
};

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_FUNCTIONS_PATH = "analysis/generated/imjinrok2/functions.json";
const DEFAULT_REFERENCES_PATH = "analysis/generated/imjinrok2/references.json";
const FUNCTION_PROVENANCE = [
  {
    entry: "0x00462af0", bodyRange: "0x00462af0-0x00462b7b", bodySize: 140,
    bodySha256: "c462e822540d7bede0c75eeeab2661001164209cd831f639c99e1ab8401fe6e0",
    instructionSha256: "9210aac0f05703a63f1e216905ead5434195183e26233c80cb4c9be36c5985fa",
    callers: ["0x00445e60", "0x0046af80", "0x0048d410"], callees: ["0x004ad725", "0x004ad7cd", "0x004adf44"],
  },
  {
    entry: "0x004648e0", bodyRange: "0x004648e0-0x00464cb2", bodySize: 979,
    bodySha256: "e8bba48e9c6925826914eab6f55a038ee275500831e70ec496b1bcc7dfd63112",
    instructionSha256: "e6f8db32835296fb67b09de507b8aef2ddd6dbe6ce359922ed1abf159fb35c5b",
    callers: ["0x00445990", "0x00445e60", "0x0046af80", "0x0048d410"],
    callees: ["0x00462090", "0x00462300", "0x00462720", "0x004627b0", "0x00463a10", "0x00463a50", "0x004644d0", "0x00464cc0", "0x004663a0", "0x004a1150"],
  },
  {
    entry: "0x00465960", bodyRange: "0x00465960-0x00465a12", bodySize: 179,
    bodySha256: "2b1f10655b34fce18f72a990661788d7298f0dc6e8c1ef9f99feb4e23e9a45d0",
    instructionSha256: "36b8864d7c2aadb9d0a93172caa5d01d3c6a2d3921880334ce4547f452703ac0",
    callers: ["0x00465d50", "0x0046e450"], callees: [],
  },
];
const REQUIRED_CALL_EDGES = [
  { from: "0x00462b1a", fromFunctionEntry: "0x00462af0", to: "0x004adf44" },
  { from: "0x00465da2", fromFunctionEntry: "0x00465d50", to: "0x00465960" },
  { from: "0x0046e472", fromFunctionEntry: "0x0046e450", to: "0x00465960" },
];
const REQUIRED_PREDICATE_REFERENCES = [
  ["0x0046596a", "0x004659ca", "CONDITIONAL_JUMP"], ["0x00465977", "0x004659ca", "CONDITIONAL_JUMP"],
  ["0x00465981", "0x004659ca", "CONDITIONAL_JUMP"], ["0x0046598c", "0x004659ca", "CONDITIONAL_JUMP"],
  ["0x004659a0", "0x004659ca", "CONDITIONAL_JUMP"], ["0x004659b5", "0x004659d1", "CONDITIONAL_JUMP"],
  ["0x004659c8", "0x004659d5", "CONDITIONAL_JUMP"], ["0x004659d3", "0x004659ca", "CONDITIONAL_JUMP"],
  ["0x004659ef", "0x004659ca", "CONDITIONAL_JUMP"], ["0x004659f1", "0x004bdfd0", "READ"],
];
const EXECUTABLE_EVIDENCE = [
  { id: "map-load-and-runtime-grid-clear", va: 0x00462b11, bytes: "56 6a 01 68 8c bd 10 00 57 e8 25 b4 04 00 56 e8 00 ac 04 00 83 c4 14 8d 97 b4 2d 00 00 be b4 00 00 00", meaning: "The successful map load copies 0x10bd8c bytes, then begins clearing map+0x2db4 as a 180-wide runtime grid." },
  { id: "derived-flags-runtime-grid-clear", va: 0x00462b4d, bytes: "8d 97 f4 27 02 00 be b4 00 00 00 8b c2 b9 b4 00 00 00 66 c7 00 00 00 05 68 01 00 00", meaning: "The same successful load path separately clears map+0x227f4 as a 180-wide runtime grid." },
  { id: "signed-coordinate-bounds", va: 0x00465960, bytes: "66 8b 44 24 04 56 66 85 c0 57 7c 5e 8b 91 a0 2d 00 00 0f bf c0 3b c2 7d 51 66 8b 54 24 10 66 85 d2 7c 47 0f bf f2 3b b1 a4 2d 00 00 7d 3c", meaning: "Each stack argument is read as a word, tested signed-negative, sign-extended, then compared by signed JGE with the raw map runtime width or height DWORD." },
  { id: "occupancy-grid-reject", va: 0x0046598e, bytes: "8d 14 80 8d 14 d2 8d 3c 96 66 83 bc 79 b4 2d 00 00 00 75 28", meaning: "index=x*180+y; a nonzero WORD at map+0x2db4+index*2 returns false before the primary gate." },
  { id: "primary-and-auxiliary-gate-contact", va: 0x004659a2, bytes: "8d 94 80 eb 5a 00 00 8d 14 d2 8d 14 96 8a 14 0a 80 fa 03 75 1a 8d 94 80 f3 61 00 00 8d 14 d2 8d 14 96 80 3c 0a 00 74 0b", meaning: "The locked primary 0/3 gate is reached only after occupancy; primary 3 requires zero auxiliary before the suffix." },
  { id: "primary-nonzero-reject-and-low-nibble", va: 0x004659d1, bytes: "84 d2 75 f5 8d 84 80 5d 16 00 00 8d 04 c0 8d 14 86 8a 04 0a 24 0f 66 0f be c0 66 3d 01 00 74 d9", meaning: "A primary byte other than 0 or 3 rejects; then map+0x32514+x*180+y uint8 low nibble equal to 1 rejects." },
  { id: "derived-flags-final-boolean", va: 0x004659f1, bytes: "66 8b 15 d0 df 4b 00 66 8b 84 79 f4 27 02 00 66 81 ca 04 20 5f 66 23 c2 5e 66 f7 d8 1b c0 40 c2 08 00", meaning: "Return 1 iff uint16(map+0x227f4+index*2) & (WORD[0x004bdfd0] | 0x2004) is zero." },
];

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(extractK01MapEligibilityPredicate({ executablePath: args.executable, functionsPath: args.functions, referencesPath: args.references }), null, 2)}\n`);
}

export function extractK01MapEligibilityPredicate({ executablePath = DEFAULT_EXECUTABLE_PATH, functionsPath = DEFAULT_FUNCTIONS_PATH, referencesPath = DEFAULT_REFERENCES_PATH } = {}) {
  const executable = readVerified(executablePath, "original executable", EXPECTED_EXECUTABLE_SIZE, EXPECTED_EXECUTABLE_SHA256);
  const image = parsePeImage(executable.buffer, executablePath);
  const staticAnalysis = verifyStaticAnalysis({ executableBuffer: executable.buffer, image, functionsPath, referencesPath });
  return {
    question: "What exact ordered boolean does original FUN_00465960 return after the locked primary map gate?",
    analysisStatus: "static-confirmed-for-the-bounded-eligibility-predicate",
    reproductionStatus: "complete-for-synthetic-runtime-input-and-short-circuit-vectors",
    implementationStatus: "no-product-port-in-this-extractor",
    sources: { executable: omitBuffer(executable) },
    predicate: K01_MAP_ELIGIBILITY_PREDICATE,
    staticAnalysis,
    executableEvidence: EXECUTABLE_EVIDENCE.map((evidence) => verifyByteEvidence(executable.buffer, image, evidence)),
    producerBoundary: {
      dimensions: "map+0x2da0 and map+0x2da4 are raw runtime DWORDs; the JGE instructions compare their signed int32 interpretations with sign-extended int16 coordinates. The K01 loader copies the whole map image before these reads, but this extractor accepts the raw DWORDs as runtime inputs.",
      occupancy: "map+0x2db4 is a 180x180 uint16 runtime grid explicitly zeroed after map load; its later population is outside this bounded function, so occupancyWord is synthetic.",
      derivedFlags: "map+0x227f4 is a distinct 180x180 uint16 runtime grid explicitly zeroed after map load; later writers are outside this bounded function, so derivedFlags is synthetic.",
      lowNibbleField: "map+0x32514 lies in the copied map image, but this bounded trace does not close post-load writers; lowNibbleField is synthetic and no raw K01.map byte is substituted for it.",
      globalMaskWord: "WORD[0x004bdfd0] is read immediately before derivedFlags. Its producer is outside this bounded function, so globalMaskWord is synthetic; the fixed executable image initializes the location to 0x136a.",
      firstUnresolvedEdge: "the first unresolved value producer reached after the primary gate is field_0x00032514(x,y), followed by the global mask word and runtime derived-flag writers",
    },
    orderedPredicate: [
      "reject if x < 0", "reject if x >= int32(widthRawDword)", "reject if y < 0", "reject if y >= int32(heightRawDword)", "reject if occupancyWord != 0",
      "for primary == 3 reject if auxiliaryValue != 0; for primary != 0 and != 3 reject",
      "reject if (lowNibbleField & 0x0f) == 1", "return (derivedFlags & (globalMaskWord | 0x2004)) == 0",
    ],
    syntheticVectors: syntheticVectors(),
  };
}

export function evaluateK01MapEligibilityPredicate(input) {
  const x = readInt16(input, "x");
  if (x < 0) return false;
  const widthRawDword = readUInt32(input, "width");
  if (x >= toInt32(widthRawDword)) return false;
  const y = readInt16(input, "y");
  if (y < 0) return false;
  const heightRawDword = readUInt32(input, "height");
  if (y >= toInt32(heightRawDword)) return false;
  if (readUInt16(input, "occupancyWord") !== 0) return false;
  const primaryValue = readUInt8(input, "primaryValue");
  if (primaryValue === 3) {
    if (readUInt8(input, "auxiliaryValue") !== 0) return false;
  } else if (primaryValue !== 0) {
    return false;
  }
  if ((readUInt8(input, "lowNibbleField") & 0x0f) === 1) return false;
  const globalMaskWord = readUInt16(input, "globalMaskWord");
  const derivedFlags = readUInt16(input, "derivedFlags");
  return (derivedFlags & (globalMaskWord | K01_MAP_ELIGIBILITY_PREDICATE.forcedDerivedFlagMask)) === 0;
}

function syntheticVectors() {
  const base = { x: 0, y: 0, width: 60, height: 60, occupancyWord: 0, primaryValue: 0, auxiliaryValue: 0, lowNibbleField: 0, globalMaskWord: 0, derivedFlags: 0 };
  return [
    ["x-negative", { ...base, x: -1 }], ["x-at-width", { ...base, x: 60 }], ["x-high-bit-width", { ...base, width: 0x80000000 }],
    ["y-negative", { ...base, y: -1 }], ["y-at-height", { ...base, y: 60 }], ["y-high-bit-height", { ...base, height: 0xffffffff }],
    ["occupied", { ...base, occupancyWord: 1 }], ["primary-three-aux-nonzero", { ...base, primaryValue: 3, auxiliaryValue: 1 }],
    ["primary-other-nonzero", { ...base, primaryValue: 2 }], ["primary-zero-continues", base], ["primary-three-continues", { ...base, primaryValue: 3 }],
    ["low-nibble-one", { ...base, lowNibbleField: 0xf1 }], ["derived-mask-reject", { ...base, globalMaskWord: 0x136a, derivedFlags: 0x2000 }], ["success", { ...base, globalMaskWord: 0x136a, derivedFlags: 0x0080 }],
  ].map(([id, input]) => ({ id, input, result: evaluateK01MapEligibilityPredicate(input) }));
}

function verifyStaticAnalysis({ executableBuffer, image, functionsPath, referencesPath }) {
  const functionsSource = readVerifiedJson(functionsPath, "static functions", EXPECTED_FUNCTIONS_SHA256);
  const referencesSource = readVerifiedJson(referencesPath, "static references", EXPECTED_REFERENCES_SHA256);
  const functions = functionsSource.parsed.functions;
  const references = referencesSource.parsed.references;
  if (!Array.isArray(functions) || !Array.isArray(references)) throw new Error("Static analysis functions or references payload is not an array");
  const functionProvenance = FUNCTION_PROVENANCE.map((specification) => verifyFunction(functions, executableBuffer, image, specification));
  const requiredCallEdges = REQUIRED_CALL_EDGES.map((edge) => verifyCallEdge(references, edge));
  const predicateReferences = references.filter((reference) => reference.fromFunctionEntry === "0x00465960");
  if (!sameArray(predicateReferences.map(({ from, to, type }) => [from, to, type]), REQUIRED_PREDICATE_REFERENCES)) throw new Error("FUN_00465960 reference set mismatch");
  return { functions: { ...omitBuffer(functionsSource), sourceSha256: functionsSource.parsed.sourceSha256, functionProvenance }, references: { ...omitBuffer(referencesSource), sourceSha256: referencesSource.parsed.sourceSha256, requiredCallEdges, predicateReferences: predicateReferences.map(({ from, to, type }) => ({ from, to, type })) } };
}

function verifyFunction(functions, executableBuffer, image, specification) {
  const record = functions.find(({ entry }) => entry === specification.entry);
  if (!record || record.bodySize !== specification.bodySize || record.instructionSha256 !== specification.instructionSha256 || !sameArray(record.bodyRanges, [specification.bodyRange]) || !sameArray(record.callers, specification.callers) || !sameArray(record.callees, specification.callees)) throw new Error(`Static function provenance mismatch for ${specification.entry}`);
  const rawOffset = image.vaToRawOffset(Number.parseInt(specification.entry, 16));
  if (rawOffset === undefined) throw new Error(`Function ${specification.entry} is outside mapped PE sections`);
  const rawBodySha256 = sha256(executableBuffer.subarray(rawOffset, rawOffset + specification.bodySize));
  if (rawBodySha256 !== specification.bodySha256) throw new Error(`Raw function body SHA-256 mismatch for ${specification.entry}`);
  return { entry: specification.entry, bodyRange: specification.bodyRange, bodySize: specification.bodySize, rawBodySha256, instructionSha256: specification.instructionSha256, callers: record.callers, callees: record.callees };
}

function verifyCallEdge(references, expected) {
  const matches = references.filter((reference) => reference.from === expected.from && reference.fromFunctionEntry === expected.fromFunctionEntry && reference.to === expected.to && reference.type === "UNCONDITIONAL_CALL");
  if (matches.length !== 1) throw new Error(`Expected exactly one unconditional call ${expected.fromFunctionEntry}:${expected.from}->${expected.to}, got ${matches.length}`);
  const reference = matches[0];
  if (reference.source !== "DEFAULT" || reference.operandIndex !== 0 || reference.primary !== true || reference.fromBlock !== ".text" || reference.toBlock !== ".text") throw new Error(`Static call provenance mismatch at ${expected.from}`);
  return { from: reference.from, fromFunctionEntry: reference.fromFunctionEntry, to: reference.to, type: reference.type };
}

function verifyByteEvidence(buffer, image, evidence) {
  const expected = Buffer.from(evidence.bytes.replaceAll(" ", ""), "hex");
  const rawOffset = image.vaToRawOffset(evidence.va);
  if (rawOffset === undefined) throw new Error(`Executable evidence VA 0x${evidence.va.toString(16)} is outside mapped PE sections`);
  const actual = buffer.subarray(rawOffset, rawOffset + expected.length);
  if (!actual.equals(expected)) throw new Error(`Executable evidence mismatch at 0x${evidence.va.toString(16)}: expected ${evidence.bytes}, got ${actual.toString("hex")}`);
  return { ...evidence, va: `0x${evidence.va.toString(16).padStart(8, "0")}`, matched: true };
}

function readVerified(path, label, expectedSize, expectedSha256) {
  const buffer = readFileSync(path);
  if (buffer.length !== expectedSize) throw new Error(`${label} size mismatch: expected ${expectedSize}, got ${buffer.length}`);
  const actualSha256 = sha256(buffer);
  if (actualSha256 !== expectedSha256) throw new Error(`${label} SHA-256 mismatch: expected ${expectedSha256}, got ${actualSha256}`);
  return { path, size: buffer.length, sha256: actualSha256, buffer };
}

function readVerifiedJson(path, label, expectedSha256) {
  const buffer = readFileSync(path);
  const actualSha256 = sha256(buffer);
  if (actualSha256 !== expectedSha256) throw new Error(`${label} SHA-256 mismatch: expected ${expectedSha256}, got ${actualSha256}`);
  let parsed;
  try { parsed = JSON.parse(buffer.toString("utf8")); } catch (error) { throw new Error(`Could not parse ${label}: ${error.message}`); }
  if (parsed.sourceSha256 !== EXPECTED_EXECUTABLE_SHA256) throw new Error(`${label} source SHA-256 mismatch: expected ${EXPECTED_EXECUTABLE_SHA256}, got ${parsed.sourceSha256}`);
  return { path, size: buffer.length, sha256: actualSha256, buffer, parsed };
}

function readInt16(input, name) { const value = input?.[name]; if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) throw new Error(`${name} must be a signed int16: ${value}`); return value; }
function readUInt8(input, name) { const value = input?.[name]; if (!Number.isInteger(value) || value < 0 || value > 0xff) throw new Error(`${name} must be an unsigned byte: ${value}`); return value; }
function readUInt16(input, name) { const value = input?.[name]; if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new Error(`${name} must be an unsigned word: ${value}`); return value; }
function readUInt32(input, name) { const value = input?.[name]; if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new Error(`${name} must be an unsigned dword: ${value}`); return value; }
function toInt32(rawDword) { return rawDword > 0x7fffffff ? rawDword - 0x1_0000_0000 : rawDword; }
function sameArray(actual, expected) { return Array.isArray(actual) && actual.length === expected.length && actual.every((value, index) => JSON.stringify(value) === JSON.stringify(expected[index])); }
function omitBuffer({ buffer, parsed, ...value }) { return value; }
function sha256(buffer) { return createHash("sha256").update(buffer).digest("hex"); }
function parseArgs(argv) { const args = {}; for (let index = 0; index < argv.length; index += 1) { const arg = argv[index]; if (!["--executable", "--functions", "--references"].includes(arg)) throw new Error(`Unknown argument: ${arg}`); const value = argv[index + 1]; if (!value) throw new Error(`${arg} requires a path`); args[arg.slice(2)] = value; index += 1; } return args; }
