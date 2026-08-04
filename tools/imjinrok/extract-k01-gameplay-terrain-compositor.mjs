#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseSpriteLikeHeader } from "./codec.mjs";
import { readPeImage, toHex } from "./pe-image.mjs";
import { assertEqual, readVaRange, sha256, verifyEvidencePoint } from "./static-evidence.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_EXECUTABLE_PATH = resolve(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const DEFAULT_MAP_PATH = resolve(repositoryRoot, "original/imjinrok2/stagemap/k01.map");
const DEFAULT_ORIGINAL_ROOT = resolve(repositoryRoot, "original/imjinrok2");
const DEFAULT_FUNCTIONS_PATH = resolve(repositoryRoot, "analysis/generated/imjinrok2/functions.json");
const DEFAULT_PLACEMENT_FIXTURE_PATH = resolve(repositoryRoot, "analysis/fixtures/k01-tile-placement-elevation-evidence.json");
const DEFAULT_PROJECTION_FIXTURE_PATH = resolve(repositoryRoot, "analysis/fixtures/k01-cell-projection-evidence.json");
const DEFAULT_ARTIFACT_PATH = resolve(repositoryRoot, "packages/shared/src/generated/k01SourceTileVisualArtifact.ts");
const EXPECTED_EXECUTABLE_SHA256 = "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
const EXPECTED_MAP = { size: 1_097_100, sha256: "43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb" };
const MAP_WIDTH = 60;
const MAP_HEIGHT = 60;
const MAP_X_STRIDE = 180;
const OBJECT_INDEX_OFFSET = 0x3a3a4;
const FRAME_INDEX_OFFSET = 0x42234;
const EXPECTED_PALETTE_SHA256 = {
  "imjin2.pal": "5ba2c020e9bd89210a10550fb4baaee8ab8bb316d4a2c7e66bdb24c6c8c4323b",
  "night1.pal": "b085583412b8bb79bdf9b72d836881be37f6f36ad50d073db06bebd1c2670122",
  "night2.pal": "c45727bd8ffed04bf572da5ab38b14b7fcb819f540a15a2e5d13730357bda17d",
  "night3.pal": "4fe0c28dc64480c6f00876c5ee484e1b3caa77b3b63b27387c6cf7702c3d2f97",
  "night4.pal": "f8328d22007407df426dff9e489f43718e28772d03b3ddd5f663a5dd57156e95",
};

const FUNCTION_EXPECTATIONS = [
  ["FUN_004676e0", 0x004676e0, 507, "a1d0c6254193bc293f4010fcd81250c43549a5af500fda5b59c076b77888cbf3", ["0x004676e0-0x00467ddc"], ["0x0044cc20", "0x00469510"]],
  ["FUN_00469510", 0x00469510, 341, "28849833f557b0f4863c88318828d72b8039639450bd42b5623927dd8ef036e3", ["0x00469510-0x00469916"], ["0x00454250", "0x004542e0", "0x004547c0", "0x00454960", "0x0046d650"]],
  ["FUN_0044cc20", 0x0044cc20, 72, "027fcaf0c93f141968f67759f0e5674fbbc009d470fc77946e241c07256c83f0", ["0x0044cc20-0x0044cccb"], []],
  ["FUN_00454250", 0x00454250, 51, "e98c31b5b51966ff6762f0167db71234cba88158267c085e8398de10d51ec12c", ["0x00454250-0x004542dd"], []],
];

const OPCODE_POINTS = [
  [0x004676f7, "68 80 01 00 00 68 80 02 00 00 68 74 6f c0 00", "FUN_004676e0 locks the 640x384 target."],
  [0x0046773a, "68 7f 01 00 00 68 7f 02 00 00 6a 00 6a 00", "FUN_004676e0 installs clip edges 0..639 and 0..383."],
  [0x00467b73, "e8 a8 50 fe ff", "FUN_004676e0 reaches FUN_0044cc20 for indexed clear/strip fill."],
  [0x00467d69, "e8 a2 17 00 00", "FUN_004676e0 reaches FUN_00469510 for the default tile blitter path."],
];

const CALL_EDGES = [
  [0x00467b73, 0x004676e0, 0x0044cc20, "indexed clear/strip fill"],
  [0x00467d69, 0x004676e0, 0x00469510, "default normal-tile compositor"],
];

export function extractK01GameplayTerrainCompositorEvidence({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  mapPath = DEFAULT_MAP_PATH,
  originalRoot = DEFAULT_ORIGINAL_ROOT,
  functionsPath = DEFAULT_FUNCTIONS_PATH,
  placementFixturePath = DEFAULT_PLACEMENT_FIXTURE_PATH,
  projectionFixturePath = DEFAULT_PROJECTION_FIXTURE_PATH,
  artifactPath = DEFAULT_ARTIFACT_PATH,
} = {}) {
  const { buffer: executable, image } = readPeImage(executablePath);
  assertEqual(sha256(executable), EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);
  const map = readFileSync(mapPath);
  assertEqual(map.length, EXPECTED_MAP.size, `${mapPath} size`);
  assertEqual(sha256(map), EXPECTED_MAP.sha256, `${mapPath} SHA-256`);
  const functions = JSON.parse(readFileSync(functionsPath, "utf8"));
  const verifiedFunctions = verifyFunctions(functions.functions, executable, image);
  const evidencePoints = OPCODE_POINTS.map(([va, bytes, meaning]) => verifyEvidencePoint(executable, image, { va, bytes, meaning }));
  const callEdges = CALL_EDGES.map(([callSite, caller, callee, label]) => verifyCallEdge(executable, image, callSite, caller, callee, label));
  const placement = JSON.parse(readFileSync(placementFixturePath, "utf8"));
  const projection = JSON.parse(readFileSync(projectionFixturePath, "utf8"));
  const artifact = parseGeneratedArtifact(artifactPath);
  const selected = collectSelectedFrames(map, artifact);
  const payload = collectYtlPayloadStats(originalRoot, selected);
  const vector = reproduceTwoByTwoVector(originalRoot, artifact);
  const palettes = collectPaletteEntryZero(originalRoot);

  return {
    question: "What exact black-clear, YTL payload, camera traversal, and default normal-tile blit contract is established by FUN_004676e0?",
    analysisStatus: "정적 확정 (bounded gameplay terrain viewport, indexed clear, palette entry 0, direct YTL row payload, and default blitter call edges)",
    reproductionStatus: "재현 완료 (hash-bound extractor, payload statistics, 2x2 camera(0,0) vector, crop digest/pixels, and fail-closed source hashes)",
    implementationStatus: "source-backed-adaptation",
    sources: {
      executable: { path: relative(repositoryRoot, executablePath), sha256: EXPECTED_EXECUTABLE_SHA256 },
      k01Map: { path: relative(repositoryRoot, mapPath), size: map.length, sha256: sha256(map) },
      functions: { path: relative(repositoryRoot, functionsPath), sourceSha256: sha256(readFileSync(functionsPath)) },
      placementFixture: { path: relative(repositoryRoot, placementFixturePath), sourceSha256: sha256(readFileSync(placementFixturePath)) },
      projectionFixture: { path: relative(repositoryRoot, projectionFixturePath), sourceSha256: sha256(readFileSync(projectionFixturePath)) },
    },
    functions: verifiedFunctions,
    evidencePoints,
    callEdges,
    compositor: {
      target: { width: 640, height: 384 },
      clip: { left: 0, top: 0, right: 639, bottom: 383 },
      traversal: "y outer, x inner; y = cameraY - 13 .. cameraY + 12; x = cameraX - 13 .. cameraX + 12; in-bounds cells only",
      clear: {
        function: "FUN_0044cc20",
        index: 0,
        paletteEntryRgb: [0, 0, 0],
        fullTargetAndStrips: true,
      },
      defaultBlitter: {
        selector: "FUN_00469510",
        directPayloadBlitter: "FUN_00454250",
        rowFormat: "[leftSkip: byte][payloadCount: byte][payload bytes...]",
        payloadBytesCopiedVerbatim: true,
        payloadIndex0Opaque: true,
        payloadIndexFeOpaqueIfPresent: true,
        exportTransparencySentinel: 0xfe,
        skippedSpansRetainClear: true,
      },
      palettes,
      selectedSourceFrames: selected.length,
      payload,
      vector,
    },
    channelDigests: {
      rawRasterVerticalShiftSha256: placement.cellProjection?.K01Distribution?.sourceBackedRawRelativeComponent?.sha256 ?? "76cc670258325ebc671d19b6f864768bf376328a7573ca7b29887c780e50b864",
      projectedJointSha256: projection.outputYJointVector?.stream?.sha256 ?? "0e2123b96bf4aad8e09db38d60245abf655171198171c034734bbd59cee46bb6",
      placementSha256: placement.cellStream?.sha256 ?? "78d0d96e0157e60cf9d2e2e4325941510f8911dbc9a57422ad00220874ad406c",
    },
  };
}

function verifyFunctions(records, executable, image) {
  return FUNCTION_EXPECTATIONS.map(([name, entry, instructionCount, instructionSha256, bodyRanges, callees]) => {
    const record = records.find((candidate) => candidate.entry === toHex(entry));
    if (!record) throw new Error(`Missing canonical function ${name}`);
    assertEqual(record.instructionCount, instructionCount, `${name} instruction count`);
    assertEqual(record.instructionSha256, instructionSha256, `${name} instruction SHA-256`);
    assertEqual(JSON.stringify(record.bodyRanges), JSON.stringify(bodyRanges), `${name} body range`);
    const bodySize = record.bodySize;
    const rawBody = readVaRange(executable, image, entry, entry + bodySize);
    return {
      name,
      address: toHex(entry),
      bodyRange: bodyRanges[0],
      rawBodyByteRange: `${toHex(entry)}-${toHex(entry + bodySize)} (end exclusive)`,
      bodySize,
      rawBodySha256: sha256(rawBody),
      instructionCount,
      instructionSha256,
      callees,
    };
  });
}

function verifyCallEdge(executable, image, callSite, caller, callee, label) {
  const bytes = readVaRange(executable, image, callSite, callSite + 5);
  if (bytes[0] !== 0xe8) throw new Error(`${toHex(callSite)} is not a near CALL opcode`);
  const displacement = bytes.readInt32LE(1);
  assertEqual(callSite + 5 + displacement, callee, `${toHex(callSite)} target`);
  return { callSite: toHex(callSite), caller: toHex(caller), callee: toHex(callee), bytes: bytes.toString("hex").match(/../g).join(" "), label };
}

function parseGeneratedArtifact(path) {
  const source = readFileSync(path, "utf8");
  const match = source.match(/= (\{[\s\S]*\}) as const;\n$/u);
  if (!match) throw new Error(`Generated K01 artifact has no JSON object: ${path}`);
  return JSON.parse(match[1]);
}

function collectSelectedFrames(map, artifact) {
  const pairBytes = Buffer.from(artifact.pairBytesBase64, "base64");
  const objectStems = artifact.objectStems;
  const selected = new Map();
  for (let x = 0; x < MAP_WIDTH; x += 1) {
    for (let y = 0; y < MAP_HEIGHT; y += 1) {
      const sourceOffset = x * MAP_HEIGHT + y;
      const mapOffset = OBJECT_INDEX_OFFSET + x * MAP_X_STRIDE + y;
      assertEqual(pairBytes[sourceOffset * 2], map[mapOffset], `object stream ${x},${y}`);
      assertEqual(pairBytes[sourceOffset * 2 + 1], map[FRAME_INDEX_OFFSET + x * MAP_X_STRIDE + y], `frame stream ${x},${y}`);
      const objectIndex = pairBytes[sourceOffset * 2];
      const frame = pairBytes[sourceOffset * 2 + 1];
      const stem = objectStems[String(objectIndex)];
      if (!stem) throw new Error(`Missing K01 source stem for object ${objectIndex}`);
      const asset = artifact.assets.find((candidate) => candidate.assetKey === `k01-source:${stem}:${String(frame).padStart(4, "0")}`);
      if (!asset) throw new Error(`Missing generated source asset for ${stem}:${frame}`);
      selected.set(`${stem}:${frame}`, { stem, frame, sourcePath: `tile/normal/${stem}.ytl`, sourceSha256: asset.sourceSha256 });
    }
  }
  return [...selected.values()].sort((left, right) => `${left.stem}:${left.frame}`.localeCompare(`${right.stem}:${right.frame}`));
}

function collectYtlPayloadStats(originalRoot, selected) {
  let payloadBytes = 0;
  let payloadIndex0 = 0;
  let payloadIndexFe = 0;
  let rowParseFailures = 0;
  for (const source of selected) {
    const bytes = readFileSync(resolve(originalRoot, source.sourcePath));
    assertEqual(sha256(bytes), source.sourceSha256, `${source.sourcePath} SHA-256`);
    const header = parseSpriteLikeHeader(bytes, source.sourcePath);
    const frame = header.frames[source.frame];
    const data = bytes.subarray(frame.dataOffset, frame.dataOffset + frame.size);
    let offset = 0;
    for (let row = 0; row < header.height; row += 1) {
        const leftSkip = data[offset++];
        const count = data[offset++];
        if (leftSkip === undefined || count === undefined || leftSkip + count > header.width) throw new Error("invalid row bounds");
        const payload = data.subarray(offset, offset + count);
        if (payload.length !== count) throw new Error("truncated row payload");
        offset += count;
        payloadBytes += count;
        payloadIndex0 += payload.filter((value) => value === 0).length;
        payloadIndexFe += payload.filter((value) => value === 0xfe).length;
    }
    if (offset !== data.length) {
      rowParseFailures += 1;
      throw new Error(`${source.sourcePath} frame ${source.frame} has trailing row bytes`);
    }
  }
  return { selectedFrameCount: selected.length, payloadBytes, payloadIndex0, payloadIndexFe, rowParseFailures };
}

function reproduceTwoByTwoVector(originalRoot, artifact) {
  const target = Buffer.alloc(640 * 384, 0);
  const written = new Uint8Array(640 * 384);
  const pairBytes = Buffer.from(artifact.pairBytesBase64, "base64");
  const rawOffsets = Buffer.from(artifact.placementOffsetYBytesBase64, "base64");
  const objectStems = artifact.objectStems;
  const cells = [];
  let totalWrites = 0;
  let overlapWrites = 0;
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const ordinal = x * MAP_HEIGHT + y;
    const objectIndex = pairBytes[ordinal * 2];
    const frame = pairBytes[ordinal * 2 + 1];
    const stem = objectStems[String(objectIndex)];
    const verticalShift = rawOffsets[ordinal] === 0xf0 ? 16 : 0;
    const projectedX = 320 + (x - y) * 32;
    const projectedY = 192 + (x + y) * 16;
    const drawLeft = projectedX - 32;
    const drawTop = projectedY - verticalShift;
    const bytes = readFileSync(resolve(originalRoot, `tile/normal/${stem}.ytl`));
    const header = parseSpriteLikeHeader(bytes, `${stem}.ytl`);
    const frameData = header.frames[frame];
    const data = bytes.subarray(frameData.dataOffset, frameData.dataOffset + frameData.size);
    let offset = 0;
    let writes = 0;
    for (let row = 0; row < header.height; row += 1) {
      const leftSkip = data[offset++];
      const count = data[offset++];
      const payload = data.subarray(offset, offset + count);
      offset += count;
      for (let index = 0; index < payload.length; index += 1) {
        const targetX = drawLeft + leftSkip + index;
        const targetY = drawTop + row;
        if (targetX < 0 || targetX >= 640 || targetY < 0 || targetY >= 384) continue;
        const targetIndex = targetY * 640 + targetX;
        if (written[targetIndex] === 1) overlapWrites += 1;
        written[targetIndex] = 1;
        target[targetIndex] = payload[index];
        writes += 1;
      }
    }
    totalWrites += writes;
    cells.push({ x, y, objectIndex, stem, frame, rawVerticalShiftPx: verticalShift, projected: { x: projectedX, y: projectedY }, draw: { left: drawLeft, top: drawTop }, payloadWrites: writes });
  }
  const crop = Buffer.alloc(128 * 96);
  for (let row = 0; row < 96; row += 1) target.copy(crop, row * 128, (176 + row) * 640 + 256, (176 + row) * 640 + 384);
  return {
    camera: { x: 0, y: 0 },
    clearIndex: 0,
    cells,
    totalPayloadWrites: totalWrites,
    overlapWrites,
    crop: { left: 256, top: 176, width: 128, height: 96, sha256: sha256(crop) },
    pixels: { "320,192": target[192 * 640 + 320], "320,207": target[207 * 640 + 320], "320,208": target[208 * 640 + 320], "320,223": target[223 * 640 + 320], "320,224": target[224 * 640 + 320] },
  };
}

function collectPaletteEntryZero(originalRoot) {
  return ["imjin2.pal", "night1.pal", "night2.pal", "night3.pal", "night4.pal"].map((fileName) => {
    const bytes = readFileSync(resolve(originalRoot, "pal", fileName));
    const digest = sha256(bytes);
    assertEqual(digest, EXPECTED_PALETTE_SHA256[fileName], `${fileName} SHA-256`);
    return { fileName, sha256: digest, entry0Rgb: [...bytes.subarray(0, 3)] };
  });
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = { "--output": "output" }[argv[index]];
    if (!key || argv[index + 1] === undefined) throw new Error(`Unknown or incomplete option ${argv[index]}`);
    options[key] = resolve(argv[++index]);
  }
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const report = extractK01GameplayTerrainCompositorEvidence();
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) writeFileSync(options.output, text);
  else process.stdout.write(text);
}
