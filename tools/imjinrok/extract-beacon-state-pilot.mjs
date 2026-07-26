#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseSpriteLikeHeader } from "./codec.mjs";
import {
  CONSTRUCTION_PHASE_THRESHOLDS,
  extractBuildingStatePilot,
  selectBuildingBodyFrame,
  selectConstructionPhase,
} from "./extract-building-state-pilot.mjs";
import { extractEntityTypeCatalog } from "./extract-entity-type-catalog.mjs";
import { toHex } from "./pe-image.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_SPRITE_PATH = "original/imjinrok2/char/firehousek.spr";
const DEFAULT_SEEDS_PATH = "analysis/generated/imjinrok2/seeds.json";
const DEFAULT_JUMP_TABLES_PATH =
  "analysis/generated/imjinrok2/jump-tables.json";

export const EXPECTED_BEACON_SPRITE_SHA256 =
  "ac6621124bbf2106a5d9309499da7701a5c4e5223692dd2f4f51e2e9c1ab97aa";

export const BEACON_IDENTITY = {
  internalClass: 52,
  originalGameplayName: "조선 봉화대",
  spriteSlot: 113,
  sourcePath: "char\\firehousek.spr",
  baseFrame: 7,
  healthyFrame: 7,
  damagedFrame: 8,
  damageSelectionFlag: 0x00000002,
};

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = parseArgs(process.argv.slice(2));
  const report = extractBeaconStatePilot({
    executablePath: args.input ?? DEFAULT_EXECUTABLE_PATH,
    spritePath: args.sprite ?? DEFAULT_SPRITE_PATH,
    seedsPath: args.seeds ?? DEFAULT_SEEDS_PATH,
    jumpTablesPath: args.jumpTables ?? DEFAULT_JUMP_TABLES_PATH,
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printSummary(report);
  }
}

export function extractBeaconStatePilot({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  spritePath = DEFAULT_SPRITE_PATH,
  seedsPath = DEFAULT_SEEDS_PATH,
  jumpTablesPath = DEFAULT_JUMP_TABLES_PATH,
} = {}) {
  const typeCatalog = extractEntityTypeCatalog({
    executablePath,
    seedsPath,
  });
  const type = typeCatalog.types.find(
    (candidate) =>
      candidate.internalClass === BEACON_IDENTITY.internalClass,
  );
  if (!type) {
    throw new Error(
      `Entity type catalog is missing class ${BEACON_IDENTITY.internalClass}`,
    );
  }
  assertEqual(
    type.originalGameplayName,
    BEACON_IDENTITY.originalGameplayName,
    "class 52 original name",
  );
  assertEqual(
    type.sprite.slot,
    BEACON_IDENTITY.spriteSlot,
    "class 52 sprite slot",
  );
  assertEqual(
    type.sprite.sourcePath,
    BEACON_IDENTITY.sourcePath,
    "class 52 source path",
  );
  assertEqual(
    type.sprite.baseFrame,
    BEACON_IDENTITY.baseFrame,
    "class 52 base frame",
  );

  const flags = Number(type.definition.flags);
  if ((flags & BEACON_IDENTITY.damageSelectionFlag) === 0) {
    throw new Error(
      `Class 52 flags ${type.definition.flags} do not include damage selection flag ${toHex(BEACON_IDENTITY.damageSelectionFlag)}`,
    );
  }

  const jumpTableAnalysis = readJumpTables(
    jumpTablesPath,
    typeCatalog.source.executableSha256,
  );
  const classSwitch = findSwitch(
    jumpTableAnalysis.tables,
    0x004291d0,
    0x004292b3,
  );
  const classCase = requireCase(
    classSwitch,
    BEACON_IDENTITY.internalClass,
  );
  assertEqual(
    classCase.destination,
    toHex(0x004292ba),
    "class 52 generic building initializer destination",
  );

  const genericBuildingEvidence = extractBuildingStatePilot({
    executablePath,
    jumpTablesPath,
  });
  const spriteBuffer = readFileSync(spritePath);
  const spriteSha256 = sha256(spriteBuffer);
  assertEqual(
    spriteSha256,
    EXPECTED_BEACON_SPRITE_SHA256,
    `${spritePath} SHA-256`,
  );
  const spriteHeader = parseSpriteLikeHeader(spriteBuffer, spritePath);

  return {
    schemaVersion: 1,
    evidenceStatus: "static-proven-for-korean-beacon-body-states",
    analysisScope:
      "Class 52 identity, construction frames, healthy frame, and damaged frame only. Frames 9..15, pivot, overlays, and effects remain unverified.",
    identity: {
      ...BEACON_IDENTITY,
      definitionRecordAddress: type.definition.recordAddress,
      initializerCallAddress: type.definition.initializerCallAddress,
      flags: type.definition.flags,
      classSwitchDestination: classCase.destination,
    },
    sources: {
      executable: typeCatalog.source,
      sprite: {
        path: spritePath,
        embeddedPath: type.sprite.sourcePath,
        sha256: spriteSha256,
        width: spriteHeader.width,
        height: spriteHeader.height,
        frameCount: spriteHeader.frameCount,
      },
      jumpTables: {
        path: jumpTablesPath,
        sourceSha256: jumpTableAnalysis.sourceSha256,
      },
    },
    construction: {
      functionEntry:
        genericBuildingEvidence.construction.functionEntry,
      frameSelectorFunction:
        genericBuildingEvidence.construction.frameSelectorFunction,
      phaseThresholdPercentages: CONSTRUCTION_PHASE_THRESHOLDS,
      phaseFrames:
        genericBuildingEvidence.construction.phaseFrames,
      renderFormula:
        "renderFrame = constructionPhase + (typeBaseFrame - 7) = constructionPhase",
    },
    completedBody: {
      initializerFunction:
        genericBuildingEvidence.completedBody.initializerFunction,
      updateFunction:
        genericBuildingEvidence.completedBody.updateFunction,
      healthyFrame: BEACON_IDENTITY.healthyFrame,
      damagedFrame: BEACON_IDENTITY.damagedFrame,
      damageFormula:
        genericBuildingEvidence.completedBody.damageFormula,
      thresholdFormula:
        genericBuildingEvidence.completedBody.thresholdFormula,
      damagedWhen: genericBuildingEvidence.completedBody.damagedWhen,
      boundary: genericBuildingEvidence.completedBody.boundary,
    },
    testVectors: {
      construction:
        genericBuildingEvidence.testVectors.construction,
      completedBody:
        genericBuildingEvidence.testVectors.completedBody,
    },
  };
}

export function selectBeaconConstructionFrame(constructionPercent) {
  return selectConstructionPhase(constructionPercent);
}

export function selectBeaconBodyFrame(inputs) {
  return selectBuildingBodyFrame(inputs);
}

function readJumpTables(path, expectedSourceSha256) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(
      `Cannot read static jump tables from ${path}: ${error.message}`,
      { cause: error },
    );
  }
  if (!parsed.tables || typeof parsed.tables !== "object") {
    throw new Error(
      `${path} does not contain a jump-tables 'tables' object`,
    );
  }
  assertEqual(
    parsed.sourceSha256,
    expectedSourceSha256,
    `${path} source SHA-256`,
  );
  return {
    sourceSha256: parsed.sourceSha256,
    tables: Object.values(parsed.tables),
  };
}

function findSwitch(tables, functionEntry, switchAddress) {
  const table = tables.find(
    (candidate) =>
      candidate.functionEntry === toHex(functionEntry) &&
      candidate.switchAddress === toHex(switchAddress),
  );
  if (!table) {
    throw new Error(
      `Missing jump table for ${toHex(functionEntry)} switch ${toHex(switchAddress)}`,
    );
  }
  return table;
}

function requireCase(table, label) {
  const switchCase = table.cases.find(
    (candidate) => candidate.label === label,
  );
  if (!switchCase) {
    throw new Error(`Switch ${table.switchAddress} has no case ${label}`);
  }
  return switchCase;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(
      `${label} mismatch: expected ${expected}, got ${actual}`,
    );
  }
}

function parseArgs(argv) {
  const parsed = {};
  const pathArgumentKeys = {
    "--input": "input",
    "--jump-tables": "jumpTables",
    "--seeds": "seeds",
    "--sprite": "sprite",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    const key = pathArgumentKeys[arg];
    if (key) {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${arg} requires a path`);
      }
      parsed[key] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function printSummary(report) {
  console.log(
    `Beacon state pilot: ${report.identity.originalGameplayName} (class ${report.identity.internalClass})`,
  );
  console.log(
    `  source: slot ${report.identity.spriteSlot} -> ${report.sources.sprite.embeddedPath}`,
  );
  console.log(
    `  body frames: healthy ${report.completedBody.healthyFrame}, damaged ${report.completedBody.damagedFrame}`,
  );
}
