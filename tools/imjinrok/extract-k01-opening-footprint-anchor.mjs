#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractMapEntities, parseMapHeader } from "./map-codec.mjs";
import { readPeImage, toHex } from "./pe-image.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DEFAULT_PATHS = {
  executablePath: resolve(ROOT, "original/imjinrok2/imjinrok2.exe"),
  functionsPath: resolve(ROOT, "analysis/generated/imjinrok2/functions.json"),
  referencesPath: resolve(ROOT, "analysis/generated/imjinrok2/references.json"),
  seedsPath: resolve(ROOT, "analysis/generated/imjinrok2/seeds.json"),
  catalogPath: resolve(ROOT, "analysis/generated/entity-type-catalog.json"),
  mapPath: resolve(ROOT, "original/imjinrok2/stagemap/k01.map"),
  fixturePath: resolve(ROOT, "analysis/fixtures/k01-opening-footprint-anchor-vectors.json"),
};
const CANONICAL_PATHS = {
  executablePath: "original/imjinrok2/imjinrok2.exe",
  functionsPath: "analysis/generated/imjinrok2/functions.json",
  referencesPath: "analysis/generated/imjinrok2/references.json",
  seedsPath: "analysis/generated/imjinrok2/seeds.json",
  catalogPath: "analysis/generated/entity-type-catalog.json",
  mapPath: "original/imjinrok2/stagemap/k01.map",
  fixturePath: "analysis/fixtures/k01-opening-footprint-anchor-vectors.json",
};

export const EXPECTED_EXECUTABLE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_SEEDS_SHA256 =
  "386b0f4e86c3376f34fe2b50fedb7e45b762c30784d4ebcc0387aa6f431811b2";
export const EXPECTED_CATALOG_SHA256 =
  "4cce8fd314848556433c5fd98263893919049b6be6a7a7e75988f628079c54da";
export const EXPECTED_K01_MAP_SHA256 =
  "43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb";

const TYPE_INITIALIZER_ENTRY = 0x0045bf50;
const TYPE_WRITER_ENTRY = 0x0045bd00;
const TYPE_TABLE_ADDRESS = 0x00882e10;
const TYPE_RECORD_STRIDE = 0x014c;
const TYPE_ARGUMENT_COUNT = 51;
const OPENING_BUILDING_CLASSES = [48, 49, 50, 51, 57, 58, 60, 62, 63];
const DYNAMIC_BUILDING_CLASSES = [52];
const CONTROL_CLASSES = [7];
const RELEVANT_CLASSES = [...new Set([...OPENING_BUILDING_CLASSES, ...DYNAMIC_BUILDING_CLASSES, ...CONTROL_CLASSES])];

const FUNCTIONS = [
  [0x0045bd00, "0x0045bd00-0x0045bef8", 103, "6561fe98f630ac5f7f0765426c257c4bc3900aae6d2964afa649447cb5030e8a"],
  [0x00437650, "0x00437650-0x00438025", 539, "4605056775f6f43c9b2065ea5a4ddff5570137eb87587f4a09d2018618e13c28"],
  [0x0048dbe0, "0x0048dbe0-0x0048dda9", 147, "f38e4577cf36c44f26097d94e200321d2a9bc6b0aa1696d572e40a600e7f7217"],
  [0x00483c50, "0x00483c50-0x00483c9f", 26, "d33ed40b3a614bcc92bc4b3b429dd372e61b4ef6ccb03b290feffd80c7a9ab4e"],
  [0x0043c9c0, "0x0043c9c0-0x0043d35f", 684, "eb1c7c21a9af5a2099a2d716ad1253db65fff75ef0befcae871e3462f4d3bcfa"],
  [0x0043b2d0, "0x0043b2d0-0x0043b4cd", 157, "c786f3bdbb59cd8e26ec6701baede222c2b8f756ae26dfc1acddc48e2e1f285d"],
  [0x0043ad30, "0x0043ad30-0x0043b2c0", 399, "73e365929407986912a6ab530245b134f87af2d5a65290b2137ffedef90acdfa"],
];

const ANCHORS = [
  [0x0045bd52, "66 89 41 14", "type argument 8 writes footprint width WORD to type +0x14"],
  [0x0045bd5b, "66 89 51 16", "type argument 9 writes footprint height WORD to type +0x16"],
  [0x00437bf5, "8a 90 24 2e 88 00 88 96 e3 01 00 00 8a 88 26 2e 88 00 88 8e e4 01 00 00", "creator copies type +0x14/+0x16 to runtime +0x1e3/+0x1e4"],
  [0x0048dcc1, "53 6a 64 6a 01 51 50 55 52 e8 81 5f ff ff", "map loader pushes raw owner, constants, y/x, source index, and type into create wrapper"],
  [0x00483c58, "66 a1 98 5f 7c 00", "create wrapper reads the global generation WORD before creator call"],
  [0x0043ad30, "56 8b f1 8a 86 f0 01 00 00 84 c0 75 04 33 c0 5e c3", "occupancy writer active gate +0x1f0"],
  [0x0043adc1, "66 09 14 45 e4 27 ae 00", "occupancy writer ORs runtime +0x1ec into mask grid before owner store"],
  [0x0043adf9, "03 c7 66 85 c0 7c 37 8b 15 90 2d ac 00 0f bf c0 3b c2 7d 2a 66 85 c9 7c 25 8b 15 94 2d ac 00 0f bf c9 3b ca 7d 18 66 8b 96 b6 01 00 00 8d 04 80 8d 04 c0 8d 0c 81 66 89 14 4d a4 2d ac 00", "centered footprint bounds check and owner-grid slot store"],
  [0x0043cdac, "e8 1f e5 ff ff 8b ce e8 48 f5 ff ff 8b ce e8 71 df ff ff", "action-1 dispatch calls clear, helper, then footprint writer"],
];

const CALLS = [
  [0x0048dcca, 0x0048dbe0, 0x00483c50],
  [0x00483c95, 0x00483c50, 0x00437650],
  [0x0043801a, 0x00437650, 0x0043c9c0],
  [0x0043cdac, 0x0043c9c0, 0x0043b2d0],
  [0x0043cdb3, 0x0043c9c0, 0x0043c300],
  [0x0043cdba, 0x0043c9c0, 0x0043ad30],
];

export function replayOpeningFootprint(vector) {
  if (vector.operation !== "write") throw new Error(`unsupported vector operation ${vector.operation}`);
  const input = vector.input ?? {};
  const mapWidth = input.mapWidth ?? 8;
  const mapHeight = input.mapHeight ?? 8;
  const ownerInput = input.ownerGrid ? [...input.ownerGrid] : Array(mapWidth * mapHeight).fill(0);
  const maskInput = input.maskGrid ? [...input.maskGrid] : Array(mapWidth * mapHeight).fill(0);
  if (input.existingOwner) ownerInput[cellIndex(input.existingOwner.x, input.existingOwner.y, mapHeight)] = input.existingOwner.value;
  if (input.existingMask) maskInput[cellIndex(input.existingMask.x, input.existingMask.y, mapHeight)] = input.existingMask.value;
  const occupancyMask = input.occupancyMask ?? 0x1000;
  const activeGate = input.activeGate ?? 1;
  const footprintReady = input.footprintReady ?? true;
  validateCoordinate(input.x, "x");
  validateCoordinate(input.y, "y");
  validateExtent(input.width, "width");
  validateExtent(input.height, "height");
  validateMap(mapWidth, mapHeight);
  validateSlot(input.slot);
  validateGrid(ownerInput, mapWidth, mapHeight);
  validateGrid(maskInput, mapWidth, mapHeight);
  validateUnsignedWord(occupancyMask, "occupancyMask");

  const ownerGrid = [...ownerInput];
  const maskGrid = [...maskInput];
  const writes = [];
  if (!footprintReady) {
    return { status: "skipped-before-footprint-copy", writes, ownerGrid, maskGrid, sideEffects: [] };
  }
  if (activeGate === 0) {
    return { status: "skipped-active-gate", writes, ownerGrid, maskGrid, sideEffects: [] };
  }
  for (let row = 0; row < input.height; row += 1) {
    for (let column = 0; column < input.width; column += 1) {
      const cellX = input.x - Math.floor(input.width / 2) + column;
      const cellY = input.y - Math.floor(input.height / 2) + row;
      if (!inBounds(cellX, cellY, mapWidth, mapHeight)) {
        writes.push({ x: cellX, y: cellY, result: "skip-oob" });
        continue;
      }
      const index = cellIndex(cellX, cellY, mapHeight);
      const beforeOwner = ownerGrid[index];
      const beforeMask = maskGrid[index];
      maskGrid[index] |= occupancyMask;
      ownerGrid[index] = input.slot;
      writes.push({ x: cellX, y: cellY, result: "mask-or-then-owner-store", beforeOwner, afterOwner: input.slot, beforeMask, afterMask: maskGrid[index] });
    }
  }
  return { status: "written", writes, ownerGrid, maskGrid, sideEffects: ["record-+0x40c=1"] };
}

export function extractK01OpeningFootprintAnchor(options = {}) {
  const paths = { ...DEFAULT_PATHS, ...options };
  const { buffer, image } = readPeImage(paths.executablePath);
  const sourceSha256 = sha256(buffer);
  assertEqual(sourceSha256, EXPECTED_EXECUTABLE_SHA256, "original EXE SHA-256");

  const functions = readArtifact(paths.functionsPath, sourceSha256, "functions");
  const references = readArtifact(paths.referencesPath, sourceSha256, "references");
  const seeds = readArtifact(paths.seedsPath, sourceSha256, "seeds");
  assertEqual(sha256(readFileSync(paths.seedsPath)), EXPECTED_SEEDS_SHA256, "seeds artifact SHA-256");
  const catalog = readJsonWithHash(paths.catalogPath, EXPECTED_CATALOG_SHA256, "entity type catalog");
  assertEqual(catalog.source?.executableSha256, sourceSha256, "entity type catalog executable SHA-256");
  const mapBuffer = readFileSync(paths.mapPath);
  const mapSha256 = sha256(mapBuffer);
  assertEqual(mapSha256, EXPECTED_K01_MAP_SHA256, "K01 map SHA-256");
  const mapHeader = parseMapHeader(mapBuffer, paths.mapPath);
  const mapEntities = extractMapEntities(mapBuffer, mapHeader).entities.filter((entity) => entity.active);

  const functionEvidence = FUNCTIONS.map((contract) => validateFunction(functions.functions, contract));
  const byteAnchors = ANCHORS.map(([va, bytes, meaning]) => readAnchor(buffer, image, { va, bytes, meaning }));
  const callEdges = CALLS.map(([site, caller, callee]) => requireCall(references, seeds, site, caller, callee));
  const typeCalls = extractTypeCalls(requireSeedFunction(seeds, TYPE_INITIALIZER_ENTRY).instructions);
  const catalogTypes = new Map(catalog.types.map((type) => [type.internalClass, type]));
  const footprints = RELEVANT_CLASSES.map((internalClass) => {
    const typeCall = typeCalls.find((candidate) => candidate.internalClass === internalClass);
    if (!typeCall) throw new Error(`type initializer is missing class ${internalClass}`);
    const catalogType = catalogTypes.get(internalClass);
    if (!catalogType) throw new Error(`entity type catalog is missing class ${internalClass}`);
    const width = requireArgument(typeCall, 8);
    const height = requireArgument(typeCall, 9);
    validateExtent(width, `class ${internalClass} width`);
    validateExtent(height, `class ${internalClass} height`);
    return {
      internalClass,
      originalGameplayName: catalogType.originalGameplayName,
      typeRecordAddress: toHex(typeCall.recordAddress),
      initializerCallAddress: toHex(typeCall.callAddress),
      width,
      height,
      source: "type-writer-arguments-8/9",
    };
  });
  const footprintByClass = new Map(footprints.map((value) => [value.internalClass, value]));
  const openingRecords = mapEntities
    .filter((entity) => OPENING_BUILDING_CLASSES.includes(entity.typeId))
    .map((entity) => {
      const footprint = footprintByClass.get(entity.typeId);
      if (!footprint) throw new Error(`missing footprint for map class ${entity.typeId}`);
      return {
        sourceEntityIndex: entity.index,
        internalClass: entity.typeId,
        originalGameplayName: footprint.originalGameplayName,
        rawOwnerWord: entity.ownerId,
        sourcePosition: { x: entity.x, y: entity.y },
        width: footprint.width,
        height: footprint.height,
        occupiedCells: deriveCells(entity.x, entity.y, footprint.width, footprint.height, mapHeader.width, mapHeader.height),
      };
    });
  assertEqual(openingRecords.length, 15, "K01 opening building record count");

  const fixture = readFixture(paths.fixturePath, sourceSha256);
  const vectors = fixture.vectors.map((vector) => {
    const result = replayOpeningFootprint(vector);
    assertEqual(sha256(Buffer.from(JSON.stringify(result))), vector.expectedSha256, `${vector.id} replay SHA-256`);
    if (vector.expected && Object.keys(vector.expected).length > 0) assertDeepEqual(result, vector.expected, `${vector.id} expected result`);
    return { id: vector.id, operation: vector.operation, result };
  });

  return {
    schemaVersion: 1,
    question: "K01 opening building footprint width/height, anchor, map-edge handling, and occupancy write ordering",
    analysisStatus: "static-confirmed-opening-footprint-anchor",
    reproductionStatus: "reproduction-complete",
    implementationStatus: "k01-building-extents-and-anchor-integrated",
    implementationBoundary: "shared source-center resolver is integrated; collision admission, native owner writes, and full source movement remain separate",
    source: {
      executablePath: CANONICAL_PATHS.executablePath,
      executableSha256: sourceSha256,
      mapPath: CANONICAL_PATHS.mapPath,
      mapSha256,
      mapDimensions: { width: mapHeader.width, height: mapHeader.height },
      catalogPath: CANONICAL_PATHS.catalogPath,
      catalogSha256: EXPECTED_CATALOG_SHA256,
      seedsPath: CANONICAL_PATHS.seedsPath,
      seedsSha256: sha256(readFileSync(paths.seedsPath)),
    },
    layout: {
      typeTableAddress: toHex(TYPE_TABLE_ADDRESS),
      typeRecordStride: toHex(TYPE_RECORD_STRIDE),
      typeFields: { footprintWidth: "+0x14 WORD (creator consumes low BYTE)", footprintHeight: "+0x16 WORD (creator consumes low BYTE)" },
      runtimeFields: { footprintWidth: "+0x1e3 BYTE", footprintHeight: "+0x1e4 BYTE", slot: "+0x1b6 WORD", generation: "+0x1b8 WORD", x: "+0x1bc signed WORD", y: "+0x1be signed WORD", activeGate: "+0x1f0 BYTE", occupancyReady: "+0x40c WORD" },
      grids: { owner: { address: "0x00ac2da4", cellWidth: "WORD", value: "runtime +0x1b6 slot" }, mask: { address: "0x00ae27e4", cellWidth: "WORD", operation: "OR runtime +0x1ec" } },
    },
    functionEvidence,
    byteAnchors,
    callEdges,
    anchorRule: { formula: "cellX = x - floor(width/2) + column; cellY = y - floor(height/2) + row", rounding: "integer floor/truncation of positive BYTE extent; even extents bias toward negative side", ownerWriteOrder: ["mask WORD OR", "owner-grid WORD store"], oob: "each footprint cell outside map dimensions is skipped; in-bounds cells still write" },
    openingClasses: OPENING_BUILDING_CLASSES,
    dynamicClasses: DYNAMIC_BUILDING_CLASSES,
    footprints,
    openingRecords,
    transition: ["map loader scans source entity index 0..799", "loader rejects non-active/out-of-bounds centers then pushes raw owner, constants, y, x, source index, type", "wrapper increments generation and creator zeroes 0x558-byte record", "creator copies type footprint to runtime +0x1e3/+0x1e4", "creator enters dispatcher with action +0x1b0=1", "action 1 clears predecessor, runs helper, then footprint writer", "writer skips OOB cells, ORs mask, stores slot owner, and sets +0x40c"],
    vectors,
    unresolved: ["raw map owner WORD is not promoted to occupancy owner; occupancy grid stores runtime slot +0x1b6", "active-gate and alternate mode branches outside canonical opening action-1 mode are not generalized", "overlap policy is writer order (existing owner is not tested in this mode), not a collision-admission claim", "pixel sprite dimensions, pivot, construction/damaged visuals, and player-owner semantics remain outside this packet"],
    fixture: { path: CANONICAL_PATHS.fixturePath, sha256: sha256(readFileSync(paths.fixturePath)), vectorCount: fixture.vectors.length },
  };
}

function deriveCells(x, y, width, height, mapWidth, mapHeight) {
  const cells = [];
  for (let row = 0; row < height; row += 1) for (let column = 0; column < width; column += 1) {
    const cellX = x - Math.floor(width / 2) + column;
    const cellY = y - Math.floor(height / 2) + row;
    if (inBounds(cellX, cellY, mapWidth, mapHeight)) cells.push({ x: cellX, y: cellY });
  }
  return cells;
}

function extractTypeCalls(instructions) {
  const calls = [];
  const registerValues = new Map();
  let currentRecordAddress;
  let pushedArguments = [];
  for (const instruction of instructions) {
    const constantMove = /^MOV (E[A-Z]{2}),(-?0x[0-9a-f]+)$/.exec(instruction.text);
    if (constantMove) {
      registerValues.set(constantMove[1], parseImmediate(constantMove[2]));
      if (constantMove[1] === "ECX") currentRecordAddress = parseImmediate(constantMove[2]);
    }
    const push = /^PUSH (.+)$/.exec(instruction.text);
    if (push) pushedArguments.push({ instructionAddress: Number(instruction.address), value: resolvePushValue(push[1], registerValues) });
    if (instruction.text !== `CALL ${toHex(TYPE_WRITER_ENTRY)}`) continue;
    if (pushedArguments.length === TYPE_ARGUMENT_COUNT + 1 && pushedArguments[0].instructionAddress === TYPE_INITIALIZER_ENTRY) pushedArguments = pushedArguments.slice(1);
    if (pushedArguments.length !== TYPE_ARGUMENT_COUNT) throw new Error(`type writer call at ${instruction.address} has ${pushedArguments.length} arguments`);
    if (currentRecordAddress === undefined) throw new Error(`type writer call at ${instruction.address} has no ECX record`);
    const internalClass = (currentRecordAddress - TYPE_TABLE_ADDRESS) / TYPE_RECORD_STRIDE;
    if (!Number.isInteger(internalClass)) throw new Error(`unaligned type record ${toHex(currentRecordAddress)}`);
    calls.push({ internalClass, recordAddress: currentRecordAddress, callAddress: Number(instruction.address), arguments: pushedArguments });
    currentRecordAddress = undefined;
    pushedArguments = [];
  }
  return calls;
}
function requireArgument(typeCall, argumentIndex) {
  const argument = typeCall.arguments[TYPE_ARGUMENT_COUNT - 1 - argumentIndex];
  if (!argument || argument.value === undefined) throw new Error(`class ${typeCall.internalClass} argument ${argumentIndex} is unresolved`);
  return argument.value;
}
function resolvePushValue(operand, registers) { return /^-?0x[0-9a-f]+$/.test(operand) ? parseImmediate(operand) : registers.get(operand); }
function parseImmediate(value) { const negative = value.startsWith("-"); const digits = negative ? value.slice(3) : value.slice(2); const parsed = Number.parseInt(digits, 16); return negative ? -parsed : parsed; }
function requireSeedFunction(seeds, entry) { const value = seeds.functions?.find((candidate) => candidate.entry === toHex(entry)); if (!value?.instructions) throw new Error(`seeds artifact is missing ${toHex(entry)}`); return value; }
function requireCall(references, seeds, site, caller, callee) {
  const functionReport = seeds.functions?.find((candidate) => candidate.entry === toHex(caller));
  const seeded = functionReport?.instructions?.find((value) => Number.parseInt(value.address, 16) === site && value.text === `CALL ${toHex(callee)}`);
  const reference = references.references?.find((value) => value.from === toHex(site) && value.fromFunctionEntry === toHex(caller) && value.to === toHex(callee));
  if (!seeded || !reference) throw new Error(`call edge missing ${toHex(site)} -> ${toHex(callee)}`);
  return { callSite: toHex(site), caller: toHex(caller), callee: toHex(callee) };
}
function validateFunction(functions, [entry, range, count, instructionSha256]) { const value = functions.find((candidate) => candidate.entry === toHex(entry)); if (!value) throw new Error(`functions artifact is missing ${toHex(entry)}`); assertDeepEqual(value.bodyRanges, [range], `${toHex(entry)} body range`); assertEqual(value.instructionCount, count, `${toHex(entry)} instruction count`); assertEqual(value.instructionSha256, instructionSha256, `${toHex(entry)} instruction SHA-256`); return { entry: value.entry, bodyRange: range, instructionCount: count, instructionSha256 }; }
function readAnchor(buffer, image, anchor) { const offset = image.vaToRawOffset(anchor.va); if (offset === undefined) throw new Error(`${toHex(anchor.va)} is not file-backed`); const expected = Buffer.from(anchor.bytes.replaceAll(" ", ""), "hex"); if (!buffer.subarray(offset, offset + expected.length).equals(expected)) throw new Error(`byte anchor mismatch at ${toHex(anchor.va)}`); return { id: anchor.meaning, va: toHex(anchor.va), rawOffset: toHex(offset), bytes: anchor.bytes }; }
function readArtifact(path, sourceSha256, label) { const value = JSON.parse(readFileSync(path, "utf8")); assertEqual(value.sourceSha256, sourceSha256, `${label} source SHA-256`); return value; }
function readJsonWithHash(path, expected, label) { const bytes = readFileSync(path); assertEqual(sha256(bytes), expected, `${label} SHA-256`); return JSON.parse(bytes.toString("utf8")); }
function readFixture(path, sourceSha256) { const value = JSON.parse(readFileSync(path, "utf8")); assertEqual(value.sourceSha256, sourceSha256, "fixture source SHA-256"); if (!Array.isArray(value.vectors) || value.vectors.length === 0) throw new Error("fixture vectors are required"); return value; }
function cellIndex(x, y, mapHeight) { return x * mapHeight + y; }
function inBounds(x, y, width, height) { return x >= 0 && x < width && y >= 0 && y < height; }
function validateCoordinate(value, name) { if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) throw new RangeError(`${name} must be a signed WORD`); }
function validateExtent(value, name) { if (!Number.isInteger(value) || value < 1 || value > 0x7f) throw new RangeError(`${name} must be a positive BYTE extent`); }
function validateMap(width, height) { if (!Number.isInteger(width) || width < 1 || width > 0x7fff || !Number.isInteger(height) || height < 1 || height > 0x7fff) throw new RangeError("map dimensions must be positive signed WORDs"); }
function validateSlot(value) { if (!Number.isInteger(value) || value < 1 || value >= 1200) throw new RangeError("slot must be in 1..1199"); }
function validateUnsignedWord(value, name) { if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new RangeError(`${name} must be an unsigned WORD`); }
function validateGrid(grid, width, height) { if (!Array.isArray(grid) || grid.length !== width * height || grid.some((value) => !Number.isInteger(value) || value < 0 || value > 0xffff)) throw new RangeError("grid must contain unsigned WORD cells"); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function assertEqual(actual, expected, label) { if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`); }
function assertDeepEqual(actual, expected, label) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} mismatch`); }

function parseArgs(argv) { const options = {}; const names = new Map([["--input", "executablePath"], ["--functions", "functionsPath"], ["--references", "referencesPath"], ["--seeds", "seedsPath"], ["--catalog", "catalogPath"], ["--map", "mapPath"], ["--fixture", "fixturePath"]]); for (let index = 0; index < argv.length; index += 1) { if (argv[index] === "--json") continue; const key = names.get(argv[index]); if (!key || argv[index + 1] === undefined) throw new Error(`Unknown or incomplete option ${argv[index]}`); options[key] = argv[++index]; } return options; }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(extractK01OpeningFootprintAnchor(parseArgs(process.argv.slice(2))), null, 2));
