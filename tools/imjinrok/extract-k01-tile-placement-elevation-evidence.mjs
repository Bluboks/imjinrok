#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractK01SourceTileSelector } from "./extract-k01-source-tile-selector.mjs";
import { parseMapHeader } from "./map-codec.mjs";
import { readPeImage, toHex } from "./pe-image.mjs";
import { assertEqual, readVaRange, sha256, verifyEvidencePoint, verifyRawCodeRange } from "./static-evidence.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_ORIGINAL_ROOT = resolve(repositoryRoot, "original/imjinrok2");
const DEFAULT_EXECUTABLE_PATH = resolve(DEFAULT_ORIGINAL_ROOT, "imjinrok2.exe");
const DEFAULT_MAP_PATH = resolve(DEFAULT_ORIGINAL_ROOT, "stagemap/k01.map");
const DEFAULT_FUNCTIONS_PATH = resolve(repositoryRoot, "analysis/generated/imjinrok2/functions.json");
const DEFAULT_REFERENCES_PATH = resolve(repositoryRoot, "analysis/generated/imjinrok2/references.json");

const EXPECTED_EXECUTABLE_SHA256 = "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
const EXPECTED_EXECUTABLE_SIZE = 843_833;
const EXPECTED_K01_MAP_SHA256 = "43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb";
const EXPECTED_K01_MAP_SIZE = 1_097_100;
const EXPECTED_FUNCTIONS_SHA256 = "7e071fdfe425d22447780c265fe1d3fd271a1bedd1773682bebcb8ddc6d2e16e";
const EXPECTED_REFERENCES_SHA256 = "f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5";

const X_STRIDE = 180;
const LOW_NIBBLE_OFFSET = 0x32514;
const OBJECT_OFFSET = 0x3a3a4;
const FRAME_OFFSET = 0x42234;
const PLACEMENT_SELECTOR_OFFSET = 0x79824;
const PLACEMENT_LOOKUP_OFFSET = 0x147d5;
const PLACEMENT_SELECTOR_STRIDE = 0x1fa4;

const RAW_CODE_RANGES = [
  ["FUN_00469330 complete body", 0x00469330, 0x0046950c, "f1a131328d7fe0c85e26b90d4c7d28371f6f9ae41bd56f03dab68c9ab8510ec7"],
  ["FUN_00469510 complete body", 0x00469510, 0x00469917, "1d05579e1c2179989bd1441cb54510de8df4ecb24157dac496fda7f3c6c8f9ce"],
  ["FUN_0046d650 complete body", 0x0046d650, 0x0046d6d8, "bb8e887ed7cd73e5f881f75c033532c60aa7a9f66c5dd755f9e1a05cc12b7e8a"],
].map(([id, start, endExclusive, digest]) => ({ id, start, endExclusive, sha256: digest }));

const EVIDENCE_POINTS = [
  [0x00469351, "8b 8e a0 2d 00 00 0f bf c7 3b c1 7d 47 66 85 ed 7c 42 8b 96 a4 2d 00 00 0f bf cd 3b ca 7d 35", "FUN_00469330 signed x/y bounds against map +0x2da0/+0x2da4"],
  [0x00469370, "8d 84 80 5d 16 00 00 8d 14 c0 8d 04 91 8a 0c 30 80 e1 0f 66 0f be c1 66 3d 02 00", "FUN_00469330 reads low nibble at map +0x32514+x*180+y and compares exactly 2"],
  [0x0046938d, "55 57 8b ce e8 ba 42 00 00 8b 5c 24 28 c1 e0 04 2b d8", "FUN_00469330 true branch calls helper(map,x,y) then subtracts helper<<4 from argument 2"],
  [0x004693a5, "55 57 8b ce e8 a2 42 00 00 0f bf c0 99 33 c2 2b c2 40 c1 e0 04", "FUN_00469330 other branch subtracts (abs(int16(helper))+1)<<4 from argument 2"],
  [0x0046952c, "66 85 ff 89 44 24 38 7c 52 8b 8e a0 2d 00 00 0f bf c7 3b c1 7d 45 66 85 ed 7c 40 8b 96 a4 2d 00 00 0f bf cd", "FUN_00469510 signed x/y bounds before the low-nibble decision"],
  [0x00469554, "8d 84 80 5d 16 00 00 8d 14 c0 8d 04 91 8a 0c 30 80 e1 0f 66 0f be c1 66 3d 02 00", "FUN_00469510 reads low nibble at map +0x32514+x*180+y and compares exactly 2"],
  [0x00469571, "55 57 8b ce e8 d6 40 00 00 c1 e0 04 8b d0 8b 44 24 3c 2b c2", "FUN_00469510 true branch calls helper(map,x,y) then subtracts helper<<4 from argument 2"],
  [0x00469587, "55 57 8b ce e8 c0 40 00 00 0f bf c0 99 33 c2 2b c2 40 c1 e0 04", "FUN_00469510 other branch subtracts (abs(int16(helper))+1)<<4 from argument 2"],
  [0x004695ab, "8d 84 9b e1 19 00 00 0f bf cd 8d 14 c0 89 4c 24 18 8d 04 91 66 0f b6 14 30", "FUN_00469510 object byte at map +0x3a3a4+x*180+y"],
  [0x004695c4, "8d 84 9b 65 1d 00 00 0f bf fa 8d 04 c0", "FUN_00469510 frame byte address begins at map +0x42234+x*180+y"],
  [0x004695e2, "66 0f b6 04 31 8d 34 7f", "FUN_00469510 reads the unsigned frame byte and scales the selected loader record"],
  [0x0046d650, "66 8b 44 24 04 53 66 85 c0 57 7c 20 0f bf d0 3b 91 a0 2d 00 00 7d 15 66 8b 44 24 10 66 85 c0 7c 0b 0f bf f8 3b b9 a4 2d 00 00 7c 09", "FUN_0046d650 reads signed-word x from stack argument 1 and y from argument 2, returning -1 outside map bounds"],
  [0x0046d685, "8d 84 92 01 36 00 00 56 8d 04 c0 8d 04 87 8a 1c 08", "FUN_0046d650 reads uint8 selector at map +0x79824+x*180+y"],
  [0x0046d696, "8b c3 25 ff 00 00 00 8d 34 80 8d 34 f6 8d 94 b2 49 07 00 00 5e 8d 14 92 8d 14 d2 8d 14 97 8a 0c 0a", "FUN_0046d650 uses selector*0x1fa4 for lookup at map +0x147d5+selector*0x1fa4+x*180+y"],
  [0x0046d6b7, "80 f9 0f 75 0a 66 33 c0 5f 8a c3 5b c2 08 00 84 c9 74 06 5f 48 5b c2 08 00", "FUN_0046d650 returns selector for lookup 15, selector-1 for other nonzero lookup, otherwise 0"],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

const FUNCTION_SPECS = [
  { entry: "0x00469330", bodyRange: "0x00469330-0x0046950b", bodySize: 476, instructionCount: 150, instructionSha256: "f94f79c8a00da772f524665f0df56ba09b9bea8a861bd67d99fec4c7b30ec099", callees: ["0x0044af50", "0x0044afa0", "0x00454390", "0x0046d650"] },
  { entry: "0x00469510", bodyRange: "0x00469510-0x00469916", bodySize: 1031, instructionCount: 341, instructionSha256: "28849833f557b0f4863c88318828d72b8039639450bd42b5623927dd8ef036e3", callees: ["0x0044af50", "0x0044afa0", "0x00454250", "0x004542e0", "0x004547c0", "0x00454960", "0x0046d650"] },
  { entry: "0x0046d650", bodyRange: "0x0046d650-0x0046d6d7", bodySize: 136, instructionCount: 50, instructionSha256: "c0ee5121eb2700198c121447334f0b7572d28dce08e9e971020293233036d385", callees: [] },
];

const REQUIRED_CALL_EDGES = [
  ["0x00469391", "0x00469330"], ["0x004693a9", "0x00469330"], ["0x00469575", "0x00469510"], ["0x0046958b", "0x00469510"],
];

export function extractK01TilePlacementElevationEvidence({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  mapPath = DEFAULT_MAP_PATH,
  functionsPath = DEFAULT_FUNCTIONS_PATH,
  referencesPath = DEFAULT_REFERENCES_PATH,
  originalRoot = DEFAULT_ORIGINAL_ROOT,
} = {}) {
  const { buffer: executable, image } = readPeImage(executablePath);
  assertEqual(executable.length, EXPECTED_EXECUTABLE_SIZE, `${executablePath} size`);
  assertEqual(sha256(executable), EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);
  const map = readFileSync(mapPath);
  assertEqual(map.length, EXPECTED_K01_MAP_SIZE, `${mapPath} size`);
  assertEqual(sha256(map), EXPECTED_K01_MAP_SHA256, `${mapPath} SHA-256`);
  const header = parseMapHeader(map, mapPath);
  assertEqual(header.width, 60, "K01 width at map +0x2da0");
  assertEqual(header.height, 60, "K01 height at map +0x2da4");

  const staticAnalysis = verifyStaticAnalysis({ executable, image, functionsPath, referencesPath });
  const sourceSelector = extractK01SourceTileSelector({ executablePath, mapPath, originalRoot });
  const cells = collectCells(map, header);
  const lowNibbleCounts = countBy(cells, "lowNibble");
  const selectorCounts = countBy(cells, "placementSelector");
  const lookupCounts = countBy(cells, "placementLookup");
  const helperReturnCounts = countBy(cells, "placementLevel");
  const branchCounts = countBy(cells, "placementBranch");
  const shiftCounts = countBy(cells, "verticalShift");

  return {
    question: "For hash-bound K01 cells, how do FUN_00469330/FUN_00469510 and FUN_0046d650 derive the second placement coordinate and source object/frame bytes?",
    analysisStatus: "static-confirmed-for-K01-cell-placement-offset-and-source-object-frame-boundary",
    reproductionStatus: "reproduction-complete-for-all-K01-cell-vectors-and-fail-closed-reference-inputs",
    implementationStatus: "analysis-only-no-product-renderer-change",
    sources: {
      executable: sourceDescriptor(executablePath, executable),
      map: sourceDescriptor(mapPath, map),
      staticAnalysis,
      sourceTileSelector: {
        fixture: "analysis/fixtures/k01-source-tile-selector.json",
        pairStream: sourceSelector.pairStream,
        usedObjectCount: sourceSelector.objects.length,
        allK01ObjectFramesWithinValidatedSourceHeaders: sourceSelector.objects.every((object) => object.frameRange.max < object.frameCount),
      },
    },
    map: {
      dimensions: { width: header.width, height: header.height },
      coordinateContract: "x and y are signed 16-bit stack arguments; valid K01 cells are 0 <= x < width and 0 <= y < height.",
      storageOrder: "x-major address calculation: x * 180 + y",
      fields: {
        lowNibble: "uint8(map + 0x32514 + x * 180 + y) & 0x0f",
        placementSelector: "uint8(map + 0x79824 + x * 180 + y)",
        placementLookup: "uint8(map + 0x147d5 + placementSelector * 0x1fa4 + x * 180 + y)",
        objectIndex: "uint8(map + 0x3a3a4 + x * 180 + y)",
        frameIndex: "uint8(map + 0x42234 + x * 180 + y)",
      },
    },
    placement: {
      helper: {
        function: "FUN_0046d650",
        returnRule: "out-of-bounds => int16(-1); lookup == 15 => uint8(selector); lookup != 0 => int16(uint8(selector) - 1); otherwise => 0",
        neutralName: "placement-level selector",
        K01Distribution: { placementSelector: selectorCounts, placementLookup: lookupCounts, placementLevel: helperReturnCounts },
      },
      lowNibbleBranch: {
        trueCondition: "in-bounds && lowNibble == 2",
        trueAdjustment: "verticalArgument2 - (int16(helperReturn) << 4)",
        otherAdjustment: "verticalArgument2 - ((abs(int16(helperReturn)) + 1) << 4)",
        K01Distribution: { lowNibble: lowNibbleCounts, branch: branchCounts, verticalShift: shiftCounts },
      },
      functionLocalFixedSubtract: {
        FUN_00469330: "argument1 - 31 (0x1f)",
        FUN_00469510: "argument1 - 32 (0x20)",
        boundary: "The raw argument names and screen/world axis meaning are not assigned by this evidence.",
      },
      syntheticHelperBranchVectors: [
        { selector: 4, lookup: 15, result: 4 },
        { selector: 4, lookup: 1, result: 3 },
        { selector: 0, lookup: 1, result: -1 },
        { selector: 4, lookup: 0, result: 0 },
        { selector: 4, lookup: null, result: -1, boundary: "out-of-bounds helper return" },
      ],
    },
    cellStream: summarizeCells(cells, header),
    representativeCells: [[0, 0], [0, 1], [0, 59], [59, 0], [59, 59]].map(([x, y]) => cells.find((cell) => cell.x === x && cell.y === y)),
    rawCodeRanges: RAW_CODE_RANGES.map((range) => verifyRawCodeRange(executable, image, range)),
    evidencePoints: EVIDENCE_POINTS.map((point) => verifyEvidencePoint(executable, image, point)),
    unresolvedBoundary: "K01's 3,600 helper lookups are all zero, so this evidence does not justify calling the helper terrain elevation or height. It does not establish screen/world axis semantics, pixel anchor/pivot, human terrain/passability/fog meaning, other map/theme behavior, or product renderer parity.",
  };
}

export function reproduceK01PlacementHelper(mapBuffer, x, y) {
  assertMapBuffer(mapBuffer);
  assertSignedWord(x, "x");
  assertSignedWord(y, "y");
  const header = parseMapHeader(mapBuffer, "K01 map buffer");
  if (!isInBounds(header, x, y)) return -1;
  const storageOffset = x * X_STRIDE + y;
  const selector = mapBuffer[PLACEMENT_SELECTOR_OFFSET + storageOffset];
  const lookup = mapBuffer[PLACEMENT_LOOKUP_OFFSET + selector * PLACEMENT_SELECTOR_STRIDE + storageOffset];
  return reproducePlacementLevel(selector, lookup);
}

export function reproducePlacementLevel(selector, lookup) {
  assertUint8(selector, "selector");
  if (lookup === null) return -1;
  assertUint8(lookup, "lookup");
  if (lookup === 15) return selector;
  if (lookup !== 0) return selector - 1;
  return 0;
}

export function reproduceFUN00469510Placement(mapBuffer, { argument1, verticalArgument2, x, y } = {}) {
  assertMapBuffer(mapBuffer);
  assertSignedInt32(argument1, "argument1");
  assertSignedInt32(verticalArgument2, "verticalArgument2");
  assertSignedWord(x, "x");
  assertSignedWord(y, "y");
  const header = parseMapHeader(mapBuffer, "K01 map buffer");
  if (!isInBounds(header, x, y)) {
    throw new RangeError(`FUN_00469510 source object/frame access is unsafe outside map bounds: ${x},${y}`);
  }
  const storageOffset = x * X_STRIDE + y;
  const lowNibble = mapBuffer[LOW_NIBBLE_OFFSET + storageOffset] & 0x0f;
  const placementLevel = reproduceK01PlacementHelper(mapBuffer, x, y);
  const placementBranch = lowNibble === 2 ? "low-nibble-equals-2" : "other-low-nibble";
  const verticalShift = placementBranch === "low-nibble-equals-2" ? placementLevel << 4 : (Math.abs(placementLevel) + 1) << 4;
  return {
    x,
    y,
    storageOffset,
    lowNibble,
    placementSelector: mapBuffer[PLACEMENT_SELECTOR_OFFSET + storageOffset],
    placementLookup: mapBuffer[PLACEMENT_LOOKUP_OFFSET + mapBuffer[PLACEMENT_SELECTOR_OFFSET + storageOffset] * PLACEMENT_SELECTOR_STRIDE + storageOffset],
    placementLevel,
    placementBranch,
    verticalShift,
    argument1AfterFixedSubtract: (argument1 - 32) | 0,
    adjustedVerticalArgument2: (verticalArgument2 - verticalShift) | 0,
    objectIndex: mapBuffer[OBJECT_OFFSET + storageOffset],
    frameIndex: mapBuffer[FRAME_OFFSET + storageOffset],
  };
}

function collectCells(map, header) {
  const cells = [];
  for (let x = 0; x < header.width; x += 1) {
    for (let y = 0; y < header.height; y += 1) {
      const placement = reproduceFUN00469510Placement(map, { argument1: 0, verticalArgument2: 0, x, y });
      const { argument1AfterFixedSubtract, adjustedVerticalArgument2, ...cell } = placement;
      cells.push(cell);
    }
  }
  return cells;
}

function summarizeCells(cells, header) {
  const bytes = Buffer.from(cells.flatMap((cell) => [
    cell.lowNibble,
    cell.placementSelector,
    cell.placementLookup,
    cell.placementLevel & 0xff,
    cell.placementBranch === "low-nibble-equals-2" ? 1 : 0,
    cell.verticalShift,
    cell.objectIndex,
    cell.frameIndex,
  ]));
  return {
    coordinateOrder: "x-major: ordinal = x * height + y",
    count: cells.length,
    bytesPerCell: 8,
    sha256: sha256(bytes),
    fieldByteOrder: ["lowNibble", "placementSelector", "placementLookup", "placementLevelInt16LowByte", "lowNibbleEquals2", "verticalShift", "objectIndex", "frameIndex"],
    dimensions: { width: header.width, height: header.height },
  };
}

function verifyStaticAnalysis({ executable, image, functionsPath, referencesPath }) {
  const functionsSource = readVerifiedJson(functionsPath, "static functions", EXPECTED_FUNCTIONS_SHA256);
  const referencesSource = readVerifiedJson(referencesPath, "static references", EXPECTED_REFERENCES_SHA256);
  const functions = functionsSource.parsed.functions;
  const references = referencesSource.parsed.references;
  if (!Array.isArray(functions) || !Array.isArray(references)) throw new Error("Static analysis payload lacks functions or references arrays");
  const functionProvenance = FUNCTION_SPECS.map((specification) => {
    const record = functions.find((candidate) => candidate.entry === specification.entry);
    if (!record || record.bodySize !== specification.bodySize || record.instructionCount !== specification.instructionCount || record.instructionSha256 !== specification.instructionSha256 || JSON.stringify(record.bodyRanges) !== JSON.stringify([specification.bodyRange]) || JSON.stringify(record.callees) !== JSON.stringify(specification.callees)) {
      throw new Error(`Static function provenance mismatch for ${specification.entry}`);
    }
    const start = Number.parseInt(specification.entry, 16);
    const endExclusive = start + specification.bodySize;
    return { entry: specification.entry, bodyRange: specification.bodyRange, instructionCount: specification.instructionCount, instructionSha256: specification.instructionSha256, rawBodySha256: sha256(readVaRange(executable, image, start, endExclusive)), callees: record.callees };
  });
  const requiredCallEdges = REQUIRED_CALL_EDGES.map(([from, fromFunctionEntry]) => {
    const matches = references.filter((reference) => reference.from === from && reference.fromFunctionEntry === fromFunctionEntry && reference.to === "0x0046d650" && reference.type === "UNCONDITIONAL_CALL");
    if (matches.length !== 1) throw new Error(`Expected exactly one helper call edge ${fromFunctionEntry}:${from}->0x0046d650, got ${matches.length}`);
    const reference = matches[0];
    if (reference.source !== "DEFAULT" || reference.operandIndex !== 0 || reference.primary !== true || reference.fromBlock !== ".text" || reference.toBlock !== ".text") throw new Error(`Static call provenance mismatch at ${from}`);
    return { from, fromFunctionEntry, to: "0x0046d650", type: "UNCONDITIONAL_CALL" };
  });
  return {
    functions: { ...sourceDescriptor(functionsPath, functionsSource.buffer), sourceSha256: functionsSource.parsed.sourceSha256, functionProvenance },
    references: { ...sourceDescriptor(referencesPath, referencesSource.buffer), sourceSha256: referencesSource.parsed.sourceSha256, requiredCallEdges },
  };
}

function readVerifiedJson(path, label, expectedSha256) {
  const buffer = readFileSync(path);
  assertEqual(sha256(buffer), expectedSha256, `${label} SHA-256`);
  let parsed;
  try {
    parsed = JSON.parse(buffer.toString("utf8"));
  } catch (error) {
    throw new Error(`Could not parse ${label}: ${error.message}`, { cause: error });
  }
  assertEqual(parsed.sourceSha256, EXPECTED_EXECUTABLE_SHA256, `${label} source SHA-256`);
  return { buffer, parsed };
}

function sourceDescriptor(path, buffer) {
  return { path: relative(repositoryRoot, path), size: buffer.length, sha256: sha256(buffer) };
}

function countBy(cells, key) {
  const counts = new Map();
  for (const cell of cells) counts.set(cell[key], (counts.get(cell[key]) ?? 0) + 1);
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => Number(left) - Number(right)).map(([value, count]) => [String(value), count]));
}

function assertMapBuffer(mapBuffer) {
  if (!Buffer.isBuffer(mapBuffer)) throw new TypeError("mapBuffer must be a Buffer");
  if (mapBuffer.length < FRAME_OFFSET + X_STRIDE * 60) throw new RangeError("mapBuffer is too short for K01 placement/object/frame fields");
}

function assertSignedWord(value, label) {
  if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) throw new TypeError(`${label} must be a signed 16-bit integer`);
}

function assertSignedInt32(value, label) {
  if (!Number.isInteger(value) || value < -0x80000000 || value > 0x7fffffff) throw new TypeError(`${label} must be a signed 32-bit integer`);
}

function assertUint8(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) throw new TypeError(`${label} must be an unsigned byte`);
}

function isInBounds(header, x, y) {
  return x >= 0 && x < header.width && y >= 0 && y < header.height;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const option = { "--executable": "executablePath", "--map": "mapPath", "--functions": "functionsPath", "--references": "referencesPath", "--original-root": "originalRoot", "--output": "output" }[argument];
    if (!option) throw new Error(`Unknown argument: ${argument}`);
    const value = argv[index + 1];
    if (!value) throw new Error(`${argument} requires a path`);
    args[option] = resolve(repositoryRoot, value);
    index += 1;
  }
  return args;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const { output, ...extractorArgs } = args;
  const rendered = `${JSON.stringify(extractK01TilePlacementElevationEvidence(extractorArgs), null, 2)}\n`;
  if (output) writeFileSync(output, rendered);
  else process.stdout.write(rendered);
}
