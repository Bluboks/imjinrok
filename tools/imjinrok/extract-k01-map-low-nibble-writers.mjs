#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePeImage } from "./pe-image.mjs";

export const EXPECTED_EXECUTABLE_SHA256 = "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_EXECUTABLE_SIZE = 843_833;
export const EXPECTED_FUNCTIONS_SHA256 = "c10ea2de1f4998411d52443419c9a7f52ff7f9c18e79bd4115ba197d2f5bebc3";
export const EXPECTED_REFERENCES_SHA256 = "df11ff3713988ef22b3390b5b0ae7b4a87464b5de547a4866e1c8ec8a0bcaf4c";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_FUNCTIONS_PATH = "analysis/generated/imjinrok2/functions.json";
const DEFAULT_REFERENCES_PATH = "analysis/generated/imjinrok2/references.json";
const STANDARD_ADDRESS_CONSTRUCTION_VAS = [
  "0x00426133", "0x0045f566", "0x00464817", "0x00464d45", "0x00464f7c", "0x004659d5", "0x00465a9e",
  "0x0046708a", "0x00467c76", "0x004686e2", "0x00469370", "0x00469554", "0x00469aa9", "0x00469e49",
  "0x0046a1e9", "0x0046a570", "0x0046dc48", "0x0046df17", "0x0046e071", "0x0046e217", "0x0046e2d8",
];
const READ_SITES = [
  { constructionVa: "0x00426133", bytes: "8d 84 80 5d 16 00 00 8d 14 c0 8a 84 91 f0 ff ab 00 24 0f 66 0f be c0 66" },
  { constructionVa: "0x0045f566", bytes: "8d 84 80 5d 16 00 00 8d 04 c0 8a 8c 82 f0 ff ab 00 80 e1 0f 66 0f be c1" },
  { constructionVa: "0x00464d45", bytes: "8d 84 b6 5d 16 00 00 8d 04 c0 8d 0c 83 8a 14 39 80 e2 0f 66 0f be c2 66" },
  { constructionVa: "0x00464f7c", bytes: "8d bc bf 5d 16 00 00 8d 14 ff 8d 04 90 8a 0c 30 80 e1 0f 66 0f be c1 66" },
  { constructionVa: "0x004659d5", bytes: "8d 84 80 5d 16 00 00 8d 04 c0 8d 14 86 8a 04 0a 24 0f 66 0f be c0 66 3d" },
  { constructionVa: "0x00465a9e", bytes: "8d 84 80 5d 16 00 00 8d 04 c0 8d 14 86 8a 04 0a 24 0f 66 0f be c0 66 3d" },
  { constructionVa: "0x0046708a", bytes: "8d 94 80 5d 16 00 00 8d 14 d2 8d 14 91 8a 14 32 80 e2 0f 66 0f be d2 66" },
  { constructionVa: "0x00467c76", bytes: "8d 84 80 5d 16 00 00 8d 14 c0 0f bf c3 8d 04 90 8a 14 38 80 e2 0f 66 0f" },
  { constructionVa: "0x004686e2", bytes: "8d 84 ad 5d 16 00 00 8d 04 c0 8d 0c 82 8a 04 31 24 0f 66 0f be c0 66 85" },
  { constructionVa: "0x00469370", bytes: "8d 84 80 5d 16 00 00 8d 14 c0 8d 04 91 8a 0c 30 80 e1 0f 66 0f be c1 66" },
  { constructionVa: "0x00469554", bytes: "8d 84 80 5d 16 00 00 8d 14 c0 8d 04 91 8a 0c 30 80 e1 0f 66 0f be c1 66" },
  { constructionVa: "0x00469aa9", bytes: "8d 84 ad 5d 16 00 00 8d 04 c0 8d 0c 81 8a 04 31 24 0f 66 0f be c0 66 3d" },
  { constructionVa: "0x00469e49", bytes: "8d 84 ad 5d 16 00 00 8d 04 c0 8d 0c 81 8a 04 31 24 0f 66 0f be c0 66 3d" },
  { constructionVa: "0x0046a1e9", bytes: "8d 84 ad 5d 16 00 00 8d 04 c0 8d 0c 81 8a 04 31 24 0f 66 0f be c0 66 3d" },
  { constructionVa: "0x0046a570", bytes: "8d 84 80 5d 16 00 00 8d 14 c0 8d 04 91 8a 0c 30 80 e1 0f 66 0f be c1 66" },
  { constructionVa: "0x0046e2d8", bytes: "8d 8c 89 5d 16 00 00 8d 0c c9 8d 14 8a 8a 0c 32 80 e1 0f 66 0f be c9 66" },
];
const WRITER_SITES = [
  { functionEntry: "0x004646e0", constructionVa: "0x00464817", storeVa: "0x0046482f", lowNibble: 2, bytes: "8d 84 80 5d 16 00 00 8d 14 c0 8d 04 91 8a 0c 28 03 c5 80 e1 f2 80 c9 02 88 08" },
  { functionEntry: "0x0046dbc0", constructionVa: "0x0046dc48", storeVa: "0x0046dc5f", lowNibble: 2, bytes: "8d 84 bf 5d 16 00 00 8d 14 c0 8d 04 93 03 c6 8a 08 80 e1 f2 80 c9 02 88 08" },
  { functionEntry: "0x0046dbc0", constructionVa: "0x0046df17", storeVa: "0x0046df2f", lowNibble: 1, bytes: "8d 84 80 5d 16 00 00 8d 14 c0 8d 04 91 8a 0c 30 03 c6 80 e1 f1 80 c9 01 88 08" },
  { functionEntry: "0x0046dfd0", constructionVa: "0x0046e071", storeVa: "0x0046e08a", lowNibble: 2, bytes: "8d 84 80 5d 16 00 00 8d 04 c0 8d 0c 87 8d 04 31 8a 0c 31 80 e1 f2 80 c9 02 88 08" },
  { functionEntry: "0x0046dfd0", constructionVa: "0x0046e217", storeVa: "0x0046e22f", lowNibble: 1, bytes: "8d 84 80 5d 16 00 00 8d 14 c0 8d 04 91 8a 0c 30 03 c6 80 e1 f1 80 c9 01 88 08" },
];
const FUNCTION_PROVENANCE = [
  { entry: "0x004646e0", bodyRange: "0x004646e0-0x004648ca", bodySize: 491, instructionCount: 137, instructionSha256: "4399ed2c86fa3810846148f11475757effaa8f87fdcc5f5f36f0babb4ee03f21", rawBodySha256: "036a602fc7cdf5ea37c5da2146b2e90e4b7612544d3078e18a55ef94346ba8c9", callers: ["0x00445990"], callees: ["0x0046d620", "0x0047def0"] },
  { entry: "0x0046dbc0", bodyRange: "0x0046dbc0-0x0046dfc4", bodySize: 1029, instructionCount: 329, instructionSha256: "994f7743c1287168cc85e375ac4ff3e91a02b87248a0e19ed890b53602b63902", rawBodySha256: "ed2d5cf7fbb1c0736ac671ffbb10a299e862ad6869e8138d61ca45bf03d22e17", callers: ["0x0046ba00", "0x0046dbc0"], callees: ["0x00462bb0", "0x00463a50", "0x0046d730", "0x0046dbc0"] },
  { entry: "0x0046dfd0", bodyRange: "0x0046dfd0-0x0046e29f", bodySize: 720, instructionCount: 219, instructionSha256: "5e3d0c0e35540a7c2c349bb83cc6e511b40c0cf3ebe1c6891a19b39448e78552", rawBodySha256: "17efb630c7e96349b0300b89927c3619867fb41353ae537530e2c095bcda3664", callers: ["0x0046ba00", "0x0046dfd0"], callees: ["0x00462bb0", "0x0046d980", "0x0046dfd0"] },
  { entry: "0x0046ba00", bodyRange: "0x0046ba00-0x0046ba58", bodySize: 89, instructionCount: 34, instructionSha256: "8325a4ffc05cc127cc5798ac31ef2ceb324f241af2dec116e266f40e12afecd9", rawBodySha256: "7233c1a8619b985ccac54d72f03ef7a9617bacab27dc34a0424ef63d7f701abf", callers: ["0x00463a50", "0x0046af80", "0x0049a4d0"], callees: ["0x00463f50", "0x0046dbc0", "0x0046dfd0"] },
];
const REQUIRED_CALL_EDGES = [
  ["0x00445a33", "0x00445990", "0x004646e0"], ["0x0046c073", null, "0x004646e0"],
  ["0x0046ba17", "0x0046ba00", "0x0046dfd0"], ["0x0046ba4e", "0x0046ba00", "0x0046dbc0"],
  ["0x0046dd29", "0x0046dbc0", "0x0046dbc0"], ["0x0046df69", "0x0046dbc0", "0x0046dbc0"],
  ["0x0046e0b7", "0x0046dfd0", "0x0046dfd0"], ["0x0046e243", "0x0046dfd0", "0x0046dfd0"],
];

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(extractK01MapLowNibbleWriters(args), null, 2)}\n`);
}

export function extractK01MapLowNibbleWriters({ executablePath = DEFAULT_EXECUTABLE_PATH, functionsPath = DEFAULT_FUNCTIONS_PATH, referencesPath = DEFAULT_REFERENCES_PATH } = {}) {
  const executable = readVerified(executablePath, "original executable", EXPECTED_EXECUTABLE_SIZE, EXPECTED_EXECUTABLE_SHA256);
  const image = parsePeImage(executable.buffer, executablePath);
  const staticAnalysis = verifyStaticAnalysis(executable.buffer, image, functionsPath, referencesPath);
  const scannedConstructions = scanStandardAddressConstructions(executable.buffer, image);
  if (!sameArray(scannedConstructions, STANDARD_ADDRESS_CONSTRUCTION_VAS)) throw new Error(`Standard low-nibble address-form scan mismatch: expected ${STANDARD_ADDRESS_CONSTRUCTION_VAS.length} sites, got ${scannedConstructions.length}`);
  const readSites = READ_SITES.map((site) => verifyReadSite(executable.buffer, image, site));
  const writers = WRITER_SITES.map((site) => verifyWriterSite(executable.buffer, image, site));
  return {
    question: "Which direct writes using the exact map+0x32514+x*180+y standard address form set its low nibble?",
    analysisStatus: "static-confirmed-for-the-standard-address-form-direct-writer-set",
    reproductionStatus: "complete-for-byte-transform-and-source-binding-vectors",
    implementationStatus: "no-product-port-in-this-extractor",
    sources: { executable: omitBuffer(executable) },
    field: { baseOffset: "0x00032514", address: "map + 0x00032514 + x * 180 + y", elementWidthBytes: 1, storageOrder: "x stride 180, y stride 1" },
    standardAddressScan: { signature: "LEA reg,[reg+reg*4+0x165d] followed by x*9 then *4 plus y", totalOccurrences: scannedConstructions.length, constructions: scannedConstructions, readSites, directWriters: writers },
    staticAnalysis,
    transforms: { lowNibbleOne: transformLowNibbleOneVectors(), lowNibbleTwo: transformLowNibbleTwoVectors() },
    residualBoundary: "This closes only direct writers reached by the locked standard address-form scan. It does not establish a global absence of aliasing or computed writers, global mask WORD[0x004bdfd0] producers, or derived-flag writers.",
  };
}

export function writeLowNibbleOne(oldValue) { return transformLowNibble(oldValue, 1); }
export function writeLowNibbleTwo(oldValue) { return transformLowNibble(oldValue, 2); }
export function isStandardLowNibbleAddressConstructionBytes(bytes, offset = 0) {
  return bytes[offset] === 0x8d && bytes[offset + 3] === 0x5d && bytes[offset + 4] === 0x16 && bytes[offset + 5] === 0 && bytes[offset + 6] === 0;
}

function transformLowNibble(oldValue, lowNibble) {
  if (!Number.isInteger(oldValue) || oldValue < 0 || oldValue > 0xff) throw new Error(`oldValue must be an unsigned byte: ${oldValue}`);
  return (oldValue & (lowNibble === 1 ? 0xf1 : 0xf2)) | lowNibble;
}

function transformLowNibbleOneVectors() { return [0x00, 0x0f, 0xa5, 0xff].map((oldValue) => ({ oldValue, result: writeLowNibbleOne(oldValue) })); }
function transformLowNibbleTwoVectors() { return [0x00, 0x0f, 0xa5, 0xff].map((oldValue) => ({ oldValue, result: writeLowNibbleTwo(oldValue) })); }

function scanStandardAddressConstructions(buffer, image) {
  const text = image.sections.find((section) => section.name === ".text");
  if (!text) throw new Error("PE image does not contain .text");
  const matches = [];
  for (let rawOffset = text.rawPointer; rawOffset + 7 <= text.rawPointer + text.rawSize; rawOffset += 1) {
    if (isStandardLowNibbleAddressConstructionBytes(buffer, rawOffset)) {
      const va = image.rawOffsetToVa(rawOffset);
      if (va === undefined) throw new Error(`Could not convert raw offset ${rawOffset} to VA`);
      matches.push(formatVa(va));
    }
  }
  return matches;
}

function verifyReadSite(buffer, image, site) {
  const expected = Buffer.from(site.bytes.replaceAll(" ", ""), "hex");
  const rawOffset = image.vaToRawOffset(Number.parseInt(site.constructionVa, 16));
  if (rawOffset === undefined) throw new Error(`Read construction ${site.constructionVa} is outside mapped PE sections`);
  const actual = buffer.subarray(rawOffset, rawOffset + expected.length);
  if (!actual.equals(expected)) throw new Error(`Read opcode anchor mismatch at ${site.constructionVa}`);
  if (!actual.includes(0x8a) || actual.includes(Buffer.from([0x88, 0x08]))) throw new Error(`Read classification mismatch at ${site.constructionVa}`);
  return { constructionVa: site.constructionVa, classification: "read", bytes: site.bytes };
}

function verifyWriterSite(buffer, image, site) {
  const expected = Buffer.from(site.bytes.replaceAll(" ", ""), "hex");
  const constructionVa = Number.parseInt(site.constructionVa, 16);
  const rawOffset = image.vaToRawOffset(constructionVa);
  if (rawOffset === undefined) throw new Error(`Writer construction ${site.constructionVa} is outside mapped PE sections`);
  const actual = buffer.subarray(rawOffset, rawOffset + expected.length);
  if (!actual.equals(expected)) throw new Error(`Writer opcode anchor mismatch at ${site.constructionVa}`);
  const storeOffset = image.vaToRawOffset(Number.parseInt(site.storeVa, 16));
  if (storeOffset === undefined || !buffer.subarray(storeOffset, storeOffset + 2).equals(Buffer.from([0x88, 0x08]))) throw new Error(`Writer store mismatch at ${site.storeVa}`);
  return { ...site, highNibblePreserved: true, lowNibbleExact: site.lowNibble };
}

function verifyStaticAnalysis(executableBuffer, image, functionsPath, referencesPath) {
  const functionsSource = readVerifiedJson(functionsPath, "static functions", EXPECTED_FUNCTIONS_SHA256);
  const referencesSource = readVerifiedJson(referencesPath, "static references", EXPECTED_REFERENCES_SHA256);
  if (!Array.isArray(functionsSource.parsed.functions) || !Array.isArray(referencesSource.parsed.references)) throw new Error("Static analysis functions or references payload is not an array");
  const functionProvenance = FUNCTION_PROVENANCE.map((specification) => verifyFunction(functionsSource.parsed.functions, executableBuffer, image, specification));
  const requiredCallEdges = REQUIRED_CALL_EDGES.map(([from, fromFunctionEntry, to]) => verifyCallEdge(referencesSource.parsed.references, { from, fromFunctionEntry, to }));
  return { functions: { ...omitBuffer(functionsSource), sourceSha256: functionsSource.parsed.sourceSha256, functionProvenance }, references: { ...omitBuffer(referencesSource), sourceSha256: referencesSource.parsed.sourceSha256, requiredCallEdges } };
}

function verifyFunction(functions, executableBuffer, image, specification) {
  const record = functions.find(({ entry }) => entry === specification.entry);
  if (!record || record.bodySize !== specification.bodySize || record.instructionCount !== specification.instructionCount || record.instructionSha256 !== specification.instructionSha256 || !sameArray(record.bodyRanges, [specification.bodyRange]) || !sameArray(record.callers, specification.callers) || !sameArray(record.callees, specification.callees)) throw new Error(`Static function provenance mismatch for ${specification.entry}`);
  const rawOffset = image.vaToRawOffset(Number.parseInt(specification.entry, 16));
  if (rawOffset === undefined) throw new Error(`Function ${specification.entry} is outside mapped PE sections`);
  const rawBodySha256 = sha256(executableBuffer.subarray(rawOffset, rawOffset + specification.bodySize));
  if (rawBodySha256 !== specification.rawBodySha256) throw new Error(`Raw function body SHA-256 mismatch for ${specification.entry}`);
  return { entry: specification.entry, bodyRange: specification.bodyRange, bodySize: specification.bodySize, instructionCount: specification.instructionCount, rawBodySha256, instructionSha256: specification.instructionSha256, callers: record.callers, callees: record.callees };
}

function verifyCallEdge(references, expected) {
  const matches = references.filter((reference) => reference.from === expected.from && reference.fromFunctionEntry === expected.fromFunctionEntry && reference.to === expected.to && reference.type === "UNCONDITIONAL_CALL");
  if (matches.length !== 1) throw new Error(`Expected exactly one unconditional call ${expected.fromFunctionEntry}:${expected.from}->${expected.to}, got ${matches.length}`);
  const reference = matches[0];
  if (reference.source !== "DEFAULT" || reference.operandIndex !== 0 || reference.primary !== true || reference.fromBlock !== ".text" || reference.toBlock !== ".text") throw new Error(`Static call provenance mismatch at ${expected.from}`);
  return { from: reference.from, fromFunctionEntry: reference.fromFunctionEntry, to: reference.to, type: reference.type };
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

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!['--executable', '--functions', '--references'].includes(argument)) throw new Error(`Unknown argument: ${argument}`);
    const value = argv[index + 1];
    if (!value) throw new Error(`${argument} requires a path`);
    args[{ "--executable": "executablePath", "--functions": "functionsPath", "--references": "referencesPath" }[argument]] = value;
    index += 1;
  }
  return args;
}

function sameArray(actual, expected) { return Array.isArray(actual) && actual.length === expected.length && actual.every((value, index) => JSON.stringify(value) === JSON.stringify(expected[index])); }
function omitBuffer({ buffer, parsed, ...value }) { return value; }
function sha256(buffer) { return createHash("sha256").update(buffer).digest("hex"); }
function formatVa(value) { return `0x${value.toString(16).padStart(8, "0")}`; }
