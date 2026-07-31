#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { EXPECTED_EXECUTABLE_SHA256 } from "./extract-entity-type-catalog.mjs";
import { readPeImage, toHex } from "./pe-image.mjs";
import { assertEqual, readJson, verifyEvidencePoint, verifyRawCodeRange, verifySeededFunction } from "./static-evidence.mjs";

const DEFAULTS = {
  executablePath: "original/imjinrok2/imjinrok2.exe",
  seedsPath: "analysis/generated/imjinrok2/seeds.json",
};

const SEEDED_FUNCTIONS = [
  ["0x00425af0", "0x00425af0-0x00425b10", 3, 11, "5ec1bbb74753259755c7fdee3d200102467db3b97c740a05321b796ec969ba2b"],
  ["0x00425b20", "0x00425b20-0x004262df", 98, 506, "a93987a8afa19da86d5c0fa478b0d902c2898970fda86a64229d2bca45e75d0f"],
  ["0x00437650", "0x00437650-0x00438025", 39, 539, "16282bd634d28738d1f1e5eba179069f154537c1c86ce7fbcf57aa1f54bd5fd6"],
  ["0x00483c50", "0x00483c50-0x00483c9f", 1, 26, "e268694e2d2c2fc57c5b0e9a547004b77a6ccb1c700f9b30f5f3329d6e602ac9"],
].map(([entry, bodyRange, blockCount, instructionCount, bodySha256]) => ({ entry, bodyRange, blockCount, instructionCount, bodySha256 }));

const RAW_CODE_RANGES = [
  ["initializer-computed-zero-fill", 0x00437653, 0x00437668, "69173688b1c4dbae086437af5248f4ddc38d7596865c6467f8267c0421345c21"],
  ["initializer-direct-field-writes", 0x00437b0b, 0x00437e1b, "a7997f9570ba253a16abbbcb9c20abc4aed34a19907d90e85cddfab28098230b"],
  ["normal-selector-input-transform-and-clamp-zero", 0x00425ea6, 0x00425f30, "6f0db63f833dfdea48c90158801589f3cd8befe3ec42cb69f915246bba0957d4"],
  ["normal-accumulator-update", 0x00425f03, 0x00425f5c, "8afb18ee5c0e7a2c3b0bee1c8a9509d63a8d0aee79bd6cde35895255d210f8b6"],
  ["accumulator-threshold-coordinate-commit", 0x00425f5c, 0x00425fad, "ef9554bbbdd22a1f95769d10f0002dde38e39d12f387bb574fda8d97137bc2bb"],
].map(([id, start, endExclusive, sha256]) => ({ id, start, endExclusive, sha256 }));

const EVIDENCE_POINTS = [
  [0x00437653, "8b f1 57 b9 56 01 00 00 33 c0 8b fe 33 db ba 64 00 00 00 f3 ab", "initializer takes entity pointer in ECX, derives EDI, and REP STOSD zero-fills 0x156 DWORDs"],
  [0x00437b12, "66 89 9e f2 04 00 00", "initializer directly clears WORD +0x4f2 after the broad fill"],
  [0x00437b20, "66 89 9e ee 04 00 00", "initializer directly clears WORD +0x4ee after the broad fill"],
  [0x00437dde, "66 89 8e ea 04 00 00", "initializer copies type WORD +0x50 to entity WORD +0x4ea"],
  [0x00437e14, "66 89 96 ee 04 00 00", "initializer copies type WORD +0x3c to entity WORD +0x4ee"],
  [0x00483c82, "0f bf c0 8d 0c c0 8d 04 48 8d 14 c0 8d 0c d5 58 52 63 00 e8 b6 39 fb ff", "dispatcher computes ECX entity-slot address before calling the initializer"],
  [0x00425af7, "a8 08 8b 44 24 08 50 52 74 08 e8 da 07 00 00", "wrapper routes flag bit 0x08 set to alternate movement"],
  [0x00425b09, "e8 12 00 00 00", "wrapper routes flag bit 0x08 clear to normal movement"],
  [0x00425ea6, "33 db", "normal movement zeroes EBX before the accumulator clamp compares AX against BX"],
  [0x00425f09, "66 8b 8e ee 04 00 00", "normal movement reads WORD +0x4ee"],
  [0x00425f10, "3c 01 74 09 eb 1a", "selector BYTE +0xba equal to one takes the raw-input transform branch"],
  [0x00425f1d, "0f bf d1 b8 56 55 55 55 f7 ea 8b c2 c1 e8 1f 03 d0 2b ca", "transform computes raw input minus signed truncation-toward-zero raw input divided by three"],
  [0x00425f41, "66 89 86 f2 04 00 00", "normal movement stores signed-WORD accumulator sum"],
  [0x00425f4a, "66 89 9e f2 04 00 00", "normal movement clamps a negative accumulator that crosses above zero"],
  [0x00425f63, "66 3d 32 00 0f 8c 9e 00 00 00", "normal movement only enters coordinate-commit branch when signed WORD +0x4f2 is at least 50"],
  [0x00425f7b, "66 89 8e cc 01 00 00", "commit copies old current X to WORD +0x1cc"],
  [0x00425f89, "66 89 8e d0 01 00 00", "commit copies next X to WORD +0x1d0"],
  [0x00425f90, "66 89 8e bc 01 00 00", "commit writes next X into current WORD +0x1bc"],
  [0x00425f9e, "66 89 96 ce 01 00 00", "commit copies old current Y to WORD +0x1ce"],
  [0x00425fa5, "66 89 86 f2 04 00 00", "commit subtracts 100 from WORD +0x4f2"],
  [0x00425fb3, "66 89 86 be 01 00 00", "commit writes next Y into current WORD +0x1be"],
  [0x00425fc7, "66 89 86 d2 01 00 00", "commit copies next Y to WORD +0x1d2"],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

const DIRECT_WORD_STORES = {
  "0x4ea": ["0x00437dde"],
  "0x4ee": ["0x00437b20", "0x00437e14"],
  "0x4f2": ["0x00425f41", "0x00425f4a", "0x00425f55", "0x00425fa5", "0x00426401", "0x00437b12"],
};

export function extractK01Class2LocomotionBridge(options = {}) {
  const paths = { ...DEFAULTS, ...options };
  const { buffer, image } = readPeImage(paths.executablePath);
  const executableSha256 = sha256(buffer);
  assertEqual(executableSha256, EXPECTED_EXECUTABLE_SHA256, "original EXE SHA-256");
  const seeds = readJson(paths.seedsPath);
  assertEqual(seeds.sourceSha256, executableSha256, "seed analysis source SHA-256");

  const functionEvidence = SEEDED_FUNCTIONS.map((expected) => verifySeededFunction(buffer, image, seeds, expected));
  const rawCodeRanges = RAW_CODE_RANGES.map((range) => verifyRawCodeRange(buffer, image, range));
  const evidencePoints = EVIDENCE_POINTS.map((point) => verifyEvidencePoint(buffer, image, point));
  const directWordStores = scanDirectWordStores(buffer, image);
  for (const [field, expected] of Object.entries(DIRECT_WORD_STORES)) assertEqual(JSON.stringify(directWordStores[field]), JSON.stringify(expected), `direct WORD-store scan ${field}`);

  return {
    schemaVersion: 1,
    question: "In the bounded class-2 normal-movement lifecycle, which direct and initializer-computed writes reach entity WORD +0x4ee/+0x4ea, and when does +0x4f2 commit the recovered next coordinate pair?",
    analysisStatus: "static-confirmed-for-bounded-field-lifecycle",
    reproductionStatus: "reproduction-complete-for-accumulator-coordinate-commit-vectors",
    implementationStatus: "analysis-only",
    sources: { executable: { path: paths.executablePath, sha256: executableSha256 }, seeds: { path: paths.seedsPath, sourceSha256: seeds.sourceSha256 } },
    fieldWriters: {
      computedInitializer: { entry: "0x00437650", pointerSource: "ECX", operation: "REP STOSD zero-fills [entity, entity + 0x558)", covers: ["+0x4ea", "+0x4ee", "+0x4f2"] },
      directWordStores,
      finalInitializerValues: { "+0x4ea": "type WORD +0x50", "+0x4ee": "type WORD +0x3c", "+0x4f2": 0 },
      directScanScope: "All .text raw occurrences of the x86 operand-size-prefixed MOV [base+disp32],r16 store encoding (non-SIB base form) with displacement +0x4ea, +0x4ee, or +0x4f2.",
    },
    reachability: {
      initialization: "0x00483c50 computes an entity-slot address into ECX and unconditionally calls 0x00437650; the initializer performs the broad computed fill before the listed direct field stores.",
      movement: "0x00425af0 preserves ECX and dispatches flag BYTE +0x74 bit 0x08 clear to 0x00425b20 normal movement; set dispatches to the separate 0x004262e0 alternate path.",
      boundary: "The recovered call edges establish the bounded initializer and movement entries, but do not prove a whole-session scheduler order or that a particular initialized slot later reaches this wrapper.",
    },
    accumulatorCoordinateCommit: {
      accumulator: "+0x4f2",
      input: "+0x4ee",
      inputTransform: "At 0x00425f03, selector BYTE +0xba equal to 1 makes the 0x00425f1d sequence use signed raw - trunc(raw / 3); other selector values retain raw input on this branch. Earlier direct entries to 0x00425f16 are outside this selector-only replay input.",
      threshold: "After signed-WORD accumulation (with EBX explicitly zeroed at 0x00425ea6 and the recovered negative-to-positive clamp), signed +0x4f2 >= 50 enters the commit branch.",
      commit: "The branch snapshots current +0x1bc/+0x1be into +0x1cc/+0x1ce, copies next +0x4d8/+0x4da into +0x1d0/+0x1d2, writes that next pair to current +0x1bc/+0x1be, then stores accumulator minus 100 to +0x4f2.",
      replayScope: "Supplied raw unsigned-WORD input, selector byte, accumulator, and recovered current/next field pairs only; it does not identify coordinate units, interpolation helper semantics, cell occupancy policy, or scheduler frequency.",
    },
    evidence: { functionEvidence, rawCodeRanges, evidencePoints },
    unresolvedScope: "This closes the listed direct MOV-store form and the initializer REP-STOSD computed fill inside the bounded lifecycle. It does not prove global absence of arbitrary pointer aliases or other computed write constructions, source unit meaning for +0x4ee/+0x4ea, source scheduler cadence, or a product movement/FPS conversion.",
  };
}

export function replayK01Class2AccumulatorCoordinateCommit({ accumulatorWord, rawInputWord, selectorByte, currentXWord, currentYWord, nextXWord, nextYWord }) {
  for (const [label, value] of Object.entries({ accumulatorWord, rawInputWord, currentXWord, currentYWord, nextXWord, nextYWord })) requireWord(value, label);
  if (!Number.isInteger(selectorByte) || selectorByte < 0 || selectorByte > 0xff) throw new RangeError("selectorByte must be an unsigned BYTE");
  const oldAccumulator = signedWord(accumulatorWord);
  const rawInput = signedWord(rawInputWord);
  const delta = selectorByte === 1 ? rawInput - Math.trunc(rawInput / 3) : rawInput;
  let accumulator = signedWord((oldAccumulator + delta) & 0xffff);
  if (oldAccumulator < 0 && accumulator > 0) accumulator = 0;
  const result = { selectorByte, rawInputWord, appliedDeltaWord: unsignedWord(delta), accumulatorWord: unsignedWord(accumulator), committed: accumulator >= 50, currentXWord, currentYWord, snapshotXWord: null, snapshotYWord: null, interpolationNextXWord: null, interpolationNextYWord: null };
  if (!result.committed) return result;
  result.snapshotXWord = currentXWord;
  result.snapshotYWord = currentYWord;
  result.interpolationNextXWord = nextXWord;
  result.interpolationNextYWord = nextYWord;
  result.currentXWord = nextXWord;
  result.currentYWord = nextYWord;
  result.accumulatorWord = unsignedWord(accumulator - 100);
  return result;
}

function scanDirectWordStores(buffer, image) {
  const text = image.sections.find(({ name }) => name === ".text");
  if (!text) throw new Error("PE image does not contain .text");
  const result = Object.fromEntries(Object.keys(DIRECT_WORD_STORES).map((field) => [field, []]));
  for (let offset = text.rawPointer; offset + 7 <= text.rawPointer + text.rawSize; offset += 1) {
    const modrm = buffer[offset + 2];
    if (buffer[offset] !== 0x66 || buffer[offset + 1] !== 0x89 || (modrm & 0xc0) !== 0x80 || (modrm & 0x07) === 0x04) continue;
    const displacement = buffer.readUInt32LE(offset + 3);
    const field = `0x${displacement.toString(16)}`;
    if (!(field in result)) continue;
    result[field].push(toHex(image.rawOffsetToVa(offset)));
  }
  return result;
}

function requireWord(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new RangeError(`${label} must be an unsigned WORD`);
}

function signedWord(value) { return value >= 0x8000 ? value - 0x10000 : value; }
function unsignedWord(value) { return value & 0xffff; }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = extractK01Class2LocomotionBridge();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
