#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseSpriteLikeHeader } from "./codec.mjs";
import { readPeImage } from "./pe-image.mjs";
import {
  assertEqual,
  readJson,
  sha256,
  verifyEvidencePoint,
  verifyRawCodeRange,
} from "./static-evidence.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_PANEL_PATH = "original/imjinrok2/fnt/pannel.spr";
const DEFAULT_REFERENCES_PATH = "analysis/generated/imjinrok2/references.json";

export const EXPECTED_EXECUTABLE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_PANEL_SHA256 =
  "18a58466dd95fab6d946ed6dfb0647d8a315733a6a9bfb1b069c0e3a8d81b42e";
export const EXPECTED_REFERENCES_SHA256 =
  "f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5";

const PANEL_TABLE_ENTRY = 0x004bc098;
const PANEL_RECORD = 0x0088ccb0;
const PANEL_RECORD_STRIDE = 0x0bf8;
const PANEL_WIDTH_FIELD = PANEL_RECORD + 0x04;
const PANEL_HEIGHT_FIELD = PANEL_RECORD + 0x08;
const PANEL_PAYLOAD_FIELD = PANEL_RECORD + 0x0bf4;

const RAW_CODE_RANGES = [
  ["common-spr-loader", 0x00443360, 0x0044343d, "80805e69437098006c8e2efce33121e9b98a1cf279f9baa19e7c4f9e2255694f"],
  ["common-spr-object-loader", 0x004434a0, 0x0044357f, "ab4c32302ba6ba9c56fad040df9689aad63a8e03eb33cdeab7b5972368170cf0"],
  ["gameplay-hud-frame-root", 0x004475a0, 0x00447bb9, "81e6e28cf3a20e2ecd6d1f2e7ede44e646f044fbf86aa581620baa41f67f9f9c"],
  ["indexed-sprite-blit", 0x0044dc70, 0x0044dd01, "484f8032c602d26037a2606aa0d22262e0b9688fe70415cbb4870f04824643da"],
].map(([id, start, endExclusive, digest]) => ({ id, start, endExclusive, sha256: digest }));

const EVIDENCE = [
  [0x0044336b, "ba 94 c0 4b 00", "common loader starts at the resource-path pointer table 0x004bc094"],
  [0x00443377, "be b8 c0 88 00", "common loader starts destination records at 0x0088c0b8"],
  [0x004433ed, "81 c6 f8 0b 00 00", "common loader advances each destination record by 0x0bf8 bytes"],
  [0x004433f3, "83 c7 04", "common loader advances one resource-path table entry at a time"],
  [0x004bc098, "44 d9 4b 00", "the second resource-path table entry points to the embedded pannel path"],
  [0x004bd944, "66 6e 74 5c 70 61 6e 6e 65 6c 2e 73 70 72 00", "embedded path is fnt\\pannel.spr"],
  [0x0044351e, "68 f4 0b 00 00 57 e8 1b aa 06 00", "object loader reads exactly 0x0bf4 header bytes into the selected destination record"],
  [0x00443529, "8b 97 c8 0b 00 00", "object loader reads the source payload length from destination offset 0x0bc8"],
  [0x00443538, "89 87 f4 0b 00 00", "object loader stores the allocated payload pointer at destination offset 0x0bf4"],
  [0x004479a9, "66 83 b8 d0 e9 82 00 00", "HUD panel path requires its selected-record gate word to equal zero"],
  [0x004479b3, "66 83 3d 84 bd bc 00 00", "HUD panel path requires DAT_00bcbd84 to equal zero"],
  [0x004479bd, "66 39 1d 84 27 55 00", "HUD panel path requires DAT_00552784 to equal zero"],
  [0x004479e3, "51 b9 18 94 55 00 e8 c2 31 00 00", "HUD path locks DAT_0054926c through surface state DAT_00559418"],
  [0x004479ee, "3b c3 75 33", "HUD path skips the panel blit when the surface lock result is not exactly one"],
  [0x004479f2, "8b 15 a4 d8 88 00 a1 b8 cc 88 00 8b 0d b4 cc 88 00", "HUD path reads pannel payload, height, and width from the second loader record"],
  [0x00447a03, "52 50 51 6a 00 6a 00 b9 18 94 55 00 e8 5c 62 00 00", "HUD path calls the indexed sprite blitter with payload, height, width, y=0, x=0"],
  [0x00447a14, "8b 15 6c 92 54 00 b9 18 94 55 00 52 e8 7b 33 00 00", "HUD path unlocks the same surface immediately after the panel blit"],
  [0x00447aba, "e8 d1 32 01 00", "HUD root calls the common selection-command renderer after the panel path"],
  [0x0044dc72, "8b 5c 24 10 0f af 59 10", "indexed sprite blitter forms destination row offset from its y argument and locked-surface stride"],
  [0x0044dc86, "8b 7c 24 14 03 dd 33 d2 03 df", "indexed sprite blitter adds its x argument to the destination row base"],
  [0x0044dc90, "85 c0 89 4c 24 0c 7e 62", "indexed sprite blitter rejects a nonpositive height before copying rows"],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

const REFERENCE_SPECS = [
  ["HUD root final panel-blit call", (reference) => reference.fromFunctionEntry === "0x004475a0" && reference.to === "0x0044dc70", 1, "02352b54582b3401dc623d6dcdeec9c363e7f974254c19f654560c1c094ed889"],
  ["HUD root panel fields and target surface", (reference) => reference.fromFunctionEntry === "0x004475a0" && ["0x0054926c", "0x0088ccb4", "0x0088ccb8", "0x0088d8a4"].includes(reference.to), 8, "68fc67c72f2808171a389bb58337e3de4baf074c762a4e813547d781d1e58c90"],
  ["common loader pannel table and second record", (reference) => reference.fromFunctionEntry === "0x00443360" && ["0x004bc094", "0x004bc098", "0x0088c0b8", "0x0088ccb0"].includes(reference.to), 7, "cac5acfd0afcceade32beb2db3a47697dcc31a0c7ad66683e00e31690219015b"],
];

export function extractPannelSprHudBlit({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  panelPath = DEFAULT_PANEL_PATH,
  referencesPath = DEFAULT_REFERENCES_PATH,
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  assertEqual(sha256(buffer), EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);
  const panelBytes = readFileSync(panelPath);
  assertEqual(sha256(panelBytes), EXPECTED_PANEL_SHA256, `${panelPath} SHA-256`);
  const panel = parseSpriteLikeHeader(panelBytes, panelPath);
  assertEqual(panel.width, 640, "pannel.spr width");
  assertEqual(panel.height, 163, "pannel.spr height");
  assertEqual(panel.frameCount, 1, "pannel.spr frame count");
  const referenceBytes = readFileSync(referencesPath);
  assertEqual(sha256(referenceBytes), EXPECTED_REFERENCES_SHA256, `${referencesPath} SHA-256`);
  const references = readJson(referencesPath);
  assertEqual(references.sourceSha256, EXPECTED_EXECUTABLE_SHA256, `${referencesPath} source SHA-256`);

  assertEqual(PANEL_RECORD, 0x0088c0b8 + PANEL_RECORD_STRIDE, "second common-loader record address");
  assertEqual(PANEL_WIDTH_FIELD, 0x0088ccb4, "pannel width field address");
  assertEqual(PANEL_HEIGHT_FIELD, 0x0088ccb8, "pannel height field address");
  assertEqual(PANEL_PAYLOAD_FIELD, 0x0088d8a4, "pannel payload field address");

  return {
    question: "Which common-loader record carries fnt\\pannel.spr to the gameplay HUD, and what final indexed blit, coordinate, target memory, and ordering are source-bound?",
    analysisStatus: "static-confirmed-for-pannel-loader-to-hud-blit",
    reproductionStatus: "reproduction-complete-for-bounded-blit-admission-and-lifecycle",
    implementationStatus: "analysis-only-no-product-change",
    sources: {
      executable: { path: executablePath, sha256: EXPECTED_EXECUTABLE_SHA256 },
      panel: { path: panelPath, sha256: EXPECTED_PANEL_SHA256, width: panel.width, height: panel.height, frameCount: panel.frameCount },
      references: { path: referencesPath, sha256: EXPECTED_REFERENCES_SHA256 },
    },
    loader: {
      function: "FUN_00443360",
      pointerTable: "0x004bc094",
      panelTableEntry: "0x004bc098",
      panelPath: "fnt\\pannel.spr",
      recordBase: "0x0088c0b8",
      recordStride: "0x0bf8",
      panelRecord: "0x0088ccb0",
      widthField: "DWORD[0x0088ccb4]",
      heightField: "DWORD[0x0088ccb8]",
      payloadPointerField: "DWORD[0x0088d8a4]",
      loaderFailure: "FUN_004434a0 reports a load/type/allocation failure as zero; FUN_00443360 records only the first such error and continues through later table entries. This extractor does not infer the later HUD-frame contents after a missing payload pointer.",
    },
    finalBlit: {
      consumer: { function: "FUN_004475a0", callsite: "0x00447a0f", scope: "the gameplay HUD frame root already source-bound by the locked gameplay-selection-command-panel contract" },
      callee: "FUN_0044dc70",
      destination: {
        lockedSurfaceHandle: "DAT_0054926c",
        lockedSurfaceState: "DAT_00559418",
        bytePlane: "DAT_00559418 + 0x1510",
        stride: "DWORD[DAT_00559418 + 0x10]",
        status: "the exact runtime DirectDraw object type and higher-level ownership name are not recovered; the concrete locked byte-plane destination used by FUN_0044dc70 is source-bound",
      },
      rectangle: { x: 0, y: 0, width: panel.width, height: panel.height, right: panel.width, bottom: panel.height, coordinateSystem: "top-left shared 640×480 HUD canvas" },
      payload: "DWORD[0x0088d8a4] loaded by the common loader from the second table entry's SPR payload",
      gates: ["selected-record computed WORD at 0x0082e9d0 + selectedRecord*0x2c10 must equal 0", "DAT_00bcbd84 WORD must equal 0", "DAT_00552784 WORD must equal 0", "FUN_0044abb0(DAT_0054926c) must return exactly 1"],
      ordering: ["HUD root reaches the panel gate", "lock DAT_0054926c into DAT_00559418", "blit pannel payload at (0,0) through FUN_0044dc70", "unlock DAT_0054926c through FUN_0044ada0", "later call FUN_0045ad90 renders the common selection-command grid"],
      failureBoundary: "A nonzero gate word or a lock result other than one skips the final blit. The root joins the later frame path; this slice does not assign a visual result to loader failure or identify the runtime surface's concrete vtable type.",
    },
    rawCodeRanges: RAW_CODE_RANGES.map((range) => verifyRawCodeRange(buffer, image, range)),
    evidencePoints: EVIDENCE.map((point) => verifyEvidencePoint(buffer, image, point)),
    referenceSets: REFERENCE_SPECS.map(([label, predicate, count, digest]) => verifyReferenceSet(references, { label, predicate, count, digest })),
    unresolvedBoundary: "The pannel.spr final blit callsite, exact 640×163 rectangle, target locked byte plane, gate words, unlock, and order before FUN_0045ad90 are closed. The first unresolved edge is the concrete runtime DirectDraw/vtable type and semantic owner of DAT_0054926c/DAT_00559418; this does not block the source-bound destination-memory or draw-order claim.",
  };
}

export function reproducePannelHudBlit(input) {
  assertRecord(input, "input");
  const selectedRecordGate = assertWord(input.selectedRecordGate, "selectedRecordGate");
  const output = { selectedRecordGate, operations: [] };
  if (selectedRecordGate !== 0) return skipped(output, "skip-selected-record-gate");
  const globalGate = assertWord(input.globalGate, "globalGate");
  output.globalGate = globalGate;
  if (globalGate !== 0) return skipped(output, "skip-global-gate");
  const panelGate = assertWord(input.panelGate, "panelGate");
  output.panelGate = panelGate;
  if (panelGate !== 0) return skipped(output, "skip-panel-gate");
  const surfaceLockSucceeded = assertBoolean(input.surfaceLockSucceeded, "surfaceLockSucceeded");
  output.surfaceLockSucceeded = surfaceLockSucceeded;
  output.operations.push({ type: "lock-hud-panel-surface", handle: "DAT_0054926c", state: "DAT_00559418" });
  if (!surfaceLockSucceeded) return skipped(output, "skip-surface-lock-failure");
  output.operations.push({ type: "blit-indexed-sprite", callsite: "0x00447a0f", destination: { x: 0, y: 0, width: 640, height: 163 } });
  output.operations.push({ type: "unlock-hud-panel-surface", handle: "DAT_0054926c", state: "DAT_00559418" });
  output.operations.push({ type: "later-selection-command-renderer", function: "FUN_0045ad90" });
  return output;
}

function skipped(output, reason) {
  output.operations.push({ type: reason });
  output.operations.push({ type: "later-selection-command-renderer", function: "FUN_0045ad90" });
  return output;
}

function verifyReferenceSet(references, spec) {
  if (!Array.isArray(references.references)) throw new TypeError("references.json must contain a references array");
  const rows = references.references
    .filter(spec.predicate)
    .map(({ from, to, type, fromFunctionEntry }) => ({ from, to, type, fromFunctionEntry }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const digest = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  assertEqual(rows.length, spec.count, `${spec.label} count`);
  assertEqual(digest, spec.digest, `${spec.label} digest`);
  return { label: spec.label, count: rows.length, digest, references: rows };
}

function assertRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
}

function assertBoolean(value, label) {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be a boolean`);
  return value;
}

function assertWord(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new RangeError(`${label} must be an unsigned original WORD value (0..65535)`);
  }
  return value;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(extractPannelSprHudBlit(), null, 2));
}
