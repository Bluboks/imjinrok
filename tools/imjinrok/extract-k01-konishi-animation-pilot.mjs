#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseSpriteLikeHeader } from "./codec.mjs";
import {
  EXPECTED_EXECUTABLE_SHA256,
  extractEntityTypeCatalog,
} from "./extract-entity-type-catalog.mjs";
import { extractOriginalSpriteTable } from "./extract-sprite-table.mjs";
import { extractUnitAnimationPilot } from "./extract-unit-animation-pilot.mjs";
import { readPeImage, toHex } from "./pe-image.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_FUNCTIONS_PATH = "analysis/generated/imjinrok2/functions.json";
const DEFAULT_JUMP_TABLES_PATH = "analysis/generated/imjinrok2/jump-tables.json";
const DEFAULT_SEEDS_PATH = "analysis/generated/imjinrok2/seeds.json";
const DEFAULT_PRIMARY_SPRITE_PATH =
  "original/imjinrok2/char/generalj11.spr";
const DEFAULT_IDLE_SPRITE_PATH =
  "original/imjinrok2/char/generalj12.spr";
const DEFAULT_ATTACK_SPRITE_PATH =
  "original/imjinrok2/char/generalj13.spr";

export const EXPECTED_KONISHI = {
  internalClass: 82,
  originalGameplayName: "일본 고니시",
  typeRecordAddress: "0x00889868",
  typeInitializerCall: "0x0045dd2a",
  typeFlags: 0x00880805,
  primary: {
    slot: 165,
    tableIndex: 65,
    pointerCell: "0x004bc328",
    sourcePointer: "0x004bcd6c",
    sourcePath: "char\\generalj11.spr",
    sha256:
      "eff3f8eb3a60c50ea6ac534d90e568bac415526a00f6ca2e287e00bfdf4bb03f",
    width: 140,
    height: 108,
    frameCount: 49,
  },
  idle: {
    slot: 166,
    tableIndex: 66,
    pointerCell: "0x004bc32c",
    sourcePointer: "0x004bcd58",
    sourcePath: "char\\generalj12.spr",
    sha256:
      "914ea581e7ba8ad7d972e19f5089478de0391be1c79288a2f711a238dc28b44f",
    width: 140,
    height: 108,
    frameCount: 36,
  },
  attack: {
    slot: 167,
    tableIndex: 67,
    pointerCell: "0x004bc330",
    sourcePointer: "0x004bcd44",
    sourcePath: "char\\generalj13.spr",
    sha256:
      "43322afcb8f5c90e63925efc2de647a36c5d3663d8a8638bc814a05c241a8b91",
    width: 140,
    height: 108,
    frameCount: 54,
  },
};

export const KONISHI_DIRECTION_PROFILES = [
  { facing: "s", direction: 1, deltaX: 0, deltaY: 1, frameBaseIndex: 0, mirrorX: false },
  { facing: "sw", direction: 5, deltaX: -1, deltaY: 1, frameBaseIndex: 1, mirrorX: false },
  { facing: "w", direction: 4, deltaX: -1, deltaY: 0, frameBaseIndex: 2, mirrorX: false },
  { facing: "nw", direction: 20, deltaX: -1, deltaY: -1, frameBaseIndex: 3, mirrorX: false },
  { facing: "n", direction: 16, deltaX: 0, deltaY: -1, frameBaseIndex: 2, mirrorX: true },
  { facing: "ne", direction: 80, deltaX: 1, deltaY: -1, frameBaseIndex: 1, mirrorX: true },
  { facing: "e", direction: 64, deltaX: 1, deltaY: 0, frameBaseIndex: 0, mirrorX: true },
  { facing: "se", direction: 65, deltaX: 1, deltaY: 1, frameBaseIndex: 4, mirrorX: false },
];

const CLASS_INITIALIZER_FUNCTION = 0x004291d0;
const CLASS_SWITCH_ADDRESS = 0x004292b3;
const CLASS_INITIALIZER_DESTINATION = 0x0042ae03;
const CLASS_INITIALIZER_END = 0x0042aeae;
const STATE_DISPATCH_FUNCTION = 0x0041d210;
const STATE_DISPATCH_SWITCH = 0x0041d21a;
const IDLE_FUNCTION = 0x0041d870;
const IDLE_SWITCH = 0x0041d8a5;
const MOVE_FUNCTION = 0x0041efa0;
const MOVE_SWITCH = 0x0041f1aa;
const DEATH_FUNCTION = 0x0041d700;
const DEATH_SWITCH = 0x0041d724;
const ATTACK_FUNCTION = 0x0041e370;
const ATTACK_CLASS_SWITCH = 0x0041e385;
const ATTACK_DIRECTION_SWITCH = 0x0041e224;
const ATTACK_DEFAULT_GATE = 0x0041e3a0;
const NORMAL_ATTACK_CONSUMER = 0x0041e200;
const STATE_1_MASK = 0x80000008;
const ALTERNATE_MOVEMENT_MASK = 0x04000000;
const IDLE_SPECIAL_MASK = 0x00000008;
const ATTACK_SPECIAL_MASK = 0x80000000;

const FUNCTION_CONTRACTS = [
  ["0x004291d0", ["0x004291d0-0x0042c547"], 4156, "1c05959938219ae4fa918ba3061b1856dcfb575f007a1a48281dd316709a7e96"],
  ["0x00438e50", ["0x00438e50-0x00438e7e"], 24, "4da58c373054099fbed3aa281d63f114a950c90471650f7cf4089bfefc0c1c00"],
  ["0x00438ef0", ["0x00438ef0-0x00438f1e"], 24, "31db374f6bdbf9efb342ff3b4ac12b2d2ba14487c66f46933dc3004826cf2bac"],
  ["0x004390b0", ["0x004390b0-0x004390d0"], 6, "8c576d98214fa38d4d64c0dc710a6e1452a92ceb33e39a9a563567976dd191df"],
  ["0x004390e0", ["0x004390e0-0x0043910e"], 24, "02510627f1038fb23f0100a2c3a540507c282404bf087e399f55cbc06dba7b3e"],
  ["0x00439140", ["0x00439140-0x00439160"], 6, "29f0ae746897fd82e8d651fda3799ce2b03acafb5209efd9f60ee0f7154352e0"],
  ["0x0041d210", ["0x0041d210-0x0041d277", "0x0041d2c0-0x0041d41a", "0x0041e200-0x0041e2f5"], 177, "dbc2f289ae0aacdc6d7ef785d7d8290d1153742003a389889f5ac881563ca278"],
  ["0x0041d870", ["0x0041d870-0x0041d976", "0x0041d9f0-0x0041dbdc"], 149, "725ef4a43130d35f9001bbd0b96ab9868b54ee4c000a49de36b96eccce7cdfc2"],
  ["0x0041efa0", ["0x0041efa0-0x0041f272"], 140, "0dd6b72b3f73f96672d22ceac55b7565cb93e92e3bc38598fa25a7b55013a646"],
  ["0x0041d700", ["0x0041d700-0x0041d7f5"], 49, "4efa54b7c845a61fe9aae4a14f62d0d1d2bab44c2b3e26db4cb524003bbc1af3"],
  ["0x0041e370", ["0x0041e370-0x0041e3bd", "0x0041e3f0-0x0041e5db"], 115, "aa96086d04f698f4965205fa74803f0cc7d7db9a05ee610834a0ccffac293a61"],
].map(([entry, bodyRanges, instructionCount, instructionSha256]) => ({
  entry,
  bodyRanges,
  instructionCount,
  instructionSha256,
}));

const EVIDENCE = [
  {
    id: "class-82-type-initializer-call",
    va: 0x0045dd20,
    bytes: "68 a5 00 00 00 b9 68 98 88 00 e8 d1 df ff ff",
    meaning: "the type initializer call uses primary slot 165 and class-82 record 0x00889868",
  },
  {
    id: "class-82-idle-and-move-initializers",
    va: 0x0042ae03,
    bytes:
      "6a 06 6a 00 68 a6 00 00 00 8b ce c6 86 92 00 00 00 06 e8 36 e0 00 00 bb 08 00 00 00 8b ce 53 6a 00 68 a5 00 00 00 88 9e a6 00 00 00 e8 bc e0 00 00",
    meaning: "class 82 configures idle slot 166/start 0/stride 6/phase 6 and move slot 165/start 0/stride 8/phase 8",
  },
  {
    id: "class-82-death-initializer",
    va: 0x0042ae34,
    bytes:
      "53 6a 28 68 a5 00 00 00 6a 00 8b ce 66 89 9e 8c 01 00 00 e8 64 e2 00 00 53 6a 28 68 a5 00 00 00 6a 01 8b ce e8 53 e2 00 00 53 6a 28 68 a5 00 00 00 6a 02 8b ce e8 42 e2 00 00 53 6a 28 68 a5 00 00 00 6a 03 8b ce e8 31 e2 00 00 53 6a 28 68 a5 00 00 00 6a 04 8b ce e8 20 e2 00 00",
    meaning: "class 82 writes phase count 8 and all five death bases 40 in slot 165",
  },
  {
    id: "class-82-attack-initializer",
    va: 0x0042ae90,
    bytes: "6a 0a 6a 00 68 a7 00 00 00 8b ce 66 c7 86 44 01 00 00 0a 00 e8 37 e2 00 00",
    meaning: "class 82 configures attack slot 167/start 0/stride 10/phase 10",
  },
  {
    id: "state-dispatch",
    va: 0x0041d210,
    bytes: "0f be 41 03 48 83 f8 11 77 52 ff 24 85 78 d2 41 00",
    meaning: "the shared frame dispatcher switches on signed BYTE animation state",
  },
  {
    id: "idle-normal-gate",
    va: 0x0041d870,
    bytes: "f6 41 74 08 74 05 e9 75 01 00 00 e9 00 00 00 00",
    meaning: "state 8 selects the normal consumer when flags bit 0x08 is clear",
  },
  {
    id: "move-normal-gate",
    va: 0x0041efa0,
    bytes: "f7 41 74 08 00 00 80 0f 84 d8 01 00 00",
    meaning: "state 1 selects the normal +0x1e6 consumer when mask 0x80000008 is clear",
  },
  {
    id: "attack-class-range-default",
    va: 0x0041e370,
    bytes: "33 c0 8a 41 37 83 c0 fb 83 f8 20 77 23",
    meaning: "class 82 normalizes to 77, exceeds 32, and takes JA to the default gate instead of a switch case",
  },
  {
    id: "attack-default-gates",
    va: 0x0041e3a0,
    bytes: "f7 41 74 00 00 00 80 75 14 66 83 b9 44 01 00 00 00 75 05 e9 b8 f4 ff ff e9 43 fe ff ff",
    meaning: "the default attack route requires high bit clear and nonzero WORD +0x144 before 0x0041e200",
  },
  {
    id: "health-zero-death-transition",
    va: 0x0043ccf6,
    bytes: "80 be f0 01 00 00 01 0f 85 3c 04 00 00 66 c7 86 b0 01 00 00 06 00",
    meaning: "eligible signed-health-zero entities enter action state 6",
  },
  {
    id: "death-state-producer",
    va: 0x004236a4,
    bytes: "66 8b 8e 8c 01 00 00 33 c0 66 3b c8 c6 46 6f 00 c6 46 03 07",
    meaning: "the action-state 6 path reads death phase count and selects animation state 7",
  },
];

const DIRECTION_SWITCHES = [
  ["idle", IDLE_FUNCTION, IDLE_SWITCH, new Map([[1, 0x0041d8ac], [5, 0x0041d8c6], [4, 0x0041d8cf], [20, 0x0041d8e9], [16, 0x0041d903], [80, 0x0041d91d], [64, 0x0041d937], [65, 0x0041d951]])],
  ["move", MOVE_FUNCTION, MOVE_SWITCH, new Map([[1, 0x0041f1b1], [5, 0x0041f1cb], [4, 0x0041f1e5], [20, 0x0041f1ff], [16, 0x0041f219], [80, 0x0041f233], [64, 0x0041f24d], [65, 0x0041f004]])],
  ["death", DEATH_FUNCTION, DEATH_SWITCH, new Map([[1, 0x0041d72b], [5, 0x0041d745], [4, 0x0041d74e], [20, 0x0041d768], [16, 0x0041d782], [80, 0x0041d79c], [64, 0x0041d7b6], [65, 0x0041d7d0]])],
  ["attack", ATTACK_FUNCTION, ATTACK_DIRECTION_SWITCH, new Map([[1, 0x0041e22b], [5, 0x0041e245], [4, 0x0041e24e], [20, 0x0041e268], [16, 0x0041e282], [80, 0x0041e29c], [64, 0x0041e2b6], [65, 0x0041e2d0]])],
];

const STATE_CONFIGURATIONS = {
  idle: { state: 8, resource: "idle", frameStart: 0, frameStride: 6, phaseCount: 6 },
  move: { state: 1, resource: "primary", frameStart: 0, frameStride: 8, phaseCount: 8 },
  attack: { state: 4, resource: "attack", frameStart: 0, frameStride: 10, phaseCount: 10 },
  death: { state: 7, resource: "primary", frameStart: 40, frameStride: 0, phaseCount: 8 },
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(extractK01KonishiAnimationPilot(parseArgs(process.argv.slice(2))), null, 2));
}

export function extractK01KonishiAnimationPilot({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  functionsPath = DEFAULT_FUNCTIONS_PATH,
  jumpTablesPath = DEFAULT_JUMP_TABLES_PATH,
  seedsPath = DEFAULT_SEEDS_PATH,
  primarySpritePath = DEFAULT_PRIMARY_SPRITE_PATH,
  idleSpritePath = DEFAULT_IDLE_SPRITE_PATH,
  attackSpritePath = DEFAULT_ATTACK_SPRITE_PATH,
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  const executableSha256 = sha256(buffer);
  assertEqual(executableSha256, EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);
  const functions = readArtifact(functionsPath, executableSha256, "functions");
  const functionEvidence = FUNCTION_CONTRACTS.map((contract) =>
    validateFunction(functions.functions, contract),
  );
  const jumpTables = readArtifact(jumpTablesPath, executableSha256, "jump tables");
  validateCase(jumpTables, CLASS_INITIALIZER_FUNCTION, CLASS_SWITCH_ADDRESS, 82, CLASS_INITIALIZER_DESTINATION, "class 82 initializer");
  validateStateDispatch(jumpTables);
  validateDirectionSwitches(jumpTables);
  validateAttackDefaultRoute(jumpTables);

  const commonPilot = extractUnitAnimationPilot({ executablePath, jumpTablesPath, seedsPath });
  validateCommonDirections(commonPilot);
  const catalog = extractEntityTypeCatalog({ executablePath, seedsPath });
  const type = catalog.types.find(({ internalClass }) => internalClass === 82);
  if (!type) throw new Error("entity catalog is missing class 82");
  validateType(type);
  const table = extractOriginalSpriteTable(executablePath);
  const sprites = {
    primary: inspectSprite(table, EXPECTED_KONISHI.primary, primarySpritePath),
    idle: inspectSprite(table, EXPECTED_KONISHI.idle, idleSpritePath),
    attack: inspectSprite(table, EXPECTED_KONISHI.attack, attackSpritePath),
  };
  const states = Object.fromEntries(
    Object.entries(STATE_CONFIGURATIONS).map(([name, configuration]) => [
      name,
      buildState(name, configuration, sprites[configuration.resource]),
    ]),
  );
  const evidencePoints = EVIDENCE.map((point) => readEvidencePoint(buffer, image, point));
  requireAllEvidence(evidencePoints);
  const flags = EXPECTED_KONISHI.typeFlags >>> 0;
  return {
    schemaVersion: 1,
    question:
      "원본 내부 class 82 일본 고니시의 상태 8 idle, 상태 1 일반 이동, 상태 4 target-driven 공격, 상태 7 health-zero 사망이 어느 SPR 슬롯·프레임·8방향·mirror를 선택하는가?",
    analysisStatus: "static-confirmed",
    reproductionStatus: "reproduction-complete",
    implementationStatus: "theme-level-mapping",
    sources: {
      executable: { path: executablePath, sha256: executableSha256 },
      functions: { path: functionsPath, sourceSha256: functions.sourceSha256 },
      jumpTables: { path: jumpTablesPath, sourceSha256: jumpTables.sourceSha256 },
      seeds: { path: seedsPath, sourceSha256: executableSha256 },
      sprites,
    },
    identity: {
      internalClass: type.internalClass,
      originalGameplayName: type.originalGameplayName,
      typeRecordAddress: type.definition.recordAddress,
      typeFlags: type.definition.flags,
      primarySpriteSlot: type.sprite.slot,
      primarySourcePath: type.sprite.sourcePath,
    },
    classDispatch: {
      functionEntry: toHex(CLASS_INITIALIZER_FUNCTION),
      switchAddress: toHex(CLASS_SWITCH_ADDRESS),
      class: 82,
      destination: toHex(CLASS_INITIALIZER_DESTINATION),
      scopedBlock: `${toHex(CLASS_INITIALIZER_DESTINATION)}-${toHex(CLASS_INITIALIZER_END)}`,
    },
    attackDispatch: {
      wrapperFunction: toHex(ATTACK_FUNCTION),
      switchAddress: toHex(ATTACK_CLASS_SWITCH),
      internalClass: 82,
      normalizedClass: 77,
      maximumSwitchIndex: 32,
      hasExplicitCase82: false,
      defaultGate: toHex(ATTACK_DEFAULT_GATE),
      normalConsumer: toHex(NORMAL_ATTACK_CONSUMER),
      requiredFlagsClear: toHex(ATTACK_SPECIAL_MASK),
      requiredPhaseCountCondition: "WORD [entity+0x144] != 0",
    },
    initialTypeFlags: {
      value: toHex(flags),
      state1MaskValue: toHex((flags & STATE_1_MASK) >>> 0),
      alternateMovementEligibilityMaskValue: toHex((flags & ALTERNATE_MOVEMENT_MASK) >>> 0),
      idleSpecialMaskValue: toHex((flags & IDLE_SPECIAL_MASK) >>> 0),
      attackSpecialMaskValue: toHex((flags & ATTACK_SPECIAL_MASK) >>> 0),
      normalCoreStatePathsSelected: true,
      laterRuntimeMutation: "unresolved",
    },
    recoveredStateSemantics: {
      idle: { producer: "0x0043c344", consumer: "0x0041d870" },
      move: { producer: "0x00425b20", consumer: "0x0041efa0" },
      attack: { producer: "0x00423837", wrapper: "0x0041e370", consumer: "0x0041e200" },
      death: { healthZeroTransition: "0x0043ccf6", producer: "0x004236a4", consumer: "0x0041d700" },
    },
    states,
    functionEvidence,
    evidencePoints,
    acceptedInputScope:
      "the eight recovered grid directions and state-specific phases on normal consumers selected by class-82 creation-default gate bits; gate patterns selecting other consumers are rejected",
    unresolvedScope:
      "generalj11 frame 48, generalj12 frames 30..35, generalj13 frames 50..53, all generalj14, hit reaction and other states, later flag mutation, exact seconds per phase and 24 Hz mapping, pivot, death display lifetime, and simulation removal",
  };
}

export function selectKonishiFrame({
  state,
  direction,
  phase,
  entityFlags = EXPECTED_KONISHI.typeFlags,
  attackPhaseCount = 10,
}) {
  validateUnsignedDword(entityFlags, "entityFlags");
  validateUnsignedWord(attackPhaseCount, "attackPhaseCount");
  validateSignedWord(direction, "direction");
  const entry = Object.entries(STATE_CONFIGURATIONS).find(([, configuration]) => configuration.state === state);
  if (!entry) throw new RangeError(`state ${state} is outside the scoped set 1,4,7,8`);
  const [stateName, configuration] = entry;
  if (!Number.isInteger(phase) || phase < 0 || phase >= configuration.phaseCount) {
    throw new RangeError(`phase ${phase} is outside 0..${configuration.phaseCount - 1} for ${stateName}`);
  }
  const profile = KONISHI_DIRECTION_PROFILES.find((candidate) => candidate.direction === direction);
  if (!profile) throw new RangeError(`direction ${direction} is outside the recovered grid set`);
  validateReplayGates(stateName, entityFlags >>> 0, attackPhaseCount);
  const resource = EXPECTED_KONISHI[configuration.resource];
  const frameIndex =
    configuration.frameStart +
    profile.frameBaseIndex * configuration.frameStride +
    phase;
  if (frameIndex >= resource.frameCount) throw new RangeError(`frame ${frameIndex} exceeds ${resource.frameCount - 1}`);
  return {
    state,
    stateName,
    direction,
    facing: profile.facing,
    phase,
    spriteSlot: resource.slot,
    sourcePath: resource.sourcePath,
    frameIndex,
    mirrorX: profile.mirrorX,
  };
}

function buildState(name, configuration, resource) {
  const directions = KONISHI_DIRECTION_PROFILES.map((profile) => {
    const frameBase = configuration.frameStart + profile.frameBaseIndex * configuration.frameStride;
    const frameRange = [frameBase, frameBase + configuration.phaseCount - 1];
    if (frameRange[1] >= resource.frameCount) throw new RangeError(`${name} frame ${frameRange[1]} exceeds ${resource.frameCount - 1}`);
    return { ...profile, frameBase, phaseRange: [0, configuration.phaseCount - 1], frameRange };
  });
  return {
    originalAnimationState: configuration.state,
    spriteSlot: resource.slot,
    sourcePath: resource.sourcePath,
    frameStart: configuration.frameStart,
    frameStride: configuration.frameStride,
    phaseCount: configuration.phaseCount,
    frameRange: [Math.min(...directions.map(({ frameRange }) => frameRange[0])), Math.max(...directions.map(({ frameRange }) => frameRange[1]))],
    directions,
  };
}

function validateReplayGates(state, flags, attackPhaseCount) {
  if (state === "move") {
    if ((flags & STATE_1_MASK) !== 0) throw new Error("class 82 normal movement requires mask 0x80000008 clear");
    if ((flags & ALTERNATE_MOVEMENT_MASK) !== 0) throw new Error("class 82 creation-default movement requires alternate mask clear");
  }
  if (state === "idle" && (flags & IDLE_SPECIAL_MASK) !== 0) throw new Error("class 82 idle requires flags bit 0x08 clear");
  if (state === "attack") {
    if ((flags & ATTACK_SPECIAL_MASK) !== 0) throw new Error("class 82 default attack gate requires high bit clear");
    if (attackPhaseCount === 0) throw new Error("class 82 attack wrapper requires WORD +0x144 nonzero");
  }
}

function validateCommonDirections(pilot) {
  const state = pilot.states.find(({ state }) => state === 1);
  if (!state) throw new Error("shared direction pilot is missing state 1");
  const actual = state.directions
    .map(({ direction, deltaX, deltaY, frameBase, mirrorX }) => ({
      direction, deltaX, deltaY, frameBaseIndex: frameBase / state.phaseCount, mirrorX,
    }))
    .sort((a, b) => a.direction - b.direction);
  const expected = KONISHI_DIRECTION_PROFILES
    .map(({ direction, deltaX, deltaY, frameBaseIndex, mirrorX }) => ({
      direction,
      deltaX,
      deltaY,
      frameBaseIndex,
      mirrorX,
    }))
    .sort((a, b) => a.direction - b.direction);
  assertDeepEqual(actual, expected, "shared direction profiles");
}

function validateStateDispatch(artifact) {
  const table = requireSwitch(artifact, STATE_DISPATCH_FUNCTION, STATE_DISPATCH_SWITCH);
  for (const [label, destination] of [[8, 0x0041d221], [1, 0x0041d226], [4, 0x0041d230], [7, 0x0041d23a]]) {
    assertEqual(requireCase(table, label).destination, toHex(destination), `state ${label} dispatch`);
  }
}

function validateDirectionSwitches(artifact) {
  for (const [name, functionEntry, switchAddress, destinations] of DIRECTION_SWITCHES) {
    const table = requireSwitch(artifact, functionEntry, switchAddress);
    for (const [label, destination] of destinations) {
      assertEqual(requireCase(table, label).destination, toHex(destination), `${name} raw direction ${label}`);
    }
  }
}

function validateAttackDefaultRoute(artifact) {
  const table = requireSwitch(artifact, ATTACK_FUNCTION, ATTACK_CLASS_SWITCH);
  if (table.cases.some(({ label }) => label === 82)) {
    throw new Error("class 82 must use the attack out-of-range default route, not an explicit switch case");
  }
  const numericLabels = table.cases.map(({ label }) => label).filter(Number.isInteger);
  assertEqual(
    Math.max(...numericLabels),
    37,
    "attack class switch maximum actual class",
  );
}

function validateType(type) {
  assertEqual(type.originalGameplayName, EXPECTED_KONISHI.originalGameplayName, "class 82 name");
  assertEqual(type.definition.recordAddress, EXPECTED_KONISHI.typeRecordAddress, "class 82 record");
  assertEqual(type.definition.flags, toHex(EXPECTED_KONISHI.typeFlags), "class 82 flags");
  assertEqual(type.sprite.slot, EXPECTED_KONISHI.primary.slot, "class 82 primary slot");
  assertEqual(type.sprite.pointerCell, EXPECTED_KONISHI.primary.pointerCell, "class 82 pointer cell");
  assertEqual(type.sprite.sourcePath, EXPECTED_KONISHI.primary.sourcePath, "class 82 source");
}

function inspectSprite(table, expected, path) {
  const entry = table.entries[expected.tableIndex];
  if (!entry) throw new Error(`sprite table is missing index ${expected.tableIndex}`);
  assertEqual(entry.tableVa, expected.pointerCell, `${expected.sourcePath} pointer cell`);
  assertEqual(entry.stringVa, expected.sourcePointer, `${expected.sourcePath} source pointer`);
  assertEqual(entry.sourcePath, expected.sourcePath, `${expected.sourcePath} table source`);
  const buffer = readFileSync(path);
  const digest = sha256(buffer);
  assertEqual(digest, expected.sha256, `${path} SHA-256`);
  const header = parseSpriteLikeHeader(buffer, path);
  assertEqual(header.width, expected.width, `${path} width`);
  assertEqual(header.height, expected.height, `${path} height`);
  assertEqual(header.frameCount, expected.frameCount, `${path} frame count`);
  return {
    path,
    sha256: digest,
    width: header.width,
    height: header.height,
    frameCount: header.frameCount,
    slot: expected.slot,
    tableIndex: entry.index,
    pointerCell: entry.tableVa,
    sourcePointer: entry.stringVa,
    sourcePath: entry.sourcePath,
  };
}

function readArtifact(path, sourceSha256, label) {
  const artifact = JSON.parse(readFileSync(path, "utf8"));
  assertEqual(artifact.sourceSha256, sourceSha256, `${label} source SHA-256`);
  return artifact;
}
function validateFunction(functions, contract) {
  const record = functions.find(({ entry }) => entry === contract.entry);
  if (!record) throw new Error(`functions artifact is missing ${contract.entry}`);
  assertDeepEqual(record.bodyRanges, contract.bodyRanges, `${contract.entry} body ranges`);
  assertEqual(record.instructionCount, contract.instructionCount, `${contract.entry} instruction count`);
  assertEqual(record.instructionSha256, contract.instructionSha256, `${contract.entry} instruction SHA-256`);
  return { entry: record.entry, bodyRanges: record.bodyRanges, instructionCount: record.instructionCount, instructionSha256: record.instructionSha256 };
}
function validateCase(artifact, functionEntry, switchAddress, label, destination, description) {
  const table = requireSwitch(artifact, functionEntry, switchAddress);
  assertEqual(requireCase(table, label).destination, toHex(destination), `${description} destination`);
}
function requireSwitch(artifact, functionEntry, switchAddress) {
  const table = Object.values(artifact.tables ?? {}).find(
    (candidate) => candidate.functionEntry === toHex(functionEntry) && candidate.switchAddress === toHex(switchAddress),
  );
  if (!table) throw new Error(`missing switch ${toHex(switchAddress)} in ${toHex(functionEntry)}`);
  return table;
}
function requireCase(table, label) {
  const entry = table.cases.find((candidate) => candidate.label === label);
  if (!entry) throw new Error(`switch ${table.switchAddress} is missing case ${label}`);
  return entry;
}
function readEvidencePoint(buffer, image, evidence) {
  const offset = image.vaToRawOffset(evidence.va);
  const expected = Buffer.from(evidence.bytes.replaceAll(" ", ""), "hex");
  const actual = offset === undefined ? Buffer.alloc(0) : buffer.subarray(offset, offset + expected.length);
  return { ...evidence, va: toHex(evidence.va), expectedBytes: formatBytes(expected), actualBytes: formatBytes(actual), matched: Buffer.compare(expected, actual) === 0 };
}
function requireAllEvidence(points) {
  const mismatch = points.find(({ matched }) => !matched);
  if (mismatch) throw new Error(`static evidence mismatch at ${mismatch.va} (${mismatch.id}): expected ${mismatch.expectedBytes}, got ${mismatch.actualBytes}`);
}
function validateUnsignedDword(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError(`${label} must be an unsigned DWORD`);
}
function validateUnsignedWord(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new RangeError(`${label} must be an unsigned WORD`);
}
function validateSignedWord(value, label) {
  if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) throw new RangeError(`${label} must be a signed WORD`);
}
function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}
function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`);
}
function assertDeepEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function formatBytes(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(" ");
}
function parseArgs(argv) {
  const result = {};
  const options = new Map([
    ["--input", "executablePath"],
    ["--functions", "functionsPath"],
    ["--jump-tables", "jumpTablesPath"],
    ["--seeds", "seedsPath"],
    ["--primary-sprite", "primarySpritePath"],
    ["--idle-sprite", "idleSpritePath"],
    ["--attack-sprite", "attackSpritePath"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") continue;
    const key = options.get(argument);
    if (!key) throw new Error(`unknown argument: ${argument}`);
    if (!argv[index + 1]) throw new Error(`${argument} requires a path`);
    result[key] = argv[++index];
  }
  return result;
}
