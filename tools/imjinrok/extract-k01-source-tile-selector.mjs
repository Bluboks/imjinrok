#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractImjinrokEnvironmentAssets } from "./extract-imjinrok-environment-assets.mjs";
import { EXPECTED_EXECUTABLE_SHA256, extractImjinrokTilesetLoaderBoundary } from "./extract-imjinrok-tileset-loader-boundary.mjs";
import { MAP_DIMENSIONS_OFFSET, parseMapHeader } from "./map-codec.mjs";
import { readPeImage, toHex } from "./pe-image.mjs";
import { assertEqual, sha256, verifyEvidencePoint, verifyRawCodeRange } from "./static-evidence.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_ORIGINAL_ROOT = resolve(repositoryRoot, "original/imjinrok2");
const DEFAULT_MAP_PATH = resolve(DEFAULT_ORIGINAL_ROOT, "stagemap/k01.map");
const DEFAULT_EXECUTABLE_PATH = resolve(DEFAULT_ORIGINAL_ROOT, "imjinrok2.exe");
const DEFAULT_LOADER_FIXTURE = resolve(repositoryRoot, "analysis/fixtures/imjinrok-tileset-loader-boundary.json");
const DEFAULT_ENVIRONMENT_FIXTURE = resolve(repositoryRoot, "analysis/fixtures/imjinrok-environment-assets.json");
const EXPECTED_K01_MAP_SHA256 = "43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb";
const EXPECTED_K01_MAP_SIZE = 1_097_100;
const TILE_OBJECT_OFFSET = 0x3a3a4;
const TILE_FRAME_OFFSET = 0x42234;
const X_STRIDE = 180;
const EXPECTED_OBJECT_INDICES = [...Array.from({ length: 14 }, (_value, index) => index), ...Array.from({ length: 13 }, (_value, index) => index + 16), ...Array.from({ length: 13 }, (_value, index) => index + 31)];

const RAW_CODE_RANGES = [
  ["FUN_00469330 selector core", 0x004693c8, 0x004694f8, "ae72865db1f2d596ba79009cf6343c0263c9036947674fbdd759ef757c19279e"],
  ["FUN_00469510 sibling selector core", 0x004695a4, 0x00469624, "06b7173166d619c146e02b020bc9214dea2401aa21e22b8279967221dc0e9967"],
].map(([id, start, endExclusive, digest]) => ({ id, start, endExclusive, sha256: digest }));

const EVIDENCE = [
  [0x00469351, "8b 8e a0 2d 00 00 0f bf c7 3b c1 7d 47 66 85 ed 7c 42 8b 96 a4 2d 00 00 0f bf cd 3b ca 7d 35", "FUN_00469330 bounds signed x/y against map +0x2da0/+0x2da4"],
  [0x004693ce, "8d 94 80 e1 19 00 00 8d 84 80 65 1d 00 00 0f bf 6c 24 24 8d 14 d2 8d 04 c0 0f bf db 8d 14 91 8d 0c 81 66 0f b6 14 32 66 0f b6 04 31", "x*180+y reads map +0x3a3a4 object byte then map +0x42234 frame byte"],
  [0x00469406, "8d 34 7f 8d 54 24 14 c1 e6 07 2b f7 51 c1 e6 03", "object byte is scaled to loader record stride 0x0bf8"],
  [0x0046941c, "8b 86 00 e0 bc 00 8d 4c 24 28 51 8b 8e fc df bc 00", "selected loader record supplies copied sprite header fields before draw"],
  [0x004694c6, "50 0f bf 44 24 30 c1 e2 07 8b 9e ec eb bc 00 2b d7", "selected record payload pointer is read from record +0x0bf4"],
  [0x004695bf, "66 0f b6 14 30 8d 84 9b 65 1d 00 00 0f bf fa", "FUN_00469510 repeats the object-byte read"],
  [0x004695e2, "66 0f b6 04 31 8d 34 7f", "FUN_00469510 repeats the frame-byte read and record scale"],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

export function extractK01SourceTileSelector({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  mapPath = DEFAULT_MAP_PATH,
  originalRoot = DEFAULT_ORIGINAL_ROOT,
  loaderFixturePath = DEFAULT_LOADER_FIXTURE,
  environmentFixturePath = DEFAULT_ENVIRONMENT_FIXTURE,
} = {}) {
  const { buffer: executable, image } = readPeImage(executablePath);
  assertEqual(sha256(executable), EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);
  const map = readFileSync(mapPath);
  assertEqual(map.length, EXPECTED_K01_MAP_SIZE, `${mapPath} size`);
  assertEqual(sha256(map), EXPECTED_K01_MAP_SHA256, `${mapPath} SHA-256`);
  const header = parseMapHeader(map, mapPath);
  assertEqual(header.themeId, 0, "K01 themeId");
  assertEqual(header.width, 60, "K01 width at map +0x2da0");
  assertEqual(header.height, 60, "K01 height at map +0x2da4");

  const loader = extractImjinrokTilesetLoaderBoundary({ executablePath, tileDirectory: resolve(originalRoot, "tile/normal") });
  assertFixtureMatches(loaderFixturePath, loader, "tileset loader");
  const environment = extractImjinrokEnvironmentAssets({ originalRoot });
  assertFixtureMatches(environmentFixturePath, environment, "environment asset");
  const objects = buildObjectSources(loader, environment);
  const pairs = collectPairs(map, header, objects);
  const usedObjectIndices = [...new Set(pairs.map((pair) => pair.objectIndex))].sort((left, right) => left - right);
  assertEqual(JSON.stringify(usedObjectIndices), JSON.stringify(EXPECTED_OBJECT_INDICES), "K01 used object indices");

  return {
    question: "Which hash-bound K01 map bytes select a main-loader tile object and sprite frame in FUN_00469330?",
    analysisStatus: "static-confirmed-for-K01-source-tile-object-and-frame-selector",
    reproductionStatus: "reproduction-complete-for-all-K01-coordinate-pairs-and-source-frame-bounds",
    implementationStatus: "analysis-only-no-product-renderer-change",
    sources: {
      executable: { path: relative(repositoryRoot, executablePath), sha256: EXPECTED_EXECUTABLE_SHA256 },
      map: { path: relative(repositoryRoot, mapPath), size: map.length, sha256: EXPECTED_K01_MAP_SHA256 },
      loaderFixture: relative(repositoryRoot, loaderFixturePath),
      environmentFixture: relative(repositoryRoot, environmentFixturePath),
    },
    map: {
      themeId: header.themeId,
      theme: "normal",
      width: header.width,
      height: header.height,
      bounds: { widthFieldOffset: "0x2da0", heightFieldOffset: "0x2da4" },
      storage: {
        objectByte: "map + 0x3a3a4 + x * 180 + y",
        frameByte: "map + 0x42234 + x * 180 + y",
        coordinateOrder: "x-major storage traversal: ordinal = x * height + y; this is not the product's older row-major RLE serialization order.",
      },
    },
    renderer: {
      primary: "FUN_00469330",
      sibling: "FUN_00469510",
      loaderRecord: { base: "0x00bcdff8", stride: "0x0bf8", frameOffsetTable: "record +0x4c0", payload: "record +0x0bf4" },
      lowNibbleBoundary: "map +0x32514 is used by a separate lift/branch path and is not this object/frame selector identity.",
    },
    objects: summarizeObjects(objects, pairs),
    pairStream: summarizePairs(pairs, header),
    representativePoints: representativePoints(map, header, objects),
    rawCodeRanges: RAW_CODE_RANGES.map((range) => verifyRawCodeRange(executable, image, range)),
    evidencePoints: EVIDENCE.map((point) => verifyEvidencePoint(executable, image, point)),
    unresolvedBoundary: "This confirms source object/frame selection only. It does not assign passability, elevation, terrain/world meaning, pixel placement, or product renderer parity.",
  };
}

export function resolveK01SourceTile(mapBuffer, objects, x, y) {
  const header = parseMapHeader(mapBuffer, "K01 map buffer");
  if (!Number.isInteger(x) || !Number.isInteger(y)) throw new TypeError(`K01 tile coordinates must be integers: ${x},${y}`);
  if (x < 0 || x >= header.width || y < 0 || y >= header.height) {
    throw new RangeError(`K01 tile coordinates outside 0..${header.width - 1},0..${header.height - 1}: ${x},${y}`);
  }
  const storageOffset = x * X_STRIDE + y;
  const objectIndex = mapBuffer[TILE_OBJECT_OFFSET + storageOffset];
  const frameIndex = mapBuffer[TILE_FRAME_OFFSET + storageOffset];
  const object = objects.find((candidate) => candidate.objectIndex === objectIndex);
  if (!object) throw new RangeError(`K01 tile (${x},${y}) object index ${objectIndex} has no validated main-loader source`);
  if (frameIndex >= object.frameCount) {
    throw new RangeError(`K01 tile (${x},${y}) frame index ${frameIndex} exceeds ${object.sourcePath} frameCount ${object.frameCount}`);
  }
  return { x, y, storageOffset, objectIndex, frameIndex, sourcePath: object.sourcePath, fileName: object.fileName, frameCount: object.frameCount };
}

function buildObjectSources(loader, environment) {
  const normalSources = new Map(environment.sourceFiles.filter((entry) => entry.category === "tileset:normal").map((entry) => [entry.sourcePath, entry]));
  return loader.loader.filenameTable.entries.map((entry) => {
    const sourcePath = `tile/normal/${entry.fileName}`;
    const source = normalSources.get(sourcePath);
    if (!source) throw new Error(`main-loader entry ${entry.index} lacks environment catalog source ${sourcePath}`);
    if (!Number.isInteger(source.frameCount) || source.frameCount <= 0) throw new Error(`${sourcePath} lacks a valid sprite header frameCount`);
    return { objectIndex: entry.index, fileName: entry.fileName, sourcePath, sha256: source.sha256, width: source.width, height: source.height, frameCount: source.frameCount, endOffset: source.endOffset };
  });
}

function collectPairs(map, header, objects) {
  const pairs = [];
  for (let x = 0; x < header.width; x += 1) {
    for (let y = 0; y < header.height; y += 1) pairs.push(resolveK01SourceTile(map, objects, x, y));
  }
  return pairs;
}

function summarizeObjects(objects, pairs) {
  return objects
    .filter((object) => pairs.some((pair) => pair.objectIndex === object.objectIndex))
    .map((object) => {
      const frames = pairs.filter((pair) => pair.objectIndex === object.objectIndex).map((pair) => pair.frameIndex);
      return { ...object, cellCount: frames.length, frameRange: { min: Math.min(...frames), max: Math.max(...frames) }, uniqueFrameCount: new Set(frames).size };
    });
}

function summarizePairs(pairs, header) {
  const bytes = Buffer.from(pairs.flatMap((pair) => [pair.objectIndex, pair.frameIndex]));
  return { coordinateOrder: "x-major storage traversal: ordinal = x * height + y", count: pairs.length, byteCount: bytes.length, sha256: sha256(bytes), uniquePairCount: new Set(pairs.map((pair) => `${pair.objectIndex}:${pair.frameIndex}`)).size, dimensions: { width: header.width, height: header.height } };
}

function representativePoints(map, header, objects) {
  return [[0, 0], [0, 59], [13, 0], [16, 0], [31, 0], [59, 59]].map(([x, y]) => resolveK01SourceTile(map, objects, x, y));
}

function assertFixtureMatches(path, actual, label) {
  const expected = JSON.parse(readFileSync(path, "utf8"));
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error(`${label} fixture does not match its hash-bound extractor output`);
}

function parseArgs(argv) {
  const index = argv.indexOf("--output");
  if (index === -1) return {};
  if (!argv[index + 1]) throw new Error("--output requires a path");
  return { output: resolve(repositoryRoot, argv[index + 1]) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const rendered = `${JSON.stringify(extractK01SourceTileSelector(), null, 2)}\n`;
  if (args.output) writeFileSync(args.output, rendered);
  else process.stdout.write(rendered);
}
