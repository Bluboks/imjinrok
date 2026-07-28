#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readPeImage, toHex } from "./pe-image.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const EXPECTED_EXE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
const DEFAULTS = {
  executablePath: resolve(ROOT, "original/imjinrok2/imjinrok2.exe"),
  functionsPath: resolve(ROOT, "analysis/generated/imjinrok2/functions.json"),
  referencesPath: resolve(ROOT, "analysis/generated/imjinrok2/references.json"),
  jumpTablesPath: resolve(ROOT, "analysis/generated/imjinrok2/jump-tables.json"),
};
const ARTIFACTS = {
  functions: [1467804, "c10ea2de1f4998411d52443419c9a7f52ff7f9c18e79bd4115ba197d2f5bebc3"],
  references: [17206553, "df11ff3713988ef22b3390b5b0ae7b4a87464b5de547a4866e1c8ec8a0bcaf4c"],
  jumpTables: [607724, "0ae517eb172f61b974ca7a4411e64c1cc42065c462ed53b3065ab2da633dfe2f"],
};
const FUNCTION_CONTRACTS = [
  [0x0045f9c0, 801, "b694ee213a1b5f189ed7455e00690dcb29d970eca6ea87ef1f59c42c611cfb24"],
  [0x00447bc0, 75, "c5166177633b255028ae02aa6f7a60350f7e93f09ce5fcf101ac92ba066eefde"],
  [0x004464c0, 988, "07f105738a43b7411865e1d6d08791c2768e2a89fb28e289b0eb349fb7354904"],
  [0x004481d0, 21, "3c4ad59801dd66dcb03339fb810c187160b58ccdc18848f6e80ee39bd77b4d91"],
  [0x0048ddb0, 105, "276da99513996baa45d73bd4c09da0fe231fb10e65b762b4bbf3bfb144908981"],
  [0x00446420, 33, "439694b6de69137d87c47d6687e97d8a74f2ad073c808b443606a0b42906910a"],
];
const REQUIRED_CALLS = [
  [0x0045fd5d, 0x0045f9c0, 0x00447bc0],
  [0x00447c00, 0x00447bc0, 0x004400b0],
  [0x00447c18, 0x00447bc0, 0x004464c0],
  [0x004464f5, 0x004464c0, 0x004481d0],
  [0x004481e4, 0x004481d0, 0x0048ddb0],
  [0x004481fe, 0x004481d0, 0x00446420],
  [0x00448218, 0x004481d0, 0x00446420],
];
const STATE_WRITE_SET = [
  { site: "0x00447c08", caller: "0x00447bc0", target: "0x004bdfc8", type: "WRITE" },
  { site: "0x004481f5", caller: "0x004481d0", target: "0x004bdfc8", type: "WRITE" },
  { site: "0x0044820f", caller: "0x004481d0", target: "0x004bdfc8", type: "WRITE" },
];
const CLOSURE_ENTRY_SHA256 = "90f252b91ca3b4acc0e80ba9c8937721249bd28225dd894f552791af68885657";
const STATE_WRITE_SET_SHA256 = "cc3cd3124c0188f28d84d660fc4a21022f76476273ed8e705b5e79739b6807cc";
const ANCHORS = [
  ["state-three-scheduler-call", 0x0045fd5d, "e8 5e 7e fe ff", "raw main state 3 calls FUN_00447bc0"],
  ["special-state-twenty-two", 0x00447be0, "66 83 3d 30 6e c0 00 01 75 2e 66 83 3d c8 df 4b 00 03 75 24 6a 02 e8 75 7c 02 00 68 b8 20 5e 00 e8 ab 84 ff ff 83 c4 08 66 c7 05 c8 df 4b 00 16", "special WORD 0x00c06e30 == 1 and current state 3 path invokes its two calls before writing state 22"],
  ["ordinary-result-helper-call", 0x004464f5, "e8 d6 1c 00 00", "FUN_004464c0 calls FUN_004481d0 before its later ordinary-path work"],
  ["changed-progress-result-writers", 0x004481d0, "a1 80 5f 7c 00 8b 0d 80 27 55 00 3b c1 74 44 a3 80 27 55 00 e8 c7 5b 04 00 66 3d 01 00 75 1a 66 a3 14 66 7c 00 66 c7 05 c8 df 4b 00 18 00 e8 1d e2 ff ff b8 01 00 00 00 c3 66 3d ff ff 75 14 66 c7 05 c8 df 4b 00 1a", "changed progress calls FUN_0048ddb0; result WORD 1 writes 24 and 0xffff writes 26"],
];

export function extractK01StateThreeModeBoundary({
  executablePath = DEFAULTS.executablePath,
  functionsPath = DEFAULTS.functionsPath,
  referencesPath = DEFAULTS.referencesPath,
  jumpTablesPath = DEFAULTS.jumpTablesPath,
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  const sourceSha256 = createHash("sha256").update(buffer).digest("hex");
  equal(sourceSha256, EXPECTED_EXE_SHA256, "original EXE SHA-256");
  const artifacts = {
    functions: readArtifact(functionsPath, sourceSha256, "functions", ARTIFACTS.functions),
    references: readArtifact(referencesPath, sourceSha256, "references", ARTIFACTS.references),
    jumpTables: readArtifact(jumpTablesPath, sourceSha256, "jump tables", ARTIFACTS.jumpTables),
  };
  const { functions } = artifacts.functions.document;
  const references = artifacts.references.document.references;
  requireMainStateTable(artifacts.jumpTables.document);
  const closureEntries = callClosure(references, functions, "0x00447bc0");
  equal(closureEntries.length, 1070, "state-three call closure count");
  equal(sha256(JSON.stringify(closureEntries)), CLOSURE_ENTRY_SHA256, "state-three call closure SHA-256");
  const closure = new Set(closureEntries);
  const stateWrites = exactReferenceSet(
    references.filter((reference) => reference.type === "WRITE" && reference.to === "0x004bdfc8" && closure.has(reference.fromFunctionEntry)),
    STATE_WRITE_SET,
    STATE_WRITE_SET_SHA256,
    "closure state-write set",
  );
  const excludedTargets = ["0x004bdff4", "0x00484130", "0x00485890"].map((target) => {
    const entries = references.filter((reference) => reference.to === target && closure.has(reference.fromFunctionEntry));
    equal(entries.length, 0, `closure references to ${target}`);
    return { target, count: 0 };
  });

  return {
    question: "Within the active raw main-state-3 scheduler's transitive canonical call closure, which direct writes can change main-state WORD 0x004bdfc8, and does that closure directly reach the mode writer or guard?",
    source: { executablePath: resolve(executablePath), byteLength: buffer.byteLength, sha256: sourceSha256 },
    generatedArtifacts: Object.fromEntries(Object.entries(artifacts).map(([name, artifact]) => [name, artifact.provenance])),
    analysisStatus: "static-confirmed-bounded-negative-contract",
    reproductionStatus: "reproduction-complete",
    implementationStatus: "none",
    functionEvidence: FUNCTION_CONTRACTS.map(([entry, count, hash]) => requireFunction(functions, entry, count, hash)),
    mainStateTable: { switchAddress: "0x0045fd56", rawStateThreeDestination: "0x0045fd5d" },
    callEdges: REQUIRED_CALLS.map(([site, caller, callee]) => requireCall(references, site, caller, callee)),
    closure: { root: "0x00447bc0", count: closureEntries.length, entriesSha256: CLOSURE_ENTRY_SHA256 },
    stateWrites: { target: "0x004bdfc8", entries: stateWrites, sha256: STATE_WRITE_SET_SHA256 },
    zeroDirectReferences: excludedTargets,
    codeAnchors: ANCHORS.map(([id, va, bytes, meaning]) => anchor(buffer, image, id, va, bytes, meaning)),
    contract: {
      special: "The first recovered scheduler branch checks WORD 0x00c06e30 == 1 and current main state WORD == 3, then writes raw state 22 before ordinary progress/result handling.",
      ordinary: "Otherwise FUN_004464c0 reaches FUN_004481d0. Only changed DWORD progress calls FUN_0048ddb0: result WORD 1 writes 24, result WORD 0xffff writes 26, and every other result leaves state unchanged. Equal progress does not read that result.",
      negative: "The active state-3 transitive direct-call closure has no direct state-5 writer and no direct reference or call edge to guard WORD 0x004bdff4, FUN_00484130, or FUN_00485890.",
      boundary: "This is not an indirect-call, pointer-alias, global-session, or later result-state claim. It does not establish what runs after result state 24/26 or whether another path subsequently writes raw state 5.",
    },
    testVectors: vectors(),
  };
}

export function replayReachedStateThree(input) {
  const currentStateWord = input.currentStateWord;
  word(currentStateWord, "currentStateWord");
  const specialModeWord = input.specialModeWord;
  word(specialModeWord, "specialModeWord");
  if (specialModeWord === 1 && currentStateWord === 3) return { branch: "special", stateWord: 22, write: 22 };

  const progressCounterDword = input.progressCounterDword;
  const observedProgressDword = input.observedProgressDword;
  dword(progressCounterDword, "progressCounterDword");
  dword(observedProgressDword, "observedProgressDword");
  if (progressCounterDword === observedProgressDword) return { branch: "unchanged-progress", stateWord: currentStateWord, write: null };

  const resultWord = input.resultWord;
  word(resultWord, "resultWord");
  if (resultWord === 1) return { branch: "result-one", stateWord: 24, write: 24 };
  if (resultWord === 0xffff) return { branch: "result-ffff", stateWord: 26, write: 26 };
  return { branch: "other-result", stateWord: currentStateWord, write: null };
}

function vectors() {
  return [
    { id: "special-branch-writes-22-before-late-inputs", result: replayReachedStateThree({ currentStateWord: 3, specialModeWord: 1, get progressCounterDword() { throw new Error("unreachable progress read"); }, get observedProgressDword() { throw new Error("unreachable progress read"); }, get resultWord() { throw new Error("unreachable result read"); } }), expected: { branch: "special", stateWord: 22, write: 22 } },
    { id: "equal-progress-preserves-state-without-result-read", result: replayReachedStateThree({ currentStateWord: 3, specialModeWord: 0, progressCounterDword: 9, observedProgressDword: 9, get resultWord() { throw new Error("unreachable result read"); } }), expected: { branch: "unchanged-progress", stateWord: 3, write: null } },
    { id: "changed-result-one-writes-24", result: replayReachedStateThree({ currentStateWord: 3, specialModeWord: 0, progressCounterDword: 10, observedProgressDword: 9, resultWord: 1 }), expected: { branch: "result-one", stateWord: 24, write: 24 } },
    { id: "changed-result-ffff-writes-26", result: replayReachedStateThree({ currentStateWord: 3, specialModeWord: 0, progressCounterDword: 10, observedProgressDword: 9, resultWord: 0xffff }), expected: { branch: "result-ffff", stateWord: 26, write: 26 } },
    { id: "changed-other-result-preserves-state", result: replayReachedStateThree({ currentStateWord: 3, specialModeWord: 0, progressCounterDword: 10, observedProgressDword: 9, resultWord: 2 }), expected: { branch: "other-result", stateWord: 3, write: null } },
  ];
}

function readArtifact(path, sourceSha256, label, [byteLength, hash]) {
  const resolvedPath = resolve(path);
  const buffer = readFileSync(resolvedPath);
  equal(buffer.byteLength, byteLength, `${label} artifact byte length`);
  equal(sha256(buffer), hash, `${label} artifact SHA-256`);
  const document = JSON.parse(buffer.toString("utf8"));
  equal(document.sourceSha256, sourceSha256, `${label} source SHA-256`);
  return { document, provenance: { path: resolvedPath, byteLength, sha256: hash } };
}
function requireFunction(functions, entry, count, hash) { const found = functions.find((functionEntry) => functionEntry.entry === toHex(entry)); if (!found) throw new Error(`functions artifact is missing ${toHex(entry)}`); equal(found.instructionCount, count, `${toHex(entry)} instruction count`); equal(found.instructionSha256, hash, `${toHex(entry)} instruction SHA-256`); return { entry: found.entry, bodyRanges: found.bodyRanges, instructionCount: count, instructionSha256: hash }; }
function requireCall(references, site, caller, callee) { const found = references.find((reference) => reference.type.endsWith("CALL") && reference.from === toHex(site) && reference.fromFunctionEntry === toHex(caller) && reference.to === toHex(callee)); if (!found) throw new Error(`required call ${toHex(site)} is missing`); return { callsite: found.from, caller: found.fromFunctionEntry, callee: found.to }; }
function requireMainStateTable(report) { const table = Object.values(report.tables).find((candidate) => candidate.functionEntry === "0x0045f9c0" && candidate.switchAddress === "0x0045fd56"); if (!table) throw new Error("main-state switch is missing"); equal(table.cases.find((value) => value.label === 2)?.destination, "0x0045fd5d", "raw state-three destination"); }
function callClosure(references, functions, root) { const functionsByEntry = new Set(functions.map((entry) => entry.entry)); const adjacency = new Map(); for (const reference of references) if (reference.type.includes("CALL") && functionsByEntry.has(reference.to)) { const callees = adjacency.get(reference.fromFunctionEntry) ?? []; callees.push(reference.to); adjacency.set(reference.fromFunctionEntry, callees); } const visited = new Set([root]); const pending = [root]; for (let index = 0; index < pending.length; index += 1) for (const callee of adjacency.get(pending[index]) ?? []) if (!visited.has(callee)) { visited.add(callee); pending.push(callee); } return [...visited].sort(); }
function exactReferenceSet(references, expected, expectedHash, label) { const actual = normalizeReferences(references); equal(actual.length, expected.length, `${label} count`); equal(JSON.stringify(actual), JSON.stringify(expected), `${label} entries`); equal(sha256(JSON.stringify(actual)), expectedHash, `${label} SHA-256`); return actual; }
function normalizeReferences(references) { return references.map((reference) => ({ site: reference.from, caller: reference.fromFunctionEntry, target: reference.to, type: reference.type })).sort((left, right) => left.site.localeCompare(right.site)); }
function anchor(buffer, image, id, va, bytes, meaning) { const rawOffset = image.vaToRawOffset(va); if (rawOffset === undefined) throw new RangeError(`${toHex(va)} is not file-backed`); const expected = Buffer.from(bytes.replaceAll(" ", ""), "hex"); if (Buffer.compare(buffer.subarray(rawOffset, rawOffset + expected.length), expected) !== 0) throw new Error(`code anchor ${id} mismatch at ${toHex(va)}`); return { id, va: toHex(va), rawOffset: toHex(rawOffset), bytes, meaning, matched: true }; }
function word(value, label) { if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new RangeError(`${label} must be an unsigned WORD; got ${value}`); }
function dword(value, label) { if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError(`${label} must be an unsigned DWORD; got ${value}`); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function equal(actual, expected, label) { if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.stdout.write(`${JSON.stringify(extractK01StateThreeModeBoundary(), null, 2)}\n`);
