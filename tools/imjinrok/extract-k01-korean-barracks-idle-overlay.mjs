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
  {
    entry: "0x00437650",
    bodyRange: "0x00437650-0x00438025",
    blockCount: 39,
    instructionCount: 539,
    bodySha256: "16282bd634d28738d1f1e5eba179069f154537c1c86ce7fbcf57aa1f54bd5fd6",
  },
  {
    entry: "0x0043c300",
    bodyRange: "0x0043c300-0x0043c9b1",
    blockCount: 90,
    instructionCount: 524,
    bodySha256: "58058d5b317f151334c5e9190703a5ed7b8aa88cce02a8be36ffa7746f75b756",
  },
  {
    entry: "0x0043c9c0",
    bodyRange: "0x0043c9c0-0x0043d35f",
    blockCount: 143,
    instructionCount: 684,
    bodySha256: "722a1b8544178408f988bd70b5a221408ffc8064acf142c719723bf92db81c4d",
  },
  {
    entry: "0x00447360",
    bodyRange: "0x00447360-0x00447599",
    blockCount: 35,
    instructionCount: 156,
    bodySha256: "a0f7e7b9b9a6cc54bcd994921b60e94bb2f34a2a85f581ec0371a777887e79fb",
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
  {
    id: "class-50-primary-phase-setup",
    start: 0x004292ba,
    endExclusive: 0x0042981d,
    sha256: "008d8f161b8f2e073406d7f6361aed88795d452c548e527d522e45a04c9f60a0",
  },
  {
    id: "class-50-primary-phase-producer",
    start: 0x0043c300,
    endExclusive: 0x0043c373,
    sha256: "17a0f8060bada7a31d0dc7fb218c4a55be39e2c41388ffb13d6d4ce6c20cc345",
  },
  {
    id: "class-50-unreached-state-9-producer",
    start: 0x0043cd32,
    endExclusive: 0x0043cd88,
    sha256: "18f944322d73f0935b665474985cb786659f98740711d35608ce327fb8236d0a",
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
    va: 0x004292c5,
    bytes: "c6 86 92 00 00 00 01",
    meaning: "the class-50 generic building configuration sets BYTE entity+0x92, the primary phase divisor, to one",
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
  {
    va: 0x00437813,
    bytes: "66 89 9e b2 01 00 00",
    meaning: "the 0x558-byte entity constructor initializes WORD entity+0x1b2 to zero before class configuration",
  },
  {
    va: 0x00437ba0,
    bytes: "8b 90 5c 2e 88 00 89 56 74",
    meaning: "the constructor copies the class definition DWORD flags to entity+0x74; class 50 supplies 0x00710002",
  },
  {
    va: 0x0044748d,
    bytes: "69 c9 58 05 00 00 81 c1 58 52 63 00 e8 22 55 ff ff",
    meaning: "the outer updater converts each active-list slot to the 0x558-byte entity pointer and calls the high-action dispatcher",
  },
  {
    va: 0x0043cda3,
    bytes: "ff 24 95 60 d3 43 00",
    meaning: "the high-action dispatcher uses entity WORD +0x1b0 to select the action-1 update case",
  },
  {
    va: 0x0043cdaa,
    bytes: "8b ce e8 1f e5 ff ff 8b ce e8 48 f5 ff ff",
    meaning: "action 1 reaches the primary phase producer after its footprint clear helper",
  },
  {
    va: 0x0043c323,
    bytes: "f7 43 74 40 00 00 01 75 47",
    meaning: "the primary producer skips its elapsed-time phase path only when entity flags contain 0x01000040; class 50 flags do not",
  },
  {
    va: 0x0043c32c,
    bytes: "8b 83 28 02 00 00 8b 0d 80 5f 7c 00 2b c1 99 33 c2 2b c2 83 f8 05 7c 2f",
    meaning: "the primary producer requires signed absolute difference between entity DWORD +0x228 and global DWORD 0x007c5f80 to be at least five",
  },
  {
    va: 0x0043c344,
    bytes: "66 8b 83 b2 01 00 00 89 8b 28 02 00 00 0f be 8b 92 00 00 00 66 40 c6 43 03 08 0f bf c0 99 f7 f9 c6 43 04 01 66 89 93 b2 01 00 00 66 89 53 34",
    meaning: "on the elapsed-time gate, action 1 records the current tick, sets state 8, and stores signed (phase+1) IDIV BYTE +0x92 remainder to +0x1b2 and +0x34",
  },
  {
    va: 0x0043cd32,
    bytes: "8b 5e 74 f6 c3 40 74 4e",
    meaning: "the distinct state-9 producer begins only if entity flag bit 0x40 is set; class 50's copied 0x00710002 flags make this branch unreached",
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
    schemaVersion: 2,
    analysisStatus: "static-confirmed",
    analysisScope: "Class 50 source identity, initialization, active-list update, action-1 primary phase producer, state-8/9 selector, and entity renderer. This proves the primary slot-108 path cannot select frames 9..15 for the configured class-50 record; it does not prove an absent independent effect/compositor path outside that data flow.",
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
    primaryPhase: buildKoreanBarracksPrimaryPhaseReport(),
    overlayConclusion: {
      status: "primary-path-negative; independent-second-draw-unresolved",
      candidateSpriteFrames: [9, 10, 11, 12, 13, 14, 15],
      confirmedBinding: null,
      cadence: null,
      loop: null,
      placement: null,
      compositorOrder: null,
      stateGates: null,
      reason: "The exact class-50 constructor initializes currentPhase to 0; its generic configuration sets the signed-IDIV divisor BYTE +0x92 to 1 and copies flags 0x00710002. The reached action-1 producer either leaves phase unchanged before the elapsed-time gate or advances 0 to signed remainder 0, then selects state 8. The distinct state-9 producer requires flags bit 0x40, which class 50 lacks. Thus the only primary slot-108 frames are healthy 7 and nonzero-damage 8, never 9..15.",
      productIntegration: "Do not restore a 9..15 overlay from visual similarity or from the primary phase path. The next independent question is whether any world-draw/effect/compositor producer emits a second slot/frame draw for class 50; bind its gate, counter/cadence, frame sequence, placement, and order before product mapping.",
    },
    reproductionVectors: [
      selectPrimaryBodyConfiguration(0),
      selectPrimaryBodyConfiguration(1),
      replayKoreanBarracksPrimaryPhase({ previousPhase: 0, elapsedTicks: 4 }),
      replayKoreanBarracksPrimaryPhase({ previousPhase: 0, elapsedTicks: 5 }),
      replayKoreanBarracksPrimaryPhase({ previousPhase: 0, elapsedTicks: -5 }),
    ],
    evidence: { seededFunctions, rawRanges, evidencePoints },
  };
}

export function buildKoreanBarracksPrimaryPhaseReport() {
  return {
    constructor: {
      currentPhaseField: "+0x1b2",
      initialValue: 0,
      highActionField: "+0x1b0",
      initialHighAction: 1,
      flagsField: "+0x74",
      class50Flags: "0x00710002",
      phaseDivisorField: "+0x92",
      phaseDivisor: 1,
    },
    reachedUpdateCfg: {
      activeListCaller: "0x00447360",
      highActionDispatcher: "0x0043c9c0",
      highAction: 1,
      actionDestination: "0x0043cdaa",
      primaryProducer: "0x0043c300",
      phaseUpdateGate: "active entity and (flags & 0x01000040) == 0 and signedAbs(entity DWORD +0x228 - global DWORD 0x007c5f80) >= 5",
      cadence: "On each reached outer update satisfying the gate, store the current global tick in +0x228; this is an elapsed-tick threshold, not a fixed-FPS cadence.",
      update: "state = 8; currentPhase = signed remainder of (currentPhase + 1) / signed BYTE +0x92; +0x34 receives the same remainder; render-dirty +0x04 = 1",
      class50Result: "Because divisor is 1 and initial phase is 0, every reached phase update stores 0. The primary path loops only the singleton phase 0 and writes state 8, not state 9.",
      state9Alternative: "0x0043cd32-0x0043cd87 has a separate every-third-global-tick state-9 producer, but it requires flags bit 0x40. Class 50 flags 0x00710002 lack that bit, so it is not reached for this configured record.",
    },
    damageInteraction: {
      field: "+0x250",
      healthy: { configuredFrameOffset: 7, frameSequence: [7] },
      nonzero: { configuredFrameOffset: 8, frameSequence: [8] },
      conclusion: "The verified generic configuration changes only the primary offset from 7 to 8. It neither changes the class-50 divisor 1 nor opens the state-9 producer; completed primary phase remains 0.",
    },
  };
}

export function replayKoreanBarracksPrimaryPhase({ previousPhase, elapsedTicks }) {
  if (!Number.isInteger(previousPhase) || previousPhase < -0x8000 || previousPhase > 0x7fff) {
    throw new RangeError(`previousPhase must be a signed WORD in -32768..32767, got ${previousPhase}`);
  }
  if (!Number.isInteger(elapsedTicks) || elapsedTicks < -0x80000000 || elapsedTicks > 0x7fffffff) {
    throw new RangeError(`elapsedTicks must be a signed DWORD in -2147483648..2147483647, got ${elapsedTicks}`);
  }
  const updates = elapsedTicks !== -0x80000000 && Math.abs(elapsedTicks) >= 5;
  return {
    previousPhase,
    elapsedTicks,
    phaseDivisor: 1,
    updated: updates,
    nextState: updates ? 8 : null,
    nextPhase: updates ? signedRemainder(previousPhase + 1, 1) : previousPhase,
    primaryFrameHealthy: updates ? 7 : null,
    primaryFrameNonzeroDamage: updates ? 8 : null,
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

function signedRemainder(dividend, divisor) {
  return dividend % divisor;
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
    `primary frames: healthy ${report.primaryPhase.damageInteraction.healthy.frameSequence.join(",")}, nonzero damage ${report.primaryPhase.damageInteraction.nonzero.frameSequence.join(",")}`,
    `overlay 9..15: ${report.overlayConclusion.status}`,
  ].join("\n");
}
