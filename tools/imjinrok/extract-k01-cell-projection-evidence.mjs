#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  extractK01TilePlacementElevationEvidence,
  replayFUN00462b80RuntimeWordTableInitialization,
  reproduceFUN00464cc0Projection,
} from "./extract-k01-tile-placement-elevation-evidence.mjs";
import { parsePeImage } from "./pe-image.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_MAP_PATH = "original/imjinrok2/stagemap/k01.map";
const DEFAULT_FUNCTIONS_PATH = "analysis/generated/imjinrok2/functions.json";
const DEFAULT_REFERENCES_PATH = "analysis/generated/imjinrok2/references.json";
const EXPECTED_EXECUTABLE_SIZE = 843_833;
const EXPECTED_EXECUTABLE_SHA256 = "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
const EXPECTED_MAP_SHA256 = "43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb";
const EXPECTED_MAP_SIZE = 1_097_100;
const EXPECTED_FUNCTIONS_SHA256 = "7e071fdfe425d22447780c265fe1d3fd271a1bedd1773682bebcb8ddc6d2e16e";
const EXPECTED_REFERENCES_SHA256 = "f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5";

const FUNCTION_PROVENANCE = [
  { entry: "0x004648e0", bodyRange: "0x004648e0-0x00464cb2", bodySize: 979, instructionCount: 315, instructionSha256: "e6f8db32835296fb67b09de507b8aef2ddd6dbe6ce359922ed1abf159fb35c5b", rawBodySha256: "e8bba48e9c6925826914eab6f55a038ee275500831e70ec496b1bcc7dfd63112", callees: ["0x00462090", "0x00462300", "0x00462720", "0x004627b0", "0x00463a10", "0x00463a50", "0x004644d0", "0x00464cc0", "0x004663a0", "0x004a1150"] },
  { entry: "0x00464cc0", bodyRange: "0x00464cc0-0x00464ddd", bodySize: 286, instructionCount: 103, instructionSha256: "0df728460a1833f756c0164f3968eda5de7312a64e87c52edc98aa5a33566781", rawBodySha256: "40b41b7ce95c3e7516c0bf2f6d01f1e86bf2848ed0ec5256f63d7858f55a1d10", callees: ["0x0046d650"] },
  { entry: "0x004653d0", bodyRange: "0x004653d0-0x00465502", bodySize: 307, instructionCount: 108, instructionSha256: "43d9b8a99218f2e33f0763cc5e2cf2d7a1a50f0904d02c0939d8d928b4bb9885", rawBodySha256: "be8ebc57dd7773790c1ad63902b5e3e7fe734c5add75ceefe70095f3e75e82d1", callees: ["0x00464cc0"] },
  { entry: "0x00481c50", bodyRange: "0x00481c50-0x00481ed1", bodySize: 642, instructionCount: 199, instructionSha256: "823cf8ad9d1b831c9183293c68646fa1e1641b0f8074fc3559a4f8d2feade5d8", rawBodySha256: "d7c601f3aa90d2154224add77351929121efc63c778b21474478dc26589a46a9", callees: ["0x0043dc10", "0x0043faa0", "0x0043fbe0", "0x004644d0", "0x004648d0", "0x00464cc0", "0x00474ae0", "0x00481900", "0x00482010", "0x00482390", "0x004823a0", "0x004823d0", "0x004ad725", "0x004ad7cd", "0x004adf44"] },
];

const REQUIRED_CALL_EDGES = [
  ["0x00410f7e", "0x00410cc0", "0x00464cc0"],
  ["0x00416749", "0x00416600", "0x00464cc0"],
  ["0x0046491a", "0x004648e0", "0x00464cc0"],
  ["0x0046547b", "0x004653d0", "0x00464cc0"],
  ["0x0047301c", "0x00472f90", "0x00464cc0"],
  ["0x00481e27", "0x00481c50", "0x00464cc0"],
];

const OPCODE_ANCHORS = [
  ["FUN_004648e0 per-cell pointer/call loop", "0x00464901", "8d 1c ad 00 00 00 00 8d 83 c4 33 86 00 8d 8b 84 39 84 00 50 51 55 57 8b ce e8 a1 03 00 00 8b 86 a0 2d 00 00 47 81 c3 d0 02 00 00", "The first pushed pointer is 0x008633c4 + 4*(x*180+y), then 0x00843984 + 4*(x*180+y); FUN_00464cc0 consumes them as outputY then outputX."],
  ["FUN_00464cc0 output parameter stores", "0x00464d1f", "8b 4c 24 20 89 54 24 10 8d 14 33 c1 e0 05 c1 e2 04 89 01 89 55 00", "argument 3 receives outputX and argument 4 receives outputY after the base projection writes."],
  ["FUN_00481c50 row-pointer/call loop", "0x00481e01", "33 c0 0f bf df 8d 04 80 8d 04 c0 8d 04 83 c1 e0 02 8d 88 c4 33 86 00 8d 90 84 39 84 00 51 52 57 56 b9 f0 ff ab 00 e8 94 2e fe ff", "The pointer offset is 4*y because EAX begins at zero; inner x is passed to FUN_00464cc0 but does not index either output pointer."],
  ["FUN_004653d0 projected-coordinate distance comparison", "0x0046546f", "8d 44 24 20 8d 54 24 1c 50 52 57 56 e8 40 f8 ff ff 0f bf 4c 24 30 8b 54 24 1c 8b 5c 24 20 0f bf 44 24 34 2b ca 2b c3 8b e9 0f af c0 0f af e9 8b 4c 24 10 03 c5 3b c1", "It passes local outputX/outputY storage to FUN_00464cc0, then compares the squared distance using both returned coordinates."],
];

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const report = extractK01CellProjectionEvidence(args);
  if (args.outputPath) writeFileSync(args.outputPath, `${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

export function extractK01CellProjectionEvidence({ executablePath = DEFAULT_EXECUTABLE_PATH, mapPath = DEFAULT_MAP_PATH, functionsPath = DEFAULT_FUNCTIONS_PATH, referencesPath = DEFAULT_REFERENCES_PATH } = {}) {
  const executable = readVerified(executablePath, "original executable", EXPECTED_EXECUTABLE_SIZE, EXPECTED_EXECUTABLE_SHA256);
  const map = readVerified(mapPath, "K01 map", EXPECTED_MAP_SIZE, EXPECTED_MAP_SHA256);
  const image = parsePeImage(executable.buffer, executablePath);
  const functions = readVerifiedJson(functionsPath, "static functions", EXPECTED_FUNCTIONS_SHA256);
  const references = readVerifiedJson(referencesPath, "static references", EXPECTED_REFERENCES_SHA256);
  const prior = extractK01TilePlacementElevationEvidence({ executablePath, mapPath, functionsPath, referencesPath });
  const functionProvenance = FUNCTION_PROVENANCE.map((specification) => verifyFunction(functions.parsed.functions, executable.buffer, image, specification));
  const callEdges = REQUIRED_CALL_EDGES.map(([from, fromFunctionEntry, to]) => verifyCallEdge(references.parsed.references, { from, fromFunctionEntry, to }));
  const opcodeAnchors = OPCODE_ANCHORS.map(([label, va, bytes, meaning]) => verifyOpcodeAnchor(executable.buffer, image, { label, va, bytes, meaning }));
  const vector = reproduceK01CellProjectionVector(map.buffer);

  if (prior.map.dimensions.width !== vector.dimensions.width || prior.map.dimensions.height !== vector.dimensions.height) throw new Error("Prior placement evidence dimensions disagree with K01 projection vector");
  if (prior.runtimeWordAdjustmentTable.initialization.indexedWordWrites.map(({ value }) => value).join(",") !== vector.runtimeWords.join(",")) throw new Error("Prior runtime WORD table replay disagrees with K01 projection vector");

  return {
    schemaVersion: 1,
    question: "Do FUN_004648e0 and FUN_00481c50 precompute K01 per-cell projection outputs through FUN_00464cc0, and what exact K01 low-nibble/family/table/outputY joint vector results?",
    analysisStatus: "static-confirmed-for-FUN_004648e0-per-cell-output-writes-FUN_00481c50-row-overwrite-loop-and-bounded-K01-outputY-joint-vector",
    reproductionStatus: "reproduction-complete-for-hash-bound-K01-joint-distribution-output-digest-and-fail-closed-inputs",
    implementationStatus: "no-product-port-in-this-extractor",
    sources: {
      executable: omitBuffer(executable),
      map: omitBuffer(map),
      staticAnalysis: {
        functions: { ...omitBuffer(functions), sourceSha256: functions.parsed.sourceSha256, functionProvenance },
        references: { ...omitBuffer(references), sourceSha256: references.parsed.sourceSha256, callEdges },
      },
      importedCrossCheck: {
        extractor: "extract-k01-tile-placement-elevation-evidence.mjs",
        runtimeWordTableAddress: prior.runtimeWordAdjustmentTable.address,
        runtimeWordTableValues: vector.runtimeWords,
        priorCellStreamSha256: prior.cellStream.sha256,
        priorRawRasterVerticalStreamSha256: prior.cellProjection.K01Distribution.sourceBackedRawRelativeComponent.sha256,
      },
    },
    functionRanges: functionProvenance.map(({ entry, bodyRange, bodySize, instructionCount, instructionSha256, rawBodySha256 }) => ({ entry, bodyRange, bodySize, instructionCount, instructionSha256, rawBodySha256 })),
    outputWriterContracts: {
      FUN_00464cc0: {
        callingConventionEvidence: "ECX is map; four callee-cleaned stack arguments are x, y, outputX pointer, outputY pointer. The callee returns with RET 0x10.",
        outputOrder: ["argument3 -> outputX", "argument4 -> outputY"],
        baseOutput: { outputX: "(int32(x) - int32(y)) << 5", outputY: "(int32(x) + int32(y)) << 4" },
      },
      FUN_004648e0: {
        mapInput: "ECX",
        loopOrder: "y outer (EBP), x inner (EDI)",
        callSite: "0x0046491a",
        outputPointers: {
          outputX: "0x00843984 + 4*(x*180+y)",
          outputY: "0x008633c4 + 4*(x*180+y)",
        },
        conclusion: "For every looped cell, this caller writes distinct x-major per-cell outputX/outputY slots through FUN_00464cc0.",
      },
      FUN_00481c50: {
        mapInput: "ECX = 0x00abfff0",
        loopOrder: "y outer (EDI), x inner (ESI)",
        callSite: "0x00481e27",
        outputPointers: {
          outputX: "0x00843984 + 4*y",
          outputY: "0x008633c4 + 4*y",
        },
        conclusion: "It calls FUN_00464cc0 over the nested cell loop, but its output pointers omit x. Each inner iteration overwrites the same row-indexed pair; this is not a per-cell output table write in the proven code range.",
      },
    },
    consumers: {
      FUN_004653d0: {
        bodyRange: "0x004653d0-0x00465502",
        callSite: "0x0046547b",
        boundedUse: "A bounded nearby-cell loop passes local outputX/outputY pointers to FUN_00464cc0, subtracts both returned coordinates from its input pair, squares both differences, and keeps the least distance candidate.",
        boundary: "This establishes returned projected-coordinate use for the bounded nearest-cell selection path, not a human meaning for the coordinate axes or terrain.",
      },
    },
    outputYJointVector: vector,
    rawCodeAnchors: opcodeAnchors,
    residualBoundary: "The outputY additions are precomputed cell projection/outputY adjustments. The raw raster branch is separately reproduced with the helper-dependent 0/16/32/48/64 shifts; neither stream alone proves gameplay terrain height, elevation, world-axis, or renderer-pivot semantics. Runtime table lifetime/order and alias/computed writers remain outside this unit.",
  };
}

export function reproduceK01CellProjectionVector(mapBuffer) {
  if (!Buffer.isBuffer(mapBuffer) || mapBuffer.length < 0x4a0c4 + 60 * 180) throw new Error("K01 map buffer is too short for cell projection fields");
  const width = mapBuffer.readUInt32LE(0x2da0);
  const height = mapBuffer.readUInt32LE(0x2da4);
  if (width !== 60 || height !== 60) throw new Error(`Expected hash-bound K01 dimensions 60x60, got ${width}x${height}`);
  const runtimeWords = replayFUN00462b80RuntimeWordTableInitialization().indexedWordWrites.map(({ value }) => value);
  const jointCounts = new Map();
  const stream = Buffer.alloc(width * height * 8);
  let ordinal = 0;
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      const offset = x * 180 + y;
      const lowNibble = mapBuffer[0x32514 + offset] & 0x0f;
      const family = mapBuffer[0x4a0c4 + offset];
      if (family >= runtimeWords.length) throw new Error(`K01 family ${family} is outside the 15-entry runtime WORD table at (${x},${y})`);
      const result = reproduceFUN00464cc0Projection(mapBuffer, { x, y, runtimeWord: runtimeWords[family] });
      if (!result.admitted) throw new Error(`Hash-bound K01 cell (${x},${y}) was not admitted by FUN_00464cc0 reference`);
      const outputYBase = (x + y) << 4;
      const outputYAdjustment = result.outputY - outputYBase;
      const outputYBranch = lowNibble === 2 ? "low-nibble-equals-2" : "other-low-nibble";
      const rawRasterVerticalBranch = lowNibble === 2
        ? result.placementLevel << 4
        : (Math.abs(result.placementLevel) + 1) << 4;
      const key = `${lowNibble}/${family}/${runtimeWords[family]}/${result.placementLevel}/${outputYBranch}/${outputYAdjustment}/${rawRasterVerticalBranch}`;
      jointCounts.set(key, (jointCounts.get(key) ?? 0) + 1);
      stream.writeUInt8(lowNibble, ordinal * 8);
      stream.writeUInt8(family, ordinal * 8 + 1);
      stream.writeInt16LE(runtimeWords[family], ordinal * 8 + 2);
      stream.writeInt16LE(result.placementLevel, ordinal * 8 + 4);
      stream.writeInt16LE(outputYAdjustment, ordinal * 8 + 6);
      ordinal += 1;
    }
  }
  const joints = [...jointCounts.entries()].map(([key, count]) => {
    const [lowNibble, family, runtimeWord, helperReturn, outputYBranch, outputYAdjustment, rawRasterVerticalBranch] = key.split("/");
    return { lowNibble: Number(lowNibble), family: Number(family), runtimeWord: Number(runtimeWord), helperReturn: Number(helperReturn), outputYBranch, outputYAdjustment: Number(outputYAdjustment), rawRasterVerticalBranch: Number(rawRasterVerticalBranch), count };
  }).sort((a, b) => a.lowNibble - b.lowNibble || a.family - b.family);
  const lowNibbleFamilyCounts = {};
  for (const { lowNibble, family, count } of joints) {
    const key = `${lowNibble}/${family}`;
    lowNibbleFamilyCounts[key] = (lowNibbleFamilyCounts[key] ?? 0) + count;
  }
  return {
    coordinateOrder: "x-major: ordinal = x * height + y",
    dimensions: { width, height },
    count: ordinal,
    runtimeWords,
    stream: {
      bytesPerCell: 8,
      fieldByteOrder: ["lowNibble", "family", "runtimeWordInt16LE", "helperReturnInt16LE", "outputYAdjustmentInt16LE"],
      sha256: sha256(stream),
    },
    joints,
    lowNibbleFamilyCounts,
    interpretation: "K01's corrected helper stream is retained in the joint vector. The observed outputY adjustment histogram is -48:156, -39:33, -32:41, -23:87, -16:1028, -7:307, 0:309, 9:308, and 16:1331; this precomputed projection stream remains distinct from the raw raster vertical shift stream 0/16/32/48/64.",
  };
}

function verifyFunction(functions, executableBuffer, image, specification) {
  const record = functions.find(({ entry }) => entry === specification.entry);
  if (!record || record.bodySize !== specification.bodySize || record.instructionCount !== specification.instructionCount || record.instructionSha256 !== specification.instructionSha256 || !sameArray(record.bodyRanges, [specification.bodyRange]) || !sameArray(record.callees, specification.callees)) throw new Error(`Static function provenance mismatch for ${specification.entry}`);
  const rawOffset = image.vaToRawOffset(Number.parseInt(specification.entry, 16));
  if (rawOffset === undefined) throw new Error(`Function ${specification.entry} is outside mapped PE sections`);
  const rawBodySha256 = sha256(executableBuffer.subarray(rawOffset, rawOffset + specification.bodySize));
  if (rawBodySha256 !== specification.rawBodySha256) throw new Error(`Raw function body SHA-256 mismatch for ${specification.entry}`);
  return { entry: specification.entry, bodyRange: specification.bodyRange, bodySize: specification.bodySize, instructionCount: specification.instructionCount, instructionSha256: specification.instructionSha256, rawBodySha256 };
}

function verifyCallEdge(references, expected) {
  const matches = references.filter((reference) => reference.from === expected.from && reference.fromFunctionEntry === expected.fromFunctionEntry && reference.to === expected.to && reference.type === "UNCONDITIONAL_CALL");
  if (matches.length !== 1) throw new Error(`Expected exactly one unconditional call ${expected.fromFunctionEntry}:${expected.from}->${expected.to}, got ${matches.length}`);
  const reference = matches[0];
  if (reference.source !== "DEFAULT" || reference.operandIndex !== 0 || reference.primary !== true || reference.fromBlock !== ".text" || reference.toBlock !== ".text") throw new Error(`Static call provenance mismatch at ${expected.from}`);
  return { from: reference.from, fromFunctionEntry: reference.fromFunctionEntry, to: reference.to, type: reference.type };
}

function verifyOpcodeAnchor(buffer, image, specification) {
  const rawOffset = image.vaToRawOffset(Number.parseInt(specification.va, 16));
  if (rawOffset === undefined) throw new Error(`Opcode anchor ${specification.va} is outside mapped PE sections`);
  const expected = Buffer.from(specification.bytes.replaceAll(" ", ""), "hex");
  if (!buffer.subarray(rawOffset, rawOffset + expected.length).equals(expected)) throw new Error(`Opcode anchor mismatch for ${specification.label} at ${specification.va}`);
  return { label: specification.label, va: specification.va, bytes: specification.bytes, meaning: specification.meaning };
}

function readVerified(path, label, expectedSize, expectedSha256) {
  const buffer = readFileSync(path);
  if (buffer.length !== expectedSize) throw new Error(`${label} size mismatch: expected ${expectedSize}, got ${buffer.length}`);
  const actualSha256 = sha256(buffer);
  if (actualSha256 !== expectedSha256) throw new Error(`${label} SHA-256 mismatch: expected ${expectedSha256}, got ${actualSha256}`);
  return { path, size: buffer.length, sha256: actualSha256, buffer };
}

function readVerifiedJson(path, label, expectedSha256) {
  const buffer = readFileSync(path);
  const actualSha256 = sha256(buffer);
  if (actualSha256 !== expectedSha256) throw new Error(`${label} SHA-256 mismatch: expected ${expectedSha256}, got ${actualSha256}`);
  let parsed;
  try { parsed = JSON.parse(buffer.toString("utf8")); } catch (error) { throw new Error(`Could not parse ${label}: ${error.message}`); }
  if (parsed.sourceSha256 !== EXPECTED_EXECUTABLE_SHA256) throw new Error(`${label} source SHA-256 mismatch: expected ${EXPECTED_EXECUTABLE_SHA256}, got ${parsed.sourceSha256}`);
  return { path, size: buffer.length, sha256: actualSha256, buffer, parsed };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!["--executable", "--map", "--functions", "--references", "--output"].includes(argument)) throw new Error(`Unknown argument: ${argument}`);
    const value = argv[index + 1];
    if (!value) throw new Error(`${argument} requires a path`);
    args[{ "--executable": "executablePath", "--map": "mapPath", "--functions": "functionsPath", "--references": "referencesPath", "--output": "outputPath" }[argument]] = value;
    index += 1;
  }
  return args;
}

function omitBuffer({ buffer, parsed, ...value }) { return value; }
function sameArray(actual, expected) { return Array.isArray(actual) && actual.length === expected.length && actual.every((value, index) => value === expected[index]); }
function sha256(buffer) { return createHash("sha256").update(buffer).digest("hex"); }
