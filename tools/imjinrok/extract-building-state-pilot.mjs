#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TextDecoder } from "node:util";
import { fileURLToPath } from "node:url";
import { parseSpriteLikeHeader } from "./codec.mjs";
import { readCString, readPeImage, toHex } from "./pe-image.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_SPRITE_PATH = "original/imjinrok2/char/hqk.spr";
const DEFAULT_JUMP_TABLES_PATH = "analysis/generated/imjinrok2/jump-tables.json";

export const EXPECTED_EXECUTABLE_SHA256 = "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_SPRITE_SHA256 = "17e5640a7b34f8aaf1063d210bd087b8ba59d769e194f5025e92941e422c2d4e";

export const BUILDING_IDENTITY = {
  internalClass: 49,
  originalGameplayName: "조선 본영",
  spriteSlot: 141,
  sourcePath: "char\\hqk.spr",
  typeDefinitionAddress: 0x00886d9c,
  namePointer: 0x00aa5808,
  healthyFrame: 7,
  damagedFrame: 8,
};

export const CONSTRUCTION_PHASE_THRESHOLDS = [0, 10, 20, 30, 40, 50, 70, 100];

const STATIC_EVIDENCE = [
  {
    id: "type-49-name-pointer-argument",
    va: 0x0045e1d4,
    bytes: "6a 00 68 08 58 aa 00",
    meaning: "type 49 initializer receives runtime name pointer 0x00aa5808",
  },
  {
    id: "type-49-building-flags",
    va: 0x0045e1f0,
    bytes: "68 82 00 71 00",
    meaning: "type 49 definition flags include the building damage-state bit 0x2",
  },
  {
    id: "type-49-slot-base-and-record",
    va: 0x0045e23c,
    bytes: "6a 34 6a 07 68 8d 00 00 00 b9 9c 6d 88 00 e8 b1 da ff ff",
    meaning: "type 49 writes sprite slot 141 and base frame 7 into definition record 0x00886d9c",
  },
  {
    id: "type-49-name-storage-offset",
    va: 0x0049012b,
    bytes: "8d 9a f0 17 00 00",
    meaning: "name storage initializer advances to base +0x17f0, which is 0x00aa5808",
  },
  {
    id: "type-49-name-source",
    va: 0x0049013f,
    bytes: "bf d8 80 4c 00",
    meaning: "name storage initializer copies the CP949 string at 0x004c80d8",
  },
  {
    id: "generic-building-body-state-branch",
    va: 0x004292ba,
    bytes: "66 83 be 50 02 00 00 00",
    meaning: "generic building initialization branches on WORD entity+0x250",
  },
  {
    id: "generic-building-healthy-frame",
    va: 0x004292db,
    bytes: "6a 01 66 8b 88 16 2e 88 00 66 8b 90 14 2e 88 00",
    meaning: "the healthy branch reads the type definition base frame and sprite slot",
  },
  {
    id: "generic-building-damaged-frame",
    va: 0x00429709,
    bytes: "6a 01 66 8b 88 16 2e 88 00 66 8b 90 14 2e 88 00 66 41",
    meaning: "the damaged branch increments the type definition base frame by one",
  },
  {
    id: "construction-progress-read-and-first-threshold",
    va: 0x0041aa9d,
    bytes: "8a 8e 8c 00 00 00 c6 46 03 0c 80 f9 0a",
    meaning: "construction state reads signed BYTE entity+0x8c and begins with the 10-percent boundary",
  },
  {
    id: "construction-threshold-20",
    va: 0x0041aac7,
    bytes: "80 f9 14",
    meaning: "construction phase 1 ends at 20 percent",
  },
  {
    id: "construction-threshold-30",
    va: 0x0041aae0,
    bytes: "80 f9 1e",
    meaning: "construction phase 2 ends at 30 percent",
  },
  {
    id: "construction-threshold-40",
    va: 0x0041aaf5,
    bytes: "80 f9 28",
    meaning: "construction phase 3 ends at 40 percent",
  },
  {
    id: "construction-threshold-50",
    va: 0x0041ab0a,
    bytes: "80 f9 32",
    meaning: "construction phase 4 ends at 50 percent",
  },
  {
    id: "construction-threshold-70",
    va: 0x0041ab1f,
    bytes: "80 f9 46",
    meaning: "construction phase 5 ends at 70 percent",
  },
  {
    id: "construction-threshold-100",
    va: 0x0041ab34,
    bytes: "80 f9 64",
    meaning: "construction phase 6 ends at 100 percent",
  },
  {
    id: "construction-phase-frame-write",
    va: 0x0041ab57,
    bytes: "66 89 86 b2 01 00 00 66 89 46 34 c6 46 04 01",
    meaning: "the selected phase is written to entity+0x1b2 and construction frame phase entity+0x34",
  },
  {
    id: "construction-state-render-dispatch",
    va: 0x0041d249,
    bytes: "e9 92 d7 ff ff",
    meaning: "animation state 12 dispatches to the construction frame selector at 0x0041a9e0",
  },
  {
    id: "construction-frame-render-selection",
    va: 0x0041a9e0,
    bytes: "66 8b 81 b2 04 00 00 66 8b 51 34 66 89 41 0a 66 8b 81 b4 04 00 00 66 03 d0 56 66 89 51 0c",
    meaning: "construction rendering writes sprite slot +0x0a and frame +0x0c as phase + configured frame offset",
  },
  {
    id: "generic-building-construction-slot-and-offset",
    va: 0x004297f9,
    bytes: "66 8b 88 14 2e 88 00 66 89 8e b2 04 00 00 66 8b 90 16 2e 88 00 66 83 ea 07 66 89 96 b4 04 00 00",
    meaning: "generic buildings configure construction sprite slot from the type and frame offset as baseFrame - 7",
  },
  {
    id: "renderer-slot-and-frame-read",
    va: 0x00420000,
    bytes: "0f bf 46 0a 0f bf 56 0c",
    meaning: "the entity renderer consumes the selected sprite slot +0x0a and frame +0x0c",
  },
  {
    id: "damage-effective-health-inputs",
    va: 0x0043bd7c,
    bytes: "f6 c1 02 0f 84 db 02 00 00 0f be 86 8c 00 00 00 0f bf 4e 3c",
    meaning: "damage selection requires flag 0x2 and reads construction percent plus maximum health",
  },
  {
    id: "damage-current-health-and-strict-boundary",
    va: 0x0043bdae,
    bytes: "0f bf 56 3e 8d 0c 80 b8 1f 85 eb 51 d1 e1 03 da f7 e9 c1 fa 05 8b c2 c1 e8 1f 03 d0 3b da 0f 8d 5e 02 00 00",
    meaning: "effective health is compared with floor(maxHealth*50/100), with equality taking the healthy branch",
  },
  {
    id: "damage-state-enter",
    va: 0x0043bdd4,
    bytes: "66 39 9e 50 02 00 00 75 12 8b ce 66 89 be 50 02 00 00 e8 e5 d3 fe ff c6 46 04 01",
    meaning: "below the threshold, state WORD +0x250 becomes 1 and animation setup is rebuilt",
  },
  {
    id: "damage-state-leave",
    va: 0x0043c030,
    bytes: "66 39 be 50 02 00 00 75 14 8b ce 66 c7 86 50 02 00 00 00 00 e8 87 d1 fe ff c6 46 04 01",
    meaning: "at or above the threshold, state WORD +0x250 returns to 0 and animation setup is rebuilt",
  },
];

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const report = extractBuildingStatePilot({
    executablePath: args.input ?? DEFAULT_EXECUTABLE_PATH,
    spritePath: args.sprite ?? DEFAULT_SPRITE_PATH,
    jumpTablesPath: args.jumpTables ?? DEFAULT_JUMP_TABLES_PATH,
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
}

export function extractBuildingStatePilot({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  spritePath = DEFAULT_SPRITE_PATH,
  jumpTablesPath = DEFAULT_JUMP_TABLES_PATH,
} = {}) {
  const { buffer: executableBuffer, image } = readPeImage(executablePath);
  const executableSha256 = sha256(executableBuffer);
  assertEqual(executableSha256, EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);

  const spriteBuffer = readFileSync(spritePath);
  const spriteSha256 = sha256(spriteBuffer);
  assertEqual(spriteSha256, EXPECTED_SPRITE_SHA256, `${spritePath} SHA-256`);
  const spriteHeader = parseSpriteLikeHeader(spriteBuffer, spritePath);

  const evidencePoints = STATIC_EVIDENCE.map((point) => readEvidencePoint(executableBuffer, image, point));
  const mismatch = evidencePoints.find((point) => !point.matched);
  if (mismatch) {
    throw new Error(
      `Static evidence mismatch at ${mismatch.va} (${mismatch.id}): expected ${mismatch.expectedBytes}, got ${mismatch.actualBytes}`,
    );
  }

  const jumpTables = readJumpTables(jumpTablesPath);
  const classSwitch = findSwitch(jumpTables, 0x004291d0, 0x004292b3);
  const classCase = requireCase(classSwitch, BUILDING_IDENTITY.internalClass);
  assertEqual(classCase.destination, toHex(0x004292ba), "internal class 49 generic building initializer destination");

  const resourceBinding = extractResourceBinding(executableBuffer, image);
  assertEqual(resourceBinding.sourcePath, BUILDING_IDENTITY.sourcePath, "runtime sprite slot 141 source path");

  const originalGameplayName = readEncodedCString(executableBuffer, image, 0x004c80d8, "euc-kr");
  assertEqual(originalGameplayName, BUILDING_IDENTITY.originalGameplayName, "internal class 49 gameplay name");

  return {
    analysisStatus: "static-confirmed-for-korean-hq-body-states",
    identity: {
      ...BUILDING_IDENTITY,
      typeDefinitionAddress: toHex(BUILDING_IDENTITY.typeDefinitionAddress),
      namePointer: toHex(BUILDING_IDENTITY.namePointer),
      gameplayNameStatus: "static-confirmed",
      projectVisualBindingStatus: "static-confirmed-for-scoped-body-states",
    },
    sources: {
      executable: {
        path: executablePath,
        sha256: executableSha256,
      },
      sprite: {
        path: spritePath,
        embeddedPath: resourceBinding.sourcePath,
        sha256: spriteSha256,
        width: spriteHeader.width,
        height: spriteHeader.height,
        frameCount: spriteHeader.frameCount,
      },
      jumpTables: {
        path: jumpTablesPath,
      },
    },
    typeDefinition: {
      tableAddress: toHex(0x00882e10),
      recordStride: 0x014c,
      recordAddress: toHex(BUILDING_IDENTITY.typeDefinitionAddress),
      spriteSlotField: "+0x04",
      baseFrameField: "+0x06",
      flagsField: "+0x4c",
      namePointerField: "+0x6c",
      flags: "0x00710082",
      damageSelectionFlag: "0x00000002",
      nameSourcePointer: toHex(0x004c80d8),
      originalGameplayName,
    },
    entityFields: {
      constructionPercent: "+0x8c",
      maximumHealth: "+0x3c",
      currentHealth: "+0x3e",
      bodyDamageState: "+0x250",
      constructionPhase: "+0x1b2",
      constructionFramePhase: "+0x34",
      constructionSpriteSlot: "+0x4b2",
      constructionFrameOffset: "+0x4b4",
      renderSpriteSlot: "+0x0a",
      renderFrame: "+0x0c",
    },
    resourceBinding,
    construction: {
      functionEntry: toHex(0x0041aa90),
      frameSelectorFunction: toHex(0x0041a9e0),
      renderFormula: "renderFrame = constructionPhase + (typeBaseFrame - 7)",
      koreanHqRenderFormula: "renderFrame = constructionPhase + (7 - 7) = constructionPhase",
      phaseThresholdPercentages: CONSTRUCTION_PHASE_THRESHOLDS,
      phaseFrames: CONSTRUCTION_PHASE_THRESHOLDS.map((minimumPercent, frameIndex) => ({
        frameIndex,
        minimumPercent,
        maximumPercent: frameIndex === CONSTRUCTION_PHASE_THRESHOLDS.length - 1
          ? 100
          : CONSTRUCTION_PHASE_THRESHOLDS[frameIndex + 1] - 1,
      })),
    },
    completedBody: {
      initializerFunction: toHex(0x004291d0),
      updateFunction: toHex(0x0043b4d0),
      healthyFrame: BUILDING_IDENTITY.healthyFrame,
      damagedFrame: BUILDING_IDENTITY.damagedFrame,
      damageFormula:
        "effectiveHealth = (100 - constructionPercent) * trunc(maximumHealth / 100) + currentHealth",
      thresholdFormula: "threshold = trunc(maximumHealth * 50 / 100)",
      damagedWhen: "effectiveHealth < threshold",
      boundary: "effectiveHealth == threshold is healthy",
    },
    testVectors: buildTestVectors(),
    evidencePoints,
  };
}

export function selectConstructionPhase(constructionPercent) {
  if (!Number.isInteger(constructionPercent) || constructionPercent < 0 || constructionPercent > 100) {
    throw new RangeError(`Construction percent ${constructionPercent} is outside integer range 0..100`);
  }

  let phase = 0;
  for (let index = 1; index < CONSTRUCTION_PHASE_THRESHOLDS.length; index += 1) {
    const threshold = CONSTRUCTION_PHASE_THRESHOLDS[index];
    if (constructionPercent < threshold) {
      break;
    }
    phase = index;
  }
  return phase;
}

export function selectBuildingBodyFrame({ constructionPercent, maximumHealth, currentHealth }) {
  for (const [label, value] of Object.entries({ constructionPercent, maximumHealth, currentHealth })) {
    if (!Number.isInteger(value)) {
      throw new TypeError(`${label} must be an integer, got ${value}`);
    }
  }
  if (constructionPercent < 0 || constructionPercent > 100) {
    throw new RangeError(`Construction percent ${constructionPercent} is outside integer range 0..100`);
  }
  if (maximumHealth <= 0) {
    throw new RangeError(`Maximum health must be positive, got ${maximumHealth}`);
  }

  const effectiveHealth = (100 - constructionPercent) * Math.trunc(maximumHealth / 100) + currentHealth;
  const threshold = Math.trunc(maximumHealth * 50 / 100);
  const damaged = effectiveHealth < threshold;

  return {
    constructionPercent,
    maximumHealth,
    currentHealth,
    effectiveHealth,
    threshold,
    damaged,
    frameIndex: damaged ? BUILDING_IDENTITY.damagedFrame : BUILDING_IDENTITY.healthyFrame,
  };
}

function extractResourceBinding(buffer, image) {
  const pointerTable = 0x004bc094;
  const runtimeRecordBase = 0x0088c0b8;
  const runtimeRecordStride = 0x0bf8;
  const slot = BUILDING_IDENTITY.spriteSlot;
  const pointerCellVa = pointerTable + slot * 4;
  const pointerCellOffset = requireRawOffset(image, pointerCellVa);
  const sourcePathVa = buffer.readUInt32LE(pointerCellOffset);
  const sourcePathOffset = requireRawOffset(image, sourcePathVa);

  return {
    loaderFunction: toHex(0x00443360),
    pointerTable: toHex(pointerTable),
    slot,
    pointerCell: toHex(pointerCellVa),
    sourcePathPointer: toHex(sourcePathVa),
    sourcePath: readCString(buffer, sourcePathOffset),
    runtimeRecordBase: toHex(runtimeRecordBase),
    runtimeRecordStride,
    runtimeRecordAddress: toHex(runtimeRecordBase + slot * runtimeRecordStride),
  };
}

function buildTestVectors() {
  const construction = [0, 9, 10, 19, 20, 29, 30, 39, 40, 49, 50, 69, 70, 99, 100]
    .map((constructionPercent) => ({
      constructionPercent,
      frameIndex: selectConstructionPhase(constructionPercent),
    }));
  const completedBody = [
    { constructionPercent: 100, maximumHealth: 1_500, currentHealth: 1_500 },
    { constructionPercent: 100, maximumHealth: 1_500, currentHealth: 750 },
    { constructionPercent: 100, maximumHealth: 1_500, currentHealth: 749 },
    { constructionPercent: 50, maximumHealth: 1_500, currentHealth: 0 },
    { constructionPercent: 90, maximumHealth: 1_500, currentHealth: 599 },
  ].map(selectBuildingBodyFrame);

  return { construction, completedBody };
}

function readEncodedCString(buffer, image, va, encoding) {
  const offset = requireRawOffset(image, va);
  let end = offset;
  while (end < buffer.length && buffer[end] !== 0) {
    end += 1;
  }
  if (end === buffer.length) {
    throw new Error(`Unterminated ${encoding} string at ${toHex(va)}`);
  }
  return new TextDecoder(encoding, { fatal: true }).decode(buffer.subarray(offset, end));
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
  console.log(`Building state pilot: ${report.identity.originalGameplayName} (class ${report.identity.internalClass})`);
  console.log(`  source: slot ${report.identity.spriteSlot} -> ${report.sources.sprite.embeddedPath}`);
  console.log(`  construction frames: 0..${report.identity.healthyFrame}`);
  console.log(`  completed body: healthy ${report.identity.healthyFrame}, damaged ${report.identity.damagedFrame}`);
  console.log(`  static evidence points: ${report.evidencePoints.length} matched`);
}
