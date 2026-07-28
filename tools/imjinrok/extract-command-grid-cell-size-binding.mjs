#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseSpriteLikeHeader } from "./codec.mjs";
import { readPeImage, readCString, toHex } from "./pe-image.mjs";
import {
  assertEqual,
  readJson,
  readVaRange,
  sha256,
  verifyEvidencePoint,
  verifyRawCodeRange,
} from "./static-evidence.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_BUTTON_PATH = "original/imjinrok2/fnt/button.spr";
const DEFAULT_REFERENCES_PATH = "analysis/generated/imjinrok2/references.json";

export const EXPECTED_EXECUTABLE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_BUTTON_SHA256 =
  "cfe7bab02f2cb8a1f97a3161075e617ace22d6ecf5a976546263a7c67e4efbb4";
export const EXPECTED_REFERENCES_SHA256 =
  "df11ff3713988ef22b3390b5b0ae7b4a87464b5de547a4866e1c8ec8a0bcaf4c";

const POINTER_TABLE = 0x004bc094;
const RECORD_BASE = 0x0088c0b8;
const RECORD_STRIDE = 0x0bf8;
const BUTTON_INDEX = 18;
const TABLE_SENTINEL_INDEX = 226;
const BUTTON_TABLE_ENTRY = POINTER_TABLE + BUTTON_INDEX * 4;
const BUTTON_RECORD = RECORD_BASE + BUTTON_INDEX * RECORD_STRIDE;
const WIDTH_FIELD = BUTTON_RECORD + 4;
const HEIGHT_FIELD = BUTTON_RECORD + 8;
const EMPTY_STRING = 0x004cab44;

const RAW_CODE_RANGES = [
  ["common-spr-loader", 0x00443360, 0x0044343d, "80805e69437098006c8e2efce33121e9b98a1cf279f9baa19e7c4f9e2255694f"],
  ["common-spr-object-loader", 0x004434a0, 0x0044357f, "ab4c32302ba6ba9c56fad040df9689aad63a8e03eb33cdeab7b5972368170cf0"],
  ["bootstrap-and-dispatcher", 0x0045f9c0, 0x004607ad, "7081ada042adc4fa3a7d7b838f717c52bbd63fae2c45be566b0351cfd12dc022"],
  ["grid-layout-initializer-call-wrapper", 0x00445770, 0x004457c5, "f2a8d3a8e0ca3daedac42775a954e5eb372ef27e498f16e04abc84604997ee85"],
  ["grid-layout-initializer", 0x00481ee0, 0x00481fcf, "e354e42cf17dd8ed5316d764d265f973666897f46e48571ae0b1349e589a6946"],
].map(([id, start, endExclusive, digest]) => ({ id, start, endExclusive, sha256: digest }));

const EVIDENCE = [
  [0x0044336b, "ba 94 c0 4b 00", "common loader initializes its path cursor to the common table"],
  [0x00443377, "be b8 c0 88 00", "common loader initializes its destination cursor to record zero"],
  [0x00443398, "56 52 e8 01 01 00 00", "common loader passes the current destination record to the object loader"],
  [0x004433a2, "85 c0 75 43", "a failed object load records an error only on the first failure"],
  [0x004433ed, "81 c6 f8 0b 00 00", "common loader advances one destination record by 0x0bf8"],
  [0x004433f3, "83 c7 04", "common loader advances one table entry"],
  [0x0044342a, "85 c0 0f 85 4c ff ff ff", "common loader continues until the next path equals the empty-string sentinel"],
  [0x004434ec, "83 f8 09 74 1c", "object loader requires sprite type DWORD 9 before copying"],
  [0x0044351e, "68 f4 0b 00 00 57 e8 1b aa 06 00", "object loader copies exactly 0x0bf4 bytes into the current record"],
  [0x00443538, "89 87 f4 0b 00 00", "object loader stores payload only after its header copy"],
  [0x0045fc17, "e8 44 37 fe ff", "bootstrap calls the common loader before entering its dispatcher loop"],
  [0x0045fe89, "e8 e2 58 fe ff", "a later bootstrap dispatcher arm calls the grid-layout wrapper"],
  [0x004457bb, "b9 60 bd 88 00 e9 1b c7 03 00", "wrapper passes layout object 0x0088bd60 to the grid initializer"],
  [0x00481eeb, "66 a1 2c 98 89 00 66 89 41 04", "initializer reads the low WORD at record +4 into its first cell-size field"],
  [0x00481ef5, "66 8b 15 30 98 89 00 b8 02 00 00 00 66 89 51 06", "initializer reads the low WORD at record +8 into its second cell-size field"],
  [0x00481f31, "66 8b 15 2c 98 89 00 66 89 51 14", "initializer copies the same low width WORD into its later layout field"],
  [0x00481f3c, "66 8b 15 30 98 89 00", "initializer reloads the same low height WORD for its later layout field"],
  [0x00481f61, "66 89 51 16", "initializer stores the retained low height WORD into its later layout field"],
  [0x004bc0dc, "30 d8 4b 00", "table entry 18 points to the embedded button path"],
  [0x004bd830, "66 6e 74 5c 62 75 74 74 6f 6e 2e 73 70 72 00", "embedded table path is fnt\\button.spr"],
  [0x004bc41c, "44 ab 4c 00", "table entry 226 points to the empty-string sentinel"],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

const REFERENCE_SPECS = [
  ["bootstrap loader then layout-wrapper direct calls", (entry) => entry.fromFunctionEntry === "0x0045f9c0" && ["0x00443360", "0x00445770"].includes(entry.to), 4, "2115f236094122bb9c1d4b7cf1734defeedf679b1f7e2b2d61a1e9fe8b36422a"],
  ["common loader direct calls", (entry) => entry.fromFunctionEntry === "0x00443360" && ["0x00442dd0", "0x004434a0", "0x0044b040"].includes(entry.to), 3, "36d7c01f294a4b56aa1a745d221260915af287e2491c5c556a8055d4ab6ff734"],
  ["layout wrapper initializer call", (entry) => entry.fromFunctionEntry === "0x00445770" && entry.to === "0x00481ee0", 1, "97d2a2d7cfd61d57911a40f9329e1271ff09d728806781e485e09c813fa142cf"],
  ["complete structured direct references to the two cell fields", (entry) => ["0x0089982c", "0x00899830"].includes(entry.to), 9, "a336d27b34d7b73cfcfc1375e86e8cb0225d054eea9662ebe8fc89e220aef901"],
];

export function extractCommandGridCellSizeBinding({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  buttonPath = DEFAULT_BUTTON_PATH,
  referencesPath = DEFAULT_REFERENCES_PATH,
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  assertEqual(sha256(buffer), EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);
  const buttonBytes = readFileSync(buttonPath);
  assertEqual(sha256(buttonBytes), EXPECTED_BUTTON_SHA256, `${buttonPath} SHA-256`);
  const button = parseSpriteLikeHeader(buttonBytes, buttonPath);
  assertEqual(button.width, 34, "button.spr header DWORD width");
  assertEqual(button.height, 34, "button.spr header DWORD height");
  assertEqual(button.frameCount, 289, "button.spr header DWORD frame count");
  const referenceBytes = readFileSync(referencesPath);
  assertEqual(sha256(referenceBytes), EXPECTED_REFERENCES_SHA256, `${referencesPath} SHA-256`);
  const references = readJson(referencesPath);
  assertEqual(references.sourceSha256, EXPECTED_EXECUTABLE_SHA256, `${referencesPath} source SHA-256`);

  const table = readCommonTable(buffer, image);
  assertEqual(table.length, TABLE_SENTINEL_INDEX, "common table loaded-entry count");
  assertEqual(table[BUTTON_INDEX].entry, BUTTON_TABLE_ENTRY, "button table-entry address");
  assertEqual(table[BUTTON_INDEX].path, "fnt\\button.spr", "button table-entry path");
  assertEqual(BUTTON_RECORD, 0x00899828, "button runtime record address");
  assertEqual(WIDTH_FIELD, 0x0089982c, "button runtime width field address");
  assertEqual(HEIGHT_FIELD, 0x00899830, "button runtime height field address");

  const directCellReferences = referenceRows(references, REFERENCE_SPECS[3][1]);
  if (directCellReferences.some((entry) => entry.type !== "READ")) {
    throw new Error("complete structured direct cell-field reference set contains a writer");
  }

  return {
    question: "Which source record produces DAT_0089982c/DAT_00899830 for the command-grid initializer, and are both low WORD values exactly 34?",
    analysisStatus: "static-confirmed-for-common-loader-to-command-grid-cell-size",
    reproductionStatus: "reproduction-complete-for-bounded-loader-reachability-and-cell-size-transfer",
    implementationStatus: "analysis-only-no-product-change",
    sources: {
      executable: { path: executablePath, sha256: EXPECTED_EXECUTABLE_SHA256 },
      button: { path: buttonPath, sha256: EXPECTED_BUTTON_SHA256, headerDwords: { magic: 9, width: button.width, height: button.height, frameCount: button.frameCount } },
      references: { path: referencesPath, sha256: EXPECTED_REFERENCES_SHA256 },
    },
    loader: {
      function: "FUN_00443360",
      pointerTable: toHex(POINTER_TABLE),
      loadedEntryCount: table.length,
      sentinel: { index: TABLE_SENTINEL_INDEX, entry: toHex(POINTER_TABLE + TABLE_SENTINEL_INDEX * 4), pointer: toHex(EMPTY_STRING), path: "" },
      button: { index: BUTTON_INDEX, tableEntry: toHex(BUTTON_TABLE_ENTRY), embeddedPathAddress: toHex(table[BUTTON_INDEX].pointer), embeddedPath: table[BUTTON_INDEX].path },
      recordBase: toHex(RECORD_BASE),
      recordStride: "0x0bf8",
      buttonRecord: toHex(BUTTON_RECORD),
      copy: "FUN_004434a0 validates type DWORD 9 then copies 0x0bf4 source bytes to the selected record base; source header DWORD +4/+8 therefore occupy record DWORD +4/+8 before payload allocation.",
      failure: "A missing/open/type/allocation failure returns zero for that record. FUN_00443360 preserves the first error report but still advances to later entries; it does not establish valid button fields after the button record itself fails.",
    },
    fields: {
      source: { width: "DWORD[button.spr+0x04]", height: "DWORD[button.spr+0x08]", values: { width: button.width, height: button.height } },
      runtimeRecord: { width: `DWORD[${toHex(WIDTH_FIELD)}]`, height: `DWORD[${toHex(HEIGHT_FIELD)}]`, aliasWords: { width: "DAT_0089982c", height: "DAT_00899830" } },
      gridInitializer: { function: "FUN_00481ee0", reads: ["signed WORD[DAT_0089982c] -> layout +0x04", "signed WORD[DAT_00899830] -> layout +0x06", "signed WORD[DAT_0089982c] -> layout +0x14", "signed WORD[DAT_00899830] -> layout +0x16"], values: { cellWidth: 34, cellHeight: 34 } },
      widthRule: "The SPR header and copied runtime fields are DWORDs. The command-grid initializer deliberately consumes their low signed WORDs; both source DWORD values are 34, so their low WORDs are exactly 34 without truncation ambiguity.",
    },
    callOrder: "Within FUN_0045f9c0, 0x0045fc17 calls FUN_00443360 before the dispatcher loop. Later dispatcher arms call FUN_00445770, which tail-jumps to FUN_00481ee0 with ECX=0x0088bd60. The initializer does not check a common-loader result, so only a successful button-record load proves the numeric initialization value.",
    writerScope: "The complete structured direct-reference set for DAT_0089982c/DAT_00899830 has nine READ references and no direct WRITE reference. The initialization-time writer is the common loader's indexed record-base copy. This does not exclude a future unlocated computed-pointer alias writer after initialization.",
    rawCodeRanges: RAW_CODE_RANGES.map((range) => verifyRawCodeRange(buffer, image, range)),
    evidencePoints: EVIDENCE.map((point) => verifyEvidencePoint(buffer, image, point)),
    referenceSets: REFERENCE_SPECS.map(([label, predicate, count, digest]) => verifyReferenceSet(references, { label, predicate, count, digest })),
    unresolvedBoundary: "The source-bound initialization contract is closed: successful common loading of entry 18 makes the grid initializer consume 34x34 low WORDs from fnt\\button.spr. The first remaining boundary is post-initialization mutation through a computed alias: no such writer appears in the complete structured direct-reference set, but this bounded analysis does not prove global absence of every possible indirect alias writer.",
  };
}

export function reproduceCommandGridCellSizeBinding(input) {
  assertRecord(input, "input");
  const tableEntryCount = assertInteger(input.tableEntryCount, 0, 0xffff, "tableEntryCount");
  const output = { targetIndex: BUTTON_INDEX, tableEntryCount, operations: [] };
  if (tableEntryCount <= BUTTON_INDEX) {
    output.operations.push({ type: "button-record-unreached-before-table-boundary" });
    return output;
  }
  output.operations.push({ type: "reach-button-table-entry", record: toHex(BUTTON_RECORD) });
  const buttonLoadSucceeded = assertBoolean(input.buttonLoadSucceeded, "buttonLoadSucceeded");
  if (!buttonLoadSucceeded) {
    output.operations.push({ type: "button-loader-failure-continues-common-table", runtimeCellSize: "indeterminate" });
    return output;
  }
  const header = assertRecord(input.header, "header");
  const magic = assertU32(header.magic, "header.magic");
  if (magic !== 9) throw new RangeError("header.magic must be the original sprite DWORD value 9");
  const width = assertU32(header.width, "header.width");
  const height = assertU32(header.height, "header.height");
  output.runtimeRecord = { widthDword: width, heightDword: height, widthWord: width & 0xffff, heightWord: height & 0xffff };
  output.operations.push({ type: "copy-header-dwords-to-button-record", byteCount: 0x0bf4 });
  const layoutInitializerReached = assertBoolean(input.layoutInitializerReached, "layoutInitializerReached");
  if (!layoutInitializerReached) {
    output.operations.push({ type: "grid-layout-initializer-not-reached" });
    return output;
  }
  output.gridCellSize = { width: width & 0xffff, height: height & 0xffff };
  output.operations.push({ type: "copy-low-words-to-grid-layout", function: "FUN_00481ee0" });
  return output;
}

function readCommonTable(buffer, image) {
  const entries = [];
  for (let index = 0; index <= TABLE_SENTINEL_INDEX; index += 1) {
    const entry = POINTER_TABLE + index * 4;
    const pointer = readVaRange(buffer, image, entry, entry + 4).readUInt32LE(0);
    const pathOffset = image.vaToRawOffset(pointer);
    if (pathOffset === undefined) throw new RangeError(`common table entry ${index} points outside PE sections`);
    const path = readCString(buffer, pathOffset);
    if (pointer === EMPTY_STRING) {
      assertEqual(index, TABLE_SENTINEL_INDEX, "common table sentinel index");
      assertEqual(path, "", "common table sentinel path");
      return entries;
    }
    if (path.length === 0) throw new Error(`common table entry ${index} has an early empty path`);
    entries.push({ index, entry, pointer, path });
  }
  throw new Error("common table sentinel was not reached within the source-bound count");
}

function verifyReferenceSet(references, spec) {
  const rows = referenceRows(references, spec.predicate);
  const digest = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  assertEqual(rows.length, spec.count, `${spec.label} count`);
  assertEqual(digest, spec.digest, `${spec.label} digest`);
  return { label: spec.label, count: rows.length, digest, references: rows };
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
  if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(`${label} must be an integer in ${min}..${max}`);
  return value;
}

function assertU32(value, label) {
  return assertInteger(value, 0, 0xffff_ffff, label);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(extractCommandGridCellSizeBinding(), null, 2));
}
