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
  readVaRange,
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
const COMMAND_LABEL_RUNTIME_BASE = 0x00aa4018;

const CONTROL_BINDINGS = [
  [2, 43, 0x00457700, 0x004c8524, "정지", "c1a4c1f600", 0x00aa4ae8],
  [3, 6, 0x0045771b, 0x004c851c, "이동", "c0ccb5bf00", 0x00aa4b08],
  [5, 4, 0x00457736, 0x004c8514, "공격", "b0f8b0dd00", 0x00aa4b28],
  [11, 16, 0x0045776c, 0x004c8504, "건설", "b0c7bcb300", 0x00aa4b68],
  [16, 12, 0x004577a2, 0x004c84f4, "수리", "bcf6b8ae00", 0x00aa4ba8],
  [19, 45, 0x004577f3, 0x004c84dc, "취소", "c3ebbcd200", 0x00aa4c08],
  [21, 11, 0x00457847, 0x004c84d0, "집결지설정", "c1fdb0e1c1f6bcb3c1a400", 0x00aa4c28],
  [35, 10, 0x004578b3, 0x004c84b0, "순찰", "bcf8c2fb00", 0x00aa4ca8],
  [39, 39, 0x0045791f, 0x004c848c, "사수", "bbe7bcf600", 0x00aa4d28],
  [61, 27, 0x004579f5],
  [62, 26, 0x00457a13],
  [63, 28, 0x00457a27],
  [64, 29, 0x00457a45],
].map(([actionId, frameIndex, callSite, sourceLabelAddress, sourceLabel, sourceLabelBytes, runtimeLabelAddress]) => ({
  actionId,
  frameIndex,
  callSite: toHex(callSite),
  ...(sourceLabel && {
    sourceLabel: {
      address: toHex(sourceLabelAddress),
      value: sourceLabel,
      cp949Bytes: sourceLabelBytes,
      runtimeAddress: toHex(runtimeLabelAddress),
      runtimeOffset: toHex(runtimeLabelAddress - COMMAND_LABEL_RUNTIME_BASE),
    },
  }),
}));

const EXPECTED_FRAMES = new Map([
  [4, { relativeOffset: 2200, dataOffset: 5260, size: 908 }],
  [6, { relativeOffset: 3176, dataOffset: 6236, size: 908 }],
  [10, { relativeOffset: 4288, dataOffset: 7348, size: 908 }],
  [11, { relativeOffset: 5196, dataOffset: 8256, size: 908 }],
  [12, { relativeOffset: 6104, dataOffset: 9164, size: 908 }],
  [16, { relativeOffset: 8056, dataOffset: 11116, size: 68 }],
  [26, { relativeOffset: 13748, dataOffset: 16808, size: 908 }],
  [27, { relativeOffset: 14656, dataOffset: 17716, size: 908 }],
  [28, { relativeOffset: 15564, dataOffset: 18624, size: 908 }],
  [29, { relativeOffset: 16472, dataOffset: 19532, size: 908 }],
  [39, { relativeOffset: 25529, dataOffset: 28589, size: 908 }],
  [43, { relativeOffset: 29161, dataOffset: 32221, size: 908 }],
  [45, { relativeOffset: 30977, dataOffset: 34037, size: 908 }],
]);

const RAW_CODE_RANGES = [
  ["common-spr-loader", 0x00443360, 0x0044343d, "80805e69437098006c8e2efce33121e9b98a1cf279f9baa19e7c4f9e2255694f"],
  ["common-spr-object-loader", 0x004434a0, 0x0044357f, "ab4c32302ba6ba9c56fad040df9689aad63a8e03eb33cdeab7b5972368170cf0"],
  ["command-label-copy-function", 0x0048ea90, 0x004924b2, "a6c3bb4ff4927abf560e2de8674c7c62a6dc8af7101cb140339c5d7ae15a51c8"],
  ["command-label-copy-chain", 0x0048f201, 0x0048f50f, "980bffb16472724900767d35ef56de67c853692bb696b5909fb1e8c9b1084d58"],
  ["command-label-copy-caller", 0x0045f190, 0x0045f1b2, "24870318cc54a9ed4292e4ebf6b8f3df78d4383d63804a3799d8332c76de294a"],
  ["control-record-constructor", 0x004576c0, 0x004576f9, "ec5599a94d3add2e24c2ddaf431d9340f6e58028c478425c02e9a909a89b04ec"],
  ["labelled-control-constructor-calls", 0x00457700, 0x0045793a, "b2c67c164c03bf263333012e9e5cf6ad29974ecae7ab3f296148aac216d8a66d"],
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
  [0x0045f19e, "b9 18 40 aa 00 e8 e8 f8 02 00 e8 53 85 ff ff", "initializer passes command-label runtime base 0x00aa4018 to FUN_0048ea90 before FUN_00457700 constructs controls"],
  [0x0048f201, "8b fb 8d 9a d0 0a 00 00", "the label-copy chain advances to runtime base +0x0ad0 before copying source label 0x004c8524"],
  [0x0048f217, "bf 24 85 4c 00", "the label-copy chain selects source CP949 label 0x004c8524"],
  [0x0048f242, "bf 1c 85 4c 00", "the label-copy chain selects source CP949 label 0x004c851c"],
  [0x0048f26a, "bf 14 85 4c 00", "the label-copy chain selects source CP949 label 0x004c8514"],
  [0x0048f2b7, "bf 04 85 4c 00", "the label-copy chain selects source CP949 label 0x004c8504"],
  [0x0048f30a, "bf f4 84 4c 00", "the label-copy chain selects source CP949 label 0x004c84f4"],
  [0x0048f37f, "bf dc 84 4c 00", "the label-copy chain selects source CP949 label 0x004c84dc"],
  [0x0048f3a7, "bf d0 84 4c 00", "the label-copy chain selects source CP949 label 0x004c84d0"],
  [0x0048f447, "bf b0 84 4c 00", "the label-copy chain selects source CP949 label 0x004c84b0"],
  [0x0048f4ea, "bf 8c 84 4c 00", "the label-copy chain selects source CP949 label 0x004c848c"],
  [0x004576c0, "66 8b 44 24 04 66 8b 54 24 08 66 89 01 66 8b 44 24 0c 66 89 51 02", "FUN_004576c0 stores action WORD at record +0 and resource/frame WORD at +2"],
  [0x00457700, "6a 00 68 e8 4a aa 00 6a 73 6a 53 6a 01 6a 2b 6a 02 b9 10 3f 5e 00 e8 a5 ff ff ff", "action 2 uses runtime label 0x00aa4ae8 and button frame 43"],
  [0x0045771b, "6a 00 68 08 4b aa 00 6a 6d 6a 4d 6a 01 6a 06 6a 03 b9 20 3f 5e 00 e8 8a ff ff ff", "action 3 uses runtime label 0x00aa4b08 and button frame 6"],
  [0x00457736, "6a 00 68 28 4b aa 00 6a 61 6a 41 6a 01 6a 04 6a 05 b9 40 3f 5e 00 e8 6f ff ff ff", "action 5 uses runtime label 0x00aa4b28 and button frame 4"],
  [0x0045776c, "6a 00 68 68 4b aa 00 6a 62 6a 42 6a 00 6a 10 6a 0b b9 80 3f 5e 00 e8 39 ff ff ff", "action 11 uses runtime label 0x00aa4b68 and button frame 16"],
  [0x004577a2, "6a 00 68 a8 4b aa 00 6a 72 6a 52 6a 01 6a 0c 6a 10 b9 a0 3f 5e 00 e8 03 ff ff ff", "action 16 uses runtime label 0x00aa4ba8 and button frame 12"],
  [0x004577f3, "6a 00 68 08 4c aa 00 6a 63 6a 43 6a 00 6a 2d 6a 13 b9 d0 3f 5e 00 e8 b2 fe ff ff", "action 19 uses runtime label 0x00aa4c08 and button frame 45"],
  [0x00457847, "6a 00 68 28 4c aa 00 6a 74 6a 54 6a 00 6a 0b 6a 15 b9 10 40 5e 00 e8 5e fe ff ff", "action 21 uses runtime label 0x00aa4c28 and button frame 11"],
  [0x004578b3, "6a 00 68 a8 4c aa 00 6a 70 6a 50 6a 01 6a 0a 6a 23 b9 40 40 5e 00 e8 f2 fd ff ff", "action 35 uses runtime label 0x00aa4ca8 and button frame 10"],
  [0x0045791f, "6a 00 68 28 4d aa 00 6a 68 6a 48 6a 01 6a 27 6a 27 b9 60 40 5e 00 e8 86 fd ff ff", "action 39 uses runtime label 0x00aa4d28 and button frame 39"],
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

  const bindings = CONTROL_BINDINGS.map((binding) => ({
    ...binding,
    frame: verifyFrame(button, binding.frameIndex),
    ...(binding.sourceLabel && { sourceLabel: verifySourceLabel(buffer, image, binding.sourceLabel) }),
  }));
  const rendererReferences = referenceRows(references, (entry) =>
    entry.fromFunctionEntry === "0x0045ad90" &&
    ["0x005e3f02", "0x0089982c", "0x00899830", "0x00899ce8", "0x0089a41c"].includes(entry.to),
  );
  const rendererDigest = createHash("sha256").update(JSON.stringify(rendererReferences)).digest("hex");
  assertEqual(rendererReferences.length, RENDERER_REFERENCE_SET.count, `${RENDERER_REFERENCE_SET.label} count`);
  assertEqual(rendererDigest, RENDERER_REFERENCE_SET.digest, `${RENDERER_REFERENCE_SET.label} digest`);

  return {
    question: "Which exact button.spr pixel frame does each original command control action submit to the 34x34 draw path, and which source CP949 labels are copied into the constructor's runtime label pointers?",
    analysisStatus: "static-confirmed-for-bounded-command-action-label-and-button-frame-bindings",
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
      commandLabelCopy: {
        function: "FUN_0048ea90",
        runtimeBase: toHex(COMMAND_LABEL_RUNTIME_BASE),
        sourceEncoding: "CP949",
        order: "FUN_0045f190 passes ECX=0x00aa4018 to FUN_0048ea90, then calls FUN_00457700; each bounded constructor passes its copied runtime label pointer as a later argument.",
      },
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
    unresolvedBoundary: "This closes only the bounded original action-ID-to-button pixel-frame path, and CP949 source-label-to-runtime-pointer path, for actions 2/3/5/11/16/19/21/35/39/61/62/63/64. It does not assign product semantics or alter the project's independent 4x3 command grid.",
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
  if (binding.sourceLabel) {
    output.label = {
      value: binding.sourceLabel.value,
      sourceAddress: binding.sourceLabel.address,
      runtimeAddress: binding.sourceLabel.runtimeAddress,
      encoding: "CP949",
    };
  }
  output.operations.push({
    type: "resolve-button-frame-and-submit-34x34-draw",
    callSite: binding.callSite,
    dimensions: { width: 34, height: 34 },
  });
  return output;
}

export function createCommandIconFrameBindingFixture() {
  const vectors = [
    ["action-2-stop-frame-43", { slotPresent: true, buttonLoadSucceeded: true, actionId: 2, frameCount: 289 }],
    ["action-3-move-frame-6", { slotPresent: true, buttonLoadSucceeded: true, actionId: 3, frameCount: 289 }],
    ["action-5-attack-frame-4", { slotPresent: true, buttonLoadSucceeded: true, actionId: 5, frameCount: 289 }],
    ["action-11-build-frame-16", { slotPresent: true, buttonLoadSucceeded: true, actionId: 11, frameCount: 289 }],
    ["action-16-repair-frame-12", { slotPresent: true, buttonLoadSucceeded: true, actionId: 16, frameCount: 289 }],
    ["action-19-cancel-frame-45", { slotPresent: true, buttonLoadSucceeded: true, actionId: 19, frameCount: 289 }],
    ["action-21-rally-frame-11", { slotPresent: true, buttonLoadSucceeded: true, actionId: 21, frameCount: 289 }],
    ["action-35-patrol-frame-10", { slotPresent: true, buttonLoadSucceeded: true, actionId: 35, frameCount: 289 }],
    ["action-39-hold-frame-39", { slotPresent: true, buttonLoadSucceeded: true, actionId: 39, frameCount: 289 }],
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

function verifySourceLabel(buffer, image, sourceLabel) {
  const address = Number.parseInt(sourceLabel.address.slice(2), 16);
  const expected = Buffer.from(sourceLabel.cp949Bytes, "hex");
  const actual = readVaRange(buffer, image, address, address + expected.length);
  assertEqual(Buffer.compare(actual, expected), 0, `${sourceLabel.address} CP949 source bytes`);
  assertEqual(actual.at(-1), 0, `${sourceLabel.address} CP949 terminator`);
  assertEqual(new TextDecoder("euc-kr").decode(actual.subarray(0, -1)), sourceLabel.value, `${sourceLabel.address} CP949 decoded label`);
  const runtimeAddress = Number.parseInt(sourceLabel.runtimeAddress.slice(2), 16);
  assertEqual(runtimeAddress - COMMAND_LABEL_RUNTIME_BASE, Number.parseInt(sourceLabel.runtimeOffset.slice(2), 16), `${sourceLabel.address} runtime copy offset`);
  return sourceLabel;
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
