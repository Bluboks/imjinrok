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
  functions: [1468333, "7e071fdfe425d22447780c265fe1d3fd271a1bedd1773682bebcb8ddc6d2e16e"],
  references: [17206569, "f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5"],
  jumpTables: [607724, "0ae517eb172f61b974ca7a4411e64c1cc42065c462ed53b3065ab2da633dfe2f"],
};
const FUNCTION_CONTRACTS = [
  [0x0045f190, 42, "a69bbff3a7935d129f2786c5e0d56db59441fe460b7951b40e2b8ca637456b8b"],
  [0x0045f9c0, 801, "b694ee213a1b5f189ed7455e00690dcb29d970eca6ea87ef1f59c42c611cfb24"],
  [0x00474770, 58, "fd1d176b03376f5c5dac2db2cec22ead092d5d17aa788ffad4e5e0b0206cc699"],
  [0x004748f0, 16, "7acacb5b16d0a2eca9305635f69c0063ad1cdc7acb03fc9cf0c5bda4eb2d4c06"],
  [0x00484130, 1131, "d44b4995e2906aa527ee362b7f6aee774bef7cd3fdf966aabc09a5fefdd13b73"],
  [0x00485890, 44, "fb53dab9a92b41ace1d6e8c44d158a836f1e3bffdee6301f38361a08a1dbcde1"],
  [0x00486430, 138, "8806df0ba708941c3e177a88ca85e189b4c827dc1aee59876da948c50e8a0845"],
  [0x0048dbe0, 147, "f38e4577cf36c44f26097d94e200321d2a9bc6b0aa1696d572e40a600e7f7217"],
  [0x0048d410, 110, "55e9e403f208ea2de9f779cb5176d11db85b33758a30d2310d14504dabd0c13d"],
];
const REQUIRED_CALLS = [
  [0x0046005c, 0x0045f9c0, 0x00484130],
  [0x004851a5, 0x00484130, 0x00485890],
  [0x004600d0, 0x0045f9c0, 0x0048dbe0],
  [0x0048dc6d, 0x0048dbe0, 0x0048d410],
  [0x0048d42b, 0x0048d410, 0x0048d740],
];
const GUARD_DIRECT_WRITES = [
  [0x0045fbfc, 0x0045f9c0],
  [0x00474845, 0x00474770],
  [0x00474929, 0x004748f0],
  [0x00486585, 0x00486430],
  [0x004865ca, 0x00486430],
];
const GUARD_DIRECT_WRITE_SET_SHA256 =
  "9a90b182cdbdf55dbeea5a41ec612115912c210a4daa0c8ddece3a647f0d520d";
const MODE_ROUTINE_DIRECT_CALL_SET_SHA256 =
  "384cd7bdb004d0920217171e39922de2ea316325a2ad05947920524b14c1e201";
const ANCHORS = [
  ["main-loop-initial-guard-zero", 0x0045fbfc, "66 89 2d f4 df 4b 00", "startup stores EBP=0 to WORD guard 0x004bdfF4 before its dispatch loop"],
  ["state-one-k01-entry-and-continuation", 0x004600cb, "e8 a0 56 fe ff e8 0b db 02 00 e8 f6 56 fe ff 66 89 3d c8 df 4b 00", "state 1 calls standard mission entry then stores DI as the next raw main state"],
  ["main-loop-continuation-three", 0x0045fcdf, "bf 03 00 00 00", "the dispatch-loop continuation register DI is set to raw state 3"],
  ["state-three-scheduler", 0x0045fd5d, "e8 5e 7e fe ff", "raw main state 3 calls scheduler 0x00447bc0"],
  ["state-five-mode-routine", 0x0046005c, "e8 cf 40 02 00", "raw main state 5 is the sole direct caller of FUN_00484130"],
  ["ebx-initial-zero", 0x0048414b, "53 33 db", "FUN_00484130 saves EBX then initializes its working EBX DWORD to zero"],
  ["ebx-first-result-precedence", 0x00484683, "3b c5 75 04 33 db eb 04 8b 5c 24 10", "first result selects zero or the raw stack fallback before later overrides"],
  ["ebx-one-and-two-overrides", 0x00484694, "e8 77 3b 01 00 83 f8 01 75 02 8b d8 b9 18 64 c6 00 e8 a6 f8 01 00 83 f8 01 75 0b bb 02 00 00 00", "a return exactly one first selects EBX=1, then a later return exactly one overrides it with EBX=2"],
  ["ebx-tail-gate", 0x00484f2a, "8b 0d 70 2d 55 00 51 b9 40 a3 c6 00 e8 75 cd f8 ff 83 f8 01 bb 02 00 00 00 74 04 8b 5c 24 24", "tail gate selects EBX=2 on exact one or restores a raw stack fallback"],
  ["ebx-tail-one-or-two", 0x004850b0, "89 2d 9c 22 4c 00 89 2d 48 ce c5 00 bb 01 00 00 00", "timeout branch selects EBX=1; the later alternate branch selects EBX=2"],
  ["mode-call-skip-ffff", 0x00485197, "66 83 fb ff 89 15 70 2d 55 00 5e 74 09 53 e8 e6 06 00 00", "only low WORD BX=0xffff skips the call; otherwise the full EBX is pushed"],
  ["mode-writer-guard-zero", 0x004858ff, "66 83 3d f4 df 4b 00 00 75 31 66 8b 44 24 04 66 3d 01 00 75 16 66 a1 14 c8 c5 00 66 c7 05 20 6e c0 00 01 00", "guard zero and argument WORD one write scheduler mode WORD one"],
  ["mode-writer-guard-nonzero", 0x0048593a, "66 83 7c 24 04 01 75 09 66 c7 05 20 6e c0 00 00 00 c3", "guard nonzero and argument WORD one write scheduler mode WORD zero"],
  ["guard-writer-zero-a", 0x00474845, "66 89 35 f4 df 4b 00", "writer stores zero from ESI"],
  ["guard-writer-zero-b", 0x00474929, "66 a3 f4 df 4b 00", "writer stores zero from AX"],
  ["guard-writer-branch-values", 0x00486585, "66 89 2d f4 df 4b 00", "branch stores zero from BP; sibling at 0x004865ca stores WORD one"],
];

export function extractK01ModeReachability({ executablePath = DEFAULTS.executablePath, functionsPath = DEFAULTS.functionsPath, referencesPath = DEFAULTS.referencesPath, jumpTablesPath = DEFAULTS.jumpTablesPath } = {}) {
  const { buffer, image } = readPeImage(executablePath);
  const sourceSha256 = createHash("sha256").update(buffer).digest("hex");
  equal(sourceSha256, EXPECTED_EXE_SHA256, "original EXE SHA-256");
  const artifacts = {
    functions: readArtifact(functionsPath, sourceSha256, "functions", ARTIFACTS.functions),
    references: readArtifact(referencesPath, sourceSha256, "references", ARTIFACTS.references),
    jumpTables: readArtifact(jumpTablesPath, sourceSha256, "jump tables", ARTIFACTS.jumpTables),
  };
  const references = artifacts.references.document.references;
  requireMainStateTable(artifacts.jumpTables.document);
  const guardWrites = requireExactReferenceSet(
    references.filter((value) => value.to === "0x004bdff4" && value.type === "WRITE"),
    GUARD_DIRECT_WRITES.map(([site, caller]) => ({ site: toHex(site), caller: toHex(caller), target: "0x004bdff4", type: "WRITE" })),
    GUARD_DIRECT_WRITE_SET_SHA256,
    "direct guard write set",
  );
  const modeRoutineDirectCallers = requireExactReferenceSet(
    references.filter((value) => value.to === "0x00484130" && value.type.endsWith("CALL")),
    [{ site: "0x0046005c", caller: "0x0045f9c0", target: "0x00484130", type: "UNCONDITIONAL_CALL" }],
    MODE_ROUTINE_DIRECT_CALL_SET_SHA256,
    "direct FUN_00484130 caller set",
  );

  return {
    question: "Can the standard K01 stage-one lifecycle source-bind a concrete 0 or 1 write to scheduler mode WORD 0x00c06e20 through FUN_00484130 and FUN_00485890, without tracing the option-object selector producer?",
    source: { executablePath: resolve(executablePath), byteLength: buffer.byteLength, sha256: sourceSha256 },
    generatedArtifacts: Object.fromEntries(Object.entries(artifacts).map(([key, value]) => [key, value.provenance])),
    analysisStatus: "static-confirmed-partial-negative-contract",
    reproductionStatus: "reproduction-complete",
    implementationStatus: "none",
    functionEvidence: FUNCTION_CONTRACTS.map(([entry, count, sha256]) => requireFunction(artifacts.functions.document.functions, entry, count, sha256)),
    callEdges: REQUIRED_CALLS.map(([site, caller, callee]) => requireCall(references, site, caller, callee)),
    guardDirectWrites: { referenceArtifact: artifacts.references.provenance, entries: guardWrites, sha256: GUARD_DIRECT_WRITE_SET_SHA256 },
    modeRoutineDirectCallers: { referenceArtifact: artifacts.references.provenance, entries: modeRoutineDirectCallers, sha256: MODE_ROUTINE_DIRECT_CALL_SET_SHA256 },
    codeAnchors: ANCHORS.map(([id, va, bytes, meaning]) => anchor(buffer, image, id, va, bytes, meaning)),
    ebxContract: {
      width: "FUN_00484130 pushes DWORD EBX; FUN_00485890 reads only stack WORD [ESP+4], so its dispatch is the low unsigned WORD BX.",
      precedence: "the routine begins EBX=0; a first result can select 0 or a stack fallback, a return exactly 1 can select 1, a later return exactly 1 overrides with 2, and the tail independently selects 2 or a second raw stack fallback. Reached timeout selects 1; reached alternate branch selects 2.",
      invocation: "BX=0xffff skips FUN_00485890. Every other low WORD invokes it. Only argument WORD 1 permits a mode store; argument 2 takes its separate tail call and returns without a mode store; all other argument WORD values return without a mode store.",
      unresolvedInput: "the two raw stack fallbacks and the UI/runtime callees that feed their branch predicates are not assigned human-facing meanings in this bounded unit.",
    },
    guardContract: {
      width: "WORD 0x004bdfF4; all recovered direct writes are WORD stores.",
      directWrites: "main-loop startup stores 0; 0x00474770 and 0x004748f0 each store 0 on their reached success paths; 0x00486430 has reached branches that store 0 or 1.",
      writerSemantics: "the writer compares guard to zero, not equality to one: argument WORD 1 writes mode 1 when guard is zero and mode 0 for every nonzero guard value.",
      persistence: "stage-one entry does not directly write the guard. It inherits the startup zero unless one of the recovered or unresolved indirect/alias paths writes it before a later state-5 call.",
      unresolvedAliasBoundary: "the direct-reference set does not prove that the guard has no indirect, pointer-alias, or unmodeled code write; this extractor reports that boundary rather than claiming absence.",
    },
    k01Lifecycle: {
      stageOne: "raw main state 1 calls 0x0048dbe0; signed stage WORD 1 selects exactly the 0x0048d429 case and calls 0x0048d740.",
      continuation: "the dispatch loop loads DI=3 before its state switch; after the stage-one call it stores DI, therefore this recovered state-one invocation transitions to raw main state 3.",
      scheduler: "raw main state 3 directly calls the scheduler. Raw main state 5 is separately dispatched to FUN_00484130.",
      result: "No source-bound edge in this scope connects the stage-one state-1→3 transition to a reached state-5 EBX/mode-writer invocation. Therefore a standard K01 session is not assigned scheduler mode 0 or 1 from this mechanism.",
      firstUnresolvedEdge: "the first required unclosed edge is a concrete later transition from the stage-one-established raw main state 3 to raw main state 5 (including any indirect state-machine write), with the persistence/value of guard 0x004bdfF4 at that invocation.",
    },
    testVectors: vectors(),
  };
}

export function replayModeWriter(input) {
  const previousModeWord = input.previousModeWord;
  const argumentDword = input.argumentDword;
  word(previousModeWord, "previousModeWord"); dword(argumentDword, "argumentDword");
  const argumentWord = argumentDword & 0xffff;
  if (argumentWord === 0xffff) return { invoked: false, argumentWord, modeWord: previousModeWord, write: null };
  const guardWord = input.guardWord;
  word(guardWord, "guardWord");
  if (argumentWord !== 1) return { invoked: true, argumentWord, modeWord: previousModeWord, write: null };
  return { invoked: true, argumentWord, modeWord: guardWord === 0 ? 1 : 0, write: guardWord === 0 ? 1 : 0 };
}

export function replayK01StageOneLifecycle(input) {
  const mainStateWord = input.mainStateWord;
  word(mainStateWord, "mainStateWord");
  if (mainStateWord !== 1) return { stageEntryReached: false, stageOneCaseReached: false, nextMainStateWord: mainStateWord, schedulerReached: false, modeRoutineReached: mainStateWord === 5 };
  const stageWord = input.stageWord;
  word(stageWord, "stageWord");
  if (stageWord !== 1) return { stageEntryReached: true, stageOneCaseReached: false, nextMainStateWord: 3, schedulerReached: true, modeRoutineReached: false };
  return { stageEntryReached: true, stageOneCaseReached: true, nextMainStateWord: 3, schedulerReached: true, modeRoutineReached: false };
}

function vectors() {
  return [
    { id: "guard-zero-argument-one-writes-one", result: replayModeWriter({ previousModeWord: 0, guardWord: 0, argumentDword: 1 }), expected: { invoked: true, argumentWord: 1, modeWord: 1, write: 1 } },
    { id: "guard-nonzero-argument-one-writes-zero", result: replayModeWriter({ previousModeWord: 1, guardWord: 0xffff, argumentDword: 1 }), expected: { invoked: true, argumentWord: 1, modeWord: 0, write: 0 } },
    { id: "argument-two-no-write", result: replayModeWriter({ previousModeWord: 1, guardWord: 0, argumentDword: 2 }), expected: { invoked: true, argumentWord: 2, modeWord: 1, write: null } },
    { id: "argument-ffff-skips-call", result: replayModeWriter({ previousModeWord: 0, guardWord: 0, argumentDword: 0xffffffff }), expected: { invoked: false, argumentWord: 0xffff, modeWord: 0, write: null } },
    { id: "low-word-controls-malformed-high-dword", result: replayModeWriter({ previousModeWord: 0, guardWord: 0, argumentDword: 0x12340001 }), expected: { invoked: true, argumentWord: 1, modeWord: 1, write: 1 } },
    { id: "k01-stage-one-reaches-state-three-not-mode-routine", result: replayK01StageOneLifecycle({ mainStateWord: 1, stageWord: 1 }), expected: { stageEntryReached: true, stageOneCaseReached: true, nextMainStateWord: 3, schedulerReached: true, modeRoutineReached: false } },
    { id: "non-k01-stage-does-not-inspect-stage-one-case", result: replayK01StageOneLifecycle({ mainStateWord: 5, stageWord: 0xffff }), expected: { stageEntryReached: false, stageOneCaseReached: false, nextMainStateWord: 5, schedulerReached: false, modeRoutineReached: true } },
  ];
}

function readArtifact(path, sourceSha256, label, [byteLength, sha256]) {
  const resolved = resolve(path); const buffer = readFileSync(resolved);
  equal(buffer.byteLength, byteLength, `${label} artifact byte length`);
  equal(createHash("sha256").update(buffer).digest("hex"), sha256, `${label} artifact SHA-256`);
  const document = JSON.parse(buffer.toString("utf8")); equal(document.sourceSha256, sourceSha256, `${label} source SHA-256`);
  return { document, provenance: { path: resolved, byteLength: buffer.byteLength, sha256 } };
}
function requireFunction(functions, entry, count, sha256) { const found = functions.find((value) => value.entry === toHex(entry)); if (!found) throw new Error(`functions artifact is missing ${toHex(entry)}`); equal(found.instructionCount, count, `${toHex(entry)} instruction count`); equal(found.instructionSha256, sha256, `${toHex(entry)} instruction SHA-256`); return { entry: found.entry, bodyRanges: found.bodyRanges, instructionCount: count, instructionSha256: sha256 }; }
function requireCall(references, site, caller, callee) { const found = references.find((value) => value.type.endsWith("CALL") && value.from === toHex(site) && value.fromFunctionEntry === toHex(caller) && value.to === toHex(callee)); if (!found) throw new Error(`required call ${toHex(site)} is missing`); return { callsite: found.from, caller: found.fromFunctionEntry, callee: found.to }; }
function requireExactReferenceSet(references, expectedEntries, expectedSha256, label) { const actual = normalizeReferenceSet(references); const expected = [...expectedEntries].sort((left, right) => left.site.localeCompare(right.site)); equal(actual.length, expected.length, `${label} count`); equal(JSON.stringify(actual), JSON.stringify(expected), `${label} entries`); const sha256 = createHash("sha256").update(JSON.stringify(actual)).digest("hex"); equal(sha256, expectedSha256, `${label} SHA-256`); return actual; }
function normalizeReferenceSet(references) { return references.map((value) => ({ site: value.from, caller: value.fromFunctionEntry, target: value.to, type: value.type })).sort((left, right) => left.site.localeCompare(right.site)); }
function requireMainStateTable(report) { const table = Object.values(report.tables).find((value) => value.functionEntry === "0x0045f9c0" && value.switchAddress === "0x0045fd56"); if (!table) throw new Error("main-state switch is missing"); equal(table.cases.find((value) => value.label === 0)?.destination, "0x004600cb", "state one destination"); equal(table.cases.find((value) => value.label === 4)?.destination, "0x0046005c", "state five destination"); const stage = Object.values(report.tables).find((value) => value.functionEntry === "0x0048d410" && value.switchAddress === "0x0048d422"); if (!stage) throw new Error("stage switch is missing"); equal(stage.cases.find((value) => value.label === 1)?.destination, "0x0048d429", "stage one destination"); }
function anchor(buffer, image, id, va, bytes, meaning) { const raw = image.vaToRawOffset(va); if (raw === undefined) throw new RangeError(`${toHex(va)} is not file-backed`); const expected = Buffer.from(bytes.replaceAll(" ", ""), "hex"); if (Buffer.compare(buffer.subarray(raw, raw + expected.length), expected) !== 0) throw new Error(`code anchor ${id} mismatch at ${toHex(va)}`); return { id, va: toHex(va), rawOffset: toHex(raw), bytes, meaning, matched: true }; }
function word(value, label) { if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new RangeError(`${label} must be an unsigned WORD; got ${value}`); }
function dword(value, label) { if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError(`${label} must be an unsigned DWORD; got ${value}`); }
function equal(actual, expected, label) { if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.stdout.write(`${JSON.stringify(extractK01ModeReachability(), null, 2)}\n`);
