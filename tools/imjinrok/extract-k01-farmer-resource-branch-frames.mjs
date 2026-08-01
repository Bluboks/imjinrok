#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseSpriteLikeHeader } from "./codec.mjs";
import { EXPECTED_EXECUTABLE_SHA256, extractEntityTypeCatalog } from "./extract-entity-type-catalog.mjs";
import { extractOriginalSpriteTable } from "./extract-sprite-table.mjs";
import { readPeImage } from "./pe-image.mjs";
import { verifyEvidencePoint, verifyRawCodeRange } from "./static-evidence.mjs";

const DEFAULTS = {
  executablePath: "original/imjinrok2/imjinrok2.exe",
  functionsPath: "analysis/generated/imjinrok2/functions.json",
  jumpTablesPath: "analysis/generated/imjinrok2/jump-tables.json",
  referencesPath: "analysis/generated/imjinrok2/references.json",
  seedsPath: "analysis/generated/imjinrok2/seeds.json",
  farmerkPath: "original/imjinrok2/char/farmerk.spr",
  farmerjPath: "original/imjinrok2/char/Farmerj.spr",
};

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

const FARMERS = {
  7: {
    originalGameplayName: "조선 농부",
    sprite: { path: "char\\farmerk.spr", slot: 105, tableIndex: 5, pointerCell: "0x004bc238", sha256: "98e370f4dec6f147a2556340bf93d293d23c3ee3a5367bc22fd3984e7209e5ca", width: 60, height: 60, frameCount: 248 },
    states: {
      idle: { originalAnimationState: 8, phaseCount: 1, frameBases: [82, 90, 98, 106, 114], helper: "0x00438e80", branch: "0x00428fdd" },
      move: { originalAnimationState: 1, phaseCount: 8, frameStart: 80, frameStride: 8, helper: "0x00438ef0", branch: "0x00428e43" },
    },
  },
  31: {
    originalGameplayName: "일본 농부",
    sprite: { path: "char\\farmerj.spr", slot: 145, tableIndex: 45, pointerCell: "0x004bc2d8", sha256: "e6cc67849a872f391c977079fc04118bf06d57b99ad8b5137b02398e26d9cdc5", width: 66, height: 56, frameCount: 248 },
    states: {
      idle: { originalAnimationState: 8, phaseCount: 8, frameBases: [200, 208, 216, 224, 232], helper: "0x00438e80", branch: "0x0042911b" },
      move: { originalAnimationState: 1, phaseCount: 8, frameStart: 200, frameStride: 8, helper: "0x00438ef0", branch: "0x00428f2d" },
    },
  },
};

const FUNCTION_CONTRACTS = [
  ["0x00424510", ["0x00424510-0x0042456d"], 24, "2755ac666178329e2c3ab08bb16adfe6d8133b75ef12d631ea65edd59272b2b3"],
  ["0x00428e10", ["0x00428e10-0x00428f64"], 86, "665ce3064ad839771a84f6ab029b63f44cdfcb52e1c0706a26ec7a27037fae5b"],
  ["0x00428fb0", ["0x00428fb0-0x00429193"], 148, "e5f8707e93a2c0b61922f9e44d828c88e6175c01176aef565f61c6d6b2cef31a"],
  ["0x004291d0", ["0x004291d0-0x0042c547"], 4156, "1c05959938219ae4fa918ba3061b1856dcfb575f007a1a48281dd316709a7e96"],
  ["0x00438e50", ["0x00438e50-0x00438e7e"], 24, "4da58c373054099fbed3aa281d63f114a950c90471650f7cf4089bfefc0c1c00"],
  ["0x00438e80", ["0x00438e80-0x00438e9e"], 6, "870ed439ab165b6aef1ba7c7406f30b089809a389d42ede44a4e00371fdf7d0f"],
  ["0x00438ef0", ["0x00438ef0-0x00438f1e"], 24, "31db374f6bdbf9efb342ff3b4ac12b2d2ba14487c66f46933dc3004826cf2bac"],
  ["0x0043c9c0", ["0x0043c9c0-0x0043d35f"], 684, "eb1c7c21a9af5a2099a2d716ad1253db65fff75ef0befcae871e3462f4d3bcfa"],
  ["0x004550c0", ["0x004550c0-0x00455116"], 26, "190248d3e18a3c0c2a79bddf83622ea017b06297b38e09c10c9b7faf9bfb9c44"],
  ["0x004554c0", ["0x004554c0-0x00456298"], 1013, "df563c3474e63fc410c89355e867232a45f3b8d6e811aabe103d8a7419bc0139"],
  ["0x004562d0", ["0x004562d0-0x00456560"], 189, "b419f888fd4d3f1f68bf246688e361e98ed4513f901438d54158ecced2559cc9"],
];

const RAW_CODE_RANGES = [
  ["resource-subrecord-reset", 0x004550c0, 0x00455116, "cd167f9a693efdec58e00bc28679598ba2c3a89856542a79853510880c99f04d"],
  ["resource-selector-writer", 0x00455798, 0x004557f7, "04c6b1d17fee4e8ea3ee15b6faf53b9cc015b0283166d24a6cfd43fc0a615f1d"],
  ["resource-quantity-increment", 0x004564bc, 0x00456529, "b1a2e611095a04e6375cf39d22cd47ecabe5e343cae1cfd0e64f215f74e0e9a8"],
  ["resource-credit-zero-register-to-gate", 0x0043ca1e, 0x0043cea3, "9d037fe6bc1238f0ee87a97ebc9b40afd3541f5b707d296ab59ea9161fdc09ea"],
  ["resource-credit-gate", 0x0043ce6e, 0x0043cea3, "775e9302733f3b725c490786094db63a17df4e2b2722ed9e9e80c48185494546"],
  ["coordinate-indexed-tile-storage-add", 0x00424510, 0x0042456d, "f46afa27f64240cc7afa781e59659007195c7b7a16de6e79b40e400abc213dd6"],
  ["class-7-idle-nonzero", 0x00428fdd, 0x0042902f, "4eda7a3d473d76d790589063cc3a9ac6835d026dbef099fc07a2141f1c540c20"],
  ["class-7-move-nonzero", 0x00428e43, 0x00428e4d, "3c792fb7b7765835edb5c2bc748d5b25c49444657084732def45e891e74afd2a"],
  ["class-31-idle-nonzero", 0x0042911b, 0x00429183, "77da9f2a6b4e03ac7694ed97754754311f1b652fe2ebe93ecdf665dee1928b3f"],
  ["class-31-move-nonzero", 0x00428f2d, 0x00428f3d, "2c8b419dba859baca103068bd4aca9234738e82558e92f43752cce7ab10e3971"],
].map(([id, start, endExclusive, sha256]) => ({ id, start, endExclusive, sha256 }));

const EVIDENCE_POINTS = [
  [0x004550ea, "66 89 42 1c", "+0x45c subrecord +0x1c is zeroed"],
  [0x004550ee, "66 89 42 1e", "+0x45c subrecord +0x1e is zeroed"],
  [0x004550f2, "66 c7 42 20 0a 00", "+0x45c subrecord +0x20 receives capacity 10"],
  [0x004557a3, "66 89 46 1c", "resource selector writer stores its nonzero input at subrecord +0x1c"],
  [0x004564d4, "66 83 46 1e 0c", "selector 3 adds 12 to subrecord +0x1e"],
  [0x004564db, "66 83 46 1e 09", "other selector paths add 9 to subrecord +0x1e"],
  [0x0045650c, "e8 ff 28 fd ff", "quantity increment path refreshes move configuration"],
  [0x00456524, "e8 87 2a fd ff", "quantity increment path refreshes idle configuration"],
  [0x0043ca1e, "33 ed", "credit-gate path clears EBP, whose BP view is used by CMP AX,BP"],
  [0x0043ce75, "66 8b 86 7a 04 00 00", "credit gate reads entity +0x47a quantity"],
  [0x0043ce81, "66 8b 8e 78 04 00 00", "credit gate reads entity +0x478 selector"],
  [0x0043ce8d, "66 3b 86 7c 04 00 00", "credit gate compares quantity with entity +0x47c capacity"],
  [0x0043ce9a, "e8 71 76 fe ff", "quantity/selector/capacity gate calls the coordinate-indexed tile storage routine"],
  [0x0042451e, "0f bf 81 bc 01 00 00", "tile storage routine reads entity +0x1bc coordinate"],
  [0x00424525, "0f bf 89 be 01 00 00", "tile storage routine reads entity +0x1be coordinate"],
  [0x00424530, "8d 04 80", "tile storage routine begins x*45+y formation before the WORD table add"],
  [0x0042453c, "66 01 14 45 cc 41 bb 00", "selector 3 adds quantity shifted by 8 to coordinate-indexed tile WORD storage"],
  [0x00424563, "66 01 14 45 cc 41 bb 00", "selectors 1 and 2 add quantity to coordinate-indexed tile WORD storage"],
  [0x00428fdd, "6a 01 6a 52 6a 69 6a 00", "class 7 nonzero idle installs phase 1, base 82, slot 105, direction 0"],
  [0x00428e43, "6a 50 6a 69 e8 a4 00 01 00", "class 7 nonzero move installs start 80 and slot 105"],
  [0x0042911b, "68 c8 00 00 00 68 91 00 00 00 6a 00", "class 31 nonzero idle installs base 200 and slot 145"],
  [0x00428f2d, "68 c8 00 00 00 68 91 00 00 00", "class 31 nonzero move installs start 200 and slot 145"],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

const REQUIRED_CALL_EDGES = [
  ["0x0042982a", "0x004291d0", "0x004550c0"],
  ["0x00429880", "0x004291d0", "0x00428fb0"],
  ["0x00429887", "0x004291d0", "0x00428e10"],
  ["0x00429b9d", "0x004291d0", "0x004550c0"],
  ["0x00429bfc", "0x004291d0", "0x00428fb0"],
  ["0x00429c03", "0x004291d0", "0x00428e10"],
  ["0x0043ce9a", "0x0043c9c0", "0x00424510"],
  ["0x0045650c", "0x004562d0", "0x00428e10"],
  ["0x00456524", "0x004562d0", "0x00428fb0"],
  ["0x00428fee", "0x00428fb0", "0x00438e80"],
  ["0x00428ffd", "0x00428fb0", "0x00438e80"],
  ["0x0042900c", "0x00428fb0", "0x00438e80"],
  ["0x0042901b", "0x00428fb0", "0x00438e80"],
  ["0x0042902a", "0x00428fb0", "0x00438e80"],
  ["0x00428e47", "0x00428e10", "0x00438ef0"],
  ["0x00429129", "0x00428fb0", "0x00438e80"],
  ["0x0042913e", "0x00428fb0", "0x00438e80"],
  ["0x00429153", "0x00428fb0", "0x00438e80"],
  ["0x00429168", "0x00428fb0", "0x00438e80"],
  ["0x0042917d", "0x00428fb0", "0x00438e80"],
  ["0x00428f37", "0x00428e10", "0x00438ef0"],
];

export function extractK01FarmerResourceBranchFrames(options = {}) {
  const paths = { ...DEFAULTS, ...options };
  const catalogSeedsPath = paths.catalogSeedsPath ?? paths.seedsPath;
  const { buffer, image } = readPeImage(paths.executablePath);
  equal(sha256(buffer), EXPECTED_EXECUTABLE_SHA256, "EXE SHA-256");
  const functions = readArtifact(paths.functionsPath, "functions");
  const jumpTables = readArtifact(paths.jumpTablesPath, "jump tables");
  const references = readArtifact(paths.referencesPath, "references");
  const seeds = readArtifact(paths.seedsPath, "seeds");
  const functionEvidence = FUNCTION_CONTRACTS.map(([entry, bodyRanges, instructionCount, instructionSha256]) => verifyFunction(functions, { entry, bodyRanges, instructionCount, instructionSha256 }));
  const rawCodeRanges = RAW_CODE_RANGES.map((range) => verifyRawCodeRange(buffer, image, range));
  const evidencePoints = EVIDENCE_POINTS.map((point) => verifyEvidencePoint(buffer, image, point));
  const callEdges = REQUIRED_CALL_EDGES.map(([from, fromFunctionEntry, to]) => verifyCallEdge(references, { from, fromFunctionEntry, to }));
  const classSwitches = verifyClassSwitches(jumpTables);
  const seedsEvidence = verifySeedInstructions(seeds);
  const catalog = extractEntityTypeCatalog({ executablePath: paths.executablePath, seedsPath: catalogSeedsPath });
  const identities = verifyIdentities(catalog, paths);
  const fieldFlow = recoverFieldFlow();
  const states = Object.fromEntries(Object.entries(FARMERS).map(([internalClass, farmer]) => [internalClass, buildStates(farmer)]));
  const testVectors = Object.keys(FARMERS).flatMap((internalClass) => Object.values(FARMERS[internalClass].states).flatMap((state) =>
    NORMAL_DIRECTIONS.flatMap(({ direction }) => [...new Set([0, state.phaseCount - 1])].map((phase) => selectK01FarmerResourceBranchFrame({ internalClass: Number(internalClass), state: state.originalAnimationState, direction, phase, carriedResourceQuantity: 1 }))),
  ));
  return {
    schemaVersion: 1,
    question: "K01 class 7/31 농부에서 WORD +0x47a != 0일 때 idle/move가 어떤 slot/frame/direction/mirror를 선택하며, 그 WORD의 좁은 resource-quantity 근거는 무엇인가?",
    analysisStatus: "static-confirmed",
    reproductionStatus: "reproduction-complete",
    implementationStatus: "analysis-only",
    sources: { executable: { path: paths.executablePath, sha256: EXPECTED_EXECUTABLE_SHA256 }, functions: sourceRecord(paths.functionsPath, functions), jumpTables: sourceRecord(paths.jumpTablesPath, jumpTables), references: sourceRecord(paths.referencesPath, references), seeds: sourceRecord(paths.seedsPath, seeds) },
    identities,
    fieldFlow,
    classSwitches,
    seedsEvidence,
    states,
    directions: NORMAL_DIRECTIONS,
    functionEvidence,
    rawCodeRanges,
    evidencePoints,
    callEdges,
    testVectors,
    acceptedInputScope: "Class 7/31, state 8 idle or state 1 move, recovered normal direction grid, phase bounds, and nonzero unsigned WORD entity +0x47a.",
    unresolvedScope: "State 4, tick/FPS, pivot, stats, behavior, death lifetime, selector names, signedness outside the observed comparisons, full gather lifecycle, and any general entity-wide resource meaning remain unconfirmed.",
  };
}

export function selectK01FarmerResourceBranchFrame({ internalClass, state, direction, phase, carriedResourceQuantity }) {
  unsignedWord(carriedResourceQuantity, "carriedResourceQuantity");
  if (carriedResourceQuantity === 0) throw new RangeError("carriedResourceQuantity must be nonzero for the recovered branch");
  signedWord(direction, "direction");
  const farmer = FARMERS[internalClass];
  if (!farmer) throw new RangeError("internalClass is outside scoped set 7,31");
  const [stateName, stateSpec] = Object.entries(farmer.states).find(([, candidate]) => candidate.originalAnimationState === state) ?? [];
  if (!stateSpec) throw new RangeError("state is outside scoped set 1,8");
  if (!Number.isInteger(phase) || phase < 0 || phase >= stateSpec.phaseCount) throw new RangeError(`phase is outside recovered 0..${stateSpec.phaseCount - 1}`);
  const profile = NORMAL_DIRECTIONS.find((candidate) => candidate.direction === direction);
  if (!profile) throw new RangeError("direction is outside recovered normal grid set");
  const frameBase = stateSpec.frameBases ? stateSpec.frameBases[profile.frameBaseIndex] : stateSpec.frameStart + profile.frameBaseIndex * stateSpec.frameStride;
  return { internalClass, state, stateName, direction, facing: profile.facing, phase, carriedResourceQuantity, spriteSlot: farmer.sprite.slot, sourcePath: farmer.sprite.path, frameIndex: frameBase + phase, mirrorX: profile.mirrorX };
}

function buildStates(farmer) {
  return Object.fromEntries(Object.entries(farmer.states).map(([name, state]) => [name, {
    ...state,
    spriteSlot: farmer.sprite.slot,
    sourcePath: farmer.sprite.path,
    directions: NORMAL_DIRECTIONS.map((profile) => {
      const frameBase = state.frameBases ? state.frameBases[profile.frameBaseIndex] : state.frameStart + profile.frameBaseIndex * state.frameStride;
      return { ...profile, frameBase, frameRange: [frameBase, frameBase + state.phaseCount - 1] };
    }),
  }]));
}

function recoverFieldFlow() {
  return {
    subrecord: { entityOffset: "+0x45c", selector: { subrecordOffset: "+0x1c", entityOffset: "+0x478", resetVa: "0x004550ea", writerVa: "0x004557a3" }, quantity: { subrecordOffset: "+0x1e", entityOffset: "+0x47a", resetVa: "0x004550ee", increments: [{ va: "0x004564d4", selectorCase: 3, add: 12 }, { va: "0x004564db", selectorCase: "other observed cases", add: 9 }] }, capacity: { subrecordOffset: "+0x20", entityOffset: "+0x47c", initialValue: 10, resetVa: "0x004550f2" } },
    creditGate: { functionEntry: "0x0043c9c0", range: "0x0043ce75-0x0043ce9e", zeroRegisterProvenance: { setVa: "0x0043ca1e", instruction: "XOR EBP,EBP", comparatorRegister: "BP", verifiedRange: "0x0043ca1e-0x0043cea3" }, condition: "quantity != 0 && selector != 0 && quantity < capacity (the observed signed JGE comparison)", callVa: "0x0043ce9a", target: "0x00424510", arguments: ["selector from +0x478", "quantity from +0x47a"] },
    quantityConfigRefresh: { functionEntry: "0x004562d0", moveCallVa: "0x0045650c", moveHelper: "0x00428e10", idleCallVa: "0x00456524", idleHelper: "0x00428fb0" },
    coordinateIndexedTileStorageAdd: { functionEntry: "0x00424510", coordinateFields: ["entity +0x1bc", "entity +0x1be"], indexFormula: "x*45+y", tableVa: "0x00bb41cc", selectorCases: [1, 2, 3], effect: "selectors 1/2 add the supplied quantity to a coordinate-indexed tile WORD; selector 3 shifts the supplied quantity by 8 before that add" },
    interpretation: "The selector writer, quantity increments, capacity gate, and coordinate-indexed tile WORD storage add narrowly support +0x47a as a carried/gathered resource quantity for this flow. They do not establish a player-specific accumulation/deposit meaning, a universal semantic for the field, or human names for selector values.",
  };
}

function verifyIdentities(catalog, paths) {
  const table = extractOriginalSpriteTable(paths.executablePath);
  return Object.fromEntries(Object.entries(FARMERS).map(([internalClass, farmer]) => {
    const type = catalog.types.find((candidate) => candidate.internalClass === Number(internalClass));
    if (!type) throw new Error(`entity catalog is missing class ${internalClass}`);
    equal(type.originalGameplayName, farmer.originalGameplayName, `class ${internalClass} name`);
    equal(type.sprite.slot, farmer.sprite.slot, `class ${internalClass} sprite slot`);
    const entry = table.entries[farmer.sprite.tableIndex];
    equal(entry?.tableVa, farmer.sprite.pointerCell, `class ${internalClass} sprite pointer cell`);
    equal(entry?.sourcePath, farmer.sprite.path, `class ${internalClass} sprite source path`);
    const spritePath = internalClass === "7" ? paths.farmerkPath : paths.farmerjPath;
    const bytes = readFileSync(spritePath);
    equal(sha256(bytes), farmer.sprite.sha256, `class ${internalClass} SPR SHA-256`);
    const header = parseSpriteLikeHeader(bytes, spritePath);
    equal(header.width, farmer.sprite.width, `class ${internalClass} SPR width`);
    equal(header.height, farmer.sprite.height, `class ${internalClass} SPR height`);
    equal(header.frameCount, farmer.sprite.frameCount, `class ${internalClass} SPR frame count`);
    return [internalClass, { internalClass: Number(internalClass), originalGameplayName: farmer.originalGameplayName, spriteSlot: farmer.sprite.slot, pointerCell: farmer.sprite.pointerCell, sourcePath: farmer.sprite.path, spriteSha256: farmer.sprite.sha256 }];
  }));
}

function verifyClassSwitches(jumpTables) {
  const initializer = requireSwitch(jumpTables, "0x004292b3");
  const idle = requireSwitch(jumpTables, "0x00428fcc");
  const move = requireSwitch(jumpTables, "0x00428e29");
  const expected = { 7: { initializer: "0x0042981d", idle: "0x00428fd3", move: "0x00428e30" }, 31: { initializer: "0x00429b90", idle: "0x00429108", move: "0x00428f1a" } };
  for (const [internalClass, entries] of Object.entries(expected)) for (const [kind, destination] of Object.entries(entries)) equal(requireCase({ initializer, idle, move }[kind], Number(internalClass)).destination, destination, `class ${internalClass} ${kind} switch destination`);
  return expected;
}

function verifySeedInstructions(seeds) {
  const checks = [["0x00429823", "LEA ECX,[ESI + 0x45c]"], ["0x0042982a", "CALL 0x004550c0"], ["0x0042982f", "MOV EBX,0x8"], ["0x00429834", "MOV EDI,0x69"], ["0x00429b97", "LEA ECX,[ESI + 0x45c]"], ["0x00429b9d", "CALL 0x004550c0"], ["0x00429ba2", "MOV EBX,0x8"], ["0x00429ba7", "MOV EDI,0x91"]];
  const initializer = seeds.functions?.find((candidate) => candidate.entry === "0x004291d0");
  if (!initializer) throw new Error("seeds artifact is missing class initializer");
  for (const [address, text] of checks) equal(initializer.instructions.find((instruction) => instruction.address === address)?.text, text, `seed instruction ${address}`);
  return { functionEntry: "0x004291d0", checks: checks.map(([address, text]) => ({ address, text })) };
}

function verifyFunction(artifact, expected) {
  const actual = artifact.functions?.find((candidate) => candidate.entry === expected.entry);
  if (!actual) throw new Error(`functions artifact is missing ${expected.entry}`);
  equal(JSON.stringify(actual.bodyRanges), JSON.stringify(expected.bodyRanges), `${expected.entry} body ranges`);
  equal(actual.instructionCount, expected.instructionCount, `${expected.entry} instruction count`);
  equal(actual.instructionSha256, expected.instructionSha256, `${expected.entry} instruction SHA-256`);
  return expected;
}

function verifyCallEdge(artifact, expected) {
  const actual = artifact.references?.find((candidate) => candidate.from === expected.from && candidate.to === expected.to);
  if (!actual) throw new Error(`references artifact is missing call edge ${expected.from} -> ${expected.to}`);
  equal(actual.fromFunctionEntry, expected.fromFunctionEntry, `call edge ${expected.from} function entry`);
  equal(actual.type, "UNCONDITIONAL_CALL", `call edge ${expected.from} type`);
  return expected;
}

function readArtifact(path, label) {
  const artifact = JSON.parse(readFileSync(path, "utf8"));
  equal(artifact.sourceSha256, EXPECTED_EXECUTABLE_SHA256, `${label} source SHA-256`);
  return artifact;
}

function sourceRecord(path, artifact) { return { path, sourceSha256: artifact.sourceSha256 }; }
function requireSwitch(artifact, switchAddress) {
  const table = Object.values(artifact.tables ?? {}).find((candidate) => candidate.switchAddress === switchAddress);
  if (!table) throw new Error(`jump-table artifact is missing switch ${switchAddress}`);
  return table;
}
function requireCase(table, label) {
  const entry = table.cases?.find((candidate) => candidate.label === label);
  if (!entry) throw new Error(`jump-table case ${label} is missing`);
  return entry;
}
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function equal(actual, expected, label) { if (actual !== expected) throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`); }
function unsignedWord(value, label) { if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new RangeError(`${label} must be an unsigned WORD`); }
function signedWord(value, label) { if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) throw new RangeError(`${label} must be a signed WORD`); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputIndex = process.argv.indexOf("--output");
  const report = extractK01FarmerResourceBranchFrames();
  if (outputIndex >= 0) writeFileSync(process.argv[outputIndex + 1], `${JSON.stringify(report, null, 2)}\n`);
  else console.log(JSON.stringify(report, null, 2));
}
