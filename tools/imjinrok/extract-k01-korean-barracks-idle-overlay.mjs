#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseSpriteLikeHeader } from "./codec.mjs";
import { extractEntityTypeCatalog } from "./extract-entity-type-catalog.mjs";
import { readPeImage } from "./pe-image.mjs";
import {
  assertEqual,
  readJson,
  verifyEvidencePoint,
  verifyRawCodeRange,
  verifySeededFunction,
} from "./static-evidence.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_SPRITE_PATH = "original/imjinrok2/char/barrackk.spr";
const DEFAULT_SEEDS_PATH = "analysis/generated/imjinrok2/seeds.json";
const DEFAULT_JUMP_TABLES_PATH = "analysis/generated/imjinrok2/jump-tables.json";

export const EXPECTED_EXECUTABLE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_BARRACKS_SPRITE_SHA256 =
  "076f727dd2d35125a0acbe7ce02d89440d93873e8fd83699bdd4813f7895bc48";

export const KOREAN_BARRACKS = {
  internalClass: 50,
  originalGameplayName: "조선 훈련소",
  spriteSlot: 108,
  baseFrame: 7,
  sourcePath: "char\\barrackk.spr",
  definitionRecordAddress: "0x00886ee8",
};

const SEEDED_FUNCTIONS = [
  {
    entry: "0x004291d0",
    bodyRange: "0x004291d0-0x0042c547",
    blockCount: 88,
    instructionCount: 4156,
    bodySha256: "aaa362d16293e4e14f779ee0d06084e0fc343ef83da411f22b67bd0a3e133b8c",
  },
  {
    entry: "0x0041fdb0",
    bodyRange: "0x0041fdb0-0x00420839",
    blockCount: 67,
    instructionCount: 771,
    bodySha256: "15d55f819b04e813e4695190801e1ed33774f071ed62ecd5b83281fa9d4e032a",
  },
];

const RAW_RANGES = [
  {
    id: "generic-building-state-configuration",
    start: 0x004292ba,
    endExclusive: 0x0042981d,
    sha256: "008d8f161b8f2e073406d7f6361aed88795d452c548e527d522e45a04c9f60a0",
  },
  {
    id: "idle-primary-frame-selector",
    start: 0x0041d870,
    endExclusive: 0x0041d977,
    sha256: "f41066de45daf3fca974f594ad4697568fbf55c20f91f4eb296b8016e91b24ab",
  },
];

const STATIC_EVIDENCE = [
  {
    va: 0x0045e458,
    bytes: "6a 07 6a 6c b9 e8 6e 88 00 e8 9a d8 ff ff",
    meaning: "class 50 definition receives base frame 7, sprite slot 108, and record 0x00886ee8",
  },
  {
    va: 0x004292ba,
    bytes: "66 83 be 50 02 00 00 00 8d 0c 80 c6 86 92 00 00 00 01",
    meaning: "the class-50 generic building target gates its primary configuration on WORD entity+0x250 and sets the one-entry count",
  },
  {
    va: 0x004292db,
    bytes: "6a 01 66 8b 88 16 2e 88 00 66 8b 90 14 2e 88 00 51 52 6a 00 8b ce e8 8a fb 00 00",
    meaning: "the healthy generic path stores the type base frame and sprite slot into primary configuration channel zero",
  },
  {
    va: 0x00429706,
    bytes: "c1 e0 02 6a 01 66 8b 88 16 2e 88 00 66 8b 90 14 2e 88 00 66 41",
    meaning: "the nonzero damage-state path uses type base frame plus one, not frames 9 through 15",
  },
  {
    va: 0x004297e0,
    bytes: "66 c7 86 b0 04 00 00 08 00 8a 46 37",
    meaning: "generic building setup records construction-frame count eight before loading the type slot and base-frame offset",
  },
  {
    va: 0x0041d221,
    bytes: "e9 4a 06 00 00",
    meaning: "animation states 8 and 9 dispatch to the primary idle selector at 0x0041d870",
  },
  {
    va: 0x0041d880,
    bytes: "66 0f b6 81 93 00 00 00 66 89 41 0a",
    meaning: "the primary idle selector writes exactly one configured sprite slot to render field +0x0a",
  },
  {
    va: 0x0041d8ac,
    bytes: "66 8b 81 b2 01 00 00 c6 81 b5 01 00 00 00 66 03 81 94 00 00 00 66 89 41 0c",
    meaning: "the primary idle selector adds its current phase to the configured frame offset and writes one render frame to +0x0c",
  },
  {
    va: 0x00420000,
    bytes: "0f bf 46 0a 0f bf 56 0c",
    meaning: "the entity renderer consumes the selected slot +0x0a and frame +0x0c for its draw branches",
  },
];

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const report = extractKoreanBarracksIdleOverlay({
    executablePath: args.input ?? DEFAULT_EXECUTABLE_PATH,
    spritePath: args.sprite ?? DEFAULT_SPRITE_PATH,
    seedsPath: args.seeds ?? DEFAULT_SEEDS_PATH,
    jumpTablesPath: args.jumpTables ?? DEFAULT_JUMP_TABLES_PATH,
  });
  console.log(args.json ? JSON.stringify(report, null, 2) : printSummary(report));
}

export function extractKoreanBarracksIdleOverlay({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  spritePath = DEFAULT_SPRITE_PATH,
  seedsPath = DEFAULT_SEEDS_PATH,
  jumpTablesPath = DEFAULT_JUMP_TABLES_PATH,
} = {}) {
  const { buffer: executableBuffer, image } = readPeImage(executablePath);
  const executableSha256 = sha256(executableBuffer);
  assertEqual(executableSha256, EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);

  const spriteBuffer = readFileSync(spritePath);
  const spriteSha256 = sha256(spriteBuffer);
  assertEqual(spriteSha256, EXPECTED_BARRACKS_SPRITE_SHA256, `${spritePath} SHA-256`);
  const spriteHeader = parseSpriteLikeHeader(spriteBuffer, spritePath);

  const seeds = readJson(seedsPath);
  assertEqual(seeds.sourceSha256, executableSha256, `${seedsPath} source SHA-256`);
  const seededFunctions = SEEDED_FUNCTIONS.map((expected) =>
    verifySeededFunction(executableBuffer, image, seeds, expected),
  );
  const rawRanges = RAW_RANGES.map((range) => verifyRawCodeRange(executableBuffer, image, range));
  const evidencePoints = STATIC_EVIDENCE.map((point) =>
    verifyEvidencePoint(executableBuffer, image, point),
  );

  const catalog = extractEntityTypeCatalog({ executablePath, seedsPath });
  const type = catalog.types.find((candidate) => candidate.internalClass === KOREAN_BARRACKS.internalClass);
  if (!type) {
    throw new Error(`Entity type catalog is missing class ${KOREAN_BARRACKS.internalClass}`);
  }
  assertEqual(type.originalGameplayName, KOREAN_BARRACKS.originalGameplayName, "class 50 original name");
  assertEqual(type.sprite.slot, KOREAN_BARRACKS.spriteSlot, "class 50 sprite slot");
  assertEqual(type.sprite.baseFrame, KOREAN_BARRACKS.baseFrame, "class 50 base frame");
  assertEqual(type.sprite.sourcePath, KOREAN_BARRACKS.sourcePath, "class 50 source path");
  assertEqual(type.definition.recordAddress, KOREAN_BARRACKS.definitionRecordAddress, "class 50 definition record");

  const jumpTables = readJson(jumpTablesPath);
  assertEqual(jumpTables.sourceSha256, executableSha256, `${jumpTablesPath} source SHA-256`);
  const classSwitch = requireTable(jumpTables, "0x004291d0", "0x004292b3");
  assertEqual(requireCase(classSwitch, 50).destination, "0x004292ba", "class 50 generic-building target");
  const animationSwitch = requireTable(jumpTables, "0x0041d210", "0x0041d21a");
  assertEqual(requireCase(animationSwitch, 8).destination, "0x0041d221", "state 8 idle dispatch");
  assertEqual(requireCase(animationSwitch, 9).destination, "0x0041d221", "state 9 idle dispatch");

  return {
    schemaVersion: 1,
    analysisStatus: "partially-static-confirmed",
    analysisScope: "Class 50 source identity and its generic primary body configuration through the state-8/9 selector and entity renderer. This does not establish the primary currentPhase producer/cadence or prove an absent independent effect/compositor path outside that data flow.",
    sources: {
      executable: { path: executablePath, sha256: executableSha256 },
      sprite: {
        path: spritePath,
        sha256: spriteSha256,
        width: spriteHeader.width,
        height: spriteHeader.height,
        frameCount: spriteHeader.frameCount,
        inspectedFrameRange: { start: 9, endInclusive: 15 },
      },
    },
    identity: {
      ...KOREAN_BARRACKS,
      flags: type.definition.flags,
    },
    primaryBody: {
      classSwitchFunction: "0x004291d0",
      classSwitchAddress: "0x004292b3",
      classSwitchDestination: "0x004292ba",
      damageStateField: "+0x250",
      healthy: selectPrimaryBodyConfiguration(0),
      nonzeroDamageState: selectPrimaryBodyConfiguration(1),
      idleStateValues: [8, 9],
      idleSelectorFunction: "0x0041d870",
      renderSlotField: "+0x0a",
      renderFrameField: "+0x0c",
      compositorOrder: "The verified primary path selects one slot/frame pair before the renderer's clipping/owner branches. No second class-50 slot/frame pair is configured in the generic class-50 branch.",
    },
    overlayConclusion: {
      status: "not-established",
      candidateSpriteFrames: [9, 10, 11, 12, 13, 14, 15],
      confirmedBinding: null,
      cadence: null,
      loop: null,
      placement: null,
      compositorOrder: null,
      stateGates: null,
      reason: "The verified class-50 initializer configures slot 108 with offset 7 (or 8 when WORD +0x250 is nonzero), while the state-8/9 selector computes renderFrame = currentPhase + configuredFrameOffset. Frames 9..15 could therefore require either an unresolved primary currentPhase producer/cadence on the same slot or an independent second draw; neither route is established.",
      productIntegration: "Do not restore a 9..15 overlay from visual similarity. A product mapping needs either the primary currentPhase writer/cadence/loop that selects those frames on slot 108, or a source-side second-draw producer with its gate, cadence, placement, and order.",
    },
    reproductionVectors: [selectPrimaryBodyConfiguration(0), selectPrimaryBodyConfiguration(1)],
    evidence: { seededFunctions, rawRanges, evidencePoints },
  };
}

export function selectPrimaryBodyConfiguration(bodyDamageState) {
  if (!Number.isInteger(bodyDamageState) || bodyDamageState < 0 || bodyDamageState > 0xffff) {
    throw new RangeError(`bodyDamageState must be an unsigned WORD in 0..65535, got ${bodyDamageState}`);
  }
  const damaged = bodyDamageState !== 0;
  return {
    bodyDamageState,
    spriteSlot: KOREAN_BARRACKS.spriteSlot,
    configuredFrameOffset: KOREAN_BARRACKS.baseFrame + (damaged ? 1 : 0),
    primaryConfigurationMode: 1,
    renderFrameFormula: "renderFrame = currentPhase + configuredFrameOffset",
  };
}

function requireTable(jumpTables, functionEntry, switchAddress) {
  const table = Object.values(jumpTables.tables ?? {}).find(
    (candidate) => candidate.functionEntry === functionEntry && candidate.switchAddress === switchAddress,
  );
  if (!table) {
    throw new Error(`Missing jump table ${functionEntry} at ${switchAddress}`);
  }
  return table;
}

function requireCase(table, label) {
  const entry = table.cases.find((candidate) => candidate.label === label);
  if (!entry) {
    throw new Error(`Missing jump-table case ${label} at ${table.switchAddress}`);
  }
  return entry;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (arg === "--input" || arg === "--sprite" || arg === "--seeds" || arg === "--jump-tables") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${arg} requires a path`);
      }
      parsed[arg === "--input" ? "input" : arg === "--jump-tables" ? "jumpTables" : arg.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function printSummary(report) {
  return [
    `Korean barracks class ${report.identity.internalClass}: slot ${report.identity.spriteSlot}, configured offset ${report.primaryBody.healthy.configuredFrameOffset}`,
    `overlay 9..15: ${report.overlayConclusion.status}`,
  ].join("\n");
}
