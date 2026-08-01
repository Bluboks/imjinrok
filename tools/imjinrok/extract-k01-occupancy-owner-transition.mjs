#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readPeImage, toHex } from "./pe-image.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DEFAULT_PATHS = {
  executablePath: resolve(ROOT, "original/imjinrok2/imjinrok2.exe"),
  functionsPath: resolve(ROOT, "analysis/generated/imjinrok2/functions.json"),
  referencesPath: resolve(ROOT, "analysis/generated/imjinrok2/references.json"),
  seedsPath: resolve(ROOT, "analysis/generated/imjinrok2/seeds.json"),
  fixturePath: resolve(ROOT, "analysis/fixtures/k01-occupancy-owner-transition-vectors.json"),
};
const CANONICAL_PATHS = {
  executablePath: "original/imjinrok2/imjinrok2.exe",
  functionsPath: "analysis/generated/imjinrok2/functions.json",
  referencesPath: "analysis/generated/imjinrok2/references.json",
  seedsPath: "analysis/generated/imjinrok2/seeds.json",
  fixturePath: "analysis/fixtures/k01-occupancy-owner-transition-vectors.json",
};
export const EXPECTED_EXECUTABLE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";

const MAP_WIDTH = 60;
const MAP_HEIGHT = 60;
const SLOT_COUNT = 1200;
const FUNCTIONS = [
  [0x00488420, "0x00488420-0x004884b5", 59, "4b4841d6b3756b3d2dd3f3c6621ab98a413ce4608ea3d5c9c737ee1618c3ee8b"],
  [0x00483a60, "0x00483a60-0x00483a9c", 25, "887217ddc12a9bc4dd90c38b9365be9bcaf65f14e1d0c709de86c62479cbd917"],
  [0x00483c50, "0x00483c50-0x00483c9f", 26, "d33ed40b3a614bcc92bc4b3b429dd372e61b4ef6ccb03b290feffd80c7a9ab4e"],
  [0x00437650, "0x00437650-0x00438025", 539, "4605056775f6f43c9b2065ea5a4ddff5570137eb87587f4a09d2018618e13c28"],
  [0x0043c9c0, "0x0043c9c0-0x0043d35f", 684, "eb1c7c21a9af5a2099a2d716ad1253db65fff75ef0befcae871e3462f4d3bcfa"],
  [0x0043b2d0, "0x0043b2d0-0x0043b4cd", 157, "c786f3bdbb59cd8e26ec6701baede222c2b8f756ae26dfc1acddc48e2e1f285d"],
  [0x0043c300, "0x0043c300-0x0043c9b1", 524, "7b235cc2bd3826f8cc3e6d7c69cd7dd063cbd753a09e2cd2ee6904d4d17900ee"],
  [0x0043ad30, "0x0043ad30-0x0043b2c0", 399, "73e365929407986912a6ab530245b134f87af2d5a65290b2137ffedef90acdfa"],
  [0x00425af0, "0x00425af0-0x00425b10", 11, "272a5455b2f3c25d58ce435d1823c517615c8b739dc4952c8aec1f8cb03ce29c"],
  [0x00425b20, "0x00425b20-0x004262df", 506, "088a31ecaf83338b1823a4a21e14bb859690289d56f8bc53338145492a8e24c7"],
  [0x0043ac50, "0x0043ac50-0x0043ad21", 74, "bc64656f61574d2f6ad65590c9ee8b565f34b99fd5be10bb72d6ee5c311583bb"],
  [0x00445290, "0x00445290-0x0044532d", 58, "02f38d2a527b4e57521e7872f0d0f8c6952b9cad70044dbe7a1dffa672fc3438"],
  [0x0043d540, "0x0043d540-0x0043d65b", 71, "98aea3591f2813434aeb6cc048dc36b911c858067f86b2d25ed3eccb2025453f"],
  [0x004651b0, "0x004651b0-0x00465206", 25, "e6d8ffb30a8a925132578ce7c128fecc49f90e0d5a4d3a58dc42a33b02a0fd26"],
  [0x00447360, "0x00447360-0x00447599", 156, "8700298d4e2900a0f2833b1f9e1143c47d324478ef5fa419170e7945de7dd772"],
  [0x00483aa0, "0x00483aa0-0x00483c2e", 95, "f9b1728467f73a29667e631456c36d26eda15b6f44e8c89b78c6b1ec25f27be9"],
];

// These anchors deliberately include the stores and branches that decide the transition order.
const ANCHORS = [
  [0x0048843f, "55 e8 1b b6 ff ff 83 c4 04 66 85 c0 74 56", "native descriptor allocates before signed bounds"],
  [0x00488494, "e8 b7 b7 ff ff 83 c4 1c 83 44 24 10 04 eb 8e 5f", "in-bounds descriptor reaches create wrapper"],
  [0x0043782e, "66 89 86 b6 01 00 00 66 8b 44 24 24 66 89 be b0 01 00 00 88 5e 37 88 5e 38 66 89 8e b8 01 00 00 66 89 96 bc 01 00 00 66 89 86 be 01 00 00", "initializer stores slot, generation, and signed x/y"],
  [0x0043cdac, "e8 1f e5 ff ff 8b ce e8 48 f5 ff ff 8b ce e8 71 df ff ff", "action 1 calls clear, movement helper, writer in order"],
  [0x0043b35a, "66 c7 04 4d a4 2d ac 00 00 00", "mobile mode clears prior owner-grid cell"],
  [0x0043b39b, "e8 10 9e 02 00", "prior mask clear helper is called after old-cell computation"],
  [0x0043ad30, "56 8b f1 8a 86 f0 01 00 00 84 c0 75 04 33 c0 5e c3", "writer active gate"],
  [0x0043adf9, "03 c7 66 85 c0 7c 37 8b 15 90 2d ac 00 0f bf c0 3b c2 7d 2a 66 85 c9 7c 25 8b 15 94 2d ac 00 0f bf c9 3b ca 7d 18 66 8b 96 b6 01 00 00 8d 04 80 8d 04 c0 8d 0c 81 66 89 14 4d a4 2d ac 00", "writer stores slot without loading/testing prior owner"],
  [0x00425e1e, "e8 2d 4e 01 00 3b c5", "normal movement checks next mask before commit"],
  [0x00425f90, "66 89 8e bc 01 00 00", "movement commits new x after progress reaches 0x32"],
  [0x00425fb3, "66 89 86 be 01 00 00", "movement commits new y after progress reaches 0x32"],
  [0x0043acd8, "66 8b 04 4d e4 27 ae 00 8b 4c 24 28 23 c1 66 85 c0 75 1c", "mask consumer returns blocked on nonzero intersection"],
  [0x004651ee, "66 81 a4 51 f4 27 02 00 ff 0f", "mask clear preserves low 12 bits"],
  [0x00447499, "e8 22 55 ff ff 85 c0 75 0c 66 8b 16 52 e8 f5 c5 03 00", "outer update releases only when entity dispatcher returns zero"],
  [0x00483b22, "66 8b 8e 12 54 63 00", "release reads active-list position before swap-last"],
  [0x00483c1b, "66 89 1c 7d d8 0e 7d 00", "release clears active-table after list cleanup"],
];

const CALLS = [
  [0x0048a7ae, 0x0048a5c0, 0x00488420],
  [0x00488440, 0x00488420, 0x00483a60],
  [0x00488494, 0x00488420, 0x00483c50],
  [0x00483c95, 0x00483c50, 0x00437650],
  [0x0043801a, 0x00437650, 0x0043c9c0],
  [0x0043cdac, 0x0043c9c0, 0x0043b2d0],
  [0x0043cdb3, 0x0043c9c0, 0x0043c300],
  [0x0043cdba, 0x0043c9c0, 0x0043ad30],
  [0x00425e1e, 0x00425b20, 0x0043ac50],
  [0x00425c59, 0x00425b20, 0x00445290],
  [0x00426004, 0x00425b20, 0x0043d540],
  [0x00447499, 0x00447360, 0x0043c9c0],
  [0x004474a6, 0x00447360, 0x00483aa0],
  [0x00483ad4, 0x00483aa0, 0x0043b2d0],
];

export function replayOccupancyTransition(vector) {
  switch (vector.operation) {
    case "create": return replayCreate(vector.input);
    case "move": return replayMove(vector.input);
    case "commit": return replayCommit(vector.input);
    case "release": return replayRelease(vector.input);
    case "death": return replayDeath(vector.input);
    case "handle": return replayHandle(vector.input);
    case "allocation": return replayAllocation(vector.input);
    default: throw new Error(`unsupported vector operation ${vector.operation}`);
  }
}

export function replayCreate({ x, y, slot, generation, width = 1, height = 1, mapWidth = MAP_WIDTH, mapHeight = MAP_HEIGHT, ownerGrid, maskGrid, occupancyMask = 0x1000, recordOwner = 1, occupantOwner = null }) {
  validateCoordinate(x, "x"); validateCoordinate(y, "y"); validateSlot(slot); validateUnsignedWord(generation, "generation");
  validateMap(mapWidth, mapHeight); validateGrid(ownerGrid, mapWidth, mapHeight); validateGrid(maskGrid, mapWidth, mapHeight);
  validatePositiveExtent(width, "width"); validatePositiveExtent(height, "height"); validateUnsignedWord(occupancyMask, "occupancyMask");
  const nextOwner = [...ownerGrid]; const nextMask = [...maskGrid]; const writes = [];
  for (let row = 0; row < height; row += 1) for (let column = 0; column < width; column += 1) {
    const cellX = x - Math.floor(width / 2) + column; const cellY = y - Math.floor(height / 2) + row;
    if (!inBounds(cellX, cellY, mapWidth, mapHeight)) { writes.push({ x: cellX, y: cellY, result: "skip-oob" }); continue; }
    const index = cellIndex(cellX, cellY, mapHeight);
    nextMask[index] |= occupancyMask;
    nextOwner[index] = slot;
    writes.push({ x: cellX, y: cellY, result: "mask-or-then-owner-store", beforeOwner: ownerGrid[index], afterOwner: slot });
  }
  return { returnValue: 1, record: { slot, generation, x, y, width, height, recordOwner }, occupantOwner, ownerGrid: nextOwner, maskGrid: nextMask, writes, sideEffects: ["record-+0x40c=1"] };
}

export function replayMove({ oldX, oldY, newX, newY, slot, width = 1, height = 1, mapWidth = MAP_WIDTH, mapHeight = MAP_HEIGHT, ownerGrid, maskGrid, occupancyMask = 0x1000, movement: movementResult = "commit", progress = 0x32 }) {
  validateCoordinate(oldX, "oldX"); validateCoordinate(oldY, "oldY"); validateCoordinate(newX, "newX"); validateCoordinate(newY, "newY"); validateSlot(slot);
  validateMap(mapWidth, mapHeight); validateGrid(ownerGrid, mapWidth, mapHeight); validateGrid(maskGrid, mapWidth, mapHeight);
  validatePositiveExtent(width, "width"); validatePositiveExtent(height, "height"); validateUnsignedWord(occupancyMask, "occupancyMask");
  const nextOwner = [...ownerGrid]; const nextMask = [...maskGrid]; const events = ["clear-old-owner", "clear-old-mask"];
  clearFootprint(nextOwner, nextMask, oldX, oldY, width, height, mapWidth, mapHeight, occupancyMask);
  const committed = movementResult === "commit" && progress >= 0x32;
  const currentX = committed ? newX : oldX; const currentY = committed ? newY : oldY;
  events.push(committed ? "movement-coordinate-commit" : "movement-failure-no-coordinate-commit");
  const write = replayCreate({ x: currentX, y: currentY, slot, generation: 0, width, height, mapWidth, mapHeight, ownerGrid: nextOwner, maskGrid: nextMask, occupancyMask });
  events.push("write-new-mask", "write-new-owner");
  return { movementResult, progress, committed, coordinatesAfter: { x: currentX, y: currentY }, ownerGrid: write.ownerGrid, maskGrid: write.maskGrid, events, failureSideEffect: committed ? "none" : "old-cell-is-rewritten-by-following-action-1-writer" };
}

export function replayCommit({ current, target, slot, progress, collision }) {
  validateCoordinate(current.x, "current.x"); validateCoordinate(current.y, "current.y"); validateCoordinate(target.x, "target.x"); validateCoordinate(target.y, "target.y"); validateSlot(slot);
  if (collision === "blocked") return { returnValue: 0, committed: false, coordinatesAfter: current, sideEffects: ["movement-collision-branch", "coordinate-fields-unchanged", "action-1-writer-may-rewrite-current-cell"] };
  if (progress < 0x32) return { returnValue: 0, committed: false, coordinatesAfter: current, sideEffects: ["sub-threshold-progress", "coordinate-fields-unchanged", "action-1-writer-rewrites-current-cell"] };
  return { returnValue: 0, committed: true, coordinatesAfter: target, sideEffects: ["write-+0x1bc", "write-+0x1be", "call-coordinate-postprocess"] };
}

export function replayRelease({ activeTableWord, activeGateByte = 1, occupancyReady = 1, slot, x, y, width = 1, height = 1, mapWidth = MAP_WIDTH, mapHeight = MAP_HEIGHT, ownerGrid, maskGrid, occupancyMask = 0x1000, reuseAge = 7 }) {
  validateUnsignedWord(activeTableWord, "activeTableWord"); validateByte(activeGateByte, "activeGateByte"); validateByte(occupancyReady, "occupancyReady"); validateSlot(slot); validateCoordinate(x, "x"); validateCoordinate(y, "y"); validateMap(mapWidth, mapHeight); validateGrid(ownerGrid, mapWidth, mapHeight); validateGrid(maskGrid, mapWidth, mapHeight);
  validatePositiveExtent(width, "width"); validatePositiveExtent(height, "height"); validateUnsignedWord(occupancyMask, "occupancyMask");
  const nextOwner = [...ownerGrid]; const nextMask = [...maskGrid]; const events = [];
  if (activeTableWord === 0) return { released: false, reason: "inactive-slot-early-return", activeTableWordAfter: 0, reuseAgeAfter: reuseAge, ownerGrid: nextOwner, maskGrid: nextMask, events: ["early-return-before-occupancy-clear"] };
  if (occupancyReady === 1 && activeGateByte !== 0) { clearFootprint(nextOwner, nextMask, x, y, width, height, mapWidth, mapHeight, occupancyMask); events.push("release-clear-owner-mask-before-active-table"); }
  else events.push("release-skips-occupancy-clear", activeGateByte === 0 ? "active-gate-failure" : "occupancy-ready-flag-not-one");
  events.push("active-list-cleanup", "active-table-clear", "reuse-age-clear");
  return { released: true, reason: "released", activeTableWordAfter: 0, reuseAgeAfter: 0, ownerGrid: nextOwner, maskGrid: nextMask, events, staleOccupancyPossible: occupancyReady !== 1 || activeGateByte === 0 };
}

export function replayDeath({ retain, activeTableWord = 1, activeGateByte = 1, occupancyReady = 1, slot = 1199, x = 10, y = 10, mapWidth = MAP_WIDTH, mapHeight = MAP_HEIGHT, ownerGrid = emptyGrid(mapWidth, mapHeight), maskGrid = emptyGrid(mapWidth, mapHeight) }) {
  if (retain) return { dispatcherReturn: 1, releaseCalled: false, activeTableWordAfter: activeTableWord, ownerGrid, maskGrid, sideEffects: ["health-zero-record-retained", "occupancy-not-cleared-by-action-7"] };
  const release = replayRelease({ activeTableWord, activeGateByte, occupancyReady, slot, x, y, mapWidth, mapHeight, ownerGrid, maskGrid });
  return { dispatcherReturn: 0, releaseCalled: true, release };
}

export function replayHandle({ slot, generation, recordSlot, recordGeneration, activeTableWord, healthWord, occupancyWord }) {
  validateSlot(slot); validateSlot(recordSlot); validateUnsignedWord(generation, "generation"); validateUnsignedWord(recordGeneration, "recordGeneration"); validateUnsignedWord(activeTableWord, "activeTableWord"); validateSignedWord(healthWord, "healthWord"); validateUnsignedWord(occupancyWord, "occupancyWord");
  const generationValid = activeTableWord !== 0 && healthWord > 0 && slot === recordSlot && generation === recordGeneration;
  return { generationValid, occupancyWordAfter: occupancyWord, occupancyRepresentation: "WORD slot only; no generation/owner comparison", staleGenerationCanRemainInGrid: occupancyWord === slot && !generationValid };
}

export function replayAllocation({ inactiveSlots = [1, 1199], ageOverrides = {} }) {
  const active = Array(SLOT_COUNT).fill(true); const ages = Array(SLOT_COUNT).fill(0);
  for (const slot of inactiveSlots) { validateSlot(slot); active[slot] = false; ages[slot] = ageOverrides[String(slot)] ?? 0; }
  let selected = 0; let best = 0;
  for (let slot = 1; slot < SLOT_COUNT; slot += 1) { if (active[slot]) continue; const age = signedWord(ages[slot]); if (age >= best) { best = age; selected = slot; } ages[slot] = signedWord(age + 1); }
  return { selectedSlot: selected, firstSlotAgeAfter: ages[1], lastSlotAgeAfter: ages[1199], generationConsumer: selected === 0 ? "allocation-failure-before-occupancy" : "initializer writes new generation before occupancy writer" };
}

export function extractK01OccupancyOwnerTransition(options = {}) {
  const paths = { ...DEFAULT_PATHS, ...options };
  const { buffer, image } = readPeImage(paths.executablePath);
  const sourceSha256 = sha256(buffer);
  assertEqual(sourceSha256, EXPECTED_EXECUTABLE_SHA256, "original EXE SHA-256");
  const functions = readArtifact(paths.functionsPath, sourceSha256, "functions");
  const references = readArtifact(paths.referencesPath, sourceSha256, "references");
  const seeds = readArtifact(paths.seedsPath, sourceSha256, "seeds");
  const fixture = readFixture(paths.fixturePath, sourceSha256);
  const functionEvidence = FUNCTIONS.map((contract) => validateFunction(functions.functions, contract));
  const byteAnchors = ANCHORS.map(([va, bytes, meaning]) => readAnchor(buffer, image, { va, bytes, meaning }));
  const callEdges = CALLS.map(([site, caller, callee]) => requireCall(references, seeds, site, caller, callee));
  const testVectors = fixture.vectors.map((vector) => {
    const result = replayOccupancyTransition(vector);
    assertEqual(sha256(Buffer.from(JSON.stringify(result))), vector.expectedSha256, `${vector.id} replay SHA-256`);
    if (vector.expected && Object.keys(vector.expected).length > 0) assertDeepEqual(result, vector.expected, `${vector.id} expected result`);
    return { id: vector.id, operation: vector.operation, result };
  });
  return {
    question: "K01 exact create, movement coordinate commit, death/release가 occupancy-owner grid를 어떤 순서로 읽고 쓰며 allocation/placement/movement/release 실패 뒤 무엇을 남기는가?",
    analysisStatus: "static-confirmed-bounded-occupancy-owner-transition",
    reproductionStatus: "reproduction-complete",
    implementationStatus: "analysis-only-no-production-change",
    source: { executablePath: CANONICAL_PATHS.executablePath, sha256: sourceSha256, format: "PE32 x86" },
    generatedArtifacts: {
      functions: artifactDescriptor(paths.functionsPath, functions, CANONICAL_PATHS.functionsPath),
      references: artifactDescriptor(paths.referencesPath, references, CANONICAL_PATHS.referencesPath),
      seeds: artifactDescriptor(paths.seedsPath, seeds, CANONICAL_PATHS.seedsPath),
    },
    functionEvidence,
    byteAnchors,
    callEdges,
    storage: {
      ownerGrid: { address: "0x00ac2da4", dimensions: "map width × map height (K01 60×60)", stride: "x*0xb4+y", width: "WORD", emptySentinel: 0, representation: "record +0x1b6 slot; no generation or player-owner alias proven" },
      maskGrid: { address: "0x00ae27e4", dimensions: "map width × map height", stride: "x*0xb4+y", width: "WORD", clearOperation: "WORD &= 0x0fff", writeOperation: "WORD |= record +0x1ec" },
      secondaryOwnerGrid: { address: "0x00ad2ac4", role: "non-mobile/alternate writer branch only; not promoted to K01 mobile owner grid" },
      record: { slot: "+0x1b6 WORD", generation: "+0x1b8 WORD", x: "+0x1bc signed WORD", y: "+0x1be signed WORD", footprint: "+0x1e3/+0x1e4 BYTE", mobileMode: "+0x68 BYTE", occupancyReady: "+0x40c WORD", activeGate: "+0x1f0 BYTE" },
    },
    transitionOrder: {
      exactCreate: ["allocate slot 1..1199", "increment generation and initialize slot/generation/x/y/action", "dispatcher action 1: clear helper", "movement helper (does not rewrite +0x1bc/+0x1be in immediate path)", "mobile writer: mask OR then owner-grid slot store", "set +0x40c=1"],
      movementCommit: ["clear old owner-grid footprint", "clear old mask footprint", "collision/mask check", "if blocked or progress<0x32: no coordinate write", "if progress>=0x32: write +0x1bc then +0x1be", "following action-1 writer writes mask then owner-grid slot"],
      release: ["action-7 returns 1 with retain bit/reference and outer loop keeps record", "return 0 reaches outer release", "release calls clear helper only when +0x40c==1", "clear helper may early-return when +0x1f0==0", "active-list swap/count/category cleanup", "active-table=0 then reuse-age=0"],
    },
    vectors: testVectors,
    handleLink: { source: "K01 source handle lifecycle", confirmed: "occupancy owner stores slot only; E01 generation-aware consumers remain separate", slotBoundaries: [1, 1199], staleGenerationConsumer: "active/health/full-reference consumers reject stale generation while a stale slot WORD can remain if release clear is skipped" },
    unresolved: [
      "0x00ad2ac4 alternate/non-mobile owner branch semantic and complete producer set are not aliased to 0x00ac2da4.",
      "The source meaning of raw record owner/player fields is unresolved; occupancy WORD is not promoted to player owner.",
      "Class-specific footprints beyond K01-proven classes 12/13/14/82 (all 1×1) are unresolved; generic loops are recorded only as function-level behavior.",
      "Scheduler serialization and all computed/alias occupancy writers outside the verified functions are not closed.",
      "No production package/app was changed; this report is analysis/reproduction only.",
    ],
    fixture: { path: CANONICAL_PATHS.fixturePath, sha256: sha256(Buffer.from(JSON.stringify(fixture))), vectorCount: fixture.vectors.length },
  };
}

function clearFootprint(owner, mask, x, y, width, height, mapWidth, mapHeight, occupancyMask) {
  for (let row = 0; row < height; row += 1) for (let column = 0; column < width; column += 1) {
    const cellX = x - Math.floor(width / 2) + column; const cellY = y - Math.floor(height / 2) + row;
    if (!inBounds(cellX, cellY, mapWidth, mapHeight)) continue;
    const index = cellIndex(cellX, cellY, mapHeight); owner[index] = 0; mask[index] &= 0x0fff;
  }
}
function emptyGrid(width = MAP_WIDTH, height = MAP_HEIGHT) { return Array(width * height).fill(0); }
function cellIndex(x, y, height) { return x * height + y; }
function inBounds(x, y, width, height) { return x >= 0 && x < width && y >= 0 && y < height; }
function validateGrid(grid, width, height) { if (!Array.isArray(grid) || grid.length !== width * height || grid.some((value) => !Number.isInteger(value) || value < 0 || value > 0xffff)) throw new RangeError("grid must contain unsigned WORD cells"); }
function validateMap(width, height) { if (!Number.isInteger(width) || width < 1 || width > 0x7fff || !Number.isInteger(height) || height < 1 || height > 0x7fff) throw new RangeError("map dimensions must be positive signed WORDs"); }
function validatePositiveExtent(value, name) { if (!Number.isInteger(value) || value < 1 || value > 0x7f) throw new RangeError(`${name} must be a positive BYTE extent`); }
function validateCoordinate(value, name) { if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) throw new RangeError(`${name} must be a signed WORD`); }
function validateSlot(value) { if (!Number.isInteger(value) || value < 1 || value >= SLOT_COUNT) throw new RangeError("slot must be in 1..1199"); }
function validateUnsignedWord(value, name) { if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new RangeError(`${name} must be an unsigned WORD`); }
function validateSignedWord(value, name) { if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) throw new RangeError(`${name} must be a signed WORD`); }
function validateByte(value, name) { if (!Number.isInteger(value) || value < 0 || value > 0xff) throw new RangeError(`${name} must be a BYTE`); }
function signedWord(value) { return (value << 16) >> 16; }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function assertEqual(actual, expected, label) { if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`); }
function assertDeepEqual(actual, expected, label) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} mismatch`); }
function readArtifact(path, sourceSha256, label) { const value = JSON.parse(readFileSync(path, "utf8")); assertEqual(value.sourceSha256, sourceSha256, `${label} source SHA-256`); return value; }
function readFixture(path, sourceSha256) { const value = JSON.parse(readFileSync(path, "utf8")); assertEqual(value.sourceSha256, sourceSha256, "fixture source SHA-256"); if (!Array.isArray(value.vectors) || value.vectors.length === 0) throw new Error("fixture vectors are required"); return value; }
function artifactDescriptor(path, artifact, canonicalPath) { return { path: canonicalPath, sha256: sha256(readFileSync(path)), sourceSha256: artifact.sourceSha256 }; }
function validateFunction(functions, [entry, range, count, instructionSha256]) { const record = functions.find((candidate) => candidate.entry === toHex(entry)); if (!record) throw new Error(`functions artifact is missing ${toHex(entry)}`); assertDeepEqual(record.bodyRanges, [range], `${toHex(entry)} body range`); assertEqual(record.instructionCount, count, `${toHex(entry)} instruction count`); assertEqual(record.instructionSha256, instructionSha256, `${toHex(entry)} instruction SHA-256`); return { entry: record.entry, bodyRange: range, instructionCount: count, instructionSha256 }; }
function requireCall(references, seeds, site, caller, callee) { const seeded = seeds.functions?.find((value) => value.entry === toHex(caller)); const seededCall = seeded?.instructions?.find((value) => Number.parseInt(value.address, 16) === site && value.text === `CALL ${toHex(callee)}`); const referenceCall = references.references?.find((value) => value.from === toHex(site) && value.fromFunctionEntry === toHex(caller) && value.to === toHex(callee)); if (!seededCall || !referenceCall) throw new Error(`call edge missing ${toHex(site)} -> ${toHex(callee)}`); return { callSite: toHex(site), caller: toHex(caller), callee: toHex(callee) }; }
function readAnchor(buffer, image, anchor) { const offset = image.vaToRawOffset(anchor.va); if (offset === undefined) throw new Error(`${toHex(anchor.va)} is not file-backed`); const bytes = Buffer.from(anchor.bytes.replaceAll(" ", ""), "hex"); if (!buffer.subarray(offset, offset + bytes.length).equals(bytes)) throw new Error(`byte anchor mismatch at ${toHex(anchor.va)}`); return { id: anchor.meaning, va: toHex(anchor.va), rawOffset: toHex(offset), bytes: anchor.bytes }; }

function parseArgs(argv) { const options = {}; const names = new Map([["--input", "executablePath"], ["--functions", "functionsPath"], ["--references", "referencesPath"], ["--seeds", "seedsPath"], ["--fixture", "fixturePath"]]); for (let index = 0; index < argv.length; index += 1) { if (argv[index] === "--json") continue; const key = names.get(argv[index]); if (!key || argv[index + 1] === undefined) throw new Error(`Unknown or incomplete option ${argv[index]}`); options[key] = argv[++index]; } return options; }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(extractK01OccupancyOwnerTransition(parseArgs(process.argv.slice(2))), null, 2));
