#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseSpriteLikeHeader } from "./codec.mjs";
import { readPeImage } from "./pe-image.mjs";
import { assertEqual, sha256, verifyEvidencePoint, verifyRawCodeRange } from "./static-evidence.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_SEEDS_PATH = "analysis/generated/imjinrok2/seeds.json";
const DEFAULT_PORTRAIT_PATH = "original/imjinrok2/fnt/portrait.spr";

export const EXPECTED_EXECUTABLE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_SEEDS_SHA256 =
  "8e7c8821e9c84c5d0877bb977b119b3b878271502b36bf75e7426b570507bfb7";
export const EXPECTED_PORTRAIT_SPRITE_SHA256 =
  "1a124007c267f4fa8686475e31dcb57f0ea281513f4c5f213df1ee41df141885";

const TYPE_INITIALIZER_ENTRY = 0x0045bf50;
const TYPE_WRITER_ENTRY = 0x0045bd00;
const TYPE_TABLE_ADDRESS = 0x00882e10;
const TYPE_RECORD_STRIDE = 0x014c;
const TYPE_ARGUMENT_COUNT = 51;
const PORTRAIT_RESOURCE_TABLE_BASE = 0x004bc094;
const PORTRAIT_RESOURCE_TABLE_INDEX = 34;
const PORTRAIT_RESOURCE_PATH_POINTER = 0x004bd714;
const RESOURCE_RUNTIME_BASE = 0x0088c0b8;
const RESOURCE_RUNTIME_STRIDE = 0x0bf8;
const PORTRAIT_RUNTIME_RECORD = RESOURCE_RUNTIME_BASE + PORTRAIT_RESOURCE_TABLE_INDEX * RESOURCE_RUNTIME_STRIDE;
const PORTRAIT_FRAME_OFFSET_TABLE = PORTRAIT_RUNTIME_RECORD + 0x4c0;
const PORTRAIT_SURFACE_POINTER = PORTRAIT_RUNTIME_RECORD + 0xbf4;

const K01_CLASS_KINDS = [
  [2, "swordsman"],
  [3, "japanese-swordsman"],
  [4, "archer"],
  [7, "villager"],
  [11, "korean-monk"],
  [12, "japanese-gunner"],
  [13, "japanese-samurai"],
  [14, "japanese-turtle-tank"],
  [16, "japanese-shrine-maiden"],
  [31, "japanese-farmer"],
  [48, "house"],
  [49, "town-center"],
  [50, "barracks"],
  [51, "korean-training-command"],
  [57, "japanese-camp-house"],
  [58, "japanese-hq"],
  [60, "japanese-camp-barracks"],
  [62, "japanese-camp-firehouse"],
  [63, "japanese-camp-tower"],
  [76, "gwon-yul"],
  [78, "ryu-seong-ryong"],
  [82, "japanese-konishi"],
].map(([internalClass, kind]) => ({ internalClass, kind }));

const RAW_CODE_RANGES = [
  ["common-sprite-loader", 0x00443360, 0x0044343c, "ab3275bd0afcd1e3186ae30b6820773bb48d60aace42c1704f1a8ab5c286a6c3"],
  ["selection-portrait-draw-helper", 0x00420c20, 0x00420ca4, "7648652e74c0ccb9e532e016893791695a4faed5b1efba13f614193fbfb510b3"],
].map(([id, start, endExclusive, digest]) => ({ id, start, endExclusive, sha256: digest }));

const EVIDENCE = [
  [0x0044336b, "ba 94 c0 4b 00", "the common loader begins at the 76-entry resource-path table"],
  [0x00443377, "be b8 c0 88 00", "the common loader begins at the matching runtime-record table"],
  [0x004433e9, "8b 47 04 45 81 c6 f8 0b 00 00 83 c7 04", "each loader iteration advances one path cell and one 0xbf8-byte runtime record"],
  [0x00420c38, "66 8b 34 85 18 2e 88 00", "the selected-entity helper reads WORD[type class record + 0x08]"],
  [0x00420c70, "8b 04 95 68 5c 8a 00", "that frame index addresses the portrait runtime frame-offset table"],
  [0x00420c77, "8b 15 9c 63 8a 00", "the helper reads the portrait runtime surface pointer"],
  [0x00420c99, "b9 18 94 55 00 e8 2d d3 02 00", "the helper sends the selected portrait source to the panel blitter"],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

/**
 * Recovers the exact K01 class-to-frame binding used by the selected-entity
 * portrait helper. This is deliberately separate from body-sprite animation
 * evidence: type field +0x08 selects fnt/portrait.spr, not an entity frame.
 */
export function extractK01SelectionPortraitBindings({
  executablePath = resolve(repositoryRoot, DEFAULT_EXECUTABLE_PATH),
  seedsPath = resolve(repositoryRoot, DEFAULT_SEEDS_PATH),
  portraitPath = resolve(repositoryRoot, DEFAULT_PORTRAIT_PATH),
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  assertEqual(sha256(buffer), EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);

  const seedsBuffer = readFileSync(seedsPath);
  assertEqual(sha256(seedsBuffer), EXPECTED_SEEDS_SHA256, `${seedsPath} SHA-256`);
  const seeds = JSON.parse(seedsBuffer.toString("utf8"));
  assertEqual(seeds.sourceSha256, EXPECTED_EXECUTABLE_SHA256, `${seedsPath} source SHA-256`);

  const portraitBytes = readFileSync(portraitPath);
  assertEqual(sha256(portraitBytes), EXPECTED_PORTRAIT_SPRITE_SHA256, `${portraitPath} SHA-256`);
  const portraitHeader = parseSpriteLikeHeader(portraitBytes, portraitPath);
  assertEqual(portraitHeader.width, 68, "portrait.spr width");
  assertEqual(portraitHeader.height, 68, "portrait.spr height");
  assertEqual(portraitHeader.frameCount, 150, "portrait.spr frame count");

  const resourcePathPointerOffset = image.vaToRawOffset(PORTRAIT_RESOURCE_TABLE_BASE + PORTRAIT_RESOURCE_TABLE_INDEX * 4);
  if (resourcePathPointerOffset === undefined) throw new Error("portrait resource table cell is not PE-backed");
  assertEqual(buffer.readUInt32LE(resourcePathPointerOffset), PORTRAIT_RESOURCE_PATH_POINTER, "portrait resource table path pointer");
  const resourcePathOffset = image.vaToRawOffset(PORTRAIT_RESOURCE_PATH_POINTER);
  if (resourcePathOffset === undefined) throw new Error("portrait resource path is not PE-backed");
  assertEqual(readCString(buffer, resourcePathOffset), "fnt\\portrait.spr", "portrait resource path");

  const typeCalls = extractTypeCalls(seeds);
  const bindings = K01_CLASS_KINDS.map(({ internalClass, kind }) => {
    const typeCall = typeCalls.get(internalClass);
    if (!typeCall) throw new Error(`type initializer is missing K01 class ${internalClass}`);
    const frameIndex = typeCall.arguments[2];
    if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= portraitHeader.frameCount) {
      throw new Error(`class ${internalClass} portrait frame ${frameIndex} is outside 0..${portraitHeader.frameCount - 1}`);
    }
    return {
      internalClass,
      kind,
      typeRecordAddress: toHex(TYPE_TABLE_ADDRESS + internalClass * TYPE_RECORD_STRIDE),
      typeField: "+0x08",
      frameIndex,
      fileName: `portrait_${String(frameIndex).padStart(4, "0")}.png`,
    };
  });

  return {
    schemaVersion: 1,
    question: "Which fnt/portrait.spr frame does the original selected-entity helper bind for every K01-spawnable class?",
    evidenceStatus: "static-proven",
    reproductionStatus: "reproduction-complete",
    implementationStatus: "source-backed-selection-portrait-binding",
    sources: {
      executable: { path: executablePath, sha256: EXPECTED_EXECUTABLE_SHA256 },
      seeds: { path: seedsPath, sha256: EXPECTED_SEEDS_SHA256 },
      portraitSprite: { path: portraitPath, sha256: EXPECTED_PORTRAIT_SPRITE_SHA256, width: portraitHeader.width, height: portraitHeader.height, frameCount: portraitHeader.frameCount },
    },
    resourceBinding: {
      sourcePath: "fnt\\portrait.spr",
      resourcePathPointer: toHex(PORTRAIT_RESOURCE_PATH_POINTER),
      resourceTable: { base: toHex(PORTRAIT_RESOURCE_TABLE_BASE), index: PORTRAIT_RESOURCE_TABLE_INDEX },
      runtimeRecord: toHex(PORTRAIT_RUNTIME_RECORD),
      frameOffsetTable: toHex(PORTRAIT_FRAME_OFFSET_TABLE),
      surfacePointer: toHex(PORTRAIT_SURFACE_POINTER),
    },
    renderer: {
      selectedRenderer: "0x00421390",
      portraitHelper: "0x00420c20",
      typeFrameRead: "WORD[typeRecord + 0x08]",
      destination: "the helper passes the recovered portrait source to FUN_0044dfd0",
    },
    bindings,
    testVectors: bindings.map(({ internalClass, kind, frameIndex, fileName }) => ({ internalClass, kind, expectedFrameIndex: frameIndex, expectedFileName: fileName })),
    rawCodeRanges: RAW_CODE_RANGES.map((range) => verifyRawCodeRange(buffer, image, range)),
    evidencePoints: EVIDENCE.map((point) => verifyEvidencePoint(buffer, image, point)),
    unresolvedScope: "Panel geometry, scaling, lock/surface failure behavior, and the later selected-renderer helpers are outside this class-to-portrait-frame binding.",
  };
}

function extractTypeCalls(seeds) {
  const initializer = seeds.functions.find((candidate) => Number(candidate.entry) === TYPE_INITIALIZER_ENTRY);
  if (!initializer) throw new Error(`seed analysis is missing type initializer ${toHex(TYPE_INITIALIZER_ENTRY)}`);
  const calls = new Map();
  const registers = new Map();
  let recordAddress;
  let pushed = [];

  for (const instruction of initializer.instructions) {
    const move = /^MOV (E[A-Z]{2}),(-?0x[0-9a-f]+)$/.exec(instruction.text);
    if (move) {
      const value = parseImmediate(move[2]);
      registers.set(move[1], value);
      if (move[1] === "ECX") recordAddress = value;
    }
    const push = /^PUSH (.+)$/.exec(instruction.text);
    if (push) pushed.push({ address: Number(instruction.address), value: resolvePush(push[1], registers) });
    if (instruction.text !== `CALL ${toHex(TYPE_WRITER_ENTRY)}`) continue;

    if (pushed.length === TYPE_ARGUMENT_COUNT + 1 && pushed[0].address === TYPE_INITIALIZER_ENTRY) pushed = pushed.slice(1);
    if (pushed.length !== TYPE_ARGUMENT_COUNT || recordAddress === undefined) {
      throw new Error(`type writer call at ${instruction.address} does not recover exactly ${TYPE_ARGUMENT_COUNT} arguments`);
    }
    const internalClass = (recordAddress - TYPE_TABLE_ADDRESS) / TYPE_RECORD_STRIDE;
    if (!Number.isInteger(internalClass)) throw new Error(`type writer record ${toHex(recordAddress)} is not class-aligned`);
    const argumentsByIndex = Array.from(
      { length: TYPE_ARGUMENT_COUNT },
      (_value, argumentIndex) => pushed[TYPE_ARGUMENT_COUNT - 1 - argumentIndex]?.value,
    );
    if (argumentsByIndex.some((value) => value === undefined)) throw new Error(`class ${internalClass} has an unresolved type writer argument`);
    calls.set(internalClass, { arguments: argumentsByIndex });
    pushed = [];
    recordAddress = undefined;
  }
  return calls;
}

function resolvePush(operand, registers) {
  return /^-?0x[0-9a-f]+$/.test(operand) ? parseImmediate(operand) : registers.get(operand);
}

function parseImmediate(value) {
  const negative = value.startsWith("-");
  const parsed = Number.parseInt(negative ? value.slice(3) : value.slice(2), 16);
  return negative ? -parsed : parsed;
}

function readCString(buffer, offset) {
  const end = buffer.indexOf(0, offset);
  if (end < 0) throw new Error("unterminated portrait resource path");
  return buffer.subarray(offset, end).toString("ascii");
}

function toHex(value) {
  return `0x${value.toString(16).padStart(8, "0")}`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(extractK01SelectionPortraitBindings(), null, 2));
}
