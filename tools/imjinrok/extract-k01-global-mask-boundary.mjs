#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePeImage } from "./pe-image.mjs";
import { readJson, verifyEvidencePoint, verifySeededFunction } from "./static-evidence.mjs";

const EXPECTED_EXE = { size: 843_833, sha256: "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e" };
const EXPECTED = {
  functions: "7e071fdfe425d22447780c265fe1d3fd271a1bedd1773682bebcb8ddc6d2e16e",
  references: "f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5",
  seeds: "386b0f4e86c3376f34fe2b50fedb7e45b762c30784d4ebcc0387aa6f431811b2",
};
const DEFAULTS = { executablePath: "original/imjinrok2/imjinrok2.exe", functionsPath: "analysis/generated/imjinrok2/functions.json", referencesPath: "analysis/generated/imjinrok2/references.json", seedsPath: "analysis/generated/imjinrok2/seeds.json" };
const FUNCTION_SPECS = [
  { entry: "0x00437650", bodyRange: "0x00437650-0x00438025", bodySize: 2518, instructionCount: 539, instructionSha256: "4605056775f6f43c9b2065ea5a4ddff5570137eb87587f4a09d2018618e13c28", rawBodySha256: "16282bd634d28738d1f1e5eba179069f154537c1c86ce7fbcf57aa1f54bd5fd6", callers: ["0x00483c50"], callees: ["0x004291d0", "0x0042e280", "0x00438790", "0x0043aa80", "0x0043c9c0", "0x004550c0", "0x0045bf30", "0x0045bf40", "0x0047d160", "0x0047fd90", "0x00481310"] },
  { entry: "0x0045f0f0", bodyRange: "0x0045f0f0-0x0045f0fc", bodySize: 13, instructionCount: 3, instructionSha256: "bdd071fbd2563105b8984a1b3a67630fe46022ea2185dfc5d2facaa7d3e2bd1e", rawBodySha256: "97dd35c13d3a1c70908ae6318fdfc6d29137cbaea95fa8ec9a17c661564217b5", callers: [], callees: [] },
  { entry: "0x00465960", bodyRange: "0x00465960-0x00465a12", bodySize: 179, instructionCount: 55, instructionSha256: "36b8864d7c2aadb9d0a93172caa5d01d3c6a2d3921880334ce4547f452703ac0", rawBodySha256: "2b1f10655b34fce18f72a990661788d7298f0dc6e8c1ef9f99feb4e23e9a45d0", callers: ["0x00465d50", "0x0046e450"], callees: [] },
];
const TARGET_REFERENCES = [
  ["0x00437e9a", "READ", "0x00437650"], ["0x0045f0f0", "READ", "0x0045f0f0"], ["0x004659f1", "READ", "0x00465960"],
];
const ANCHORS = [
  { va: 0x00437e80, bytes: "66 83 be 26 01 00 00 02 7f 10 66 8b 0d e8 3f aa 00 66 89 8e ee 01 00 00 eb 0e 66 8b 15 d0 df 4b 00 66 89 96 ee 01 00 00", meaning: "FUN_00437650 selects the 0x00aa3fe8 runtime copy when owner WORD+0x126 is at most 2; otherwise it loads WORD[0x004bdfd0]." },
  { va: 0x0045f0e0, bytes: "e9 0b 00 00 00", meaning: "The preceding stub jumps directly to the bound three-instruction runtime-copy function." },
  { va: 0x0045f0f0, bytes: "66 a1 d0 df 4b 00 66 a3 e8 3f aa 00 c3", meaning: "FUN_0045f0f0 copies WORD[0x004bdfd0] to WORD[0x00aa3fe8] and returns." },
  { va: 0x004659f1, bytes: "66 8b 15 d0 df 4b 00 66 8b 84 79 f4 27 02 00 66 81 ca 04 20", meaning: "The existing eligibility predicate directly reads the global WORD and ORs 0x2004 before its final flag test." },
  { va: 0x004bdfd0, bytes: "6a 13", meaning: "The initialized .data bytes are little-endian WORD 0x136a." },
];

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.stdout.write(`${JSON.stringify(extractK01GlobalMaskBoundary(parseArgs(process.argv.slice(2))), null, 2)}\n`);

export function extractK01GlobalMaskBoundary(options = {}) {
  const paths = { ...DEFAULTS, ...options };
  const executable = readVerified(paths.executablePath, "original executable", EXPECTED_EXE);
  const image = parsePeImage(executable.buffer, paths.executablePath);
  const functions = readVerifiedJson(paths.functionsPath, "static functions", EXPECTED.functions);
  const references = readVerifiedJson(paths.referencesPath, "static references", EXPECTED.references);
  const seeds = readVerifiedJson(paths.seedsPath, "static seeds", EXPECTED.seeds);
  const functionProvenance = FUNCTION_SPECS.map((spec) => verifyFunction(functions.parsed.functions, executable.buffer, image, spec));
  const seed = seeds.parsed.seeds.find((candidate) => candidate.address === "0x0045f0f0");
  if (!seed || seed.label !== "global-mask-runtime-copy" || seed.functionEntry !== "0x0045f0f0") throw new Error("Global-mask runtime-copy seed mismatch");
  const seededFunction = verifySeededFunction(executable.buffer, image, seeds.parsed, { entry: "0x0045f0f0", bodyRange: "0x0045f0f0-0x0045f0fc", blockCount: 1, instructionCount: 3, bodySha256: "97dd35c13d3a1c70908ae6318fdfc6d29137cbaea95fa8ec9a17c661564217b5" });
  const targetReferences = references.parsed.references.filter((reference) => reference.to === "0x004bdfd0");
  if (!same(targetReferences.map(({ from, type, fromFunctionEntry }) => [from, type, fromFunctionEntry]), TARGET_REFERENCES)) throw new Error("Global-mask canonical direct-reference set mismatch");
  const directWrites = targetReferences.filter(({ type }) => type === "WRITE");
  if (directWrites.length !== 0) throw new Error("Global-mask canonical direct-write set is nonempty");
  const jump = references.parsed.references.filter((reference) => reference.from === "0x0045f0e0" && reference.to === "0x0045f0f0" && reference.type === "UNCONDITIONAL_JUMP");
  if (jump.length !== 1 || jump[0].fromFunctionEntry !== null) throw new Error("Global-mask copy jump mismatch");
  return {
    question: "What source-bound initialization, runtime-copy, and direct-reference boundary is established for WORD[0x004bdfd0]?",
    analysisStatus: "static-confirmed-bounded-negative-for-canonical-direct-references",
    reproductionStatus: "complete-for-initialized-mask-or-copy-and-owner-branch-vectors",
    implementationStatus: "no-product-port-in-this-extractor",
    sources: { executable: omit(executable) },
    staticAnalysis: { functions: summary(functions), references: summary(references), seeds: summary(seeds), functionProvenance, seededFunction, targetReferences: targetReferences.map(({ from, to, type, fromFunctionEntry }) => ({ from, to, type, fromFunctionEntry })), directWriteCount: directWrites.length, copyJump: { from: jump[0].from, to: jump[0].to, type: jump[0].type, fromFunctionEntry: jump[0].fromFunctionEntry } },
    executableEvidence: ANCHORS.map((anchor) => verifyEvidencePoint(executable.buffer, image, anchor)),
    initializedMask: { address: "0x004bdfd0", littleEndianBytes: "6a 13", word: 0x136a },
    copyAndSelection: { copy: "FUN_0045f0f0 copies global WORD to 0x00aa3fe8", selection: "FUN_00437650 uses 0x00aa3fe8 when owner WORD+0x126 <= 2; otherwise it uses 0x004bdfd0", eligibilityContract: "docs/reverse-engineering/mechanics/k01-map-eligibility-predicate.md#exact-short-circuit와-반환" },
    vectors: vectors(),
    residualBoundary: "Zero canonical direct WRITEs to 0x004bdfd0 proves neither the absence of alias/computed addressing nor loader/runtime mutation; no global producer or update ordering is claimed.",
  };
}

export function copyGlobalMask(globalMaskWord) { return { runtimeCopyWord: word(globalMaskWord, "globalMaskWord") }; }
export function selectGlobalMask(ownerWord, runtimeCopyWord, globalMaskWord) { const owner = word(ownerWord, "ownerWord"); const source = owner <= 2 ? "runtime-copy-0x00aa3fe8" : "direct-global-0x004bdfd0"; return { source, selectedWord: source.startsWith("runtime") ? word(runtimeCopyWord, "runtimeCopyWord") : word(globalMaskWord, "globalMaskWord") }; }
export function eligibilityMask(globalMaskWord) { return word(globalMaskWord, "globalMaskWord") | 0x2004; }

function vectors() { const initialized = 0x136a; return [
  { id: "file-initialized-mask", input: { littleEndianBytes: "6a 13" }, output: { globalMaskWord: initialized } },
  { id: "eligibility-or", input: { globalMaskWord: initialized }, output: { eligibilityMask: eligibilityMask(initialized) } },
  { id: "runtime-copy", input: { globalMaskWord: initialized }, output: copyGlobalMask(initialized) },
  { id: "owner-at-two-selects-copy", input: { ownerWord: 2, runtimeCopyWord: 0x5555, globalMaskWord: initialized }, output: selectGlobalMask(2, 0x5555, initialized) },
  { id: "owner-at-three-selects-global", input: { ownerWord: 3, runtimeCopyWord: 0x5555, globalMaskWord: initialized }, output: selectGlobalMask(3, 0x5555, initialized) },
]; }
function verifyFunction(records, buffer, image, spec) { const record = records.find(({ entry }) => entry === spec.entry); if (!record || record.bodySize !== spec.bodySize || record.instructionCount !== spec.instructionCount || record.instructionSha256 !== spec.instructionSha256 || !same(record.bodyRanges, [spec.bodyRange]) || !same(record.callers, spec.callers) || !same(record.callees, spec.callees)) throw new Error(`Function provenance mismatch for ${spec.entry}`); const raw = image.vaToRawOffset(Number.parseInt(spec.entry, 16)); const rawBodySha256 = sha256(buffer.subarray(raw, raw + spec.bodySize)); if (rawBodySha256 !== spec.rawBodySha256) throw new Error(`Raw body SHA-256 mismatch for ${spec.entry}`); return { ...spec, rawBodySha256 }; }
function readVerified(path, label, expected) { const buffer = readFileSync(path); if (buffer.length !== expected.size) throw new Error(`${label} size mismatch: expected ${expected.size}, got ${buffer.length}`); const sha256Value = sha256(buffer); if (sha256Value !== expected.sha256) throw new Error(`${label} SHA-256 mismatch: expected ${expected.sha256}, got ${sha256Value}`); return { path, size: buffer.length, sha256: sha256Value, buffer }; }
function readVerifiedJson(path, label, expectedSha256) { const buffer = readFileSync(path); const sha256Value = sha256(buffer); if (sha256Value !== expectedSha256) throw new Error(`${label} SHA-256 mismatch: expected ${expectedSha256}, got ${sha256Value}`); const parsed = readJson(path); if (parsed.sourceSha256 !== EXPECTED_EXE.sha256) throw new Error(`${label} source SHA-256 mismatch`); return { path, size: buffer.length, sha256: sha256Value, buffer, parsed }; }
function summary({ buffer, parsed, ...value }) { return { ...value, sourceSha256: parsed.sourceSha256 }; }
function word(value, name) { if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new Error(`${name} must be an unsigned word: ${value}`); return value; }
function sha256(buffer) { return createHash("sha256").update(buffer).digest("hex"); }
function same(actual, expected) { return Array.isArray(actual) && actual.length === expected.length && actual.every((value, index) => JSON.stringify(value) === JSON.stringify(expected[index])); }
function omit({ buffer, parsed, ...value }) { return value; }
function parseArgs(argv) { const result = {}; for (let i = 0; i < argv.length; i += 1) { const argument = argv[i]; const key = { "--executable": "executablePath", "--functions": "functionsPath", "--references": "referencesPath", "--seeds": "seedsPath" }[argument]; if (!key) throw new Error(`Unknown argument: ${argument}`); if (!argv[i + 1]) throw new Error(`${argument} requires a path`); result[key] = argv[++i]; } return result; }
