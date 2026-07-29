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
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

const REQUIRED_CALL_EDGES = [
  ["0x0041d23f", "0x0041d210", "0x0041ecd0"], ["0x0041d244", "0x0041d210", "0x0041edc0"], ["0x0041d25d", "0x0041d210", "0x0041d560"],
  ["0x0045650c", "0x004562d0", "0x00428e10"], ["0x00456524", "0x004562d0", "0x00428fb0"],
];

export function extractK01FarmerResourceWorkFrames(options = {}) {
  const paths = { ...DEFAULTS, ...options };
  const prior = extractK01FarmerResourceBranchFrames(options);
  const { buffer, image } = readPeImage(paths.executablePath);
  const functions = readArtifact(paths.functionsPath, "functions");
  const references = readArtifact(paths.referencesPath, "references");
  const seeds = readArtifact(paths.seedsPath, "seeds");
  const functionEvidence = FUNCTION_CONTRACTS.map(([entry, bodyRanges, instructionCount, instructionSha256]) => verifyFunction(functions, { entry, bodyRanges, instructionCount, instructionSha256 }));
  const rawCodeRanges = RAW_CODE_RANGES.map((range) => verifyRawCodeRange(buffer, image, range));
  const evidencePoints = EVIDENCE_POINTS.map((point) => verifyEvidencePoint(buffer, image, point));
  const callEdges = REQUIRED_CALL_EDGES.map(([from, fromFunctionEntry, to]) => verifyCallEdge(references, { from, fromFunctionEntry, to }));
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
    sources: { executable: { path: paths.executablePath, sha256: EXPECTED_EXECUTABLE_SHA256 }, functions: sourceRecord(paths.functionsPath, functions), references: sourceRecord(paths.referencesPath, references), seeds: sourceRecord(paths.seedsPath, seeds), farmerResourceBranch: prior.sources },
    identities: prior.identities, stateDispatch: STATE_DISPATCH, states, directions: { state10: STATE_TEN_DIRECTIONS, state11And16: NORMAL_DIRECTIONS },
    resourceVisualStateWrites: { functionEntry: "0x004562d0", selectorCases: { 1: 10, 2: 10, 3: 11 }, alternateRoutine: { functionEntry: "0x004554c0", writeVa: "0x00455937", state: 16 }, uncertainty: "selector human-readable resource names and the internal condition that reaches the state-16 write remain unconfirmed." },
    functionEvidence, rawCodeRanges, evidencePoints, callEdges, seedsEvidence, testVectors,
    acceptedInputScope: "K01 classes 7/31; original visual states 10, 11, 16; recovered raw directions; phase 0..7.",
    unresolvedScope: "Human-readable action names for states 10/11/16 (including build/repair), selector resource names, state-16 internal condition, timing/FPS, pivot, stats, behavior, complete resource lifecycle, and any product adapter remain unconfirmed or pending.",
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
function equal(actual, expected, label) { if (actual !== expected) throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = extractK01FarmerResourceWorkFrames();
  if (process.argv.includes("--json")) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(`K01 farmer resource-work frames: ${report.testVectors.length} vectors\n`);
}
