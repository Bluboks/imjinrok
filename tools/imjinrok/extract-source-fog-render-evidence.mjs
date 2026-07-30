#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseSpriteLikeHeader } from "./codec.mjs";
import { EXPECTED_EXECUTABLE_SHA256, extractImjinrokTilesetLoaderBoundary } from "./extract-imjinrok-tileset-loader-boundary.mjs";
import { parseMapHeader } from "./map-codec.mjs";
import { readPeImage, toHex } from "./pe-image.mjs";
import { assertEqual, readVaRange, sha256, verifyEvidencePoint, verifyRawCodeRange } from "./static-evidence.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_EXECUTABLE_PATH = resolve(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const DEFAULT_NORMAL_TILE_DIRECTORY = resolve(repositoryRoot, "original/imjinrok2/tile/normal");
const DEFAULT_K01_MAP_PATH = resolve(repositoryRoot, "original/imjinrok2/stagemap/k01.map");
const LOADER_RECORD_BASE = 0x00bcdff8;
const LOADER_RECORD_STRIDE = 0x0bf8;
const FOG_RESOURCE_INDEX_START = 60;
const BLACK_RESOURCE_INDEX = 75;
const FOG_MASK_LOOKUP_ADDRESS = 0x004bf9c4;
const FOG_MASK_LOOKUP = [0, 9, 8, 2, 10, 1, 12, 5, 11, 13, 3, 6, 0, 4, 7, 0];
const FOG_FRAME_WIDTH_OFFSET = 0x04;
const FOG_FRAME_HEIGHT_OFFSET = 0x08;
const FOG_FRAME_COUNT_OFFSET = 0x0c;
const FOG_ATLAS_WIDTH_OFFSET = 0x0bcc;
const FOG_ATLAS_HEIGHT_OFFSET = 0x0bd0;
const FOG_ATLAS_COLUMNS = 32;
const FOG_HALF_COLUMNS = 16;
const CALLER_SELECTOR_DOMAIN = Array.from({ length: 14 }, (_value, index) => index);
const FAMILY_BYTE_MAP_OFFSET = 0x4a0c4;
const MAP_X_STRIDE = 180;
const EXPECTED_K01_MAP = { size: 1_097_100, sha256: "43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb", width: 60, height: 60 };

const FOG_SOURCE_HASHES = [
  "98c4f138a47503e112b7fd78fd13c0cc6cb9593ef37c18209cbf88bc7f4e4759",
  "0e64374263ceedb1253d7a55fc96681d3e2787e876021134747521bf88bf5701",
  "114fa8aab39b45423a3fe6b3574a194fbc056877ee02f3c2b32b10c8d867b1a0",
  "c5db36d2e772d2309d086911e96eba91b2052d221e8d67b3e7d7ddaeb1009065",
  "c08dd146b67fe85d17900471273c7b6d3feaa06080d8fe83dda5b74b63892e79",
  "26ea4a1ed4a0865ace99e22639df0d513a508da54f73b956c60e2dc9d3a646ca",
  "5670c1940397a807e10ffe132d472613508800671f1aa3da3e1f54b46133c5a0",
  "798f6d69678c7b9c40decbc220199219c9e17cfc6ae76470daebd49d0af99b55",
  "4064773e38a13f43ede3f06975c61bb3405337eb6fcb90ccc3d7b4425eaf5f59",
  "22ba6fc52a03bbed16f063dcd16fdf47437bdab642ecbcb58af2c0aff03676be",
  "bf6b260f412305fd29b0a6a8454fb6bb112e0344ac2f96b465f6f62923437c7c",
  "3633f57e785791c0f5e9e6f632fed1575b23fbf7756177be2162dbd6ce602e47",
  "3ed4ced064f3998f143a344f0f17cac528d91953fd41a97deb3add1b7330ba5d",
  "b363feaf9cd89b964a7d306f0638f2f41cc57bf8b8efd0e1d8dd818c9aee5ee7",
  "efb2eb836d4552a9bea57a37f97370cb2de1e1a55d4f34271889ad0a083fc669",
];

const RAW_CODE_RANGES = [
  ["FUN_00467de0", 0x00467de0, 0x004689ce, "1a2c8ddfb7e2801514c0848d1c7ecb18628df35b5cf4785ecd2507c2b5a74604"],
  ["FUN_0046a530", 0x0046a530, 0x0046a8e8, "b4dc5ba4f0d8be3cac135ccfd02a372173dfcf01dad79f262cf8468572ea8e7a"],
].map(([id, start, endExclusive, digest]) => ({ id, start, endExclusive, sha256: digest }));

const EVIDENCE = [
  [0x00468743, "8d 4a ff 33 c0 85 c9 7c 12 8b 4c 24 1c 80 b9 5d 4d 7d 00 04 75 05 b8 03 00 00 00 8b 8e a4 2d 00 00 42 3b d1 7d 0f 8b 54 24 1c 80 ba 5f 4d 7d 00 04 75 02 0c 0c", "FUN_00467de0 begins the state-4 neighbor mask and sets the vertical-neighbor bit pairs only after in-bounds checks."],
  [0x00468842, "66 3d 0f 00 74 21 0f bf c0 8b 54 24 18 66 0f b6 88 c4 f9 4b 00 8b 44 24 14 51 6a 04 52 50 57 53 8b ce e8 c7 1c 00 00", "The nonzero/non-0x0f state-4 mask indexes 0x004bf9c4, then calls FUN_0046a530 with literal state 4."],
  [0x00468869, "0f bf 4c 24 18 33 c0 8d 51 ff 85 d2 89 54 24 10 7c 12 8b 54 24 1c 80 ba 5d 4d 7d 00 08 75 05 b8 03 00 00 00", "FUN_00467de0 starts a separate mask accumulation path by comparing neighbors to literal state 8."],
  [0x0046895b, "66 85 c0 74 27 66 3d 0f 00 74 21 0f bf c0 8b 54 24 18 66 0f b6 88 c4 f9 4b 00 8b 44 24 14 51 6a 08 52 50 57 53 8b ce e8 a9 1b 00 00", "The nonzero/non-0x0f state-8 mask uses the same lookup table and calls FUN_0046a530 with literal state 8."],
  [0x0046a5c8, "0f bf c7 05 95 06 00 00 0f bf d3 8d 04 80 03 f2 8d 54 24 34 8d 04 c0 0f bf f9 66 0f b6 04 86 83 c0 3c", "FUN_0046a530 forms map + 0x4a0c4 + mapX*180 + mapY, reads its family byte, and adds 0x3c before selecting a loader record."],
  [0x0046a5f1, "8d 1c 76 50 c1 e3 07 2b de 8d 44 24 3c c1 e3 03 52 50 8b 83 00 e0 bc 00", "The selected family plus 0x3c is scaled by record stride 0x0bf8 and reads the common loader record."],
  [0x0046a634, "8b 83 c4 eb bc 00 66 8b ab fc df bc 00 99 f7 bb fc df bc 00 66 8b 8b 00 e0 bc 00", "FUN_0046a530 loads record+0x0bcc atlas width, divides it by record+0x04 frame width, and loads record+0x08 frame height."],
  [0x0046a64f, "66 83 7c 24 54 04 89 6c 24 28 89 4c 24 1c c7 44 24 48 00 00 00 00 89 44 24 50 0f 85 2b 01 00 00", "FUN_0046a530 branches on literal state 4 before entering its first 3-by-2 composition loop."],
  [0x0046a6c0, "0f bf 44 24 50 0f bf 6c 24 58 99 2b c2 68 68 44 53 00 8b f8 8b c5 99 d1 ff f7 ff 8b 54 24 4c 8b c8 8d 04 4a 03 c8 8b c5 99 0f af 4c 24 54 f7 ff", "The state-4 path uses signed IDIV with halfColumns and combines quotient, remainder, outer, and inner loop values into the subframe index."],
  [0x0046a71e, "52 8b 54 24 54 50 8b 44 24 50 51 52 50 b9 18 94 55 00 e8 8b 3c fe ff", "The state-4 composition path calls FUN_0044e3c0 after the common preceding path succeeds."],
  [0x0046a74a, "66 83 f9 02 89 4c 24 54 89 44 24 1c 89 7c 24 44 0f 8c 41 ff ff ff 8b 44 24 48 8b 4c 24 18 8b 7c 24 10 8b 54 24 4c 40 03 f9 03 d1 66 3d 03 00 89 44 24 48 89 7c 24 10 89 54 24 4c 0f 8c fe fe ff ff", "The state-4 path repeats its inner loop while index < 2 and outer loop while index < 3, for six subframes."],
  [0x0046a79a, "8b 54 24 44 89 7c 24 18 0f bf c9 0f bf c5 8d 4c 39 ff 89 54 24 20", "The non-state-4 branch initializes a distinct composition path."],
  [0x0046a850, "52 8b 54 24 24 50 8b 44 24 18 51 52 50 b9 18 94 55 00 e8 c9 82 fe ff", "The distinct non-state-4 composition path calls FUN_00452b30 after the common preceding path succeeds."],
  [0x0046a889, "66 83 f9 02 89 4c 24 54 89 54 24 4c 89 7c 24 10 0f 8c 35 ff ff ff 0f bf 4c 24 1c 8b 7c 24 14 8b 54 24 48 03 f9 42 89 7c 24 14 8b 7c 24 18 03 f9 8b 4c 24 1c 89 7c 24 18 8b 7c 24 20 03 f9 66 83 fa 03 89 54 24 48 89 7c 24 20 0f 8c db fe ff ff", "The non-state-4 path also has inner <2 and outer <3 loop bounds, but its call target differs from the state-4 path."],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

export function lookupFogNeighborMask(mask) {
  if (!Number.isInteger(mask) || mask < 0 || mask >= 16) throw new RangeError("fog neighbor mask must be an integer in 0..15");
  return FOG_MASK_LOOKUP[mask];
}

export function reproduceFogSubframeIndices(selector) {
  if (!Number.isInteger(selector) || !CALLER_SELECTOR_DOMAIN.includes(selector)) {
    throw new RangeError("fog selector must be an integer in the caller-proven domain 0..13");
  }
  const quotient = Math.trunc(selector / FOG_HALF_COLUMNS);
  const remainder = selector % FOG_HALF_COLUMNS;
  const indices = [];
  for (let outer = 0; outer < 3; outer += 1) {
    for (let inner = 0; inner < 2; inner += 1) {
      indices.push(inner + (outer + 3 * quotient) * FOG_ATLAS_COLUMNS + 2 * remainder);
    }
  }
  return indices;
}

export function extractSourceFogRenderEvidence({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  normalTileDirectory = DEFAULT_NORMAL_TILE_DIRECTORY,
  mapPath = DEFAULT_K01_MAP_PATH,
} = {}) {
  const { buffer: executable, image } = readPeImage(executablePath);
  assertEqual(sha256(executable), EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);
  const loader = extractImjinrokTilesetLoaderBoundary({ executablePath, tileDirectory: normalTileDirectory });
  const fogResources = extractFogResources(loader, normalTileDirectory);
  const k01FamilyBytes = extractK01FamilyBytes(mapPath);
  const lookupBytes = readVaRange(executable, image, FOG_MASK_LOOKUP_ADDRESS, FOG_MASK_LOOKUP_ADDRESS + 16);
  assertEqual(JSON.stringify([...lookupBytes]), JSON.stringify(FOG_MASK_LOOKUP), "fog neighbor lookup vector");

  return {
    question: "What source-backed fog resource, neighbor-lookup, caller-state, and six-subframe composition contract do FUN_00467de0 and FUN_0046a530 establish?",
    analysisStatus: "정적 확정 (resource family, lookup, caller state branches, six-subframe composition, and frame algebra only)",
    reproductionStatus: "재현 완료 (hash-bound extraction, resource records, lookup/frame vectors, and loop bounds only)",
    implementationStatus: "없음",
    sources: {
      executable: { path: relative(repositoryRoot, executablePath), sha256: EXPECTED_EXECUTABLE_SHA256 },
      normalTileDirectory: relative(repositoryRoot, normalTileDirectory),
      k01Map: { path: relative(repositoryRoot, mapPath), size: EXPECTED_K01_MAP.size, sha256: EXPECTED_K01_MAP.sha256 },
    },
    functions: {
      caller: { name: "FUN_00467de0", address: toHex(0x00467de0) },
      compositor: { name: "FUN_0046a530", address: toHex(0x0046a530) },
    },
    resources: {
      loaderRecordBase: toHex(LOADER_RECORD_BASE),
      loaderRecordStride: "0x0bf8",
      familyByteAddress: "map + 0x4a0c4 + mapX * 180 + mapY",
      familyToResourceIndex: "resourceIndex = familyByte + 0x3c",
      k01FamilyBytes,
      fog: fogResources.slice(0, 15),
      black: fogResources[15],
    },
    neighborLookup: {
      address: toHex(FOG_MASK_LOOKUP_ADDRESS),
      rawOffset: toHex(image.vaToRawOffset(FOG_MASK_LOOKUP_ADDRESS)),
      byteRange: `${toHex(FOG_MASK_LOOKUP_ADDRESS)}-${toHex(FOG_MASK_LOOKUP_ADDRESS + 16)} (end exclusive)`,
      sha256: sha256(lookupBytes),
      inputRange: "0..15",
      values: [...lookupBytes],
      vectors: FOG_MASK_LOOKUP.map((output, input) => ({ input, output })),
    },
    callerContract: {
      separateNeighborStateValues: [4, 8],
      skippedMaskValues: [0, 15],
      lookupThenCompositorCall: true,
    },
    composition: {
      subframeGrid: { columns: 3, rows: 2, subframeCount: 6 },
      state4: { stateValue: 4, blitFunction: "FUN_0044e3c0" },
      state8: { stateValue: 8, blitFunction: "FUN_00452b30" },
      boundary: "The byte-proven branch distinguishes literal state 4 from the non-4 path reached by caller literal state 8; no human visibility meaning is assigned.",
    },
    frameSelection: {
      resourceHeaderOffsets: { frameWidth: "0x04", frameHeight: "0x08", frameCount: "0x0c", atlasWidth: "0x0bcc", atlasHeight: "0x0bd0" },
      normalFogAtlas: { frameWidth: 32, frameHeight: 16, frameCount: 96, atlasWidth: 1024, atlasHeight: 48, atlasColumns: FOG_ATLAS_COLUMNS, halfColumns: FOG_HALF_COLUMNS },
      signedDivision: "x86 signed IDIV; for the caller-proven nonnegative selector domain 0..13, quotient = trunc(selector / halfColumns) and remainder = selector % halfColumns.",
      callerSelectorDomain: CALLER_SELECTOR_DOMAIN,
      formula: "frame = inner + (outer + 3 * trunc(selector / halfColumns)) * atlasColumns + 2 * (selector % halfColumns), with outer = 0..2 and inner = 0..1.",
      vectors: [0, 9, 13].map((selector) => ({ selector, frames: reproduceFogSubframeIndices(selector) })),
      frameBounds: { minimum: 0, maximum: 91, withinFrameCount: 96 },
    },
    rawCodeRanges: RAW_CODE_RANGES.map((range) => verifyRawCodeRange(executable, image, range)),
    evidencePoints: EVIDENCE.map((point) => verifyEvidencePoint(executable, image, point)),
    unresolvedBoundary: "Visibility/exploration semantics, product-state mapping, generic map-file provenance and runtime producer/lifetime of the family byte, wall-clock behavior, and pixel placement remain unresolved. K01's hash-bound static byte distribution is recorded only as a bounded map-data observation. The frame algebra is confined to the caller-proven selector domain and normal fog header contract; it does not assign a human meaning to either state or selector.",
  };
}

function extractK01FamilyBytes(mapPath) {
  const map = readFileSync(mapPath);
  assertEqual(map.length, EXPECTED_K01_MAP.size, `${mapPath} size`);
  assertEqual(sha256(map), EXPECTED_K01_MAP.sha256, `${mapPath} SHA-256`);
  const header = parseMapHeader(map, mapPath);
  assertEqual(header.width, EXPECTED_K01_MAP.width, "K01 family-byte map width");
  assertEqual(header.height, EXPECTED_K01_MAP.height, "K01 family-byte map height");
  const lastOffset = FAMILY_BYTE_MAP_OFFSET + (header.width - 1) * MAP_X_STRIDE + (header.height - 1);
  if (lastOffset >= map.length) throw new RangeError(`K01 family-byte grid ending at 0x${lastOffset.toString(16)} exceeds map size`);
  const values = [];
  for (let x = 0; x < header.width; x += 1) {
    for (let y = 0; y < header.height; y += 1) values.push(map[FAMILY_BYTE_MAP_OFFSET + x * MAP_X_STRIDE + y]);
  }
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return {
    scope: "K01 hash-bound map bytes only; this neither identifies the runtime producer nor generalizes to other maps.",
    mapOffset: "0x4a0c4",
    coordinateStorage: "map + 0x4a0c4 + x * 180 + y",
    dimensions: { width: header.width, height: header.height },
    cellCount: values.length,
    valueStreamSha256: sha256(Buffer.from(values)),
    domain: [...counts.keys()].sort((left, right) => left - right),
    distribution: [...counts.entries()].sort(([left], [right]) => left - right).map(([value, count]) => ({ value, count })),
  };
}

function extractFogResources(loader, normalTileDirectory) {
  const expected = [
    ...Array.from({ length: 15 }, (_value, index) => ({ index: FOG_RESOURCE_INDEX_START + index, fileName: `fog${index}.spr`, sha256: FOG_SOURCE_HASHES[index], header: { width: 32, height: 16, frameCount: 96, atlasWidth: 1024, atlasHeight: 48 } })),
    { index: BLACK_RESOURCE_INDEX, fileName: "black.spr", sha256: "9ef53a565bfe804e8a272f73f9749c05681b6b9e3af4090f7e4eea61237292d0", header: { width: 64, height: 32, frameCount: 1 } },
  ];
  return expected.map((source) => {
    const tableEntry = loader.loader.filenameTable.entries[source.index];
    assertEqual(tableEntry?.fileName, source.fileName, `tileset loader record ${source.index} filename`);
    const path = resolve(normalTileDirectory, source.fileName);
    const bytes = readFileSync(path);
    assertEqual(sha256(bytes), source.sha256, `${path} SHA-256`);
    const header = parseSpriteLikeHeader(bytes, path);
    const actualHeader = source.index === BLACK_RESOURCE_INDEX
      ? { width: header.width, height: header.height, frameCount: header.frameCount }
      : readFogHeaderFields(bytes, header);
    assertEqual(JSON.stringify(actualHeader), JSON.stringify(source.header), `${path} header`);
    return {
      resourceIndex: source.index,
      recordAddress: toHex(LOADER_RECORD_BASE + source.index * LOADER_RECORD_STRIDE),
      fileName: source.fileName,
      sourcePath: relative(repositoryRoot, path),
      sha256: source.sha256,
      header: source.header,
      ...(source.index === BLACK_RESOURCE_INDEX ? {} : { headerFieldSha256: fogHeaderFieldSha256(bytes) }),
    };
  });
}

function readFogHeaderFields(bytes, header) {
  return {
    width: header.width,
    height: header.height,
    frameCount: header.frameCount,
    atlasWidth: bytes.readUInt32LE(FOG_ATLAS_WIDTH_OFFSET),
    atlasHeight: bytes.readUInt32LE(FOG_ATLAS_HEIGHT_OFFSET),
  };
}

function fogHeaderFieldSha256(bytes) {
  return sha256(Buffer.concat([
    bytes.subarray(FOG_FRAME_WIDTH_OFFSET, FOG_FRAME_COUNT_OFFSET + 4),
    bytes.subarray(FOG_ATLAS_WIDTH_OFFSET, FOG_ATLAS_HEIGHT_OFFSET + 4),
  ]));
}

function parseArgs(argv) {
  const outputIndex = argv.indexOf("--output");
  if (outputIndex === -1) return {};
  const output = argv[outputIndex + 1];
  if (!output) throw new Error("--output requires a path");
  return { output: resolve(repositoryRoot, output) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { output } = parseArgs(process.argv.slice(2));
  const rendered = `${JSON.stringify(extractSourceFogRenderEvidence(), null, 2)}\n`;
  if (output) writeFileSync(output, rendered);
  else process.stdout.write(rendered);
}
