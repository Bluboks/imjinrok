#!/usr/bin/env node
import { readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readPeImage, readCString, toHex } from "./pe-image.mjs";
import { assertEqual, readVaRange, sha256, verifyEvidencePoint, verifyRawCodeRange } from "./static-evidence.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_EXECUTABLE_PATH = resolve(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const DEFAULT_TILE_DIRECTORY = resolve(repositoryRoot, "original/imjinrok2/tile/normal");

export const EXPECTED_EXECUTABLE_SHA256 = "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";

const LOADER_FUNCTION = 0x00443160;
const POINTER_TABLE = 0x004bc420;
const TABLE_SENTINEL = 0x004cab44;
const LOADED_ENTRY_COUNT = 76;
const RECORD_BASE = 0x00bcdff8;
const RECORD_STRIDE = 0x0bf8;
const CLEANUP_FUNCTION = 0x00443320;
const CLEANUP_COUNT = 0x4c;
const CLEANUP_ACTIVE_POINTER_BASE = RECORD_BASE + 0x0bf4;
const TILESET_PREFIXES = ["tile\\normal\\", "tile\\snow\\", "tile\\brown\\"];
const EXPECTED_DISK_ONLY_FILES = ["diff13l.ytl", "hill0.ypr"];
const TILE_EXTENSIONS = new Set([".spr", ".ytl", ".ypr"]);

const EXPECTED_FILENAMES = [
  ...Array.from({ length: 16 }, (_value, index) => `hill${index}.ytl`),
  ...Array.from({ length: 15 }, (_value, index) => `diff${index + 1}.ytl`),
  ...Array.from({ length: 15 }, (_value, index) => `grss${index + 1}.ytl`),
  ...Array.from({ length: 4 }, (_value, index) => `sea${index}.ytl`),
  ...Array.from({ length: 4 }, (_value, index) => `newblk${index}.ytl`),
  "newblkgate.ytl",
  ...Array.from({ length: 3 }, (_value, index) => `castle${index}.ytl`),
  "blacktile.ytl",
  "shallow.spr",
  ...Array.from({ length: 15 }, (_value, index) => `fog${index}.spr`),
  "black.spr",
];

const RAW_CODE_RANGES = [
  ["tileset-loader", LOADER_FUNCTION, 0x00443311, "bd0f58f89b39743bbe8b4233193ae10f4095976ef9b53088c3b7b91213d1a117"],
  ["tileset-cleanup", CLEANUP_FUNCTION, 0x00443352, "50a4f2739aaf46cbe183597dd2e4d27c7fc922e54ff2a1c3c0398970f1401c7c"],
  ["tileset-filename-table", POINTER_TABLE, POINTER_TABLE + (LOADED_ENTRY_COUNT + 1) * 4, "1f78b6c1f65e0200f3d0927da2a73e045da273d5ef796b850dcca0631df1a2d4"],
].map(([id, start, endExclusive, digest]) => ({ id, start, endExclusive, sha256: digest }));

const EVIDENCE = [
  [0x0044317a, "bd 20 c4 4b 00 c7 44 24 10 f8 df bc 00", "loader initializes table 0x004bc420 and record base 0x00bcdff8"],
  [0x00443187, "0f bf 84 24 a0 00 00 00 83 e8 00 74 6e 48 74 64 48 74 5a", "first argument is signed WORD; 0/1/2 select three prefix arms and every other value falls through"],
  [0x004431f4, "68 8c d9 4b 00 eb 0c 68 80 d9 4b 00 eb 05 68 ac d9 4b 00", "selector 2 pushes brown, selector 1 snow, selector 0/default normal"],
  [0x004432bf, "81 c1 f8 0b 00 00 83 c5 04", "each successful or failed iteration advances record cursor by 0x0bf8 and table cursor by one DWORD"],
  [0x004432d0, "be 44 ab 4c 00", "next table path is compared with the 0x004cab44 empty-string sentinel"],
  [0x004432fe, "85 c0 0f 85 81 fe ff ff", "non-sentinel next path loops to the same selector/load body"],
  [0x00443322, "be ec eb bc 00 bf 4c 00 00 00", "cleanup starts at record-base plus 0x0bf4 and repeats exactly 0x4c times"],
  [0x00443346, "81 c6 f8 0b 00 00 4f 75 dd", "cleanup advances by 0x0bf8 and loops until its count reaches zero"],
  [0x004bc550, "44 ab 4c 00", "table entry 76 points to the exact empty-string sentinel"],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

export function extractImjinrokTilesetLoaderBoundary({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  tileDirectory = DEFAULT_TILE_DIRECTORY,
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  assertEqual(sha256(buffer), EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);
  const table = readTilesetTable(buffer, image);
  const diskFiles = readDiskTilesetCatalog(tileDirectory);
  const diskOnlyFiles = diskFiles.filter((fileName) => !table.fileNames.includes(fileName));

  assertEqual(table.entries.length, LOADED_ENTRY_COUNT, "tileset loaded-entry count");
  assertEqual(JSON.stringify(table.fileNames), JSON.stringify(EXPECTED_FILENAMES), "tileset filename table order");
  assertEqual(JSON.stringify(diskOnlyFiles), JSON.stringify(EXPECTED_DISK_ONLY_FILES), "normal tileset files outside main loader table");

  return {
    question: "What bounded source-selection, filename-table, record-stride, and cleanup contract does FUN_00443160/FUN_00443320 establish for the main tileset loader?",
    analysisStatus: "static-confirmed-for-main-tileset-loader-boundary",
    reproductionStatus: "reproduction-complete-for-selector-table-sentinel-and-cleanup-boundaries",
    implementationStatus: "analysis-only-no-renderer-or-map-cell-change",
    sources: {
      executable: { path: relative(repositoryRoot, executablePath), sha256: EXPECTED_EXECUTABLE_SHA256 },
      normalTilesetDirectory: relative(repositoryRoot, tileDirectory),
    },
    loader: {
      function: "FUN_00443160",
      address: toHex(LOADER_FUNCTION),
      selector: {
        firstArgument: "signed WORD",
        values: { 0: TILESET_PREFIXES[0], 1: TILESET_PREFIXES[1], 2: TILESET_PREFIXES[2] },
        fallback: TILESET_PREFIXES[0],
      },
      filenameTable: {
        address: toHex(POINTER_TABLE),
        loadedEntryCount: LOADED_ENTRY_COUNT,
        entries: table.entries,
        sentinel: table.sentinel,
      },
      recordBase: toHex(RECORD_BASE),
      recordStride: "0x0bf8",
    },
    cleanup: {
      function: "FUN_00443320",
      address: toHex(CLEANUP_FUNCTION),
      activePointerBase: toHex(CLEANUP_ACTIVE_POINTER_BASE),
      recordBase: toHex(RECORD_BASE),
      recordStride: "0x0bf8",
      count: CLEANUP_COUNT,
    },
    diskCatalog: {
      directory: relative(repositoryRoot, tileDirectory),
      fileCount: diskFiles.length,
      fileNames: diskFiles,
      mainLoaderFileCount: table.fileNames.length,
      outsideMainLoaderTable: diskOnlyFiles,
      boundary: "diff13l.ytl and hill0.ypr are absent from this main loader table only; this extractor does not claim they are unused by every other original path.",
    },
    rawCodeRanges: RAW_CODE_RANGES.map((range) => verifyRawCodeRange(buffer, image, range)),
    evidencePoints: EVIDENCE.map((point) => verifyEvidencePoint(buffer, image, point)),
    unresolvedBoundary: "The loader selects a directory prefix and ordered sprite-container records only. Tile/frame rendering, map-cell fields, and the selector from map data to a filename or frame remain unconfirmed.",
  };
}

export function reproduceTilesetPrefix(selector) {
  if (!Number.isInteger(selector) || selector < -0x8000 || selector > 0x7fff) {
    throw new RangeError("selector must be a signed 16-bit integer");
  }
  return TILESET_PREFIXES[selector] ?? TILESET_PREFIXES[0];
}

function readTilesetTable(buffer, image) {
  const entries = [];
  for (let index = 0; index < LOADED_ENTRY_COUNT; index += 1) {
    const entry = POINTER_TABLE + index * 4;
    const pointer = readVaRange(buffer, image, entry, entry + 4).readUInt32LE(0);
    const rawOffset = image.vaToRawOffset(pointer);
    if (rawOffset === undefined) throw new RangeError(`tileset table entry ${index} points outside PE sections`);
    const fileName = readCString(buffer, rawOffset);
    if (!fileName) throw new Error(`tileset table entry ${index} is an early sentinel`);
    entries.push({ index, tableEntry: toHex(entry), pointer: toHex(pointer), fileName });
  }
  const sentinelEntry = POINTER_TABLE + LOADED_ENTRY_COUNT * 4;
  const pointer = readVaRange(buffer, image, sentinelEntry, sentinelEntry + 4).readUInt32LE(0);
  assertEqual(pointer, TABLE_SENTINEL, "tileset table sentinel pointer");
  const rawOffset = image.vaToRawOffset(pointer);
  if (rawOffset === undefined) throw new RangeError("tileset table sentinel points outside PE sections");
  assertEqual(readCString(buffer, rawOffset), "", "tileset table sentinel path");
  return {
    entries,
    fileNames: entries.map((entry) => entry.fileName),
    sentinel: { index: LOADED_ENTRY_COUNT, tableEntry: toHex(sentinelEntry), pointer: toHex(pointer), path: "" },
  };
}

function readDiskTilesetCatalog(tileDirectory) {
  const files = readdirSync(tileDirectory)
    .filter((fileName) => TILE_EXTENSIONS.has(extname(fileName).toLowerCase()))
    .sort();
  assertEqual(files.length, 78, "normal tileset disk catalog count");
  return files;
}

function parseArgs(argv) {
  const outputIndex = argv.indexOf("--output");
  if (outputIndex === -1) return {};
  const output = argv[outputIndex + 1];
  if (!output) throw new Error("--output requires a path");
  return { output: resolve(repositoryRoot, output) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const rendered = `${JSON.stringify(extractImjinrokTilesetLoaderBoundary(), null, 2)}\n`;
  if (args.output) writeFileSync(args.output, rendered);
  else process.stdout.write(rendered);
}
