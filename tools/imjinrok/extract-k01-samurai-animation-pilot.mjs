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
import {
  STATE_1_SPECIAL_DIRECTION_MASK,
  extractUnitAnimationPilot,
} from "./extract-unit-animation-pilot.mjs";
import { readPeImage, toHex } from "./pe-image.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_FUNCTIONS_PATH = "analysis/generated/imjinrok2/functions.json";
const DEFAULT_JUMP_TABLES_PATH =
  "analysis/generated/imjinrok2/jump-tables.json";
const DEFAULT_SEEDS_PATH = "analysis/generated/imjinrok2/seeds.json";
const DEFAULT_SHARED_DIRECTION_SPRITE_PATH =
  "original/imjinrok2/char/swordk.spr";
const DEFAULT_PRIMARY_SPRITE_PATH =
  "original/imjinrok2/char/horseswordj1.spr";
const DEFAULT_SECONDARY_SPRITE_PATH =
  "original/imjinrok2/char/horseswordj2.spr";

export const EXPECTED_SAMURAI = {
  internalClass: 13,
  originalGameplayName: "일본 사무라이",
  typeRecordAddress: "0x00883eec",
  typeFlags: 0x00089005,
  primary: {
    slot: 117,
    tableIndex: 17,
    pointerCell: "0x004bc268",
    sourcePath: "char\\horseswordj1.spr",
    normalizedSourcePath: "char/horseswordj1.spr",
    sha256:
      "f08dba883a1e5686383d05882d2c0f21c2bb52b6b2c2bb00e4d806f41ac9fdfa",
    width: 80,
    height: 80,
    frameCount: 90,
  },
  secondary: {
    slot: 118,
    tableIndex: 18,
    pointerCell: "0x004bc26c",
    sourcePath: "char\\horseswordj2.spr",
    normalizedSourcePath: "char/horseswordj2.spr",
    sha256:
      "d3d3ec5f0ef9d4b3237182f8dd34baf532437a4f17622b6995877702d3576a62",
    width: 80,
    height: 80,
    frameCount: 70,
  },
};

export const SAMURAI_DIRECTION_PROFILES = [
  { facing: "s", direction: 0x01, deltaX: 0, deltaY: 1, frameBaseIndex: 0, mirrorX: false },
  { facing: "sw", direction: 0x05, deltaX: -1, deltaY: 1, frameBaseIndex: 1, mirrorX: false },
  { facing: "w", direction: 0x04, deltaX: -1, deltaY: 0, frameBaseIndex: 2, mirrorX: false },
  { facing: "nw", direction: 0x14, deltaX: -1, deltaY: -1, frameBaseIndex: 3, mirrorX: false },
  { facing: "n", direction: 0x10, deltaX: 0, deltaY: -1, frameBaseIndex: 2, mirrorX: true },
  { facing: "ne", direction: 0x50, deltaX: 1, deltaY: -1, frameBaseIndex: 1, mirrorX: true },
  { facing: "e", direction: 0x40, deltaX: 1, deltaY: 0, frameBaseIndex: 0, mirrorX: true },
  { facing: "se", direction: 0x41, deltaX: 1, deltaY: 1, frameBaseIndex: 4, mirrorX: false },
];

const ALTERNATE_MOVEMENT_ELIGIBILITY_MASK = 0x04000000;
const IDLE_SPECIAL_PATH_MASK = 0x00000008;
const ATTACK_SPECIAL_PATH_MASK = 0x80000000;
const CLASS_INITIALIZER_FUNCTION = 0x004291d0;
const CLASS_SWITCH_ADDRESS = 0x004292b3;
const CLASS_INITIALIZER_DESTINATION = 0x0042a492;
const ATTACK_WRAPPER_FUNCTION = 0x0041e370;
const ATTACK_SWITCH_ADDRESS = 0x0041e385;
const ATTACK_CLASS_13_DESTINATION = 0x0041e3a0;
const NORMAL_ATTACK_CONSUMER = 0x0041e200;

const FUNCTION_CONTRACTS = [
  {
    entry: "0x004291d0",
    bodyRanges: ["0x004291d0-0x0042c547"],
    instructionCount: 4156,
    instructionSha256:
      "1c05959938219ae4fa918ba3061b1856dcfb575f007a1a48281dd316709a7e96",
    requiredAddresses: [CLASS_SWITCH_ADDRESS, CLASS_INITIALIZER_DESTINATION, 0x0042a51f],
  },
  {
    entry: "0x0041e370",
    bodyRanges: ["0x0041e370-0x0041e3bd", "0x0041e3f0-0x0041e5db"],
    instructionCount: 115,
    instructionSha256:
      "aa96086d04f698f4965205fa74803f0cc7d7db9a05ee610834a0ccffac293a61",
    requiredAddresses: [ATTACK_SWITCH_ADDRESS, ATTACK_CLASS_13_DESTINATION, 0x0041e3b8],
  },
  {
    entry: "0x0041d210",
    bodyRanges: [
      "0x0041d210-0x0041d277",
      "0x0041d2c0-0x0041d41a",
      "0x0041e200-0x0041e2f5",
    ],
    instructionCount: 177,
    instructionSha256:
      "dbc2f289ae0aacdc6d7ef785d7d8290d1153742003a389889f5ac881563ca278",
    requiredAddresses: [NORMAL_ATTACK_CONSUMER],
  },
];

const STATIC_EVIDENCE = [
  {
    id: "class-dispatch-input",
    va: 0x004292a2,
    bytes: "33 c0 8a 46 37 8d 48 fe",
    meaning:
      "the initializer dispatches on BYTE [entity+0x37] before the class switch",
  },
  {
    id: "class-13-idle-and-movement-initializers",
    va: 0x0042a492,
    bytes:
      "bb 08 00 00 00 8b ce 53 6a 00 6a 76 88 9e 92 00 00 00 e8 a7 e9 00 00 53 6a 00 6a 75 8b ce 88 9e a6 00 00 00 e8 35 ea 00 00",
    meaning:
      "class 13 configures state 8 with slot 118/start 0/stride 8/phase 8 and state 1 with slot 117/start 0/stride 8/phase 8",
  },
  {
    id: "class-13-death-first-facing",
    va: 0x0042a4bb,
    bytes:
      "53 6a 28 6a 75 6a 00 8b ce 66 89 9e 8c 01 00 00 e8 e0 eb 00 00",
    meaning:
      "class 13 writes death phase count 8 and facing zero slot 117/base 40",
  },
  {
    id: "class-13-death-remaining-facings",
    va: 0x0042a4d0,
    bytes:
      "53 6a 28 6a 75 6a 01 8b ce e8 d2 eb 00 00 53 6a 28 6a 75 6a 02 8b ce e8 c4 eb 00 00 53 6a 28 6a 75 6a 03 8b ce e8 b6 eb 00 00 53 6a 28 6a 75 6a 04 8b ce e8 a8 eb 00 00",
    meaning:
      "class 13 configures death facings one through four with the same slot 117/base 40/phase 8",
  },
  {
    id: "class-13-attack-initializer",
    va: 0x0042a508,
    bytes:
      "53 6a 32 6a 75 8b ce 66 89 9e 44 01 00 00 e8 c5 eb 00 00",
    meaning:
      "class 13 configures state 4 with slot 117/start 50/stride 8/phase 8",
  },
  {
    id: "state-8-idle-phase-producer",
    va: 0x0043c344,
    bytes:
      "66 8b 83 b2 01 00 00 89 8b 28 02 00 00 0f be 8b 92 00 00 00 66 40 c6 43 03 08 0f bf c0 99 f7 f9 c6 43 04 01 66 89 93 b2 01 00 00 66 89 53 34",
    meaning:
      "the action-state 1 path selects animation state 8 and advances its phase",
  },
  {
    id: "state-8-wrapper-and-normal-consumer",
    va: 0x0041d870,
    bytes:
      "f6 41 74 08 74 05 e9 75 01 00 00 e9 00 00 00 00 66 0f b6 81 93 00 00 00 66 89 41 0a",
    meaning:
      "state 8 takes the normal +0x1e6 consumer at 0x0041d880 only when flags bit 0x08 is clear",
  },
  {
    id: "state-8-five-facing-writer",
    va: 0x00438e50,
    bytes:
      "53 8b 5c 24 10 55 56 57 8b 7c 24 18 8b e9 33 f6 8b 44 24 14 53 57 50 56 8b cd e8 11 00 00 00 46 03 fb 66 83 fe 05 7c e8 5f 5e 5d 5b c2 0c 00",
    meaning:
      "the state 8 initializer writes five facing bases while adding the caller-supplied stride",
  },
  {
    id: "state-1-normal-path-condition",
    va: 0x0041efa0,
    bytes:
      "f7 41 74 08 00 00 80 0f 84 d8 01 00 00",
    meaning:
      "state 1 uses its normal +0x1e6 direction path only when mask 0x80000008 is clear",
  },
  {
    id: "state-1-slot-and-direction-consumer",
    va: 0x0041f185,
    bytes:
      "0f bf 81 e6 01 00 00 66 0f b6 91 a7 00 00 00",
    meaning:
      "state 1 reads direction WORD +0x1e6 and configured sprite slot +0xa7",
  },
  {
    id: "state-1-five-facing-writer",
    va: 0x00438ef0,
    bytes:
      "53 8b 5c 24 10 55 56 57 8b 7c 24 18 8b e9 33 f6 8b 44 24 14 53 57 50 56 8b cd e8 c1 ff ff ff 46 03 fb 66 83 fe 05 7c e8",
    meaning:
      "the state 1 initializer writes five facing bases while adding the caller-supplied stride",
  },
  {
    id: "state-4-attack-phase-producer",
    va: 0x00423837,
    bytes:
      "8a 57 6f 8a 4f 6e fe c2 c6 47 03 04 8a c2 88 57 6f 3a c1 7c 7c 66 8b 8f 44 01 00 00 33 c0 66 3b c8 c6 47 6f 00 75 0d 66 89 87 b2 01 00 00 66 89 47 34 eb 21 66 8b 87 b2 01 00 00 c6 47 04 01 66 40 0f bf c0 0f bf c9 99 f7 f9 66 89 97 b2 01 00 00 66 89 57 34",
    meaning:
      "the target-driven combat handler selects state 4 and advances phase modulo WORD +0x144",
  },
  {
    id: "state-4-class-dispatch",
    va: 0x0041e370,
    bytes:
      "33 c0 8a 41 37 83 c0 fb 83 f8 20 77 23 33 d2 8a 90 c8 e3 41 00 ff 24 95 c0 e3 41 00",
    meaning:
      "the state 4 wrapper dispatches BYTE +0x37 through switch 0x0041e385",
  },
  {
    id: "state-4-class-13-normal-gates",
    va: 0x0041e3a0,
    bytes:
      "f7 41 74 00 00 00 80 75 14 66 83 b9 44 01 00 00 00 75 05 e9 b8 f4 ff ff e9 43 fe ff ff",
    meaning:
      "class 13 reaches 0x0041e200 only when flags 0x80000000 are clear and WORD +0x144 is nonzero",
  },
  {
    id: "state-4-normal-direction-consumer",
    va: NORMAL_ATTACK_CONSUMER,
    bytes:
      "66 8b 81 46 01 00 00 66 89 41 0a",
    meaning:
      "the normal state 4 consumer reads the configured slot from +0x146",
  },
  {
    id: "state-4-five-facing-writer",
    va: 0x004390e0,
    bytes:
      "53 8b 5c 24 10 55 56 57 8b 7c 24 18 8b e9 33 f6 8b 44 24 14 53 57 50 56 8b cd e8 41 00 00 00 46 03 fb 66 83 fe 05 7c e8 5f 5e 5d 5b c2 0c 00",
    meaning:
      "the state 4 initializer writes five facing bases while adding the caller-supplied stride",
  },
  {
    id: "health-zero-action-state-transition",
    va: 0x0043ccf6,
    bytes:
      "80 be f0 01 00 00 01 0f 85 3c 04 00 00 66 c7 86 b0 01 00 00 06 00 66 89 ae b2 01 00 00",
    meaning:
      "eligible signed-health-zero entities enter action state 6 and reset animation phase",
  },
  {
    id: "state-7-death-phase-producer",
    va: 0x004236a4,
    bytes:
      "66 8b 8e 8c 01 00 00 33 c0 66 3b c8 c6 46 6f 00 c6 46 03 07 7e 1a",
    meaning:
      "the action-state 6 handler reads phase count +0x18c and selects animation state 7",
  },
  {
    id: "state-7-normal-direction-consumer",
    va: 0x0041d700,
    bytes:
      "66 8b 81 92 01 00 00 66 89 41 0a",
    meaning:
      "state 7 reads the configured sprite slot from +0x192",
  },
  {
    id: "state-7-facing-writer",
    va: 0x004390b0,
    bytes:
      "66 8b 44 24 08 0f bf 54 24 04 66 89 81 92 01 00 00 66 8b 44 24 0c 66 89 84 51 94 01 00 00 c2 10 00",
    meaning:
      "the state 7 writer stores the sprite slot and selected facing base",
  },
];

const STATE_CONFIGURATIONS = {
  idle: {
    originalAnimationState: 8,
    meaning: "idle",
    resource: "secondary",
    frameStart: 0,
    frameStride: 8,
    phaseCount: 8,
    loopPolicy: "repeats-while-original-state-8-updates",
  },
  move: {
    originalAnimationState: 1,
    meaning: "normal-movement",
    resource: "primary",
    frameStart: 0,
    frameStride: 8,
    phaseCount: 8,
    loopPolicy: "repeats-while-original-state-1-updates",
  },
  attack: {
    originalAnimationState: 4,
    meaning: "target-driven-attack",
    resource: "primary",
    frameStart: 50,
    frameStride: 8,
    phaseCount: 8,
    loopPolicy: "phase-cycle-controlled-by-original-combat-handler",
  },
  death: {
    originalAnimationState: 7,
    meaning: "health-zero-death",
    resource: "primary",
    frameStart: 40,
    frameStride: 0,
    phaseCount: 8,
    loopPolicy: "phase-and-lifetime-controlled-by-original-death-handler",
  },
};

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const report = extractK01SamuraiAnimationPilot(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify(report, null, 2));
}

export function extractK01SamuraiAnimationPilot({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  functionsPath = DEFAULT_FUNCTIONS_PATH,
  jumpTablesPath = DEFAULT_JUMP_TABLES_PATH,
  seedsPath = DEFAULT_SEEDS_PATH,
  sharedDirectionSpritePath = DEFAULT_SHARED_DIRECTION_SPRITE_PATH,
  primarySpritePath = DEFAULT_PRIMARY_SPRITE_PATH,
  secondarySpritePath = DEFAULT_SECONDARY_SPRITE_PATH,
} = {}) {
  const { buffer: executableBuffer, image } = readPeImage(executablePath);
  const executableSha256 = sha256(executableBuffer);
  assertEqual(
    executableSha256,
    EXPECTED_EXECUTABLE_SHA256,
    `${executablePath} SHA-256`,
  );

  const functions = readArtifact(functionsPath, executableSha256, "functions");
  const functionEvidence = FUNCTION_CONTRACTS.map((contract) =>
    validateFunction(functions.functions, contract),
  );
  const jumpTables = readArtifact(
    jumpTablesPath,
    executableSha256,
    "jump tables",
  );
  const classSwitch = requireSwitch(
    jumpTables,
    CLASS_INITIALIZER_FUNCTION,
    CLASS_SWITCH_ADDRESS,
  );
  assertEqual(
    requireCase(classSwitch, EXPECTED_SAMURAI.internalClass).destination,
    toHex(CLASS_INITIALIZER_DESTINATION),
    "class 13 initializer destination",
  );
  const attackSwitch = requireSwitch(
    jumpTables,
    ATTACK_WRAPPER_FUNCTION,
    ATTACK_SWITCH_ADDRESS,
  );
  assertEqual(
    requireCase(attackSwitch, EXPECTED_SAMURAI.internalClass).destination,
    toHex(ATTACK_CLASS_13_DESTINATION),
    "class 13 attack wrapper destination",
  );

  const commonDirectionPilot = extractUnitAnimationPilot({
    executablePath,
    spritePath: sharedDirectionSpritePath,
    jumpTablesPath,
    seedsPath,
  });
  const commonState1 = commonDirectionPilot.states.find(
    (state) => state.state === 1,
  );
  if (!commonState1) {
    throw new Error("shared direction pilot is missing state 1");
  }
  validateDirectionProfiles(
    commonState1.directions.map((direction) => ({
      ...direction,
      frameBaseIndex: direction.frameBase / commonState1.phaseCount,
    })),
  );

  const typeCatalog = extractEntityTypeCatalog({
    executablePath,
    seedsPath,
  });
  const type = typeCatalog.types.find(
    (candidate) => candidate.internalClass === EXPECTED_SAMURAI.internalClass,
  );
  if (!type) {
    throw new Error("entity catalog is missing class 13");
  }
  validateType(type);

  const spriteTable = extractOriginalSpriteTable(executablePath);
  const resources = {
    primary: inspectSpriteResource(
      spriteTable,
      EXPECTED_SAMURAI.primary,
      primarySpritePath,
    ),
    secondary: inspectSpriteResource(
      spriteTable,
      EXPECTED_SAMURAI.secondary,
      secondarySpritePath,
    ),
  };
  const states = Object.fromEntries(
    Object.entries(STATE_CONFIGURATIONS).map(([stateName, configuration]) => [
      stateName,
      buildStateReport(stateName, configuration, resources),
    ]),
  );

  const evidencePoints = STATIC_EVIDENCE.map((evidence) =>
    readEvidencePoint(executableBuffer, image, evidence),
  );
  requireAllEvidence(evidencePoints);

  const flags = EXPECTED_SAMURAI.typeFlags >>> 0;
  return {
    schemaVersion: 1,
    question:
      "원본 내부 class 13 일본 사무라이의 상태 8 idle, 상태 1 일반 이동, 상태 4 target-driven 공격, 상태 7 health-zero 사망이 어느 SPR 슬롯·프레임·8방향·mirror를 선택하는가?",
    analysisStatus: "static-confirmed",
    reproductionStatus: "reproduction-complete",
    implementationStatus: "theme-level-mapping",
    sources: {
      executable: { path: executablePath, sha256: executableSha256 },
      functions: { path: functionsPath, sourceSha256: functions.sourceSha256 },
      jumpTables: {
        path: jumpTablesPath,
        sourceSha256: jumpTables.sourceSha256,
      },
      seeds: { path: seedsPath, sourceSha256: executableSha256 },
      sprites: resources,
      sharedDirectionPilot: {
        internalClass: commonDirectionPilot.identity.internalClass,
        state: 1,
        functionEntry: commonState1.functionEntry,
        switchAddress: commonState1.switchAddress,
      },
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
      class: EXPECTED_SAMURAI.internalClass,
      destination: toHex(CLASS_INITIALIZER_DESTINATION),
    },
    attackDispatch: {
      wrapperFunction: toHex(ATTACK_WRAPPER_FUNCTION),
      switchAddress: toHex(ATTACK_SWITCH_ADDRESS),
      class: EXPECTED_SAMURAI.internalClass,
      destination: toHex(ATTACK_CLASS_13_DESTINATION),
      normalConsumer: toHex(NORMAL_ATTACK_CONSUMER),
      requiredFlagsClear: toHex(ATTACK_SPECIAL_PATH_MASK),
      requiredPhaseCountCondition: "WORD [entity+0x144] != 0",
    },
    initialTypeFlags: {
      value: toHex(flags),
      state1SpecialMaskValue: toHex(flags & STATE_1_SPECIAL_DIRECTION_MASK),
      alternateMovementEligibilityMaskValue: toHex(
        flags & ALTERNATE_MOVEMENT_ELIGIBILITY_MASK,
      ),
      idleSpecialMaskValue: toHex(flags & IDLE_SPECIAL_PATH_MASK),
      attackSpecialMaskValue: toHex(flags & ATTACK_SPECIAL_PATH_MASK),
      normalCoreStatePathsSelected: true,
      laterRuntimeMutation: "unresolved",
    },
    recoveredStateSemantics: {
      idle: {
        producer: "0x0043c344",
        wrapper: "0x0041d870",
        consumer: "0x0041d880",
      },
      move: {
        producer: "0x00425b20",
        consumer: "0x0041efa0",
      },
      attack: {
        producer: "0x00423837",
        wrapper: "0x0041e370",
        consumer: "0x0041e200",
      },
      death: {
        healthZeroTransition: "0x0043ccf6",
        producer: "0x004236a4",
        consumer: "0x0041d700",
      },
    },
    states,
    functionEvidence,
    evidencePoints,
    acceptedInputScope:
      "the eight recovered normal raw directions and phases 0..7 on the normal consumers selected by the scoped flag gates; gate-bit patterns that select out-of-scope consumers are rejected, while other later flag mutations remain unresolved",
    unresolvedScope:
      "exact seconds per phase, original update to project 24 Hz mapping, pivot, hit reaction, later runtime flag mutation, and death display lifetime",
  };
}

export function selectSamuraiFrame({
  state,
  direction,
  phase,
  entityFlags = EXPECTED_SAMURAI.typeFlags,
  attackPhaseCount = 8,
}) {
  const stateName = stateNameFor(state);
  validateUnsignedDword(entityFlags, "entityFlags");
  validateUnsignedWord(attackPhaseCount, "attackPhaseCount");
  if (!Number.isInteger(phase) || phase < 0 || phase > 7) {
    throw new RangeError(`phase ${phase} is outside 0..7`);
  }
  const profile = SAMURAI_DIRECTION_PROFILES.find(
    (candidate) => candidate.direction === direction,
  );
  if (!profile) {
    throw new RangeError(`direction ${direction} is outside the recovered normal set`);
  }
  validateReplayGates(stateName, entityFlags >>> 0, attackPhaseCount);

  const configuration = STATE_CONFIGURATIONS[stateName];
  return {
    state,
    stateName,
    direction,
    facing: profile.facing,
    phase,
    spriteSlot: EXPECTED_SAMURAI[configuration.resource].slot,
    sourcePath: EXPECTED_SAMURAI[configuration.resource].sourcePath,
    frameIndex:
      configuration.frameStart +
      profile.frameBaseIndex * configuration.frameStride +
      phase,
    mirrorX: profile.mirrorX,
  };
}

function buildStateReport(stateName, configuration, resources) {
  const resource = resources[configuration.resource];
  const directions = SAMURAI_DIRECTION_PROFILES.map((profile) => {
    const frameBase =
      configuration.frameStart +
      profile.frameBaseIndex * configuration.frameStride;
    const frameRange = [frameBase, frameBase + configuration.phaseCount - 1];
    if (frameRange[1] >= resource.frameCount) {
      throw new RangeError(
        `${stateName} frame ${frameRange[1]} exceeds ${resource.frameCount - 1}`,
      );
    }
    return {
      ...profile,
      frameBase,
      phaseRange: [0, configuration.phaseCount - 1],
      frameRange,
    };
  });
  return {
    ...configuration,
    spriteSlot: EXPECTED_SAMURAI[configuration.resource].slot,
    sourcePath: EXPECTED_SAMURAI[configuration.resource].sourcePath,
    frameRange: [
      Math.min(...directions.map((direction) => direction.frameRange[0])),
      Math.max(...directions.map((direction) => direction.frameRange[1])),
    ],
    directions,
  };
}

function validateReplayGates(stateName, flags, attackPhaseCount) {
  if (
    stateName === "move" &&
    (flags &
      (STATE_1_SPECIAL_DIRECTION_MASK |
        ALTERNATE_MOVEMENT_ELIGIBILITY_MASK)) !==
      0
  ) {
    throw new Error(
      "state 1 creation-default normal movement path is unavailable after the scoped flags mutate",
    );
  }
  if (stateName === "idle" && (flags & IDLE_SPECIAL_PATH_MASK) !== 0) {
    throw new Error("state 8 normal direction path requires flags bit 0x08 clear");
  }
  if (stateName === "attack") {
    if ((flags & ATTACK_SPECIAL_PATH_MASK) !== 0) {
      throw new Error(
        "class 13 normal attack direction path requires flags 0x80000000 clear",
      );
    }
    if (attackPhaseCount === 0) {
      throw new Error(
        "class 13 attack wrapper requires WORD +0x144 nonzero to reach 0x0041e200",
      );
    }
  }
}

export function validateDirectionProfiles(directions) {
  const normalize = (profiles) =>
    profiles
      .map(
        ({
          direction,
          deltaX,
          deltaY,
          frameBaseIndex,
          mirrorX,
        }) => ({
          direction,
          deltaX,
          deltaY,
          frameBaseIndex,
          mirrorX,
        }),
      )
      .sort((left, right) => left.direction - right.direction);
  const actual = normalize(directions);
  const expected = normalize(SAMURAI_DIRECTION_PROFILES);
  assertDeepEqual(actual, expected, "shared normal direction profiles");
}

function validateType(type) {
  assertEqual(type.originalGameplayName, EXPECTED_SAMURAI.originalGameplayName, "class 13 name");
  assertEqual(type.definition.recordAddress, EXPECTED_SAMURAI.typeRecordAddress, "class 13 record");
  assertEqual(
    type.definition.flags,
    toHex(EXPECTED_SAMURAI.typeFlags),
    "class 13 flags",
  );
  assertEqual(type.sprite.slot, EXPECTED_SAMURAI.primary.slot, "class 13 primary slot");
  assertEqual(
    type.sprite.pointerCell,
    EXPECTED_SAMURAI.primary.pointerCell,
    "class 13 primary pointer cell",
  );
  assertEqual(
    type.sprite.sourcePath,
    EXPECTED_SAMURAI.primary.sourcePath,
    "class 13 primary source",
  );
}

function inspectSpriteResource(spriteTable, expected, path) {
  const tableEntry = spriteTable.entries[expected.tableIndex];
  if (!tableEntry) {
    throw new Error(`sprite table is missing index ${expected.tableIndex}`);
  }
  assertEqual(tableEntry.index, expected.tableIndex, `${expected.sourcePath} table index`);
  assertEqual(tableEntry.tableVa, expected.pointerCell, `${expected.sourcePath} pointer cell`);
  assertEqual(tableEntry.sourcePath, expected.sourcePath, `${expected.sourcePath} table source`);

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
    tableIndex: tableEntry.index,
    pointerCell: tableEntry.tableVa,
    sourcePath: tableEntry.sourcePath,
  };
}

function readArtifact(path, expectedSourceSha256, label) {
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  assertEqual(
    parsed.sourceSha256,
    expectedSourceSha256,
    `${label} source SHA-256`,
  );
  return parsed;
}

function validateFunction(functions, contract) {
  const functionRecord = functions.find(
    (candidate) => candidate.entry === contract.entry,
  );
  if (!functionRecord) {
    throw new Error(`functions artifact is missing ${contract.entry}`);
  }
  assertDeepEqual(
    functionRecord.bodyRanges,
    contract.bodyRanges,
    `${contract.entry} body ranges`,
  );
  assertEqual(
    functionRecord.instructionCount,
    contract.instructionCount,
    `${contract.entry} instruction count`,
  );
  assertEqual(
    functionRecord.instructionSha256,
    contract.instructionSha256,
    `${contract.entry} instruction SHA-256`,
  );
  for (const address of contract.requiredAddresses) {
    if (!contract.bodyRanges.some((range) => rangeContains(range, address))) {
      throw new Error(
        `${toHex(address)} is outside canonical body ranges for ${contract.entry}`,
      );
    }
  }
  return {
    entry: contract.entry,
    bodyRanges: functionRecord.bodyRanges,
    instructionCount: functionRecord.instructionCount,
    instructionSha256: functionRecord.instructionSha256,
  };
}

function requireSwitch(artifact, functionEntry, switchAddress) {
  const tables = Object.values(artifact.tables ?? {});
  const table = tables.find(
    (candidate) =>
      candidate.functionEntry === toHex(functionEntry) &&
      candidate.switchAddress === toHex(switchAddress),
  );
  if (!table) {
    throw new Error(
      `missing switch ${toHex(switchAddress)} in ${toHex(functionEntry)}`,
    );
  }
  return table;
}

function requireCase(table, label) {
  const entry = table.cases.find((candidate) => candidate.label === label);
  if (!entry) {
    throw new Error(`switch ${table.switchAddress} is missing case ${label}`);
  }
  return entry;
}

function readEvidencePoint(buffer, image, evidence) {
  const rawOffset = image.vaToRawOffset(evidence.va);
  const expectedBytes = Buffer.from(evidence.bytes.replaceAll(" ", ""), "hex");
  const actualBytes =
    rawOffset === undefined
      ? Buffer.alloc(0)
      : buffer.subarray(rawOffset, rawOffset + expectedBytes.length);
  return {
    ...evidence,
    va: toHex(evidence.va),
    rawOffset: rawOffset === undefined ? undefined : toHex(rawOffset),
    expectedBytes: formatBytes(expectedBytes),
    actualBytes: formatBytes(actualBytes),
    matched: Buffer.compare(actualBytes, expectedBytes) === 0,
  };
}

function requireAllEvidence(evidencePoints) {
  const mismatch = evidencePoints.find((evidence) => !evidence.matched);
  if (mismatch) {
    throw new Error(
      `static evidence mismatch at ${mismatch.va} (${mismatch.id}): expected ${mismatch.expectedBytes}, got ${mismatch.actualBytes}`,
    );
  }
}

function stateNameFor(state) {
  const names = new Map([
    [8, "idle"],
    [1, "move"],
    [4, "attack"],
    [7, "death"],
  ]);
  const name = names.get(state);
  if (!name) {
    throw new RangeError(`state ${state} is outside the scoped set 1,4,7,8`);
  }
  return name;
}

function validateUnsignedDword(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new RangeError(`${label} must be an unsigned DWORD`);
  }
}

function validateUnsignedWord(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new RangeError(`${label} must be an unsigned WORD`);
  }
}

function rangeContains(range, address) {
  const [start, end] = range.split("-").map((value) => Number.parseInt(value, 16));
  return start <= address && address < end;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`);
  }
}

function assertDeepEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label} mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function formatBytes(bytes) {
  return Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join(" ");
}

function parseArgs(argv) {
  const result = {};
  const options = new Map([
    ["--input", "executablePath"],
    ["--functions", "functionsPath"],
    ["--jump-tables", "jumpTablesPath"],
    ["--seeds", "seedsPath"],
    ["--shared-direction-sprite", "sharedDirectionSpritePath"],
    ["--primary-sprite", "primarySpritePath"],
    ["--secondary-sprite", "secondarySpritePath"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      continue;
    }
    const key = options.get(argument);
    if (!key) {
      throw new Error(`unknown argument: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value) {
      throw new Error(`${argument} requires a path`);
    }
    result[key] = value;
    index += 1;
  }
  return result;
}
