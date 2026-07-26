#!/usr/bin/env node
import { readCString, readPeImage, toHex } from "./pe-image.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const SPRITE_PATH_PATTERN = /^char\\[^\\/:*?"<>|]+\.spr$/i;

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const table = extractOriginalSpriteTable(args.input ?? DEFAULT_EXECUTABLE_PATH);

  if (args.json) {
    console.log(JSON.stringify(table, null, 2));
  } else {
    printTable(table);
  }
}

export function extractOriginalSpriteTable(executablePath = DEFAULT_EXECUTABLE_PATH) {
  const { buffer, image } = readPeImage(executablePath);
  const dataSection = image.sections.find((section) => section.name === ".data");

  if (!dataSection) {
    throw new Error(`${executablePath} is missing the .data section`);
  }

  const candidates = [];
  const dataEnd = dataSection.rawPointer + dataSection.rawSize;

  for (let rawOffset = dataSection.rawPointer; rawOffset <= dataEnd - 4; rawOffset += 4) {
    const stringVa = buffer.readUInt32LE(rawOffset);
    const stringRawOffset = image.vaToRawOffset(stringVa);
    if (stringRawOffset === undefined) {
      continue;
    }

    const sourcePath = readCString(buffer, stringRawOffset);
    if (!SPRITE_PATH_PATTERN.test(sourcePath)) {
      continue;
    }

    candidates.push({
      tableRawOffset: rawOffset,
      tableVa: image.rawOffsetToVa(rawOffset),
      stringRawOffset,
      stringVa,
      sourcePath,
      sourcePathNormalized: normalizeSourcePath(sourcePath),
    });
  }

  const runs = groupConsecutivePointerRuns(candidates);
  const longestRun = runs.sort((a, b) => b.length - a.length || a[0].tableRawOffset - b[0].tableRawOffset)[0];
  if (!longestRun) {
    throw new Error(`No char\\*.spr pointer table found in ${executablePath}`);
  }

  return {
    executablePath,
    imageBase: toHex(image.imageBase),
    tableRawOffset: toHex(longestRun[0].tableRawOffset),
    tableVa: toHex(longestRun[0].tableVa),
    entryCount: longestRun.length,
    entries: longestRun.map((entry, index) => ({
      index,
      tableRawOffset: toHex(entry.tableRawOffset),
      tableVa: toHex(entry.tableVa),
      stringRawOffset: toHex(entry.stringRawOffset),
      stringVa: toHex(entry.stringVa),
      sourcePath: entry.sourcePath,
      sourcePathNormalized: entry.sourcePathNormalized,
    })),
  };
}

function groupConsecutivePointerRuns(entries) {
  const runs = [];
  let currentRun = [];

  for (const entry of entries.sort((a, b) => a.tableRawOffset - b.tableRawOffset)) {
    const previous = currentRun.at(-1);
    if (previous && entry.tableRawOffset !== previous.tableRawOffset + 4) {
      runs.push(currentRun);
      currentRun = [];
    }
    currentRun.push(entry);
  }

  if (currentRun.length > 0) {
    runs.push(currentRun);
  }

  return runs;
}

function normalizeSourcePath(path) {
  return path.replaceAll("\\", "/").toLowerCase();
}

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (arg === "--input") {
      parsed.input = argv[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function printTable(table) {
  console.log(`Original sprite table: ${table.executablePath}`);
  console.log(`  image base: ${table.imageBase}`);
  console.log(`  table: ${table.tableVa} raw ${table.tableRawOffset}`);
  console.log(`  entries: ${table.entryCount}`);

  for (const entry of table.entries) {
    console.log(
      `  ${String(entry.index).padStart(3, "0")} ${entry.tableVa} -> ${entry.stringVa} ${entry.sourcePath}`,
    );
  }
}
