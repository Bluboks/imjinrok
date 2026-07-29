#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseSpriteLikeHeader } from "./codec.mjs";
import { EXPECTED_EXECUTABLE_SHA256, extractEntityTypeCatalog } from "./extract-entity-type-catalog.mjs";
import { extractOriginalSpriteTable } from "./extract-sprite-table.mjs";
import { extractMapEntities, parseMapHeader } from "./map-codec.mjs";
import { readPeImage, toHex } from "./pe-image.mjs";
import { verifyEvidencePoint, verifyRawCodeRange } from "./static-evidence.mjs";

const DEFAULTS = {
  executablePath: "original/imjinrok2/imjinrok2.exe",
  functionsPath: "analysis/generated/imjinrok2/functions.json",
  jumpTablesPath: "analysis/generated/imjinrok2/jump-tables.json",
  referencesPath: "analysis/generated/imjinrok2/references.json",
  seedsPath: "analysis/generated/imjinrok2/seeds.json",
  mapPath: "original/imjinrok2/stagemap/k01.map",
  farmerkPath: "original/imjinrok2/char/farmerk.spr",
};

const CLASS = {
  internalClass: 7,
  originalGameplayName: "조선 농부",
  typeRecordAddress: "0x00883724",
  typeFlags: 0x000a0801,
  mapRecords: [
    { rawOwnerWord: 0, sourcePosition: { x: 7, y: 6 } },
    { rawOwnerWord: 0, sourcePosition: { x: 8, y: 6 } },
  ],
  sprite: {
    path: "char\\farmerk.spr",
    slot: 105,
    tableIndex: 5,
    pointerCell: "0x004bc238",
    sha256: "98e370f4dec6f147a2556340bf93d293d23c3ee3a5367bc22fd3984e7209e5ca",
    width: 60,
    height: 60,
    frameCount: 248,
  },
  states: {
    idle: { originalAnimationState: 8, frameStart: 0, frameStride: 8, phaseCount: 8, loop: true },
    move: { originalAnimationState: 1, frameStart: 40, frameStride: 8, phaseCount: 8, loop: true },
    death: { originalAnimationState: 7, frameStart: 240, frameStride: 0, phaseCount: 8, loop: false },
  },
};

export const K01_KOREAN_FARMER_NORMAL_DIRECTIONS = [
  { facing: "s", direction: 1, frameBaseIndex: 0, mirrorX: false },
  { facing: "sw", direction: 5, frameBaseIndex: 1, mirrorX: false },
  { facing: "w", direction: 4, frameBaseIndex: 2, mirrorX: false },
  { facing: "nw", direction: 20, frameBaseIndex: 3, mirrorX: false },
  { facing: "n", direction: 16, frameBaseIndex: 2, mirrorX: true },
  { facing: "ne", direction: 80, frameBaseIndex: 1, mirrorX: true },
  { facing: "e", direction: 64, frameBaseIndex: 0, mirrorX: true },
  { facing: "se", direction: 65, frameBaseIndex: 4, mirrorX: false },
];

const FUNCTION_CONTRACTS = [
  ["0x0048dbe0", ["0x0048dbe0-0x0048dda9"], 147, "f38e4577cf36c44f26097d94e200321d2a9bc6b0aa1696d572e40a600e7f7217"],
  ["0x00483c50", ["0x00483c50-0x00483c9f"], 26, "d33ed40b3a614bcc92bc4b3b429dd372e61b4ef6ccb03b290feffd80c7a9ab4e"],
  ["0x00437650", ["0x00437650-0x00438025"], 539, "4605056775f6f43c9b2065ea5a4ddff5570137eb87587f4a09d2018618e13c28"],
  ["0x004291d0", ["0x004291d0-0x0042c547"], 4156, "1c05959938219ae4fa918ba3061b1856dcfb575f007a1a48281dd316709a7e96"],
  ["0x00428fb0", ["0x00428fb0-0x00429193"], 148, "e5f8707e93a2c0b61922f9e44d828c88e6175c01176aef565f61c6d6b2cef31a"],
  ["0x00428e10", ["0x00428e10-0x00428f64"], 86, "665ce3064ad839771a84f6ab029b63f44cdfcb52e1c0706a26ec7a27037fae5b"],
  ["0x00438e50", ["0x00438e50-0x00438e7e"], 24, "4da58c373054099fbed3aa281d63f114a950c90471650f7cf4089bfefc0c1c00"],
  ["0x00438ef0", ["0x00438ef0-0x00438f1e"], 24, "31db374f6bdbf9efb342ff3b4ac12b2d2ba14487c66f46933dc3004826cf2bac"],
  ["0x004390b0", ["0x004390b0-0x004390d0"], 6, "8c576d98214fa38d4d64c0dc710a6e1452a92ceb33e39a9a563567976dd191df"],
  ["0x004550c0", ["0x004550c0-0x00455116"], 26, "190248d3e18a3c0c2a79bddf83622ea017b06297b38e09c10c9b7faf9bfb9c44"],
];

const RAW_CODE_RANGES = [
  { id: "map-loader-record-loop", start: 0x0048dc7e, endExclusive: 0x0048dcf9, sha256: "00d4cb475b5be4cb3e8121bc29158a62b19b6f7f34d97635913d06b9974fb864" },
  { id: "creator-zero-through-initializer-call", start: 0x00437656, endExclusive: 0x00437f2e, sha256: "1ccf372a34e4af1011f3df38a5a4314e19b6ceb7ef574ed54f768da929c49336" },
  { id: "class-7-initializer", start: 0x0042981d, endExclusive: 0x004298e8, sha256: "44f376cfea26ba90fece2a9723312b47b11cc6579aa5a0ce726a56bbcec19324" },
  { id: "class-7-idle-zero-branch", start: 0x00428fd3, endExclusive: 0x00429047, sha256: "33a520ebcf6d3e5ee217f824217fcbe237e28eec8f0eb8ed60da0faf51fcba5a" },
  { id: "class-7-move-zero-branch", start: 0x00428e30, endExclusive: 0x00428e57, sha256: "b56fdf90ea64335e9e732ee13089868916ca474dff26ac3a75fd0f1d6dbbfca2" },
  { id: "creator-subrecord-zeroer", start: 0x004550c0, endExclusive: 0x00455116, sha256: "cd167f9a693efdec58e00bc28679598ba2c3a89856542a79853510880c99f04d" },
];

const EVIDENCE_POINTS = [
  { va: 0x0048dcca, bytes: "e8 81 5f ff ff", meaning: "K01 map loader calls the record wrapper" },
  { va: 0x00483c95, bytes: "e8 b6 39 fb ff", meaning: "record wrapper calls the creator" },
  { va: 0x00437656, bytes: "b9 56 01 00 00", meaning: "creator clears 0x156 DWORDs" },
  { va: 0x0043765b, bytes: "33 c0", meaning: "creator uses zero as the fill value" },
  { va: 0x0043765d, bytes: "8b fe", meaning: "creator targets the new record" },
  { va: 0x00437666, bytes: "f3 ab", meaning: "creator performs REP STOSD" },
  { va: 0x0043792b, bytes: "8d 8e 5c 04 00 00", meaning: "creator addresses the +0x45c subrecord for its zeroing callee" },
  { va: 0x00437962, bytes: "e8 59 d7 01 00", meaning: "creator calls the +0x45c subrecord initializer" },
  { va: 0x00437b86, bytes: "88 4e 37", meaning: "creator writes the source class to record +0x37" },
  { va: 0x00437f29, bytes: "e8 a2 12 ff ff", meaning: "creator invokes the class initializer after zeroing" },
  { va: 0x00429880, bytes: "e8 2b f7 ff ff", meaning: "class-7 initializer invokes the idle helper" },
  { va: 0x00429887, bytes: "e8 84 f5 ff ff", meaning: "class-7 initializer invokes the move helper" },
  { va: 0x0042989e, bytes: "e8 0d f8 00 00", meaning: "class-7 initializer installs death facing zero" },
  { va: 0x00428fd3, bytes: "66 83 be 7a 04 00 00 00", meaning: "class-7 idle helper reads +0x47a" },
  { va: 0x00429031, bytes: "6a 08 6a 00 6a 69", meaning: "class-7 idle zero branch supplies phase 8, frame 0, and slot 105" },
  { va: 0x00429039, bytes: "c6 86 92 00 00 00 08", meaning: "class-7 idle zero branch writes state 8" },
  { va: 0x00429040, bytes: "e8 0b fe 00 00", meaning: "class-7 idle zero branch calls helper 0x00438e50" },
  { va: 0x00428e30, bytes: "66 83 b9 7a 04 00 00 00", meaning: "class-7 move helper reads +0x47a" },
  { va: 0x00428e3f, bytes: "6a 08", meaning: "class-7 move branch supplies phase 8" },
  { va: 0x00428e4d, bytes: "6a 28 6a 69", meaning: "class-7 move zero branch supplies frame 40 and slot 105" },
  { va: 0x00428e51, bytes: "e8 9a 00 01 00", meaning: "class-7 move zero branch calls helper 0x00438ef0" },
];

const REQUIRED_CALL_EDGES = [
  ["0x0048dcca", "0x0048dbe0", "0x00483c50"],
  ["0x00483c95", "0x00483c50", "0x00437650"],
  ["0x00437f29", "0x00437650", "0x004291d0"],
  ["0x00429880", "0x004291d0", "0x00428fb0"],
  ["0x00429887", "0x004291d0", "0x00428e10"],
  ["0x0042989e", "0x004291d0", "0x004390b0"],
];

export function extractK01KoreanFarmerCoreFrames(options = {}) {
  const paths = { ...DEFAULTS, ...options };
  const { buffer, image } = readPeImage(paths.executablePath);
  const executableSha256 = sha256(buffer);
  equal(executableSha256, EXPECTED_EXECUTABLE_SHA256, "EXE SHA-256");
  const functions = readArtifact(paths.functionsPath, executableSha256, "functions");
  const jumpTables = readArtifact(paths.jumpTablesPath, executableSha256, "jump tables");
  const references = readArtifact(paths.referencesPath, executableSha256, "references");
  const seeds = readArtifact(paths.seedsPath, executableSha256, "seeds");
  const functionEvidence = verifyFunctionContracts(functions);
  verifySeedCoverage(seeds);
  const rawCodeRanges = RAW_CODE_RANGES.map((range) => verifyRawCodeRange(buffer, image, range));
  const evidencePoints = EVIDENCE_POINTS.map((point) => verifyEvidencePoint(buffer, image, point));
  const callEdges = REQUIRED_CALL_EDGES.map(([from, fromFunctionEntry, to]) => verifyCallEdge(references, { from, fromFunctionEntry, to }));
  const classSwitches = {
    initializer: verifyClassSwitch(jumpTables, 0x004291d0, 0x004292b3, 0x0042981d),
    idle: verifyClassSwitch(jumpTables, 0x00428fb0, 0x00428fcc, 0x00428fd3),
    move: verifyClassSwitch(jumpTables, 0x00428e10, 0x00428e29, 0x00428e30),
  };
  const creationDefault = verifyCreationDefault(seeds);
  const initializer = verifyInitializerContract(seeds);
  const catalog = extractEntityTypeCatalog({ executablePath: paths.executablePath, seedsPath: paths.seedsPath });
  const identity = verifyIdentity(catalog);
  const sprite = verifySprite(paths.executablePath, paths.farmerkPath);
  const map = verifyMap(paths.mapPath);
  const states = buildStates();
  const testVectors = Object.values(states).flatMap((state) =>
    K01_KOREAN_FARMER_NORMAL_DIRECTIONS.flatMap(({ direction }) =>
      [0, state.phaseCount - 1].map((phase) => selectK01KoreanFarmerCoreFrame({ state: state.originalAnimationState, direction, phase })),
    ),
  );

  return {
    schemaVersion: 1,
    question: "K01 source-created class 7 조선 농부의 +0x47a==0 core states 8/1/7은 어떤 slot/frame/direction/mirror를 선택하는가?",
    analysisStatus: "static-confirmed",
    reproductionStatus: "reproduction-complete",
    implementationStatus: "theme-level-mapping",
    sources: {
      executable: { path: paths.executablePath, sha256: executableSha256 },
      functions: { path: paths.functionsPath, sourceSha256: functions.sourceSha256 },
      jumpTables: { path: paths.jumpTablesPath, sourceSha256: jumpTables.sourceSha256 },
      references: { path: paths.referencesPath, sourceSha256: references.sourceSha256 },
      seeds: { path: paths.seedsPath, sourceSha256: seeds.sourceSha256 },
      map,
      sprite,
    },
    identity,
    creationDefault,
    initializer,
    classSwitches,
    directions: K01_KOREAN_FARMER_NORMAL_DIRECTIONS,
    states,
    functionEvidence,
    rawCodeRanges,
    evidencePoints,
    callEdges,
    testVectors,
    acceptedInputScope: "K01 map-loader source-created class 7 records with initializer-time WORD +0x47a == 0, restricted to core states 8 idle, 1 move, and 7 death.",
    unresolvedScope: "+0x47a nonzero resource/carry branches, +0x478 meaning, state 4 attack, original timing/FPS, pivots, stats, behavior, later runtime mutation, and death lifetime remain outside this mapping.",
  };
}

export function selectK01KoreanFarmerCoreFrame({ state, direction, phase, resourceField = 0 }) {
  unsignedWord(resourceField, "resourceField");
  signedWord(direction, "direction");
  const [stateName, stateSpec] = Object.entries(CLASS.states).find(([, candidate]) => candidate.originalAnimationState === state) ?? [];
  if (!stateSpec) throw new RangeError("state is outside scoped set 1,7,8");
  if (resourceField !== 0) throw new RangeError("resourceField must be zero for the source-created core-state scope");
  if (!Number.isInteger(phase) || phase < 0 || phase >= stateSpec.phaseCount) throw new RangeError(`phase is outside recovered 0..${stateSpec.phaseCount - 1}`);
  const profile = K01_KOREAN_FARMER_NORMAL_DIRECTIONS.find((candidate) => candidate.direction === direction);
  if (!profile) throw new RangeError("direction is outside recovered normal grid set");
  return {
    internalClass: CLASS.internalClass,
    state,
    stateName,
    direction,
    facing: profile.facing,
    phase,
    spriteSlot: CLASS.sprite.slot,
    sourcePath: CLASS.sprite.path,
    frameIndex: stateSpec.frameStart + profile.frameBaseIndex * stateSpec.frameStride + phase,
    mirrorX: profile.mirrorX,
  };
}

function buildStates() {
  return Object.fromEntries(Object.entries(CLASS.states).map(([name, state]) => {
    const directions = K01_KOREAN_FARMER_NORMAL_DIRECTIONS.map((profile) => {
      const frameBase = state.frameStart + profile.frameBaseIndex * state.frameStride;
      return { ...profile, frameBase, frameRange: [frameBase, frameBase + state.phaseCount - 1] };
    });
    return [name, {
      ...state,
      spriteSlot: CLASS.sprite.slot,
      sourcePath: CLASS.sprite.path,
      frameRange: [Math.min(...directions.map(({ frameRange }) => frameRange[0])), Math.max(...directions.map(({ frameRange }) => frameRange[1]))],
      directions,
    }];
  }));
}

function verifyCreationDefault(seeds) {
  const creator = requireSeed(seeds, "0x00437650");
  const writesBetweenZeroAndInitializer = creator.instructions.filter((instruction) => {
    const address = Number.parseInt(instruction.address, 16);
    return address >= 0x00437666 && address < 0x00437f29 && /\+ 0x47a\]/u.test(instruction.text);
  });
  equal(writesBetweenZeroAndInitializer.length, 0, "creator direct +0x47a writes before initializer");
  return {
    mapLoader: { functionEntry: "0x0048dbe0", callVa: "0x0048dcca", wrapper: "0x00483c50" },
    wrapper: { functionEntry: "0x00483c50", callVa: "0x00483c95", creator: "0x00437650" },
    creator: {
      functionEntry: "0x00437650",
      zeroFill: { ecxDwordCount: 0x156, byteCount: 0x558, eax: 0, destinationRegister: "EDI", repStosdVa: "0x00437666" },
      classWriteVa: "0x00437b86",
      initializerCallVa: "0x00437f29",
      noDirectFieldWrite: { field: "+0x47a", startVa: "0x00437666", endExclusiveVa: "0x00437f29" },
      subrecordZeroer: { callVa: "0x00437962", ecx: "ESI+0x45c", functionEntry: "0x004550c0", dwordCount: 0x0e, byteCount: 0x38, coversField: "+0x47a" },
    },
    result: { field: "+0x47a", value: 0, status: "creation-default-static-confirmed" },
  };
}

function verifyInitializerContract(seeds) {
  const initializer = requireSeed(seeds, "0x004291d0");
  const expectInstruction = (address, text) => {
    const instruction = initializer.instructions.find((candidate) => candidate.address === address);
    equal(instruction?.text, text, `class-7 initializer ${address}`);
  };
  expectInstruction("0x0042982f", "MOV EBX,0x8");
  expectInstruction("0x00429834", "MOV EDI,0x69");
  expectInstruction("0x00429880", "CALL 0x00428fb0");
  expectInstruction("0x00429887", "CALL 0x00428e10");
  for (const [index, startVa, callVa] of [
    [0, 0x0042988c, "0x0042989e"],
    [1, 0x004298a3, "0x004298ae"],
    [2, 0x004298b3, "0x004298be"],
    [3, 0x004298c3, "0x004298ce"],
    [4, 0x004298d3, "0x004298de"],
  ]) {
    expectInstruction(toHex(startVa), "PUSH EBX");
    expectInstruction(toHex(startVa + 1), "PUSH 0xf0");
    expectInstruction(toHex(startVa + 6), "PUSH EDI");
    expectInstruction(toHex(startVa + 7), `PUSH 0x${index.toString(16)}`);
    expectInstruction(callVa, "CALL 0x004390b0");
  }
  return {
    functionEntry: "0x004291d0",
    classCaseRange: "0x0042981d-0x004298e7",
    sharedRegisters: { phaseCount: 8, spriteSlot: 105 },
    helperCalls: { idle: "0x00429880 -> 0x00428fb0", move: "0x00429887 -> 0x00428e10" },
    death: { helper: "0x004390b0", callCount: 5, frameStart: 240, phaseCount: 8, spriteSlot: 105 },
  };
}

function verifyIdentity(catalog) {
  const type = catalog.types.find((candidate) => candidate.internalClass === CLASS.internalClass);
  if (!type) throw new Error("entity catalog is missing class 7");
  equal(type.originalGameplayName, CLASS.originalGameplayName, "class 7 original name");
  equal(type.definition.recordAddress, CLASS.typeRecordAddress, "class 7 type record");
  equal(type.definition.flags, toHex(CLASS.typeFlags), "class 7 flags");
  equal(type.sprite.slot, CLASS.sprite.slot, "class 7 sprite slot");
  equal(type.sprite.pointerCell, CLASS.sprite.pointerCell, "class 7 sprite pointer cell");
  equal(type.sprite.sourcePath, CLASS.sprite.path, "class 7 sprite source path");
  return { internalClass: CLASS.internalClass, originalGameplayName: CLASS.originalGameplayName, typeRecordAddress: CLASS.typeRecordAddress, typeFlags: toHex(CLASS.typeFlags), spriteSlot: CLASS.sprite.slot, sourcePath: CLASS.sprite.path };
}

function verifySprite(executablePath, spritePath) {
  const table = extractOriginalSpriteTable(executablePath);
  const entry = table.entries[CLASS.sprite.tableIndex];
  if (!entry) throw new Error("farmerk sprite table entry is missing");
  equal(entry.tableVa, CLASS.sprite.pointerCell, "farmerk sprite pointer cell");
  equal(entry.sourcePath, CLASS.sprite.path, "farmerk sprite source path");
  const bytes = readFileSync(spritePath);
  equal(sha256(bytes), CLASS.sprite.sha256, "farmerk SPR SHA-256");
  const header = parseSpriteLikeHeader(bytes, spritePath);
  equal(header.width, CLASS.sprite.width, "farmerk width");
  equal(header.height, CLASS.sprite.height, "farmerk height");
  equal(header.frameCount, CLASS.sprite.frameCount, "farmerk frame count");
  return { path: spritePath, sha256: CLASS.sprite.sha256, tableIndex: CLASS.sprite.tableIndex, pointerCell: CLASS.sprite.pointerCell, sourcePath: CLASS.sprite.path, slot: CLASS.sprite.slot, width: CLASS.sprite.width, height: CLASS.sprite.height, frameCount: CLASS.sprite.frameCount };
}

function verifyMap(mapPath) {
  const bytes = readFileSync(mapPath);
  const mapSha256 = sha256(bytes);
  equal(mapSha256, "43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb", "K01 map SHA-256");
  const header = parseMapHeader(bytes, mapPath);
  const records = extractMapEntities(bytes, header).entities
    .filter((entity) => entity.active && entity.ownerId === 0 && entity.typeId === CLASS.internalClass)
    .map((entity) => ({ rawOwnerWord: entity.ownerId, sourcePosition: { x: entity.x, y: entity.y } }));
  deepEqual(records, CLASS.mapRecords, "K01 active owner-0 class-7 records");
  return { path: mapPath, sha256: mapSha256, width: header.width, height: header.height, activeClass7Owner0Records: records };
}

function verifyFunctionContracts(functions) {
  return FUNCTION_CONTRACTS.map(([entry, bodyRanges, instructionCount, instructionSha256]) => {
    const actual = functions.functions?.find((candidate) => candidate.entry === entry);
    if (!actual) throw new Error(`functions artifact is missing ${entry}`);
    deepEqual(actual.bodyRanges, bodyRanges, `${entry} body ranges`);
    equal(actual.instructionCount, instructionCount, `${entry} instruction count`);
    equal(actual.instructionSha256, instructionSha256, `${entry} instruction SHA-256`);
    return { entry, bodyRanges, instructionCount, instructionSha256 };
  });
}

function verifySeedCoverage(seeds) {
  for (const [entry, bodyRanges, blockCount, instructionCount] of [
    ["0x0048dbe0", ["0x0048dbe0-0x0048dda9"], 21, 147],
    ["0x00483c50", ["0x00483c50-0x00483c9f"], 1, 26],
    ["0x00437650", ["0x00437650-0x00438025"], 39, 539],
    ["0x004291d0", ["0x004291d0-0x0042c547"], 88, 4156],
  ]) {
    const seed = requireSeed(seeds, entry);
    deepEqual(seed.bodyRanges, bodyRanges, `${entry} seed body ranges`);
    equal(seed.basicBlocks?.length, blockCount, `${entry} seed CFG blocks`);
    equal(seed.instructions?.length, instructionCount, `${entry} seed instruction count`);
  }
}

function verifyClassSwitch(jumpTables, functionEntry, switchAddress, destination) {
  const table = Object.values(jumpTables.tables ?? {}).find((candidate) => candidate.functionEntry === toHex(functionEntry) && candidate.switchAddress === toHex(switchAddress));
  if (!table) throw new Error(`missing class-7 switch ${toHex(switchAddress)}`);
  const entry = table.cases.find((candidate) => candidate.label === CLASS.internalClass);
  if (!entry) throw new Error(`missing class-7 switch case at ${toHex(switchAddress)}`);
  equal(entry.destination, toHex(destination), `class-7 switch destination ${toHex(switchAddress)}`);
  return { functionEntry: toHex(functionEntry), switchAddress: toHex(switchAddress), class: CLASS.internalClass, destination: entry.destination };
}

function verifyCallEdge(references, expected) {
  const found = references.references?.find((reference) => reference.from === expected.from && reference.fromFunctionEntry === expected.fromFunctionEntry && reference.to === expected.to && reference.type === "UNCONDITIONAL_CALL");
  if (!found) throw new Error(`missing required call edge ${expected.from} -> ${expected.to}`);
  return { from: expected.from, fromFunctionEntry: expected.fromFunctionEntry, to: expected.to };
}

function readArtifact(path, sourceSha256, label) {
  const artifact = JSON.parse(readFileSync(path, "utf8"));
  equal(artifact.sourceSha256, sourceSha256, `${label} source SHA-256`);
  return artifact;
}

function requireSeed(seeds, entry) {
  const seed = seeds.functions?.find((candidate) => candidate.entry === entry);
  if (!seed?.instructions) throw new Error(`seeds artifact is missing ${entry}`);
  return seed;
}

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function equal(actual, expected, label) { if (actual !== expected) throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`); }
function deepEqual(actual, expected, label) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
function unsignedWord(value, label) { if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new RangeError(`${label} must be an unsigned WORD`); }
function signedWord(value, label) { if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) throw new RangeError(`${label} must be a signed WORD`); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputIndex = process.argv.indexOf("--output");
  const report = extractK01KoreanFarmerCoreFrames();
  if (outputIndex >= 0) writeFileSync(process.argv[outputIndex + 1], `${JSON.stringify({ schemaVersion: 1, vectors: report.testVectors }, null, 2)}\n`);
  else console.log(JSON.stringify(report, null, 2));
}
