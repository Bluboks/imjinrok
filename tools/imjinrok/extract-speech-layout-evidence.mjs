#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSpriteLikeHeader } from "./codec.mjs";
import { readCString, readPeImage, toHex } from "./pe-image.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_HERO_SPRITE_PATH = "original/imjinrok2/yfnt/hero.spr";
const DEFAULT_JUMP_TABLES_PATH = "analysis/generated/imjinrok2/jump-tables.json";

export const EXPECTED_EXECUTABLE_SHA256 = "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_HERO_SPRITE_SHA256 =
  "a701bd0a66ec30dfd0bbc33ad7e78b937e725292fd37e9cae983ca28ad6af853";

export const ORIGINAL_SPEECH_LAYOUT = {
  baseWidth: 640,
  baseHeight: 480,
  portraitWidth: 130,
  portraitHeight: 120,
  slots: [
    { slot: 0, x: 26, y: 49, right: 156, bottom: 169 },
    { slot: 1, x: 490, y: 49, right: 620, bottom: 169 },
    { slot: 2, x: 26, y: 210, right: 156, bottom: 330 },
    { slot: 3, x: 490, y: 210, right: 620, bottom: 330 },
  ],
  text: {
    x: 188,
    centerY: 190,
    maxWidth: 278,
  },
};

const STATIC_EVIDENCE = [
  {
    id: "speech-record-slot-read",
    va: 0x0048311e,
    bytes: "66 8b 96 80 00 00 00",
    meaning: "SPEECH consumer reads the numeric display slot from WORD [record+0x80]",
  },
  {
    id: "speech-display-call",
    va: 0x00483133,
    bytes: "6a 00 51 52 b9 80 36 5e 00 e8 cf 49 02 00",
    meaning: "SPEECH consumer passes the display slot to FUN_004a7b10",
  },
  {
    id: "hero-sprite-path-load",
    va: 0x004a7440,
    bytes: "68 f4 91 4c 00",
    meaning: "portrait subsystem loads the embedded path pointer 0x004c91f4",
  },
  {
    id: "slot-range-check",
    va: 0x004a8410,
    bytes: "0f bf 4c 24 04 8b 44 24 08 83 f9 03 77 3a",
    meaning: "slot rectangle helper accepts signed slots 0 through 3",
  },
  {
    id: "slot-0-origin",
    va: 0x004a8425,
    bytes: "c7 00 1a 00 00 00 c7 40 04 31 00 00 00",
    meaning: "slot 0 origin is (26, 49)",
  },
  {
    id: "slot-1-origin",
    va: 0x004a8434,
    bytes: "c7 00 ea 01 00 00 c7 40 04 31 00 00 00",
    meaning: "slot 1 origin is (490, 49)",
  },
  {
    id: "slot-2-x",
    va: 0x004a8443,
    bytes: "c7 00 1a 00 00 00",
    meaning: "slot 2 X origin is 26",
  },
  {
    id: "slot-3-x",
    va: 0x004a844b,
    bytes: "c7 00 ea 01 00 00",
    meaning: "slot 3 X origin is 490",
  },
  {
    id: "bottom-row-y",
    va: 0x004a8451,
    bytes: "c7 40 04 d2 00 00 00",
    meaning: "slots 2 and 3 use Y origin 210",
  },
  {
    id: "portrait-right-edge",
    va: 0x004a845d,
    bytes: "81 c1 82 00 00 00",
    meaning: "slot rectangle right edge is X + 130",
  },
  {
    id: "portrait-bottom-edge",
    va: 0x004a8463,
    bytes: "83 c2 78",
    meaning: "slot rectangle bottom edge is Y + 120",
  },
  {
    id: "speech-text-max-width",
    va: 0x004a7abf,
    bytes: "68 16 01 00 00",
    meaning: "speech text layout receives maximum width 278",
  },
  {
    id: "speech-text-center-y",
    va: 0x004a7ae7,
    bytes: "ba be 00 00 00 d1 f8 2b d0",
    meaning: "speech text Y is vertically centered around 190",
  },
  {
    id: "speech-text-x",
    va: 0x004a7af1,
    bytes: "68 bc 00 00 00",
    meaning: "speech text draw X is 188",
  },
];

const args = parseArgs(process.argv.slice(2));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = extractSpeechLayoutEvidence({
    executablePath: args.input ?? DEFAULT_EXECUTABLE_PATH,
    heroSpritePath: args.sprite ?? DEFAULT_HERO_SPRITE_PATH,
    jumpTablesPath: args.jumpTables ?? DEFAULT_JUMP_TABLES_PATH,
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
}

export function extractSpeechLayoutEvidence({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  heroSpritePath = DEFAULT_HERO_SPRITE_PATH,
  jumpTablesPath = DEFAULT_JUMP_TABLES_PATH,
} = {}) {
  const { buffer: executableBuffer, image } = readPeImage(executablePath);
  const executableSha256 = sha256(executableBuffer);
  assertEqual(executableSha256, EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);

  const heroSpriteBuffer = readFileSync(heroSpritePath);
  const heroSpriteSha256 = sha256(heroSpriteBuffer);
  assertEqual(heroSpriteSha256, EXPECTED_HERO_SPRITE_SHA256, `${heroSpritePath} SHA-256`);
  const heroSpriteHeader = parseSpriteLikeHeader(heroSpriteBuffer, heroSpritePath);

  const evidencePoints = STATIC_EVIDENCE.map((point) => readEvidencePoint(executableBuffer, image, point));
  const mismatch = evidencePoints.find((point) => !point.matched);
  if (mismatch) {
    throw new Error(
      `Static evidence mismatch at ${mismatch.va} (${mismatch.id}): expected ${mismatch.expectedBytes}, got ${mismatch.actualBytes}`,
    );
  }

  const jumpTables = readJumpTables(jumpTablesPath);
  const slotSwitch = findSwitch(jumpTables, 0x004a8410, 0x004a841e);
  for (const expected of ORIGINAL_SPEECH_LAYOUT.slots) {
    const switchCase = requireCase(slotSwitch, expected.slot);
    const expectedDestination = [0x004a8425, 0x004a8434, 0x004a8443, 0x004a844b][expected.slot];
    assertEqual(switchCase.destination, toHex(expectedDestination), `speech slot ${expected.slot} destination`);
  }

  const pathOffset = requireRawOffset(image, 0x004c91f4);
  const embeddedPath = readCString(executableBuffer, pathOffset);
  assertEqual(embeddedPath, "yfnt\\hero.spr", "hero sprite embedded path");

  return {
    analysisStatus: "static-confirmed",
    scope: "SPEECH display slots, portrait rectangles, and dialogue text placement",
    sources: {
      executable: {
        path: executablePath,
        sha256: executableSha256,
      },
      heroSprite: {
        path: heroSpritePath,
        embeddedPath,
        sha256: heroSpriteSha256,
        width: heroSpriteHeader.width,
        height: heroSpriteHeader.height,
        frameCount: heroSpriteHeader.frameCount,
      },
      jumpTables: {
        path: jumpTablesPath,
      },
    },
    pipeline: [
      {
        function: "FUN_004830f0",
        address: toHex(0x0048311e),
        behavior: "read numeric speech slot from WORD [record+0x80]",
      },
      {
        function: "FUN_004a7b10",
        address: toHex(0x004a7b10),
        behavior: "update the selected portrait slot and lay out speech text",
      },
      {
        function: "FUN_004a8410",
        address: toHex(0x004a8410),
        behavior: "convert slot 0..3 to a fixed 130x120 portrait rectangle",
      },
      {
        function: "FUN_004a7a50",
        address: toHex(0x004a7a50),
        behavior: "wrap text to 278 pixels and draw at X 188, vertically centered on Y 190",
      },
    ],
    coordinateSystem: {
      width: ORIGINAL_SPEECH_LAYOUT.baseWidth,
      height: ORIGINAL_SPEECH_LAYOUT.baseHeight,
      origin: "top-left",
    },
    portrait: {
      resourcePath: embeddedPath,
      width: ORIGINAL_SPEECH_LAYOUT.portraitWidth,
      height: ORIGINAL_SPEECH_LAYOUT.portraitHeight,
      slots: ORIGINAL_SPEECH_LAYOUT.slots,
    },
    text: ORIGINAL_SPEECH_LAYOUT.text,
    invalidSlotBehavior: {
      destination: toHex(0x004a8458),
      note: "The rectangle helper returns without initializing a known slot rectangle; the port must reject such slots.",
    },
    evidencePoints,
  };
}

function readJumpTables(path) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read static jump tables from ${path}: ${error.message}`, { cause: error });
  }
  if (!parsed.tables || typeof parsed.tables !== "object") {
    throw new Error(`${path} does not contain a jump-tables 'tables' object`);
  }
  return Object.values(parsed.tables);
}

function findSwitch(tables, functionEntry, switchAddress) {
  const table = tables.find(
    (candidate) =>
      candidate.functionEntry === toHex(functionEntry) && candidate.switchAddress === toHex(switchAddress),
  );
  if (!table) {
    throw new Error(`Missing jump table for ${toHex(functionEntry)} switch ${toHex(switchAddress)}`);
  }
  return table;
}

function requireCase(table, label) {
  const switchCase = table.cases.find((candidate) => candidate.label === label);
  if (!switchCase) {
    throw new Error(`Switch ${table.switchAddress} has no case ${label}`);
  }
  return switchCase;
}

function readEvidencePoint(buffer, image, point) {
  const rawOffset = image.vaToRawOffset(point.va);
  const expectedBytes = Buffer.from(point.bytes.replaceAll(" ", ""), "hex");
  const actualBytes =
    rawOffset === undefined ? Buffer.alloc(0) : buffer.subarray(rawOffset, rawOffset + expectedBytes.length);

  return {
    ...point,
    va: toHex(point.va),
    rawOffset: rawOffset === undefined ? undefined : toHex(rawOffset),
    expectedBytes: formatBytes(expectedBytes),
    actualBytes: formatBytes(actualBytes),
    matched: Buffer.compare(actualBytes, expectedBytes) === 0,
  };
}

function requireRawOffset(image, va) {
  const offset = image.vaToRawOffset(va);
  if (offset === undefined) {
    throw new RangeError(`${toHex(va)} is not backed by a PE file section`);
  }
  return offset;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`);
  }
}

function formatBytes(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (arg === "--input" || arg === "--sprite" || arg === "--jump-tables") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${arg} requires a path`);
      }
      parsed[arg === "--input" ? "input" : arg === "--sprite" ? "sprite" : "jumpTables"] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function printReport(report) {
  console.log(`SPEECH layout: ${report.coordinateSystem.width}x${report.coordinateSystem.height}`);
  console.log(`  portrait resource: ${report.portrait.resourcePath}`);
  for (const slot of report.portrait.slots) {
    console.log(`  slot ${slot.slot}: (${slot.x}, ${slot.y})-(${slot.right}, ${slot.bottom})`);
  }
  console.log(
    `  text: x=${report.text.x}, centerY=${report.text.centerY}, maxWidth=${report.text.maxWidth}`,
  );
  console.log(`  static evidence points: ${report.evidencePoints.length} matched`);
}
