#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractEntityTypeCatalog } from "./extract-entity-type-catalog.mjs";
import { extractK01HeroMovementPilot } from "./extract-k01-hero-movement-pilot.mjs";
import { readPeImage, toHex } from "./pe-image.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_SEEDS_PATH = "analysis/generated/imjinrok2/seeds.json";

const TYPE_INITIALIZER_ENTRY = 0x0045bf50;
const TYPE_WRITER_ENTRY = 0x0045bd00;
const TYPE_TABLE_ADDRESS = 0x00882e10;
const TYPE_RECORD_STRIDE = 0x014c;
const TYPE_ARGUMENT_COUNT = 51;

const FUNCTION_ENTRIES = {
  damageCalculation: 0x00413070,
  attackEffectApplication: 0x00413700,
  defenderDamageResolution: 0x00413b30,
  attackActionUpdate: 0x00416c70,
  attackResolution: 0x00417430,
  healthSubtraction: 0x00438130,
  recoveryUpdate: 0x0043b4d0,
  actionDispatcher: 0x0043c9c0,
  typeWriter: TYPE_WRITER_ENTRY,
  typeInitializer: TYPE_INITIALIZER_ENTRY,
};

const TYPE_ARGUMENT_INDEX = {
  baseDamage: 18,
  primaryRecoveryThreshold: 27,
  hitPhase: 28,
  secondaryRecoveryThreshold: 30,
  phaseTicksPerAdvance: 32,
  attackAttribute: 40,
};

const HERO_EXPECTATIONS = [
  {
    internalClass: 76,
    projectEntityId: "gwon-yul",
    originalGameplayName: "조선 권율",
    baseDamage: 80,
    primaryRecoveryThreshold: 2,
    hitPhase: 7,
    secondaryRecoveryThreshold: 0,
    phaseTicksPerAdvance: 1,
    attackAttribute: 0x13,
    phaseCount: 8,
    delivery: {
      mode: "direct",
      effectKind: 1,
      effectFunction: toHex(FUNCTION_ENTRIES.attackEffectApplication),
      callSite: toHex(0x0041774a),
    },
  },
  {
    internalClass: 78,
    projectEntityId: "ryu-seong-ryong",
    originalGameplayName: "조선 유성룡",
    baseDamage: 45,
    primaryRecoveryThreshold: 2,
    hitPhase: 7,
    secondaryRecoveryThreshold: 0,
    phaseTicksPerAdvance: 1,
    attackAttribute: 9,
    phaseCount: 10,
    delivery: {
      mode: "projectile",
      projectileSubtype: 0x0c,
      projectileSpawnFunction: toHex(0x004111b0),
      callSite: toHex(0x00417bfb),
    },
  },
];

const CODE_ANCHORS = [
  {
    id: "action-state-five-dispatches-basic-attack",
    va: 0x0043d168,
    bytes: "e8 03 9b fd ff",
    meaning: "action state 5 calls the general basic-attack action updater",
  },
  {
    id: "attack-action-substate-three-resolves-cycle",
    va: 0x0041733c,
    bytes: "e8 ef 00 00 00",
    meaning: "basic-attack substate 3 calls the attack phase and delivery resolver",
  },
  {
    id: "type-attack-attribute-copied-to-entity",
    va: 0x00437be0,
    bytes: "8b 90 68 2e 88 00 89 56 7c",
    meaning: "type record +0x58 is copied to entity attack attribute +0x7c",
  },
  {
    id: "type-base-damage-copied-to-entity",
    va: 0x00437c35,
    bytes: "e8 f6 42 02 00 66 89 46 48 66 89 46 46",
    meaning: "type record +0x00 is copied to entity base damage +0x46",
  },
  {
    id: "type-primary-recovery-threshold-copied-to-entity",
    va: 0x00437d81,
    bytes: "66 8b 88 48 2e 88 00 66 89 8e 38 01 00 00",
    meaning: "type record +0x38 is copied to entity recovery threshold +0x138",
  },
  {
    id: "type-hit-phase-copied-to-entity",
    va: 0x00437d8f,
    bytes: "8a 90 4a 2e 88 00 33 c0 88 96 43 01 00 00",
    meaning: "type record +0x3a is copied to entity hit phase +0x143",
  },
  {
    id: "type-phase-ticks-copied-to-entity",
    va: 0x00437de5,
    bytes:
      "8a 46 37 8d 14 80 8d 0c d0 8d 04 48 c1 e0 02 8a 90 52 2e 88 00 88 56 6e",
    meaning: "type record +0x42 is copied to entity phase ticks per advance +0x6e",
  },
  {
    id: "recovery-advances-only-on-even-global-ticks",
    va: 0x0043c060,
    bytes: "f6 05 80 5f 7c 00 01",
    meaning: "recovery counters advance only when global tick bit 0 is clear",
  },
  {
    id: "attack-resolution-loads-hit-phase",
    va: 0x004174e0,
    bytes: "66 0f be be 43 01 00 00",
    meaning: "the attack resolver sign-extends entity hit phase +0x143",
  },
  {
    id: "gwon-yul-direct-damage-call",
    va: 0x0041774a,
    bytes: "e8 b1 bf ff ff",
    meaning: "attack attribute 0x13 joins the direct effect-kind-1 damage call",
  },
  {
    id: "ryu-seong-ryong-projectile-spawn",
    va: 0x00417bfb,
    bytes: "e8 b0 95 ff ff",
    meaning: "attack attribute 9 spawns projectile subtype 0x0c",
  },
  {
    id: "cycle-wrap-resets-primary-recovery",
    va: 0x004196a8,
    bytes: "66 83 be b2 01 00 00 00 75 20 66 c7 86 3a 01 00 00 00 00",
    meaning: "phase 0 completes the cycle and resets primary recovery counter +0x13a",
  },
  {
    id: "damage-subtracts-from-current-health",
    va: 0x00438188,
    bytes: "66 29 51 3e 66 83 79 3e 00",
    meaning: "resolved damage is subtracted from defender current health +0x3e",
  },
];

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = parseArgs(process.argv.slice(2));
  const report = extractK01HeroBasicAttackPilot({
    executablePath: args.input ?? DEFAULT_EXECUTABLE_PATH,
    seedsPath: args.seeds ?? DEFAULT_SEEDS_PATH,
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printSummary(report);
  }
}

export function extractK01HeroBasicAttackPilot({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  seedsPath = DEFAULT_SEEDS_PATH,
  catalogSeedsPath = seedsPath,
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  const executableSha256 = sha256(buffer);
  const seeds = readSeeds(seedsPath, executableSha256);
  const typeInitializer = requireFunction(seeds, TYPE_INITIALIZER_ENTRY);
  const typeCalls = extractTypeCalls(typeInitializer.instructions);
  const typeCatalog = extractEntityTypeCatalog({
    executablePath,
    seedsPath: catalogSeedsPath,
  });
  const animationPilot = extractK01HeroMovementPilot({
    executablePath,
    seedsPath,
    catalogSeedsPath,
  });

  const heroes = HERO_EXPECTATIONS.map((expected) =>
    buildHeroEvidence({
      animationPilot,
      expected,
      typeCalls,
      typeCatalog,
    }),
  );

  return {
    schemaVersion: 1,
    evidenceStatus: "static-proven-k01-hero-basic-attack-phase",
    analysisScope:
      "K01 heroes only: action-state path, attack phase advance, hit phase, cycle wrap, recovery cadence, base damage payload, Gwon Yul direct damage formula, and Ryu Seong-ryong projectile spawn. Target acquisition, range, projectile flight/collision, death cleanup, and conversion to project seconds remain outside this pilot.",
    unresolvedScope: [
      "original global tick duration and conversion to project simulation ticks or visual FPS",
      "target acquisition and exact range calculation before attack substate 3",
      "projectile subtype 0x0c flight, collision, and final Ryu Seong-ryong damage kind",
      "death animation lifetime and target-reference cleanup",
      "temporary attack modifiers stored at entity +0x4a",
    ],
    sources: {
      executable: {
        path: executablePath,
        sha256: executableSha256,
      },
      seeds: {
        path: seedsPath,
        sourceSha256: seeds.sourceSha256,
        schemaVersion: seeds.schemaVersion,
      },
    },
    typeDefinitionLayout: {
      tableAddress: toHex(TYPE_TABLE_ADDRESS),
      recordStride: TYPE_RECORD_STRIDE,
      writerFunction: toHex(TYPE_WRITER_ENTRY),
      initializerFunction: toHex(TYPE_INITIALIZER_ENTRY),
      fields: {
        baseDamage: {
          definitionOffset: "+0x00",
          writerArgumentIndex: TYPE_ARGUMENT_INDEX.baseDamage,
          entityOffset: "+0x46",
        },
        primaryRecoveryThreshold: {
          definitionOffset: "+0x38",
          writerArgumentIndex:
            TYPE_ARGUMENT_INDEX.primaryRecoveryThreshold,
          entityOffset: "+0x138",
        },
        hitPhase: {
          definitionOffset: "+0x3a",
          writerArgumentIndex: TYPE_ARGUMENT_INDEX.hitPhase,
          entityOffset: "+0x143",
        },
        secondaryRecoveryThreshold: {
          definitionOffset: "+0x3e",
          writerArgumentIndex:
            TYPE_ARGUMENT_INDEX.secondaryRecoveryThreshold,
          entityOffset: "+0x13e",
        },
        phaseTicksPerAdvance: {
          definitionOffset: "+0x42",
          writerArgumentIndex:
            TYPE_ARGUMENT_INDEX.phaseTicksPerAdvance,
          entityOffset: "+0x6e",
        },
        attackAttribute: {
          definitionOffset: "+0x58",
          writerArgumentIndex: TYPE_ARGUMENT_INDEX.attackAttribute,
          entityOffset: "+0x7c",
        },
      },
    },
    stateFlow: [
      {
        step: "dispatch",
        actionState: 5,
        function: toHex(FUNCTION_ENTRIES.actionDispatcher),
        callSite: toHex(0x0043d168),
        nextFunction: toHex(FUNCTION_ENTRIES.attackActionUpdate),
      },
      {
        step: "resolve",
        actionSubstate: 3,
        function: toHex(FUNCTION_ENTRIES.attackActionUpdate),
        callSite: toHex(0x0041733c),
        nextFunction: toHex(FUNCTION_ENTRIES.attackResolution),
      },
      {
        step: "phase-and-delivery",
        function: toHex(FUNCTION_ENTRIES.attackResolution),
        phaseField: "+0x1b2",
        hitPhaseField: "+0x143",
        phaseTicksField: "+0x6e",
        phaseTickCounterField: "+0x6f",
        phaseCountField: "+0x144",
      },
      {
        step: "cycle-complete",
        function: toHex(FUNCTION_ENTRIES.attackResolution),
        condition: "phase +0x1b2 == 0",
        resetField: "+0x13a",
        returnValue: 1,
      },
    ],
    recovery: {
      updateFunction: toHex(FUNCTION_ENTRIES.recoveryUpdate),
      globalTickAddress: toHex(0x007c5f80),
      cadence: "increment only when (globalTick & 1) == 0",
      order:
        "increment primary +0x13a until +0x138, then secondary +0x140 until +0x13e",
      readiness:
        "attack resolution exits until both +0x13a >= +0x138 and +0x140 >= +0x13e",
    },
    damage: {
      calculationFunction: toHex(FUNCTION_ENTRIES.damageCalculation),
      resolutionFunction: toHex(
        FUNCTION_ENTRIES.defenderDamageResolution,
      ),
      healthSubtractionFunction: toHex(
        FUNCTION_ENTRIES.healthSubtraction,
      ),
      payloadFormula: "WORD [attacker+0x46] + WORD [attacker+0x4a]",
      defenderFields: {
        defenseBase: "+0x44",
        defenseModifier: "+0x50",
        attackResponseClass: "+0x80",
        currentHealth: "+0x3e",
        shieldOrBuffer: "+0x90",
      },
      directEffectKindOneFormula:
        "modified = baseDamage + classModifier; defense = min(defenseBase + defenseModifier, 90); result = max(1, modified - trunc(defense * modified / 100))",
      classModifiers: {
        "1": "+10%",
        "3": "+30%",
        "6": "+30%",
        other: "0%",
      },
    },
    analyzedFunctions: Object.values(FUNCTION_ENTRIES).map((entry) =>
      summarizeFunction(requireFunction(seeds, entry)),
    ),
    codeAnchors: CODE_ANCHORS.map((anchor) =>
      validateCodeAnchor(buffer, image, anchor),
    ),
    heroes,
    testVectors: heroes.flatMap(createHeroTestVectors),
  };
}

export function advanceBasicAttackCycle({
  phase,
  phaseTickCounter,
  phaseTicksPerAdvance,
  phaseCount,
  hitPhase,
  primaryRecoveryCounter,
  primaryRecoveryThreshold,
  secondaryRecoveryCounter = 0,
  secondaryRecoveryThreshold = 0,
}) {
  validateIntegerRange(phaseTicksPerAdvance, 1, 0x7f, "phaseTicksPerAdvance");
  validateIntegerRange(phaseCount, 1, 0x7fff, "phaseCount");
  validateIntegerRange(phase, 0, phaseCount - 1, "phase");
  validateIntegerRange(
    phaseTickCounter,
    0,
    phaseTicksPerAdvance - 1,
    "phaseTickCounter",
  );
  validateIntegerRange(hitPhase, 0, phaseCount - 1, "hitPhase");
  validateNonNegativeInteger(
    primaryRecoveryCounter,
    "primaryRecoveryCounter",
  );
  validateNonNegativeInteger(
    primaryRecoveryThreshold,
    "primaryRecoveryThreshold",
  );
  validateNonNegativeInteger(
    secondaryRecoveryCounter,
    "secondaryRecoveryCounter",
  );
  validateNonNegativeInteger(
    secondaryRecoveryThreshold,
    "secondaryRecoveryThreshold",
  );

  const ready =
    primaryRecoveryCounter >= primaryRecoveryThreshold &&
    secondaryRecoveryCounter >= secondaryRecoveryThreshold;
  if (!ready) {
    return {
      ready: false,
      phase,
      phaseTickCounter,
      phaseAdvanced: false,
      hit: false,
      cycleComplete: false,
      primaryRecoveryCounter,
      secondaryRecoveryCounter,
    };
  }

  const nextPhaseTickCounter = phaseTickCounter + 1;
  if (nextPhaseTickCounter < phaseTicksPerAdvance) {
    return {
      ready: true,
      phase,
      phaseTickCounter: nextPhaseTickCounter,
      phaseAdvanced: false,
      hit: false,
      cycleComplete: false,
      primaryRecoveryCounter,
      secondaryRecoveryCounter,
    };
  }

  const nextPhase = (phase + 1) % phaseCount;
  const cycleComplete = nextPhase === 0;

  return {
    ready: true,
    phase: nextPhase,
    phaseTickCounter: 0,
    phaseAdvanced: true,
    hit: nextPhase === hitPhase,
    cycleComplete,
    primaryRecoveryCounter: cycleComplete
      ? 0
      : primaryRecoveryCounter,
    secondaryRecoveryCounter,
  };
}

export function advanceBasicAttackRecovery({
  globalTick,
  primaryRecoveryCounter,
  primaryRecoveryThreshold,
  secondaryRecoveryCounter = 0,
  secondaryRecoveryThreshold = 0,
}) {
  validateNonNegativeInteger(globalTick, "globalTick");
  validateNonNegativeInteger(
    primaryRecoveryCounter,
    "primaryRecoveryCounter",
  );
  validateNonNegativeInteger(
    primaryRecoveryThreshold,
    "primaryRecoveryThreshold",
  );
  validateNonNegativeInteger(
    secondaryRecoveryCounter,
    "secondaryRecoveryCounter",
  );
  validateNonNegativeInteger(
    secondaryRecoveryThreshold,
    "secondaryRecoveryThreshold",
  );

  if ((globalTick & 1) !== 0) {
    return { primaryRecoveryCounter, secondaryRecoveryCounter };
  }
  if (primaryRecoveryCounter < primaryRecoveryThreshold) {
    return {
      primaryRecoveryCounter: primaryRecoveryCounter + 1,
      secondaryRecoveryCounter,
    };
  }
  if (secondaryRecoveryCounter < secondaryRecoveryThreshold) {
    return {
      primaryRecoveryCounter,
      secondaryRecoveryCounter: secondaryRecoveryCounter + 1,
    };
  }
  return { primaryRecoveryCounter, secondaryRecoveryCounter };
}

export function calculateDirectEffectKindOneDamage({
  payloadDamage,
  defenseBase,
  defenseModifier = 0,
  attackResponseClass,
}) {
  validateIntegerRange(payloadDamage, 1, 0x7fff, "payloadDamage");
  validateNonNegativeInteger(defenseBase, "defenseBase");
  validateNonNegativeInteger(defenseModifier, "defenseModifier");
  validateNonNegativeInteger(attackResponseClass, "attackResponseClass");

  const modifierPercent = getAttackResponseModifierPercent(
    attackResponseClass,
  );
  const modifiedDamage =
    payloadDamage +
    Math.trunc((payloadDamage * modifierPercent) / 100);
  const defensePercent = Math.min(
    defenseBase + defenseModifier,
    90,
  );

  return Math.max(
    1,
    modifiedDamage -
      Math.trunc((defensePercent * modifiedDamage) / 100),
  );
}

function getAttackResponseModifierPercent(attackResponseClass) {
  if (attackResponseClass === 1) {
    return 10;
  }
  if (attackResponseClass === 3 || attackResponseClass === 6) {
    return 30;
  }
  return 0;
}

function buildHeroEvidence({
  animationPilot,
  expected,
  typeCalls,
  typeCatalog,
}) {
  const type = requireBy(
    typeCatalog.types,
    (candidate) => candidate.internalClass === expected.internalClass,
    `entity type class ${expected.internalClass}`,
  );
  const animationHero = requireBy(
    animationPilot.heroes,
    (candidate) =>
      candidate.identity.internalClass === expected.internalClass,
    `animation hero class ${expected.internalClass}`,
  );
  const typeCall = requireBy(
    typeCalls,
    (candidate) => candidate.internalClass === expected.internalClass,
    `type initializer call for class ${expected.internalClass}`,
  );

  assertEqual(
    type.originalGameplayName,
    expected.originalGameplayName,
    `class ${expected.internalClass} original name`,
  );
  assertEqual(
    animationHero.projectEntityId,
    expected.projectEntityId,
    `class ${expected.internalClass} project entity`,
  );
  assertEqual(
    animationHero.attack.phaseCount,
    expected.phaseCount,
    `class ${expected.internalClass} attack phase count`,
  );

  const recovered = Object.fromEntries(
    Object.entries(TYPE_ARGUMENT_INDEX).map(([field, argumentIndex]) => [
      field,
      requireArgument(typeCall, argumentIndex),
    ]),
  );
  for (const [field, value] of Object.entries(recovered)) {
    assertEqual(
      value,
      expected[field],
      `class ${expected.internalClass} ${field}`,
    );
  }

  return {
    projectEntityId: expected.projectEntityId,
    identity: {
      internalClass: expected.internalClass,
      originalGameplayName: expected.originalGameplayName,
      definitionRecordAddress: type.definition.recordAddress,
      definitionInitializerCallAddress:
        type.definition.initializerCallAddress,
    },
    attackAnimation: {
      originalAnimationState: animationHero.attack.originalAnimationState,
      spriteSlot: animationHero.attack.spriteSlot,
      sourcePath: animationHero.attack.sourcePath,
      phaseCount: expected.phaseCount,
      hitPhase: expected.hitPhase,
      hitFrameOffsetWithinFacing: expected.hitPhase,
    },
    timing: {
      phaseTicksPerAdvance: expected.phaseTicksPerAdvance,
      primaryRecoveryThreshold: expected.primaryRecoveryThreshold,
      secondaryRecoveryThreshold:
        expected.secondaryRecoveryThreshold,
      phaseAdvancesToHit: expected.hitPhase,
      phaseAdvancesPerCycle: expected.phaseCount,
      recoveryIncrementsAfterCycle:
        expected.primaryRecoveryThreshold,
      recoveryCadence: "even global ticks only",
    },
    delivery: {
      attackAttribute: expected.attackAttribute,
      ...expected.delivery,
      payloadDamage: expected.baseDamage,
      transientModifierField: "+0x4a",
    },
  };
}

function createHeroTestVectors(hero) {
  return [
    {
      id: `${hero.projectEntityId}-hit`,
      input: {
        phase: hero.attackAnimation.hitPhase - 1,
        phaseTickCounter:
          hero.timing.phaseTicksPerAdvance - 1,
        primaryRecoveryCounter:
          hero.timing.primaryRecoveryThreshold,
      },
      expected: {
        phase: hero.attackAnimation.hitPhase,
        hit: true,
        cycleComplete: false,
        deliveryMode: hero.delivery.mode,
        payloadDamage: hero.delivery.payloadDamage,
      },
    },
    {
      id: `${hero.projectEntityId}-cycle-wrap`,
      input: {
        phase: hero.attackAnimation.phaseCount - 1,
        phaseTickCounter:
          hero.timing.phaseTicksPerAdvance - 1,
        primaryRecoveryCounter:
          hero.timing.primaryRecoveryThreshold,
      },
      expected: {
        phase: 0,
        hit: false,
        cycleComplete: true,
        primaryRecoveryCounter: 0,
      },
    },
  ];
}

function extractTypeCalls(instructions) {
  const calls = [];
  const registerValues = new Map();
  let currentRecordAddress;
  let pushedArguments = [];

  for (const instruction of instructions) {
    const constantMove = /^MOV (E[A-Z]{2}),(-?0x[0-9a-f]+)$/.exec(
      instruction.text,
    );
    if (constantMove) {
      const value = parseImmediate(constantMove[2]);
      registerValues.set(constantMove[1], value);
      if (constantMove[1] === "ECX") {
        currentRecordAddress = value;
      }
    }

    const push = /^PUSH (.+)$/.exec(instruction.text);
    if (push) {
      pushedArguments.push({
        instructionAddress: Number(instruction.address),
        value: resolvePushValue(push[1], registerValues),
      });
    }

    if (instruction.text !== `CALL ${toHex(TYPE_WRITER_ENTRY)}`) {
      continue;
    }

    if (
      pushedArguments.length === TYPE_ARGUMENT_COUNT + 1 &&
      pushedArguments[0].instructionAddress === TYPE_INITIALIZER_ENTRY
    ) {
      pushedArguments = pushedArguments.slice(1);
    }
    if (pushedArguments.length !== TYPE_ARGUMENT_COUNT) {
      throw new Error(
        `Type writer call at ${instruction.address} has ${pushedArguments.length} recovered arguments; expected ${TYPE_ARGUMENT_COUNT}`,
      );
    }
    if (currentRecordAddress === undefined) {
      throw new Error(
        `Type writer call at ${instruction.address} has no constant ECX record address`,
      );
    }

    const internalClass =
      (currentRecordAddress - TYPE_TABLE_ADDRESS) /
      TYPE_RECORD_STRIDE;
    if (!Number.isInteger(internalClass)) {
      throw new Error(
        `Type writer call at ${instruction.address} uses unaligned record ${toHex(currentRecordAddress)}`,
      );
    }
    calls.push({
      internalClass,
      callAddress: Number(instruction.address),
      arguments: pushedArguments,
    });
    currentRecordAddress = undefined;
    pushedArguments = [];
  }

  return calls;
}

function requireArgument(typeCall, argumentIndex) {
  const chronologicalIndex =
    TYPE_ARGUMENT_COUNT - 1 - argumentIndex;
  const argument = typeCall.arguments[chronologicalIndex];
  if (!argument || argument.value === undefined) {
    throw new Error(
      `Type ${typeCall.internalClass} argument ${argumentIndex} is not a statically resolved integer`,
    );
  }
  return argument.value;
}

function readSeeds(path, expectedSourceSha256) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(
      `Cannot read Ghidra seed analysis from ${path}: ${error.message}`,
      { cause: error },
    );
  }
  if (
    !parsed ||
    !Array.isArray(parsed.functions) ||
    typeof parsed.sourceSha256 !== "string"
  ) {
    throw new Error(
      `${path} is not a supported Ghidra seed analysis document`,
    );
  }
  assertEqual(
    parsed.sourceSha256,
    expectedSourceSha256,
    `${path} source SHA-256`,
  );
  return parsed;
}

function requireFunction(seeds, entry) {
  const functionReport = seeds.functions.find(
    (candidate) => candidate.entry === toHex(entry),
  );
  if (!functionReport || !Array.isArray(functionReport.instructions)) {
    throw new Error(
      `Ghidra seed analysis is missing function ${toHex(entry)} instructions`,
    );
  }
  return functionReport;
}

function summarizeFunction(functionReport) {
  return {
    entry: functionReport.entry,
    name: functionReport.name,
    bodyRanges: functionReport.bodyRanges,
    basicBlockCount: functionReport.basicBlocks.length,
    instructionCount: functionReport.instructions.length,
  };
}

function validateCodeAnchor(buffer, image, anchor) {
  const rawOffset = image.vaToRawOffset(anchor.va);
  if (rawOffset === undefined) {
    throw new RangeError(
      `${toHex(anchor.va)} is not backed by a PE file section`,
    );
  }
  const expected = Buffer.from(anchor.bytes.replaceAll(" ", ""), "hex");
  const actual = buffer.subarray(
    rawOffset,
    rawOffset + expected.length,
  );
  if (Buffer.compare(actual, expected) !== 0) {
    throw new Error(
      `Static code anchor ${anchor.id} mismatch at ${toHex(anchor.va)}: expected ${formatBytes(expected)}, got ${formatBytes(actual)}`,
    );
  }
  return {
    ...anchor,
    va: toHex(anchor.va),
    rawOffset: toHex(rawOffset),
    expectedBytes: formatBytes(expected),
    actualBytes: formatBytes(actual),
    matched: true,
  };
}

function resolvePushValue(operand, registerValues) {
  if (/^-?0x[0-9a-f]+$/.test(operand)) {
    return parseImmediate(operand);
  }
  return registerValues.get(operand);
}

function parseImmediate(value) {
  const negative = value.startsWith("-");
  const digits = negative ? value.slice(3) : value.slice(2);
  const parsed = Number.parseInt(digits, 16);
  return negative ? -parsed : parsed;
}

function requireBy(values, predicate, label) {
  const value = values.find(predicate);
  if (!value) {
    throw new Error(`Missing ${label}`);
  }
  return value;
}

function validateNonNegativeInteger(value, label) {
  validateIntegerRange(value, 0, Number.MAX_SAFE_INTEGER, label);
}

function validateIntegerRange(value, minimum, maximum, label) {
  if (
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new RangeError(
      `${label} must be an integer in ${minimum}..${maximum}; got ${value}`,
    );
  }
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
    ["--seeds", "seeds"],
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

function printSummary(report) {
  console.log("K01 hero basic-attack pilot:");
  for (const hero of report.heroes) {
    console.log(
      `  ${hero.identity.originalGameplayName}: ${hero.attackAnimation.phaseCount} phases, hit ${hero.attackAnimation.hitPhase}, recovery ${hero.timing.primaryRecoveryThreshold}, base damage ${hero.delivery.payloadDamage}, ${hero.delivery.mode}`,
    );
  }
  console.log(
    `  static code anchors: ${report.codeAnchors.length} matched`,
  );
}
