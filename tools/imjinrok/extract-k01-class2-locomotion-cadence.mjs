#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { EXPECTED_EXECUTABLE_SHA256 } from "./extract-entity-type-catalog.mjs";
import { readPeImage, toHex } from "./pe-image.mjs";
import { assertEqual, readJson, verifyEvidencePoint, verifyRawCodeRange, verifySeededFunction } from "./static-evidence.mjs";

const DEFAULTS = {
  executablePath: "original/imjinrok2/imjinrok2.exe",
  spritePath: "original/imjinrok2/char/swordk.spr",
  seedsPath: "analysis/generated/imjinrok2/seeds.json",
};

const EXPECTED_SWORDK_SHA256 =
  "414d285b207ba12afdd856a0f16ddde615381cf491fe493d6ededf91681b55eb";
const TYPE_TABLE_BASE = 0x00882e10;
const TYPE_RECORD_STRIDE = 0x014c;
const CLASS_2 = 2;
const CLASS_2_TYPE_RECORD = TYPE_TABLE_BASE + TYPE_RECORD_STRIDE * CLASS_2;
const TYPE_WRITER = 0x0045bd00;
const TYPE_INITIALIZER = 0x0045bf50;
const NORMAL_MOVEMENT = 0x00425b20;
const TYPE_ARGUMENT_COUNT = 51;

const SEEDED_FUNCTIONS = [
  {
    entry: "0x0045bd00",
    bodyRange: "0x0045bd00-0x0045bef8",
    blockCount: 1,
    instructionCount: 103,
    bodySha256: "509503dff8e20541fc50bda41de8292633761c372011b8bdcf43e95c0553809e",
  },
  {
    entry: "0x0045bf50",
    bodyRange: "0x0045bf50-0x0045efb9",
    blockCount: 1,
    instructionCount: 5100,
    bodySha256: "dd9fb78ef95091369b138c654a1f157a9425a778ce92d226aa975b73a90ff93b",
  },
  {
    entry: "0x00437650",
    bodyRange: "0x00437650-0x00438025",
    blockCount: 39,
    instructionCount: 539,
    bodySha256: "16282bd634d28738d1f1e5eba179069f154537c1c86ce7fbcf57aa1f54bd5fd6",
  },
  {
    entry: "0x00425b20",
    bodyRange: "0x00425b20-0x004262df",
    blockCount: 98,
    instructionCount: 506,
    bodySha256: "a93987a8afa19da86d5c0fa478b0d902c2898970fda86a64229d2bca45e75d0f",
  },
];

const RAW_CODE_RANGES = [
  ["class-2-type-call", 0x0045bfc4, 0x0045c044, "bad7813f456cc029d731a5a9c473cd945c244865f1bc6908def4b7bc5e77a822"],
  ["class-2-state-1-2-initializer", 0x00429f48, 0x00429f87, "0427fd57986265ff49c02eee298c44300697038074255894cc76ea68922580c6"],
  ["entity-initializer-locomotion-fields", 0x00437b0b, 0x00437b28, "f9bf5845331c2a857a621364a40d7f6ada5dcf80942fcd5ed5fba56475c2fe2f"],
  ["entity-initializer-type-copies", 0x00437dd4, 0x00437e1b, "4f061e8bb8546a972cfdb54c78e9f50bc89d5a6f54085b84fca72a3e88ac6cd0"],
  ["normal-move-pre-displacement-cadence", 0x00425c9f, 0x00425d22, "3893c381212c78cc6964ff673a2435eb75f2b4700286ee5f5696608c85c7a1ac"],
  ["normal-move-raw-accumulator-input", 0x00425f03, 0x00425f5c, "8afb18ee5c0e7a2c3b0bee1c8a9509d63a8d0aee79bd6cde35895255d210f8b6"],
  ["normal-move-post-displacement-cadence", 0x004261e3, 0x0042626a, "3c3dab83a89cdd85ef8b2010ce70d5f6e7468f5947afb30e3990e7c20a7a66b9"],
].map(([id, start, endExclusive, sha256]) => ({ id, start, endExclusive, sha256 }));

const EVIDENCE_POINTS = [
  [0x0045be0c, "66 89 51 3c", "type writer stores argument 30 in type-record WORD +0x3c"],
  [0x0045be74, "89 41 50", "type writer stores argument 38 in type-record DWORD +0x50"],
  [0x00429f63, "53 6a 00 6a 64 8b ce 88 9e a6 00 00 00 e8 7b ef 00 00", "class 2 initializes state 1 with phase count 8"],
  [0x00429f75, "53 6a 58 6a 64 8b ce 88 9e bb 00 00 00 e8 e9 ef 00 00", "class 2 initializes state 2 with phase count 8"],
  [0x00437b0b, "66 89 9e ec 04 00 00", "entity initializer clears WORD +0x4ec"],
  [0x00437b12, "66 89 9e f2 04 00 00", "entity initializer clears WORD +0x4f2"],
  [0x00437b20, "66 89 9e ee 04 00 00", "entity initializer clears WORD +0x4ee before type data is copied"],
  [0x00437dd4, "66 8b 0c 85 50 2e 88 00", "entity initializer reads type-record WORD +0x50"],
  [0x00437dde, "66 89 8e ea 04 00 00", "entity initializer copies type-record WORD +0x50 to entity WORD +0x4ea"],
  [0x00437e0b, "66 8b 90 3c 2e 88 00", "entity initializer reads type-record WORD +0x3c"],
  [0x00437e14, "66 89 96 ee 04 00 00", "entity initializer copies type-record WORD +0x3c to entity WORD +0x4ee"],
  [0x00425cb4, "66 ff 86 ec 04 00 00", "pre-displacement cadence increments entity WORD +0x4ec"],
  [0x00425cc2, "66 3b 8e ea 04 00 00", "pre-displacement cadence compares +0x4ec against +0x4ea with signed JL"],
  [0x00425cc9, "c6 46 03 02", "alternate movement cadence writes animation state 2"],
  [0x00425cf8, "c6 46 03 01", "normal movement cadence writes animation state 1"],
  [0x00425d10, "99 f7 f9", "pre-displacement phase update uses signed CDQ/IDIV"],
  [0x00425d17, "66 89 96 b2 01 00 00", "pre-displacement phase update writes WORD +0x1b2"],
  [0x00425f09, "66 8b 8e ee 04 00 00", "movement accumulator path reads entity WORD +0x4ee"],
  [0x00425f30, "66 8b 86 f2 04 00 00", "movement accumulator path reads entity WORD +0x4f2"],
  [0x00425f55, "66 89 86 f2 04 00 00", "movement accumulator path writes entity WORD +0x4f2"],
  [0x004261ec, "66 ff 86 ec 04 00 00", "post-displacement cadence increments entity WORD +0x4ec"],
  [0x004261fa, "66 3b 86 ea 04 00 00", "post-displacement cadence compares +0x4ec against +0x4ea with signed JL"],
  [0x00426201, "c6 46 03 02", "post-displacement alternate cadence writes animation state 2"],
  [0x00426238, "c6 46 03 01", "post-displacement normal cadence writes animation state 1"],
  [0x00426258, "99 f7 f9", "post-displacement phase update uses signed CDQ/IDIV"],
  [0x0042625f, "66 89 96 b2 01 00 00", "post-displacement phase update writes WORD +0x1b2"],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

export function extractK01Class2LocomotionCadence(options = {}) {
  const paths = { ...DEFAULTS, ...options };
  const { buffer, image } = readPeImage(paths.executablePath);
  const executableSha256 = sha256(buffer);
  assertEqual(executableSha256, EXPECTED_EXECUTABLE_SHA256, "original EXE SHA-256");
  const spriteSha256 = sha256(readFileSync(paths.spritePath));
  assertEqual(spriteSha256, EXPECTED_SWORDK_SHA256, "class 2 swordk.spr SHA-256");
  const seeds = readJson(paths.seedsPath);
  assertEqual(seeds.sourceSha256, executableSha256, "seed analysis source SHA-256");

  const functionEvidence = SEEDED_FUNCTIONS.map((expected) =>
    verifySeededFunction(buffer, image, seeds, expected),
  );
  const rawCodeRanges = RAW_CODE_RANGES.map((range) =>
    verifyRawCodeRange(buffer, image, range),
  );
  const evidencePoints = EVIDENCE_POINTS.map((point) =>
    verifyEvidencePoint(buffer, image, point),
  );
  const class2 = extractClass2TypeFields(seeds.functions);

  return {
    schemaVersion: 1,
    question: "K01 internal class 2 normal-movement path에서 type-record raw inputs가 entity locomotion fields와 walk phase cadence에 어떻게 연결되는가?",
    analysisStatus: "static-confirmed",
    reproductionStatus: "reproduction-complete",
    implementationStatus: "analysis-only",
    sources: {
      executable: { path: paths.executablePath, sha256: executableSha256 },
      sprite: { path: paths.spritePath, sha256: spriteSha256 },
      seeds: { path: paths.seedsPath, sourceSha256: seeds.sourceSha256 },
    },
    identity: {
      internalClass: CLASS_2,
      originalGameplayName: "조선 창병",
      projectStableId: "swordsman",
      sourcePath: "char\\swordk.spr",
      typeRecord: toHex(CLASS_2_TYPE_RECORD),
      typeInitializerCall: class2.callAddress,
    },
    rawFieldBinding: {
      typeRecord: {
        field3c: { offset: "+0x3c", writerArgument: 30, class2InitialValue: class2.field3c },
        field50: { offset: "+0x50", writerArgument: 38, class2InitialValue: class2.field50 },
      },
      entity: {
        cadenceLimit: { offset: "+0x4ea", initializedFromTypeField: "+0x50", class2InitialValue: class2.field50 },
        cadenceCounter: { offset: "+0x4ec", initializedTo: 0 },
        rawAccumulatorInput: { offset: "+0x4ee", initializedFromTypeField: "+0x3c", class2InitialValue: class2.field3c },
        rawAccumulator: { offset: "+0x4f2", initializedTo: 0 },
        animationPhase: { offset: "+0x1b2", mirroredTo: "+0x34", state1And2PhaseCount: 8 },
      },
      verifiedFlow: "The normal movement function reads +0x4ee and updates +0x4f2; separately it increments +0x4ec, signed-compares it with +0x4ea, then advances +0x1b2 modulo the selected state phase count.",
    },
    cadenceContract: {
      functionEntry: toHex(NORMAL_MOVEMENT),
      routes: {
        preDisplacement: "At 0x00425c9f, phase zero skips this cadence block; otherwise state 1/2 is written, +0x4ec increments, and signed +0x4ec < signed +0x4ea skips phase advancement.",
        postDisplacement: "At 0x004261e3, state 1/2 is written, +0x4ec increments, and the same signed comparison controls phase advancement without the preceding phase-zero skip.",
      },
      threshold: "signed WORD(+0x4ec after 16-bit increment) < signed WORD(+0x4ea) holds the phase; otherwise +0x4ec resets to zero and signed WORD(+0x1b2 + 1) is divided by signed phase count 8 with x86 IDIV, storing the low-WORD remainder to +0x1b2 and +0x34.",
      stateSelection: { normal: 1, alternate: 2, selectorField: "+0xba" },
      acceptedReplayScope: "class 2 state 1/2, supplied raw unsigned-WORD phase/counter/limit values, and either recovered cadence entry route only.",
    },
    evidence: { functionEvidence, rawCodeRanges, evidencePoints },
    unresolvedScope: "The source unit and later runtime writers of +0x4ee/+0x4ea are not exhaustively closed. Their coordinate unit, gameplay speed meaning, relationship to world-cell displacement, and original update calls per second are unconfirmed. This report does not convert any field or cadence to project 24 Hz, FPS, movementSpeed, attack cooldown, or parity behavior.",
  };
}

export function replayClass2WalkPhaseCadence({ route, alternateMovement, phaseWord, cadenceCounterWord, cadenceLimitWord }) {
  if (!["pre-displacement", "post-displacement"].includes(route)) {
    throw new RangeError("route must be pre-displacement or post-displacement");
  }
  if (typeof alternateMovement !== "boolean") throw new TypeError("alternateMovement must be boolean");
  for (const [value, label] of [[phaseWord, "phaseWord"], [cadenceCounterWord, "cadenceCounterWord"], [cadenceLimitWord, "cadenceLimitWord"]]) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new RangeError(`${label} must be an unsigned WORD`);
  }
  if (route === "pre-displacement" && phaseWord === 0) {
    return {
      route,
      skippedDueToZeroPhase: true,
      animationStateWrite: null,
      dirtyWrite: null,
      phaseAdvanced: false,
      phaseWord,
      phaseCopyWord: null,
      cadenceCounterWord,
    };
  }

  const nextCounter = (cadenceCounterWord + 1) & 0xffff;
  const animationStateWrite = alternateMovement ? 2 : 1;
  if (signedWord(nextCounter) < signedWord(cadenceLimitWord)) {
    return {
      route,
      skippedDueToZeroPhase: false,
      animationStateWrite,
      dirtyWrite: null,
      phaseAdvanced: false,
      phaseWord,
      phaseCopyWord: null,
      cadenceCounterWord: nextCounter,
    };
  }

  const incrementedPhase = (phaseWord + 1) & 0xffff;
  const phaseRemainder = signedWord(incrementedPhase) % 8;
  const storedPhase = phaseRemainder & 0xffff;
  return {
    route,
    skippedDueToZeroPhase: false,
    animationStateWrite,
    dirtyWrite: 1,
    phaseAdvanced: true,
    phaseWord: storedPhase,
    phaseCopyWord: storedPhase,
    cadenceCounterWord: 0,
  };
}

function extractClass2TypeFields(functions) {
  const initializer = functions.find(({ entry }) => entry === toHex(TYPE_INITIALIZER));
  if (!initializer?.instructions) throw new Error(`Missing type initializer ${toHex(TYPE_INITIALIZER)}`);
  let recordAddress;
  const registerValues = new Map();
  let argumentsSinceLastCall = [];
  for (const instruction of initializer.instructions) {
    const move = /^MOV (E[A-Z]{2}),(-?0x[0-9a-f]+)$/.exec(instruction.text);
    if (move) {
      const value = parseImmediate(move[2]);
      registerValues.set(move[1], value);
      if (move[1] === "ECX") recordAddress = value;
    }
    const push = /^PUSH (.+)$/.exec(instruction.text);
    if (push) argumentsSinceLastCall.push(resolvePush(push[1], registerValues));
    if (instruction.text !== `CALL ${toHex(TYPE_WRITER)}`) continue;
    if (argumentsSinceLastCall.length === TYPE_ARGUMENT_COUNT + 1 && initializer.instructions[0].address === "0x0045bf50") argumentsSinceLastCall = argumentsSinceLastCall.slice(1);
    if (recordAddress === CLASS_2_TYPE_RECORD) {
      if (argumentsSinceLastCall.length !== TYPE_ARGUMENT_COUNT) throw new Error(`Class 2 type call has ${argumentsSinceLastCall.length} arguments`);
      const argumentsInCallOrder = [...argumentsSinceLastCall].reverse();
      const field3c = requireResolvedArgument(argumentsInCallOrder, 30, "+0x3c");
      const field50 = requireResolvedArgument(argumentsInCallOrder, 38, "+0x50");
      return { callAddress: instruction.address, field3c, field50 };
    }
    argumentsSinceLastCall = [];
    recordAddress = undefined;
  }
  throw new Error(`Missing class 2 type-record initializer for ${toHex(CLASS_2_TYPE_RECORD)}`);
}

function resolvePush(operand, registerValues) {
  if (/^-?0x[0-9a-f]+$/u.test(operand)) return parseImmediate(operand);
  return registerValues.get(operand);
}

function requireResolvedArgument(argumentsInCallOrder, index, field) {
  const value = argumentsInCallOrder[index];
  if (!Number.isInteger(value)) throw new Error(`Class 2 type argument ${index} for ${field} is unresolved`);
  return value;
}

function parseImmediate(value) {
  const negative = value.startsWith("-");
  const parsed = Number.parseInt(negative ? value.slice(3) : value.slice(2), 16);
  return negative ? -parsed : parsed;
}

function signedWord(value) {
  return value >= 0x8000 ? value - 0x10000 : value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = extractK01Class2LocomotionCadence();
  if (process.argv.includes("--json")) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(`K01 class 2 locomotion cadence: ${report.identity.sourcePath}\n`);
}
