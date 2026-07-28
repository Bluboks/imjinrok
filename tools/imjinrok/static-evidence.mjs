import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { toHex } from "./pe-image.mjs";

export function verifySeededFunction(buffer, image, seeds, expected) {
  const fn = seeds.functions?.find((candidate) => candidate.entry === expected.entry);
  if (!fn) {
    throw new Error(`${seeds.sourceSha256}: missing seeded function ${expected.entry}`);
  }
  assertEqual(fn.bodyRanges?.length, 1, `${expected.entry} body range count`);
  assertEqual(fn.bodyRanges[0], expected.bodyRange, `${expected.entry} body range`);
  assertEqual(fn.basicBlocks?.length, expected.blockCount, `${expected.entry} CFG block count`);
  assertEqual(fn.instructions?.length, expected.instructionCount, `${expected.entry} instruction count`);
  const first = parseAddress(fn.instructions[0].address, `${expected.entry} first instruction`);
  const last = fn.instructions.at(-1);
  const endExclusive =
    parseAddress(last.address, `${expected.entry} last instruction`) + parseInstructionBytes(last.bytes).length;
  const bytes = readVaRange(buffer, image, first, endExclusive);
  assertEqual(sha256(bytes), expected.bodySha256, `${expected.entry} complete body SHA-256`);
  return {
    entry: expected.entry,
    bodyRange: expected.bodyRange,
    byteRange: `${toHex(first)}-${toHex(endExclusive)} (end exclusive)`,
    blockCount: expected.blockCount,
    instructionCount: expected.instructionCount,
    bodySha256: expected.bodySha256,
  };
}

export function verifyRawCodeRange(buffer, image, range) {
  const bytes = readVaRange(buffer, image, range.start, range.endExclusive);
  assertEqual(sha256(bytes), range.sha256, `${range.id} SHA-256`);
  return {
    id: range.id,
    byteRange: `${toHex(range.start)}-${toHex(range.endExclusive)} (end exclusive)`,
    bodySha256: range.sha256,
  };
}

export function verifyEvidencePoint(buffer, image, point) {
  const expected = parseInstructionBytes(point.bytes);
  const actual = readVaRange(buffer, image, point.va, point.va + expected.length);
  if (Buffer.compare(actual, expected) !== 0) {
    throw new Error(
      `Static evidence mismatch at ${toHex(point.va)} (${point.meaning}): expected ${formatBytes(expected)}, got ${formatBytes(actual)}`,
    );
  }
  return {
    va: toHex(point.va),
    rawOffset: toHex(requireRawOffset(image, point.va)),
    bytes: formatBytes(actual),
    meaning: point.meaning,
  };
}

export function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read static-analysis JSON from ${path}: ${error.message}`, { cause: error });
  }
}

export function readVaRange(buffer, image, start, endExclusive) {
  const rawOffset = requireRawOffset(image, start);
  const bytes = buffer.subarray(rawOffset, rawOffset + endExclusive - start);
  if (bytes.length !== endExclusive - start) {
    throw new RangeError(`${toHex(start)}-${toHex(endExclusive)} exceeds the executable`);
  }
  return bytes;
}

export function requireRawOffset(image, va) {
  const offset = image.vaToRawOffset(va);
  if (offset === undefined) {
    throw new RangeError(`${toHex(va)} is not backed by a PE file section`);
  }
  return offset;
}

export function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`);
  }
}

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function parseInstructionBytes(value) {
  return Buffer.from(value.replaceAll(" ", ""), "hex");
}

function parseAddress(value, label) {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/u.test(value)) {
    throw new TypeError(`${label} is not a hexadecimal address: ${String(value)}`);
  }
  return Number.parseInt(value.slice(2), 16);
}

function formatBytes(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(" ");
}
