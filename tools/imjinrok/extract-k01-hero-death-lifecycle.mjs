#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readPeImage, toHex } from "./pe-image.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_SEEDS_PATH = "analysis/generated/imjinrok2/seeds.json";
const DEFAULT_FUNCTIONS_PATH = "analysis/generated/imjinrok2/functions.json";
const DEFAULT_JUMP_TABLES_PATH =
  "analysis/generated/imjinrok2/jump-tables.json";
const EXPECTED_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
const MEMORY_DESTINATION_MUTATING_MNEMONICS = new Set([
  "ADC",
  "ADD",
  "AND",
  "BTC",
  "BTR",
  "BTS",
  "CMPXCHG",
  "CMPXCHG8B",
  "DEC",
  "FIST",
  "FISTP",
  "FISTTP",
  "FNSAVE",
  "FNSTCW",
  "FNSTENV",
  "FNSTSW",
  "FSAVE",
  "FST",
  "FSTP",
  "INC",
  "MOV",
  "MOVNTI",
  "NEG",
  "NOT",
  "OR",
  "POP",
  "RCL",
  "RCR",
  "ROL",
  "ROR",
  "SAL",
  "SAR",
  "SBB",
  "SHL",
  "SHR",
  "SUB",
  "XADD",
  "XCHG",
  "XOR",
]);

const QUESTION =
  "For K01 Gwon Yul and Ryu Seong-ryong, after signed health reaches zero, what exact original update path enters and advances the death state, when is the entity record deactivated or released, and are other entities’ current-target references eagerly cleared or only made invalid by slot/reference lifecycle?";

const FUNCTION_ENTRIES = {
  actionStateSixHandler: 0x004233f0,
  actionStateSevenHandler: 0x00423740,
  currentTargetWriter: 0x00416870,
  currentTargetReferenceClear: 0x00426bf0,
  liveTargetCommandHelper: 0x00426c20,
  animationInitializer: 0x004291d0,
  entityInitializer: 0x00437650,
  damageApplication: 0x00438130,
  actionDispatcher: 0x0043c9c0,
  lowWordSlotRecordPositiveCheck: 0x00441db0,
  fullReferenceAliveCheck: 0x00441de0,
  activeRecordLookup: 0x00441e40,
  fullReferenceActiveCheck: 0x00441e80,
  entityPoolUpdater: 0x00447360,
  typeWriter: 0x0045bd00,
  typeInitializer: 0x0045bf50,
  entityActiveRegistration: 0x0043aa80,
  inactiveSlotSelector: 0x00483a60,
  activeSlotRelease: 0x00483aa0,
  entityRecordCreateWrapper: 0x00483c50,
  k01OwnerClassReferenceLookup: 0x004885e0,
  k01MissionUpdate: 0x0048a5c0,
};

const REQUIRED_CALL_EDGES = [
  [0x004233ff, 0x004233f0, 0x00423150],
  [0x0042340f, 0x004233f0, 0x0043a8b0],
  [0x00423436, 0x004233f0, 0x0048e3a0],
  [0x0042343d, 0x004233f0, 0x0043a860],
  [0x00423749, 0x00423740, 0x0043a8b0],
  [0x0043ccc8, 0x0043c9c0, 0x00426c20],
  [0x0043d292, 0x0043c9c0, 0x0042de00],
  [0x0043ce03, 0x0043c9c0, 0x004233f0],
  [0x0043ce70, 0x0043c9c0, 0x00423740],
  [0x0043d141, 0x0043c9c0, 0x00423740],
  [0x00447499, 0x00447360, 0x0043c9c0],
  [0x004474a6, 0x00447360, 0x00483aa0],
  [0x00483c95, 0x00483c50, 0x00437650],
  [0x00437f29, 0x00437650, 0x004291d0],
  [0x00437f9c, 0x00437650, 0x0043aa80],
  [0x00488630, 0x004885e0, 0x00441db0],
  [0x0048a81c, 0x0048a5c0, 0x004885e0],
  [0x0048a822, 0x0048a5c0, 0x00441de0],
  [0x0048a84a, 0x0048a5c0, 0x004885e0],
  [0x0048a850, 0x0048a5c0, 0x00441de0],
];

const CODE_ANCHORS = [
  {
    id: "damage-application-signed-buffer-order",
    va: 0x00438159,
    bytes:
      "66 8b 81 90 00 00 00 8b 54 24 04 66 85 c0 74 1f 66 3b c2 7c 11 2b c2 66 89 81 90 00 00 00 b8 01 00 00 00 c2 08 00",
    meaning:
      "raw damage application tests and compares buffer AX with damage DX as signed WORDs before health",
  },
  {
    id: "damage-application-health-subtract-and-zero-clamp",
    va: 0x0043817f,
    bytes:
      "66 c7 81 90 00 00 00 00 00 66 29 51 3e 66 83 79 3e 00 7f e4 66 c7 41 3e 00 00 33 c0 c2 08 00",
    meaning:
      "the remaining branch clears buffer, subtracts a WORD from health, keeps only signed-positive health, and otherwise stores zero",
  },
  {
    id: "health-zero-gate-and-action-six-entry",
    va: 0x0043cc79,
    bytes:
      "66 39 2d 34 6e c0 00 0f 85 8d 00 00 00 66 39 6e 3e 7e 43",
    meaning:
      "WORD 0x00c06e34 must be zero before signed WORD health +0x3e can take the <=0 branch",
  },
  {
    id: "death-action-exclusions-and-raw-byte-gate",
    va: 0x0043ccdd,
    bytes:
      "66 8b 86 b0 01 00 00 66 3d 06 00 74 29 66 3d 07 00 74 23 66 3d 16 00 74 1d 80 be f0 01 00 00 01 0f 85 3c 04 00 00",
    meaning:
      "actions 6, 7, and 0x16 are not re-entered; BYTE +0x1f0 must equal one",
  },
  {
    id: "action-six-and-phase-zero-write",
    va: 0x0043cd03,
    bytes:
      "66 c7 86 b0 01 00 00 06 00 66 89 ae b2 01 00 00",
    meaning:
      "the eligible health-zero path writes action 6 and zeroes WORD +0x1b2 without writing cadence counter BYTE +0x6f",
  },
  {
    id: "action-six-prologue-and-prephase-call-order",
    va: 0x004233f8,
    bytes:
      "c6 86 f1 01 00 00 01 e8 4c fd ff ff 80 3e 01 75 0b 6a 00 6a 00 8b ce e8 9c 74 01 00",
    meaning:
      "state 6 sets BYTE +0x1f1, calls 0x00423150, and conditionally calls 0x0043a8b0 before later phase work",
  },
  {
    id: "action-six-class-flag-special-branches",
    va: 0x00423442,
    bytes:
      "66 8b 9e 84 00 00 00 f6 c3 02 0f 84 85 01 00 00",
    meaning:
      "WORD +0x84 is loaded before raw bit 0x02, 0x01, and 0x08 branches",
  },
  {
    id: "action-six-raw-bit-one-branch",
    va: 0x004235d7,
    bytes:
      "f6 c3 01 74 31",
    meaning: "raw WORD +0x84 bit 0x01 selects a separate early-return branch",
  },
  {
    id: "action-six-raw-bit-eight-branch",
    va: 0x0042360d,
    bytes:
      "f6 c3 08 74 7a",
    meaning: "raw WORD +0x84 bit 0x08 selects a separate early-return branch",
  },
  {
    id: "action-six-byte-cadence-gate",
    va: 0x0042368c,
    bytes:
      "8a 46 6f 0f be 4e 6e fe c0 41 0f be d0 3b d1 88 46 6f 0f 8c 91 00 00 00",
    meaning:
      "BYTE +0x6f increments with 8-bit wrap and is compared signed against signed BYTE +0x6e plus one",
  },
  {
    id: "action-six-phase-normalization",
    va: 0x004236a4,
    bytes:
      "66 8b 8e 8c 01 00 00 33 c0 66 3b c8 c6 46 6f 00 c6 46 03 07 7e 1a 0f bf 86 b2 01 00 00 0f bf f9 99 f7 ff",
    meaning:
      "eligible phase work selects visual state 7 and uses signed IDIV only when signed WORD +0x18c is positive",
  },
  {
    id: "action-six-phase-boundary-and-repeat-completion",
    va: 0x004236df,
    bytes:
      "66 8b 86 b2 01 00 00 0f bf c9 0f bf d0 49 3b d1 7c 34 f6 c3 04 74 0c",
    meaning:
      "the normalized signed phase is compared with count minus one; raw flag bit 0x04 can complete immediately",
  },
  {
    id: "action-six-phase-increment",
    va: 0x00423725,
    bytes:
      "40 c6 46 04 01 66 89 86 b2 01 00 00 66 89 46 34",
    meaning:
      "an incomplete phase increments EAX and stores its low WORD to +0x1b2 and +0x34",
  },
  {
    id: "action-six-completion-selects-seven-or-sixteen",
    va: 0x0043ce03,
    bytes:
      "e8 e8 65 fe ff 83 f8 01 0f 85 ba 04 00 00 8a 86 84 00 00 00 24 19 f6 d8 1b c0 24 f1 83 c0 16 66 89 86 b0 01 00 00",
    meaning:
      "return one maps (+0x84 & 0x19)!=0 to action 7 and zero to action 0x16",
  },
  {
    id: "delayed-action-signed-word-boundary",
    va: 0x0043ce2e,
    bytes:
      "f6 c3 02 74 10 8a 4e 03 b0 12 3a c8 74 07 88 46 03 c6 46 04 01 66 8b 86 36 02 00 00 66 3b 86 34 02 00 00 7c 0e",
    meaning:
      "action 0x16 optionally selects visual 0x12, then compares signed WORD +0x236 with +0x234 using JL",
  },
  {
    id: "delayed-action-equality-and-increment",
    va: 0x0043ce53,
    bytes:
      "66 c7 86 b0 01 00 00 07 00 e9 e8 04 00 00 40 66 89 86 36 02 00 00",
    meaning:
      "counter >= limit enters action 7; only counter < limit increments the low WORD",
  },
  {
    id: "state-seven-helper-and-removal-return",
    va: 0x00423740,
    bytes:
      "80 39 01 75 09 6a 00 6a 00 e8 62 71 01 00 b8 01 00 00 00 c3",
    meaning:
      "the helper conditionally calls 0x0043a8b0 and itself returns one",
  },
  {
    id: "state-seven-dispatch-ignores-helper-return",
    va: 0x0043ce6e,
    bytes:
      "8b ce e8 cb 68 fe ff 66 8b 86 7a 04 00 00 66 3b c5",
    meaning:
      "the dispatcher ignores the helper return and continues the state-7 branch before testing current runtime flags",
  },
  {
    id: "state-seven-low-flag-return-zero",
    va: 0x0043ce9f,
    bytes:
      "f6 46 74 80 0f 84 6c 04 00 00",
    meaning:
      "when BYTE +0x74 lacks bit 0x80, state 7 takes the dispatcher return-zero path",
  },
  {
    id: "outer-update-releases-on-zero",
    va: 0x0044747b,
    bytes:
      "be d8 2d 84 00 0f bf 0e 66 39 1c 4d d8 0e 7d 00 74 21 69 c9 58 05 00 00 81 c1 58 52 63 00 e8 22 55 ff ff 85 c0 75 0c 66 8b 16 52 e8 f5 c5 03 00",
    meaning:
      "the active-list pass skips inactive slots, calls 0x0043c9c0, and calls 0x00483aa0 exactly when it returns zero",
  },
  {
    id: "release-active-list-swap-and-count-decrement",
    va: 0x00483b22,
    bytes:
      "66 8b 8e 12 54 63 00 0f bf 15 38 37 84 00 0f bf c1 66 8b 14 55 d6 2d 84 00 66 89 14 45 d8 2d 84 00",
    meaning:
      "release uses record WORD +0x1ba to replace its active-list position with the last entry before decrementing the count",
  },
  {
    id: "release-clears-two-slot-words",
    va: 0x00483c1b,
    bytes:
      "66 89 1c 7d d8 0e 7d 00 66 89 1c 7d 38 18 7d 00",
    meaning:
      "release clears WORD slot table 0x007d0ed8 and WORD reuse-age table 0x007d1838",
  },
  {
    id: "inactive-slot-selection-boundary",
    va: 0x00483a67,
    bytes:
      "bf 01 00 00 00 b9 3a 18 7d 00 66 83 b9 a0 f6 ff ff 00 75 12",
    meaning:
      "slot selection starts at slot one and considers only zero entries in 0x007d0ed8",
  },
  {
    id: "generation-increment-before-create",
    va: 0x00483c58,
    bytes:
      "66 a1 98 5f 7c 00 51 8b 4c 24 18 52 8b 54 24 18 51 8b 4c 24 18 66 40",
    meaning:
      "the create wrapper increments the global generation WORD with 16-bit wrap before initialization",
  },
  {
    id: "record-zero-initialization",
    va: 0x00437656,
    bytes:
      "b9 56 01 00 00 33 c0 8b fe 33 db ba 64 00 00 00 f3 ab",
    meaning: "record creation begins by zeroing 0x156 DWORDs (0x558 bytes)",
  },
  {
    id: "full-reference-slot-word-written",
    va: 0x0043782e,
    bytes: "66 89 86 b6 01 00 00",
    meaning:
      "initialization writes the supplied slot low WORD in AX at +0x1b6",
  },
  {
    id: "full-reference-generation-word-written",
    va: 0x00437847,
    bytes: "66 89 8e b8 01 00 00",
    meaning:
      "initialization independently writes the supplied generation WORD in CX at +0x1b8",
  },
  {
    id: "default-delayed-counter-values",
    va: 0x004379f2,
    bytes:
      "66 c7 86 34 02 00 00 64 00 66 89 9e 36 02 00 00",
    meaning: "entity initialization writes +0x234=100 and +0x236=0",
  },
  {
    id: "type-flag-and-byte-cadence-copy",
    va: 0x00437bc0,
    bytes:
      "66 8b 0c 85 64 2e 88 00 33 c0 66 89 8e 84 00 00 00",
    meaning: "type WORD +0x54 is copied to runtime WORD +0x84",
  },
  {
    id: "type-byte-cadence-copy",
    va: 0x00437df4,
    bytes:
      "8a 90 52 2e 88 00 88 56 6e",
    meaning: "type BYTE +0x42 is copied to runtime BYTE +0x6e",
  },
  {
    id: "class-76-animation-block-loads-eight",
    va: 0x0042a9da,
    bytes: "bb 08 00 00 00",
    meaning: "the class-76 animation initializer block loads EBX with eight",
  },
  {
    id: "class-76-death-count-store",
    va: 0x0042aa15,
    bytes: "66 89 9e 8c 01 00 00",
    meaning: "the class-76 block stores that WORD eight at +0x18c",
  },
  {
    id: "class-78-animation-block-loads-eight",
    va: 0x0042ab2a,
    bytes: "bb 08 00 00 00",
    meaning: "the class-78 animation initializer block loads EBX with eight",
  },
  {
    id: "class-78-death-count-store",
    va: 0x0042ab65,
    bytes: "66 89 9e 8c 01 00 00",
    meaning: "the class-78 block stores that WORD eight at +0x18c",
  },
  {
    id: "runtime-flags-74-and-84-writer-family",
    va: 0x0042c7b9,
    bytes:
      "8b 41 74 ba 01 00 00 00 84 c2 74 04 48 89 41 74 8b 41 74 0d 82 00 41 00 89 41 74 66 8b 81 84 00 00 00 a8 08 74 0a 83 c0 f8 66 89 81 84 00 00 00 80 89 84 00 00 00 02",
    meaning:
      "a runtime helper can rewrite DWORD +0x74 and clear/set raw bits in WORD +0x84; applicability to the scoped mission heroes is unresolved",
  },
  {
    id: "runtime-flags-84-or-writer",
    va: 0x0043bd1b,
    bytes:
      "bf 01 00 00 00 66 c7 46 3e 00 00 66 09 be 84 00 00 00 c6 46 72 01",
    meaning:
      "another runtime path zeroes health and ORs DI (one on this branch) into WORD +0x84",
  },
  {
    id: "low-word-slot-and-positive-health-check",
    va: 0x00441db0,
    bytes:
      "8b 44 24 04 66 83 3c 45 d8 0e 7d 00 00 75 03 33 c0 c3",
    meaning: "the raw low-WORD lookup first requires a nonzero slot-table WORD",
  },
  {
    id: "full-reference-alive-check-order",
    va: 0x00441de5,
    bytes:
      "0f bf c1 66 83 3c 45 d8 0e 7d 00 00 75 04 33 c0 59 c3",
    meaning:
      "the full-reference alive check sign-extends the slot low WORD, then checks slot, signed positive health, and both reference WORDs",
  },
  {
    id: "active-record-check-adds-byte-gate",
    va: 0x00441e5e,
    bytes:
      "66 83 b8 96 52 63 00 00 7f 03 33 c0 c3 8a 88 48 54 63 00",
    meaning:
      "the active-record lookup requires signed positive health before testing BYTE +0x1f0",
  },
  {
    id: "current-target-full-dword-writer",
    va: 0x004168b2,
    bytes:
      "0f bf c7 89 be 22 01 00 00",
    meaning:
      "the command path stores the candidate full DWORD reference at another entity's +0x122",
  },
  {
    id: "record-creation-clears-current-target-low-word",
    va: 0x004376fd,
    bytes: "66 89 9e 22 01 00 00",
    meaning:
      "record initialization clears the current-target low WORD at +0x122",
  },
  {
    id: "record-creation-clears-current-target-high-word",
    va: 0x00437704,
    bytes: "66 89 9e 24 01 00 00",
    meaning:
      "record initialization clears the current-target high WORD at +0x124",
  },
  {
    id: "target-clearer-clears-current-target-low-word",
    va: 0x00426bf5,
    bytes: "66 89 81 22 01 00 00",
    meaning:
      "the separate command helper clears current-target low WORD +0x122",
  },
  {
    id: "target-clearer-clears-current-target-high-word",
    va: 0x00426bfc,
    bytes: "66 89 81 24 01 00 00",
    meaning:
      "the separate command helper clears current-target high WORD +0x124",
  },
  {
    id: "positive-health-live-path-calls-target-command-helper",
    va: 0x0043cc86,
    bytes:
      "66 39 6e 3e 7e 43 8b ce e8 8d ca ff ff 66 39 2d 34 6e c0 00 75 23 0f bf 86 b6 01 00 00 8b 0d 80 5f 7c 00 33 d2 03 c1 b9 14 00 00 00 f7 f1 85 d2 75 07 8b ce e8 b1 ca ff ff 8b ce e8 aa c7 ff ff 8b ce e8 53 9f fe ff eb 44",
    meaning:
      "signed-positive health follows the live path and calls 0x00426c20 at 0x0043ccc8; signed health <=0 jumps to 0x0043cccf and bypasses it",
  },
  {
    id: "death-action-switch-dispatch",
    va: 0x0043cd88,
    bytes:
      "0f bf 86 b0 01 00 00 8d 48 ff 83 f9 44 0f 87 87 05 00 00 33 d2 8a 91 08 d4 43 00 ff 24 95 60 d3 43 00",
    meaning:
      "the action WORD is sign-extended, range-checked, translated through the byte table at 0x0043d408, and dispatched through the table at 0x0043d360",
  },
  {
    id: "unrelated-action-fifteen-calls-second-clearer-helper",
    va: 0x0043d289,
    bytes:
      "8b ce e8 40 e0 ff ff 8b ce e8 69 0b ff ff 8b ce e8 92 da ff ff e9 a6 00 00 00",
    meaning:
      "the action-15 destination calls 0x0042de00 at 0x0043d292; this block is distinct from actions 6, 7, and 0x16",
  },
  {
    id: "same-raw-displacement-unrelated-record-context",
    va: 0x0049522b,
    bytes:
      "89 86 28 01 00 00 8b 86 0c 01 00 00 03 d1 8b cb 89 be 24 01 00 00 89 be 34 01 00 00 89 96 20 01 00 00",
    meaning:
      "0x0049523b writes DWORD [ESI+0x124] among contiguous +0x120/+0x128/+0x134 fields in a different record context, so raw displacement alone is not an entity current-target inventory",
  },
  {
    id: "k01-class-76-alive-check",
    va: 0x0048a812,
    bytes:
      "66 8b 15 44 cc bc 00 52 6a 4c e8 bf dd ff ff 50 e8 b9 75 fb ff",
    meaning:
      "K01 resolves owner/class 76 to a full reference and passes it to 0x00441de0",
  },
  {
    id: "k01-class-78-alive-check",
    va: 0x0048a840,
    bytes:
      "66 8b 0d 44 cc bc 00 51 6a 4e e8 91 dd ff ff 50 e8 8b 75 fb ff",
    meaning:
      "K01 resolves owner/class 78 to a full reference and passes it to 0x00441de0",
  },
];

export function extractK01HeroDeathLifecycle({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  seedsPath = DEFAULT_SEEDS_PATH,
  functionsPath = DEFAULT_FUNCTIONS_PATH,
  jumpTablesPath = DEFAULT_JUMP_TABLES_PATH,
} = {}) {
  const absoluteExecutablePath = resolve(executablePath);
  const { buffer, image } = readPeImage(absoluteExecutablePath);
  const sourceSha256 = sha256(buffer);
  assertEqual(sourceSha256, EXPECTED_SHA256, "original EXE SHA-256");
  const seeds = readAnalysisJson(seedsPath, sourceSha256, "seed analysis");
  const functions = readAnalysisJson(
    functionsPath,
    sourceSha256,
    "function analysis",
  );
  const jumpTables = readAnalysisJson(
    jumpTablesPath,
    sourceSha256,
    "jump-table analysis",
  );

  const analyzedFunctions = Object.values(FUNCTION_ENTRIES).map((entry) =>
    summarizeFunction(requireFunction(seeds, entry), functions),
  );
  const callEdges = REQUIRED_CALL_EDGES.map(([site, caller, callee]) =>
    requireCallEdge(seeds, functions, site, caller, callee),
  );
  const codeAnchors = CODE_ANCHORS.map((anchor) =>
    validateCodeAnchor(buffer, image, anchor),
  );
  const animationDispatch = validateHeroAnimationDispatch(jumpTables);
  const deathActionDispatch = validateDeathActionDispatch(jumpTables);
  const heroes = recoverHeroTypeInputs(seeds, animationDispatch);
  const currentTargetWriteEvidence = validateCurrentTargetWrites(
    seeds,
    functions,
    deathActionDispatch,
  );

  const testVectors = createTestVectors();
  return {
    question: QUESTION,
    source: {
      path: DEFAULT_EXECUTABLE_PATH,
      sha256: sourceSha256,
      format: "PE32 x86",
    },
    evidenceStatus: "static-proven-scoped-original-death-lifecycle",
    reproductionStatus: "reproduction-complete",
    integrationStatus: "gated-no-exact-original-to-project-time-or-lifecycle-map",
    exactScope:
      "Classes 76 and 78 only: signed-health entry into action 6, parameterized phase/update-unit progression from the incoming cadence counter and runtime flags, action 7 versus raw action 0x16 selection, signed-WORD delay boundaries, conditional outer active-list release, slot/reference invalidation order, K01 protected-hero alive checks, and absence of a direct +0x122/+0x124 write in the confirmed death/release path.",
    heroes,
    animationDispatch,
    deathActionDispatch,
    lifecycle: {
      healthZeroValidity:
        "health WORD <= 0 makes 0x00441db0/0x00441de0/0x00441e40/0x00441e80 reject immediately, before the record is released",
      classDeathPath:
        "health <= 0 -> action 6 with phase reset but cadence counter retained -> runtime +0x84 selects action 7 or 0x16 -> runtime +0x74 bit 0x80 selects state-7 retention or dispatcher return 0 -> only return 0 lets the same outer active-list pass call 0x00483aa0",
      phaseUnits:
        "accepted invocations of the original entity update path only; no seconds, FPS, or project-tick conversion is proven",
      creationDefaultsAndRuntimeState:
        "Creation initializes cadence counter +0x6f and delay counter +0x236 to zero, delay limit +0x234 to 100, and class/type flag defaults; health-zero entry resets only action +0x1b0 and phase +0x1b2. It does not reset +0x6f or +0x236, and later +0x74/+0x84 writers are not closed for the scoped mission instances.",
      eagerTargetClear:
        "no direct current-target write occurs in the confirmed health-zero/action-6/action-7/action-0x16/release path; the health-zero branch bypasses the live-path 0x00426c20 call and action 15 alone reaches 0x0042de00, so existing references remain stale and are rejected by consumer-side health, slot, and later full-reference checks",
      release:
        "0x00483aa0 removes the slot from the active list and clears 0x007d0ed8 and 0x007d1838; it does not mutate the released record's +0x1b6/+0x1b8",
      reuse:
        "0x00483a60 can select the now-zero slot; 0x00483c50 increments the generation WORD and 0x00437650 zeroes and reinitializes the record/full reference",
    },
    currentTargetWriteEvidence,
    targetClearer: {
      function: toHex(FUNCTION_ENTRIES.currentTargetReferenceClear),
      directCallers: ["0x00426c20", "0x0042de00"],
      confirmedScopedDeathReleasePathCallsIt: false,
      limitation:
        "This proves no direct eager clear in the confirmed scoped death/release chain. Alias-based writes and unrelated command paths remain outside this proof.",
    },
    analyzedFunctions,
    callEdges,
    codeAnchors,
    testVectors,
  };
}

export function evaluateHealthZeroDeathEntry({
  globalHealthGateWord,
  healthWord,
  actionState,
  byte1f0,
  phaseCadenceCounterByte,
}) {
  validateU16(globalHealthGateWord, "globalHealthGateWord");
  validateS16(healthWord, "healthWord");
  validateU16(actionState, "actionState");
  validateU8(byte1f0, "byte1f0");
  validateS8(phaseCadenceCounterByte, "phaseCadenceCounterByte");
  if (globalHealthGateWord !== 0) {
    return { entered: false, reason: "global-health-gate-nonzero", actionState };
  }
  if (healthWord > 0) {
    return { entered: false, reason: "signed-health-positive", actionState };
  }
  if ([6, 7, 0x16].includes(actionState)) {
    return { entered: false, reason: "death-action-excluded", actionState };
  }
  if (byte1f0 !== 1) {
    return {
      entered: false,
      reason: "byte-0x1f0-not-one",
      actionState,
      dispatcherReturn: 0,
    };
  }
  return {
    entered: true,
    reason: "eligible-signed-health-zero-or-negative",
    actionState: 6,
    phaseWord: 0,
    phaseCadenceCounterByte,
  };
}

export function advanceActionStateSix(input) {
  validateS8(input.phaseCadenceByte, "phaseCadenceByte");
  validateS8(input.phaseCadenceCounterByte, "phaseCadenceCounterByte");
  validateS16(input.phaseCountWord, "phaseCountWord");
  validateS16(input.phaseWord, "phaseWord");
  validateS16(input.repeatCounterWord, "repeatCounterWord");
  validateS16(input.repeatLimitWord, "repeatLimitWord");
  validateU16(input.flags84Word, "flags84Word");

  const specialBranch =
    (input.flags84Word & 0x02) !== 0
      ? "raw-bit-two-branch"
      : (input.flags84Word & 0x01) !== 0
        ? "raw-bit-one-branch"
        : (input.flags84Word & 0x08) !== 0
          ? "raw-bit-eight-branch"
          : null;
  if (specialBranch !== null) {
    return {
      handlerReturn: 1,
      branch: specialBranch,
      phaseCadenceCounterByte: input.phaseCadenceCounterByte,
      phaseWord: input.phaseWord,
      repeatCounterWord: input.repeatCounterWord,
    };
  }

  const nextCadenceCounter = toS8(input.phaseCadenceCounterByte + 1);
  const cadenceThreshold = input.phaseCadenceByte + 1;
  if (nextCadenceCounter < cadenceThreshold) {
    return {
      handlerReturn: 0,
      branch: "cadence-no-progress",
      phaseCadenceCounterByte: nextCadenceCounter,
      phaseWord: input.phaseWord,
      repeatCounterWord: input.repeatCounterWord,
    };
  }

  let normalizedPhase = 0;
  if (input.phaseCountWord > 0) {
    normalizedPhase = truncSignedRemainder(
      input.phaseWord,
      input.phaseCountWord,
    );
  }
  if (normalizedPhase < input.phaseCountWord - 1) {
    return {
      handlerReturn: 0,
      branch: "phase-advanced",
      visualStateByte: 7,
      visualDirtyByte: 1,
      phaseCadenceCounterByte: 0,
      phaseWord: toS16(normalizedPhase + 1),
      repeatCounterWord: input.repeatCounterWord,
    };
  }
  if ((input.flags84Word & 0x04) !== 0) {
    return {
      handlerReturn: 1,
      branch: "raw-bit-four-completion",
      visualStateByte: 7,
      phaseCadenceCounterByte: 0,
      phaseWord: normalizedPhase,
      repeatCounterWord: input.repeatCounterWord,
    };
  }
  const nextRepeatCounter = toS16(input.repeatCounterWord + 1);
  return {
    handlerReturn: nextRepeatCounter <= input.repeatLimitWord ? 0 : 1,
    branch:
      nextRepeatCounter <= input.repeatLimitWord
        ? "repeat-counter-not-complete"
        : "repeat-counter-complete",
    visualStateByte: 7,
    phaseCadenceCounterByte: 0,
    phaseWord: normalizedPhase,
    repeatCounterWord: nextRepeatCounter,
  };
}

export function selectPostActionSixState(flags84Word) {
  validateU16(flags84Word, "flags84Word");
  return (flags84Word & 0x19) === 0 ? 0x16 : 7;
}

export function advanceActionStateSixteen({
  counterWord,
  limitWord,
  flags74Dword,
  visualStateByte,
}) {
  validateS16(counterWord, "counterWord");
  validateS16(limitWord, "limitWord");
  validateU32(flags74Dword, "flags74Dword");
  validateU8(visualStateByte, "visualStateByte");
  const selectsVisualTwelve =
    (flags74Dword & 0x02) !== 0 && visualStateByte !== 0x12;
  if (counterWord >= limitWord) {
    return {
      actionState: 7,
      counterWord,
      visualStateByte: selectsVisualTwelve ? 0x12 : visualStateByte,
      visualDirtyByte: selectsVisualTwelve ? 1 : 0,
      overflowPossible: false,
    };
  }
  return {
    actionState: 0x16,
    counterWord: counterWord + 1,
    visualStateByte: selectsVisualTwelve ? 0x12 : visualStateByte,
    visualDirtyByte: selectsVisualTwelve ? 1 : 0,
    overflowPossible: false,
  };
}

export function evaluateOriginalReferenceValidity({
  slotTableWord,
  healthWord,
  byte1f0,
  suppliedFullReference,
  recordFullReference,
  requireByte1f0,
  requireFullReference,
}) {
  validateU16(slotTableWord, "slotTableWord");
  validateS16(healthWord, "healthWord");
  validateU8(byte1f0, "byte1f0");
  validateU32(suppliedFullReference, "suppliedFullReference");
  validateU32(recordFullReference, "recordFullReference");
  validateBoolean(requireByte1f0, "requireByte1f0");
  validateBoolean(requireFullReference, "requireFullReference");
  if (slotTableWord === 0 || healthWord <= 0) return false;
  if (requireByte1f0 && byte1f0 === 0) return false;
  if (
    requireFullReference &&
    suppliedFullReference !== recordFullReference
  ) {
    return false;
  }
  return true;
}

export function evaluateStateSevenAndOuterRelease({
  flags74Dword,
  slotTableWord,
  activeListContainsSlot,
}) {
  validateU32(flags74Dword, "flags74Dword");
  validateU16(slotTableWord, "slotTableWord");
  validateBoolean(activeListContainsSlot, "activeListContainsSlot");
  const dispatcherReturn = (flags74Dword & 0x80) === 0 ? 0 : 1;
  const releaseCalled =
    activeListContainsSlot && slotTableWord !== 0 && dispatcherReturn === 0;
  return {
    stateSevenHelperReturn: 1,
    dispatcherReturn,
    releaseCalled,
    activeAfter: releaseCalled ? false : activeListContainsSlot,
    slotTableWordAfter: releaseCalled ? 0 : slotTableWord,
    generationMutated: false,
  };
}

export function incrementGenerationForCreate(generationWord) {
  validateU16(generationWord, "generationWord");
  return (generationWord + 1) & 0xffff;
}

export function reproduceDefaultActionSixTimeline({
  initialCadenceCounterByte,
}) {
  validateS8(initialCadenceCounterByte, "initialCadenceCounterByte");
  let phaseCadenceCounterByte = initialCadenceCounterByte;
  let phaseWord = 0;
  let firstVisualSevenWriteInvocation = null;
  for (let invocation = 1; invocation <= 512; invocation += 1) {
    const result = advanceActionStateSix({
      phaseCadenceByte: 1,
      phaseCadenceCounterByte,
      phaseCountWord: 8,
      phaseWord,
      repeatCounterWord: 0,
      repeatLimitWord: 0,
      flags84Word: 0x14,
    });
    if (
      result.visualStateByte === 7 &&
      firstVisualSevenWriteInvocation === null
    ) {
      firstVisualSevenWriteInvocation = invocation;
    }
    phaseCadenceCounterByte = result.phaseCadenceCounterByte;
    phaseWord = result.phaseWord;
    if (result.handlerReturn === 1) {
      return {
        initialCadenceCounterByte,
        firstVisualSevenWriteInvocation,
        actionSixCompletionInvocation: invocation,
        actionSevenProcessedInvocation: invocation + 1,
        retainedPhaseWord: phaseWord,
        retainedCadenceCounterByte: phaseCadenceCounterByte,
      };
    }
  }
  throw new Error(
    `Default action 6 did not complete within 512 accepted invocations from cadence counter ${initialCadenceCounterByte}`,
  );
}

function recoverHeroTypeInputs(seeds, animationDispatch) {
  const initializer = requireFunction(seeds, FUNCTION_ENTRIES.typeInitializer);
  const calls = extractTypeCalls(initializer.instructions);
  return [
    {
      internalClass: 76,
      originalGameplayName: "조선 권율",
      expectedFlags74: 0x00880805,
    },
    {
      internalClass: 78,
      originalGameplayName: "조선 유성룡",
      expectedFlags74: 0x00882805,
    },
  ].map((expected) => {
    const call = calls.find(
      (candidate) => candidate.internalClass === expected.internalClass,
    );
    if (!call) {
      throw new Error(
        `Missing type initializer call for class ${expected.internalClass}`,
      );
    }
    const flags74Dword = requireTypeArgument(call, 37);
    const flags84Word = requireTypeArgument(call, 39);
    const phaseCadenceByte = requireTypeArgument(call, 32);
    const repeatLimitWord = requireTypeArgument(call, 34);
    assertEqual(
      flags74Dword,
      expected.expectedFlags74,
      `class ${expected.internalClass} flags +0x74`,
    );
    assertEqual(
      flags84Word,
      0x14,
      `class ${expected.internalClass} flags +0x84`,
    );
    assertEqual(
      phaseCadenceByte,
      1,
      `class ${expected.internalClass} phase cadence`,
    );
    assertEqual(
      repeatLimitWord,
      0,
      `class ${expected.internalClass} repeat limit`,
    );
    return {
      internalClass: expected.internalClass,
      originalGameplayName: expected.originalGameplayName,
      typeInitializerCall: toHex(call.callAddress),
      creationDefaultFlags74Dword: toHex(flags74Dword),
      creationDefaultFlags84Word: toHex(flags84Word),
      creationDefaultPhaseCadenceByte: phaseCadenceByte,
      creationDefaultRepeatLimitWord: repeatLimitWord,
      creationDefaultDeathPhaseCount:
        animationDispatch.find(
          (mapping) => mapping.internalClass === expected.internalClass,
        )?.storedDeathPhaseCount,
      creationDefaultStateAfterActionSixCompletion:
        selectPostActionSixState(flags84Word),
      creationDefaultStateSevenDispatcherReturn:
        (flags74Dword & 0x80) === 0 ? 0 : 1,
      runtimeFlagQualification:
        "These are creation/type defaults, not immutable death-time values; later +0x74/+0x84 writers are not closed for these mission instances.",
    };
  });
}

function validateHeroAnimationDispatch(jumpTables) {
  const table = jumpTables.tables?.find(
    (candidate) =>
      candidate.functionEntry === toHex(FUNCTION_ENTRIES.animationInitializer) &&
      candidate.switchAddress === "0x004292b3",
  );
  if (!table) {
    throw new Error(
      "Jump-table analysis is missing animation initializer switch 0x004292b3",
    );
  }
  const expected = [
    {
      internalClass: 76,
      destination: "0x0042a9da",
      countStore: "0x0042aa15",
    },
    {
      internalClass: 78,
      destination: "0x0042ab2a",
      countStore: "0x0042ab65",
    },
  ];
  return expected.map((mapping) => {
    const recovered = table.cases?.find(
      (candidate) => candidate.label === mapping.internalClass,
    );
    if (recovered?.destination !== mapping.destination) {
      throw new Error(
        `Animation dispatch for class ${mapping.internalClass} mismatch: expected ${mapping.destination}, got ${recovered?.destination}`,
      );
    }
    return {
      ...mapping,
      switchAddress: table.switchAddress,
      storedDeathPhaseCount: 8,
    };
  });
}

function validateDeathActionDispatch(jumpTables) {
  const table = jumpTables.tables?.find(
    (candidate) =>
      candidate.functionEntry === toHex(FUNCTION_ENTRIES.actionDispatcher) &&
      candidate.switchAddress === "0x0043cda3",
  );
  if (!table) {
    throw new Error(
      "Jump-table analysis is missing action dispatcher switch 0x0043cda3",
    );
  }
  const expected = [
    { actionState: 6, destination: "0x0043cdfa", role: "action-six" },
    { actionState: 7, destination: "0x0043ce6e", role: "action-seven" },
    {
      actionState: 0x0f,
      destination: "0x0043d289",
      role: "unrelated-clearer-path",
    },
    { actionState: 0x16, destination: "0x0043ce2e", role: "delayed-death" },
  ];
  return expected.map((mapping) => {
    const recovered = table.cases?.find(
      (candidate) => candidate.label === mapping.actionState,
    );
    if (recovered?.destination !== mapping.destination) {
      throw new Error(
        `Action dispatch for state ${toHex(mapping.actionState)} mismatch: expected ${mapping.destination}, got ${recovered?.destination}`,
      );
    }
    return { ...mapping, switchAddress: table.switchAddress };
  });
}

function validateCurrentTargetWrites(seeds, functions, deathActionDispatch) {
  const expectedSites = [
    {
      address: 0x004168b5,
      functionEntry: FUNCTION_ENTRIES.currentTargetWriter,
      field: "+0x122/+0x124",
      width: "DWORD",
      effect: "write supplied full reference",
      text: "MOV dword ptr [ESI + 0x122],EDI",
    },
    {
      address: 0x00426bf5,
      functionEntry: FUNCTION_ENTRIES.currentTargetReferenceClear,
      field: "+0x122",
      width: "WORD",
      effect: "clear low WORD",
      text: "MOV word ptr [ECX + 0x122],AX",
    },
    {
      address: 0x00426bfc,
      functionEntry: FUNCTION_ENTRIES.currentTargetReferenceClear,
      field: "+0x124",
      width: "WORD",
      effect: "clear high WORD",
      text: "MOV word ptr [ECX + 0x124],AX",
    },
    {
      address: 0x004376fd,
      functionEntry: FUNCTION_ENTRIES.entityInitializer,
      field: "+0x122",
      width: "WORD",
      effect: "creation clear low WORD",
      text: "MOV word ptr [ESI + 0x122],BX",
    },
    {
      address: 0x00437704,
      functionEntry: FUNCTION_ENTRIES.entityInitializer,
      field: "+0x124",
      width: "WORD",
      effect: "creation clear high WORD",
      text: "MOV word ptr [ESI + 0x124],BX",
    },
  ];
  const confirmedEntityRecordSites = expectedSites.map((site) => {
    const report = requireFunction(seeds, site.functionEntry);
    const instruction = report.instructions.find(
      (candidate) => Number(candidate.address) === site.address,
    );
    if (instruction?.text !== site.text) {
      throw new Error(
        `Current-target direct write ${toHex(site.address)} mismatch: expected ${site.text}, got ${instruction?.text}`,
      );
    }
    return {
      address: toHex(site.address),
      functionEntry: toHex(site.functionEntry),
      field: site.field,
      width: site.width,
      effect: site.effect,
      bytes: instruction.bytes,
    };
  });

  const clearer = functions.functions.find(
    (candidate) =>
      candidate.entry === toHex(FUNCTION_ENTRIES.currentTargetReferenceClear),
  );
  if (!clearer) throw new Error("Function summary is missing target clearer");
  const expectedCallers = ["0x00426c20", "0x0042de00"];
  assertEqual(
    JSON.stringify(clearer.callers),
    JSON.stringify(expectedCallers),
    "target clearer callers",
  );

  const helperTopology = expectedCallers.map((entry) => {
    const summary = functions.functions.find(
      (candidate) => candidate.entry === entry,
    );
    if (!summary) {
      throw new Error(`Function summary is missing clearer helper ${entry}`);
    }
    assertEqual(
      JSON.stringify(summary.callers),
      JSON.stringify([toHex(FUNCTION_ENTRIES.actionDispatcher)]),
      `${entry} callers`,
    );
    if (
      !summary.callees?.includes(
        toHex(FUNCTION_ENTRIES.currentTargetReferenceClear),
      )
    ) {
      throw new Error(
        `${entry} no longer calls ${toHex(FUNCTION_ENTRIES.currentTargetReferenceClear)}`,
      );
    }
    return {
      function: entry,
      onlyDirectCaller: toHex(FUNCTION_ENTRIES.actionDispatcher),
      callsClearer: true,
    };
  });

  const scopedRoots = [
    FUNCTION_ENTRIES.actionStateSixHandler,
    FUNCTION_ENTRIES.actionStateSevenHandler,
    FUNCTION_ENTRIES.actionDispatcher,
    FUNCTION_ENTRIES.entityPoolUpdater,
    FUNCTION_ENTRIES.activeSlotRelease,
  ];
  const scopedRootScan = [];
  for (const entry of scopedRoots) {
    const report = requireFunction(seeds, entry);
    const unexpectedWrite = report.instructions.find((instruction) =>
      instructionDirectlyWritesCurrentTarget(instruction.text),
    );
    if (unexpectedWrite) {
      throw new Error(
        `Scoped root ${report.entry} directly writes entity current-target field at ${toHex(Number(unexpectedWrite.address))}: ${unexpectedWrite.text}`,
      );
    }
    scopedRootScan.push({
      functionEntry: report.entry,
      instructionCount: report.instructions.length,
      directCurrentTargetWriteFound: false,
    });
  }

  const actionFifteen = deathActionDispatch.find(
    (mapping) => mapping.actionState === 0x0f,
  );
  if (actionFifteen?.destination !== "0x0043d289") {
    throw new Error("Action 15 no longer maps to the 0x0042de00 caller block");
  }
  const contextExclusionOwner = requireCanonicalAddressOwner(
    functions,
    0x004950f0,
    0x0049523b,
  );

  return {
    confirmedEntityRecordSites,
    scopedRootDirectWriteScan: scopedRootScan,
    livePathCallSite: "0x0043ccc8",
    healthZeroBypassTarget: "0x0043cccf",
    knownClearerDirectCallers: expectedCallers,
    clearerHelperTopology: helperTopology,
    actionFifteenClearerCallSite: "0x0043d292",
    actionFifteenDestination: actionFifteen.destination,
    contextFilteredRawDisplacementExclusion: {
      address: "0x0049523b",
      functionEntry: contextExclusionOwner.entry,
      containingBodyRange: contextExclusionOwner.containingBodyRange,
      reason:
        "DWORD [ESI+0x124] is among contiguous +0x120/+0x128/+0x134 fields in a different record layout, not the 0x558-byte entity current-target record.",
    },
    scopedDeathReleaseDirectWriteFound: false,
    limitation:
      "The five confirmed entity-record sites are not a whole-binary raw-displacement inventory. Exact scoped roots are scanned instruction-by-instruction for direct memory-destination writes; alias writes, unrelated commands, and other record layouts remain outside this proof.",
  };
}

function instructionDirectlyWritesCurrentTarget(text) {
  const match =
    /^(?:LOCK )?([A-Z][A-Z0-9]*) (?:byte|word|dword|qword) ptr \[[^\]]+ \+ 0x12(?:2|4)\](?:,|$)/.exec(
      text,
    );
  if (!match) return false;
  return (
    MEMORY_DESTINATION_MUTATING_MNEMONICS.has(match[1]) ||
    match[1].startsWith("MOV") ||
    /^SET[A-Z]+$/.test(match[1])
  );
}

function requireCanonicalAddressOwner(functions, entry, address) {
  const expectedEntry = toHex(entry);
  const summary = functions.functions?.find(
    (candidate) => candidate.entry === expectedEntry,
  );
  if (!summary) {
    throw new Error(
      `Function analysis is missing context-exclusion owner ${expectedEntry}`,
    );
  }
  const containingBodyRange = summary.bodyRanges?.find((range) => {
    const [start, end] = range.split("-").map((value) =>
      Number.parseInt(value.slice(2), 16),
    );
    return address >= start && address <= end;
  });
  if (!containingBodyRange) {
    throw new Error(
      `${toHex(address)} is outside canonical body ranges for ${expectedEntry}`,
    );
  }
  return {
    entry: expectedEntry,
    containingBodyRange,
  };
}

function createTestVectors() {
  const phaseBase = {
    phaseCadenceByte: 1,
    phaseCadenceCounterByte: 1,
    phaseCountWord: 8,
    repeatCounterWord: 0,
    repeatLimitWord: 0,
    flags84Word: 0x14,
  };
  return [
    {
      id: "signed-health-positive-one",
      result: evaluateHealthZeroDeathEntry({
        globalHealthGateWord: 0,
        healthWord: 1,
        actionState: 5,
        byte1f0: 1,
        phaseCadenceCounterByte: 0,
      }),
      expected: {
        entered: false,
        reason: "signed-health-positive",
        actionState: 5,
      },
    },
    {
      id: "signed-health-zero-enters-six",
      result: evaluateHealthZeroDeathEntry({
        globalHealthGateWord: 0,
        healthWord: 0,
        actionState: 5,
        byte1f0: 1,
        phaseCadenceCounterByte: 0,
      }),
      expected: {
        entered: true,
        reason: "eligible-signed-health-zero-or-negative",
        actionState: 6,
        phaseWord: 0,
        phaseCadenceCounterByte: 0,
      },
    },
    {
      id: "signed-health-minus-one-enters-six",
      result: evaluateHealthZeroDeathEntry({
        globalHealthGateWord: 0,
        healthWord: -1,
        actionState: 5,
        byte1f0: 1,
        phaseCadenceCounterByte: 1,
      }),
      expected: {
        entered: true,
        reason: "eligible-signed-health-zero-or-negative",
        actionState: 6,
        phaseWord: 0,
        phaseCadenceCounterByte: 1,
      },
    },
    ...[6, 7, 0x16].map((actionState) => ({
      id: `action-${actionState.toString(16)}-excluded`,
      result: evaluateHealthZeroDeathEntry({
        globalHealthGateWord: 0,
        healthWord: 0,
        actionState,
        byte1f0: 1,
        phaseCadenceCounterByte: 0,
      }),
      expected: {
        entered: false,
        reason: "death-action-excluded",
        actionState,
      },
    })),
    {
      id: "byte-1f0-gate-failure",
      result: evaluateHealthZeroDeathEntry({
        globalHealthGateWord: 0,
        healthWord: 0,
        actionState: 5,
        byte1f0: 0,
        phaseCadenceCounterByte: 0,
      }),
      expected: {
        entered: false,
        reason: "byte-0x1f0-not-one",
        actionState: 5,
        dispatcherReturn: 0,
      },
    },
    {
      id: "phase-before-last-advances-to-last",
      result: advanceActionStateSix({ ...phaseBase, phaseWord: 6 }),
      expected: {
        handlerReturn: 0,
        branch: "phase-advanced",
        visualStateByte: 7,
        visualDirtyByte: 1,
        phaseCadenceCounterByte: 0,
        phaseWord: 7,
        repeatCounterWord: 0,
      },
    },
    {
      id: "phase-equality-completes",
      result: advanceActionStateSix({ ...phaseBase, phaseWord: 7 }),
      expected: {
        handlerReturn: 1,
        branch: "raw-bit-four-completion",
        visualStateByte: 7,
        phaseCadenceCounterByte: 0,
        phaseWord: 7,
        repeatCounterWord: 0,
      },
    },
    {
      id: "phase-count-wrap-normalizes",
      result: advanceActionStateSix({ ...phaseBase, phaseWord: 8 }),
      expected: {
        handlerReturn: 0,
        branch: "phase-advanced",
        visualStateByte: 7,
        visualDirtyByte: 1,
        phaseCadenceCounterByte: 0,
        phaseWord: 1,
        repeatCounterWord: 0,
      },
    },
    {
      id: "runtime-bit-one-action-six-branch",
      result: advanceActionStateSix({
        ...phaseBase,
        flags84Word: 0x01,
        phaseWord: 4,
      }),
      expected: {
        handlerReturn: 1,
        branch: "raw-bit-one-branch",
        phaseCadenceCounterByte: 1,
        phaseWord: 4,
        repeatCounterWord: 0,
      },
    },
    {
      id: "repeat-counter-word-wrap-delays-completion",
      result: advanceActionStateSix({
        ...phaseBase,
        phaseWord: 7,
        repeatCounterWord: 32767,
        repeatLimitWord: 0,
        flags84Word: 0,
      }),
      expected: {
        handlerReturn: 0,
        branch: "repeat-counter-not-complete",
        visualStateByte: 7,
        phaseCadenceCounterByte: 0,
        phaseWord: 7,
        repeatCounterWord: -32768,
      },
    },
    {
      id: "cadence-byte-no-progress",
      result: advanceActionStateSix({
        ...phaseBase,
        phaseCadenceCounterByte: 0,
        phaseWord: 4,
      }),
      expected: {
        handlerReturn: 0,
        branch: "cadence-no-progress",
        phaseCadenceCounterByte: 1,
        phaseWord: 4,
        repeatCounterWord: 0,
      },
    },
    {
      id: "cadence-byte-signed-wrap-no-progress",
      result: advanceActionStateSix({
        ...phaseBase,
        phaseCadenceCounterByte: 127,
        phaseWord: 4,
      }),
      expected: {
        handlerReturn: 0,
        branch: "cadence-no-progress",
        phaseCadenceCounterByte: -128,
        phaseWord: 4,
        repeatCounterWord: 0,
      },
    },
    {
      id: "default-timeline-incoming-counter-zero",
      result: reproduceDefaultActionSixTimeline({
        initialCadenceCounterByte: 0,
      }),
      expected: {
        initialCadenceCounterByte: 0,
        firstVisualSevenWriteInvocation: 2,
        actionSixCompletionInvocation: 16,
        actionSevenProcessedInvocation: 17,
        retainedPhaseWord: 7,
        retainedCadenceCounterByte: 0,
      },
    },
    {
      id: "default-timeline-incoming-counter-one",
      result: reproduceDefaultActionSixTimeline({
        initialCadenceCounterByte: 1,
      }),
      expected: {
        initialCadenceCounterByte: 1,
        firstVisualSevenWriteInvocation: 1,
        actionSixCompletionInvocation: 15,
        actionSevenProcessedInvocation: 16,
        retainedPhaseWord: 7,
        retainedCadenceCounterByte: 0,
      },
    },
    {
      id: "class-flags-select-immediate-seven",
      result: selectPostActionSixState(0x14),
      expected: 7,
    },
    {
      id: "zero-flags-select-delayed-sixteen",
      result: selectPostActionSixState(0),
      expected: 0x16,
    },
    {
      id: "delay-below-boundary",
      result: advanceActionStateSixteen({
        counterWord: 99,
        limitWord: 100,
        flags74Dword: 0,
        visualStateByte: 7,
      }),
      expected: {
        actionState: 0x16,
        counterWord: 100,
        visualStateByte: 7,
        visualDirtyByte: 0,
        overflowPossible: false,
      },
    },
    {
      id: "delay-equality-enters-seven",
      result: advanceActionStateSixteen({
        counterWord: 100,
        limitWord: 100,
        flags74Dword: 0,
        visualStateByte: 7,
      }),
      expected: {
        actionState: 7,
        counterWord: 100,
        visualStateByte: 7,
        visualDirtyByte: 0,
        overflowPossible: false,
      },
    },
    {
      id: "delay-signed-low-extreme-increments-without-overflow",
      result: advanceActionStateSixteen({
        counterWord: -32768,
        limitWord: 32767,
        flags74Dword: 2,
        visualStateByte: 7,
      }),
      expected: {
        actionState: 0x16,
        counterWord: -32767,
        visualStateByte: 0x12,
        visualDirtyByte: 1,
        overflowPossible: false,
      },
    },
    {
      id: "delay-signed-high-extreme-transitions-without-increment",
      result: advanceActionStateSixteen({
        counterWord: 32767,
        limitWord: 32767,
        flags74Dword: 0,
        visualStateByte: 7,
      }),
      expected: {
        actionState: 7,
        counterWord: 32767,
        visualStateByte: 7,
        visualDirtyByte: 0,
        overflowPossible: false,
      },
    },
    {
      id: "health-zero-invalidates-stale-reference-before-release",
      result: evaluateOriginalReferenceValidity({
        slotTableWord: 1,
        healthWord: 0,
        byte1f0: 1,
        suppliedFullReference: 0x12340005,
        recordFullReference: 0x12340005,
        requireByte1f0: true,
        requireFullReference: true,
      }),
      expected: false,
    },
    {
      id: "k01-alive-check-health-zero-while-slot-active",
      result: evaluateOriginalReferenceValidity({
        slotTableWord: 1,
        healthWord: 0,
        byte1f0: 1,
        suppliedFullReference: 0x12340005,
        recordFullReference: 0x12340005,
        requireByte1f0: false,
        requireFullReference: true,
      }),
      expected: false,
    },
    {
      id: "generation-mismatch-after-reuse",
      result: evaluateOriginalReferenceValidity({
        slotTableWord: 1,
        healthWord: 100,
        byte1f0: 1,
        suppliedFullReference: 0x12340005,
        recordFullReference: 0x12350005,
        requireByte1f0: true,
        requireFullReference: true,
      }),
      expected: false,
    },
    {
      id: "active-release-boundary",
      result: evaluateStateSevenAndOuterRelease({
        flags74Dword: 0x00880805,
        slotTableWord: 1,
        activeListContainsSlot: true,
      }),
      expected: {
        stateSevenHelperReturn: 1,
        dispatcherReturn: 0,
        releaseCalled: true,
        activeAfter: false,
        slotTableWordAfter: 0,
        generationMutated: false,
      },
    },
    {
      id: "state-seven-runtime-retain-bit-skips-release",
      result: evaluateStateSevenAndOuterRelease({
        flags74Dword: 0x00000080,
        slotTableWord: 1,
        activeListContainsSlot: true,
      }),
      expected: {
        stateSevenHelperReturn: 1,
        dispatcherReturn: 1,
        releaseCalled: false,
        activeAfter: true,
        slotTableWordAfter: 1,
        generationMutated: false,
      },
    },
    {
      id: "already-inactive-slot-skips-release",
      result: evaluateStateSevenAndOuterRelease({
        flags74Dword: 0x00880805,
        slotTableWord: 0,
        activeListContainsSlot: true,
      }),
      expected: {
        stateSevenHelperReturn: 1,
        dispatcherReturn: 0,
        releaseCalled: false,
        activeAfter: true,
        slotTableWordAfter: 0,
        generationMutated: false,
      },
    },
    {
      id: "generation-word-wrap-on-later-create",
      result: incrementGenerationForCreate(0xffff),
      expected: 0,
    },
  ];
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
    if (
      pushes.length === 52 &&
      pushes[0].address === FUNCTION_ENTRIES.typeInitializer
    ) {
      pushes = pushes.slice(1);
    }
    if (pushes.length !== 51 || recordAddress === undefined) {
      throw new Error(
        `Cannot recover type writer arguments at ${instruction.address}`,
      );
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
    throw new Error(
      `Class ${call.internalClass} argument ${index} is unresolved`,
    );
  }
  return value;
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

function requireFunction(seeds, entry) {
  const report = seeds.functions?.find(
    (candidate) => candidate.entry === toHex(entry),
  );
  if (!report?.instructions || !report?.basicBlocks) {
    throw new Error(`Seed analysis is missing function ${toHex(entry)}`);
  }
  return report;
}

function summarizeFunction(report, functions) {
  const summary = functions.functions.find(
    (candidate) => candidate.entry === report.entry,
  );
  if (!summary) {
    throw new Error(`Function analysis is missing ${report.entry}`);
  }
  return {
    entry: report.entry,
    bodyRanges: report.bodyRanges,
    basicBlockCount: report.basicBlocks.length,
    instructionCount: report.instructions.length,
    instructionSha256: summary.instructionSha256,
    callers: summary.callers,
    callees: summary.callees,
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

function validateCodeAnchor(buffer, image, anchor) {
  const rawOffset = image.vaToRawOffset(anchor.va);
  if (rawOffset === undefined) {
    throw new RangeError(`${toHex(anchor.va)} is not file-backed`);
  }
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
    meaning: anchor.meaning,
    matched: true,
  };
}

function truncSignedRemainder(dividend, divisor) {
  const quotient = Math.trunc(dividend / divisor);
  return dividend - quotient * divisor;
}

function toS8(value) {
  return (value << 24) >> 24;
}

function toS16(value) {
  return (value << 16) >> 16;
}

function validateBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw new TypeError(`${label} must be boolean; got ${value}`);
  }
}

function validateS8(value, label) {
  validateIntegerRange(value, -0x80, 0x7f, label);
}

function validateS16(value, label) {
  validateIntegerRange(value, -0x8000, 0x7fff, label);
}

function validateU8(value, label) {
  validateIntegerRange(value, 0, 0xff, label);
}

function validateU16(value, label) {
  validateIntegerRange(value, 0, 0xffff, label);
}

function validateU32(value, label) {
  validateIntegerRange(value, 0, 0xffffffff, label);
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

function parseImmediate(text) {
  const negative = text.startsWith("-");
  const digits = negative ? text.slice(3) : text.slice(2);
  const value = Number.parseInt(digits, 16);
  return negative ? -value : value;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`);
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
    ["--input", "input"],
    ["--seeds", "seeds"],
    ["--functions", "functions"],
    ["--jump-tables", "jumpTables"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--json") {
      result.json = true;
      continue;
    }
    const key = options.get(argv[index]);
    if (!key) throw new Error(`Unknown argument: ${argv[index]}`);
    if (!argv[index + 1]) {
      throw new Error(`${argv[index]} requires a path`);
    }
    result[key] = argv[++index];
  }
  return result;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = parseArgs(process.argv.slice(2));
  const report = extractK01HeroDeathLifecycle({
    executablePath: args.input,
    seedsPath: args.seeds,
    functionsPath: args.functions,
    jumpTablesPath: args.jumpTables,
  });
  console.log(
    args.json
      ? JSON.stringify(report, null, 2)
      : [
          "K01 hero death lifecycle evidence:",
          `  functions: ${report.analyzedFunctions.length}`,
          `  call edges: ${report.callEdges.length}`,
          `  code anchors: ${report.codeAnchors.length}`,
          `  integration: ${report.integrationStatus}`,
        ].join("\n"),
  );
}
