#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { selectOriginalBaseInterval } from "./extract-k01-clock-mode-producers.mjs";
import { readCString, readPeImage, toHex } from "./pe-image.mjs";
import { assertEqual, readVaRange, sha256, verifyEvidencePoint, verifyRawCodeRange } from "./static-evidence.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULTS = {
  executablePath: resolve(ROOT, "original/imjinrok2/imjinrok2.exe"),
  functionsPath: resolve(ROOT, "analysis/generated/imjinrok2/functions.json"),
  referencesPath: resolve(ROOT, "analysis/generated/imjinrok2/references.json"),
};

export const EXPECTED_EXE_SHA256 = "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
const EXPECTED_ARTIFACTS = {
  functions: { byteLength: 1468333, sha256: "7e071fdfe425d22447780c265fe1d3fd271a1bedd1773682bebcb8ddc6d2e16e" },
  references: { byteLength: 17206569, sha256: "f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5" },
};

const FUNCTION_CONTRACTS = [
  [0x0043f4f0, "0x0043f4f0-0x0043f55a", 37, "eeee18b6012892ee3e108fadc425827e06bbb185ba583aeb6f514c16fbb74802"],
  [0x0043f580, "0x0043f580-0x0043f5c6", 20, "dbdc4447f4bd656a29d55e10f719e29341276c62e4767778dc5decea3671dfc1"],
  [0x0043f6e0, "0x0043f6e0-0x0043f74f", 38, "c2066429a049d75f33dd69b1bf75d590af1684d824b2aed345d08a1e798f4c24"],
  [0x0045f190, "0x0045f190-0x0045f243", 42, "a69bbff3a7935d129f2786c5e0d56db59441fe460b7951b40e2b8ca637456b8b"],
  [0x0045f9c0, "0x0045f9c0-0x004607ac", 801, "b694ee213a1b5f189ed7455e00690dcb29d970eca6ea87ef1f59c42c611cfb24"],
];

const RAW_CODE_RANGES = [
  ["settings-default-initializer", 0x0043f4f0, 0x0043f55b, "9910beb240b7ff2b275254b0449c921c54b99b4d091ee1feaa578873270447d3"],
  ["config-hq-loader", 0x0043f6e0, 0x0043f750, "d83fc043a41749329c44ec860b82f21b912bd1c31a9d84076897c43d4d7bc969"],
  ["main-settings-load-or-default", 0x0045f190, 0x0045f244, "b512d4288d72637a244cfbb9485ae6a2b74350414524a5c91e11afcd9f0074be"],
].map(([id, start, endExclusive, digest]) => ({ id, start, endExclusive, sha256: digest }));

const EVIDENCE_POINTS = [
  [0x0043f4f4, "b9 75 00 00 00 33 c0 8b fa f3 ab", "initializer clears 0x75 DWORDs from its ECX object base"],
  [0x0043f504, "c7 42 14 02 00 00 00", "initializer writes DWORD 2 at object+0x14"],
  [0x0043f6f4, "68 80 b9 4b 00 e8 d2 36 00 00", "loader passes the config.hq string address to its open path"],
  [0x0043f70f, "83 c4 14 85 ff 75 09 5f 5e 81 c4 80 00 00 00 c3", "open result zero takes the early return; EAX is still the zero open result"],
  [0x0043f71f, "57 6a 01 68 d4 01 00 00 56 e8 17 e8 06 00", "success pushes stream, element size 1, count 0x1d4, then destination before calling FUN_004adf44"],
  [0x0043f72d, "57 e8 f2 df 06 00 66 8b 56 10 83 c4 14 8b ce 52 e8 0e 00 00 00", "success closes the stream, then separately forwards object+0x10 WORD to FUN_0043f750"],
  [0x0043f743, "b8 01 00 00 00", "success returns one after the transfer and subsequent object+0x10 call"],
  [0x0045f207, "b9 b8 4a 63 00 e8 cf 04 fe ff 85 c0 75 0a b9 b8 4a 63 00 e8 d1 02 fe ff", "startup passes 0x00634ab8 to loader and calls initializer only when loader returns zero"],
  [0x0045fa3b, "e8 50 f7 ff ff", "main FUN_0045f9c0 calls the startup routine"],
  [0x0043f590, "a1 cc 4a 63 00 83 f8 03", "the existing selector consumer reads DWORD 0x00634acc when scheduler mode is not one"],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

const REQUIRED_CALLS = [
  [0x0045fa3b, 0x0045f9c0, 0x0045f190],
  [0x0045f20c, 0x0045f190, 0x0043f6e0],
  [0x0045f21a, 0x0045f190, 0x0043f4f0],
  [0x0043f728, 0x0043f6e0, 0x004adf44],
  [0x0043f73d, 0x0043f6e0, 0x0043f750],
];

const CONFIG_HQ = {
  va: 0x004bb980,
  value: "config.hq",
  nulTerminatedSha256: "449c3469bb28cf424c82acaadb56b4f977d0b4aba5fa4d3824ebe4079fd2e836",
};

export function replayColdStartSelector({ configLoadSucceeded, persistedSelector }) {
  if (typeof configLoadSucceeded !== "boolean") throw new TypeError("configLoadSucceeded must be a boolean");
  if (!configLoadSucceeded) return { selector: 2, source: "initializer-after-load-failure" };
  dword(persistedSelector, "persistedSelector");
  return { selector: persistedSelector, source: "config-hq-transfer" };
}

export function extractK01ClockSelectorInitializationEvidence({
  executablePath = DEFAULTS.executablePath,
  functionsPath = DEFAULTS.functionsPath,
  referencesPath = DEFAULTS.referencesPath,
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  assertEqual(sha256(buffer), EXPECTED_EXE_SHA256, `${executablePath} SHA-256`);
  const functions = readArtifact(functionsPath, "functions");
  const references = readArtifact(referencesPath, "references");
  assertEqual(functions.document.sourceSha256, EXPECTED_EXE_SHA256, "functions artifact source SHA-256");
  assertEqual(references.document.sourceSha256, EXPECTED_EXE_SHA256, "references artifact source SHA-256");

  return {
    question: "What initializes interval selector DWORD 0x00634acc, when can config.hq replace it, and what limited cadence statement follows?",
    analysisStatus: "static-confirmed-for-cold-start-load-failure-default-and-successful-transfer-boundary",
    reproductionStatus: "reproduction-complete-for-load-failure-default-successful-transfer-and-selector-consumer-boundary",
    implementationStatus: "none",
    sources: {
      executable: { path: relative(ROOT, executablePath), sha256: EXPECTED_EXE_SHA256 },
      generatedArtifacts: { functions: functions.provenance, references: references.provenance },
      configFileString: verifyCString(buffer, image, CONFIG_HQ),
    },
    functionEvidence: FUNCTION_CONTRACTS.map(([entry, bodyRange, instructionCount, instructionSha256]) => requireFunction(functions.document.functions, entry, bodyRange, instructionCount, instructionSha256)),
    rawCodeRanges: RAW_CODE_RANGES.map((range) => verifyRawCodeRange(buffer, image, range)),
    callEdges: REQUIRED_CALLS.map(([site, caller, callee]) => requireCall(references.document.references, site, caller, callee)),
    evidencePoints: EVIDENCE_POINTS.map((point) => verifyEvidencePoint(buffer, image, point)),
    settingsObject: {
      base: "0x00634ab8",
      selector: "DWORD object+0x14 = DWORD 0x00634acc",
      initializer: {
        function: "FUN_0043f4f0",
        clearDwordCount: 0x75,
        selectorValue: 2,
        selectorWrite: "0x0043f504",
        boundary: "Other default writes in this function are not assigned semantics by this evidence unit.",
      },
    },
    coldStartFlow: {
      mainCaller: "FUN_0045f9c0 callsite 0x0045fa3b -> FUN_0045f190",
      startup: "FUN_0045f190 passes ECX=0x00634ab8 to FUN_0043f6e0 at 0x0045f20c; a zero return reaches the same-base initializer call at 0x0045f21a.",
      loadFailure: "FUN_0043f6e0 returns its zero open result when its config.hq open path fails, so the caller invokes FUN_0043f4f0 and selector becomes DWORD 2.",
      loadSuccess: {
        callsite: "0x0043f728 -> FUN_004adf44",
        stackArguments: [
          { calleeArgument: 1, value: "ESI destination object (0x00634ab8 from caller)" },
          { calleeArgument: 2, value: "0x1d4 count" },
          { calleeArgument: 3, value: "1 element size" },
          { calleeArgument: 4, value: "EDI stream" },
        ],
        transfer: "The successful path transfers/loads 0x1d4 bytes to the settings object before it returns one.",
        selectorCoverage: "object+0x14 is inside the 0x1d4-byte destination range, so persisted bytes at that offset can replace selector DWORD 0x00634acc.",
        separatePostTransferField: "The later FUN_0043f750 call forwards WORD object+0x10; it is not the selector DWORD at +0x14 and is not conflated with it.",
      },
    },
    selectorConsumerBoundary: {
      crossCheckedWith: "extract-k01-clock-mode-producers.mjs and gameplay-speed-mouse-settings.md",
      selectorTwoWhenModeIsNotOne: selectOriginalBaseInterval({ modeWord: 0, selector: 2 }),
      modeOneIndependentlyReturns: selectOriginalBaseInterval({ modeWord: 1, selector: 0 }),
      statement: "Absent a successfully loaded persisted config and before later option changes, cold-start initialization establishes selector 2; the existing consumer yields a 50 ms base for selector 2 when scheduler mode is not one. Mode one also returns a 50 ms base independently.",
      nonClaim: "This does not claim every K01 session is fixed at 50 ms: successful persisted configuration, later option-control changes, scheduler mode, session reachability, feedback, and accepted-update timing remain separate boundaries.",
      laterOptionBoundary: "Existing option controls FUN_004ac480/FUN_004ac490 can change the selector later; their producer/reachability is not re-derived here.",
    },
    testVectors: [
      {
        id: "load-failure-initializes-selector-two",
        input: { configLoadSucceeded: false },
        result: replayColdStartSelector({ configLoadSucceeded: false }),
        consumer: { modeWord: 0, baseIntervalMs: selectOriginalBaseInterval({ modeWord: 0, selector: 2 }) },
      },
      {
        id: "load-success-retains-persisted-selector-byte-range",
        input: { configLoadSucceeded: true, persistedSelector: 3 },
        result: replayColdStartSelector({ configLoadSucceeded: true, persistedSelector: 3 }),
        consumer: { modeWord: 0, baseIntervalMs: selectOriginalBaseInterval({ modeWord: 0, selector: 3 }) },
      },
      {
        id: "mode-one-consumer-bypasses-selector",
        input: { modeWord: 1, selector: 0 },
        result: { baseIntervalMs: selectOriginalBaseInterval({ modeWord: 1, selector: 0 }) },
      },
    ],
    uncertainties: [
      "This unit proves the cold-start branch and bounded transfer coverage, not that every config.hq byte sequence is valid or that a specific K01 session reaches either outcome.",
      "The transfer callee is described neutrally from verified argument order; a stronger generic stream-function role is not claimed.",
      "Later option-control mutation, scheduler-mode/session reachability, feedback, and exact accepted-update cadence remain governed by the linked existing evidence boundaries.",
    ],
  };
}

function readArtifact(path, label) {
  const expected = EXPECTED_ARTIFACTS[label];
  const buffer = readFileSync(path);
  assertEqual(buffer.byteLength, expected.byteLength, `${label} artifact byte length`);
  const digest = sha256(buffer);
  assertEqual(digest, expected.sha256, `${label} artifact SHA-256`);
  return {
    document: JSON.parse(buffer.toString("utf8")),
    provenance: { path: relative(ROOT, path), byteLength: buffer.byteLength, sha256: digest },
  };
}

function requireFunction(functions, entry, bodyRange, instructionCount, instructionSha256) {
  const found = functions.find((candidate) => candidate.entry === toHex(entry));
  if (!found) throw new Error(`functions artifact is missing ${toHex(entry)}`);
  assertEqual(found.bodyRanges.length, 1, `${toHex(entry)} body range count`);
  assertEqual(found.bodyRanges[0], bodyRange, `${toHex(entry)} body range`);
  assertEqual(found.instructionCount, instructionCount, `${toHex(entry)} instruction count`);
  assertEqual(found.instructionSha256, instructionSha256, `${toHex(entry)} instruction SHA-256`);
  return { entry: found.entry, bodyRange, instructionCount, instructionSha256 };
}

function requireCall(references, site, caller, callee) {
  const found = references.find((reference) => reference.type.endsWith("CALL") && reference.from === toHex(site) && reference.fromFunctionEntry === toHex(caller) && reference.to === toHex(callee));
  if (!found) throw new Error(`required call edge ${toHex(site)}: ${toHex(caller)} -> ${toHex(callee)} is missing`);
  return { callsite: found.from, caller: found.fromFunctionEntry, callee: found.to };
}

function verifyCString(buffer, image, { va, value, nulTerminatedSha256 }) {
  const rawOffset = image.vaToRawOffset(va);
  if (rawOffset === undefined) throw new RangeError(`${toHex(va)} is not file-backed`);
  assertEqual(readCString(buffer, rawOffset), value, `${toHex(va)} C string`);
  const bytes = readVaRange(buffer, image, va, va + Buffer.byteLength(value) + 1);
  assertEqual(bytes.at(-1), 0, `${toHex(va)} C string terminator`);
  assertEqual(sha256(bytes), nulTerminatedSha256, `${toHex(va)} C string SHA-256`);
  return { va: toHex(va), rawOffset: toHex(rawOffset), value, nulTerminatedSha256 };
}

function dword(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError(`${label} must be an unsigned DWORD`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(extractK01ClockSelectorInitializationEvidence(), null, 2)}\n`);
}
