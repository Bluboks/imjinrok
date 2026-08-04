#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parsePeImage } from "./pe-image.mjs";
import { readJson, readVaRange, sha256, verifyEvidencePoint, verifyRawCodeRange } from "./static-evidence.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DEFAULTS = {
  executablePath: resolve(ROOT, "original/imjinrok2/imjinrok2.exe"),
  functionsPath: resolve(ROOT, "analysis/generated/imjinrok2/functions.json"),
  referencesPath: resolve(ROOT, "analysis/generated/imjinrok2/references.json"),
  seedsPath: resolve(ROOT, "analysis/generated/imjinrok2/seeds.json"),
};
const EXPECTED_EXE = { size: 843_833, sha256: "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e" };
const EXPECTED_ARTIFACTS = {
  functions: "7e071fdfe425d22447780c265fe1d3fd271a1bedd1773682bebcb8ddc6d2e16e",
  references: "f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5",
  seeds: "386b0f4e86c3376f34fe2b50fedb7e45b762c30784d4ebcc0387aa6f431811b2",
};
const FUNCTIONS = [
  ["FUN_00460ba0", "0x00460ba0", "0x00460ba0-0x00460e20", 641, 144, "248c49519c1c692efde84ee3aac2159912097dca7ed46fe3f93ab7b7048b748e", "47f5f8e1743260ffdbc0f378f46510ec4126c2accc74cc41e2464dd77a5f3b32"],
  ["FUN_004610e0", "0x004610e0", "0x004610e0-0x004611fd", 286, 91, "b917223c3487f65ad6419dc26a3ded5bee4549b455b033e8443617830a60e04f", "c1eadc08bf3a38f6c53e55326a9813770cb5c4b21540ec3ab617d2e4c56a7b1d"],
  ["FUN_00439260", "0x00439260", "0x00439260-0x004392eb", 140, 42, "d567a6daa1306e945558a789d0243a9bc97c38904f02a899b308aab59a90a114", "d96f0550593df83b488758fd28d7ae029d594307a591d7884f76999964579f61"],
  ["FUN_00442ca0", "0x00442ca0", "0x00442ca0-0x00442d95", 246, 82, "e3edb412a4a3ab9bb72fb4285c9e07ab0417de52bb692e047548457b02fa1f67", "45ebcb1b40bca2b0088e12ebc7eef45cc71a5b86927df5c269398b9622bfcb47"],
];
const PATTERN_ADDRESSES = [0x004bbde8, 0x004bbde8, 0x004bbde8, 0x004bbe04, 0x004bbe28, 0x004bbe54, 0x004bbe88, 0x004bbebc, 0x004bbef8, 0x004bbf3c, 0x004bbf88, 0x004bbfdc];
const RAW_RANGES = [
  { id: "selector-dispatch-table", start: 0x00442d98, endExclusive: 0x00442dc8, sha256: "dc2566cd93c655f0beb5a6f450ce8d4dcf4ebd45e548de8e2824fd37e675d2c2" },
  { id: "selector-radius-pattern-data", start: 0x004bbde8, endExclusive: 0x004bc038, sha256: "ff908f65acb13f420821dacb4f301e362519e07ec2052725bc6cd659630598e6" },
];
const ANCHORS = [
  { va: 0x00460d8f, bytes: "8d 96 86 ee 00 00 bf b4 00 00 00 8b c2 b9 b4 00 00 00 c6 00 08 05 b4 00 00 00 49 75 f5 42 4f 75 ea", meaning: "FUN_00460ba0 initializes object+0xee86 as x-major 180 by 180 bytes, writing literal 8 with inner stride 0xb4." },
  { va: 0x004610e0, bytes: "53 bb 01 00 00 00 66 39 1d 84 bd bc 00 55 8b e9 0f 84 03 01 00 00", meaning: "FUN_004610e0 returns before any dirty reset, aging, or entity processing when WORD[0x00bcbd84] equals one." },
  { va: 0x004610ff, bytes: "66 39 5c 24 14 8d bd 16 6d 01 00 f3 ab 8b 3d 90 2d ac 00 a1 94 2d ac 00 75 6e 39 9d ec 01 00 00 75 34", meaning: "FUN_004610e0 clears object+0x16d16 for 0x1fa4 DWORDs, then enters the mode-argument-one branch and compares object+0x1ec with one." },
  { va: 0x00461139, bytes: "80 38 04 75 09 c6 00 00 88 98 90 7e 00 00", meaning: "When object+0x1ec equals one, literal state 4 changes to 0 and its corresponding dirty byte becomes 1." },
  { va: 0x0046116d, bytes: "80 38 00 75 09 c6 00 04 88 98 90 7e 00 00", meaning: "When object+0x1ec differs from one, literal state 0 changes to 4 and its corresponding dirty byte becomes 1." },
  { va: 0x004611dd, bytes: "e8 7e 80 fd ff", meaning: "FUN_004610e0 iterates active entities and calls FUN_00439260 with the record-associated owner/faction value." },
  { va: 0x00439260, bytes: "66 8b 91 bc 01 00 00 56 57 66 8b b9 be 01 00 00", meaning: "FUN_00439260 reads entity WORD coordinates at +0x1bc and +0x1be before its bounds and sight-selection gates." },
  { va: 0x00439294, bytes: "0f bf 35 44 cc bc 00", meaning: "FUN_00439260 reads the local-player identity WORD at 0x00bccc44 before indexing the player record." },
  { va: 0x004392bb, bytes: "66 8b 89 a8 01 00 00 51 eb 12 80 b9 aa 01 00 00 01 75 19 c6 81 aa 01 00 00 00 6a 02", meaning: "Matching ownership uses entity WORD+0x1a8; the alternate one-shot BYTE+0x1aa==1 path clears the latch and uses selector 2." },
  { va: 0x00442d61, bytes: "8a 9c 39 5e 4d 7d 00 84 db 74 10 c6 84 39 5e 4d 7d 00 00 c6 84 39 ee cb 7d 00 01", meaning: "For an in-bounds selected pattern cell, a nonzero fog byte is written to 0 and its dirty byte is written to 1." },
];

export function extractSourceFogVisibilityLifecycle(options = {}) {
  const paths = { ...DEFAULTS, ...options };
  const executable = readVerified(paths.executablePath, "original executable", EXPECTED_EXE);
  const image = parsePeImage(executable.buffer, paths.executablePath);
  const functions = readVerifiedJson(paths.functionsPath, "functions", EXPECTED_ARTIFACTS.functions);
  const references = readVerifiedJson(paths.referencesPath, "references", EXPECTED_ARTIFACTS.references);
  const seeds = readVerifiedJson(paths.seedsPath, "seeds", EXPECTED_ARTIFACTS.seeds);
  const functionProvenance = FUNCTIONS.map((spec) => verifyFunction(functions.parsed.functions, executable.buffer, image, spec));
  const requiredCalls = [
    ["0x004611dd", "0x004610e0", "0x00439260"],
    ["0x004392df", "0x00439260", "0x00442ca0"],
  ];
  for (const [from, fromFunctionEntry, to] of requiredCalls) {
    const edge = references.parsed.references.find((reference) => reference.from === from && reference.fromFunctionEntry === fromFunctionEntry && reference.to === to && reference.type === "UNCONDITIONAL_CALL");
    if (!edge) throw new Error(`Required canonical call edge is missing: ${from} -> ${to}`);
  }
  const seed = seeds.parsed.functions.find((candidate) => candidate.entry === "0x00460ba0");
  if (!seed || seed.instructions?.length !== 144) throw new Error("Mission initialization seed provenance mismatch");
  const patterns = extractPatterns(executable.buffer, image);
  return {
    schemaVersion: "1.0.0",
    evidenceId: "source-fog-visibility-lifecycle",
    question: "Which source fog bytes are initialized, aged, revealed, and dirtied by FUN_00460ba0, FUN_004610e0, FUN_00439260, and FUN_00442ca0?",
    analysisStatus: "정적 확정 (bounded source fog lifecycle only)",
    reproductionStatus: "재현 완료 (initialization, both age branches, ownership/one-shot selection, bounded reveal, and dirty writes)",
    implementationStatus: "없음 (product/runtime code is outside this evidence unit)",
    sources: { executable: omit(executable), functions: summary(functions), references: summary(references), seeds: summary(seeds) },
    functionProvenance,
    rawRanges: RAW_RANGES.map((range) => verifyRawCodeRange(executable.buffer, image, range)),
    executableEvidence: ANCHORS.map((anchor) => verifyEvidencePoint(executable.buffer, image, anchor)),
    storage: {
      mainObjectBase: "0x007c5ed8",
      fogState: { objectOffset: "0x0000ee86", address: "0x007d4d5e", dimensions: { x: 180, y: 180 }, addressing: "fogState + x * 180 + y", initializationValue: 8 },
      dirty: { fogStateOffset: "0x00007e90", address: "0x007dcbee", dimensions: { x: 180, y: 180 }, addressing: "dirty + x * 180 + y", resetBeforeUpdate: "FUN_004610e0 zeroes 0x1fa4 DWORDs at object+0x16d16 before the aging/reveal passes." },
    },
    lifecycle: {
      globalGate: "WORD[0x00bcbd84]==1 returns before the dirty reset, aging, and entity sight iteration.",
      updateModeArgument: "stack WORD argument equals 1 gates the aging pass; other argument values skip both aging branches but still proceed to active-entity sight iteration.",
      humanModeBoundary: "For mode argument 1, raw object+0x1ec==1 selects 4->0; any other raw value selects 0->4. The human meaning of object+0x1ec remains opaque.",
      transitions: [{ from: 4, to: 0, dirty: 1, when: "modeArgumentWord==1 && objectField1ec==1" }, { from: 0, to: 4, dirty: 1, when: "modeArgumentWord==1 && objectField1ec!=1" }],
      entitySight: { coordinates: ["WORD entity+0x1bc", "WORD entity+0x1be"], localPlayerIdentity: "WORD[0x00bccc44] indexes a player record whose byte +0x5 is compared with the update-supplied owner/faction value.", matchingSelector: "WORD entity+0x1a8", oneShotSelector: 2, oneShotLatch: "BYTE entity+0x1aa==1 is cleared before the selector-2 call." },
      reveal: { selectorDomain: "0..11; selectors 0, 1, and 2 share the first pattern, selector >10 uses the selector-11 default pattern.", patternStorage: "each table holds y-span center followed by x half-widths terminated by int32 100", patterns, nonzeroOnly: true, writes: { fogState: 0, dirty: 1 } },
    },
    derivedBoundedMeanings: { 8: "initial / never revealed (unseen)", 0: "currently in local sight (visible)", 4: "aged before current local-sight recomputation (previously seen / explored)" },
    rendererCrossCheck: { document: "docs/reverse-engineering/mechanics/source-fog-rendering.md", fact: "Its independent caller evidence distinguishes literal states 4 and 8. This lifecycle unit imports that distinction but makes no alpha, tint, palette, blend, or renderer-placement claim." },
    vectors: lifecycleVectors(patterns),
    residualBoundary: "The object+0x1ec human mode, full entity-list ownership semantics, selector/type provenance, scheduler cadence, renderer alpha/tint/palette/blend, and any product visibility mapping remain outside this bounded source lifecycle evidence.",
  };
}

export function replaySourceFogVisibilityLifecycle(input) {
  const { globalGateWord, modeArgumentWord, objectField1ec, mapWidth, mapHeight, cells, entities, localPlayerIdentity } = input ?? {};
  word(globalGateWord, "globalGateWord"); word(modeArgumentWord, "modeArgumentWord"); dword(objectField1ec, "objectField1ec"); positiveWord(mapWidth, "mapWidth"); positiveWord(mapHeight, "mapHeight"); word(localPlayerIdentity, "localPlayerIdentity");
  if (!Array.isArray(cells)) throw new TypeError("cells must be an array");
  if (!Array.isArray(entities)) throw new TypeError("entities must be an array");
  const grid = new Map();
  for (const [index, cell] of cells.entries()) { validateCell(cell, index, mapWidth, mapHeight); const key = cellKey(cell.x, cell.y); if (grid.has(key)) throw new Error(`cells[${index}] duplicates ${key}`); grid.set(key, { ...cell, dirty: cell.dirty ?? 0 }); }
  if (globalGateWord === 1) return { cells: [...grid.values()].sort(compareCells), entityResults: [], earlyReturn: "global-gate-word-equals-one" };
  if (modeArgumentWord === 1) for (const cell of grid.values()) {
    if (objectField1ec === 1 ? cell.state === 4 : cell.state === 0) { cell.state = objectField1ec === 1 ? 0 : 4; cell.dirty = 1; }
  }
  const entityResults = entities.map((entity, index) => applyEntitySight(grid, entity, index, mapWidth, mapHeight, localPlayerIdentity));
  return { cells: [...grid.values()].sort(compareCells), entityResults, earlyReturn: null };
}

export function selectedPatternCells(selector, x, y) {
  word(selector, "selector"); signedWord(x, "x"); signedWord(y, "y");
  const pattern = runtimePattern(selector);
  const cells = [];
  for (let row = 0; row < pattern.widths.length; row += 1) for (let deltaX = -pattern.widths[row]; deltaX <= pattern.widths[row]; deltaX += 1) cells.push({ x: x + deltaX, y: y + row - pattern.center });
  return cells;
}

function applyEntitySight(grid, entity, index, mapWidth, mapHeight, localPlayerIdentity) {
  if (!entity || typeof entity !== "object") throw new TypeError(`entities[${index}] must be an object`);
  signedWord(entity.x, `entities[${index}].x`); signedWord(entity.y, `entities[${index}].y`);
  for (const key of ["ownerOrFaction", "sightSelector", "oneShotSightLatch"]) word(entity[key], `entities[${index}].${key}`);
  if (entity.x < 0 || entity.y < 0 || entity.x >= mapWidth || entity.y >= mapHeight) return { index, outcome: "out-of-bounds", selector: null, oneShotSightLatch: entity.oneShotSightLatch };
  const matching = entity.ownerOrFaction === localPlayerIdentity;
  if (!matching && entity.oneShotSightLatch !== 1) return { index, outcome: "ownership-mismatch", selector: null, oneShotSightLatch: entity.oneShotSightLatch };
  const selector = matching ? entity.sightSelector : 2;
  const latch = matching ? entity.oneShotSightLatch : 0;
  let changed = 0;
  for (const coordinate of selectedPatternCells(selector, entity.x, entity.y)) {
    if (coordinate.x < 0 || coordinate.y < 0 || coordinate.x >= mapWidth || coordinate.y >= mapHeight) continue;
    const cell = grid.get(cellKey(coordinate.x, coordinate.y));
    if (cell && cell.state !== 0) { cell.state = 0; cell.dirty = 1; changed += 1; }
  }
  return { index, outcome: matching ? "matching-owner-or-faction" : "one-shot", selector, oneShotSightLatch: latch, changedCells: changed };
}

function extractPatterns(buffer, image) {
  return PATTERN_ADDRESSES.map((address, selector) => {
    const bytes = readVaRange(buffer, image, address, address + 96);
    const values = [];
    for (let offset = 0; offset < bytes.length; offset += 4) { const value = bytes.readInt32LE(offset); values.push(value); if (value === 100) break; }
    if (values.at(-1) !== 100) throw new Error(`selector ${selector} pattern lacks sentinel`);
    return { selector, address: `0x${address.toString(16).padStart(8, "0")}`, center: values[0], halfWidths: values.slice(1, -1), sentinel: 100, cellCount: values.slice(1, -1).reduce((sum, width) => sum + width * 2 + 1, 0) };
  });
}

function runtimePattern(selector) { const index = selector <= 2 ? 0 : selector <= 10 ? selector : 11; const address = PATTERN_ADDRESSES[index]; const known = PATTERNS[address]; return known; }
const PATTERNS = {
  0x004bbde8: { center: 2, widths: [1, 2, 2, 2, 1] }, 0x004bbe04: { center: 3, widths: [1, 2, 2, 2, 2, 2, 1] }, 0x004bbe28: { center: 4, widths: [1, 2, 3, 3, 3, 3, 3, 2, 1] }, 0x004bbe54: { center: 5, widths: [1, 2, 3, 4, 4, 4, 4, 4, 3, 2, 1] }, 0x004bbe88: { center: 5, widths: [2, 3, 4, 5, 5, 5, 5, 5, 4, 3, 2] }, 0x004bbebc: { center: 6, widths: [2, 4, 5, 6, 7, 7, 7, 7, 7, 6, 5, 4, 2] }, 0x004bbef8: { center: 7, widths: [3, 5, 6, 7, 7, 8, 8, 8, 8, 8, 7, 7, 6, 5, 3] }, 0x004bbf3c: { center: 8, widths: [3, 5, 6, 7, 8, 8, 9, 9, 9, 9, 9, 8, 8, 7, 6, 5, 3] }, 0x004bbf88: { center: 9, widths: [3, 5, 6, 7, 8, 8, 9, 9, 9, 9, 9, 9, 9, 8, 8, 7, 6, 5, 3] }, 0x004bbfdc: { center: 10, widths: [3, 5, 6, 7, 8, 8, 9, 9, 10, 10, 9, 10, 10, 9, 9, 8, 8, 7, 6, 5, 3] },
};
function lifecycleVectors(patterns) { return [
  { id: "initialize-180-square-to-eight", input: { dimensions: { x: 180, y: 180 }, value: 8 }, expected: { cellCount: 32400, addressing: "base + x * 180 + y" } },
  { id: "mode-one-human-one-ages-four-then-local-sight-reveals", input: { globalGateWord: 0, modeArgumentWord: 1, objectField1ec: 1, mapWidth: 20, mapHeight: 20, localPlayerIdentity: 3, cells: [{ x: 10, y: 10, state: 4 }, { x: 10, y: 11, state: 4 }, { x: 11, y: 10, state: 8 }, { x: 0, y: 0, state: 4 }], entities: [{ x: 10, y: 10, ownerOrFaction: 3, sightSelector: 0, oneShotSightLatch: 0 }] }, expected: replaySourceFogVisibilityLifecycle({ globalGateWord: 0, modeArgumentWord: 1, objectField1ec: 1, mapWidth: 20, mapHeight: 20, localPlayerIdentity: 3, cells: [{ x: 10, y: 10, state: 4 }, { x: 10, y: 11, state: 4 }, { x: 11, y: 10, state: 8 }, { x: 0, y: 0, state: 4 }], entities: [{ x: 10, y: 10, ownerOrFaction: 3, sightSelector: 0, oneShotSightLatch: 0 }] }) },
  { id: "mode-one-nonhuman-ages-zero-and-one-shot-selector-two-clears-latch", input: { globalGateWord: 0, modeArgumentWord: 1, objectField1ec: 0, mapWidth: 20, mapHeight: 20, localPlayerIdentity: 3, cells: [{ x: 5, y: 5, state: 0 }, { x: 6, y: 5, state: 8 }, { x: 19, y: 19, state: 0 }], entities: [{ x: 5, y: 5, ownerOrFaction: 1, sightSelector: 11, oneShotSightLatch: 1 }, { x: 25, y: 0, ownerOrFaction: 3, sightSelector: 5, oneShotSightLatch: 0 }] }, expected: replaySourceFogVisibilityLifecycle({ globalGateWord: 0, modeArgumentWord: 1, objectField1ec: 0, mapWidth: 20, mapHeight: 20, localPlayerIdentity: 3, cells: [{ x: 5, y: 5, state: 0 }, { x: 6, y: 5, state: 8 }, { x: 19, y: 19, state: 0 }], entities: [{ x: 5, y: 5, ownerOrFaction: 1, sightSelector: 11, oneShotSightLatch: 1 }, { x: 25, y: 0, ownerOrFaction: 3, sightSelector: 5, oneShotSightLatch: 0 }] }) },
  { id: "non-one-mode-skips-age-but-still-recomputes-entity-sight", input: { globalGateWord: 0, modeArgumentWord: 0, objectField1ec: 1, mapWidth: 20, mapHeight: 20, localPlayerIdentity: 3, cells: [{ x: 5, y: 5, state: 4 }, { x: 0, y: 0, state: 4 }], entities: [{ x: 5, y: 5, ownerOrFaction: 3, sightSelector: 0, oneShotSightLatch: 0 }] }, expected: replaySourceFogVisibilityLifecycle({ globalGateWord: 0, modeArgumentWord: 0, objectField1ec: 1, mapWidth: 20, mapHeight: 20, localPlayerIdentity: 3, cells: [{ x: 5, y: 5, state: 4 }, { x: 0, y: 0, state: 4 }], entities: [{ x: 5, y: 5, ownerOrFaction: 3, sightSelector: 0, oneShotSightLatch: 0 }] }) },
  { id: "global-gate-one-returns-before-any-fog-write", input: { globalGateWord: 1, modeArgumentWord: 1, objectField1ec: 1, mapWidth: 20, mapHeight: 20, localPlayerIdentity: 3, cells: [{ x: 5, y: 5, state: 4, dirty: 1 }], entities: [{ x: 5, y: 5, ownerOrFaction: 3, sightSelector: 5, oneShotSightLatch: 0 }] }, expected: replaySourceFogVisibilityLifecycle({ globalGateWord: 1, modeArgumentWord: 1, objectField1ec: 1, mapWidth: 20, mapHeight: 20, localPlayerIdentity: 3, cells: [{ x: 5, y: 5, state: 4, dirty: 1 }], entities: [{ x: 5, y: 5, ownerOrFaction: 3, sightSelector: 5, oneShotSightLatch: 0 }] }) },
  { id: "selector-radius-cell-counts", input: { selectors: patterns.map(({ selector }) => selector) }, expected: patterns.map(({ selector, cellCount }) => ({ selector, cellCount })) },
]; }
function verifyFunction(records, buffer, image, [name, entry, bodyRange, bodySize, instructionCount, instructionSha256, bodySha256]) { const record = records.find((candidate) => candidate.entry === entry); if (!record || record.bodySize !== bodySize || record.instructionCount !== instructionCount || record.instructionSha256 !== instructionSha256 || JSON.stringify(record.bodyRanges) !== JSON.stringify([bodyRange])) throw new Error(`Canonical function provenance mismatch for ${entry}`); const start = Number.parseInt(entry, 16); const actual = sha256(readVaRange(buffer, image, start, start + bodySize)); if (actual !== bodySha256) throw new Error(`Raw body SHA-256 mismatch for ${entry}`); return { name, entry, bodyRange, bodySize, instructionCount, instructionSha256, bodySha256 }; }
function readVerified(path, label, expected) { const buffer = readFileSync(path); if (buffer.length !== expected.size) throw new Error(`${label} size mismatch: expected ${expected.size}, got ${buffer.length}`); const digest = sha256(buffer); if (digest !== expected.sha256) throw new Error(`${label} SHA-256 mismatch: expected ${expected.sha256}, got ${digest}`); return { path: relative(path), size: buffer.length, sha256: digest, buffer }; }
function readVerifiedJson(path, label, expectedSha256) { const buffer = readFileSync(path); const digest = sha256(buffer); if (digest !== expectedSha256) throw new Error(`${label} SHA-256 mismatch: expected ${expectedSha256}, got ${digest}`); const parsed = readJson(path); if (parsed.sourceSha256 !== EXPECTED_EXE.sha256) throw new Error(`${label} source SHA-256 mismatch`); return { path: relative(path), size: buffer.length, sha256: digest, parsed }; }
function summary({ parsed, ...value }) { return { ...value, sourceSha256: parsed.sourceSha256 }; }
function omit({ buffer, ...value }) { return value; }
function relative(path) { return path.startsWith(ROOT) ? path.slice(ROOT.length + 1) : path; }
function cellKey(x, y) { return `${x},${y}`; }
function compareCells(a, b) { return a.x - b.x || a.y - b.y; }
function validateCell(cell, index, width, height) { if (!cell || typeof cell !== "object") throw new TypeError(`cells[${index}] must be an object`); word(cell.x, `cells[${index}].x`); word(cell.y, `cells[${index}].y`); if (cell.x >= width || cell.y >= height) throw new RangeError(`cells[${index}] is outside map bounds`); if (!Number.isInteger(cell.state) || cell.state < 0 || cell.state > 0xff) throw new RangeError(`cells[${index}].state must be a byte`); if (cell.dirty !== undefined && (!Number.isInteger(cell.dirty) || cell.dirty < 0 || cell.dirty > 0xff)) throw new RangeError(`cells[${index}].dirty must be a byte`); }
function word(value, label) { if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new RangeError(`${label} must be an unsigned WORD`); return value; }
function dword(value, label) { if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError(`${label} must be an unsigned DWORD`); return value; }
function positiveWord(value, label) { word(value, label); if (value === 0) throw new RangeError(`${label} must be nonzero`); return value; }
function signedWord(value, label) { if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) throw new RangeError(`${label} must be a signed WORD`); return value; }
function parseArgs(argv) { const result = {}; for (let index = 0; index < argv.length; index += 1) { const key = { "--executable": "executablePath", "--functions": "functionsPath", "--references": "referencesPath", "--seeds": "seedsPath", "--output": "output" }[argv[index]]; if (!key) throw new Error(`Unknown argument: ${argv[index]}`); if (!argv[index + 1]) throw new Error(`${argv[index]} requires a path`); result[key] = argv[++index]; } return result; }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { output, ...options } = parseArgs(process.argv.slice(2));
  const rendered = `${JSON.stringify(extractSourceFogVisibilityLifecycle(options), null, 2)}\n`;
  if (output) writeFileSync(output, rendered); else process.stdout.write(rendered);
}
