#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import {
  decodeSpriteFrame,
  encodeRgbaPng,
  indexedToRgba,
  parseSpriteLikeHeader,
  readPalette,
} from "./codec.mjs";

const args = parseArgs(process.argv.slice(2));

if (!args.input || !args.out) {
  throw new Error("Usage: node tools/imjinrok/convert-sprites.mjs --input <file.spr|file.ytl> --out <dir> [--palette <file.pal>] [--frames 0:3|0,1|all]");
}

const inputBuffer = readFileSync(args.input);
const header = parseSpriteLikeHeader(inputBuffer, args.input);
const palette = readPalette(readFileSync(args.palette ?? "original/imjinrok2/pal/imjin2.pal"), args.palette ?? "original/imjinrok2/pal/imjin2.pal");
const layout = extname(args.input).toLowerCase() === ".ytl" ? "ytl" : "spr";
const frameIndexes = parseFrameSelection(args.frames ?? "0", header.frameCount);
const stem = basename(args.input, extname(args.input));

mkdirSync(args.out, { recursive: true });

const frames = [];
for (const frameIndex of frameIndexes) {
  const indexed = decodeSpriteFrame(inputBuffer, header, frameIndex, { layout });
  const rgba = indexedToRgba(indexed, palette);
  const fileName = `${stem}_${String(frameIndex).padStart(4, "0")}.png`;
  const png = encodeRgbaPng(header.width, header.height, rgba);
  writeFileSync(join(args.out, fileName), png);
  frames.push({ index: frameIndex, fileName });
}

const manifest = {
  source: args.input,
  layout,
  width: header.width,
  height: header.height,
  frameCount: header.frameCount,
  exportedFrames: frames,
};

writeFileSync(join(args.out, `${stem}.manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Converted ${frames.length}/${header.frameCount} frames from ${args.input} -> ${args.out}`);

function parseArgs(argv) {
  const parsed = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--") {
      continue;
    }

    if (arg === "--input" || arg === "--out" || arg === "--palette" || arg === "--frames") {
      parsed[arg.slice(2)] = argv[i + 1];
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function parseFrameSelection(selection, frameCount) {
  if (selection === "all") {
    return Array.from({ length: frameCount }, (_value, index) => index);
  }

  if (selection.includes(":")) {
    const [startRaw, endRaw] = selection.split(":");
    const start = Number.parseInt(startRaw, 10);
    const end = Number.parseInt(endRaw, 10);
    validateFrameIndex(start, frameCount);
    validateFrameIndex(end, frameCount);
    if (end < start) {
      throw new Error(`Invalid frame range ${selection}`);
    }
    return Array.from({ length: end - start + 1 }, (_value, offset) => start + offset);
  }

  return selection.split(",").map((value) => {
    const index = Number.parseInt(value, 10);
    validateFrameIndex(index, frameCount);
    return index;
  });
}

function validateFrameIndex(index, frameCount) {
  if (!Number.isInteger(index) || index < 0 || index >= frameCount) {
    throw new Error(`Frame index ${index} is out of range 0..${frameCount - 1}`);
  }
}
