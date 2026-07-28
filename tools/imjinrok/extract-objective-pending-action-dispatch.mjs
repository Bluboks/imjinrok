#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSpriteLikeHeader } from "./codec.mjs";
import { readPeImage } from "./pe-image.mjs";
import {
  assertEqual,
  readJson,
  sha256,
  verifyEvidencePoint,
  verifyRawCodeRange,
  verifySeededFunction,
} from "./static-evidence.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_OBJECTIVE_SPRITE_PATH = "original/imjinrok2/yfnt/objectiveborder.spr";
const DEFAULT_SEEDS_PATH = "analysis/generated/imjinrok2/seeds.json";
const DEFAULT_REFERENCES_PATH = "analysis/generated/imjinrok2/references.json";

export const EXPECTED_EXECUTABLE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_OBJECTIVE_SPRITE_SHA256 =
  "62552fecc34139e6729b84d4e15dcbe6ea3622eb76b7f443af29fa5322813ea5";
export const EXPECTED_PENDING_REFERENCE_SHA256 =
  "03f85a3c6b1e963d57c400a9c66f6e89eeb30f9d303c9681ad665f6fa2ace5ef";
export const EXPECTED_DISPATCHER_CALL_REFERENCE_SHA256 =
  "eb7ec417de72ada68bc72a20857c3b25ad706768d563365748670be71ba09509";

const SELECTED_QUESTION =
  "목표 컨트롤 릴리스가 생산하는 pending action 0x3f0을 어떤 원본 dispatcher가 어떤 우선순위와 조건으로 소비하며, 그 결과를 K01에서 원본 전역 상태에 결합하지 않는 확장 가능한 UI-domain 계약으로 어떻게 표현할 수 있는가?";

const ORIGINAL_PARITY_OPEN_ACTION = Object.freeze({
  type: "open-objective-modal",
  metadata: Object.freeze({ profile: "original-parity" }),
});

const COMPETING_INITIAL_TRANSITIONS = new Map([
  [0x3ea, 0x3eb],
  [0x3ec, 0x3ed],
  [0x3ee, 0x3ef],
]);

const SEEDED_FUNCTIONS = [
  ["0x004434a0", "0x004434a0-0x0044357e", 7, 77, "ab4c32302ba6ba9c56fad040df9689aad63a8e03eb33cdeab7b5972368170cf0"],
  ["0x00449090", "0x00449090-0x00449260", 26, 118, "a963a03e97b2278f665504e93237ce958f132844d3e0a1646db9a6f08ea6e5ab"],
  ["0x004492d0", "0x004492d0-0x004492ec", 3, 8, "9a78329f4402df53e57c630f246fad3786f7e0f12045a5b5db042a4080f3edaa"],
  ["0x00449320", "0x00449320-0x004495dd", 13, 184, "d696d96b71017602a5c28b552a2c92f50c2484a81e3c5a8d19e77f3ec4693c07"],
  ["0x004495e0", "0x004495e0-0x004498f3", 31, 228, "d72804831f858fce9cf201b09c307a922a4483d325cdde1649402d1c3cca4d0b"],
  ["0x0044abb0", "0x0044abb0-0x0044ad93", 28, 159, "beba5cc8f9edcf250a3341a9f4ceda5a88d54866419c5153b31ccc39a25b238f"],
  ["0x0045f9c0", "0x0045f9c0-0x004607ac", 209, 801, "7081ada042adc4fa3a7d7b838f717c52bbd63fae2c45be566b0351cfd12dc022"],
  ["0x004a5730", "0x004a5730-0x004a5977", 13, 157, "84cccf7daf0e07f6a0e58041034a86be6fbc07937c768240426632bb7e8855e9"],
  ["0x004a5980", "0x004a5980-0x004a5ab3", 6, 87, "2289cf5de064b7c64f8d94d5c8d2b94406983934dea499f265f70f2645ee51b2"],
  ["0x004a5ac0", "0x004a5ac0-0x004a5ada", 3, 7, "c63a4ba6ef2c297bff073c2a16e6c1d5d7cfe86699f8b7addc4e8cc4a8d0bb33"],
  ["0x004a5ae0", "0x004a5ae0-0x004a5b29", 3, 18, "016550b760eacb89d4538a7cb82618a4241d4c22c48ce65e0d53b502f3c9f2c7"],
].map(([entry, bodyRange, blockCount, instructionCount, bodySha256]) => ({
  entry,
  bodyRange,
  blockCount,
  instructionCount,
  bodySha256,
}));

const RAW_CODE_RANGES = [
  {
    id: "ui-state-default-initializer",
    start: 0x00448ff0,
    endExclusive: 0x00449027,
    sha256: "75df4660fbf230510adf9006e8c7674fc421a14adb4ba66b58d26d5c104b6a90",
  },
  {
    id: "ui-state-3ed-initializer",
    start: 0x00449030,
    endExclusive: 0x0044908d,
    sha256: "15dfb815b36c2a062a6b8c8acfe58954fd6f7161ef441bdaea87cdcf2266a7ca",
  },
  {
    id: "ui-owner-state-and-return-jump-tables",
    start: 0x00449264,
    endExclusive: 0x004492c0,
    sha256: "f405cb61b071d1b15f4893ff9893ee8f335f520782559c24cae1a7fdbb99c0a8",
  },
  {
    id: "secondary-ui-owner-wrapper",
    start: 0x0045efd0,
    endExclusive: 0x0045efe8,
    sha256: "8c41cc21a14bd1c2eff15cc57a39832328e705347382ad71128ad018d255080e",
  },
  {
    id: "common-ui-resource-release",
    start: 0x00449900,
    endExclusive: 0x00449915,
    sha256: "c590da9fd13114f415f94efce18cd6da133a7dcc282175890e38372d0d81ef91",
  },
];

const STATIC_EVIDENCE = [
  [0x00449090, "a1 90 4c 63 00 85 c0 0f 84 c0 01 00 00", "the owner-disabled branch returns before reading or consuming the pending WORD"],
  [0x004490b8, "0f bf 05 98 29 55 00 05 18 fc ff ff 83 f8 09 0f 87 21 01 00 00 ff 24 85 64 92 44 00", "the dispatcher sign-extends DAT_00552998, bounds ten states, and selects exactly one jump-table case"],
  [0x004496a5, "56 b9 b0 27 55 00 e8 00 86 fc ff 83 f8 01 75 05 bf f0 03 00 00", "the objective control first selects pending state 0x3f0"],
  [0x004496ba, "56 b9 f8 28 55 00 e8 eb 85 fc ff 83 f8 01 75 05 bf ee 03 00 00", "the later 0x3ee control can overwrite 0x3f0"],
  [0x004496fd, "56 b9 e0 2a 55 00 e8 a8 85 fc ff 83 f8 01 75 05 bf ec 03 00 00", "the later 0x3ec control can overwrite the prior selection"],
  [0x00449712, "56 b9 50 28 55 00 e8 93 85 fc ff 83 f8 01 75 05 bf ea 03 00 00", "the final 0x3ea control has the last overwrite opportunity"],
  [0x00449784, "a1 80 95 54 00 b9 18 94 55 00 50 e8 1c 14 00 00 83 f8 01 0f 85 4f 01 00 00", "producer drawing happens after input and lock failure preserves the selected return"],
  [0x004498ec, "66 8b c7 5f 83 c4 14 c3", "the producer returns the final ordered selection through AX"],
  [0x004490ed, "e8 ee 04 00 00 8b f0 83 c4 04 66 85 f6", "the owner calls the producer and ignores a zero return"],
  [0x00449100, "e8 fb 07 00 00 66 89 35 98 29 55 00", "a nonzero result releases the common resource before the owner writes the pending WORD"],
  [0x00449900, "a1 cc bb 88 00 85 c0 74 0b 68 d8 af 88 00 e8 2d 9b ff ff 59 c3", "the complete transition cleanup releases the common UI resource only when its pointer is nonzero"],
  [0x004491bc, "e8 6f c5 05 00 66 c7 05 98 29 55 00 f1 03", "the 0x3f0 case initializes the objective modal and unconditionally advances to 0x3f1"],
  [0x004491cc, "8b 15 80 95 54 00 52 e8 a8 c7 05 00 83 c4 04 66 85 c0 74 0e 66 c7 05 98 29 55 00 e8 03 e8 d2 c8 05 00", "the 0x3f1 case stays active on zero or resets to 1000 and cleans up on nonzero"],
  [0x004491ee, "a1 80 95 54 00 50 e8 47 6b 02 00", "every owner-enabled case reaches the shared post-dispatch draw path"],
  [0x00449217, "8b 35 3c 6e c0 00 33 d2 0f bf 05 98 29 55 00 85 f6 0f 95 c2", "the shared post path rereads the pending state and normalizes the previous button"],
  [0x0045efd0, "56 e8 ba a0 fe ff 8b f0 66 83 fe 03 75 05 e8 0d 00 00 00 66 8b c6 5e c3", "the secondary wrapper is a complete caller that forwards the owner result"],
  [0x004602db, "66 39 35 20 6e c0 00 75 05 e8 d7 78 fe ff e8 a2 8d fe ff", "application state 0x17 conditionally updates gameplay then calls the common UI owner"],
  [0x004a57a2, "8d 4c 24 18 68 d8 af 88 00 51 e8 ef dc f9 ff 83 c4 08 85 c0 75 1c", "the objective initializer calls the SPR loader and branches only to error reporting"],
  [0x004a57b4, "85 c0 75 1c 8d 54 24 18 52 68 38 8f 4c 00 68 88 90 4c 00 68 18 94 55 00 e8 6f 58 fa ff 83 c4 10 6a 01", "SPR load failure reports detail and then continues into control initialization"],
  [0x004a598e, "e8 1d c3 f6 ff 83 f8 01 0f 84 10 01 00 00 e8 2f 39 fa ff 83 f8 01 0f 84 02 01 00 00", "pointer or external dismissal returns before any presentation-surface lock"],
  [0x004a59af, "56 b9 18 94 55 00 e8 f6 51 fa ff 83 f8 01 0f 85 92 00 00 00", "display surface lock failure skips modal frame drawing but continues to content presentation"],
  [0x004a5ac0, "a1 cc bb 88 00 85 c0 74 0d 68 d8 af 88 00 e8 6d d9 f9 ff 83 c4 04 e9 05 00 00 00", "cleanup releases the objective resource only when present and always tail-jumps to clear"],
  [0x004a5ae0, "a1 7c 92 54 00 b9 18 94 55 00 50 e8 c0 50 fa ff 83 f8 01 75 34", "clear always attempts its surface lock and exits without clearing on failure"],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const report = extractObjectivePendingActionDispatch({
    executablePath: args.input ?? DEFAULT_EXECUTABLE_PATH,
    objectiveSpritePath: args.sprite ?? DEFAULT_OBJECTIVE_SPRITE_PATH,
    seedsPath: args.seeds ?? DEFAULT_SEEDS_PATH,
    referencesPath: args.references ?? DEFAULT_REFERENCES_PATH,
  });
  console.log(args.json ? JSON.stringify(report, null, 2) : formatReport(report));
}

export function extractObjectivePendingActionDispatch({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  objectiveSpritePath = DEFAULT_OBJECTIVE_SPRITE_PATH,
  seedsPath = DEFAULT_SEEDS_PATH,
  referencesPath = DEFAULT_REFERENCES_PATH,
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  const executableSha256 = sha256(buffer);
  assertEqual(executableSha256, EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);
  const objectiveSpriteBuffer = readFileSync(objectiveSpritePath);
  assertEqual(
    sha256(objectiveSpriteBuffer),
    EXPECTED_OBJECTIVE_SPRITE_SHA256,
    `${objectiveSpritePath} SHA-256`,
  );
  const objectiveSpriteHeader = parseSpriteLikeHeader(objectiveSpriteBuffer);
  assertEqual(objectiveSpriteHeader.width, 416, `${objectiveSpritePath} width`);
  assertEqual(objectiveSpriteHeader.height, 236, `${objectiveSpritePath} height`);
  assertEqual(objectiveSpriteHeader.frameCount, 1, `${objectiveSpritePath} frame count`);

  const seeds = readJson(seedsPath);
  const references = readJson(referencesPath);
  assertEqual(seeds.sourceSha256, executableSha256, `${seedsPath} source SHA-256`);
  assertEqual(references.sourceSha256, executableSha256, `${referencesPath} source SHA-256`);

  const functions = SEEDED_FUNCTIONS.map((expected) =>
    verifySeededFunction(buffer, image, seeds, expected),
  );
  const rawCodeRanges = RAW_CODE_RANGES.map((range) =>
    verifyRawCodeRange(buffer, image, range),
  );
  const evidencePoints = STATIC_EVIDENCE.map((point) =>
    verifyEvidencePoint(buffer, image, point),
  );
  const pendingReferences = verifyPendingReferences(references);
  const dispatcherCallReferences = verifyDispatcherCallReferences(references);

  return {
    selectedQuestion: SELECTED_QUESTION,
    analysisStatus: "static-confirmed",
    reproductionStatus:
      "reproduction-complete for ordered objective production and the 0x3f0/0x3f1/1000 objective lifecycle, including scoped surface and resource failures",
    implementationStatus:
      "UI-domain contract and vector-linked tests only; no scene, simulation, shared-state, or scenario integration",
    conclusion:
      "FUN_00449090 is the dispatcher. FUN_004495e0 resolves competing controls before the owner write, with the last active state-producing control winning in the order 0x3f0, 0x3ee, 0x3ec, 0x3ea. If 0x3f0 survives, the next owner frame selects exactly that switch case, calls FUN_004a5730, and unconditionally advances to 0x3f1 even when the objective SPR load fails. A nonzero FUN_004a5980 result resets the owner to 1000 before FUN_004a5ac0 releases any loaded resource and always attempts content clear.",
    sources: {
      executable: { path: executablePath, sha256: executableSha256 },
      objectiveSprite: {
        path: objectiveSpritePath,
        sha256: EXPECTED_OBJECTIVE_SPRITE_SHA256,
        width: objectiveSpriteHeader.width,
        height: objectiveSpriteHeader.height,
        frameCount: objectiveSpriteHeader.frameCount,
      },
      seeds: { path: seedsPath, sourceSha256: seeds.sourceSha256 },
      references: {
        path: referencesPath,
        sourceSha256: references.sourceSha256,
        validatedSets: {
          pendingState: {
            count: pendingReferences.directReferences.length,
            sha256: pendingReferences.sha256,
          },
          dispatcherCallers: {
            count: dispatcherCallReferences.directCalls.length,
            sha256: dispatcherCallReferences.sha256,
          },
        },
      },
    },
    functions,
    rawCodeRanges,
    evidencePoints,
    staticEvidencePointCount: evidencePoints.length,
    pendingStorage: {
      address: "0x00552998",
      width: "signed WORD",
      directReferenceCount: pendingReferences.directReferences.length,
      structuredReferenceSha256: pendingReferences.sha256,
      directReferences: pendingReferences.directReferences,
    },
    producer: {
      function: "FUN_004495e0",
      ownerCall: "0x004490ed",
      ownerWrite: "0x00449105",
      orderedSelections: [
        { control: "0x005527b0", value: "0x3f0" },
        { control: "0x005528f8", value: "0x3ee" },
        { control: "0x00552ae0", value: "0x3ec" },
        { control: "0x00552850", value: "0x3ea" },
      ],
      priority:
        "all four controls are evaluated independently in this order; the last active control wins before the single owner write",
      surfaceFailure:
        "the producer surface lock is attempted after all input updates, so its failure cannot undo the selected return",
    },
    dispatcher: {
      function: "FUN_00449090",
      exactCallers: [
        "0x0045efd1 from complete wrapper FUN_0045efd0",
        "0x004602e9 from application state 0x17 in FUN_0045f9c0",
      ],
      structuredDirectCallCount: dispatcherCallReferences.directCalls.length,
      structuredDirectCallSha256: dispatcherCallReferences.sha256,
      structuredDirectCalls: dispatcherCallReferences.directCalls,
      objectivePendingCase: {
        value: "0x3f0",
        call: "0x004491bc to FUN_004a5730",
        nextValue: "0x3f1",
        resourceFailure:
          "FUN_004a5730 reports SPR loader failure and continues; the void call gives FUN_00449090 no failure result, so 0x3f1 is still written",
      },
      objectiveActiveCase: {
        value: "0x3f1",
        call: "0x004491d3 to FUN_004a5980",
        continueValue: "0x3f1",
        dismissValue: "0x3e8 (1000)",
        cleanupCall: "0x004491e9 to FUN_004a5ac0",
      },
      ownerDisabled:
        "DAT_00634c90 == 0 returns before the pending WORD read, leaving it unconsumed",
    },
    semanticContract: {
      confirmedAction: ORIGINAL_PARITY_OPEN_ACTION,
      mapping:
        "only a surviving 0x3f0 selected by the verified consumer maps to open-objective-modal; overwritten and unrelated numeric states are not assigned speculative UI meanings",
      publicBoundary:
        "the client contract exposes semantic action type and extensible metadata only, not DAT_00552998 or original numeric state values",
    },
    unresolvedFields: [
      "the semantic meanings of competing original values 0x3ee, 0x3ec, and 0x3ea are outside this question",
      "scene and simulation ownership for producing the semantic action is not available in the permitted UI-owned data",
      "the original runtime result after a failed SPR load may include detailed loader side effects beyond the confirmed continue-to-0x3f1 control flow",
    ],
  };
}

export function reproduceObjectivePendingProduction({
  objectiveControlReleased,
  state3eeControlReleased,
  state3ecControlReleased,
  state3eaControlReleased,
  surfaceLockSucceeded,
  commonUiResourcePresent,
}) {
  assertBoolean(objectiveControlReleased, "objectiveControlReleased");
  assertBoolean(state3eeControlReleased, "state3eeControlReleased");
  assertBoolean(state3ecControlReleased, "state3ecControlReleased");
  assertBoolean(state3eaControlReleased, "state3eaControlReleased");
  assertBoolean(surfaceLockSucceeded, "surfaceLockSucceeded");
  assertBoolean(commonUiResourcePresent, "commonUiResourcePresent");

  let pendingState = 0;
  const events = [];
  for (const [released, state, label] of [
    [objectiveControlReleased, 0x3f0, "objective-open"],
    [state3eeControlReleased, 0x3ee, "unresolved-0x3ee"],
    [state3ecControlReleased, 0x3ec, "unresolved-0x3ec"],
    [state3eaControlReleased, 0x3ea, "unresolved-0x3ea"],
  ]) {
    if (!released) {
      continue;
    }
    events.push(
      pendingState === 0
        ? `select-pending-${label}`
        : `overwrite-pending-${formatPendingState(pendingState)}-with-${label}`,
    );
    pendingState = state;
  }

  events.push(
    surfaceLockSucceeded
      ? "draw-common-ui-surface"
      : "skip-common-ui-draw-surface-lock-failed",
  );
  if (pendingState === 0) {
    return {
      handlerReturn: 0,
      ownerWrite: null,
      candidateSemanticAction: null,
      events,
    };
  }
  if (commonUiResourcePresent) {
    events.push("release-common-ui-resource");
  }
  events.push("write-pending-owner-state");
  return {
    handlerReturn: pendingState,
    ownerWrite: pendingState,
    candidateSemanticAction:
      pendingState === 0x3f0 ? cloneOpenObjectiveModalAction() : null,
    events,
  };
}

export function reproduceObjectivePendingDispatcher({
  ownerEnabled,
  pendingState,
  objectiveResourceLoadSucceeded,
  objectiveUpdate,
}) {
  assertBoolean(ownerEnabled, "ownerEnabled");
  assertSignedWord(pendingState, "pendingState");
  if (!ownerEnabled) {
    return dispatcherResult("owner-disabled", pendingState, [], []);
  }

  if (pendingState === 0x3f0) {
    assertBoolean(objectiveResourceLoadSucceeded, "objectiveResourceLoadSucceeded");
    const events = ["consume-open-objective-modal", "initialize-objective-modal"];
    events.push(
      objectiveResourceLoadSucceeded
        ? "load-objective-resource"
        : "report-objective-resource-load-failure-and-continue",
      "set-objective-modal-active",
      ...sharedOwnerPostEvents(),
    );
    return dispatcherResult(
      "objective-initialize",
      0x3f1,
      [cloneOpenObjectiveModalAction()],
      events,
    );
  }

  if (pendingState === 0x3f1) {
    validateObjectiveUpdate(objectiveUpdate);
    const events = ["update-objective-modal"];
    if (!objectiveUpdate.dismissed) {
      events.push(
        objectiveUpdate.surfaceLockSucceeded
          ? "draw-objective-modal"
          : "skip-objective-draw-surface-lock-failed",
        "present-objective-content",
        "normalize-objective-previous-button",
        ...sharedOwnerPostEvents(),
      );
      return dispatcherResult("objective-active", 0x3f1, [], events);
    }

    events.push("reset-to-common-ui-root");
    if (objectiveUpdate.objectiveResourcePresent) {
      events.push("release-objective-resource");
    }
    events.push("attempt-clear-objective-content");
    if (objectiveUpdate.cleanupSurfaceLockSucceeded) {
      events.push("clear-objective-content", "unlock-objective-clear-surface");
    }
    events.push(...sharedOwnerPostEvents());
    return dispatcherResult("objective-dismiss", 1000, [], events);
  }

  if (pendingState === 1000) {
    return dispatcherResult(
      "common-ui-initialize",
      0x3e9,
      [],
      ["initialize-common-ui", "set-common-ui-active", ...sharedOwnerPostEvents()],
    );
  }

  const competingTransition = COMPETING_INITIAL_TRANSITIONS.get(pendingState);
  if (competingTransition !== undefined) {
    return dispatcherResult(
      "competing-state-dispatch",
      competingTransition,
      [],
      [`dispatch-unresolved-${formatPendingState(pendingState)}`, ...sharedOwnerPostEvents()],
    );
  }

  return dispatcherResult(
    "unmatched-state",
    pendingState,
    [],
    sharedOwnerPostEvents(),
  );
}

function verifyPendingReferences(references) {
  if (!Array.isArray(references.references)) {
    throw new TypeError("references.json must contain a references array");
  }
  const directReferences = references.references
    .filter((reference) => reference.to === "0x00552998")
    .map(({ from, type, fromFunctionEntry }) => ({ from, type, fromFunctionEntry }));
  const digest = createHash("sha256")
    .update(JSON.stringify(directReferences))
    .digest("hex");
  assertEqual(directReferences.length, 14, "DAT_00552998 direct reference count");
  assertEqual(digest, EXPECTED_PENDING_REFERENCE_SHA256, "DAT_00552998 reference digest");
  return { directReferences, sha256: digest };
}

function verifyDispatcherCallReferences(references) {
  const directCalls = references.references
    .filter((reference) => reference.to === "0x00449090")
    .map(({ from, type, fromFunctionEntry }) => ({ from, type, fromFunctionEntry }))
    .sort(
      (left, right) =>
        left.from.localeCompare(right.from) ||
        left.type.localeCompare(right.type) ||
        (left.fromFunctionEntry ?? "").localeCompare(right.fromFunctionEntry ?? ""),
    );
  const digest = createHash("sha256")
    .update(JSON.stringify(directCalls))
    .digest("hex");
  assertEqual(directCalls.length, 2, "FUN_00449090 structured direct-call count");
  assertEqual(
    digest,
    EXPECTED_DISPATCHER_CALL_REFERENCE_SHA256,
    "FUN_00449090 structured direct-call digest",
  );
  return { directCalls, sha256: digest };
}

function validateObjectiveUpdate(update) {
  if (!update || typeof update !== "object" || Array.isArray(update)) {
    throw new TypeError("objectiveUpdate is required for pendingState 0x3f1");
  }
  assertBoolean(update.dismissed, "objectiveUpdate.dismissed");
  if (update.dismissed) {
    assertBoolean(update.objectiveResourcePresent, "objectiveUpdate.objectiveResourcePresent");
    assertBoolean(
      update.cleanupSurfaceLockSucceeded,
      "objectiveUpdate.cleanupSurfaceLockSucceeded",
    );
    return;
  }
  assertBoolean(update.surfaceLockSucceeded, "objectiveUpdate.surfaceLockSucceeded");
}

function dispatcherResult(phase, nextPendingState, consumedActions, events) {
  return { phase, nextPendingState, consumedActions, events };
}

function sharedOwnerPostEvents() {
  return ["draw-shared-ui", "present-shared-ui", "normalize-owner-previous-button"];
}

function cloneOpenObjectiveModalAction() {
  return {
    type: ORIGINAL_PARITY_OPEN_ACTION.type,
    metadata: { ...ORIGINAL_PARITY_OPEN_ACTION.metadata },
  };
}

function formatPendingState(value) {
  return `0x${value.toString(16)}`;
}

function assertBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw new TypeError(`${label} must be boolean; got ${String(value)}`);
  }
}

function assertSignedWord(value, label) {
  if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) {
    throw new RangeError(
      `${label} must be a signed WORD value (-32768..32767); got ${String(value)}`,
    );
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (
      arg === "--input" ||
      arg === "--sprite" ||
      arg === "--seeds" ||
      arg === "--references"
    ) {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${arg} requires a path`);
      }
      parsed[arg.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function formatReport(report) {
  return [
    report.selectedQuestion,
    `analysis: ${report.analysisStatus}`,
    `reproduction: ${report.reproductionStatus}`,
    `implementation: ${report.implementationStatus}`,
    `EXE SHA-256: ${report.sources.executable.sha256}`,
    `objective SPR SHA-256: ${report.sources.objectiveSprite.sha256}`,
    `pending references: ${report.pendingStorage.directReferenceCount} (${report.pendingStorage.structuredReferenceSha256})`,
    `dispatcher callers: ${report.dispatcher.structuredDirectCallCount} (${report.dispatcher.structuredDirectCallSha256})`,
    `functions: ${report.functions.length}`,
    `raw ranges: ${report.rawCodeRanges.length}`,
    `evidence points: ${report.staticEvidencePointCount}`,
    `conclusion: ${report.conclusion}`,
  ].join("\n");
}
