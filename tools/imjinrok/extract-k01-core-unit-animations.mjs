#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseSpriteLikeHeader } from "./codec.mjs";
import { EXPECTED_EXECUTABLE_SHA256, extractEntityTypeCatalog } from "./extract-entity-type-catalog.mjs";
import { extractOriginalSpriteTable } from "./extract-sprite-table.mjs";
import { readPeImage, toHex } from "./pe-image.mjs";

const DEFAULTS = {
  executablePath: "original/imjinrok2/imjinrok2.exe",
  functionsPath: "analysis/generated/imjinrok2/functions.json",
  jumpTablesPath: "analysis/generated/imjinrok2/jump-tables.json",
  seedsPath: "analysis/generated/imjinrok2/seeds.json",
  swordkPath: "original/imjinrok2/char/swordk.spr",
  swordjPath: "original/imjinrok2/char/swordj.spr",
  archerkPath: "original/imjinrok2/char/archerk.spr",
};

export const NORMAL_DIRECTION_PROFILES = [
  { facing: "s", direction: 1, deltaX: 0, deltaY: 1, frameBaseIndex: 0, mirrorX: false },
  { facing: "sw", direction: 5, deltaX: -1, deltaY: 1, frameBaseIndex: 1, mirrorX: false },
  { facing: "w", direction: 4, deltaX: -1, deltaY: 0, frameBaseIndex: 2, mirrorX: false },
  { facing: "nw", direction: 20, deltaX: -1, deltaY: -1, frameBaseIndex: 3, mirrorX: false },
  { facing: "n", direction: 16, deltaX: 0, deltaY: -1, frameBaseIndex: 2, mirrorX: true },
  { facing: "ne", direction: 80, deltaX: 1, deltaY: -1, frameBaseIndex: 1, mirrorX: true },
  { facing: "e", direction: 64, deltaX: 1, deltaY: 0, frameBaseIndex: 0, mirrorX: true },
  { facing: "se", direction: 65, deltaX: 1, deltaY: 1, frameBaseIndex: 4, mirrorX: false },
];

const CLASSES = [
  {
    internalClass: 2,
    originalGameplayName: "조선 창병",
    typeRecordAddress: "0x008830a8",
    typeFlags: 0x04080805,
    destination: 0x00429f48,
    endInclusive: 0x00429feb,
    sprite: { key: "swordk", path: "char\\swordk.spr", slot: 100, tableIndex: 0, pointerCell: "0x004bc224", sha256: "414d285b207ba12afdd856a0f16ddde615381cf491fe493d6ededf91681b55eb", width: 60, height: 60, frameCount: 192 },
    states: { idle: [8, 128, 10, 10], move: [1, 0, 8, 8], state2: [2, 88, 8, 8], attack: [4, 48, 8, 8], death: [7, 40, 0, 8] },
  },
  {
    internalClass: 3,
    originalGameplayName: "일본 창병",
    typeRecordAddress: "0x008831f4",
    typeFlags: 0x04080805,
    destination: 0x00429fec,
    endInclusive: 0x0042a09a,
    sprite: { key: "swordj", path: "char\\swordj.spr", slot: 101, tableIndex: 1, pointerCell: "0x004bc228", sha256: "f3dc53b8606b09e7c65f6a9dabefcf8f6ffef4ec281ff38fb59bc9b2cf8de17e", width: 60, height: 50, frameCount: 192 },
    states: { idle: [8, 0, 8, 8], move: [1, 40, 8, 8], state2: [2, 80, 8, 8], attack: [4, 120, 8, 8], death: [7, 176, 0, 8] },
  },
  {
    internalClass: 4,
    originalGameplayName: "조선 궁수",
    typeRecordAddress: "0x00883340",
    typeFlags: 0x04082805,
    destination: 0x0042a156,
    endInclusive: 0x0042a204,
    sprite: { key: "archerk", path: "char\\archerk.spr", slot: 102, tableIndex: 2, pointerCell: "0x004bc22c", sha256: "5f3cf34ed44a2b011e8d4d7e51ff3974b461f903ce7d8dc37589ea1bc5af4df4", width: 56, height: 46, frameCount: 176 },
    states: { idle: [8, 0, 8, 8], move: [1, 80, 8, 8], state2: [2, 40, 8, 8], attack: [4, 120, 8, 8], death: [7, 160, 0, 8] },
  },
];

const HELPERS = {
  idle: "0x00438e50",
  move: "0x00438ef0",
  state2: "0x00438f70",
  death: "0x004390b0",
  attack: "0x004390e0",
};
const FUNCTION_CONTRACTS = [
  ["0x004291d0", ["0x004291d0-0x0042c547"], 4156, "1c05959938219ae4fa918ba3061b1856dcfb575f007a1a48281dd316709a7e96"],
  ["0x00438e50", ["0x00438e50-0x00438e7e"], 24, "4da58c373054099fbed3aa281d63f114a950c90471650f7cf4089bfefc0c1c00"],
  ["0x00438ef0", ["0x00438ef0-0x00438f1e"], 24, "31db374f6bdbf9efb342ff3b4ac12b2d2ba14487c66f46933dc3004826cf2bac"],
  ["0x00438f70", ["0x00438f70-0x00438f9e"], 24, "57c964dfbabba68c0d77cf322c0174c3efafe30a1b5bc2c8c50c4ef970ec753d"],
  ["0x004390b0", ["0x004390b0-0x004390d0"], 6, "8c576d98214fa38d4d64c0dc710a6e1452a92ceb33e39a9a563567976dd191df"],
  ["0x004390e0", ["0x004390e0-0x0043910e"], 24, "02510627f1038fb23f0100a2c3a540507c282404bf087e399f55cbc06dba7b3e"],
  ["0x0041d210", ["0x0041d210-0x0041d277", "0x0041d2c0-0x0041d41a", "0x0041e200-0x0041e2f5"], 177, "dbc2f289ae0aacdc6d7ef785d7d8290d1153742003a389889f5ac881563ca278"],
  ["0x0041d870", ["0x0041d870-0x0041d976", "0x0041d9f0-0x0041dbdc"], 149, "725ef4a43130d35f9001bbd0b96ab9868b54ee4c000a49de36b96eccce7cdfc2"],
  ["0x0041efa0", ["0x0041efa0-0x0041f272"], 140, "0dd6b72b3f73f96672d22ceac55b7565cb93e92e3bc38598fa25a7b55013a646"],
  ["0x0041d700", ["0x0041d700-0x0041d7f5"], 49, "4efa54b7c845a61fe9aae4a14f62d0d1d2bab44c2b3e26db4cb524003bbc1af3"],
  ["0x0041e370", ["0x0041e370-0x0041e3bd", "0x0041e3f0-0x0041e5db"], 115, "aa96086d04f698f4965205fa74803f0cc7d7db9a05ee610834a0ccffac293a61"],
];
const EVIDENCE = [
  [0x0041d870, "f6 41 74 08 74 05", "state 8 normal path requires flags bit 0x08 clear"],
  [0x0041efa0, "f7 41 74 08 00 00 80 0f 84", "state 1 normal path requires flags mask 0x80000008 clear"],
  [0x0041e3a0, "f7 41 74 00 00 00 80 75 14 66 83 b9 44 01 00 00 00", "state 4 default gate requires high bit clear and nonzero WORD +0x144"],
];

export function extractK01CoreUnitAnimations(options = {}) {
  const paths = { ...DEFAULTS, ...options };
  const catalogSeedsPath = paths.catalogSeedsPath ?? paths.seedsPath;
  const { buffer, image } = readPeImage(paths.executablePath);
  const executableSha256 = sha256(buffer);
  equal(executableSha256, EXPECTED_EXECUTABLE_SHA256, "EXE SHA-256");
  const functions = readArtifact(paths.functionsPath, executableSha256, "functions");
  const functionEvidence = FUNCTION_CONTRACTS.map(([entry, bodyRanges, instructionCount, instructionSha256]) => {
    const actual = functions.functions.find((candidate) => candidate.entry === entry);
    if (!actual) throw new Error(`functions artifact is missing ${entry}`);
    deepEqual(actual.bodyRanges, bodyRanges, `${entry} body ranges`);
    equal(actual.instructionCount, instructionCount, `${entry} instruction count`);
    equal(actual.instructionSha256, instructionSha256, `${entry} instruction SHA-256`);
    return { entry, bodyRanges, instructionCount, instructionSha256 };
  });
  const jumpTables = readArtifact(paths.jumpTablesPath, executableSha256, "jump tables");
  const classSwitch = requireSwitch(jumpTables, 0x004291d0, 0x004292b3);
  const seeds = readArtifact(paths.seedsPath, executableSha256, "seeds");
  const catalog = extractEntityTypeCatalog({ executablePath: paths.executablePath, seedsPath: catalogSeedsPath });
  const spriteTable = extractOriginalSpriteTable(paths.executablePath);
  const classes = CLASSES.map((spec) => recoverClass({ spec, classSwitch, seeds, catalog, spriteTable, spritePath: paths[`${spec.sprite.key}Path`] }));
  const evidencePoints = EVIDENCE.map(([va, bytes, meaning]) => inspectEvidence(buffer, image, va, bytes, meaning));
  if (evidencePoints.some(({ matched }) => !matched)) throw new Error("core unit animation gate evidence mismatch");
  const testVectors = classes.flatMap((unit) =>
    ["idle", "move", "state2", "attack", "death"].flatMap((stateName) =>
      NORMAL_DIRECTION_PROFILES.flatMap(({ direction }) =>
        [0, unit.states[stateName].phaseCount - 1].map((phase) =>
          selectCoreUnitFrame({
            internalClass: unit.identity.internalClass,
            state: unit.states[stateName].originalAnimationState,
            direction,
            phase,
          }),
        ),
      ),
    ),
  );
  return {
    schemaVersion: 1,
    question: "K01 internal classes 2/3/4의 core animation states 8/1/4/7은 어떤 slot/frame/direction/mirror를 선택하는가?",
    analysisStatus: "static-confirmed",
    reproductionStatus: "reproduction-complete",
    implementationStatus: "theme-level-mapping",
    sources: { executable: { path: paths.executablePath, sha256: executableSha256 }, functions: { path: paths.functionsPath, sourceSha256: functions.sourceSha256 }, jumpTables: { path: paths.jumpTablesPath, sourceSha256: jumpTables.sourceSha256 }, seeds: { path: paths.seedsPath, sourceSha256: seeds.sourceSha256 } },
    classDispatch: { functionEntry: "0x004291d0", switchAddress: "0x004292b3", classes: classes.map(({ identity, initializerRange }) => ({ internalClass: identity.internalClass, destination: initializerRange.start, inclusiveRange: `${initializerRange.start}-${initializerRange.end}` })) },
    directions: NORMAL_DIRECTION_PROFILES,
    classes,
    functionEvidence,
    evidencePoints,
    testVectors,
    acceptedInputScope: "creation-default normal paths for states 8/1/4/7; state 2 is statically proven only as a quarantined alternate movement variant",
    unresolvedScope: "state 2 environment label and project policy, original timing/FPS, pivots, later runtime flag mutation, hit reaction, and death lifetime",
  };
}

export function selectCoreUnitFrame({ internalClass, state, direction, phase, entityFlags, attackPhaseCount = 8 }) {
  const spec = CLASSES.find((candidate) => candidate.internalClass === internalClass);
  if (!spec) throw new RangeError("internalClass is outside scoped classes 2,3,4");
  unsignedDword(entityFlags ?? spec.typeFlags, "entityFlags");
  unsignedWord(attackPhaseCount, "attackPhaseCount");
  signedWord(direction, "direction");
  const stateEntry = Object.entries(spec.states).find(([, value]) => value[0] === state);
  if (!stateEntry) throw new RangeError("state is outside scoped set 1,2,4,7,8");
  const [stateName, [, frameStart, frameStride, phaseCount]] = stateEntry;
  if (!Number.isInteger(phase) || phase < 0 || phase >= phaseCount) throw new RangeError(`phase is outside recovered 0..${phaseCount - 1}`);
  const profile = NORMAL_DIRECTION_PROFILES.find((candidate) => candidate.direction === direction);
  if (!profile) throw new RangeError("direction is outside recovered normal grid set");
  const flags = entityFlags ?? spec.typeFlags;
  if (stateName === "idle" && (flags & 0x08)) throw new Error("idle normal path requires bit 0x08 clear");
  if (stateName === "move" && (flags & 0x80000008)) throw new Error("state 1 normal path requires mask 0x80000008 clear");
  if (stateName === "attack" && ((flags & 0x80000000) || attackPhaseCount === 0)) throw new Error("attack normal path requires high bit clear and nonzero phase count");
  return { internalClass, state, stateName, direction, facing: profile.facing, phase, spriteSlot: spec.sprite.slot, sourcePath: spec.sprite.path, frameIndex: frameStart + profile.frameBaseIndex * frameStride + phase, mirrorX: profile.mirrorX };
}

function recoverClass({ spec, classSwitch, seeds, catalog, spriteTable, spritePath }) {
  equal(requireCase(classSwitch, spec.internalClass).destination, toHex(spec.destination), `class ${spec.internalClass} initializer destination`);
  const type = catalog.types.find((candidate) => candidate.internalClass === spec.internalClass);
  if (!type) throw new Error(`entity catalog is missing class ${spec.internalClass}`);
  equal(type.originalGameplayName, spec.originalGameplayName, `class ${spec.internalClass} name`);
  equal(type.definition.recordAddress, spec.typeRecordAddress, `class ${spec.internalClass} record`);
  equal(type.definition.flags, toHex(spec.typeFlags), `class ${spec.internalClass} flags`);
  equal(type.sprite.slot, spec.sprite.slot, `class ${spec.internalClass} sprite slot`);
  const sprite = inspectSprite(spriteTable, spec.sprite, spritePath);
  const initializers = recoverInitializers(seeds, spec);
  const states = Object.fromEntries(Object.entries(spec.states).map(([name, [originalAnimationState, frameStart, frameStride, phaseCount]]) => {
    const actual = initializers[name];
    deepEqual([actual.state, actual.frameStart, actual.frameStride, actual.phaseCount, actual.slot], [originalAnimationState, frameStart, frameStride, phaseCount, spec.sprite.slot], `class ${spec.internalClass} ${name} initializer`);
    const directions = NORMAL_DIRECTION_PROFILES.map((profile) => {
      const frameBase = frameStart + profile.frameBaseIndex * frameStride;
      return { ...profile, frameBase, frameRange: [frameBase, frameBase + phaseCount - 1] };
    });
    return [name, { originalAnimationState, spriteSlot: spec.sprite.slot, sourcePath: spec.sprite.path, frameStart, frameStride, phaseCount, frameRange: [Math.min(...directions.map(({ frameRange }) => frameRange[0])), Math.max(...directions.map(({ frameRange }) => frameRange[1]))], directions }];
  }));
  return { identity: { internalClass: spec.internalClass, originalGameplayName: spec.originalGameplayName, typeRecordAddress: spec.typeRecordAddress, typeFlags: toHex(spec.typeFlags) }, initializerRange: { start: toHex(spec.destination), end: toHex(spec.endInclusive) }, sprite, initializers, states, gates: { idle: "flags bit 0x08 clear", move: "(flags & 0x80000008) == 0", attack: "flags high bit clear and WORD +0x144 nonzero", death: "health-zero/action-state common consumer 0x0041d700" } };
}

function recoverInitializers(seeds, spec) {
  const initializer = seeds.functions?.find(({ entry }) => entry === "0x004291d0");
  if (!initializer?.instructions) throw new Error("seeds artifact is missing initializer instructions");
  let ebx;
  const pending = [];
  const calls = [];
  for (const instruction of initializer.instructions) {
    const address = Number.parseInt(instruction.address, 16);
    if (address < spec.destination || address > spec.endInclusive) continue;
    if (instruction.text === "MOV EBX,0x8") ebx = 8;
    const push = /^PUSH (0x[0-9a-f]+|EBX)$/.exec(instruction.text);
    if (push) { pending.push(push[1] === "EBX" ? ebx : Number.parseInt(push[1], 16)); continue; }
    const call = /^CALL (0x[0-9a-f]+)$/.exec(instruction.text);
    if (call) calls.push({ helper: call[1], args: pending.splice(0), callVa: instruction.address });
  }
  const simple = (name) => {
    const matches = calls.filter(({ helper }) => helper === HELPERS[name]);
    if (matches.length !== 1 || matches[0].args.length !== 3) throw new Error(`class ${spec.internalClass} ${name} initializer call is invalid`);
    const [phaseCount, frameStart, slot] = matches[0].args;
    return { state: spec.states[name][0], helper: HELPERS[name], phaseCount, frameStart, frameStride: phaseCount, slot, callVa: matches[0].callVa };
  };
  const deathCalls = calls.filter(({ helper }) => helper === HELPERS.death);
  if (deathCalls.length !== 5) throw new Error(`class ${spec.internalClass} must configure five death facings`);
  const death = deathCalls.map(({ args, callVa }) => ({ phaseCount: args[0], frameStart: args[1], slot: args[2], facingIndex: args[3], callVa }));
  if (death.some(({ phaseCount, frameStart, slot, facingIndex }) => phaseCount !== 8 || frameStart !== spec.states.death[1] || slot !== spec.sprite.slot || !Number.isInteger(facingIndex) || facingIndex < 0 || facingIndex > 4)) throw new Error(`class ${spec.internalClass} death initializer is invalid`);
  return { idle: simple("idle"), move: simple("move"), state2: simple("state2"), attack: simple("attack"), death: { state: 7, helper: HELPERS.death, phaseCount: 8, frameStart: spec.states.death[1], frameStride: 0, slot: spec.sprite.slot, facings: death } };
}

function inspectSprite(table, spec, path) {
  const entry = table.entries[spec.tableIndex];
  if (!entry) throw new Error(`missing sprite table ${spec.tableIndex}`);
  equal(entry.tableVa, spec.pointerCell, `${spec.path} pointer cell`);
  equal(entry.sourcePath, spec.path, `${spec.path} source path`);
  const bytes = readFileSync(path);
  equal(sha256(bytes), spec.sha256, `${path} SHA-256`);
  const header = parseSpriteLikeHeader(bytes, path);
  equal(header.width, spec.width, `${path} width`);
  equal(header.height, spec.height, `${path} height`);
  equal(header.frameCount, spec.frameCount, `${path} frame count`);
  return { path, sha256: spec.sha256, slot: spec.slot, tableIndex: spec.tableIndex, pointerCell: spec.pointerCell, sourcePath: spec.path, width: spec.width, height: spec.height, frameCount: spec.frameCount };
}

function readArtifact(path, sourceSha256, label) {
  const artifact = JSON.parse(readFileSync(path, "utf8"));
  equal(artifact.sourceSha256, sourceSha256, `${label} source SHA-256`);
  return artifact;
}
function requireSwitch(artifact, functionEntry, switchAddress) {
  const table = Object.values(artifact.tables ?? {}).find((candidate) => candidate.functionEntry === toHex(functionEntry) && candidate.switchAddress === toHex(switchAddress));
  if (!table) throw new Error(`missing switch ${toHex(switchAddress)}`);
  return table;
}
function requireCase(table, label) {
  const entry = table.cases.find((candidate) => candidate.label === label);
  if (!entry) throw new Error(`missing switch case ${label}`);
  return entry;
}
function inspectEvidence(buffer, image, va, bytes, meaning) {
  const expected = Buffer.from(bytes.replaceAll(" ", ""), "hex");
  const rawOffset = image.vaToRawOffset(va);
  const actual = rawOffset === undefined ? Buffer.alloc(0) : buffer.subarray(rawOffset, rawOffset + expected.length);
  return { va: toHex(va), rawOffset: rawOffset === undefined ? undefined : toHex(rawOffset), expectedBytes: bytes, actualBytes: actual.toString("hex").replace(/(..)/g, "$1 ").trim(), meaning, matched: Buffer.compare(expected, actual) === 0 };
}
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function equal(actual, expected, label) { if (actual !== expected) throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`); }
function deepEqual(actual, expected, label) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
function unsignedDword(value, label) { if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError(`${label} must be an unsigned DWORD`); }
function unsignedWord(value, label) { if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new RangeError(`${label} must be an unsigned WORD`); }
function signedWord(value, label) { if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) throw new RangeError(`${label} must be a signed WORD`); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputIndex = process.argv.indexOf("--output");
  const report = extractK01CoreUnitAnimations();
  if (outputIndex !== -1) writeFileSync(process.argv[outputIndex + 1], `${JSON.stringify({ schemaVersion: 1, vectors: report.testVectors }, null, 2)}\n`);
  else console.log(JSON.stringify(report, null, 2));
}
