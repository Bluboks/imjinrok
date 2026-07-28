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
const DEFAULT_SPRITE_PATH = "original/imjinrok2/char/ghosttankj.spr";

export const EXPECTED_TURTLE_TANK = {
  internalClass: 14,
  originalGameplayName: "일본 귀갑차",
  typeRecordAddress: "0x00884038",
  typeFlags: 0x80143205,
  sprite: {
    slot: 104,
    tableIndex: 4,
    pointerCell: "0x004bc234",
    sourcePath: "char\\ghosttankj.spr",
    sha256:
      "34c3fdb3bcd79bc95f907aa7c381c11a374b30c8f7dd45f89f0e762a139f04ec",
    width: 70,
    height: 60,
    frameCount: 88,
  },
};

export const TURTLE_TANK_GRID_PROFILES = [
  { facing: "s", direction: 1, deltaX: 0, deltaY: 1, configuredBaseIndex: 2, mirrorX: false },
  { facing: "sw", direction: 5, deltaX: -1, deltaY: 1, configuredBaseIndex: 4, mirrorX: false },
  { facing: "w", direction: 4, deltaX: -1, deltaY: 0, configuredBaseIndex: 6, mirrorX: false },
  { facing: "nw", direction: 20, deltaX: -1, deltaY: -1, configuredBaseIndex: 8, mirrorX: false },
  { facing: "n", direction: 16, deltaX: 0, deltaY: -1, configuredBaseIndex: 6, mirrorX: true },
  { facing: "ne", direction: 80, deltaX: 1, deltaY: -1, configuredBaseIndex: 4, mirrorX: true },
  { facing: "e", direction: 64, deltaX: 1, deltaY: 0, configuredBaseIndex: 2, mirrorX: true },
  { facing: "se", direction: 65, deltaX: 1, deltaY: 1, configuredBaseIndex: 0, mirrorX: false },
];

export const TURTLE_TANK_OPAQUE_PROFILES = [
  { direction: 1000, configuredBaseIndex: 3, mirrorX: false },
  { direction: 1001, configuredBaseIndex: 5, mirrorX: false },
  { direction: 1002, configuredBaseIndex: 7, mirrorX: false },
  { direction: 1003, configuredBaseIndex: 7, mirrorX: true },
  { direction: 1004, configuredBaseIndex: 5, mirrorX: true },
  { direction: 1005, configuredBaseIndex: 3, mirrorX: true },
  { direction: 1006, configuredBaseIndex: 1, mirrorX: true },
  { direction: 1007, configuredBaseIndex: 1, mirrorX: false },
];

const CLASS_INITIALIZER_FUNCTION = 0x004291d0;
const CLASS_SWITCH_ADDRESS = 0x004292b3;
const CLASS_DESTINATION = 0x0042bae1;
const ATTACK_FUNCTION = 0x0041e370;
const ATTACK_SWITCH_ADDRESS = 0x0041e385;
const ATTACK_DESTINATION = 0x0041e38c;
const MOVE_FUNCTION = 0x0041efa0;
const MOVE_GRID_SWITCH = 0x0041efe3;
const MOVE_OPAQUE_SWITCH = 0x0041f0c8;
const ATTACK_GRID_SWITCH = 0x0041e425;
const ATTACK_OPAQUE_SWITCH = 0x0041e513;
const IDLE_FUNCTION = 0x0041d870;
const IDLE_GRID_SWITCH = 0x0041d8a5;
const STATE_1_SPECIAL_MASK = 0x80000008;
const ALTERNATE_MOVEMENT_MASK = 0x04000000;
const IDLE_SPECIAL_MASK = 0x00000008;

const FUNCTION_CONTRACTS = [
  ["0x004291d0", ["0x004291d0-0x0042c547"], 4156, "1c05959938219ae4fa918ba3061b1856dcfb575f007a1a48281dd316709a7e96"],
  ["0x0041e370", ["0x0041e370-0x0041e3bd", "0x0041e3f0-0x0041e5db"], 115, "aa96086d04f698f4965205fa74803f0cc7d7db9a05ee610834a0ccffac293a61"],
  ["0x0041d870", ["0x0041d870-0x0041d976", "0x0041d9f0-0x0041dbdc"], 149, "725ef4a43130d35f9001bbd0b96ab9868b54ee4c000a49de36b96eccce7cdfc2"],
  ["0x0041efa0", ["0x0041efa0-0x0041f272"], 140, "0dd6b72b3f73f96672d22ceac55b7565cb93e92e3bc38598fa25a7b55013a646"],
  ["0x00438e80", ["0x00438e80-0x00438e9e"], 6, "870ed439ab165b6aef1ba7c7406f30b089809a389d42ede44a4e00371fdf7d0f"],
  ["0x00438f20", ["0x00438f20-0x00438f4e"], 24, "3bc91bd78040f10b1dd0bbfd140e85f6bf284a0ae0b99172faa667b79bf4e49f"],
  ["0x00439110", ["0x00439110-0x0043913e"], 24, "67e1b441220f1c64d444eab72f46fe1eceefb70912f321bf79769337a5bfe925"],
  ["0x004381a0", ["0x004381a0-0x004381bd"], 6, "3374eae851c0b4f466dda2bdbc72047cd09e08da36fc0dd6fd41b1e905f1fed4"],
].map(([entry, bodyRanges, instructionCount, instructionSha256]) => ({
  entry,
  bodyRanges,
  instructionCount,
  instructionSha256,
}));

const EVIDENCE = [
  {
    id: "class-14-idle-initializer",
    va: 0x0042bae1,
    bytes:
      "6a 01 6a 10 6a 68 6a 00 8b ce c6 86 92 00 00 00 01 e8 89 d3 00 00 6a 01 6a 20 6a 68 6a 01 8b ce e8 7a d3 00 00 6a 01 6a 30 6a 68 6a 02 8b ce e8 6b d3 00 00 6a 01 6a 40 6a 68 6a 03 8b ce e8 5c d3 00 00 6a 01 6a 00 6a 68 6a 04 8b ce e8 4d d3 00 00",
    meaning: "state 8 writes phase 1, slot 104, and five bases 16,32,48,64,0",
  },
  {
    id: "class-14-movement-initializer",
    va: 0x0042bb33,
    bytes: "bb 08 00 00 00 8b ce 53 6a 00 6a 68 88 9e a6 00 00 00 e8 d6 d3 00 00",
    meaning: "state 1 writes phase 8, slot 104, start 0, stride 8 through the nine-base helper",
  },
  {
    id: "class-14-attack-initializer",
    va: 0x0042bb4a,
    bytes: "6a 01 6a 48 6a 68 8b ce 66 c7 86 44 01 00 00 01 00 e8 b0 d5 00 00",
    meaning: "state 4 writes phase 1, slot 104, start 72, stride 1 through the nine-base helper",
  },
  {
    id: "idle-normal-path-gate",
    va: 0x0041d870,
    bytes: "f6 41 74 08 74 05 e9 75 01 00 00 e9 00 00 00 00",
    meaning: "state 8 uses the normal consumer when flags bit 0x08 is clear",
  },
  {
    id: "movement-special-path-and-direction-field",
    va: 0x0041efa0,
    bytes:
      "f7 41 74 08 00 00 80 0f 84 d8 01 00 00 66 0f b6 81 a7 00 00 00 66 89 41 0a 0f bf 81 e8 01 00 00",
    meaning: "state 1 mask selects the special consumer, which reads direction WORD +0x1e8",
  },
  {
    id: "movement-raw-1000-direct-branch",
    va: 0x0041efc0,
    bytes: "3d e8 03 00 00 0f 8f ef 00 00 00 0f 84 cf 00 00 00",
    meaning: "the movement special consumer compares raw direction 1000 directly and branches to 0x0041f0a0",
  },
  {
    id: "movement-raw-1000-frame-base",
    va: 0x0041f0a0,
    bytes: "66 8b 81 b2 01 00 00 c6 81 b5 01 00 00 00 66 03 81 ae 00 00 00 66 89 41 0c c3",
    meaning: "raw direction 1000 selects movement base field +0xae (index 3) with mirror byte zero",
  },
  {
    id: "attack-class-14-special-wrapper",
    va: 0x0041e38c,
    bytes: "66 83 b9 44 01 00 00 00 75 05 e9 d5 f4 ff ff e9 50 00 00 00",
    meaning: "class 14 uses the special state-4 consumer when WORD +0x144 is nonzero",
  },
  {
    id: "attack-special-direction-field",
    va: 0x0041e3f0,
    bytes: "66 8b 81 46 01 00 00 66 89 41 0a 0f bf 81 e6 01 00 00",
    meaning: "the special attack consumer reads slot +0x146 and direction WORD +0x1e6",
  },
  {
    id: "attack-raw-1000-direct-branch",
    va: 0x0041e402,
    bytes: "3d e8 03 00 00 0f 8f f8 00 00 00 0f 84 d8 00 00 00",
    meaning: "the attack special consumer compares raw direction 1000 directly and branches to 0x0041e4eb",
  },
  {
    id: "attack-raw-1000-frame-base",
    va: 0x0041e4eb,
    bytes: "66 8b 81 b2 01 00 00 c6 81 b5 01 00 00 00 66 03 81 4e 01 00 00 66 89 41 0c c3",
    meaning: "raw direction 1000 selects attack base field +0x14e (index 3) with mirror byte zero",
  },
  {
    id: "direction-writer-updates-both-fields",
    va: 0x004381a0,
    bytes: "66 8b 44 24 04 66 89 81 e6 01 00 00 66 89 81 e8 01 00 00 b8 01 00 00 00 88 41 04 c2 04 00",
    meaning: "the normal direction writer stores the same WORD to +0x1e6 and +0x1e8",
  },
  {
    id: "state-8-producer",
    va: 0x0043c344,
    bytes: "66 8b 83 b2 01 00 00 89 8b 28 02 00 00 0f be 8b 92 00 00 00 66 40 c6 43 03 08",
    meaning: "the idle producer selects raw animation state 8",
  },
  {
    id: "state-4-producer",
    va: 0x00423837,
    bytes: "8a 57 6f 8a 4f 6e fe c2 c6 47 03 04",
    meaning: "the target-driven attack producer selects raw animation state 4",
  },
];

const GRID_DESTINATIONS = {
  idle: new Map([[1, 0x0041d8ac], [5, 0x0041d8c6], [4, 0x0041d8cf], [20, 0x0041d8e9], [16, 0x0041d903], [80, 0x0041d91d], [64, 0x0041d937], [65, 0x0041d951]]),
  move: new Map([[1, 0x0041efea], [5, 0x0041f004], [4, 0x0041f01e], [20, 0x0041f038], [16, 0x0041f052], [80, 0x0041f06c], [64, 0x0041f219], [65, 0x0041f086]]),
  attack: new Map([[1, 0x0041e42c], [5, 0x0041e446], [4, 0x0041e44f], [20, 0x0041e469], [16, 0x0041e483], [80, 0x0041e49d], [64, 0x0041e4b7], [65, 0x0041e4d1]]),
};
const OPAQUE_DESTINATIONS = {
  move: new Map([[1001, 0x0041f0e9], [1002, 0x0041f11d], [1003, 0x0041f137], [1004, 0x0041f103], [1005, 0x0041f0cf], [1006, 0x0041f16b], [1007, 0x0041f151]]),
  attack: new Map([[1001, 0x0041e534], [1002, 0x0041e568], [1003, 0x0041e582], [1004, 0x0041e54e], [1005, 0x0041e51a], [1006, 0x0041e5b6], [1007, 0x0041e59c]]),
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(extractK01TurtleTankAnimationPilot(parseArgs(process.argv.slice(2))), null, 2));
}

export function extractK01TurtleTankAnimationPilot({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  functionsPath = DEFAULT_FUNCTIONS_PATH,
  jumpTablesPath = DEFAULT_JUMP_TABLES_PATH,
  seedsPath = DEFAULT_SEEDS_PATH,
  spritePath = DEFAULT_SPRITE_PATH,
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  const executableSha256 = sha256(buffer);
  assertEqual(executableSha256, EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);
  const functions = readArtifact(functionsPath, executableSha256, "functions");
  const functionEvidence = FUNCTION_CONTRACTS.map((contract) =>
    validateFunction(functions.functions, contract),
  );
  const jumpTables = readArtifact(jumpTablesPath, executableSha256, "jump tables");
  validateCase(jumpTables, CLASS_INITIALIZER_FUNCTION, CLASS_SWITCH_ADDRESS, 14, CLASS_DESTINATION, "class 14 initializer");
  validateCase(jumpTables, ATTACK_FUNCTION, ATTACK_SWITCH_ADDRESS, 14, ATTACK_DESTINATION, "class 14 attack wrapper");
  validateDirectionSwitches(jumpTables);

  const commonPilot = extractUnitAnimationPilot({
    executablePath,
    jumpTablesPath,
    seedsPath,
  });
  validateCommonGridDirections(commonPilot);

  const catalog = extractEntityTypeCatalog({ executablePath, seedsPath });
  const type = catalog.types.find(({ internalClass }) => internalClass === 14);
  if (!type) throw new Error("entity catalog is missing class 14");
  validateType(type);
  const sprite = inspectSprite(executablePath, spritePath);
  const evidencePoints = EVIDENCE.map((point) => readEvidencePoint(buffer, image, point));
  requireAllEvidence(evidencePoints);

  const states = {
    idle: buildState("idle", 8, 1, 0, 8, false),
    move: buildState("move", 1, 8, 0, 8, true),
    attack: buildState("attack", 4, 1, 72, 1, true),
  };
  const flags = EXPECTED_TURTLE_TANK.typeFlags >>> 0;
  return {
    schemaVersion: 1,
    question:
      "원본 내부 class 14 일본 귀갑차의 상태 8 idle, 상태 1 일반 이동, 상태 4 target-driven 공격이 어느 SPR 슬롯·프레임·8방향·mirror를 선택하는가?",
    analysisStatus: "static-confirmed",
    reproductionStatus: "reproduction-complete",
    implementationStatus: "theme-level-mapping",
    sources: {
      executable: { path: executablePath, sha256: executableSha256 },
      functions: { path: functionsPath, sourceSha256: functions.sourceSha256 },
      jumpTables: { path: jumpTablesPath, sourceSha256: jumpTables.sourceSha256 },
      seeds: { path: seedsPath, sourceSha256: executableSha256 },
      sprite,
    },
    identity: {
      internalClass: type.internalClass,
      originalGameplayName: type.originalGameplayName,
      typeRecordAddress: type.definition.recordAddress,
      typeFlags: type.definition.flags,
      spriteSlot: type.sprite.slot,
      sourcePath: type.sprite.sourcePath,
    },
    classDispatch: { functionEntry: toHex(CLASS_INITIALIZER_FUNCTION), switchAddress: toHex(CLASS_SWITCH_ADDRESS), class: 14, destination: toHex(CLASS_DESTINATION), scopedBlock: "0x0042bae1-0x0042bb8c" },
    attackDispatch: { wrapperFunction: toHex(ATTACK_FUNCTION), switchAddress: toHex(ATTACK_SWITCH_ADDRESS), class: 14, destination: toHex(ATTACK_DESTINATION), specialConsumer: "0x0041e3f0", requiredPhaseCountCondition: "WORD [entity+0x144] != 0", flagsGate: "none" },
    initialTypeFlags: {
      value: toHex(flags),
      state1SpecialMaskValue: toHex((flags & STATE_1_SPECIAL_MASK) >>> 0),
      alternateMovementEligibilityMaskValue: toHex(flags & ALTERNATE_MOVEMENT_MASK),
      idleSpecialMaskValue: toHex(flags & IDLE_SPECIAL_MASK),
      creationDefaultPaths: { idle: "normal +0x1e6", move: "special +0x1e8", attack: "special +0x1e6" },
      laterRuntimeMutation: "unresolved",
    },
    recoveredStateSemantics: {
      idle: { producer: "0x0043c344", wrapper: "0x0041d870", consumer: "0x0041d880" },
      move: { producer: "0x00425b20", consumer: "0x0041efa0", directionField: "+0x1e8" },
      attack: { producer: "0x00423837", wrapper: "0x0041e370", consumer: "0x0041e3f0", directionField: "+0x1e6" },
    },
    states,
    opaqueDirections: {
      humanMeaning: "unresolved",
      acceptedByStates: ["move", "attack"],
      profiles: TURTLE_TANK_OPAQUE_PROFILES,
    },
    functionEvidence,
    evidencePoints,
    acceptedInputScope:
      "creation-default class-14 gate patterns, all eight recovered grid directions, phases within each configured count, and opaque raw directions 1000..1007 only for the two special consumers",
    unresolvedScope:
      "frames 81..87, state 7/death and +0xd0/+0xec initializer fields, opaque-direction human meanings and generic Facing mapping, exact seconds per phase, original update-to-24-Hz mapping, pivot, hit reaction, later flag mutation, and display lifetime",
  };
}

export function selectTurtleTankFrame({
  state,
  direction,
  phase,
  entityFlags = EXPECTED_TURTLE_TANK.typeFlags,
  attackPhaseCount = 1,
}) {
  validateUnsignedDword(entityFlags, "entityFlags");
  validateUnsignedWord(attackPhaseCount, "attackPhaseCount");
  validateSignedWord(direction, "direction");
  const stateName = new Map([[8, "idle"], [1, "move"], [4, "attack"]]).get(state);
  if (!stateName) throw new RangeError(`state ${state} is outside the scoped set 1,4,8`);
  const phaseCount = stateName === "move" ? 8 : 1;
  if (!Number.isInteger(phase) || phase < 0 || phase >= phaseCount) {
    throw new RangeError(`phase ${phase} is outside 0..${phaseCount - 1} for ${stateName}`);
  }
  validateReplayGates(stateName, entityFlags >>> 0, attackPhaseCount);
  const grid = TURTLE_TANK_GRID_PROFILES.find((profile) => profile.direction === direction);
  const opaque = TURTLE_TANK_OPAQUE_PROFILES.find((profile) => profile.direction === direction);
  if (!grid && !(opaque && stateName !== "idle")) {
    throw new RangeError(`direction ${direction} is outside the recovered ${stateName} set`);
  }
  const profile = grid ?? opaque;
  const frameIndex =
    stateName === "attack"
      ? 72 + profile.configuredBaseIndex
      : profile.configuredBaseIndex * 8 + phase;
  if (frameIndex >= EXPECTED_TURTLE_TANK.sprite.frameCount) {
    throw new RangeError(`frame ${frameIndex} exceeds 87`);
  }
  return {
    state,
    stateName,
    direction,
    ...(grid ? { facing: grid.facing } : { facing: null, directionMeaning: "opaque" }),
    phase,
    spriteSlot: 104,
    sourcePath: EXPECTED_TURTLE_TANK.sprite.sourcePath,
    frameIndex,
    mirrorX: profile.mirrorX,
  };
}

function buildState(name, originalAnimationState, phaseCount, frameStart, stride, acceptsOpaque) {
  const directions = TURTLE_TANK_GRID_PROFILES.map((profile) => {
    const frameBase = frameStart + profile.configuredBaseIndex * stride;
    return { ...profile, frameBase, phaseRange: [0, phaseCount - 1], frameRange: [frameBase, frameBase + phaseCount - 1] };
  });
  return {
    originalAnimationState,
    spriteSlot: 104,
    sourcePath: EXPECTED_TURTLE_TANK.sprite.sourcePath,
    phaseCount,
    frameStart,
    frameStride: stride,
    acceptsOpaqueRawDirections: acceptsOpaque,
    configuredBases: name === "idle" ? [16, 32, 48, 64, 0] : Array.from({ length: 9 }, (_, index) => frameStart + index * stride),
    frameRange: [Math.min(...directions.map(({ frameRange }) => frameRange[0])), Math.max(...directions.map(({ frameRange }) => frameRange[1]))],
    directions,
  };
}

function validateReplayGates(state, flags, attackPhaseCount) {
  if (state === "idle" && (flags & IDLE_SPECIAL_MASK) !== 0) {
    throw new Error("state 8 normal consumer requires flags bit 0x08 clear");
  }
  if (state === "move") {
    if (((flags & STATE_1_SPECIAL_MASK) >>> 0) !== 0x80000000) {
      throw new Error("class 14 state 1 creation-default special path requires mask value 0x80000000");
    }
    if ((flags & ALTERNATE_MOVEMENT_MASK) !== 0) {
      throw new Error("class 14 state 1 creation-default path requires alternate movement mask clear");
    }
  }
  if (state === "attack" && attackPhaseCount === 0) {
    throw new Error("class 14 attack wrapper requires WORD +0x144 nonzero");
  }
}

function validateCommonGridDirections(pilot) {
  const state = pilot.states.find(({ state }) => state === 1);
  if (!state) throw new Error("shared direction pilot is missing state 1");
  const actual = state.directions
    .map(({ direction, deltaX, deltaY, mirrorX }) => ({ direction, deltaX, deltaY, mirrorX }))
    .sort((a, b) => a.direction - b.direction);
  const expected = TURTLE_TANK_GRID_PROFILES
    .map(({ direction, deltaX, deltaY, mirrorX }) => ({ direction, deltaX, deltaY, mirrorX }))
    .sort((a, b) => a.direction - b.direction);
  assertDeepEqual(actual, expected, "shared grid direction profile");
}

function validateDirectionSwitches(artifact) {
  for (const [state, functionEntry, gridSwitch, opaqueSwitch] of [
    ["idle", IDLE_FUNCTION, IDLE_GRID_SWITCH, undefined],
    ["move", MOVE_FUNCTION, MOVE_GRID_SWITCH, MOVE_OPAQUE_SWITCH],
    ["attack", ATTACK_FUNCTION, ATTACK_GRID_SWITCH, ATTACK_OPAQUE_SWITCH],
  ]) {
    const grid = requireSwitch(artifact, functionEntry, gridSwitch);
    for (const [label, destination] of GRID_DESTINATIONS[state]) {
      assertEqual(requireCase(grid, label).destination, toHex(destination), `${state} raw direction ${label}`);
    }
    if (opaqueSwitch !== undefined) {
      const opaque = requireSwitch(artifact, functionEntry, opaqueSwitch);
      for (const [label, destination] of OPAQUE_DESTINATIONS[state]) {
        assertEqual(requireCase(opaque, label).destination, toHex(destination), `${state} opaque direction ${label}`);
      }
    }
  }
}

function validateType(type) {
  assertEqual(type.originalGameplayName, EXPECTED_TURTLE_TANK.originalGameplayName, "class 14 name");
  assertEqual(type.definition.recordAddress, EXPECTED_TURTLE_TANK.typeRecordAddress, "class 14 record");
  assertEqual(type.definition.flags, toHex(EXPECTED_TURTLE_TANK.typeFlags), "class 14 flags");
  assertEqual(type.sprite.slot, 104, "class 14 sprite slot");
  assertEqual(type.sprite.pointerCell, EXPECTED_TURTLE_TANK.sprite.pointerCell, "class 14 pointer cell");
  assertEqual(type.sprite.sourcePath, EXPECTED_TURTLE_TANK.sprite.sourcePath, "class 14 source");
}

function inspectSprite(executablePath, spritePath) {
  const table = extractOriginalSpriteTable(executablePath).entries[EXPECTED_TURTLE_TANK.sprite.tableIndex];
  if (!table) throw new Error("sprite table is missing index 4");
  assertEqual(table.tableVa, EXPECTED_TURTLE_TANK.sprite.pointerCell, "sprite pointer cell");
  assertEqual(table.sourcePath, EXPECTED_TURTLE_TANK.sprite.sourcePath, "sprite table source");
  const buffer = readFileSync(spritePath);
  const digest = sha256(buffer);
  assertEqual(digest, EXPECTED_TURTLE_TANK.sprite.sha256, `${spritePath} SHA-256`);
  const header = parseSpriteLikeHeader(buffer, spritePath);
  for (const key of ["width", "height", "frameCount"]) {
    assertEqual(header[key], EXPECTED_TURTLE_TANK.sprite[key], `${spritePath} ${key}`);
  }
  return {
    path: spritePath,
    sha256: digest,
    width: header.width,
    height: header.height,
    frameCount: header.frameCount,
    slot: 104,
    tableIndex: 4,
    pointerCell: table.tableVa,
    sourcePath: table.sourcePath,
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

function validateCase(artifact, functionEntry, switchAddress, label, destination, name) {
  const table = requireSwitch(artifact, functionEntry, switchAddress);
  assertEqual(requireCase(table, label).destination, toHex(destination), `${name} destination`);
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
  const options = new Map([["--input", "executablePath"], ["--functions", "functionsPath"], ["--jump-tables", "jumpTablesPath"], ["--seeds", "seedsPath"], ["--sprite", "spritePath"]]);
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
