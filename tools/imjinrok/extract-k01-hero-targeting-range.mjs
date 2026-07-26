#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readPeImage, toHex } from "./pe-image.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_SEEDS_PATH = "analysis/generated/imjinrok2/seeds.json";
const DEFAULT_FUNCTIONS_PATH = "analysis/generated/imjinrok2/functions.json";
const EXPECTED_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";

const FUNCTION_ENTRIES = {
  currentTargetWriter: 0x00416870,
  currentTargetCheck: 0x004168f0,
  currentTargetSecondaryCheck: 0x00416970,
  facingTransitionCheck: 0x00416ad0,
  attackActionUpdate: 0x00416c70,
  attackSubstateTwoUpdate: 0x004173a0,
  attackResolution: 0x00417430,
  attackEntryGate: 0x004196e0,
  ryuAttackEntryAlternate: 0x0041c870,
  movementCommand: 0x00425a50,
  movementUpdate: 0x00425af0,
  movementCompletionCheck: 0x00426670,
  actionCommandQueueWriter: 0x00426740,
  actionCommandDispatcher: 0x00426c20,
  entityInitializer: 0x00437650,
  footprintSpecialCheck: 0x00438bf0,
  targetRangePredicate: 0x00438c50,
  facingOutputWriter: 0x00438e30,
  acquisitionGate: 0x0043a410,
  automaticTargetScan: 0x00439770,
  automaticTargetCommand: 0x00439d70,
  scanRawStateReset: 0x004393e0,
  actionDispatcher: 0x0043c9c0,
  lowWordSlotRecordPositiveCheck: 0x00441db0,
  activeLookup: 0x00441e40,
  fullReferenceCheck: 0x00441e80,
  ownerRelationCheck: 0x004426a0,
  candidateRelationFilter: 0x00442770,
  typeWriter: 0x0045bd00,
  typeInitializer: 0x0045bf50,
  rawActionCommandWriter: 0x00478320,
  rawCancelActionCommand: 0x004783b0,
  rawTargetActionCommand: 0x00478400,
};

const REQUIRED_CALL_EDGES = [
  [0x0043d168, 0x0043c9c0, 0x00416c70],
  [0x0043ccba, 0x0043c9c0, 0x00439770],
  [0x00416d43, 0x00416c70, 0x004168f0],
  [0x00416d5a, 0x00416c70, 0x004783b0],
  [0x00416d64, 0x00416c70, 0x00439770],
  [0x00416d82, 0x00416c70, 0x00438c50],
  [0x00416f16, 0x00416c70, 0x00438e30],
  [0x00416f5f, 0x00416c70, 0x00416ad0],
  [0x00416f6e, 0x00416c70, 0x004196e0],
  [0x00417188, 0x00416c70, 0x00425a50],
  [0x004171ef, 0x00416c70, 0x00425af0],
  [0x004171f8, 0x00416c70, 0x00426670],
  [0x0041724c, 0x00416c70, 0x00438c50],
  [0x004172a3, 0x00416c70, 0x00425af0],
  [0x004172ac, 0x00416c70, 0x00426670],
  [0x00417308, 0x00416c70, 0x00438c50],
  [0x0041733c, 0x00416c70, 0x00417430],
  [0x00417362, 0x00416c70, 0x004173a0],
  [0x0041986e, 0x004196e0, 0x0041c870],
  [0x00419990, 0x004196e0, 0x0041c870],
  [0x00439779, 0x00439770, 0x0043a410],
  [0x00439918, 0x00439770, 0x00441e40],
  [0x0043993e, 0x00439770, 0x00442770],
  [0x0043998e, 0x00439770, 0x00439d70],
  [0x004399ce, 0x00439770, 0x00441e80],
  [0x00439c86, 0x00439770, 0x00438c50],
  [0x00439cc1, 0x00439770, 0x00439d70],
  [0x00439d8b, 0x00439d70, 0x00441e40],
  [0x00439da4, 0x00439d70, 0x00442770],
  [0x00439dcd, 0x00439d70, 0x00438c50],
  [0x00439e8e, 0x00439d70, 0x00416970],
  [0x00439eae, 0x00439d70, 0x00478400],
  [0x00478423, 0x00478400, 0x00478320],
  [0x00478395, 0x00478320, 0x00426740],
  [0x004270a4, 0x00426c20, 0x00416870],
];

const CODE_ANCHORS = [
  {
    id: "automatic-scan-scheduled-before-action-switch",
    va: 0x0043cc93,
    bytes:
      "66 39 2d 34 6e c0 00 75 23 0f bf 86 b6 01 00 00 8b 0d 80 5f 7c 00 33 d2 03 c1 b9 14 00 00 00 f7 f1 85 d2 75 07 8b ce e8 b1 ca ff ff",
  },
  {
    id: "current-target-writer-preserves-full-reference",
    va: 0x0041688f,
    bytes:
      "8b 86 b6 01 00 00 66 3b c7 89 44 24 08 75 14 66 8b 4c 24 0a 66 3b 4c 24 12 75 08 5f 33 c0 5e 59 c2 04 00 0f bf c7 89 be 22 01 00 00",
  },
  {
    id: "current-target-check-active-and-raw-category-flags",
    va: 0x004168f0,
    bytes:
      "56 57 8b f9 8a 87 f0 01 00 00 84 c0 75 07 5f 33 c0 5e c2 04 00 0f bf 74 24 0c 56 e8 30 b5 02 00 83 c4 04 85 c0 75 05 5f 5e c2 04 00 8b 4f 74 f6 c1 04 75 1a",
  },
  {
    id: "missing-target-cancels-then-scans",
    va: 0x00416d4c,
    bytes:
      "8b 8e b6 01 00 00 55 51 88 86 f1 01 00 00 e8 51 16 06 00 83 c4 08 8b ce e8 07 2a 02 00",
  },
  {
    id: "substate-one-calls-range-with-runtime-word",
    va: 0x00416d70,
    bytes:
      "66 8b 96 26 01 00 00 66 8b 86 22 01 00 00 52 50 8b ce e8 c9 1e 02 00",
  },
  {
    id: "out-of-range-enters-movement-substate-four",
    va: 0x0041710d,
    bytes:
      "8b 86 22 01 00 00 8b ce 50 e8 d5 f7 ff ff 85 c0 0f 84 9b 00 00 00 f6 46 74 01 0f 84 91 00 00 00 66 39 ae a0 04 00 00 c7 86 88 00 00 00 04 00 00 00",
  },
  {
    id: "range-active-lookup-and-class-switch",
    va: 0x00438c50,
    bytes:
      "51 53 66 8b 5c 24 0c 56 57 0f bf fb 8b f1 57 e8 dc 91 00 00 83 c4 04 85 c0 75 09",
  },
  {
    id: "range-one-footprint-low-word-boundary",
    va: 0x00438dbd,
    bytes:
      "66 3b c8 5d 7e 02 8b c1 66 3d 01 00 0f 8f 9c fe ff ff",
  },
  {
    id: "range-nonone-squared-strict-comparison",
    va: 0x00438ddb,
    bytes:
      "0f bf 88 c4 52 63 00 0f bf 56 6c 2b ca 0f bf 90 c2 52 63 00 0f bf 46 6a 2b d0 0f bf c7 0f af c0 8b f2 5f 0f af f2 8b d1 8d 04 80 0f af d1 8d 04 80 03 f2 33 c9 8d 04 c0 8d 04 c0 3b c6 5e 0f 9f c1",
  },
  {
    id: "type-range-and-scan-radius-copied",
    va: 0x00437d53,
    bytes:
      "66 8b 88 42 2e 88 00 66 89 8e 26 01 00 00 66 0f b6 90 44 2e 88 00 33 c0 66 89 96 a6 01 00 00",
  },
  {
    id: "acquisition-gate-fields",
    va: 0x0043a410,
    bytes:
      "80 b9 8c 00 00 00 64 7d 03 33 c0 c3 8a 91 f0 01 00 00 33 c0 84 d2 0f 95 c0 c3",
  },
  {
    id: "scan-bounds-use-signed-word-radius-and-map-clamps",
    va: 0x00439849,
    bytes:
      "66 8b 86 a6 01 00 00 bb 00 00 00 00 0f bf 96 bc 01 00 00 89 44 24 24 8b ca 0f bf c0 2b c8 0f 98 c3 4b 23 d9 0f bf 8e be 01 00 00",
  },
  {
    id: "candidate-relation-is-filtered-before-command",
    va: 0x00439928,
    bytes:
      "66 3b 9e 22 01 00 00 0f 84 fc 00 00 00 66 8b 86 b6 01 00 00 53 50 e8 2d 8e 00 00 83 c4 08 85 c0 74 57",
  },
  {
    id: "stored-target-age-uses-signed-absolute-dword-boundary",
    va: 0x004399a1,
    bytes:
      "8d 04 ff 8b 15 80 5f 7c 00 8d 3c 47 8d 3c ff c1 e7 03 8b 87 20 57 63 00 2b c2 99 33 c2 2b c2 3d c8 00 00 00 7d 6a",
  },
  {
    id: "class-78-secondary-list-is-index-ascending",
    va: 0x00439c11,
    bytes:
      "8b 46 74 f6 c4 20 0f 84 3c 01 00 00 33 db 66 39 1d 98 3a 7d 00 0f 8e 2d 01 00 00 66 8b 96 b6 01 00 00 0f bf fb 66 8b 0c bd d8 27 7d 00",
  },
  {
    id: "command-five-queues-target-reference",
    va: 0x00478400,
    bytes:
      "8b 44 24 14 8b 4c 24 10 0f bf 54 24 0c 6a 00 50 0f bf 44 24 10 c1 e2 10 51 8b 4c 24 10 0b d0 52 51 6a 05 e8 f8 fe ff ff 83 c4 18 b8 01 00 00 00 c3",
  },
  {
    id: "command-five-consumer-enters-action-and-writes-current-target",
    va: 0x0042706d,
    bytes:
      "66 8b 07 8b 8e 6c 02 00 00 66 89 86 b0 01 00 00 8b 86 70 02 00 00 8a 96 6a 02 00 00 89 8e f4 01 00 00 50 8b ce 89 86 f8 01 00 00 88 96 b4 01 00 00 89 9e 88 00 00 00 e8 c7 f7 fe ff",
  },
];

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = parseArgs(process.argv.slice(2));
  const report = extractK01HeroTargetingRange({
    executablePath: args.input,
    seedsPath: args.seeds,
    functionsPath: args.functions,
  });
  console.log(args.json ? JSON.stringify(report, null, 2) : summarize(report));
}

export function extractK01HeroTargetingRange({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  seedsPath = DEFAULT_SEEDS_PATH,
  functionsPath = DEFAULT_FUNCTIONS_PATH,
} = {}) {
  const { buffer, image } = readPeImage(resolve(executablePath));
  const executableSha256 = sha256(buffer);
  assertEqual(executableSha256, EXPECTED_SHA256, "original EXE SHA-256");
  const seeds = readAnalysisJson(seedsPath, executableSha256, "seed analysis");
  const functions = readAnalysisJson(
    functionsPath,
    executableSha256,
    "function analysis",
  );
  const heroes = recoverHeroTypeInputs(seeds);

  const analyzedFunctions = Object.values(FUNCTION_ENTRIES).map((entry) =>
    summarizeFunction(requireFunction(seeds, entry)),
  );
  const callEdges = REQUIRED_CALL_EDGES.map(([site, caller, callee]) =>
    requireCallEdge(seeds, functions, site, caller, callee),
  );

  return {
    schemaVersion: 1,
    question:
      "For the K01 Gwon Yul and Ryu Seong-ryong ordinary-attack path, how is the current target reference produced and validated, how do missing or out-of-range targets cause automatic acquisition or state transitions, and what exact fixed-width range formula and inclusive/exclusive boundaries does the original use?",
    statuses: {
      analysis: "static-proven-for-described-class-76-and-78-raw-inputs",
      reproduction: "complete-for-listed-normal-boundary-and-failure-vectors",
      integration:
        "gated-original-coordinate-and-reference-units-do-not-map-exactly-to-UnitState-GridPoint",
    },
    sources: {
      executable: { path: executablePath, sha256: executableSha256 },
      seeds: { path: seedsPath, sha256: sha256(readFileSync(seedsPath)) },
      functions: {
        path: functionsPath,
        sha256: sha256(readFileSync(functionsPath)),
      },
    },
    heroes,
    currentTargetReference: {
      commandType: 5,
      queueFields: ["+0x268", "+0x26c", "+0x270"],
      producerChain: [
        "0x00439d70",
        "0x00478400",
        "0x00478320",
        "0x00426740",
        "0x00426c20",
        "0x00416870",
      ],
      storedField: "+0x122 dword (low WORD index, high WORD generation)",
      writerChecks:
        "low WORD passes 0x00441db0 and full reference is not actor self-reference",
      substateCheck:
        "0x004168f0 checks actor +0x1f0, low-WORD active lookup, and raw target +0x30 categories against actor flags; it does not compare generation or hostility",
      fullReferenceCheck:
        "0x00441e80 compares the active record full reference, but the 0x00416c70 preamble does not gate the later substate switch on its result",
    },
    range: {
      function: "0x00438c50",
      activeLookupFirst: true,
      class76: {
        rangeWord: heroes.find((hero) => hero.internalClass === 76)?.rangeWord,
        branch: "range WORD == 1 footprint/Chebyshev branch",
        boundary: "signed low-WORD max axis distance <= 1",
      },
      class78: {
        rangeWord: heroes.find((hero) => hero.internalClass === 78)?.rangeWord,
        branch: "range WORD != 1 squared-distance branch",
        formula:
          "signed32(dx*dx + dy*dy) < signed32(range*range*2025), with every IMUL/ADD/LEA wrapping to 32 bits",
        normalDomainBoundary:
          "range 5 gives squared threshold 50625: distance 224 passes, distance 225 fails",
      },
      specialClass33:
        "class 33 bypasses both formulas and requires actor (+0x1bc,+0x1be)+2 map cell to contain the target low WORD",
    },
    acquisition: {
      scheduler:
        "after WORD [0x00c06e34] equals zero, 0x0043c9c0 sign-extends actor WORD +0x1b6, adds DWORD [0x007c5f80] with 32-bit wrap, and calls 0x00439770 when unsigned DIV by 20 leaves remainder zero",
      gate:
        "signed BYTE +0x8c >= 100 and BYTE +0x1f0 != 0, then one of the surrounding 3x3 coarse-mask cells must match the selected raw side mask",
      radiusField: "+0x1a6 unsigned byte copied from type definition +0x34",
      heroRadius: heroes.map(({ internalClass, scanRadius }) => ({
        internalClass,
        scanRadius,
      })),
      primaryOrder:
        "clamped Y from actorY-radius upward; for each Y, clamped X from actorX-radius upward; first candidate for which 0x00439d70 queues command 5 wins",
      relation:
        "0x00442770 requires both raw active table words and selected relation bytes from 0x004426a0 to differ",
      currentTargetExclusion:
        "primary cell scan excludes candidate low WORD equal to current target low WORD",
      class78SecondaryList:
        "class 78 initial flags include 0x2000, so after the cell scan it visits list 0x007d27d8 in ascending index order; relation-different entries use the radius predicate directly, while relation-same entries have a separate raw +0x571a/+0x5716 indirection; class 76 initial flags do not",
    },
    failureAndTransitions: [
      {
        state: "substate 1",
        condition: "0x004168f0 returns 0",
        effects:
          "clear +0x1f1; queue raw command 2; call automatic scan; return 0",
      },
      {
        state: "substate 1",
        condition: "target valid and 0x00438c50 returns 0",
        effects:
          "for class 76/78 initial flags, set substate 4 and issue movement toward target coordinates",
      },
      {
        state: "substate 1",
        condition: "target valid and in range",
        effects:
          "reset phase and compute facing; if 0x004196e0 returns 1, return without writing substate 3, otherwise write substate 3 and snapshot target coordinates",
      },
      {
        state: "substate 2",
        condition: "0x004173a0 returns nonzero",
        effects: "set substate 1 and clear +0x1f1",
      },
      {
        state: "substate 3",
        condition: "0x00417430 completes cycle",
        effects: "set substate 1 and clear +0x1f1",
      },
      {
        state: "substate 4/5",
        condition: "movement finishes and target low WORD is missing",
        effects: "queue raw command 2 and call automatic scan",
      },
      {
        state: "substate 4/5",
        condition: "movement finishes and target is now in range",
        effects:
          "set substate 1 (substate 5 additionally requires 0x00438bf0 return 0)",
      },
    ],
    analyzedFunctions,
    callEdges,
    codeAnchors: CODE_ANCHORS.map((anchor) =>
      validateCodeAnchor(buffer, image, anchor),
    ),
    testVectors: createTestVectors(),
  };
}

export function evaluateOriginalTargetRange(input) {
  validateBoolean(input.targetActive, "targetActive");
  validateS16(input.rangeWord, "rangeWord");
  validateIntegerRange(input.attackerClass, 0, 0xff, "attackerClass");
  if (!input.targetActive) return false;

  if (input.attackerClass === 33) {
    for (const field of [
      "attackerTileX",
      "attackerTileY",
      "occupiedTargetLowWord",
      "targetLowWord",
    ]) {
      validateS16(input[field], field);
    }
    for (const field of ["mapWidth", "mapHeight"]) {
      validateS32(input[field], field);
    }
    const x = add32(input.attackerTileX, 2);
    const y = add32(input.attackerTileY, 2);
    return (
      x >= 0 &&
      x < input.mapWidth &&
      y >= 0 &&
      y < input.mapHeight &&
      input.occupiedTargetLowWord !== 0 &&
      toS16(input.occupiedTargetLowWord) === toS16(input.targetLowWord)
    );
  }

  if (input.rangeWord === 1) {
    return evaluateFootprintRange(input);
  }
  for (const field of [
    "attackerCenterX",
    "attackerCenterY",
    "targetCenterX",
    "targetCenterY",
  ]) {
    validateS16(input[field], field);
  }
  const dx = sub32(input.targetCenterX, input.attackerCenterX);
  const dy = sub32(input.targetCenterY, input.attackerCenterY);
  const distanceSquared = add32(mul32(dx, dx), mul32(dy, dy));
  let threshold = mul32(input.rangeWord, input.rangeWord);
  threshold = mul32(threshold, 5);
  threshold = mul32(threshold, 5);
  threshold = mul32(threshold, 9);
  threshold = mul32(threshold, 9);
  return distanceSquared < threshold;
}

export function shouldRunAutomaticTargetScan({
  globalDisableWord,
  actorPhaseWord,
  acceptedStepCounter,
}) {
  validateIntegerRange(globalDisableWord, 0, 0xffff, "globalDisableWord");
  validateS16(actorPhaseWord, "actorPhaseWord");
  validateIntegerRange(
    acceptedStepCounter,
    0,
    0xffffffff,
    "acceptedStepCounter",
  );
  if (globalDisableWord !== 0) return false;
  return ((actorPhaseWord + acceptedStepCounter) >>> 0) % 20 === 0;
}

export function evaluateAutomaticScanGate({
  actorSignedByte8c,
  actorByte1f0,
  surroundingMaskMatch,
}) {
  validateS8(actorSignedByte8c, "actorSignedByte8c");
  validateIntegerRange(actorByte1f0, 0, 0xff, "actorByte1f0");
  validateBoolean(surroundingMaskMatch, "surroundingMaskMatch");
  return (
    actorSignedByte8c >= 100 &&
    actorByte1f0 !== 0 &&
    surroundingMaskMatch
  );
}

export function evaluateStoredTargetCandidate({
  storedStep,
  acceptedStepCounter,
  fullReferenceValid,
  relationDiffers,
  selectedRawModeIsOne,
  withinFourCellSeparation,
}) {
  for (const [label, value] of Object.entries({
    storedStep,
    acceptedStepCounter,
  })) {
    validateIntegerRange(value, 0, 0xffffffff, label);
  }
  for (const [label, value] of Object.entries({
    fullReferenceValid,
    relationDiffers,
    selectedRawModeIsOne,
    withinFourCellSeparation,
  })) {
    validateBoolean(value, label);
  }
  const signedAbsoluteStepDelta = abs32(
    sub32(storedStep | 0, acceptedStepCounter | 0),
  );
  return (
    signedAbsoluteStepDelta < 200 &&
    fullReferenceValid &&
    relationDiffers &&
    (selectedRawModeIsOne || withinFourCellSeparation)
  );
}

export function chooseFirstRelationDifferentSecondaryListTarget({
  candidates,
  currentFullReference,
}) {
  if (!Array.isArray(candidates)) {
    throw new TypeError("secondary candidates must be an array");
  }
  validateIntegerRange(
    currentFullReference,
    0,
    0xffffffff,
    "currentFullReference",
  );
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    validateIntegerRange(
      candidate.fullReference,
      0,
      0xffffffff,
      "secondary candidate.fullReference",
    );
    for (const field of ["active", "relationDiffers", "inScanRange", "commandAccepted"]) {
      validateBoolean(candidate[field], `secondary candidate.${field}`);
    }
    if (
      candidate.fullReference !== currentFullReference &&
      candidate.active &&
      candidate.relationDiffers &&
      candidate.inScanRange &&
      candidate.commandAccepted
    ) {
      return {
        index,
        fullReference: candidate.fullReference,
        lowWord: toS16(candidate.fullReference),
      };
    }
  }
  return null;
}

export function chooseFirstAutomaticTarget({
  minX,
  maxX,
  minY,
  maxY,
  cells,
  currentTargetLowWord,
}) {
  for (const field of [minX, maxX, minY, maxY, currentTargetLowWord]) {
    validateS16(field, "scan coordinate/reference");
  }
  if (!Array.isArray(cells)) throw new TypeError("cells must be an array");
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const candidate = cells.find((cell) => cell.x === x && cell.y === y);
      if (!candidate) continue;
      validateBoolean(candidate.active, "candidate.active");
      validateBoolean(candidate.relationDiffers, "candidate.relationDiffers");
      validateBoolean(candidate.commandAccepted, "candidate.commandAccepted");
      validateS16(candidate.lowWord, "candidate.lowWord");
      if (
        candidate.active &&
        candidate.lowWord !== currentTargetLowWord &&
        candidate.relationDiffers &&
        candidate.commandAccepted
      ) {
        return { x, y, lowWord: candidate.lowWord };
      }
    }
  }
  return null;
}

export function classifyAttackTargetTransition({
  substate,
  targetPassesLowWordCheck,
  inRange,
  movementComplete = false,
  specialFootprintCheck = false,
  attackEntryGateReturnedOne = false,
}) {
  validateIntegerRange(substate, 1, 5, "substate");
  for (const [label, value] of Object.entries({
    targetPassesLowWordCheck,
    inRange,
    movementComplete,
    specialFootprintCheck,
    attackEntryGateReturnedOne,
  })) {
    validateBoolean(value, label);
  }
  if (substate === 1) {
    if (!targetPassesLowWordCheck) {
      return { nextSubstate: 1, cancelCommand: true, automaticScan: true };
    }
    return inRange
      ? {
          nextSubstate: attackEntryGateReturnedOne ? 1 : 3,
          cancelCommand: false,
          automaticScan: false,
          attackEntryIntercepted: attackEntryGateReturnedOne,
        }
      : { nextSubstate: 4, cancelCommand: false, automaticScan: false };
  }
  if ((substate === 4 || substate === 5) && movementComplete) {
    if (!targetPassesLowWordCheck) {
      return { nextSubstate: substate, cancelCommand: true, automaticScan: true };
    }
    const mayReturnToOne =
      inRange && (substate !== 5 || !specialFootprintCheck);
    return {
      nextSubstate: mayReturnToOne ? 1 : substate,
      cancelCommand: false,
      automaticScan: false,
    };
  }
  return { nextSubstate: substate, cancelCommand: false, automaticScan: false };
}

function evaluateFootprintRange(input) {
  for (const field of [
    "attackerTileX",
    "attackerTileY",
    "attackerFootprintX",
    "attackerFootprintY",
    "targetTileX",
    "targetTileY",
  ]) {
    validateS16(input[field], field);
  }
  for (const field of ["targetFootprintX", "targetFootprintY"]) {
    validateS8(input[field], field);
  }
  const x = footprintAxisDistance(
    input.attackerTileX,
    input.attackerFootprintX,
    input.targetTileX,
    input.targetFootprintX,
  );
  const y = footprintAxisDistance(
    input.attackerTileY,
    input.attackerFootprintY,
    input.targetTileY,
    input.targetFootprintY,
  );
  const maxLowWord = toS16(x) <= toS16(y) ? toS16(y) : toS16(x);
  return maxLowWord <= 1;
}

function footprintAxisDistance(
  attackerTile,
  attackerFootprint,
  targetTile,
  targetFootprint,
) {
  const attackerEdge = add32(attackerFootprint, attackerTile);
  if (attackerEdge > targetTile) {
    const half = truncDiv2(targetFootprint);
    return abs32(
      add32(sub32(sub32(half, targetFootprint), targetTile), add32(attackerEdge, 1)),
    );
  }
  if (attackerEdge < targetTile) {
    const half = truncDiv2(targetFootprint);
    return abs32(sub32(sub32(sub32(targetTile, half), attackerFootprint), attackerTile));
  }
  return 0;
}

function recoverHeroTypeInputs(seeds) {
  const initializer = requireFunction(seeds, FUNCTION_ENTRIES.typeInitializer);
  const calls = extractTypeCalls(initializer.instructions);
  return [
    {
      internalClass: 76,
      name: "조선 권율",
      expectedRange: 1,
      expectedRadius: 5,
      expectedFlags: 0x00880805,
    },
    {
      internalClass: 78,
      name: "조선 유성룡",
      expectedRange: 5,
      expectedRadius: 5,
      expectedFlags: 0x00882805,
    },
  ].map((expected) => {
    const call = calls.find((candidate) => candidate.internalClass === expected.internalClass);
    if (!call) throw new Error(`Missing type initializer call for class ${expected.internalClass}`);
    const rangeWord = requireTypeArgument(call, 24);
    const scanRadius = requireTypeArgument(call, 25);
    const flags = requireTypeArgument(call, 37);
    assertEqual(rangeWord, expected.expectedRange, `class ${expected.internalClass} range`);
    assertEqual(scanRadius, expected.expectedRadius, `class ${expected.internalClass} scan radius`);
    assertEqual(flags, expected.expectedFlags, `class ${expected.internalClass} flags`);
    return {
      internalClass: expected.internalClass,
      originalGameplayName: expected.name,
      typeInitializerCall: toHex(call.callAddress),
      rangeWord,
      scanRadius,
      initialFlags: toHex(flags),
      hasSecondaryAcquisitionList: (flags & 0x2000) !== 0,
    };
  });
}

function extractTypeCalls(instructions) {
  const calls = [];
  const registers = new Map();
  let recordAddress;
  let pushes = [];
  for (const instruction of instructions) {
    const move = /^MOV (E[A-Z]{2}),(-?0x[0-9a-f]+)$/.exec(instruction.text);
    if (move) {
      registers.set(move[1], parseImmediate(move[2]));
      if (move[1] === "ECX") recordAddress = parseImmediate(move[2]);
    }
    const push = /^PUSH (.+)$/.exec(instruction.text);
    if (push) {
      pushes.push({
        address: Number(instruction.address),
        value: /^-?0x[0-9a-f]+$/.test(push[1])
          ? parseImmediate(push[1])
          : registers.get(push[1]),
      });
    }
    if (instruction.text !== "CALL 0x0045bd00") continue;
    if (pushes.length === 52 && pushes[0].address === 0x0045bf50) pushes = pushes.slice(1);
    if (pushes.length !== 51 || recordAddress === undefined) {
      throw new Error(`Cannot recover type writer arguments at ${instruction.address}`);
    }
    calls.push({
      internalClass: (recordAddress - 0x00882e10) / 0x014c,
      callAddress: Number(instruction.address),
      arguments: [...pushes].reverse(),
    });
    pushes = [];
    recordAddress = undefined;
  }
  return calls;
}

function requireTypeArgument(call, index) {
  const value = call.arguments[index]?.value;
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Class ${call.internalClass} argument ${index} is unresolved`);
  }
  return value;
}

function createTestVectors() {
  return [
    {
      id: "ryu-distance-224-inside",
      input: { rangeWord: 5, attacker: [0, 0], target: [224, 0] },
      expected: true,
    },
    {
      id: "ryu-distance-225-exclusive",
      input: { rangeWord: 5, attacker: [0, 0], target: [225, 0] },
      expected: false,
    },
    {
      id: "ryu-signed-dword-square-wrap",
      input: { rangeWord: 5, attacker: [32767, 0], target: [-32768, 0] },
      expected: true,
    },
    {
      id: "ryu-threshold-wrap",
      input: { rangeWord: 16384, attacker: [0, 0], target: [0, 0] },
      expected: false,
    },
    {
      id: "gwon-footprint-one-inclusive",
      input: { attackerX: 0, attackerFootprintX: 1, targetX: 2, targetFootprintX: 1 },
      expected: true,
    },
    {
      id: "gwon-footprint-two-outside",
      input: { attackerX: 0, attackerFootprintX: 1, targetX: 3, targetFootprintX: 1 },
      expected: false,
    },
    {
      id: "gwon-negative-target-footprint-truncates-toward-zero",
      input: { attackerX: 0, attackerFootprintX: 1, targetX: 2, targetFootprintX: -2 },
      expected: false,
    },
    {
      id: "gwon-low-word-axis-wrap",
      input: {
        attackerX: 32767,
        attackerFootprintX: 1,
        targetX: -32768,
        targetFootprintX: 1,
      },
      expected: true,
    },
    {
      id: "inactive-target",
      input: { targetActive: false },
      expected: false,
    },
    {
      id: "class-33-attacker-coordinate-width-rejection",
      input: { attackerTileX: 32768 },
      expectedError: "attackerTileX must be an integer in -32768..32767",
    },
    {
      id: "class-33-reference-width-rejection",
      input: { occupiedTargetLowWord: 65535 },
      expectedError:
        "occupiedTargetLowWord must be an integer in -32768..32767",
    },
    {
      id: "scan-y-major-with-current-and-same-relation-exclusions",
      input: {
        bounds: [0, 2, 0, 2],
        currentTargetLowWord: 8,
        candidates: [
          { x: 2, y: 0, lowWord: 8, accepted: false },
          { x: 1, y: 1, lowWord: 9, relationDiffers: false },
          { x: 2, y: 1, lowWord: 10, accepted: true },
          { x: 0, y: 2, lowWord: 11, accepted: true },
        ],
      },
      expected: { x: 2, y: 1, lowWord: 10 },
    },
    {
      id: "scan-modulo-twenty-dword-wrap",
      input: { globalDisableWord: 0, actorPhaseWord: -1, acceptedStepCounter: 1 },
      expected: true,
    },
    {
      id: "stored-target-age-199-inclusive",
      input: { storedStep: 1000, acceptedStepCounter: 1199 },
      expected: true,
    },
    {
      id: "stored-target-age-200-exclusive",
      input: { storedStep: 1000, acceptedStepCounter: 1200 },
      expected: false,
    },
    {
      id: "secondary-direct-exact-full-reference-excluded",
      input: {
        currentFullReference: 0x00010014,
        candidateFullReferences: [0x00010014, 0x00020014, 0x00010016],
      },
      expected: { index: 1, fullReference: 0x00020014, lowWord: 20 },
    },
    {
      id: "secondary-direct-index-order",
      input: {
        currentFullReference: 0x00010001,
        candidateFullReferences: [0x00010020, 0x00010021, 0x00010022],
        inScanRange: [false, true, true],
      },
      expected: { index: 1, fullReference: 0x00010021, lowWord: 33 },
    },
    {
      id: "missing-target-cancel-reacquire",
      input: { substate: 1, targetPassesLowWordCheck: false, inRange: false },
      expected: { nextSubstate: 1, cancelCommand: true, automaticScan: true },
    },
    {
      id: "out-of-range-move",
      input: { substate: 1, targetPassesLowWordCheck: true, inRange: false },
      expected: { nextSubstate: 4, cancelCommand: false, automaticScan: false },
    },
    {
      id: "movement-arrival-revalidate",
      input: {
        substate: 4,
        targetPassesLowWordCheck: true,
        inRange: true,
        movementComplete: true,
      },
      expected: { nextSubstate: 1, cancelCommand: false, automaticScan: false },
    },
  ];
}

function requireCallEdge(seeds, functions, site, caller, callee) {
  const callerReport = requireFunction(seeds, caller);
  const instruction = callerReport.instructions.find(
    (candidate) =>
      Number(candidate.address) === site &&
      candidate.text === `CALL ${toHex(callee)}`,
  );
  if (!instruction) {
    throw new Error(
      `Missing call edge ${toHex(site)}: ${toHex(caller)} -> ${toHex(callee)}`,
    );
  }
  const functionSummary = functions.functions.find(
    (candidate) => candidate.entry === toHex(caller),
  );
  if (!functionSummary?.callees?.includes(toHex(callee))) {
    throw new Error(
      `Function summary omits ${toHex(caller)} -> ${toHex(callee)}`,
    );
  }
  return {
    callSite: toHex(site),
    caller: toHex(caller),
    callee: toHex(callee),
    bytes: instruction.bytes,
  };
}

function readAnalysisJson(path, expectedSha256, label) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read ${label} from ${path}: ${error.message}`, {
      cause: error,
    });
  }
  if (!parsed || parsed.sourceSha256 !== expectedSha256) {
    throw new Error(
      `${label} ${path} source SHA-256 mismatch: expected ${expectedSha256}, got ${parsed?.sourceSha256}`,
    );
  }
  return parsed;
}

function requireFunction(seeds, entry) {
  const report = seeds.functions?.find((candidate) => candidate.entry === toHex(entry));
  if (!report?.instructions || !report?.basicBlocks) {
    throw new Error(`Seed analysis is missing function ${toHex(entry)}`);
  }
  return report;
}

function summarizeFunction(report) {
  return {
    entry: report.entry,
    name: report.name,
    bodyRanges: report.bodyRanges,
    basicBlockCount: report.basicBlocks.length,
    instructionCount: report.instructions.length,
  };
}

function validateCodeAnchor(buffer, image, anchor) {
  const rawOffset = image.vaToRawOffset(anchor.va);
  if (rawOffset === undefined) throw new RangeError(`${toHex(anchor.va)} is not file-backed`);
  const expected = Buffer.from(anchor.bytes.replaceAll(" ", ""), "hex");
  const actual = buffer.subarray(rawOffset, rawOffset + expected.length);
  if (!actual.equals(expected)) {
    throw new Error(
      `Static code anchor ${anchor.id} mismatch at ${toHex(anchor.va)}: expected ${formatBytes(expected)}, got ${formatBytes(actual)}`,
    );
  }
  return {
    id: anchor.id,
    va: toHex(anchor.va),
    rawOffset: toHex(rawOffset),
    byteLength: expected.length,
    bytes: formatBytes(expected),
    matched: true,
  };
}

function toS16(value) {
  return (value << 16) >> 16;
}
function add32(a, b) {
  return (a + b) | 0;
}
function sub32(a, b) {
  return (a - b) | 0;
}
function mul32(a, b) {
  return Math.imul(a, b);
}
function abs32(value) {
  return value < 0 ? (-value) | 0 : value | 0;
}
function truncDiv2(value) {
  return value < 0 ? Math.ceil(value / 2) : Math.floor(value / 2);
}

function validateBoolean(value, label) {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be boolean; got ${value}`);
}
function validateS8(value, label) {
  validateIntegerRange(value, -0x80, 0x7f, label);
}
function validateS16(value, label) {
  validateIntegerRange(value, -0x8000, 0x7fff, label);
}
function validateS32(value, label) {
  validateIntegerRange(value, -0x80000000, 0x7fffffff, label);
}
function validateIntegerRange(value, minimum, maximum, label) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be an integer in ${minimum}..${maximum}; got ${value}`);
  }
}
function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}
function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`);
  }
}
function parseImmediate(text) {
  const negative = text.startsWith("-");
  const digits = negative ? text.slice(3) : text.slice(2);
  const value = Number.parseInt(digits, 16);
  return negative ? -value : value;
}
function formatBytes(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(" ");
}
function parseArgs(argv) {
  const result = {};
  const options = new Map([
    ["--input", "input"],
    ["--seeds", "seeds"],
    ["--functions", "functions"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--json") {
      result.json = true;
      continue;
    }
    const key = options.get(argv[index]);
    if (!key) throw new Error(`Unknown argument: ${argv[index]}`);
    if (!argv[index + 1]) throw new Error(`${argv[index]} requires a path`);
    result[key] = argv[++index];
  }
  return result;
}
function summarize(report) {
  return [
    "K01 hero targeting/range evidence:",
    `  functions: ${report.analyzedFunctions.length}`,
    `  call edges: ${report.callEdges.length}`,
    `  code anchors: ${report.codeAnchors.length}`,
    `  Gwon Yul range WORD: ${report.heroes[0].rangeWord}`,
    `  Ryu Seong-ryong range WORD: ${report.heroes[1].rangeWord}`,
  ].join("\n");
}
