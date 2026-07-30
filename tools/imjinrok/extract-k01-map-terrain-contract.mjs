#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAP_RECORD_GRID_SIDE,
  MAP_RECORD_SIZE,
  MAP_RECORDS_OFFSET,
  encodeTerrainMaskRle,
  parseMapHeader,
} from "./map-codec.mjs";
import { parsePeImage } from "./pe-image.mjs";

export const EXPECTED_K01_MAP_SHA256 = "43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb";
export const EXPECTED_K01_MAP_SIZE = 1_097_100;
export const EXPECTED_EXECUTABLE_SHA256 = "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_EXECUTABLE_SIZE = 843_833;
export const EXPECTED_K01_PORT_SOURCE_SHA256 = "7a9c375aac4a051e2ce32a3bb575c1214dd2140458cdd7c6690f93d82036368d";
export const EXPECTED_K01_PORT_SOURCE_SIZE = 17_664;

export const K01_RAW_VALUE_PROJECTION = {
  width: 60,
  height: 60,
  coordinateOrder: "row-major: logicalIndex = y * width + x",
  recordRegionOffset: MAP_RECORDS_OFFSET,
  streamStartInRecordRegion: 0x0e050c,
  rowStride: 180,
  valueWidthBytes: 1,
};

const DEFAULT_MAP_PATH = "original/imjinrok2/stagemap/k01.map";
const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_PORT_SOURCE_PATH = "packages/shared/src/imjinrokMaps.ts";
const K01_PORT_TERRAIN_LITERAL = "K01_TERRAIN_RLE";
const MAP_LOAD_EVIDENCE = {
  va: 0x00462b11,
  bytes: "56 6a 01 68 8c bd 10 00 57 e8 25 b4 04 00",
  meaning: "FUN_00462af0 passes the fixed 0x10bd8c-byte map image to the map-load callee.",
};
const DIMENSION_EVIDENCE = {
  va: 0x004648eb,
  bytes: "8b 86 a4 2d 00 00 85 c0 7e 46 8b 86 a0 2d 00 00",
  meaning: "FUN_004648e0 reads map+0x2da4 and map+0x2da0 as loop bounds before traversing map cells.",
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const report = extractK01MapTerrainContract({
    mapPath: args.map ?? DEFAULT_MAP_PATH,
    executablePath: args.executable ?? DEFAULT_EXECUTABLE_PATH,
    portSourcePath: args.portSource ?? DEFAULT_PORT_SOURCE_PATH,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

export function extractK01MapTerrainContract({
  mapPath = DEFAULT_MAP_PATH,
  executablePath = DEFAULT_EXECUTABLE_PATH,
  portSourcePath = DEFAULT_PORT_SOURCE_PATH,
} = {}) {
  const { buffer: mapBuffer, ...map } = readVerifiedSource(mapPath, {
    label: "K01 map",
    expectedSize: EXPECTED_K01_MAP_SIZE,
    expectedSha256: EXPECTED_K01_MAP_SHA256,
  });
  const { buffer: executableBuffer, ...executable } = readVerifiedSource(executablePath, {
    label: "original executable",
    expectedSize: EXPECTED_EXECUTABLE_SIZE,
    expectedSha256: EXPECTED_EXECUTABLE_SHA256,
  });
  const { buffer: portSourceBuffer, ...portSource } = readVerifiedSource(portSourcePath, {
    label: "K01 port source",
    expectedSize: EXPECTED_K01_PORT_SOURCE_SIZE,
    expectedSha256: EXPECTED_K01_PORT_SOURCE_SHA256,
  });
  const executableEvidence = verifyExecutableEvidence(executableBuffer, executablePath);
  const portSourceBinding = extractNamedStringLiteral(portSourceBuffer, K01_PORT_TERRAIN_LITERAL);
  const header = parseMapHeader(mapBuffer, mapPath);

  if (header.width !== K01_RAW_VALUE_PROJECTION.width || header.height !== K01_RAW_VALUE_PROJECTION.height) {
    throw new Error(
      `K01 map dimensions must be ${K01_RAW_VALUE_PROJECTION.width}x${K01_RAW_VALUE_PROJECTION.height}, got ${header.width}x${header.height}`,
    );
  }

  const values = projectK01RawValues(mapBuffer);
  const rle = encodeTerrainMaskRle(values);
  if (portSourceBinding.value !== rle) {
    throw new Error(`${K01_PORT_TERRAIN_LITERAL} does not equal the hash-bound K01 raw-value projection`);
  }
  const vectors = [
    toVector(mapBuffer, 0, 0),
    toVector(mapBuffer, 59, 0),
    toVector(mapBuffer, 0, 1),
    toVector(mapBuffer, 45, 40),
    toVector(mapBuffer, 57, 32),
    toVector(mapBuffer, 59, 59),
  ];

  return {
    question:
      "Which raw K01.map bytes reproduce the current K01 terrain RLE, without assigning original terrain semantics?",
    analysisStatus: "projection-reproducible; original terrain semantics unconfirmed",
    reproductionStatus: "complete-for-hash-bound-raw-byte-projection",
    implementationStatus: "no-product-port-in-this-contract",
    sources: {
      map,
      executable,
      portSource,
    },
    parserProvenance: {
      mapLoad: executableEvidence.mapLoad,
      dimensions: executableEvidence.dimensions,
    },
    header: {
      themeId: header.themeId,
      width: header.width,
      height: header.height,
      view: header.view,
      rawCoordinatePairsAt0x04: header.spawnPoints.map(({ x, y }) => ({ x, y })),
    },
    projection: {
      ...K01_RAW_VALUE_PROJECTION,
      streamStartAbsolute: MAP_RECORDS_OFFSET + K01_RAW_VALUE_PROJECTION.streamStartInRecordRegion,
      streamEndAbsoluteExclusive:
        MAP_RECORDS_OFFSET +
        K01_RAW_VALUE_PROJECTION.streamStartInRecordRegion +
        (K01_RAW_VALUE_PROJECTION.height - 1) * K01_RAW_VALUE_PROJECTION.rowStride +
        K01_RAW_VALUE_PROJECTION.width,
      recordAddressing:
        "The projection is decomposed against the legacy 256x256x16-byte record grid; it crosses record fields and is not a single per-cell field.",
    },
    values: {
      sha256: sha256(Buffer.from(values)),
      count: values.length,
      counts: countValues(values),
      rle,
      representativeVectors: vectors,
    },
    portSourceBinding: {
      namedLiteral: K01_PORT_TERRAIN_LITERAL,
      rle: portSourceBinding.value,
      equalsRawProjection: true,
    },
    interpretationLimits: {
      rawValueLabels: "unassigned",
      terrainValueMapping: "unconfirmed; no original grass/water/forest mapping is asserted",
      coordinateMeaning: "unconfirmed; row-major order is the existing projection order, not a recovered original map-coordinate contract",
    },
  };
}

export function projectK01RawValues(buffer) {
  validateProjectionBuffer(buffer);
  const values = [];

  for (let y = 0; y < K01_RAW_VALUE_PROJECTION.height; y += 1) {
    for (let x = 0; x < K01_RAW_VALUE_PROJECTION.width; x += 1) {
      values.push(readK01RawValue(buffer, x, y).value);
    }
  }

  return values;
}

export function readK01RawValue(buffer, x, y) {
  validateProjectionBuffer(buffer);
  validateCoordinate(x, y);

  const relativeOffset =
    K01_RAW_VALUE_PROJECTION.streamStartInRecordRegion + y * K01_RAW_VALUE_PROJECTION.rowStride + x;
  const absoluteOffset = MAP_RECORDS_OFFSET + relativeOffset;
  const recordIndex = Math.floor(relativeOffset / MAP_RECORD_SIZE);

  return {
    x,
    y,
    logicalIndex: y * K01_RAW_VALUE_PROJECTION.width + x,
    value: buffer[absoluteOffset],
    absoluteOffset,
    absoluteOffsetHex: `0x${absoluteOffset.toString(16)}`,
    relativeOffset,
    record: {
      index: recordIndex,
      x: recordIndex % MAP_RECORD_GRID_SIDE,
      y: Math.floor(recordIndex / MAP_RECORD_GRID_SIDE),
      byteOffset: relativeOffset % MAP_RECORD_SIZE,
    },
  };
}

function readVerifiedSource(path, { label, expectedSize, expectedSha256 }) {
  const buffer = readFileSync(path);

  if (buffer.length !== expectedSize) {
    throw new Error(`${label} size mismatch: expected ${expectedSize}, got ${buffer.length}`);
  }

  const actualSha256 = sha256(buffer);
  if (actualSha256 !== expectedSha256) {
    throw new Error(`${label} SHA-256 mismatch: expected ${expectedSha256}, got ${actualSha256}`);
  }

  return {
    path,
    size: buffer.length,
    sha256: actualSha256,
    buffer,
  };
}

function toVector(buffer, x, y) {
  return readK01RawValue(buffer, x, y);
}

function extractNamedStringLiteral(buffer, identifier) {
  const source = buffer.toString("utf8");
  const escapedIdentifier = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const literalPattern = new RegExp(
    `(?:^|\\n)const\\s+${escapedIdentifier}\\s*=\\s*("(?:[^"\\\\]|\\\\.)*")\\s*;`,
    "m",
  );
  const match = source.match(literalPattern);
  if (!match?.[1]) {
    throw new Error(`Could not extract named string literal ${identifier} from hash-bound port source`);
  }

  let value;
  try {
    value = JSON.parse(match[1]);
  } catch (error) {
    throw new Error(`Could not decode named string literal ${identifier}: ${error.message}`);
  }

  if (typeof value !== "string") {
    throw new Error(`Named string literal ${identifier} did not decode to a string`);
  }

  return { value };
}

function verifyExecutableEvidence(buffer, executablePath) {
  const image = parsePeImage(buffer, executablePath);
  return {
    mapLoad: verifyByteEvidence(buffer, image, MAP_LOAD_EVIDENCE),
    dimensions: verifyByteEvidence(buffer, image, DIMENSION_EVIDENCE),
  };
}

function verifyByteEvidence(buffer, image, evidence) {
  const expectedBytes = Buffer.from(evidence.bytes.replaceAll(" ", ""), "hex");
  const rawOffset = image.vaToRawOffset(evidence.va);
  if (rawOffset === undefined) {
    throw new Error(`Executable evidence VA 0x${evidence.va.toString(16)} is outside mapped PE sections`);
  }

  const actualBytes = buffer.subarray(rawOffset, rawOffset + expectedBytes.length);
  if (!actualBytes.equals(expectedBytes)) {
    throw new Error(
      `Executable evidence mismatch at 0x${evidence.va.toString(16)}: expected ${evidence.bytes}, got ${actualBytes.toString("hex")}`,
    );
  }

  return {
    va: `0x${evidence.va.toString(16).padStart(8, "0")}-${(evidence.va + expectedBytes.length - 1)
      .toString(16)
      .padStart(8, "0")}`,
    bytes: evidence.bytes,
    meaning: evidence.meaning,
    matched: true,
  };
}

function validateProjectionBuffer(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error("K01 raw-value projection expects a Buffer");
  }

  const requiredLength =
    MAP_RECORDS_OFFSET +
    K01_RAW_VALUE_PROJECTION.streamStartInRecordRegion +
    (K01_RAW_VALUE_PROJECTION.height - 1) * K01_RAW_VALUE_PROJECTION.rowStride +
    K01_RAW_VALUE_PROJECTION.width;
  if (buffer.length < requiredLength) {
    throw new Error(`K01 raw-value projection requires at least ${requiredLength} bytes, got ${buffer.length}`);
  }
}

function validateCoordinate(x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    throw new Error(`K01 projection coordinates must be integers: ${x},${y}`);
  }

  if (x < 0 || x >= K01_RAW_VALUE_PROJECTION.width || y < 0 || y >= K01_RAW_VALUE_PROJECTION.height) {
    throw new Error(
      `K01 projection coordinates outside 0..${K01_RAW_VALUE_PROJECTION.width - 1},0..${K01_RAW_VALUE_PROJECTION.height - 1}: ${x},${y}`,
    );
  }
}

function countValues(values) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([value, count]) => ({ value, count }));
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--map" || arg === "--executable" || arg === "--port-source") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${arg} requires a path`);
      }
      args[arg.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}
