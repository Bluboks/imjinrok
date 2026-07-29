#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readPeImage, toHex } from "./pe-image.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const EXPECTED_EXE_SHA256 = "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
const DEFAULTS = { executablePath: resolve(ROOT, "original/imjinrok2/imjinrok2.exe"), functionsPath: resolve(ROOT, "analysis/generated/imjinrok2/functions.json"), referencesPath: resolve(ROOT, "analysis/generated/imjinrok2/references.json"), jumpTablesPath: resolve(ROOT, "analysis/generated/imjinrok2/jump-tables.json") };
const ARTIFACTS = { functions: [1467804, "c10ea2de1f4998411d52443419c9a7f52ff7f9c18e79bd4115ba197d2f5bebc3"], references: [17206553, "df11ff3713988ef22b3390b5b0ae7b4a87464b5de547a4866e1c8ec8a0bcaf4c"], jumpTables: [607724, "0ae517eb172f61b974ca7a4411e64c1cc42065c462ed53b3065ab2da633dfe2f"] };
const FUNCTION_CONTRACTS = [
  [0x00446420, 33, "439694b6de69137d87c47d6687e97d8a74f2ad073c808b443606a0b42906910a"],
  [0x0045f9c0, 801, "b694ee213a1b5f189ed7455e00690dcb29d970eca6ea87ef1f59c42c611cfb24"],
  [0x004732a0, 176, "4bb7436582877b18af203f90aa3609e84f39dfc50f554ec2789f6ac6774856e3"],
  [0x00481c50, 199, "823cf8ad9d1b831c9183293c68646fa1e1641b0f8074fc3559a4f8d2feade5d8"],
  [0x00485890, 44, "fb53dab9a92b41ace1d6e8c44d158a836f1e3bffdee6301f38361a08a1dbcde1"],
  [0x0045f250, 49, "7812f6c4db08302e4cbb110591317aaac9a834995fd9e140a28e22dad618dfe5"],
  [0x004a5070, 26, "1a170bc0fc85185f325fbca82a3f4d0f6c482c55f1858464d0cb5862c4dd006e"],
];
const REQUIRED_CALLS = [
  [0x0044647e, 0x00446420, 0x00474ae0], [0x00460372, 0x0045f9c0, 0x00474ae0],
  [0x00473308, 0x004732a0, 0x00474ae0], [0x00481e84, 0x00481c50, 0x00474ae0],
  [0x0045f26b, 0x0045f250, 0x004a5070], [0x004a5090, 0x004a5070, 0x00485890],
];
const WRITE_SET = [
  { site: "0x00446483", caller: "0x00446420", target: "0x00c06e20", type: "WRITE" },
  { site: "0x00460377", caller: "0x0045f9c0", target: "0x00c06e20", type: "WRITE" },
  { site: "0x0047331c", caller: "0x004732a0", target: "0x00c06e20", type: "WRITE" },
  { site: "0x00481e89", caller: "0x00481c50", target: "0x00c06e20", type: "WRITE" },
  { site: "0x0048591a", caller: "0x00485890", target: "0x00c06e20", type: "WRITE" },
  { site: "0x00485942", caller: "0x00485890", target: "0x00c06e20", type: "WRITE" },
];
const WRITE_SET_SHA256 = "ed5440303ed3a488de53bbc998f83bb67e1154c91f3f618269557de11574eb62";
const A5070_CLOSURE_SHA256 = "7404706e0ac5459e9b0ba112ab3bd238d77c1bb25696d239306335769916938b";
const ANCHORS = [
  ["shared-teardown-exact-one-clear", 0x00446470, "83 3d 20 6e c0 00 01 75 13 b9 68 b0 a9 00 e8 5d e6 02 00 66 c7 05 20 6e c0 00 00 00", "FUN_00446420 clears mode only after WORD mode equals one and FUN_00474ae0"],
  ["main-loop-bp-zero", 0x0045fa40, "33 ed", "main loop initializes BP to zero before state dispatch"],
  ["state-23-exact-one-clear", 0x00460364, "66 39 35 20 6e c0 00 75 11 b9 68 b0 a9 00 e8 69 47 01 00 66 89 2d 20 6e c0 00", "raw-23 target-10 branch clears mode from BP only when mode equals one"],
  ["scheduler-timeout-di-zero", 0x004732b1, "53 55 56 57 33 ff", "FUN_004732a0 initializes DI to zero"],
  ["scheduler-timeout-clear", 0x004732f9, "66 83 3d 20 6e c0 00 01 75 34 b9 68 b0 a9 00 e8 d3 17 00 00 68 c4 22 4c 00 68 44 ab 4c 00 68 18 94 55 00 66 89 3d 20 6e c0 00", "reached timeout branch clears mode from DI only when mode equals one"],
  ["large-cleanup-bp-zero", 0x00481dcb, "33 c0 33 ed", "FUN_00481c50 initializes BP to zero before its mode comparison"],
  ["large-cleanup-clear", 0x00481e75, "66 83 3d 20 6e c0 00 01 75 11 b9 68 b0 a9 00 e8 57 2c ff ff 66 89 2d 20 6e c0 00", "FUN_00481c50 clears mode from BP only when mode equals one"],
  ["mode-writer-arg-one-and-two", 0x00485900, "83 3d f4 df 4b 00 00 75 31 66 8b 44 24 04 66 3d 01 00 75 16 66 a1 14 c8 c5 00 66 c7 05 20 6e c0 00 01 00 66 a3 44 cc bc 00 c3 66 3d 02 00 75 1b b9 68 b0 a9 00 e9 a6 f1 fe ff 66 83 7c 24 04 01 75 09 66 c7 05 20 6e c0 00 00 00", "FUN_00485890 arg one writes guard-dependent mode; arg two takes no mode store"],
  ["source-bound-a5070-caller", 0x0045f26b, "e8 00 5e 04 00", "FUN_0045f250 calls FUN_004a5070"],
  ["a5070-push-two-mode-call", 0x004a508e, "6a 02 e8 fb 07 fe ff", "FUN_004a5070 pushes WORD two then calls FUN_00485890"],
];

export function extractK01ModeDirectWriters({ executablePath = DEFAULTS.executablePath, functionsPath = DEFAULTS.functionsPath, referencesPath = DEFAULTS.referencesPath, jumpTablesPath = DEFAULTS.jumpTablesPath } = {}) {
  const { buffer, image } = readPeImage(executablePath); const sourceSha256 = hash(buffer); equal(sourceSha256, EXPECTED_EXE_SHA256, "original EXE SHA-256");
  const artifacts = { functions: readArtifact(functionsPath, sourceSha256, "functions", ARTIFACTS.functions), references: readArtifact(referencesPath, sourceSha256, "references", ARTIFACTS.references), jumpTables: readArtifact(jumpTablesPath, sourceSha256, "jump tables", ARTIFACTS.jumpTables) };
  const references = artifacts.references.document.references; const functions = artifacts.functions.document.functions;
  const writes = exactSet(references.filter((reference) => reference.type === "WRITE" && reference.to === "0x00c06e20"), WRITE_SET, WRITE_SET_SHA256, "mode direct-write set");
  const closureEntries = callClosure(references, functions, "0x004a5070"); equal(closureEntries.length, 133, "FUN_004a5070 closure count"); equal(hash(JSON.stringify(closureEntries)), A5070_CLOSURE_SHA256, "FUN_004a5070 closure SHA-256");
  const closureWrites = normalizeReferences(references.filter((reference) => reference.type === "WRITE" && reference.to === "0x00c06e20" && closureEntries.includes(reference.fromFunctionEntry))); equal(JSON.stringify(closureWrites), JSON.stringify(WRITE_SET.slice(4)), "FUN_004a5070 closure mode writes");
  return {
    question: "What is the complete canonical direct WRITE set for scheduler mode WORD 0x00c06e20, and does the source-bound FUN_0045f250 -> FUN_004a5070 path invoke a mode-writing argument?",
    source: { executablePath: resolve(executablePath), byteLength: buffer.byteLength, sha256: sourceSha256 }, generatedArtifacts: Object.fromEntries(Object.entries(artifacts).map(([name, artifact]) => [name, artifact.provenance])),
    analysisStatus: "static-confirmed-bounded-negative-contract", reproductionStatus: "reproduction-complete", implementationStatus: "none",
    functionEvidence: FUNCTION_CONTRACTS.map(([entry, count, sha]) => requireFunction(functions, entry, count, sha)), callEdges: REQUIRED_CALLS.map(([site, caller, callee]) => requireCall(references, site, caller, callee)), codeAnchors: ANCHORS.map(([id, va, bytes, meaning]) => anchor(buffer, image, id, va, bytes, meaning)),
    directModeWrites: { target: "0x00c06e20", entries: writes, sha256: WRITE_SET_SHA256 }, a5070Closure: { root: "0x004a5070", count: closureEntries.length, entriesSha256: A5070_CLOSURE_SHA256, modeWrites: closureWrites },
    contract: {
      cleanup: "The four exact-one cleanup writers at 0x00446483, 0x00460377, 0x0047331c, and 0x00481e89 store zero. Their register sources are proven: main-loop BP=0, FUN_004732a0 DI=0, and FUN_00481c50 BP=0.",
      writer: "FUN_00485890 argument WORD one writes mode one for zero guard and mode zero for nonzero guard. Argument WORD two has no mode store: zero guard tail-jumps to FUN_00474ae0 and nonzero guard returns.",
      a5070: "The source-bound FUN_0045f250 call at 0x0045f26b reaches FUN_004a5070, whose 0x004a508e push two / 0x004a5090 call reaches FUN_00485890 with argument two. Its 133-entry canonical call closure contains only the two FUN_00485890 mode-write sites, neither reached by argument two.",
      boundary: "Direct references do not prove pointer-alias, indirect writer, global ordering, or session reachability absence. The next unresolved question is a concrete pre-stage-1 path reaching argument one, or persistence/order of the other direct writers.",
    }, testVectors: vectors(),
  };
}

export function replayModeCleanup({ writer, modeWord, reached = true }) { word(modeWord, "modeWord"); if (!CLEANUP_WRITERS.has(writer)) throw new RangeError(`unsupported cleanup writer: ${writer}`); if (typeof reached !== "boolean") throw new TypeError(`reached must be a boolean; got ${reached}`); if (!reached || modeWord !== 1) return { modeWord, events: [] }; return { modeWord: 0, events: [{ kind: "call", target: "0x00474ae0" }, { kind: "write-word", address: "0x00c06e20", value: 0 }] }; }
export function replayModeRoutine({ previousModeWord, guardWord, argumentWord, resultFlagWord = 0 }) { word(previousModeWord, "previousModeWord"); word(guardWord, "guardWord"); word(argumentWord, "argumentWord"); word(resultFlagWord, "resultFlagWord"); if (argumentWord === 1) { if (guardWord === 0) return { modeWord: 1, events: [{ kind: "write-word", address: "0x00c06e20", value: 1 }, { kind: "write-word", address: "0x00bccc44", value: resultFlagWord }] }; return { modeWord: 0, events: [{ kind: "write-word", address: "0x00c06e20", value: 0 }] }; } if (argumentWord === 2 && guardWord === 0) return { modeWord: previousModeWord, events: [{ kind: "tail-jump", target: "0x00474ae0" }] }; return { modeWord: previousModeWord, events: [] }; }

const CLEANUP_WRITERS = new Set(["shared-teardown", "state-23-target-10", "scheduler-timeout", "large-cleanup"]);
function vectors() { return [
  { id: "four-exact-one-cleanups", result: [...CLEANUP_WRITERS].map((writer) => replayModeCleanup({ writer, modeWord: 1 })), expected: [...CLEANUP_WRITERS].map(() => ({ modeWord: 0, events: [{ kind: "call", target: "0x00474ae0" }, { kind: "write-word", address: "0x00c06e20", value: 0 }] })) },
  { id: "cleanup-non-one-preserves-mode", result: replayModeCleanup({ writer: "large-cleanup", modeWord: 2 }), expected: { modeWord: 2, events: [] } },
  { id: "arg-one-writes-guard-dependent-mode", result: [replayModeRoutine({ previousModeWord: 0, guardWord: 0, argumentWord: 1, resultFlagWord: 9 }), replayModeRoutine({ previousModeWord: 1, guardWord: 2, argumentWord: 1 })], expected: [{ modeWord: 1, events: [{ kind: "write-word", address: "0x00c06e20", value: 1 }, { kind: "write-word", address: "0x00bccc44", value: 9 }] }, { modeWord: 0, events: [{ kind: "write-word", address: "0x00c06e20", value: 0 }] }] },
  { id: "a5070-arg-two-has-no-mode-store", result: [replayModeRoutine({ previousModeWord: 1, guardWord: 0, argumentWord: 2 }), replayModeRoutine({ previousModeWord: 1, guardWord: 1, argumentWord: 2 })], expected: [{ modeWord: 1, events: [{ kind: "tail-jump", target: "0x00474ae0" }] }, { modeWord: 1, events: [] }] },
]; }
function readArtifact(path, sourceSha256, label, [byteLength, sha]) { const resolvedPath = resolve(path); const buffer = readFileSync(resolvedPath); equal(buffer.byteLength, byteLength, `${label} artifact byte length`); equal(hash(buffer), sha, `${label} artifact SHA-256`); const document = JSON.parse(buffer.toString("utf8")); equal(document.sourceSha256, sourceSha256, `${label} source SHA-256`); return { document, provenance: { path: resolvedPath, byteLength, sha256: sha } }; }
function requireFunction(functions, entry, count, sha) { const found = functions.find((candidate) => candidate.entry === toHex(entry)); if (!found) throw new Error(`functions artifact is missing ${toHex(entry)}`); equal(found.instructionCount, count, `${toHex(entry)} instruction count`); equal(found.instructionSha256, sha, `${toHex(entry)} instruction SHA-256`); return { entry: found.entry, bodyRanges: found.bodyRanges, instructionCount: count, instructionSha256: sha }; }
function requireCall(references, site, caller, callee) { const found = references.find((reference) => reference.type.endsWith("CALL") && reference.from === toHex(site) && reference.fromFunctionEntry === toHex(caller) && reference.to === toHex(callee)); if (!found) throw new Error(`required call ${toHex(site)} is missing`); return { callsite: found.from, caller: found.fromFunctionEntry, callee: found.to }; }
function callClosure(references, functions, root) { const valid = new Set(functions.map((entry) => entry.entry)); const adjacency = new Map(); for (const reference of references) if (reference.type.includes("CALL") && valid.has(reference.to)) { const children = adjacency.get(reference.fromFunctionEntry) ?? []; children.push(reference.to); adjacency.set(reference.fromFunctionEntry, children); } const visited = new Set([root]); const pending = [root]; for (let index = 0; index < pending.length; index += 1) for (const callee of adjacency.get(pending[index]) ?? []) if (!visited.has(callee)) { visited.add(callee); pending.push(callee); } return [...visited].sort(); }
function exactSet(references, expected, expectedHash, label) { const actual = normalizeReferences(references); equal(actual.length, expected.length, `${label} count`); equal(JSON.stringify(actual), JSON.stringify(expected), `${label} entries`); equal(hash(JSON.stringify(actual)), expectedHash, `${label} SHA-256`); return actual; }
function normalizeReferences(references) { return references.map((reference) => ({ site: reference.from, caller: reference.fromFunctionEntry, target: reference.to, type: reference.type })).sort((left, right) => left.site.localeCompare(right.site)); }
function anchor(buffer, image, id, va, bytes, meaning) { const rawOffset = image.vaToRawOffset(va); if (rawOffset === undefined) throw new RangeError(`${toHex(va)} is not file-backed`); const expected = Buffer.from(bytes.replaceAll(" ", ""), "hex"); if (Buffer.compare(buffer.subarray(rawOffset, rawOffset + expected.length), expected) !== 0) throw new Error(`code anchor ${id} mismatch at ${toHex(va)}`); return { id, va: toHex(va), rawOffset: toHex(rawOffset), bytes, meaning, matched: true }; }
function word(value, label) { if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new RangeError(`${label} must be an unsigned WORD; got ${value}`); }
function hash(value) { return createHash("sha256").update(value).digest("hex"); }
function equal(actual, expected, label) { if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`); }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.stdout.write(`${JSON.stringify(extractK01ModeDirectWriters(), null, 2)}\n`);
