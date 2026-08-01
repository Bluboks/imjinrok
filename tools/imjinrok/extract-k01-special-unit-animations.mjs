#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseSpriteLikeHeader } from "./codec.mjs";
import { EXPECTED_EXECUTABLE_SHA256, extractEntityTypeCatalog } from "./extract-entity-type-catalog.mjs";
import { NORMAL_DIRECTION_PROFILES } from "./extract-k01-core-unit-animations.mjs";
import { extractOriginalSpriteTable } from "./extract-sprite-table.mjs";
import { extractMapEntities, parseMapHeader } from "./map-codec.mjs";
import { readPeImage, toHex } from "./pe-image.mjs";

const DEFAULTS = {
  executablePath: "original/imjinrok2/imjinrok2.exe",
  functionsPath: "analysis/generated/imjinrok2/functions.json",
  jumpTablesPath: "analysis/generated/imjinrok2/jump-tables.json",
  seedsPath: "analysis/generated/imjinrok2/seeds.json",
  mapPath: "original/imjinrok2/stagemap/k01.map",
  budakPath: "original/imjinrok2/char/budak.spr",
  advbudajPath: "original/imjinrok2/char/advbudaj.spr",
};
const EXPECTED_K01_MAP_SHA256 = "43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb";

const CLASSES = [
  {
    internalClass: 11,
    originalGameplayName: "조선 승병",
    typeRecordAddress: "0x00883c54",
    typeFlags: 0x00080805,
    destination: 0x0042a520,
    endInclusive: 0x0042a5d4,
    projectKind: "korean-monk",
    mapRecords: [{ rawOwnerWord: 0, sourcePosition: { x: 9, y: 11 } }, { rawOwnerWord: 0, sourcePosition: { x: 7, y: 10 } }],
    sprite: { key: "budak", path: "char\\budak.spr", slot: 112, tableIndex: 12, pointerCell: "0x004bc254", sha256: "310a88a083316f3f5172cec3d5df667c6eb76648830bf153ef625fa276da3e17", width: 65, height: 50, frameCount: 140 },
    states: { idle: [8, 100, 8, 8], move: [1, 0, 8, 8], attack: [4, 50, 10, 10], death: [7, 40, 0, 8] },
  },
  {
    internalClass: 16,
    originalGameplayName: "일본 무녀",
    typeRecordAddress: "0x008842d0",
    typeFlags: 0x00080805,
    destination: 0x0042a5d5,
    endInclusive: 0x0042a689,
    projectKind: "japanese-shrine-maiden",
    mapRecords: [{ rawOwnerWord: 1, sourcePosition: { x: 11, y: 54 } }],
    sprite: { key: "advbudaj", path: "char\\advbudaj.spr", slot: 124, tableIndex: 24, pointerCell: "0x004bc284", sha256: "18399ae5b01edc38e58127c57d06f1463d0f5b86a1ded99970d8bb70b8c27754", width: 50, height: 50, frameCount: 300 },
    states: { idle: [8, 120, 8, 8], move: [1, 0, 8, 8], attack: [4, 60, 10, 10], death: [7, 40, 0, 8] },
  },
];

const HELPERS = { idle: "0x00438e50", move: "0x00438ef0", death: "0x004390b0", attack: "0x004390e0" };
const FUNCTION_CONTRACTS = [
  ["0x004291d0", ["0x004291d0-0x0042c547"], 4156, "1c05959938219ae4fa918ba3061b1856dcfb575f007a1a48281dd316709a7e96"],
  ["0x00438e50", ["0x00438e50-0x00438e7e"], 24, "4da58c373054099fbed3aa281d63f114a950c90471650f7cf4089bfefc0c1c00"],
  ["0x00438ef0", ["0x00438ef0-0x00438f1e"], 24, "31db374f6bdbf9efb342ff3b4ac12b2d2ba14487c66f46933dc3004826cf2bac"],
  ["0x004390b0", ["0x004390b0-0x004390d0"], 6, "8c576d98214fa38d4d64c0dc710a6e1452a92ceb33e39a9a563567976dd191df"],
  ["0x004390e0", ["0x004390e0-0x0043910e"], 24, "02510627f1038fb23f0100a2c3a540507c282404bf087e399f55cbc06dba7b3e"],
];

export function extractK01SpecialUnitAnimations(options = {}) {
  const paths = { ...DEFAULTS, ...options };
  const catalogSeedsPath = paths.catalogSeedsPath ?? paths.seedsPath;
  const { buffer } = readPeImage(paths.executablePath);
  const executableSha256 = sha256(buffer);
  equal(executableSha256, EXPECTED_EXECUTABLE_SHA256, "EXE SHA-256");
  const functions = readArtifact(paths.functionsPath, executableSha256, "functions");
  const functionEvidence = verifyFunctions(functions);
  const jumpTables = readArtifact(paths.jumpTablesPath, executableSha256, "jump tables");
  const classSwitch = requireSwitch(jumpTables, 0x004291d0, 0x004292b3);
  const seeds = readArtifact(paths.seedsPath, executableSha256, "seeds");
  const catalog = extractEntityTypeCatalog({ executablePath: paths.executablePath, seedsPath: catalogSeedsPath });
  const spriteTable = extractOriginalSpriteTable(paths.executablePath);
  const mapBuffer = readFileSync(paths.mapPath);
  equal(sha256(mapBuffer), EXPECTED_K01_MAP_SHA256, "K01 map SHA-256");
  const mapHeader = parseMapHeader(mapBuffer, paths.mapPath);
  const classes = CLASSES.map((spec) => recoverClass({ spec, classSwitch, seeds, catalog, spriteTable, spritePath: paths[`${spec.sprite.key}Path`], mapBuffer, mapHeader }));
  const testVectors = classes.flatMap((unit) =>
    Object.values(unit.states).flatMap((state) =>
      NORMAL_DIRECTION_PROFILES.flatMap(({ direction }) =>
        [0, state.phaseCount - 1].map((phase) =>
          selectK01SpecialUnitFrame({
            internalClass: unit.identity.internalClass,
            state: state.originalAnimationState,
            direction,
            phase,
          }),
        ),
      ),
    ),
  );
  return {
    schemaVersion: 1,
    question: "K01 class 11 조선 승병과 class 16 일본 무녀의 core states 8/1/4/7은 어떤 slot/frame/direction/mirror를 선택하는가?",
    analysisStatus: "static-confirmed",
    reproductionStatus: "reproduction-complete",
    implementationStatus: "theme-level-mapping",
    sources: { executable: { path: paths.executablePath, sha256: executableSha256 }, functions: { path: paths.functionsPath, sourceSha256: functions.sourceSha256 }, jumpTables: { path: paths.jumpTablesPath, sourceSha256: jumpTables.sourceSha256 }, seeds: { path: paths.seedsPath, sourceSha256: seeds.sourceSha256 }, map: { path: paths.mapPath, sha256: sha256(mapBuffer), width: mapHeader.width, height: mapHeader.height } },
    directions: NORMAL_DIRECTION_PROFILES,
    classes,
    functionEvidence,
    testVectors,
    acceptedInputScope: "K01 creation-default normal paths for states 8/1/4/7 only",
    unresolvedScope: "original timing/FPS, pivots, stats, behavior, magic, state 2, later runtime mutation, and death lifetime remain outside this mapping.",
  };
}

export function selectK01SpecialUnitFrame({ internalClass, state, direction, phase }) {
  const spec = CLASSES.find((candidate) => candidate.internalClass === internalClass);
  if (!spec) throw new RangeError("internalClass is outside scoped classes 11,16");
  signedWord(direction, "direction");
  const stateEntry = Object.entries(spec.states).find(([, value]) => value[0] === state);
  if (!stateEntry) throw new RangeError("state is outside scoped set 1,4,7,8");
  const [stateName, [, frameStart, frameStride, phaseCount]] = stateEntry;
  if (!Number.isInteger(phase) || phase < 0 || phase >= phaseCount) throw new RangeError(`phase is outside recovered 0..${phaseCount - 1}`);
  const profile = NORMAL_DIRECTION_PROFILES.find((candidate) => candidate.direction === direction);
  if (!profile) throw new RangeError("direction is outside recovered normal grid set");
  return { internalClass, state, stateName, direction, facing: profile.facing, phase, spriteSlot: spec.sprite.slot, sourcePath: spec.sprite.path, frameIndex: frameStart + profile.frameBaseIndex * frameStride + phase, mirrorX: profile.mirrorX };
}

function recoverClass({ spec, classSwitch, seeds, catalog, spriteTable, spritePath, mapBuffer, mapHeader }) {
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
  const records = extractMapEntities(mapBuffer, mapHeader).entities.filter((entity) => entity.active && entity.typeId === spec.internalClass).map((entity) => ({ rawOwnerWord: entity.ownerId, sourcePosition: { x: entity.x, y: entity.y } }));
  deepEqual(records, spec.mapRecords, `K01 class ${spec.internalClass} source map records`);
  return { identity: { internalClass: spec.internalClass, originalGameplayName: spec.originalGameplayName, typeRecordAddress: spec.typeRecordAddress, typeFlags: toHex(spec.typeFlags), projectKind: spec.projectKind, identityMapping: "exact-static-identity-source" }, initializerRange: { start: toHex(spec.destination), end: toHex(spec.endInclusive) }, sprite, initializers, states, mapRecords: records.map((record) => ({ ...record, projectKind: spec.projectKind, identityMapping: "exact-static-identity-source" })) };
}

function recoverInitializers(seeds, spec) {
  const initializer = seeds.functions?.find(({ entry }) => entry === "0x004291d0");
  if (!initializer?.instructions) throw new Error("seeds artifact is missing initializer instructions");
  const registers = {};
  const pending = [];
  const calls = [];
  for (const instruction of initializer.instructions) {
    const address = Number.parseInt(instruction.address, 16);
    if (address < spec.destination || address > spec.endInclusive) continue;
    const moveImmediate = /^MOV (EBX|EDI),0x([0-9a-f]+)$/.exec(instruction.text);
    if (moveImmediate) registers[moveImmediate[1]] = Number.parseInt(moveImmediate[2], 16);
    const push = /^PUSH (0x[0-9a-f]+|EBX|EDI)$/.exec(instruction.text);
    if (push) {
      const value = push[1].startsWith("0x") ? Number.parseInt(push[1], 16) : registers[push[1]];
      if (!Number.isInteger(value)) throw new Error(`class ${spec.internalClass} initializer uses an untracked ${push[1]} value`);
      pending.push(value);
      continue;
    }
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
  return { idle: simple("idle"), move: simple("move"), attack: simple("attack"), death: { state: 7, helper: HELPERS.death, phaseCount: 8, frameStart: spec.states.death[1], frameStride: 0, slot: spec.sprite.slot, facings: death } };
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
function verifyFunctions(functions) { return FUNCTION_CONTRACTS.map(([entry, bodyRanges, instructionCount, instructionSha256]) => { const actual = functions.functions.find((candidate) => candidate.entry === entry); if (!actual) throw new Error(`functions artifact is missing ${entry}`); deepEqual(actual.bodyRanges, bodyRanges, `${entry} body ranges`); equal(actual.instructionCount, instructionCount, `${entry} instruction count`); equal(actual.instructionSha256, instructionSha256, `${entry} instruction SHA-256`); return { entry, bodyRanges, instructionCount, instructionSha256 }; }); }
function readArtifact(path, sourceSha256, label) { const artifact = JSON.parse(readFileSync(path, "utf8")); equal(artifact.sourceSha256, sourceSha256, `${label} source SHA-256`); return artifact; }
function requireSwitch(artifact, functionEntry, switchAddress) { const table = Object.values(artifact.tables ?? {}).find((candidate) => candidate.functionEntry === toHex(functionEntry) && candidate.switchAddress === toHex(switchAddress)); if (!table) throw new Error(`missing switch ${toHex(switchAddress)}`); return table; }
function requireCase(table, label) { const entry = table.cases.find((candidate) => candidate.label === label); if (!entry) throw new Error(`missing switch case ${label}`); return entry; }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function equal(actual, expected, label) { if (actual !== expected) throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`); }
function deepEqual(actual, expected, label) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
function signedWord(value, label) { if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) throw new RangeError(`${label} must be a signed WORD`); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputIndex = process.argv.indexOf("--output");
  const report = extractK01SpecialUnitAnimations();
  if (outputIndex >= 0) writeFileSync(process.argv[outputIndex + 1], `${JSON.stringify(report, null, 2)}\n`);
  else console.log(JSON.stringify(report, null, 2));
}
