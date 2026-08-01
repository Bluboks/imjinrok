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
const DEFAULT_JUMP_TABLES_PATH =
  "analysis/generated/imjinrok2/jump-tables.json";
const DEFAULT_SEEDS_PATH = "analysis/generated/imjinrok2/seeds.json";
const DEFAULT_SPEARMAN_SPRITE_PATH =
  "original/imjinrok2/char/swordk.spr";
const DEFAULT_GWON_YUL_ATTACK_SPRITE_PATH =
  "original/imjinrok2/char/generalk12.spr";
const DEFAULT_GWON_YUL_IDLE_SPRITE_PATH =
  "original/imjinrok2/char/generalk13.spr";
const DEFAULT_RYU_SEONG_RYONG_COMBAT_SPRITE_PATH =
  "original/imjinrok2/char/generalk32.spr";

const CLASS_SWITCH_FUNCTION = 0x004291d0;
const CLASS_SWITCH_ADDRESS = 0x004292b3;
const STATE_1_INITIALIZER = 0x00438ef0;
const SPRITE_SLOT_TABLE_BASE = 100;
const ALTERNATE_MOVEMENT_ELIGIBILITY_MASK = 0x04000000;
const FACING_BY_DELTA = new Map([
  ["0,1", "s"],
  ["-1,1", "sw"],
  ["-1,0", "w"],
  ["-1,-1", "nw"],
  ["0,-1", "n"],
  ["1,-1", "ne"],
  ["1,0", "e"],
  ["1,1", "se"],
]);
const FRAME_BASE_INDEX_BY_FACING = new Map([
  ["s", 0],
  ["sw", 1],
  ["w", 2],
  ["nw", 3],
  ["n", 2],
  ["ne", 1],
  ["e", 0],
  ["se", 4],
]);

const HERO_PROFILES = [
  {
    projectEntityId: "gwon-yul",
    projectVisualId: "korean-gwon-yul",
    internalClass: 76,
    originalGameplayName: "조선 권율",
    spriteSlot: 153,
    sourcePath: "char\\generalk11.spr",
    spritePath: "original/imjinrok2/char/generalk11.spr",
    spriteSha256:
      "658617ea4c762e85ff4e47167f6ed2f8cf1b37e8daea69338ed3e2c61c5bd829",
    initializerAddress: 0x0042a9da,
    state1FrameStart: 0,
    idle: {
      spriteSlot: 155,
      sourcePath: "char\\generalk13.spr",
      spritePath: DEFAULT_GWON_YUL_IDLE_SPRITE_PATH,
      spriteSha256:
        "2576233295024781ab5c83da38116ac43ce24a2a2a7b0203876126b480bcdcf9",
      frameStart: 0,
      stride: 8,
      phaseCount: 8,
    },
    attack: {
      spriteSlot: 154,
      sourcePath: "char\\generalk12.spr",
      spritePath: DEFAULT_GWON_YUL_ATTACK_SPRITE_PATH,
      spriteSha256:
        "9ae22b6fb4e4218b7625b6d73aaaf44a2696822d1ff4e518e396a1128c95a72b",
      frameStart: 0,
      stride: 10,
      phaseCount: 8,
    },
    death: {
      spriteSlot: 153,
      sourcePath: "char\\generalk11.spr",
      frameStart: 40,
      stride: 0,
      phaseCount: 8,
    },
    state1Anchor: {
      id: "class-76-state-1-initializer",
      va: 0x0042a9f4,
      bytes:
        "53 6a 00 68 99 00 00 00 8b ce 88 9e a6 00 00 00 e8 e7 e4 00 00",
      meaning:
        "class 76 configures state 1 with slot 153, frame start 0, stride 8, and phase count 8",
    },
    stateAnchors: [
      {
        id: "class-76-state-8-idle-initializer",
        va: 0x0042a9da,
        bytes:
          "bb 08 00 00 00 8b ce 53 6a 00 68 9b 00 00 00 88 9e 92 00 00 00 e8 5c e4 00 00",
        meaning:
          "class 76 configures animation state 8 with slot 155, frame start 0, stride 8, and phase count 8",
      },
      {
        id: "class-76-state-7-death-first-facing",
        va: 0x0042aa09,
        bytes:
          "53 6a 28 68 99 00 00 00 6a 00 8b ce 66 89 9e 8c 01 00 00 e8 8f e6 00",
        meaning:
          "class 76 configures the first state 7 facing with slot 153, frame base 40, and phase count 8",
      },
      {
        id: "class-76-state-7-death-last-facing",
        va: 0x0042aa54,
        bytes:
          "53 6a 28 68 99 00 00 00 6a 04 8b ce e8 4b e6 00 00",
        meaning:
          "class 76 configures the fifth state 7 facing with the same slot 153 and frame base 40",
      },
      {
        id: "class-76-state-4-attack-initializer",
        va: 0x0042aa65,
        bytes:
          "6a 0a 6a 00 68 9a 00 00 00 8b ce 66 89 9e 44 01 00 00 e8 64 e6 00 00",
        meaning:
          "class 76 configures animation state 4 with slot 154, frame start 0, stride 10, and phase count 8",
      },
    ],
  },
  {
    projectEntityId: "ryu-seong-ryong",
    projectVisualId: "korean-ryu-seong-ryong",
    internalClass: 78,
    originalGameplayName: "조선 유성룡",
    spriteSlot: 158,
    sourcePath: "char\\generalk31.spr",
    spritePath: "original/imjinrok2/char/generalk31.spr",
    spriteSha256:
      "11d3877f31e196d46b39d90f7153ccb931af9b92225b64ad334e9e6c031611e2",
    initializerAddress: 0x0042ab2a,
    state1FrameStart: 40,
    idle: {
      spriteSlot: 158,
      sourcePath: "char\\generalk31.spr",
      frameStart: 0,
      stride: 8,
      phaseCount: 8,
    },
    attack: {
      spriteSlot: 159,
      sourcePath: "char\\generalk32.spr",
      spritePath: DEFAULT_RYU_SEONG_RYONG_COMBAT_SPRITE_PATH,
      spriteSha256:
        "475c60db795407a4fba38f498c466e49d19b53cf83c31da63769aed8021af4bb",
      frameStart: 0,
      stride: 10,
      phaseCount: 10,
    },
    death: {
      spriteSlot: 159,
      sourcePath: "char\\generalk32.spr",
      frameStart: 50,
      stride: 0,
      phaseCount: 8,
    },
    state1Anchor: {
      id: "class-78-state-1-initializer",
      va: 0x0042ab44,
      bytes:
        "53 6a 28 68 9e 00 00 00 8b ce 88 9e a6 00 00 00 e8 97 e3 00 00",
      meaning:
        "class 78 configures state 1 with slot 158, frame start 40, stride 8, and phase count 8",
    },
    stateAnchors: [
      {
        id: "class-78-state-8-idle-initializer",
        va: 0x0042ab2a,
        bytes:
          "bb 08 00 00 00 8b ce 53 6a 00 68 9e 00 00 00 88 9e 92 00 00 00 e8 0c e3 00 00",
        meaning:
          "class 78 configures animation state 8 with slot 158, frame start 0, stride 8, and phase count 8",
      },
      {
        id: "class-78-state-7-death-first-facing",
        va: 0x0042ab59,
        bytes:
          "53 6a 32 68 9f 00 00 00 6a 00 8b ce 66 89 9e 8c 01 00 00 e8 3f e5 00 00",
        meaning:
          "class 78 configures the first state 7 facing with slot 159, frame base 50, and phase count 8",
      },
      {
        id: "class-78-state-7-death-last-facing",
        va: 0x0042aba4,
        bytes:
          "53 6a 32 68 9f 00 00 00 6a 04 8b ce e8 fb e4 00 00",
        meaning:
          "class 78 configures the fifth state 7 facing with the same slot 159 and frame base 50",
      },
      {
        id: "class-78-state-4-attack-initializer",
        va: 0x0042abb5,
        bytes:
          "6a 0a 6a 00 68 9f 00 00 00 8b ce 66 c7 86 44 01 00 00 0a 00 e8 12 e5 00 00",
        meaning:
          "class 78 configures animation state 4 with slot 159, frame start 0, stride 10, and phase count 10",
      },
    ],
  },
];

const SHARED_EVIDENCE = [
  {
    id: "animation-state-dispatcher",
    va: 0x0041d210,
    bytes:
      "0f be 41 03 48 83 f8 11 77 52 ff 24 85 78 d2 41 00",
    meaning:
      "the animation dispatcher reads signed BYTE +0x03 and selects the state-specific sprite/frame consumer",
  },
  {
    id: "state-8-idle-phase-producer",
    va: 0x0043c344,
    bytes:
      "66 8b 83 b2 01 00 00 89 8b 28 02 00 00 0f be 8b 92 00 00 00 66 40 c6 43 03 08 0f bf c0 99 f7 f9 c6 43 04 01 66 89 93 b2 01 00 00 66 89 53 34",
    meaning:
      "the action-state 1 update path advances phase modulo +0x92 and selects animation state 8",
  },
  {
    id: "state-8-five-facing-writer",
    va: 0x00438e50,
    bytes:
      "53 8b 5c 24 10 55 56 57 8b 7c 24 18 8b e9 33 f6 8b 44 24 14 53 57 50 56 8b cd e8 11 00 00 00 46 03 fb 66 83 fe 05 7c e8 5f 5e 5d 5b c2 0c 00",
    meaning:
      "the state 8 initializer writes five frame bases while adding the caller-supplied stride",
  },
  {
    id: "state-8-normal-direction-selector",
    va: 0x0041d880,
    bytes:
      "66 0f b6 81 93 00 00 00 66 89 41 0a",
    meaning:
      "the normal state 8 selector reads the sprite slot from +0x93 before applying direction and phase",
  },
  {
    id: "state-1-frame-base-writer",
    va: 0x00438ed0,
    bytes:
      "8a 44 24 08 0f bf 54 24 04 88 81 a7 00 00 00 66 8b 44 24 0c 66 89 84 51 a8 00 00 00 c2 10 00",
    meaning:
      "the helper writes the sprite slot to +0xa7 and a selected WORD frame base to +0xa8 + index*2",
  },
  {
    id: "state-1-five-facing-loop",
    va: 0x00438ef0,
    bytes:
      "53 8b 5c 24 10 55 56 57 8b 7c 24 18 8b e9 33 f6 8b 44 24 14 53 57 50 56 8b cd e8 c1 ff ff ff 46 03 fb 66 83 fe 05 7c e8",
    meaning:
      "the state 1 initializer writes five bases, adding the supplied stride after each write",
  },
  {
    id: "health-zero-action-state-transition",
    va: 0x0043ccf6,
    bytes:
      "80 be f0 01 00 00 01 0f 85 3c 04 00 00 66 c7 86 b0 01 00 00 06 00 66 89 ae b2 01 00 00",
    meaning:
      "after the health-at-+0x3e path reaches zero, eligible entities enter action state 6 and reset animation phase",
  },
  {
    id: "state-7-death-phase-producer",
    va: 0x004236a4,
    bytes:
      "66 8b 8e 8c 01 00 00 33 c0 66 3b c8 c6 46 6f 00 c6 46 03 07 7e 1a",
    meaning:
      "the action-state 6 death handler reads the +0x18c phase count and selects animation state 7",
  },
  {
    id: "state-7-facing-writer",
    va: 0x004390b0,
    bytes:
      "66 8b 44 24 08 0f bf 54 24 04 66 89 81 92 01 00 00 66 8b 44 24 0c 66 89 84 51 94 01 00 00 c2 10 00",
    meaning:
      "the state 7 writer stores its sprite slot at +0x192 and a selected facing base at +0x194 + index*2",
  },
  {
    id: "state-7-normal-direction-selector",
    va: 0x0041d700,
    bytes:
      "66 8b 81 92 01 00 00 66 89 41 0a",
    meaning:
      "the state 7 selector reads the sprite slot from +0x192 before applying direction and phase",
  },
  {
    id: "state-4-attack-phase-producer",
    va: 0x00423837,
    bytes:
      "8a 57 6f 8a 4f 6e fe c2 c6 47 03 04 8a c2 88 57 6f 3a c1 7c 7c 66 8b 8f 44 01 00 00 33 c0 66 3b c8 c6 47 6f 00 75 0d 66 89 87 b2 01 00 00 66 89 47 34 eb 21 66 8b 87 b2 01 00 00 c6 47 04 01 66 40 0f bf c0 0f bf c9 99 f7 f9 66 89 97 b2 01 00 00 66 89 57 34",
    meaning:
      "the target-driven combat handler selects animation state 4 and advances phase modulo +0x144",
  },
  {
    id: "state-4-five-facing-writer",
    va: 0x004390e0,
    bytes:
      "53 8b 5c 24 10 55 56 57 8b 7c 24 18 8b e9 33 f6 8b 44 24 14 53 57 50 56 8b cd e8 41 00 00 00 46 03 fb 66 83 fe 05 7c e8 5f 5e 5d 5b c2 0c 00",
    meaning:
      "the state 4 initializer writes five frame bases while adding the caller-supplied stride",
  },
  {
    id: "state-4-normal-direction-selector",
    va: 0x0041e200,
    bytes:
      "66 8b 81 46 01 00 00 66 89 41 0a",
    meaning:
      "the normal state 4 selector reads the sprite slot from +0x146 before applying direction and phase",
  },
];

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = parseArgs(process.argv.slice(2));
  const report = extractK01HeroMovementPilot({
    executablePath: args.input,
    jumpTablesPath: args.jumpTables,
    seedsPath: args.seeds,
    spearmanSpritePath: args.spearmanSprite,
    gwonYulSpritePath: args.gwonYulSprite,
    gwonYulAttackSpritePath: args.gwonYulAttackSprite,
    gwonYulIdleSpritePath: args.gwonYulIdleSprite,
    ryuSeongRyongSpritePath: args.ryuSeongRyongSprite,
    ryuSeongRyongCombatSpritePath: args.ryuSeongRyongCombatSprite,
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
}

export function extractK01HeroMovementPilot({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  jumpTablesPath = DEFAULT_JUMP_TABLES_PATH,
  seedsPath = DEFAULT_SEEDS_PATH,
  catalogSeedsPath = seedsPath,
  spearmanSpritePath = DEFAULT_SPEARMAN_SPRITE_PATH,
  gwonYulSpritePath = HERO_PROFILES[0].spritePath,
  gwonYulAttackSpritePath = DEFAULT_GWON_YUL_ATTACK_SPRITE_PATH,
  gwonYulIdleSpritePath = DEFAULT_GWON_YUL_IDLE_SPRITE_PATH,
  ryuSeongRyongSpritePath = HERO_PROFILES[1].spritePath,
  ryuSeongRyongCombatSpritePath =
    DEFAULT_RYU_SEONG_RYONG_COMBAT_SPRITE_PATH,
} = {}) {
  const commonMovement = extractUnitAnimationPilot({
    executablePath,
    spritePath: spearmanSpritePath,
    jumpTablesPath,
    seedsPath,
  });
  const typeCatalog = extractEntityTypeCatalog({
    executablePath,
    seedsPath: catalogSeedsPath,
  });
  const spriteTable = extractOriginalSpriteTable(executablePath);
  const { buffer: executableBuffer, image } = readPeImage(executablePath);
  const executableSha256 = sha256(executableBuffer);
  assertEqual(
    executableSha256,
    EXPECTED_EXECUTABLE_SHA256,
    `${executablePath} SHA-256`,
  );

  const jumpTables = readJumpTables(jumpTablesPath, executableSha256);
  const classSwitch = findSwitch(
    jumpTables,
    CLASS_SWITCH_FUNCTION,
    CLASS_SWITCH_ADDRESS,
  );
  const sharedEvidence = SHARED_EVIDENCE.map((evidence) =>
    readEvidencePoint(executableBuffer, image, evidence),
  );
  requireAllEvidence(sharedEvidence);

  const state1 = commonMovement.states.find((state) => state.state === 1);
  if (!state1) {
    throw new Error("The common movement pilot has no state 1 report");
  }
  assertEqual(state1.phaseCount, 8, "state 1 phase count");

  const spritePaths = new Map([
    [
      "gwon-yul",
      {
        movement: gwonYulSpritePath,
        idle: gwonYulIdleSpritePath,
        attack: gwonYulAttackSpritePath,
        death: gwonYulSpritePath,
      },
    ],
    [
      "ryu-seong-ryong",
      {
        movement: ryuSeongRyongSpritePath,
        idle: ryuSeongRyongSpritePath,
        attack: ryuSeongRyongCombatSpritePath,
        death: ryuSeongRyongCombatSpritePath,
      },
    ],
  ]);
  const heroes = HERO_PROFILES.map((profile) =>
    extractHero({
      executableBuffer,
      image,
      typeCatalog,
      spriteTable,
      classSwitch,
      state1,
      profile,
      spritePaths: spritePaths.get(profile.projectEntityId),
    }),
  );

  return {
    schemaVersion: 2,
    analysisStatus: "static-confirmed-for-k01-hero-core-animation-states",
    analysisScope:
      "Original identity, dedicated and secondary SPR slots, initial type flags, and state 1 movement, state 8 idle, state 4 attack, and state 7 death direction/frame selection for K01 Gwon Yul and Yu Seong-ryong only.",
    sources: {
      executable: {
        path: executablePath,
        sha256: executableSha256,
      },
      jumpTables: {
        path: jumpTablesPath,
        sourceSha256: executableSha256,
      },
      seeds: {
        path: seedsPath,
        sourceSha256: executableSha256,
      },
      commonMovementPilot: {
        internalClass: commonMovement.identity.internalClass,
        state: 1,
        functionEntry: state1.functionEntry,
        switchAddress: state1.switchAddress,
      },
    },
    classDispatch: {
      classField: commonMovement.entityBinding.classField,
      functionEntry: toHex(CLASS_SWITCH_FUNCTION),
      switchAddress: toHex(CLASS_SWITCH_ADDRESS),
    },
    state1Configuration: {
      initializerFunction: toHex(STATE_1_INITIALIZER),
      spriteSlotField: state1.spriteSlotConfigField,
      phaseCountField: state1.phaseCountField,
      frameBaseFields: ["+0xa8", "+0xaa", "+0xac", "+0xae", "+0xb0"],
      frameBaseCount: 5,
      stride: 8,
      phaseCount: state1.phaseCount,
      directionField: state1.directionField,
      specialDirectionMask: toHex(STATE_1_SPECIAL_DIRECTION_MASK),
      alternateMovementEligibilityMask: toHex(
        ALTERNATE_MOVEMENT_ELIGIBILITY_MASK,
      ),
    },
    recoveredStateSemantics: {
      idle: {
        originalAnimationState: 8,
        producer: toHex(0x0043c344),
        consumer: toHex(0x0041d880),
        spriteSlotField: "+0x93",
        phaseCountField: "+0x92",
        frameBaseFields: ["+0x94", "+0x96", "+0x98", "+0x9a", "+0x9c"],
      },
      attack: {
        originalAnimationState: 4,
        producer: toHex(0x00423837),
        consumer: toHex(0x0041e200),
        spriteSlotField: "+0x146",
        phaseCountField: "+0x144",
        frameBaseFields: ["+0x148", "+0x14a", "+0x14c", "+0x14e", "+0x150"],
      },
      death: {
        originalActionState: 6,
        originalAnimationState: 7,
        healthField: "+0x3e",
        actionTransition: toHex(0x0043ccf6),
        producer: toHex(0x004236a4),
        consumer: toHex(0x0041d700),
        spriteSlotField: "+0x192",
        phaseCountField: "+0x18c",
        frameBaseFields: ["+0x194", "+0x196", "+0x198", "+0x19a", "+0x19c"],
      },
    },
    heroes,
    evidencePoints: [
      ...sharedEvidence,
      ...heroes.flatMap((hero) => hero.evidencePoints),
    ],
    unresolvedScope:
      "Hit-reaction state, exact seconds-per-phase timing, pivots, state 4 class-special direction branches outside classes 76/78, and later runtime flag mutation are not proven by this pilot. The project simulation also removes dead units immediately, so recovered death clips are not yet visible in gameplay.",
  };
}

function extractHero({
  executableBuffer,
  image,
  typeCatalog,
  spriteTable,
  classSwitch,
  state1,
  profile,
  spritePaths,
}) {
  const type = typeCatalog.types.find(
    (candidate) => candidate.internalClass === profile.internalClass,
  );
  if (!type) {
    throw new Error(`Missing class ${profile.internalClass} in type catalog`);
  }

  assertEqual(
    type.originalGameplayName,
    profile.originalGameplayName,
    `class ${profile.internalClass} original name`,
  );
  assertEqual(
    type.sprite.slot,
    profile.spriteSlot,
    `class ${profile.internalClass} sprite slot`,
  );
  assertEqual(
    type.sprite.sourcePath,
    profile.sourcePath,
    `class ${profile.internalClass} sprite source`,
  );

  const classCase = requireCase(classSwitch, profile.internalClass);
  assertEqual(
    classCase.destination,
    toHex(profile.initializerAddress),
    `class ${profile.internalClass} animation initializer`,
  );

  if (!spritePaths) {
    throw new Error(`Missing sprite paths for ${profile.projectEntityId}`);
  }
  const stateConfigurations = {
    movement: {
      spriteSlot: profile.spriteSlot,
      sourcePath: profile.sourcePath,
      spritePath: spritePaths.movement,
      spriteSha256: profile.spriteSha256,
      frameStart: profile.state1FrameStart,
      stride: 8,
      phaseCount: state1.phaseCount,
      originalAnimationState: 1,
      meaning: "normal-movement-visual",
    },
    idle: {
      ...profile.idle,
      spritePath: spritePaths.idle,
      spriteSha256:
        profile.idle.spriteSha256 ??
        requireSpriteSha256(profile, profile.idle.sourcePath),
      originalAnimationState: 8,
      meaning: "idle-visual",
    },
    attack: {
      ...profile.attack,
      spritePath: spritePaths.attack,
      spriteSha256:
        profile.attack.spriteSha256 ??
        requireSpriteSha256(profile, profile.attack.sourcePath),
      originalAnimationState: 4,
      meaning: "target-driven-attack-visual",
    },
    death: {
      ...profile.death,
      spritePath: spritePaths.death,
      spriteSha256:
        profile.death.spriteSha256 ??
        requireSpriteSha256(profile, profile.death.sourcePath),
      originalAnimationState: 7,
      meaning: "health-zero-death-visual",
    },
  };
  const spriteCache = new Map();
  const stateSprites = Object.fromEntries(
    Object.entries(stateConfigurations).map(([stateName, configuration]) => [
      stateName,
      readHeroSprite({
        profile,
        stateName,
        configuration,
        spriteTable,
        spriteCache,
      }),
    ]),
  );
  const typeFlags = Number.parseInt(type.definition.flags.slice(2), 16) >>> 0;
  const specialDirectionMaskValue =
    (typeFlags & STATE_1_SPECIAL_DIRECTION_MASK) >>> 0;
  const alternateMovementMaskValue =
    (typeFlags & ALTERNATE_MOVEMENT_ELIGIBILITY_MASK) >>> 0;

  const animations = Object.fromEntries(
    Object.entries(stateConfigurations).map(([stateName, configuration]) => [
      stateName,
      buildDirectionalAnimation({
        profile,
        stateName,
        state1,
        configuration,
        sprite: stateSprites[stateName],
      }),
    ]),
  );

  const evidencePoints = [
    readEvidencePoint(executableBuffer, image, profile.state1Anchor),
    ...profile.stateAnchors.map((anchor) =>
      readEvidencePoint(executableBuffer, image, anchor),
    ),
  ];
  requireAllEvidence(evidencePoints);

  return {
    projectEntityId: profile.projectEntityId,
    projectVisualId: profile.projectVisualId,
    identity: {
      internalClass: type.internalClass,
      originalGameplayName: type.originalGameplayName,
      definitionRecordAddress: type.definition.recordAddress,
      definitionInitializerCallAddress:
        type.definition.initializerCallAddress,
      spriteSlot: type.sprite.slot,
      sourcePath: type.sprite.sourcePath,
    },
    sprite: stateSprites.movement,
    sprites: Object.fromEntries(
      Object.entries(stateSprites).map(([stateName, sprite]) => [
        stateName,
        {
          ...sprite,
          spriteSlot: stateConfigurations[stateName].spriteSlot,
          sourcePath: stateConfigurations[stateName].sourcePath,
        },
      ]),
    ),
    resources: [
      ...new Map(
        Object.values(stateSprites).map((sprite) => [
          sprite.sha256,
          sprite,
        ]),
      ).values(),
    ],
    animationInitializer: {
      classSwitchDestination: classCase.destination,
      state1CallSite: toHex(profile.state1Anchor.va),
      state1InitializerFunction: toHex(STATE_1_INITIALIZER),
      spriteSlot: profile.spriteSlot,
      frameStart: profile.state1FrameStart,
      stride: 8,
      phaseCount: state1.phaseCount,
    },
    initialTypeFlags: {
      value: type.definition.flags,
      specialDirectionMaskValue: toHex(specialDirectionMaskValue),
      usesState1NormalDirectionPath: specialDirectionMaskValue === 0,
      alternateMovementEligibilityMaskValue: toHex(
        alternateMovementMaskValue,
      ),
      normalMovementDefaultsToState1:
        alternateMovementMaskValue === 0,
      usesState8NormalDirectionPath: (typeFlags & 0x00000008) === 0,
      usesState4NormalDirectionPath:
        profile.internalClass > 37 && (typeFlags & 0x80000000) === 0,
    },
    movement: animations.movement,
    idle: animations.idle,
    attack: animations.attack,
    death: animations.death,
    evidencePoints,
  };
}

function readHeroSprite({
  profile,
  stateName,
  configuration,
  spriteTable,
  spriteCache,
}) {
  const {
    spriteSlot,
    sourcePath,
    spritePath,
    spriteSha256: expectedSha256,
  } = configuration;
  if (!spritePath) {
    throw new Error(
      `Missing ${stateName} sprite path for ${profile.projectEntityId}`,
    );
  }

  const tableEntry = spriteTable.entries[spriteSlot - SPRITE_SLOT_TABLE_BASE];
  if (!tableEntry) {
    throw new Error(
      `Missing original sprite table slot ${spriteSlot} for ${profile.projectEntityId} ${stateName}`,
    );
  }
  assertEqual(
    tableEntry.sourcePath,
    sourcePath,
    `sprite table slot ${spriteSlot} source`,
  );

  const cached = spriteCache.get(spritePath);
  if (cached) {
    assertEqual(
      cached.sha256,
      expectedSha256,
      `${spritePath} cached SHA-256`,
    );
    return cached;
  }

  const spriteBuffer = readFileSync(spritePath);
  const spriteSha256 = sha256(spriteBuffer);
  assertEqual(spriteSha256, expectedSha256, `${spritePath} SHA-256`);
  const spriteHeader = parseSpriteLikeHeader(spriteBuffer, spritePath);
  const sprite = {
    path: spritePath,
    sha256: spriteSha256,
    width: spriteHeader.width,
    height: spriteHeader.height,
    frameCount: spriteHeader.frameCount,
    tableIndex: tableEntry.index,
    tableEntryAddress: tableEntry.tableVa,
  };
  spriteCache.set(spritePath, sprite);
  return sprite;
}

function requireSpriteSha256(profile, sourcePath) {
  if (sourcePath === profile.sourcePath) {
    return profile.spriteSha256;
  }
  for (const configuration of [
    profile.idle,
    profile.attack,
    profile.death,
  ]) {
    if (
      configuration.sourcePath === sourcePath &&
      configuration.spriteSha256
    ) {
      return configuration.spriteSha256;
    }
  }
  throw new Error(
    `Missing expected SHA-256 for ${profile.projectEntityId} ${sourcePath}`,
  );
}

function buildDirectionalAnimation({
  profile,
  stateName,
  state1,
  configuration,
  sprite,
}) {
  const directions = state1.directions.map((direction) => {
    const facing = facingForDelta(direction.deltaX, direction.deltaY);
    const frameBaseIndex = FRAME_BASE_INDEX_BY_FACING.get(facing);
    if (frameBaseIndex === undefined) {
      throw new RangeError(`Unsupported facing ${facing}`);
    }
    const frameBase =
      configuration.frameStart + frameBaseIndex * configuration.stride;
    const frameRange = [
      frameBase,
      frameBase + configuration.phaseCount - 1,
    ];
    if (frameRange[1] >= sprite.frameCount) {
      throw new RangeError(
        `${profile.projectEntityId} ${stateName} frame ${frameRange[1]} exceeds ${sprite.frameCount - 1}`,
      );
    }

    return {
      facing,
      direction: direction.direction,
      directionHex: direction.directionHex,
      deltaX: direction.deltaX,
      deltaY: direction.deltaY,
      sharedDirectionCaseEvidenceDestination: direction.destination,
      frameBaseIndex,
      frameBase,
      phaseRange: [0, configuration.phaseCount - 1],
      frameRange,
      mirrorX: direction.mirrorX,
    };
  });

  return {
    originalAnimationState: configuration.originalAnimationState,
    meaning: configuration.meaning,
    spriteSlot: configuration.spriteSlot,
    sourcePath: configuration.sourcePath,
    frameStart: configuration.frameStart,
    stride: configuration.stride,
    phaseCount: configuration.phaseCount,
    frameRange: [
      Math.min(...directions.map((direction) => direction.frameRange[0])),
      Math.max(...directions.map((direction) => direction.frameRange[1])),
    ],
    directions,
  };
}

function readJumpTables(path, expectedSourceSha256) {
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  assertEqual(
    parsed.sourceSha256,
    expectedSourceSha256,
    `${path} source SHA-256`,
  );
  if (!parsed.tables || typeof parsed.tables !== "object") {
    throw new Error(`${path} does not contain a jump-tables 'tables' object`);
  }
  return Object.values(parsed.tables);
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
  const switchCase = table.cases.find((candidate) => candidate.label === label);
  if (!switchCase) {
    throw new Error(`Switch ${table.switchAddress} has no case ${label}`);
  }
  return switchCase;
}

function readEvidencePoint(buffer, image, evidence) {
  const rawOffset = image.vaToRawOffset(evidence.va);
  const expectedBytes = Buffer.from(
    evidence.bytes.replaceAll(" ", ""),
    "hex",
  );
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
      `Static evidence mismatch at ${mismatch.va} (${mismatch.id}): expected ${mismatch.expectedBytes}, got ${mismatch.actualBytes}`,
    );
  }
}

function facingForDelta(deltaX, deltaY) {
  const facing = FACING_BY_DELTA.get(`${deltaX},${deltaY}`);
  if (!facing) {
    throw new RangeError(`Unsupported movement delta ${deltaX},${deltaY}`);
  }
  return facing;
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

function formatBytes(bytes) {
  return Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join(" ");
}

function parseArgs(argv) {
  const parsed = {};
  const pathOptions = new Map([
    ["--input", "input"],
    ["--jump-tables", "jumpTables"],
    ["--seeds", "seeds"],
    ["--spearman-sprite", "spearmanSprite"],
    ["--gwon-yul-sprite", "gwonYulSprite"],
    ["--gwon-yul-attack-sprite", "gwonYulAttackSprite"],
    ["--gwon-yul-idle-sprite", "gwonYulIdleSprite"],
    ["--ryu-seong-ryong-sprite", "ryuSeongRyongSprite"],
    [
      "--ryu-seong-ryong-combat-sprite",
      "ryuSeongRyongCombatSprite",
    ],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      parsed.json = true;
      continue;
    }
    const option = pathOptions.get(argument);
    if (!option) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value) {
      throw new Error(`${argument} requires a path`);
    }
    parsed[option] = value;
    index += 1;
  }
  return parsed;
}

function printReport(report) {
  console.log("K01 hero core animation pilot:");
  for (const hero of report.heroes) {
    console.log(
      `  ${hero.identity.originalGameplayName}: idle ${hero.idle.sourcePath} ${hero.idle.frameRange.join("..")}, move ${hero.movement.sourcePath} ${hero.movement.frameRange.join("..")}, attack ${hero.attack.sourcePath} ${hero.attack.frameRange.join("..")}, death ${hero.death.sourcePath} ${hero.death.frameRange.join("..")}`,
    );
  }
  console.log(
    `  static evidence points: ${report.evidencePoints.length} matched`,
  );
}
