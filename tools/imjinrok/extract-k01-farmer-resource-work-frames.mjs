#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { EXPECTED_EXECUTABLE_SHA256 } from "./extract-entity-type-catalog.mjs";
import { extractK01FarmerResourceBranchFrames } from "./extract-k01-farmer-resource-branch-frames.mjs";
import { readPeImage } from "./pe-image.mjs";
import { verifyEvidencePoint, verifyRawCodeRange } from "./static-evidence.mjs";

const DEFAULTS = {
  executablePath: "original/imjinrok2/imjinrok2.exe",
  functionsPath: "analysis/generated/imjinrok2/functions.json",
  jumpTablesPath: "analysis/generated/imjinrok2/jump-tables.json",
  referencesPath: "analysis/generated/imjinrok2/references.json",
  seedsPath: "analysis/generated/imjinrok2/seeds.json",
};

const FARMERS = {
  7: { originalGameplayName: "조선 농부", spriteSlot: 105, sourcePath: "char\\farmerk.spr", triples: { 10: [8, 105, 120], 11: [8, 105, 160], 16: [8, 105, 200] } },
  31: { originalGameplayName: "일본 농부", spriteSlot: 145, sourcePath: "char\\farmerj.spr", triples: { 10: [8, 145, 40], 11: [8, 145, 80], 16: [8, 145, 120] } },
};

const STATE_DISPATCH = { 10: "0x0041ecd0", 11: "0x0041edc0", 16: "0x0041d560" };
const NORMAL_DIRECTIONS = [
  { facing: "s", direction: 1, frameBaseIndex: 0, mirrorX: false },
  { facing: "sw", direction: 5, frameBaseIndex: 1, mirrorX: false },
  { facing: "w", direction: 4, frameBaseIndex: 2, mirrorX: false },
  { facing: "nw", direction: 20, frameBaseIndex: 3, mirrorX: false },
  { facing: "n", direction: 16, frameBaseIndex: 2, mirrorX: true },
  { facing: "ne", direction: 80, frameBaseIndex: 1, mirrorX: true },
  { facing: "e", direction: 64, frameBaseIndex: 0, mirrorX: true },
  { facing: "se", direction: 65, frameBaseIndex: 4, mirrorX: false },
];
const STATE_TEN_DIRECTIONS = NORMAL_DIRECTIONS.map((profile) => ({ ...profile, mirrorX: profile.direction === 65 ? true : profile.mirrorX }));

const FUNCTION_CONTRACTS = [
  ["0x0041d210", ["0x0041d210-0x0041d277", "0x0041d2c0-0x0041d41a", "0x0041e200-0x0041e2f5"], 177, "dbc2f289ae0aacdc6d7ef785d7d8290d1153742003a389889f5ac881563ca278"],
  ["0x0041ecd0", ["0x0041ecd0-0x0041ed35"], 24, "2adbec520a4939b6ccc4648d7a24e2dc2cbefcdd179107d1c7baf83f93420f91"],
  ["0x0041edc0", ["0x0041edc0-0x0041eefd"], 63, "c620fd9e9b690a5b8b2ad99d2343fc55f536b830058c553e2cb8c91e8f70ed03"],
  ["0x0041d560", ["0x0041d560-0x0041d67d"], 55, "65812b9202963d1f99be490511d370367d7315e9d49b312028236184fd8dad94"],
  ["0x004554c0", ["0x004554c0-0x00456298"], 1013, "df563c3474e63fc410c89355e867232a45f3b8d6e811aabe103d8a7419bc0139"],
  ["0x004245d0", ["0x004245d0-0x004245da"], 2, "c3aaed8aca7e35b0b2a2c47c73b4675a635c51ffeeb862f7f803556394fa1bd8"],
  ["0x004562d0", ["0x004562d0-0x00456560"], 189, "b419f888fd4d3f1f68bf246688e361e98ed4513f901438d54158ecced2559cc9"],
  ["0x004291d0", ["0x004291d0-0x0042c547"], 4156, "1c05959938219ae4fa918ba3061b1856dcfb575f007a1a48281dd316709a7e96"],
];

const RAW_CODE_RANGES = [
  ["state-dispatch-work-cases", 0x0041d210, 0x0041d278, "aba85d2be2e383d0559f4cd95b6f547432b24834cf0f561a873ad1591e830fd6"],
  ["state-10-consumer", 0x0041ecd0, 0x0041ed36, "f5f086535882a30855a492700828ef9cc466bfe15940e11cbae6edcc6a91cc3f"],
  ["state-11-consumer", 0x0041edc0, 0x0041eefe, "3a900e559c167491ba5fbfb6f0dc902acd378bba2d98fb0b08ff0fa404e64e28"],
  ["state-16-consumer", 0x0041d560, 0x0041d67e, "e340c86a325d79bd587282592665c8d027a18f12432c25f52fc5d7e468eb187c"],
  ["class-7-resource-work-triples", 0x0042981d, 0x00429881, "4402bbe09b662bf593efbec4670b0c7e8d6df03cc27f5991062c9dfd05b033ae"],
  ["class-31-resource-work-triples", 0x00429b90, 0x00429bfc, "08fcd163deadfde5a5d3922f082c9977ff9889950699b9c7ce10f18565393545"],
  ["resource-state-10-11-before-increment", 0x00456310, 0x004564e0, "b9e3b1bfb1b484c4fa09e1e4a7988d2b313e2f3b89a983215e7243266d4eac86"],
  ["resource-state-16-alternate-write", 0x00455920, 0x00455940, "1f950fbf419b9ecbc30954894cc37ed10736df3c49a6e55c3c255ae7d2b984d9"],
  ["resource-work-wrapper", 0x004245d0, 0x004245da, "680f89b9936290814862c573e6c94e6dbab2b76248910c1a16074080f27203c3"],
  ["resource-work-action-dispatch", 0x004554c0, 0x004554f3, "f5d5757538d41f8b8bbe1d838ec8676b6fccc294ab666f32ceef75ab65e241e7"],
  ["resource-work-state-16-fast-start-gates", 0x00455882, 0x004558ed, "616d86edfdaa04073e1df4beb0780d5af9156d242e5e04a2108aea9c1a8c6a12"],
  ["resource-work-state-16-cadence", 0x004558ed, 0x004559ef, "c5abd2ced08d6d7ad0f380856b7490bfdc08f137c8d06e7320e380792621ea68"],
].map(([id, start, endExclusive, sha256]) => ({ id, start, endExclusive, sha256 }));

const EVIDENCE_POINTS = [
  [0x0041d23f, "e9 8c 1a 00 00", "dispatcher state 10 jumps to 0x0041ecd0"],
  [0x0041d244, "e9 77 1b 00 00", "dispatcher state 11 jumps to 0x0041edc0"],
  [0x0041d25d, "e9 fe 02 00 00", "dispatcher state 16 jumps to 0x0041d560"],
  [0x0041ed18, "66 8b 91 84 04 00 00", "state 10 reads frame start entity +0x484"],
  [0x0041ed1f, "66 8b 81 82 04 00 00", "state 10 reads sprite slot entity +0x482"],
  [0x0041ed26, "66 03 91 b2 01 00 00", "state 10 adds phase entity +0x1b2"],
  [0x0041ee1e, "66 8b 91 80 04 00 00", "state 11 reads stride entity +0x480"],
  [0x0041ee25, "66 8b 81 88 04 00 00", "state 11 reads sprite slot entity +0x488"],
  [0x0041ee30, "66 03 91 8a 04 00 00", "state 11 adds frame start entity +0x48a"],
  [0x0041d59e, "66 8b 91 8c 04 00 00", "state 16 reads stride entity +0x48c"],
  [0x0041d5a5, "66 8b 81 8e 04 00 00", "state 16 reads sprite slot entity +0x48e"],
  [0x0041d5b0, "66 03 91 90 04 00 00", "state 16 adds frame start entity +0x490"],
  [0x0042983b, "66 89 9e 80 04 00 00", "class 7 writes state-10 stride 8"],
  [0x00429842, "66 89 be 82 04 00 00", "class 7 writes state-10 slot 105"],
  [0x00429849, "66 c7 86 84 04 00 00 78 00", "class 7 writes state-10 start 120"],
  [0x00429860, "66 c7 86 8a 04 00 00 a0 00", "class 7 writes state-11 start 160"],
  [0x00429877, "66 c7 86 90 04 00 00 c8 00", "class 7 writes state-16 start 200"],
  [0x00429bae, "66 89 9e 80 04 00 00", "class 31 writes state-10 stride 8"],
  [0x00429bb5, "66 89 be 82 04 00 00", "class 31 writes state-10 slot 145"],
  [0x00429bbc, "66 c7 86 84 04 00 00 28 00", "class 31 writes state-10 start 40"],
  [0x00429bd3, "66 c7 86 8a 04 00 00 50 00", "class 31 writes state-11 start 80"],
  [0x00429bea, "66 c7 86 90 04 00 00 78 00", "class 31 writes state-16 start 120"],
  [0x00456329, "c6 04 c5 5b 52 63 00 0a", "selector 1/2 branches write visual state 10"],
  [0x0045633c, "c6 04 d5 5b 52 63 00 0b", "selector 3 branch writes visual state 11"],
  [0x00455937, "c6 04 c5 5b 52 63 00 10", "alternate resource routine path writes visual state 16"],
  [0x004245d0, "81 c1 5c 04 00 00 e9 e5 0e 03 00", "wrapper adds entity +0x45c to ECX then tail-jumps to FUN_004554c0"],
  [0x004554dd, "8b 81 e0 52 63 00 48 3b c7 0f 87 a0 0d 00 00", "dispatcher reads entity DWORD +0x88, subtracts one, and admits only 0..9 table indices"],
  [0x00455882, "66 83 7e 1c 03", "state-16 fast-start requires subrecord WORD +0x1c equal to 3"],
  [0x0045588f, "66 83 7e 30 00", "state-16 fast-start requires subrecord WORD +0x30 nonzero"],
  [0x00455896, "66 83 b9 0a 54 63 00 00", "state-16 fast-start requires entity WORD +0x1b2 equal to zero"],
  [0x004558a0, "8b 46 0c 2b c7 99 33 c2 2b c2 3d 2c 01 00 00 7e 31", "state-16 fast-start uses the x86 signed-absolute DWORD idiom and signed-greater-than 300; INT32_MIN remains negative"],
  [0x004558b1, "66 8b 81 3e 54 63 00 66 3d 01 00 74 12 66 3d 04 00 74 0c 66 3d 10 00 74 06 66 3d 40 00 75 12", "state-16 fast-start admits raw entity WORD +0x1e6 values 1, 4, 16, or 64"],
  [0x004558d0, "a1 90 5f 7c 00 33 d2 bb 0a 00 00 00 f7 f3 85 d2 74 0b", "state-16 fast-start requires unsigned global DWORD 0x007c5f90 modulo 10 equal to zero"],
  [0x004558e2, "66 83 7e 08 01 0f 85 02 01 00 00", "failed fast-start gates continue only with subrecord WORD +0x08 equal to one; otherwise they enter 0x004559ef"],
  [0x004558ed, "89 7e 0c 66 c7 46 08 01 00 fe 81 c7 52 63 00", "cadence path writes current tick at subrecord +0x0c, latches +0x08 to one, and increments entity BYTE +0x6f"],
  [0x0045590b, "0f be 90 c6 52 63 00 0f be 88 c7 52 63 00 83 c2 02 3b ca", "cadence threshold compares signed entity BYTE +0x6f against signed entity BYTE +0x6e plus two"],
  [0x00455924, "c6 80 c7 52 63 00 00", "cadence threshold resets entity BYTE +0x6f before the state-16 write"],
  [0x0045594b, "66 ff 04 c5 0a 54 63 00", "state-16 cadence increments entity WORD +0x1b2"],
  [0x00455953, "0f bf 06 0f bf 7e 30", "state-16 cadence treats entity +0x1b2 and subrecord +0x30 as signed WORD operands"],
  [0x0045596c, "f7 ff", "state-16 cadence uses signed IDIV by subrecord WORD +0x30"],
  [0x00455976, "0f bf 06 8d 0c c0 8d 04 48 8d 04 c0 c1 e0 03 66 8b 90 0a 54 63 00 66 89 90 8c 52 63 00", "state-16 cadence copies the signed-remainder WORD from entity +0x1b2 to entity +0x34"],
  [0x0045599f, "c6 04 d5 5c 52 63 00 01", "state-16 cadence writes entity BYTE +0x04 to one"],
  [0x004559b3, "c6 04 d5 49 54 63 00 01", "state-16 cadence writes entity BYTE +0x1f1 to one"],
  [0x004559dc, "66 c7 46 08 00 00", "state-16 cadence clears subrecord WORD +0x08 on terminal phase"],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

const REQUIRED_CALL_EDGES = [
  ["0x0041d23f", "0x0041d210", "0x0041ecd0"], ["0x0041d244", "0x0041d210", "0x0041edc0"], ["0x0041d25d", "0x0041d210", "0x0041d560"],
  ["0x0045650c", "0x004562d0", "0x00428e10"], ["0x00456524", "0x004562d0", "0x00428fb0"],
  ["0x004245d6", "0x004245d0", "0x004554c0"],
];

export function extractK01FarmerResourceWorkFrames(options = {}) {
  const paths = { ...DEFAULTS, ...options };
  const prior = extractK01FarmerResourceBranchFrames(options);
  const { buffer, image } = readPeImage(paths.executablePath);
  const functions = readArtifact(paths.functionsPath, "functions");
  const jumpTables = readArtifact(paths.jumpTablesPath, "jump tables");
  const references = readArtifact(paths.referencesPath, "references");
  const seeds = readArtifact(paths.seedsPath, "seeds");
  const functionEvidence = FUNCTION_CONTRACTS.map(([entry, bodyRanges, instructionCount, instructionSha256]) => verifyFunction(functions, { entry, bodyRanges, instructionCount, instructionSha256 }));
  const rawCodeRanges = RAW_CODE_RANGES.map((range) => verifyRawCodeRange(buffer, image, range));
  const evidencePoints = EVIDENCE_POINTS.map((point) => verifyEvidencePoint(buffer, image, point));
  const callEdges = REQUIRED_CALL_EDGES.map(([from, fromFunctionEntry, to]) => verifyCallEdge(references, { from, fromFunctionEntry, to }));
  const resourceWorkActionDispatch = verifyResourceWorkActionDispatch(jumpTables);
  const seedsEvidence = verifyDispatcherSeeds(seeds);
  const states = Object.fromEntries(Object.entries(FARMERS).map(([internalClass, farmer]) => [internalClass, Object.fromEntries([10, 11, 16].map((state) => [state, buildState(farmer, state)]))]));
  const testVectors = Object.keys(FARMERS).flatMap((internalClass) =>
    [10, 11, 16].flatMap((state) =>
      directionProfile(state).flatMap(({ direction }) =>
        [0, 7].map((phase) => selectK01FarmerResourceWorkFrame({ internalClass: Number(internalClass), state, direction, phase })),
      ),
    ),
  );
  return {
    schemaVersion: 1,
    question: "K01 class 7/31에서 original visual state 10/11/16이 어떤 resource-work slot/frame/direction/mirror를 선택하며 resource flow는 어떤 raw visual state를 쓰는가?",
    analysisStatus: "static-confirmed", reproductionStatus: "reproduction-complete", implementationStatus: "pending-project-adapter",
    sources: { executable: { path: paths.executablePath, sha256: EXPECTED_EXECUTABLE_SHA256 }, functions: sourceRecord(paths.functionsPath, functions), jumpTables: sourceRecord(paths.jumpTablesPath, jumpTables), references: sourceRecord(paths.referencesPath, references), seeds: sourceRecord(paths.seedsPath, seeds), farmerResourceBranch: prior.sources },
    identities: prior.identities, stateDispatch: STATE_DISPATCH, states, directions: { state10: STATE_TEN_DIRECTIONS, state11And16: NORMAL_DIRECTIONS },
    resourceVisualStateWrites: { functionEntry: "0x004562d0", selectorCases: { 1: 10, 2: 10, 3: 11 }, alternateRoutine: { functionEntry: "0x004554c0", writeVa: "0x00455937", state: 16 }, uncertainty: "selector human-readable resource names, raw visual state 16 human meaning, and the full resource lifecycle remain unconfirmed." },
    resourceWorkActionDispatch,
    resourceWorkCadenceContract: resourceWorkCadenceContract(),
    functionEvidence, rawCodeRanges, evidencePoints, callEdges, seedsEvidence, testVectors,
    acceptedInputScope: "K01 classes 7/31; original visual states 10, 11, 16; recovered raw directions; frame phase 0..7; and raw action substate 8 state-16 cadence replay with the documented fixed-width numeric inputs.",
    unresolvedScope: "Human-readable action names for states 10/11/16 (including build/repair), selector resource names, raw visual state 16 human meaning, timing/FPS, pivot, stats, behavior, complete resource lifecycle, and any product adapter remain unconfirmed or pending.",
  };
}

export function replayK01FarmerResourceWorkCadence({ rawActionSubstate, subrecord, entity, globals }) {
  unsignedDword(rawActionSubstate, "rawActionSubstate");
  if (rawActionSubstate !== 8) throw new RangeError("rawActionSubstate must equal scoped dispatcher value 8");
  unsignedWord(subrecord.selectorWord, "subrecord.selectorWord");
  signedWord(subrecord.periodWord, "subrecord.periodWord");
  unsignedWord(subrecord.cadenceLatchWord, "subrecord.cadenceLatchWord");
  unsignedDword(subrecord.lastTickDword, "subrecord.lastTickDword");
  unsignedWord(entity.phaseWord, "entity.phaseWord");
  unsignedByte(entity.cadenceLimitByte, "entity.cadenceLimitByte");
  unsignedByte(entity.cadenceCounterByte, "entity.cadenceCounterByte");
  unsignedWord(entity.directionWord, "entity.directionWord");
  unsignedDword(globals.tickDword, "globals.tickDword");
  unsignedDword(globals.moduloDword, "globals.moduloDword");
  const elapsedSignedAbsIdiomResult = signedAbsoluteDwordDifference(subrecord.lastTickDword, globals.tickDword);
  const fastStart = subrecord.selectorWord === 3
    && subrecord.periodWord !== 0
    && entity.phaseWord === 0
    && elapsedSignedAbsIdiomResult > 300
    && [1, 4, 16, 64].includes(entity.directionWord)
    && globals.moduloDword % 10 === 0;
  if (!fastStart && subrecord.cadenceLatchWord !== 1) return regularResourceWorkResult("fast-start-gate-or-latch", subrecord, entity, elapsedSignedAbsIdiomResult);

  const cadenceCounterByte = (entity.cadenceCounterByte + 1) & 0xff;
  const result = {
    route: "state-16-cadence",
    fastStart,
    elapsedSignedAbsIdiomResult,
    subrecord: { ...subrecord, lastTickDword: globals.tickDword, cadenceLatchWord: 1 },
    entity: { ...entity, cadenceCounterByte },
  };
  if (signedByte(cadenceCounterByte) < signedByte(entity.cadenceLimitByte) + 2) return { ...result, cadenceThresholdReached: false, terminalReturn: null };

  if (subrecord.periodWord === 0) throw new RangeError("subrecord.periodWord zero reaches original signed division");
  const incrementedPhaseWord = (entity.phaseWord + 1) & 0xffff;
  const phaseRemainder = signedWordRemainder(incrementedPhaseWord, subrecord.periodWord);
  const phaseWord = phaseRemainder & 0xffff;
  const terminal = phaseRemainder === subrecord.periodWord - 1;
  return {
    ...result,
    cadenceThresholdReached: true,
    terminalReturn: terminal ? 1 : null,
    subrecord: { ...result.subrecord, cadenceLatchWord: terminal ? 0 : 1 },
    entity: {
      ...result.entity,
      cadenceCounterByte: 0,
      visualStateByte: 16,
      phaseWord,
      phaseSignedWord: phaseRemainder,
      phaseCopyWord: phaseWord,
      flag04Byte: 1,
      flag1f1Byte: 1,
    },
  };
}

export function selectK01FarmerResourceWorkFrame({ internalClass, state, direction, phase }) {
  const farmer = FARMERS[internalClass];
  if (!farmer) throw new RangeError("internalClass is outside scoped set 7,31");
  if (![10, 11, 16].includes(state)) throw new RangeError("state is outside scoped set 10,11,16");
  if (!Number.isInteger(phase) || phase < 0 || phase > 7) throw new RangeError("phase is outside recovered 0..7");
  const profile = directionProfile(state).find((candidate) => candidate.direction === direction);
  if (!profile) throw new RangeError("direction is outside recovered normal grid set");
  const [phaseCount, spriteSlot, frameStart] = farmer.triples[state];
  const frameIndex = state === 10 ? frameStart + phase : frameStart + profile.frameBaseIndex * phaseCount + phase;
  return { internalClass, state, stateName: `resource-work-${state}`, direction, facing: profile.facing, phase, spriteSlot, sourcePath: farmer.sourcePath, frameIndex, mirrorX: profile.mirrorX };
}

function resourceWorkCadenceContract() {
  return {
    wrapper: { functionEntry: "0x004245d0", entityToSubrecordOffset: "+0x45c", tailJumpTarget: "0x004554c0" },
    dispatcher: { functionEntry: "0x004554c0", rawActionSubstateField: "entity DWORD +0x88", transform: "unsigned DWORD value minus one; admitted jump-table index 0..9", scopedRawActionSubstate: 8, jumpTableSwitchAddress: "0x004554ec", scopedDestination: "0x00455882" },
    fastStart: {
      selector: "subrecord WORD +0x1c == 3",
      period: "subrecord signed WORD +0x30 != 0",
      phase: "entity WORD +0x1b2 == 0",
      elapsed: "x86 signed-absolute DWORD idiom result for subrecord +0x0c - global DWORD 0x007c5f80 is signed-greater-than 300; INT32_MIN remains negative and fails",
      direction: "entity WORD +0x1e6 is one of 1,4,16,64",
      modulo: "unsigned global DWORD 0x007c5f90 % 10 == 0",
      failedGateContinuation: "subrecord WORD +0x08 == 1 continues at 0x004558ed; otherwise enters 0x004559ef",
    },
    cadence: {
      entry: "0x004558ed",
      writes: ["subrecord DWORD +0x0c = global DWORD 0x007c5f80", "subrecord WORD +0x08 = 1", "entity BYTE +0x6f increments modulo 256"],
      threshold: "signed BYTE entity +0x6f >= signed BYTE entity +0x6e + 2",
      thresholdWrites: ["entity BYTE +0x6f = 0", "entity BYTE +0x03 = 16", "entity WORD +0x1b2 = signed remainder after increment / signed subrecord WORD +0x30", "entity WORD +0x34 copies entity +0x1b2", "entity BYTE +0x04 = 1", "entity BYTE +0x1f1 = 1"],
      terminal: "when signed remainder equals signed period minus one, subrecord WORD +0x08 = 0 and this branch returns 1",
    },
    acceptedNumericScope: "rawActionSubstate, ticks, and modulo source are unsigned DWORD; selector/latch/direction/phase storage are unsigned WORD; period is a signed WORD; cadence limit/counter storage are unsigned BYTE with signed-BYTE threshold views. The signed-absolute DWORD idiom leaves INT32_MIN negative, so that overflow value fails the signed > 300 gate. Replay accepts all fixed-width inputs, but zero period is only accepted on routes that do not reach the original IDIV instruction.",
  };
}

function regularResourceWorkResult(reason, subrecord, entity, elapsedSignedAbsIdiomResult = null) {
  return {
    route: "regular-routine",
    regularRoutineEntry: "0x004559ef",
    reason,
    elapsedSignedAbsIdiomResult,
    cadenceThresholdReached: false,
    terminalReturn: null,
    subrecord: { ...subrecord },
    entity: { ...entity },
  };
}

function buildState(farmer, state) {
  const [phaseCount, spriteSlot, frameStart] = farmer.triples[state];
  return { originalAnimationState: state, phaseCount, spriteSlot, frameStart, frameStride: state === 10 ? 0 : phaseCount, directionProfile: state === 10 ? "state-10" : "normal", directions: directionProfile(state).map((profile) => ({ ...profile, frameRange: frameRange(state, frameStart, phaseCount, profile) })) };
}
function frameRange(state, frameStart, phaseCount, profile) { const first = state === 10 ? frameStart : frameStart + profile.frameBaseIndex * phaseCount; return [first, first + phaseCount - 1]; }
function directionProfile(state) { return state === 10 ? STATE_TEN_DIRECTIONS : NORMAL_DIRECTIONS; }
function readArtifact(path, label) { const artifact = JSON.parse(readFileSync(path, "utf8")); equal(artifact.sourceSha256, EXPECTED_EXECUTABLE_SHA256, `${label} source SHA-256`); return artifact; }
function sourceRecord(path, artifact) { return { path, sourceSha256: artifact.sourceSha256 }; }
function verifyFunction(artifact, expected) { const actual = artifact.functions?.find((candidate) => candidate.entry === expected.entry); if (!actual) throw new Error(`functions artifact is missing ${expected.entry}`); equal(JSON.stringify(actual.bodyRanges), JSON.stringify(expected.bodyRanges), `${expected.entry} body ranges`); equal(actual.instructionCount, expected.instructionCount, `${expected.entry} instruction count`); equal(actual.instructionSha256, expected.instructionSha256, `${expected.entry} instruction SHA-256`); return expected; }
function verifyCallEdge(artifact, expected) { const actual = artifact.references?.find((candidate) => candidate.from === expected.from && candidate.to === expected.to); if (!actual) throw new Error(`references artifact is missing call edge ${expected.from} -> ${expected.to}`); equal(actual.fromFunctionEntry, expected.fromFunctionEntry, `call edge ${expected.from} function entry`); equal(actual.type, "UNCONDITIONAL_CALL", `call edge ${expected.from} type`); return expected; }
function verifyDispatcherSeeds(seeds) { const fn = seeds.functions?.find((candidate) => candidate.entry === "0x0041d210"); if (!fn) throw new Error("seeds artifact is missing state dispatcher"); const checks = [["0x0041d23f", "JMP 0x0041ecd0"], ["0x0041d244", "JMP 0x0041edc0"], ["0x0041d25d", "JMP 0x0041d560"]]; for (const [address, text] of checks) equal(fn.instructions.find((instruction) => instruction.address === address)?.text, text, `seed instruction ${address}`); return { functionEntry: "0x0041d210", checks: checks.map(([address, text]) => ({ address, text })) }; }
function verifyResourceWorkActionDispatch(jumpTables) {
  const table = Object.values(jumpTables.tables ?? {}).find((candidate) => candidate.switchAddress === "0x004554ec");
  if (!table) throw new Error("jump-table artifact is missing resource-work action switch 0x004554ec");
  equal(table.functionEntry, "0x004554c0", "resource-work action switch function entry");
  const scopedCase = table.cases?.find((candidate) => candidate.label === 7);
  if (!scopedCase) throw new Error("jump-table artifact is missing resource-work action case 7");
  equal(scopedCase.destination, "0x00455882", "resource-work action case 7 destination");
  return { functionEntry: table.functionEntry, switchAddress: table.switchAddress, rawActionSubstate: 8, jumpTableLabel: 7, destination: scopedCase.destination };
}
function equal(actual, expected, label) { if (actual !== expected) throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`); }
function unsignedByte(value, label) { if (!Number.isInteger(value) || value < 0 || value > 0xff) throw new RangeError(`${label} must be an unsigned BYTE`); }
function unsignedWord(value, label) { if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new RangeError(`${label} must be an unsigned WORD`); }
function signedWord(value, label) { if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) throw new RangeError(`${label} must be a signed WORD`); }
function unsignedDword(value, label) { if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError(`${label} must be an unsigned DWORD`); }
function signedByte(value) { return value >= 0x80 ? value - 0x100 : value; }
function signedWordView(value) { return value >= 0x8000 ? value - 0x10000 : value; }
function signedDwordView(value) { return value >= 0x80000000 ? value - 0x100000000 : value; }
function signedAbsoluteDwordDifference(left, right) { const difference = signedDwordView((left - right) >>> 0); return difference === -0x80000000 ? difference : Math.abs(difference); }
function signedWordRemainder(dividendWord, divisor) { return signedWordView(dividendWord) % divisor; }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = extractK01FarmerResourceWorkFrames();
  if (process.argv.includes("--json")) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(`K01 farmer resource-work frames: ${report.testVectors.length} vectors\n`);
}
