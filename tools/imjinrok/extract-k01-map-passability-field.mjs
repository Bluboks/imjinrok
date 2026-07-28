#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseMapHeader } from "./map-codec.mjs";
import { parsePeImage } from "./pe-image.mjs";

export const EXPECTED_K01_MAP_SHA256 = "43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb";
export const EXPECTED_K01_MAP_SIZE = 1_097_100;
export const EXPECTED_EXECUTABLE_SHA256 = "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_EXECUTABLE_SIZE = 843_833;

export const K01_PASSABILITY_GATE_FIELD = {
  baseOffset: 0x000cc90c,
  auxiliaryBaseOffset: 0x000dc62c,
  width: 60,
  height: 60,
  elementWidthBytes: 1,
  signedness: "unsigned",
  coordinateOrder: "column-major padded storage: offset = baseOffset + x * 180 + y",
  xStrideBytes: 180,
  yStrideBytes: 1,
};

const DEFAULT_MAP_PATH = "original/imjinrok2/stagemap/k01.map";
const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const EXECUTABLE_EVIDENCE = [
  {
    id: "map-load-size",
    va: 0x00462b11,
    bytes: "56 6a 01 68 8c bd 10 00 57 e8 25 b4 04 00",
    meaning: "FUN_00462af0 loads 0x10bd8c map bytes into the map object before initialization.",
  },
  {
    id: "passability-gate-base-and-inner-strides",
    va: 0x00464b83,
    bytes: "8d ae 0c c9 0c 00 8d 9e f4 27 02 00",
    meaning: "FUN_004648e0 starts the source gate at map+0x000cc90c and its derived flag grid at map+0x000227f4.",
  },
  {
    id: "passability-gate-value-three-branch",
    va: 0x00464ba3,
    bytes: "80 7d 00 03",
    meaning: "FUN_004648e0 takes its source-data branch only when the gate byte is exactly 3.",
  },
  {
    id: "passability-gate-inner-strides",
    va: 0x00464bde,
    bytes: "81 c3 68 01 00 00 81 c5 b4 00 00 00",
    meaning: "Within each y row, the derived flag address advances 0x168 bytes and the source gate address advances 180 bytes.",
  },
  {
    id: "passability-gate-outer-strides",
    va: 0x00464c00,
    bytes: "40 83 c3 02 45",
    meaning: "At the next y row, the source gate address advances one byte while the derived flag address advances two bytes.",
  },
  {
    id: "passability-predicate-primary-field",
    va: 0x004659a2,
    bytes: "8d 94 80 eb 5a 00 00 8d 14 d2 8d 14 96 8a 14 0a 80 fa 03",
    meaning: "FUN_00465960 derives map+0x000cc90c+x*180+y, loads an unsigned byte, and compares it with 3.",
  },
  {
    id: "passability-predicate-auxiliary-field",
    va: 0x004659b7,
    bytes: "8d 94 80 f3 61 00 00 8d 14 d2 8d 14 96 80 3c 0a 00",
    meaning: "When the primary byte is 3, FUN_00465960 requires field_0x000dc62c at the same x,y to be zero before later checks continue.",
  },
  {
    id: "passability-predicate-nonzero-reject",
    va: 0x004659d1,
    bytes: "84 d2 75 f5",
    meaning: "A primary value other than 0 or the special 3 path returns false before the later derived-flag checks.",
  },
  {
    id: "heuristic-stream-cleared-after-initialization",
    va: 0x00464c72,
    bytes: "8d be 4c c3 0e 00 8b 8e a0 2d 00 00 33 c0 85 c9 7e 16 8b cf c6 01 00",
    meaning: "FUN_004648e0 clears map+0x000ec34c+x*180+y; this is adjacent to, but not the field boundary or coordinate formula of the prior RLE heuristic.",
  },
];

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  process.stdout.write(
    `${JSON.stringify(
      extractK01MapPassabilityField({ mapPath: args.map, executablePath: args.executable }),
      null,
      2,
    )}\n`,
  );
}

export function extractK01MapPassabilityField({
  mapPath = DEFAULT_MAP_PATH,
  executablePath = DEFAULT_EXECUTABLE_PATH,
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
  const header = parseMapHeader(mapBuffer, mapPath);

  if (header.width !== K01_PASSABILITY_GATE_FIELD.width || header.height !== K01_PASSABILITY_GATE_FIELD.height) {
    throw new Error(
      `K01 map dimensions must be ${K01_PASSABILITY_GATE_FIELD.width}x${K01_PASSABILITY_GATE_FIELD.height}, got ${header.width}x${header.height}`,
    );
  }

  const image = parsePeImage(executableBuffer, executablePath);
  const executableEvidence = EXECUTABLE_EVIDENCE.map((evidence) => verifyByteEvidence(executableBuffer, image, evidence));
  const values = projectK01PassabilityGateValues(mapBuffer);
  const auxiliaryValues = projectK01PassabilityAuxiliaryValues(mapBuffer);

  return {
    question:
      "Which original K01.map per-cell field directly gates the recovered map-eligibility predicate, and what does the binary prove about its values?",
    analysisStatus: "static-confirmed-for-bounded-map-eligibility-gate",
    reproductionStatus: "complete-for-hash-bound-field-addressing-and-source-branch-vectors",
    implementationStatus: "no-product-port-in-this-extractor",
    sources: { map, executable },
    header: { width: header.width, height: header.height },
    field: {
      ...K01_PASSABILITY_GATE_FIELD,
      extentEndExclusive:
        K01_PASSABILITY_GATE_FIELD.baseOffset +
        (K01_PASSABILITY_GATE_FIELD.width - 1) * K01_PASSABILITY_GATE_FIELD.xStrideBytes +
        K01_PASSABILITY_GATE_FIELD.height,
    },
    sourceControlFlow: {
      producer:
        "FUN_00462af0 passes the map destination, element count 0x10bd8c, element size 1, and opened map stream to FUN_004adf44 before FUN_004648e0 reads this field; this report does not assign an independent decoder role to that transfer helper.",
      initializer:
        "FUN_004648e0 scans x=0..width-1 and y=0..height-1, branches on field_0x000cc90c(x,y) == 3, and updates a separate derived flag grid at map+0x000227f4.",
      predicate:
        "FUN_00465960 validates coordinate bounds, then rejects primary values other than 0 or the special 3 path; value 3 continues only when field_0x000dc62c(x,y) is 0, before independent occupancy, flag, and field_0x00032514 checks.",
      callers: ["FUN_00465d50", "FUN_0046e450"],
    },
    executableEvidence,
    values: summarizeValues(values),
    auxiliaryValues: summarizeValues(auxiliaryValues),
    representativeVectors: [
      toVector(mapBuffer, 0, 0),
      toVector(mapBuffer, 0, 7),
      toVector(mapBuffer, 14, 4),
      toVector(mapBuffer, 0, 41),
      toVector(mapBuffer, 8, 15),
      toVector(mapBuffer, 59, 59),
    ],
    sourceGateVectors: [
      { primaryValue: 0, auxiliaryValue: 255, result: evaluateK01PassabilityGate(0, 255) },
      { primaryValue: 3, auxiliaryValue: 0, result: evaluateK01PassabilityGate(3, 0) },
      { primaryValue: 3, auxiliaryValue: 1, result: evaluateK01PassabilityGate(3, 1) },
      { primaryValue: 1, auxiliaryValue: 0, result: evaluateK01PassabilityGate(1, 0) },
      { primaryValue: 255, auxiliaryValue: 0, result: evaluateK01PassabilityGate(255, 0) },
    ],
    interpretationLimits: {
      rawValueLabels: "unassigned; the x86 branches establish only 0, 3, and other-nonzero control categories in this predicate",
      renderingField: "unresolved; this extractor does not identify a tile-rendering field or attach terrain artwork labels",
      passabilityScope:
        "bounded: continuation through FUN_00465960's source gate is not a claim that a cell is ultimately passable, because later occupancy, flag, and independent-field checks can still reject it",
      priorRleProjection:
        "not an original per-cell field: its 0x000ec298 row-major stream has neither this field boundary nor this x*180+y formula; FUN_004648e0 also clears the adjacent 0x000ec34c array during initialization",
    },
  };
}

export function projectK01PassabilityGateValues(buffer) {
  return projectField(buffer, K01_PASSABILITY_GATE_FIELD.baseOffset);
}

export function projectK01PassabilityAuxiliaryValues(buffer) {
  return projectField(buffer, K01_PASSABILITY_GATE_FIELD.auxiliaryBaseOffset);
}

export function readK01PassabilityGateValue(buffer, x, y) {
  return readK01PassabilityFieldValue(buffer, K01_PASSABILITY_GATE_FIELD.baseOffset, x, y);
}

export function readK01PassabilityAuxiliaryValue(buffer, x, y) {
  return readK01PassabilityFieldValue(buffer, K01_PASSABILITY_GATE_FIELD.auxiliaryBaseOffset, x, y);
}

export function evaluateK01PassabilityGate(primaryValue, auxiliaryValue) {
  validateByte("primary passability value", primaryValue);
  validateByte("auxiliary passability value", auxiliaryValue);

  if (primaryValue === 0) {
    return "continues-to-later-checks";
  }

  if (primaryValue === 3 && auxiliaryValue === 0) {
    return "continues-to-later-checks";
  }

  return "rejects-before-later-checks";
}

function projectField(buffer, baseOffset) {
  validateFieldBuffer(buffer, baseOffset);
  const values = [];
  for (let y = 0; y < K01_PASSABILITY_GATE_FIELD.height; y += 1) {
    for (let x = 0; x < K01_PASSABILITY_GATE_FIELD.width; x += 1) {
      values.push(readK01PassabilityFieldValue(buffer, baseOffset, x, y).value);
    }
  }
  return values;
}

function readK01PassabilityFieldValue(buffer, baseOffset, x, y) {
  validateFieldBuffer(buffer, baseOffset);
  validateCoordinate(x, y);
  const offset = baseOffset + x * K01_PASSABILITY_GATE_FIELD.xStrideBytes + y;
  return {
    x,
    y,
    value: buffer[offset],
    offset,
    offsetHex: `0x${offset.toString(16).padStart(8, "0")}`,
  };
}

function summarizeValues(values) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return {
    sha256: sha256(Buffer.from(values)),
    count: values.length,
    counts: [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([value, count]) => ({ value, count })),
  };
}

function toVector(buffer, x, y) {
  return {
    primary: readK01PassabilityGateValue(buffer, x, y),
    auxiliary: readK01PassabilityAuxiliaryValue(buffer, x, y),
    sourceGateResult: evaluateK01PassabilityGate(
      readK01PassabilityGateValue(buffer, x, y).value,
      readK01PassabilityAuxiliaryValue(buffer, x, y).value,
    ),
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
  return { path, size: buffer.length, sha256: actualSha256, buffer };
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
  return { id: evidence.id, va: `0x${evidence.va.toString(16).padStart(8, "0")}`, bytes: evidence.bytes, meaning: evidence.meaning, matched: true };
}

function validateFieldBuffer(buffer, baseOffset) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error("K01 passability field expects a Buffer");
  }
  const requiredLength =
    baseOffset +
    (K01_PASSABILITY_GATE_FIELD.width - 1) * K01_PASSABILITY_GATE_FIELD.xStrideBytes +
    K01_PASSABILITY_GATE_FIELD.height;
  if (buffer.length < requiredLength) {
    throw new Error(`K01 passability field at 0x${baseOffset.toString(16)} requires at least ${requiredLength} bytes, got ${buffer.length}`);
  }
}

function validateCoordinate(x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    throw new Error(`K01 passability coordinates must be integers: ${x},${y}`);
  }
  if (x < 0 || x >= K01_PASSABILITY_GATE_FIELD.width || y < 0 || y >= K01_PASSABILITY_GATE_FIELD.height) {
    throw new Error(`K01 passability coordinates outside 0..59,0..59: ${x},${y}`);
  }
}

function validateByte(name, value) {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new Error(`${name} must be an unsigned byte: ${value}`);
  }
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--map" || arg === "--executable") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${arg} requires a path`);
      }
      args[arg.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}
