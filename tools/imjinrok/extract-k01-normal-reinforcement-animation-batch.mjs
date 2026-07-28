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
import { extractK01KonishiAnimationPilot } from "./extract-k01-konishi-animation-pilot.mjs";
import { extractK01SamuraiAnimationPilot } from "./extract-k01-samurai-animation-pilot.mjs";
import { extractK01TurtleTankAnimationPilot } from "./extract-k01-turtle-tank-animation-pilot.mjs";
import { extractOriginalSpriteTable } from "./extract-sprite-table.mjs";
import { extractUnitAnimationPilot } from "./extract-unit-animation-pilot.mjs";
import { readPeImage, toHex } from "./pe-image.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_FUNCTIONS_PATH = "analysis/generated/imjinrok2/functions.json";
const DEFAULT_JUMP_TABLES_PATH = "analysis/generated/imjinrok2/jump-tables.json";
const DEFAULT_SEEDS_PATH = "analysis/generated/imjinrok2/seeds.json";
const DEFAULT_GUNJ1_PATH = "original/imjinrok2/char/gunj1.spr";
const DEFAULT_GUNJ2_PATH = "original/imjinrok2/char/gunj2.spr";
const DEFAULT_GUNJ3_PATH = "original/imjinrok2/char/gunj3.spr";

export const NORMAL_REINFORCEMENT_DIRECTIONS = [
  {
    facing: "s",
    direction: 1,
    deltaX: 0,
    deltaY: 1,
    frameBaseIndex: 0,
    mirrorX: false,
  },
  {
    facing: "sw",
    direction: 5,
    deltaX: -1,
    deltaY: 1,
    frameBaseIndex: 1,
    mirrorX: false,
  },
  {
    facing: "w",
    direction: 4,
    deltaX: -1,
    deltaY: 0,
    frameBaseIndex: 2,
    mirrorX: false,
  },
  {
    facing: "nw",
    direction: 20,
    deltaX: -1,
    deltaY: -1,
    frameBaseIndex: 3,
    mirrorX: false,
  },
  {
    facing: "n",
    direction: 16,
    deltaX: 0,
    deltaY: -1,
    frameBaseIndex: 2,
    mirrorX: true,
  },
  {
    facing: "ne",
    direction: 80,
    deltaX: 1,
    deltaY: -1,
    frameBaseIndex: 1,
    mirrorX: true,
  },
  {
    facing: "e",
    direction: 64,
    deltaX: 1,
    deltaY: 0,
    frameBaseIndex: 0,
    mirrorX: true,
  },
  {
    facing: "se",
    direction: 65,
    deltaX: 1,
    deltaY: 1,
    frameBaseIndex: 4,
    mirrorX: false,
  },
];

export const EXPECTED_JAPANESE_GUNNER = {
  internalClass: 12,
  originalGameplayName: "일본 조총병",
  typeRecordAddress: "0x00883da0",
  typeFlags: 0x0c082805,
  primary: {
    slot: 114,
    tableIndex: 14,
    pointerCell: "0x004bc25c",
    sourcePath: "char\\gunj1.spr",
    sha256: "e35c3dddfc4860d3e8ccbb7d86ecb006b11230e269d04091dcfa320dc116a7a8",
    width: 60,
    height: 60,
    frameCount: 80,
  },
  attack: {
    slot: 115,
    tableIndex: 15,
    pointerCell: "0x004bc260",
    sourcePath: "char\\gunj2.spr",
    sha256: "2153ff0f336845e9ae097ceb9f0388725c9ae0f1a9b2123dfa4928fc48fbbd02",
    width: 60,
    height: 60,
    frameCount: 80,
  },
  death: {
    slot: 116,
    tableIndex: 16,
    pointerCell: "0x004bc264",
    sourcePath: "char\\gunj3.spr",
    sha256: "fc42e17581dc51b15f45368790517be49f53f2fb3d4ecb97e4a070a5ea0b04f7",
    width: 60,
    height: 60,
    frameCount: 80,
  },
};

const CLASS_INITIALIZER_FUNCTION = 0x004291d0;
const CLASS_SWITCH = 0x004292b3;
const CLASS_12_START = 0x0042a752;
const CLASS_12_END_EXCLUSIVE = 0x0042a808;
const STATE_DISPATCH = 0x0041d21a;
const FUNCTION_CONTRACTS = [
  ["0x004291d0", ["0x004291d0-0x0042c547"], 4156, "1c05959938219ae4fa918ba3061b1856dcfb575f007a1a48281dd316709a7e96"],
  ["0x00438e50", ["0x00438e50-0x00438e7e"], 24, "4da58c373054099fbed3aa281d63f114a950c90471650f7cf4089bfefc0c1c00"],
  ["0x00438ef0", ["0x00438ef0-0x00438f1e"], 24, "31db374f6bdbf9efb342ff3b4ac12b2d2ba14487c66f46933dc3004826cf2bac"],
  ["0x00438f70", ["0x00438f70-0x00438f9e"], 24, "57c964dfbabba68c0d77cf322c0174c3efafe30a1b5bc2c8c50c4ef970ec753d"],
  ["0x004390b0", ["0x004390b0-0x004390d0"], 6, "8c576d98214fa38d4d64c0dc710a6e1452a92ceb33e39a9a563567976dd191df"],
  ["0x004390e0", ["0x004390e0-0x0043910e"], 24, "02510627f1038fb23f0100a2c3a540507c282404bf087e399f55cbc06dba7b3e"],
  [
    "0x0041d210",
    ["0x0041d210-0x0041d277", "0x0041d2c0-0x0041d41a", "0x0041e200-0x0041e2f5"],
    177,
    "dbc2f289ae0aacdc6d7ef785d7d8290d1153742003a389889f5ac881563ca278",
  ],
  [
    "0x0041d870",
    ["0x0041d870-0x0041d976", "0x0041d9f0-0x0041dbdc"],
    149,
    "725ef4a43130d35f9001bbd0b96ab9868b54ee4c000a49de36b96eccce7cdfc2",
  ],
  ["0x0041efa0", ["0x0041efa0-0x0041f272"], 140, "0dd6b72b3f73f96672d22ceac55b7565cb93e92e3bc38598fa25a7b55013a646"],
  ["0x0041f380", ["0x0041f380-0x0041f476"], 49, "85b4707799f183fbc80f157fb22340e3c1b1441b4b6f81251589949227bf3685"],
  ["0x0041d700", ["0x0041d700-0x0041d7f5"], 49, "4efa54b7c845a61fe9aae4a14f62d0d1d2bab44c2b3e26db4cb524003bbc1af3"],
  [
    "0x0041e370",
    ["0x0041e370-0x0041e3bd", "0x0041e3f0-0x0041e5db"],
    115,
    "aa96086d04f698f4965205fa74803f0cc7d7db9a05ee610834a0ccffac293a61",
  ],
].map(([entry, bodyRanges, instructionCount, instructionSha256]) => ({
  entry,
  bodyRanges,
  instructionCount,
  instructionSha256,
}));

const EVIDENCE = [
  {
    id: "class-12-initializer",
    va: 0x0042a752,
    bytes:
      "bb 08 00 00 00 8b ce 53 6a 00 6a 72 88 9e 92 00 00 00 e8 e7 e6 00 00 " +
      "53 6a 28 6a 72 8b ce 88 9e a6 00 00 00 e8 75 e7 00 00 53 6a 28 6a 73 " +
      "8b ce 88 9e bb 00 00 00 e8 e3 e7 00 00",
    meaning: "class 12 initializer supplies phase 8 and slot/start pairs for state 8, 1, and 2 helpers",
  },
  {
    id: "class-12-death-and-attack",
    va: 0x0042a78d,
    bytes:
      "53 6a 3c 6a 74 6a 00 8b ce 66 89 9e 8c 01 00 00 e8 0e e9 00 00 53 6a 3c " +
      "6a 74 6a 01 8b ce e8 00 e9 00 00 53 6a 3c 6a 74 6a 02 8b ce e8 f2 e8 00 " +
      "00 53 6a 3c 6a 74 6a 03 8b ce e8 e4 e8 00 00 53 6a 3c 6a 74 6a 04 8b ce " +
      "e8 d6 e8 00 00 53 6a 00 6a 73 8b ce 66 89 9e 44 01 00 00 e8 f3 e8 00 00",
    meaning:
      "class 12 writes five state-7 bases 60 in slot 116 and configures state 4 " +
      "slot 115/start 0/stride 8/phase 8",
  },
  {
    id: "state-dispatch",
    va: 0x0041d210,
    bytes: "0f be 41 03 48 83 f8 11 77 52 ff 24 85 78 d2 41 00",
    meaning: "shared dispatcher selects state consumers from signed BYTE +0x03",
  },
  {
    id: "normal-idle-gate",
    va: 0x0041d870,
    bytes: "f6 41 74 08 74 05",
    meaning: "state 8 normal consumer requires bit 0x08 clear",
  },
  {
    id: "normal-move-gate",
    va: 0x0041efa0,
    bytes: "f7 41 74 08 00 00 80 0f 84",
    meaning: "state 1 normal +0x1e6 consumer requires mask 0x80000008 clear",
  },
  {
    id: "normal-attack-gate",
    va: 0x0041e3a0,
    bytes: "f7 41 74 00 00 00 80 75 14 66 83 b9 44 01 00 00 00",
    meaning: "normal attack gate requires high bit clear and WORD +0x144 nonzero",
  },
];

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(
    JSON.stringify(
      extractK01NormalReinforcementAnimationBatch(parseArgs(process.argv.slice(2))),
      null,
      2,
    ),
  );
}

export function extractK01NormalReinforcementAnimationBatch({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  functionsPath = DEFAULT_FUNCTIONS_PATH,
  jumpTablesPath = DEFAULT_JUMP_TABLES_PATH,
  seedsPath = DEFAULT_SEEDS_PATH,
  gunj1Path = DEFAULT_GUNJ1_PATH,
  gunj2Path = DEFAULT_GUNJ2_PATH,
  gunj3Path = DEFAULT_GUNJ3_PATH,
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  const executableSha256 = sha256(buffer);
  assertEqual(executableSha256, EXPECTED_EXECUTABLE_SHA256, "EXE SHA-256");
  const functions = readArtifact(functionsPath, executableSha256, "functions");
  const functionEvidence = FUNCTION_CONTRACTS.map((contract) =>
    validateFunction(functions.functions, contract),
  );
  const jumpTables = readArtifact(jumpTablesPath, executableSha256, "jump tables");
  const classSwitch = requireSwitch(jumpTables, CLASS_INITIALIZER_FUNCTION, CLASS_SWITCH);
  assertEqual(requireCase(classSwitch, 12).destination, toHex(CLASS_12_START), "class 12 initializer destination");
  validateStateDispatch(jumpTables);
  const seeds = readArtifact(seedsPath, executableSha256, "seeds");
  const initializers = recoverClass12Initializers(seeds);
  validateInitializers(initializers);
  const catalog = extractEntityTypeCatalog({ executablePath, seedsPath });
  const type = catalog.types.find(({ internalClass }) => internalClass === 12);
  if (!type) throw new Error("entity catalog is missing class 12");
  validateType(type);
  const table = extractOriginalSpriteTable(executablePath);
  const sprites = {
    primary: inspectSprite(table, EXPECTED_JAPANESE_GUNNER.primary, gunj1Path),
    attack: inspectSprite(table, EXPECTED_JAPANESE_GUNNER.attack, gunj2Path),
    death: inspectSprite(table, EXPECTED_JAPANESE_GUNNER.death, gunj3Path),
  };
  const states = buildStates(initializers, sprites);
  validateSharedDirections(
    extractUnitAnimationPilot({ executablePath, jumpTablesPath, seedsPath }),
  );
  const samurai = extractK01SamuraiAnimationPilot({
    executablePath,
    functionsPath,
    jumpTablesPath,
    seedsPath,
  });
  const konishi = extractK01KonishiAnimationPilot({
    executablePath,
    functionsPath,
    jumpTablesPath,
    seedsPath,
  });
  const turtle = extractK01TurtleTankAnimationPilot({
    executablePath,
    functionsPath,
    jumpTablesPath,
    seedsPath,
  });
  const evidencePoints = EVIDENCE.map((point) =>
    readEvidencePoint(buffer, image, point),
  );
  requireAllEvidence(evidencePoints);
  assertNormalDirections(samurai.states.move.directions, "class 13 batch direction contract");
  assertNormalDirections(konishi.states.move.directions, "class 82 batch direction contract");
  const testVectors = buildTestVectors();
  return buildReport({
    executablePath,
    executableSha256,
    functionsPath,
    functions,
    jumpTablesPath,
    jumpTables,
    seedsPath,
    seeds,
    sprites,
    type,
    initializers,
    states,
    samurai,
    konishi,
    turtle,
    functionEvidence,
    evidencePoints,
    testVectors,
  });
}

function buildTestVectors() {
  return [8, 1, 2, 4, 7].flatMap((state) =>
    NORMAL_REINFORCEMENT_DIRECTIONS.flatMap(({ direction }) =>
      [0, 7].map((phase) => selectJapaneseGunnerFrame({ state, direction, phase })),
    ),
  );
}

function buildReport({
  executablePath,
  executableSha256,
  functionsPath,
  functions,
  jumpTablesPath,
  jumpTables,
  seedsPath,
  seeds,
  sprites,
  type,
  initializers,
  states,
  samurai,
  konishi,
  turtle,
  functionEvidence,
  evidencePoints,
  testVectors,
}) {
  return {
    schemaVersion: 1,
    question:
      "K01 증원 class 12/13/82의 creation-default normal animation은 shared dispatcher/helper " +
      "계약에서 어떤 slot/frame/direction/mirror를 고르며, class 14가 왜 special exception인가?",
    analysisStatus: "static-confirmed",
    reproductionStatus: "reproduction-complete",
    implementationStatus: "theme-level-mapping",
    sources: {
      executable: { path: executablePath, sha256: executableSha256 },
      functions: { path: functionsPath, sourceSha256: functions.sourceSha256 },
      jumpTables: { path: jumpTablesPath, sourceSha256: jumpTables.sourceSha256 },
      seeds: { path: seedsPath, sourceSha256: seeds.sourceSha256 },
      sprites,
    },
    identity: {
      internalClass: type.internalClass,
      originalGameplayName: type.originalGameplayName,
      typeRecordAddress: type.definition.recordAddress,
      typeFlags: type.definition.flags,
    },
    classDispatch: {
      functionEntry: toHex(CLASS_INITIALIZER_FUNCTION),
      switchAddress: toHex(CLASS_SWITCH),
      class: 12,
      destination: toHex(CLASS_12_START),
      scopedRange: "0x0042a752-0x0042a807",
    },
    initializers,
    states,
    directions: NORMAL_REINFORCEMENT_DIRECTIONS,
    testVectors,
    initialTypeFlags: {
      value: toHex(EXPECTED_JAPANESE_GUNNER.typeFlags),
      idleSpecialBit: "clear",
      state1NormalMask: "0x00000000",
      alternateMovementEligibility: "set",
      attackHighBit: "clear",
      attackPhaseCount: 8,
    },
    batchCrossCheck: {
      class13: { normalCoreStates: Object.keys(samurai.states), directionsMatch: true },
      class82: { normalCoreStates: Object.keys(konishi.states), directionsMatch: true },
      class14Exception: {
        movementAndAttackSpecial: true,
        idleSpecial: false,
        movementConfiguredBases: turtle.states.move.configuredBases,
        reason:
          "only class-14 movement and attack creation-default gates select special consumers; " +
          "those states use a 9-base topology",
      },
    },
    functionEvidence,
    evidencePoints,
    acceptedInputScope:
      "class-12 creation-default states 8/1/2/4/7 and class-13/82 normal-core cross-check; " +
      "state 2 is only a proven movement variant, not a project policy; unknown raw directions " +
      "are rejected rather than treating the shared default branch as a recovered project mapping",
    unresolvedScope:
      "state 2 environment label and project policy, exact timing/FPS, pivots, later flag " +
      "mutation, hit reaction, lifetime, and the class-12 extra post-attack helper are outside scope",
  };
}

function validateStateDispatch(jumpTables) {
  const stateDispatch = requireSwitch(jumpTables, 0x0041d210, STATE_DISPATCH);
  const expectedCases = [
    [8, 0x0041d221],
    [1, 0x0041d226],
    [2, 0x0041d22b],
    [4, 0x0041d230],
    [7, 0x0041d23a],
  ];

  for (const [state, destination] of expectedCases) {
    assertEqual(
      requireCase(stateDispatch, state).destination,
      toHex(destination),
      `state ${state} dispatch`,
    );
  }
}

export function selectJapaneseGunnerFrame({
  state,
  direction,
  phase,
  entityFlags = EXPECTED_JAPANESE_GUNNER.typeFlags,
  attackPhaseCount = 8,
}) {
  validateUnsignedDword(entityFlags, "entityFlags");
  validateUnsignedWord(attackPhaseCount, "attackPhaseCount");
  validateSignedWord(direction, "direction");
  const config = {
    8: ["idle", "primary", 0, 8, 8],
    1: ["move", "primary", 40, 8, 8],
    2: ["state2", "attack", 40, 8, 8],
    4: ["attack", "attack", 0, 8, 8],
    7: ["death", "death", 60, 0, 8],
  }[state];
  if (!config) throw new RangeError("state is outside the scoped set 1,2,4,7,8");
  if (!Number.isInteger(phase) || phase < 0 || phase >= config[4]) {
    throw new RangeError("phase is outside recovered 0..7");
  }
  const profile = NORMAL_REINFORCEMENT_DIRECTIONS.find(
    (candidate) => candidate.direction === direction,
  );
  if (!profile) throw new RangeError("direction is outside recovered normal grid set");
  validateGates(config[0], entityFlags >>> 0, attackPhaseCount);
  const resource = EXPECTED_JAPANESE_GUNNER[config[1]];
  return {
    state,
    stateName: config[0],
    direction,
    facing: profile.facing,
    phase,
    spriteSlot: resource.slot,
    sourcePath: resource.sourcePath,
    frameIndex: config[2] + profile.frameBaseIndex * config[3] + phase,
    mirrorX: profile.mirrorX,
  };
}

function recoverClass12Initializers(seeds) {
  const initializer = seeds.functions?.find(({ entry }) => entry === "0x004291d0");
  if (!initializer?.instructions) {
    throw new Error("seeds artifact is missing initializer instructions");
  }
  const instructions = initializer.instructions.filter(({ address }) => {
    const va = Number.parseInt(address, 16);
    return va >= CLASS_12_START && va < CLASS_12_END_EXCLUSIVE;
  });
  let ebx;
  const pending = [];
  const calls = [];

  for (const instruction of instructions) {
    if (instruction.text === "MOV EBX,0x8") ebx = 8;
    const push = /^PUSH (0x[0-9a-f]+|EBX)$/.exec(instruction.text);
    if (push) {
      pending.push(push[1] === "EBX" ? ebx : Number.parseInt(push[1], 16));
      continue;
    }
    const call = /^CALL (0x[0-9a-f]+)$/.exec(instruction.text);
    if (call) {
      calls.push({
        va: instruction.address,
        helper: call[1],
        args: pending.splice(0),
      });
    }
  }

  const byHelper = (helper) => calls.filter((call) => call.helper === helper);
  const allowed = new Set([
    "0x00438e50",
    "0x00438ef0",
    "0x00438f70",
    "0x004390b0",
    "0x004390e0",
    "0x00439170",
  ]);
  if (calls.some(({ helper }) => !allowed.has(helper))) {
    throw new Error("class 12 initializer has unexpected helper call");
  }
  const simple = (helper, state, resource) => {
    const matches = byHelper(helper);
    if (
      matches.length !== 1 ||
      matches[0].args.length !== 3 ||
      matches[0].args.some((value) => !Number.isInteger(value))
    ) {
      throw new Error(`invalid ${helper} initializer call`);
    }

    const call = matches[0];
    const [phaseCount, frameStart, slot] = call.args;
    return {
      state,
      helper,
      resource,
      phaseCount,
      frameStart,
      frameStride: phaseCount,
      slot,
      callVa: call.va,
    };
  };
  const deathCalls = byHelper("0x004390b0");
  if (deathCalls.length !== 5) throw new Error("class 12 must configure five death facings");
  const death = deathCalls.map(({ args, va }) => ({
    callVa: va,
    phaseCount: args[0],
    frameStart: args[1],
    slot: args[2],
    facingIndex: args[3],
  }));

  return {
    idle: simple("0x00438e50", 8, "primary"),
    move: simple("0x00438ef0", 1, "primary"),
    state2: simple("0x00438f70", 2, "attack"),
    attack: simple("0x004390e0", 4, "attack"),
    death: {
      state: 7,
      helper: "0x004390b0",
      resource: "death",
      phaseCount: death[0].phaseCount,
      frameStart: death[0].frameStart,
      frameStride: 0,
      slot: death[0].slot,
      facings: death,
    },
  };
}

function validateInitializers(initializers) {
  const simple = Object.fromEntries(
    ["idle", "move", "state2", "attack"].map((name) => {
      const initializer = initializers[name];
      return [
        name,
        [
          initializer.state,
          initializer.helper,
          initializer.slot,
          initializer.frameStart,
          initializer.frameStride,
          initializer.phaseCount,
        ],
      ];
    }),
  );
  assertDeepEqual(
    simple,
    {
      idle: [8, "0x00438e50", 114, 0, 8, 8],
      move: [1, "0x00438ef0", 114, 40, 8, 8],
      state2: [2, "0x00438f70", 115, 40, 8, 8],
      attack: [4, "0x004390e0", 115, 0, 8, 8],
    },
    "class 12 derived normal initializers",
  );
  const deathFacings = initializers.death.facings.map(
    ({ phaseCount, frameStart, slot, facingIndex }) => [
      phaseCount,
      frameStart,
      slot,
      facingIndex,
    ],
  );
  assertDeepEqual(
    deathFacings,
    [
      [8, 60, 116, 0],
      [8, 60, 116, 1],
      [8, 60, 116, 2],
      [8, 60, 116, 3],
      [8, 60, 116, 4],
    ],
    "class 12 derived death initializers",
  );
}
function buildStates(initializers, sprites) {
  return Object.fromEntries(
    Object.entries(initializers).map(([name, config]) => {
      const resource = sprites[config.resource];
      const directions = NORMAL_REINFORCEMENT_DIRECTIONS.map((profile) => {
        const frameBase = config.frameStart + profile.frameBaseIndex * config.frameStride;
        return {
          ...profile,
          frameBase,
          frameRange: [frameBase, frameBase + config.phaseCount - 1],
        };
      });
      const starts = directions.map(({ frameRange }) => frameRange[0]);
      const ends = directions.map(({ frameRange }) => frameRange[1]);

      return [
        name,
        {
          originalAnimationState: config.state,
          spriteSlot: config.slot,
          sourcePath: resource.sourcePath,
          frameStart: config.frameStart,
          frameStride: config.frameStride,
          phaseCount: config.phaseCount,
          frameRange: [Math.min(...starts), Math.max(...ends)],
          directions,
        },
      ];
    }),
  );
}

function validateGates(state, flags, attackPhaseCount) {
  if (state === "idle" && (flags & 8)) {
    throw new Error("idle normal path requires bit 0x08 clear");
  }
  if (state === "move" && (flags & 0x80000008)) {
    throw new Error("state 1 normal path requires mask 0x80000008 clear");
  }
  if (state === "attack" && ((flags & 0x80000000) || attackPhaseCount === 0)) {
    throw new Error("attack normal path requires high bit clear and nonzero phase count");
  }
}

function validateSharedDirections(pilot) {
  const state = pilot.states.find(({ state }) => state === 1);
  if (!state) throw new Error("shared direction pilot is missing state 1");
  const directions = state.directions.map((direction) => ({
    ...direction,
    frameBaseIndex: direction.frameBase / state.phaseCount,
  }));
  assertNormalDirections(directions, "shared normal direction contract");
}

function assertNormalDirections(directions, label) {
  const normalize = (values) =>
    values
      .map(({ direction, frameBaseIndex, mirrorX }) => ({
        direction,
        frameBaseIndex,
        mirrorX,
      }))
      .sort((left, right) => left.direction - right.direction);

  assertDeepEqual(normalize(directions), normalize(NORMAL_REINFORCEMENT_DIRECTIONS), label);
}

function validateType(type) {
  assertEqual(
    type.originalGameplayName,
    EXPECTED_JAPANESE_GUNNER.originalGameplayName,
    "class 12 name",
  );
  assertEqual(
    type.definition.recordAddress,
    EXPECTED_JAPANESE_GUNNER.typeRecordAddress,
    "class 12 record",
  );
  assertEqual(
    type.definition.flags,
    toHex(EXPECTED_JAPANESE_GUNNER.typeFlags),
    "class 12 flags",
  );
  assertEqual(type.sprite.slot, 114, "class 12 primary slot");
  assertEqual(type.sprite.pointerCell, "0x004bc25c", "class 12 primary cell");
}

function inspectSprite(table, expected, path) {
  const entry = table.entries[expected.tableIndex];
  if (!entry) throw new Error(`missing sprite table ${expected.tableIndex}`);
  assertEqual(entry.tableVa, expected.pointerCell, `${expected.sourcePath} cell`);
  assertEqual(entry.sourcePath, expected.sourcePath, `${expected.sourcePath} path`);

  const bytes = readFileSync(path);
  assertEqual(sha256(bytes), expected.sha256, `${path} SHA-256`);
  const header = parseSpriteLikeHeader(bytes, path);
  assertEqual(header.width, expected.width, `${path} width`);
  assertEqual(header.height, expected.height, `${path} height`);
  assertEqual(header.frameCount, expected.frameCount, `${path} frames`);

  return {
    path,
    sha256: sha256(bytes),
    width: header.width,
    height: header.height,
    frameCount: header.frameCount,
    slot: expected.slot,
    tableIndex: entry.index,
    pointerCell: entry.tableVa,
    sourcePath: entry.sourcePath,
  };
}

function readArtifact(path, sha, label) {
  const value = JSON.parse(readFileSync(path, "utf8"));
  assertEqual(value.sourceSha256, sha, `${label} source SHA-256`);
  return value;
}

function validateFunction(functions, contract) {
  const record = functions.find(({ entry }) => entry === contract.entry);
  if (!record) throw new Error(`functions artifact is missing ${contract.entry}`);
  assertDeepEqual(record.bodyRanges, contract.bodyRanges, `${contract.entry} body ranges`);
  assertEqual(record.instructionCount, contract.instructionCount, `${contract.entry} instruction count`);
  assertEqual(
    record.instructionSha256,
    contract.instructionSha256,
    `${contract.entry} instruction SHA-256`,
  );
  return {
    entry: record.entry,
    bodyRanges: record.bodyRanges,
    instructionCount: record.instructionCount,
    instructionSha256: record.instructionSha256,
  };
}

function requireSwitch(artifact, entry, address) {
  const table = Object.values(artifact.tables ?? {}).find(
    (candidate) =>
      candidate.functionEntry === toHex(entry) && candidate.switchAddress === toHex(address),
  );
  if (!table) throw new Error(`missing switch ${toHex(address)}`);
  return table;
}

function requireCase(table, label) {
  const value = table.cases.find((candidate) => candidate.label === label);
  if (!value) throw new Error(`missing switch case ${label}`);
  return value;
}

function readEvidencePoint(buffer, image, evidence) {
  const offset = image.vaToRawOffset(evidence.va);
  const expected = Buffer.from(evidence.bytes.replaceAll(" ", ""), "hex");
  const actual =
    offset === undefined ? Buffer.alloc(0) : buffer.subarray(offset, offset + expected.length);

  return {
    ...evidence,
    va: toHex(evidence.va),
    rawOffset: offset === undefined ? undefined : toHex(offset),
    expectedBytes: expected.toString("hex").replace(/(..)/g, "$1 ").trim(),
    actualBytes: actual.toString("hex").replace(/(..)/g, "$1 ").trim(),
    matched: Buffer.compare(expected, actual) === 0,
  };
}

function requireAllEvidence(points) {
  const mismatch = points.find(({ matched }) => !matched);
  if (mismatch) {
    throw new Error(`static evidence mismatch at ${mismatch.va} (${mismatch.id})`);
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`);
  }
}

function assertDeepEqual(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${label} mismatch: expected ${expectedJson}, got ${actualJson}`);
  }
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

function validateSignedWord(value, label) {
  if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) {
    throw new RangeError(`${label} must be a signed WORD`);
  }
}

function parseArgs(argv) {
  const result = {};
  const options = new Map([
    ["--input", "executablePath"],
    ["--functions", "functionsPath"],
    ["--jump-tables", "jumpTablesPath"],
    ["--seeds", "seedsPath"],
    ["--gunj1", "gunj1Path"],
    ["--gunj2", "gunj2Path"],
    ["--gunj3", "gunj3Path"],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--json") continue;
    const key = options.get(argv[index]);
    if (!key || argv[index + 1] === undefined) {
      throw new Error(`Unknown or incomplete option ${argv[index]}`);
    }
    result[key] = argv[++index];
  }

  return result;
}
