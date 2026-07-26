#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { encodeTerrainMaskRle, extractLikelyTerrainMask, parseMapHeader } from "./map-codec.mjs";

const args = parseArgs(process.argv.slice(2));

if (!args.file) {
  throw new Error(
    "Usage: node tools/imjinrok/extract-map-terrain-mask.mjs --file <file.map> [--start <hex|decimal>] [--json] [--rle-only]",
  );
}

const buffer = readFileSync(args.file);
const header = parseMapHeader(buffer, args.file);
const extraction = extractLikelyTerrainMask(buffer, header, {
  start: args.start,
  scanStart: args.scanStart,
  scanEnd: args.scanEnd,
  step: args.step,
  sampleStride: args.sampleStride,
  refineCandidates: args.refineCandidates,
});

if (!extraction.best) {
  throw new Error(`${args.file}: no likely terrain mask found`);
}

const rle = encodeTerrainMaskRle(extraction.best.values);
const report = {
  file: args.file,
  width: header.width,
  height: header.height,
  themeId: header.themeId,
  start: extraction.best.start,
  startHex: `0x${extraction.best.start.toString(16)}`,
  rowStride: extraction.best.rowStride,
  nonZeroRatio: extraction.best.nonZeroRatio,
  distinctValues: extraction.best.distinctValues,
  counts: extraction.best.counts,
  rle,
  candidates: extraction.candidates.slice(0, 10).map((candidate) => ({
    start: candidate.start,
    startHex: `0x${candidate.start.toString(16)}`,
    rowStride: candidate.rowStride,
    nonZeroRatio: candidate.nonZeroRatio,
    distinctValues: candidate.distinctValues,
    counts: candidate.counts,
  })),
};

if (args.rleOnly) {
  console.log(rle);
} else if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Terrain mask: ${report.file}`);
  console.log(`  size: ${report.width}x${report.height}`);
  console.log(`  start: ${report.startHex}`);
  console.log(`  row stride: ${report.rowStride}`);
  console.log(`  non-zero ratio: ${report.nonZeroRatio.toFixed(3)}`);
  console.log(`  values: ${report.counts.map(({ value, count }) => `${value}:${count}`).join(", ")}`);
  console.log(`  rle: ${rle}`);
}

function parseArgs(argv) {
  const parsed = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--") {
      continue;
    }

    if (arg === "--json") {
      parsed.json = true;
      continue;
    }

    if (arg === "--rle-only") {
      parsed.rleOnly = true;
      continue;
    }

    if (arg === "--file") {
      parsed.file = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === "--start" || arg === "--scan-start" || arg === "--scan-end") {
      parsed[toCamelCase(arg.slice(2))] = parseIntegerArg(arg, argv[i + 1]);
      i += 1;
      continue;
    }

    if (arg === "--step" || arg === "--sample-stride" || arg === "--refine-candidates") {
      parsed[toCamelCase(arg.slice(2))] = parseIntegerArg(arg, argv[i + 1]);
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function parseIntegerArg(name, value) {
  if (!value) {
    throw new Error(`${name} requires a value`);
  }

  const parsed = Number.parseInt(value, value.startsWith("0x") ? 16 : 10);

  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer: ${value}`);
  }

  return parsed;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}
