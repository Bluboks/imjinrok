#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DATA_BASE, END_OFFSET_POINTER, OFFSET_TABLE_START, parseSpriteLikeHeader } from "./codec.mjs";
import { readPeImage, toHex } from "./pe-image.mjs";
import {
  assertEqual,
  readJson,
  verifyEvidencePoint,
  verifyRawCodeRange,
  sha256,
} from "./static-evidence.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_BUTTON_PATH = "original/imjinrok2/fnt/button.spr";
const DEFAULT_REFERENCES_PATH = "analysis/generated/imjinrok2/references.json";

export const EXPECTED_EXECUTABLE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_BUTTON_SHA256 =
  "cfe7bab02f2cb8a1f97a3161075e617ace22d6ecf5a976546263a7c67e4efbb4";
export const EXPECTED_REFERENCES_SHA256 =
  "f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5";

const BUTTON_RECORD = 0x00899828;
const BUTTON_PAYLOAD_FIELD = BUTTON_RECORD + DATA_BASE;
const BUTTON_OFFSET_TABLE = BUTTON_RECORD + OFFSET_TABLE_START;
const BUTTON_INDEX = 18;
const CONTROL_FRAME_FIELD = 0x005e3f02;

const CONTROL_BINDINGS = [
  [61, 27, 0x004579f5],
  [62, 26, 0x00457a13],
  [63, 28, 0x00457a27],
  [64, 29, 0x00457a45],
].map(([actionId, frameIndex, callSite]) => ({ actionId, frameIndex, callSite: toHex(callSite) }));

const EXPECTED_FRAMES = new Map([
  [26, { relativeOffset: 13748, dataOffset: 16808, size: 908 }],
  [27, { relativeOffset: 14656, dataOffset: 17716, size: 908 }],
  [28, { relativeOffset: 15564, dataOffset: 18624, size: 908 }],
  [29, { relativeOffset: 16472, dataOffset: 19532, size: 908 }],
]);

const RAW_CODE_RANGES = [
  ["common-spr-loader", 0x00443360, 0x0044343d, "80805e69437098006c8e2efce33121e9b98a1cf279f9baa19e7c4f9e2255694f"],
  ["common-spr-object-loader", 0x004434a0, 0x0044357f, "ab4c32302ba6ba9c56fad040df9689aad63a8e03eb33cdeab7b5972368170cf0"],
  ["control-record-constructor", 0x004576c0, 0x004576f9, "ec5599a94d3add2e24c2ddaf431d9340f6e58028c478425c02e9a909a89b04ec"],
  ["four-control-constructor-calls", 0x004579f5, 0x00457a63, "ef3886ba0b2c9ffe4a5183aae4cfe8bec08375474e0bfcb19820c1b9950acee5"],
  ["selected-command-renderer", 0x0045ad90, 0x0045b39f, "f82b78ede2f143ebabd5ca357b5580d09bfdb5c33755bdc1e9c34c1ccc8974fc"],
  ["selected-command-frame-path", 0x0045ae26, 0x0045af59, "67a2e7b13ccbfd5bc62a7b444940de6295bb05c3c548d1295290557ede7a3b2f"],
].map(([id, start, endExclusive, digest]) => ({ id, start, endExclusive, sha256: digest }));

const EVIDENCE = [
  [0x0044336b, "ba 94 c0 4b 00", "common loader initializes its source-path table cursor"],
  [0x00443377, "be b8 c0 88 00", "common loader initializes runtime record zero"],
  [0x004434ec, "83 f8 09 74 1c", "common object loader admits sprite type DWORD 9"],
  [0x0044351e, "68 f4 0b 00 00 57 e8 1b aa 06 00", "common object loader copies exactly 0x0bf4 source header bytes"],
  [0x00443538, "89 87 f4 0b 00 00", "common object loader stores the payload pointer at record +0x0bf4"],
  [0x004bc0dc, "30 d8 4b 00", "common table entry 18 points to fnt\\button.spr"],
  [0x004bd830, "66 6e 74 5c 62 75 74 74 6f 6e 2e 73 70 72 00", "common table entry 18 string is fnt\\button.spr"],
  [0x004576c0, "66 8b 44 24 04 66 8b 54 24 08 66 89 01 66 8b 44 24 0c 66 89 51 02", "FUN_004576c0 stores action WORD at record +0 and resource/frame WORD at +2"],
  [0x004579f5, "6a 00 6a 00 6a 00 6a 1b 6a 3d b9 10 41 5e 00 e8 b7 fc ff ff", "action 61 constructs a record with button frame 27"],
  [0x00457a13, "6a 00 6a 00 6a 00 6a 1a 6a 3e b9 20 41 5e 00 e8 99 fc ff ff", "action 62 constructs a record with button frame 26"],
  [0x00457a27, "68 68 77 aa 00 68 48 4e aa 00 6a 00 6a 00 6a 00 6a 1c 6a 3f b9 30 41 5e 00 e8 7b fc ff ff", "action 63 constructs a record with button frame 28"],
  [0x00457a45, "68 28 77 aa 00 68 68 4e aa 00 6a 00 6a 00 6a 00 6a 1d 6a 40 b9 40 41 5e 00 e8 5d fc ff ff", "action 64 constructs a record with button frame 29"],
  [0x0045ae4a, "0f bf 82 02 3f 5e 00", "selected renderer reads the frame/resource WORD from action*0x10 + 0x005e3f02"],
  [0x0045aeb2, "8b 15 1c a4 89 00", "selected renderer reads the button payload base"],
  [0x0045af34, "8b 14 95 e8 9c 89 00", "selected renderer reads the button frame relative-offset table"],
  [0x0045af3b, "03 15 1c a4 89 00", "selected renderer adds the button payload base to the frame relative offset"],
  [0x0045af4a, "52 50 51 53 55 b9 18 94 55 00 e8 77 30 ff ff", "selected renderer submits the resolved command-icon frame to the draw helper"],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

const RENDERER_REFERENCE_SET = {
  label: "complete structured direct references from the selected command renderer to the action-frame and button-frame data",
  count: 14,
  digest: "28b095774b21aff7d5159fe0e70cbbf97f240ccc8fb4ed023c8ea299033855db",
};

export function extractCommandIconFrameBinding({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  buttonPath = DEFAULT_BUTTON_PATH,
  referencesPath = DEFAULT_REFERENCES_PATH,
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  assertEqual(sha256(buffer), EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);
  const buttonBytes = readFileSync(buttonPath);
  assertEqual(sha256(buttonBytes), EXPECTED_BUTTON_SHA256, `${buttonPath} SHA-256`);
  const button = parseSpriteLikeHeader(buttonBytes, buttonPath);
  assertEqual(button.width, 34, "button.spr width");
  assertEqual(button.height, 34, "button.spr height");
  assertEqual(button.frameCount, 289, "button.spr frame count");
  assertEqual(OFFSET_TABLE_START, 0x04c0, "button.spr offset-table source offset");
  assertEqual(END_OFFSET_POINTER, 0x0bc8, "button.spr terminal-offset source offset");
  assertEqual(DATA_BASE, 0x0bf4, "button.spr payload source offset");

  const referenceBytes = readFileSync(referencesPath);
  assertEqual(sha256(referenceBytes), EXPECTED_REFERENCES_SHA256, `${referencesPath} SHA-256`);
  const references = readJson(referencesPath);
  assertEqual(references.sourceSha256, EXPECTED_EXECUTABLE_SHA256, `${referencesPath} source SHA-256`);

  const bindings = CONTROL_BINDINGS.map((binding) => ({ ...binding, frame: verifyFrame(button, binding.frameIndex) }));
  const rendererReferences = referenceRows(references, (entry) =>
    entry.fromFunctionEntry === "0x0045ad90" &&
    ["0x005e3f02", "0x0089982c", "0x00899830", "0x00899ce8", "0x0089a41c"].includes(entry.to),
  );
  const rendererDigest = createHash("sha256").update(JSON.stringify(rendererReferences)).digest("hex");
  assertEqual(rendererReferences.length, RENDERER_REFERENCE_SET.count, `${RENDERER_REFERENCE_SET.label} count`);
  assertEqual(rendererDigest, RENDERER_REFERENCE_SET.digest, `${RENDERER_REFERENCE_SET.label} digest`);

  return {
    question: "Which exact button.spr pixel frame does each original selected command control action 61..64 submit to the 34x34 draw path?",
    analysisStatus: "static-confirmed-for-action-61-through-64-to-button-frame-binding",
    reproductionStatus: "reproduction-complete-for-bounded-control-frame-selection-and-no-draw-failure-boundaries",
    implementationStatus: "analysis-only-no-product-semantic-mapping",
    sources: {
      executable: { path: executablePath, sha256: EXPECTED_EXECUTABLE_SHA256 },
      button: { path: buttonPath, sha256: EXPECTED_BUTTON_SHA256, headerDwords: { magic: 9, width: button.width, height: button.height, frameCount: button.frameCount } },
      references: { path: referencesPath, sha256: EXPECTED_REFERENCES_SHA256 },
    },
    loaderContract: {
      commonLoaderEntryIndex: BUTTON_INDEX,
      sourcePath: "fnt\\button.spr",
      runtimeRecord: toHex(BUTTON_RECORD),
      headerCopyBytes: toHex(DATA_BASE),
      runtimePayloadPointerField: toHex(BUTTON_PAYLOAD_FIELD),
      runtimeFrameOffsetTable: toHex(BUTTON_OFFSET_TABLE),
      failure: "A failed common-loader object does not establish a valid payload pointer or a successful command-icon draw; this extractor does not invent a loader-success result.",
    },
    controlRecord: {
      constructor: "FUN_004576c0",
      actionWord: "+0x00",
      frameWord: "+0x02",
      bindings,
    },
    renderer: {
      function: "FUN_0045ad90",
      actionFrameField: toHex(CONTROL_FRAME_FIELD),
      frameAddressRule: "relativeOffset = DWORD[0x00899ce8 + frameIndex * 4]; sourceFrame = DWORD[0x0089a41c] + relativeOffset",
      submittedDimensions: { width: button.width, height: button.height },
      slotAbsentRule: "A disabled or absent selected slot takes no frame lookup or draw path.",
    },
    rawCodeRanges: RAW_CODE_RANGES.map((range) => verifyRawCodeRange(buffer, image, range)),
    evidencePoints: EVIDENCE.map((point) => verifyEvidencePoint(buffer, image, point)),
    referenceSets: [{ ...RENDERER_REFERENCE_SET, references: rendererReferences }],
    unresolvedBoundary: "This closes only the original action-ID-to-button pixel-frame path for actions 61..64. It does not assign product semantics or alter the project's independent 4x3 command grid.",
  };
}

export function reproduceCommandIconFrameBinding(input) {
  assertRecord(input, "input");
  const slotPresent = assertBoolean(input.slotPresent, "slotPresent");
  const output = { slotPresent, operations: [] };
  if (!slotPresent) {
    output.operations.push({ type: "selected-slot-absent-no-frame-lookup-or-draw" });
    return output;
  }

  const buttonLoadSucceeded = assertBoolean(input.buttonLoadSucceeded, "buttonLoadSucceeded");
  if (!buttonLoadSucceeded) {
    output.operations.push({ type: "button-loader-failure-no-frame-resolution-or-draw" });
    return output;
  }

  const actionId = assertInteger(input.actionId, 0, 0xffff, "actionId");
  const binding = CONTROL_BINDINGS.find((candidate) => candidate.actionId === actionId);
  if (!binding) {
    output.actionId = actionId;
    output.operations.push({ type: "action-not-in-bounded-control-binding-no-frame-contract" });
    return output;
  }

  const frameCount = assertInteger(input.frameCount, 0, 10000, "frameCount");
  output.actionId = actionId;
  output.frameIndex = binding.frameIndex;
  if (binding.frameIndex >= frameCount) {
    output.operations.push({ type: "frame-index-out-of-range-no-draw", frameCount });
    return output;
  }

  const frame = EXPECTED_FRAMES.get(binding.frameIndex);
  output.frame = { index: binding.frameIndex, ...frame };
  output.operations.push({
    type: "resolve-button-frame-and-submit-34x34-draw",
    callSite: binding.callSite,
    dimensions: { width: 34, height: 34 },
  });
  return output;
}

export function createCommandIconFrameBindingFixture() {
  const vectors = [
    ["action-61-frame-27", { slotPresent: true, buttonLoadSucceeded: true, actionId: 61, frameCount: 289 }],
    ["action-62-frame-26", { slotPresent: true, buttonLoadSucceeded: true, actionId: 62, frameCount: 289 }],
    ["action-63-frame-28", { slotPresent: true, buttonLoadSucceeded: true, actionId: 63, frameCount: 289 }],
    ["action-64-frame-29", { slotPresent: true, buttonLoadSucceeded: true, actionId: 64, frameCount: 289 }],
    ["disabled-slot", { slotPresent: false, buttonLoadSucceeded: "unreached", actionId: "unreached", frameCount: "unreached" }],
    ["loader-failure", { slotPresent: true, buttonLoadSucceeded: false, actionId: "unreached", frameCount: "unreached" }],
    ["out-of-range-frame", { slotPresent: true, buttonLoadSucceeded: true, actionId: 61, frameCount: 27 }],
  ].map(([id, input]) => ({ id, input, expected: reproduceCommandIconFrameBinding(input) }));
  return {
    sourceExecutableSha256: EXPECTED_EXECUTABLE_SHA256,
    sourceButtonSha256: EXPECTED_BUTTON_SHA256,
    sourceReferencesSha256: EXPECTED_REFERENCES_SHA256,
    vectors,
  };
}

function verifyFrame(button, frameIndex) {
  const expected = EXPECTED_FRAMES.get(frameIndex);
  const frame = button.frames[frameIndex];
  if (!frame) throw new RangeError(`button.spr frame ${frameIndex} is missing`);
  for (const [key, value] of Object.entries(expected)) {
    assertEqual(frame[key], value, `button.spr frame ${frameIndex} ${key}`);
  }
  return { index: frame.index, relativeOffset: frame.relativeOffset, dataOffset: frame.dataOffset, size: frame.size };
}

function referenceRows(references, predicate) {
  if (!Array.isArray(references.references)) throw new TypeError("references.json must contain a references array");
  return references.references
    .filter(predicate)
    .map(({ from, to, type, fromFunctionEntry }) => ({ from, to, type, fromFunctionEntry }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function assertRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
}

function assertBoolean(value, label) {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be a boolean`);
  return value;
}

function assertInteger(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${label} must be an integer in ${min}..${max}`);
  }
  return value;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--fixture")) {
    console.log(JSON.stringify(createCommandIconFrameBindingFixture()));
  } else {
    console.log(JSON.stringify(extractCommandIconFrameBinding(), null, 2));
  }
}
