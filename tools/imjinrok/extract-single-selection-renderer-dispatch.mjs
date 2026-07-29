#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readPeImage } from "./pe-image.mjs";
import {
  assertEqual,
  readJson,
  sha256,
  verifyEvidencePoint,
  verifyRawCodeRange,
} from "./static-evidence.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_FUNCTIONS_PATH = "analysis/generated/imjinrok2/functions.json";
const DEFAULT_REFERENCES_PATH = "analysis/generated/imjinrok2/references.json";

export const EXPECTED_EXECUTABLE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_FUNCTIONS_SHA256 =
  "c10ea2de1f4998411d52443419c9a7f52ff7f9c18e79bd4115ba197d2f5bebc3";
export const EXPECTED_REFERENCES_SHA256 =
  "df11ff3713988ef22b3390b5b0ae7b4a87464b5de547a4866e1c8ec8a0bcaf4c";

const SELECTED_RENDERER_FUNCTION = {
  entry: "0x00421390",
  bodyRange: "0x00421390-0x004213fb",
  instructionCount: 35,
  instructionSha256: "42b9f50cb822fdf2dc6943f38f719cd4d651840e289b22dc76424c236188f7d1",
};

const COMMAND_RENDERER_FUNCTION = {
  entry: "0x0045ad90",
  bodyRange: "0x0045ad90-0x0045b39e",
  instructionCount: 458,
  instructionSha256: "7a994e241299d22b0ea3dd79f23805885fe369986236e0d59d4bbf3e5c96c430",
};

const RAW_CODE_RANGES = [
  ["single-selection-renderer", 0x00421390, 0x004213fb, "9a18481846deba1286c0363a516a4dabd6895d836f43d606e324fd60793f1a30"],
  ["selection-command-renderer", 0x0045ad90, 0x0045b39e, "3f7d38194db1f906737522ec6aa63509c3b3768ac2c4dcb3938df9695f671684"],
].map(([id, start, endExclusive, digest]) => ({ id, start, endExclusive, sha256: digest }));

const EVIDENCE = [
  [0x0045adb8, "8b 4c 24 10 8d 14 c0 51 8d 04 50 8d 04 c0 8d 0c c5 58 52 63 00 e8 be 65 fc ff", "the exact-one branch derives and pushes the selected argument before the sole call at 0x0045adcd"],
  [0x00421390, "56 57 8b 7c 24 0c 8b f1 57 b9 18 94 55 00 e8 0d 98 02 00 83 f8 01 75 47", "single-selection renderer saves its selected argument, attempts FUN_0044abb0 on DAT_00559418, and requires result exactly one"],
  [0x004213a8, "8b ce e8 71 f8 ff ff 66 a1 94 bd 88 00 8b ce 66 89 46 2a", "the successful branch calls FUN_00420c20 then copies WORD[0x0088bd94] to owner plus 0x2a"],
  [0x004213bb, "e8 50 04 00 00 8b ce e8 e9 04 00 00 8b ce e8 72 06 00 00 8b ce e8 8b 05 00 00", "the successful branch calls the four opaque subrenderers in source order"],
  [0x004213d8, "f6 c4 06 74 07 8b ce e8 3c 07 00 00", "test ah, 0x6 conditionally calls FUN_00421b20 when owner plus 0x74 has either 0x200 or 0x400 set"],
  [0x004213e4, "57 b9 18 94 55 00 e8 b1 99 02 00", "only the successful branch unlocks DAT_00559418 with the same selected argument"],
  [0x004213ef, "57 8b ce e8 59 01 00 00 5f 5e c2 04", "both lock outcomes finally call FUN_00421550 with the owner receiver and selected argument"],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

const REFERENCE_SPECS = [
  ["single-selection renderer outgoing", (entry) => entry.fromFunctionEntry === SELECTED_RENDERER_FUNCTION.entry, 14, "721696f52154c1b1ee8773deeb64f5eadfc4d9033e257ed9f5e3524139e436c3"],
  ["sole exact-one incoming call", (entry) => entry.to === SELECTED_RENDERER_FUNCTION.entry, 1, "3656d454a2340955df296b779cdea6f523d984e50c0aaadfd15c98bb036c80b0"],
  ["exact-one caller projection", (entry) => entry.fromFunctionEntry === COMMAND_RENDERER_FUNCTION.entry && entry.to === SELECTED_RENDERER_FUNCTION.entry, 1, "3656d454a2340955df296b779cdea6f523d984e50c0aaadfd15c98bb036c80b0"],
];

export function extractSingleSelectionRendererDispatch({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  functionsPath = DEFAULT_FUNCTIONS_PATH,
  referencesPath = DEFAULT_REFERENCES_PATH,
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  assertEqual(sha256(buffer), EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);

  const functionsBytes = readFileSync(functionsPath);
  assertEqual(sha256(functionsBytes), EXPECTED_FUNCTIONS_SHA256, `${functionsPath} SHA-256`);
  const functions = readJson(functionsPath);
  assertEqual(functions.sourceSha256, EXPECTED_EXECUTABLE_SHA256, `${functionsPath} source SHA-256`);

  const referencesBytes = readFileSync(referencesPath);
  assertEqual(sha256(referencesBytes), EXPECTED_REFERENCES_SHA256, `${referencesPath} SHA-256`);
  const references = readJson(referencesPath);
  assertEqual(references.sourceSha256, EXPECTED_EXECUTABLE_SHA256, `${referencesPath} source SHA-256`);

  return {
    question: "What exact single-selection renderer dispatch does FUN_0045ad90 invoke, and which bounded lock, call, flag, unlock, and final-helper ordering is statically proven without assigning subrenderer meanings?",
    analysisStatus: "static-confirmed-for-single-selection-renderer-dispatch",
    reproductionStatus: "reproduction-complete-for-bounded-lock-and-call-order",
    implementationStatus: "analysis-only-no-product-change",
    sources: {
      executableSha256: EXPECTED_EXECUTABLE_SHA256,
      functionsSha256: EXPECTED_FUNCTIONS_SHA256,
      referencesSha256: EXPECTED_REFERENCES_SHA256,
    },
    commandRenderer: verifyFunctionMetadata(functions, COMMAND_RENDERER_FUNCTION),
    selectedRenderer: verifyFunctionMetadata(functions, SELECTED_RENDERER_FUNCTION),
    dispatch: {
      caller: "FUN_0045ad90",
      callsite: "0x0045adcd",
      callee: "FUN_00421390",
      incomingCallCount: 1,
      selectedArgument: "the caller-derived DWORD pushed at 0x0045adbf; FUN_00421390 passes it to lock, successful unlock, and final helper",
      receiver: "ECX owner; its semantic type remains opaque",
    },
    ordering: {
      always: ["call FUN_0044abb0", "call FUN_00421550"],
      lockResultExactlyOne: [
        "call FUN_00420c20",
        "copy WORD[0x0088bd94] to owner+0x2a",
        "call FUN_00421810",
        "call FUN_004218b0",
        "call FUN_00421a40",
        "call FUN_00421960",
        "conditionally call FUN_00421b20 when (DWORD[owner+0x74] & 0x600) != 0",
        "call FUN_0044ada0",
      ],
      lockFailure: "skip all successful-only reads, calls, and unlock; still call FUN_00421550",
    },
    rawCodeRanges: RAW_CODE_RANGES.map((range) => verifyRawCodeRange(buffer, image, range)),
    evidencePoints: EVIDENCE.map((point) => verifyEvidencePoint(buffer, image, point)),
    referenceSets: REFERENCE_SPECS.map(([label, predicate, count, digest]) => verifyReferenceSet(references, { label, predicate, count, digest })),
    unresolvedBoundary: "The callee identities, argument/order, lock gate, owner WORD copy, flag admission, unlock, and final helper are bounded here. The semantic contents of FUN_00420c20/FUN_00421810/FUN_004218b0/FUN_00421a40/FUN_00421960/FUN_00421b20/FUN_00421550, action labels/icons, portrait/health/mana contents, HUD background placement, and DAT_00559418's concrete DirectDraw/vtable semantic owner remain unresolved.",
  };
}

export function reproduceSingleSelectionRendererDispatch(input) {
  assertRecord(input, "input");
  const selectedArgument = assertU32(input.selectedArgument, "selectedArgument");
  const lockResult = assertU32(input.lockResult, "lockResult");
  const operations = [call("FUN_0044abb0", "DAT_00559418", selectedArgument)];

  if (lockResult === 1) {
    const layoutWord = assertU16(input.layoutWord, "layoutWord");
    const ownerFlags = assertU32(input.ownerFlags, "ownerFlags");
    operations.push(
      call("FUN_00420c20", "owner"),
      { type: "copy-word", source: "WORD[0x0088bd94]", destination: "owner+0x2a", value: layoutWord },
      call("FUN_00421810", "owner"),
      call("FUN_004218b0", "owner"),
      call("FUN_00421a40", "owner"),
      call("FUN_00421960", "owner"),
    );
    if ((ownerFlags & 0x600) !== 0) {
      operations.push(call("FUN_00421b20", "owner"));
    }
    operations.push(call("FUN_0044ada0", "DAT_00559418", selectedArgument));
  }

  operations.push(call("FUN_00421550", "owner", selectedArgument));
  return { selectedArgument, lockResult, operations };
}

function call(functionName, receiver, selectedArgument) {
  return selectedArgument === undefined
    ? { type: "call", function: functionName, receiver }
    : { type: "call", function: functionName, receiver, selectedArgument };
}

function verifyFunctionMetadata(functions, expected) {
  const functionRecord = functions.functions?.find((entry) => entry.entry === expected.entry);
  if (!functionRecord) {
    throw new Error(`${expected.entry} is missing from functions.json`);
  }
  assertEqual(functionRecord.bodyRanges?.length, 1, `${expected.entry} body range count`);
  assertEqual(functionRecord.bodyRanges[0], expected.bodyRange, `${expected.entry} body range`);
  assertEqual(functionRecord.instructionCount, expected.instructionCount, `${expected.entry} instruction count`);
  assertEqual(functionRecord.instructionSha256, expected.instructionSha256, `${expected.entry} instruction SHA-256`);
  return {
    entry: expected.entry,
    bodyRange: expected.bodyRange,
    instructionCount: expected.instructionCount,
    instructionSha256: expected.instructionSha256,
  };
}

function verifyReferenceSet(references, spec) {
  const rows = referenceRows(references, spec.predicate);
  const digest = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  assertEqual(rows.length, spec.count, `${spec.label} count`);
  assertEqual(digest, spec.digest, `${spec.label} digest`);
  return { label: spec.label, count: rows.length, digest, references: rows };
}

function referenceRows(references, predicate) {
  if (!Array.isArray(references.references)) {
    throw new TypeError("references.json must contain a references array");
  }
  return references.references
    .filter(predicate)
    .map(({ from, to, type, fromFunctionEntry, operandIndex, primary }) => ({ from, to, type, fromFunctionEntry, operandIndex, primary }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function assertRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function assertU16(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new RangeError(`${label} must be an unsigned original WORD value (0..65535); got ${String(value)}`);
  }
  return value;
}

function assertU32(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new RangeError(`${label} must be an unsigned original DWORD value (0..4294967295); got ${String(value)}`);
  }
  return value;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(extractSingleSelectionRendererDispatch(), null, 2));
}
