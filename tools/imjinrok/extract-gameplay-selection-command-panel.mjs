#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSpriteLikeHeader } from "./codec.mjs";
import { readPeImage } from "./pe-image.mjs";
import {
  assertEqual,
  readJson,
  sha256,
  verifyEvidencePoint,
  verifyRawCodeRange,
} from "./static-evidence.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_FUNCTIONS_PATH = "analysis/generated/imjinrok2/functions.json";
const DEFAULT_REFERENCES_PATH = "analysis/generated/imjinrok2/references.json";
const DEFAULT_PANEL_PATH = "original/imjinrok2/fnt/pannel.spr";
const DEFAULT_BUTTON_PATH = "original/imjinrok2/fnt/button.spr";

export const EXPECTED_EXECUTABLE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_FUNCTIONS_SHA256 =
  "c10ea2de1f4998411d52443419c9a7f52ff7f9c18e79bd4115ba197d2f5bebc3";
export const EXPECTED_REFERENCES_SHA256 =
  "df11ff3713988ef22b3390b5b0ae7b4a87464b5de547a4866e1c8ec8a0bcaf4c";
export const EXPECTED_PANEL_SHA256 =
  "18a58466dd95fab6d946ed6dfb0647d8a315733a6a9bfb1b069c0e3a8d81b42e";
export const EXPECTED_BUTTON_SHA256 =
  "cfe7bab02f2cb8a1f97a3161075e617ace22d6ecf5a976546263a7c67e4efbb4";

export const SHARED_CANVAS = Object.freeze({ width: 640, height: 480 });
export const PANEL_ASSET_BOUNDS = Object.freeze({ width: 640, height: 163, frameCount: 1 });
export const ACTION_GRID = Object.freeze({ columns: 3, rows: 3, left: 525, top: 363, cellWidth: 34, cellHeight: 34, horizontalGap: 2, verticalGap: 2 });

const RAW_CODE_RANGES = [
  ["gameplay-hud-frame-root", 0x004475a0, 0x00447bb9, "81e6e28cf3a20e2ecd6d1f2e7ede44e646f044fbf86aa581620baa41f67f9f9c"],
  ["panel-layout-initializer", 0x00481ee0, 0x00481fcf, "e354e42cf17dd8ed5316d764d265f973666897f46e48571ae0b1349e589a6946"],
  ["selection-command-renderer", 0x0045ad90, 0x0045b39f, "f82b78ede2f143ebabd5ca357b5580d09bfdb5c33755bdc1e9c34c1ccc8974fc"],
  ["selection-command-input", 0x00459490, 0x0045acfd, "f6d20a3bbc4426f27cd430a743eb24e75812a544a034f85b3551b7fadfbec202"],
  ["command-grid-hit-test", 0x00459110, 0x004591d0, "429eb7383706ecf059aa238c04e1fb12af22c4f154f265d1dcd3906cea339566"],
  ["no-selection-command-producer", 0x0045b3a0, 0x0045b41a, "782d749759dac1060c16b04fb2bf7388530bfd02245b663f92be3f247931514e"],
  ["shared-canvas-initializer", 0x0044a040, 0x0044a071, "c5513d067ff31a55013de73f6dd8399d3fddd4f4ca7adc0dcb79d5ff1dbd7c3b"],
].map(([id, start, endExclusive, digest]) => ({ id, start, endExclusive, sha256: digest }));

const EVIDENCE = [
  [0x004457bb, "b9 60 bd 88 00 e9 1b c7 03 00", "gameplay initialization passes layout object 0x0088bd60 to its complete initializer"],
  [0x00481ee0, "66 c7 01 03 00 66 c7 41 02 03 00", "initializer writes the command grid's three columns and three rows"],
  [0x00481f0d, "66 c7 41 0c 0d 02 66 c7 41 0e 6b 01", "initializer writes action-grid origin x=525 and y=363"],
  [0x00481f05, "66 89 41 08 66 89 41 0a", "initializer preserves the two-pixel action-grid gaps"],
  [0x0044a040, "8b c1 ba 80 02 00 00 b9 e0 01 00 00 89 48 08 89 48 14", "the shared destination canvas stores width 640 and height 480"],
  [0x0044336b, "ba 94 c0 4b 00", "the common SPR loader starts at asset-table entry 0x004bc094"],
  [0x004bc098, "44 d9 4b 00", "the second common asset-table entry points at the embedded fnt\\pannel.spr string"],
  [0x00447aba, "e8 d1 32 01 00 a1 80 95 54 00 83 c4 04", "frame root calls FUN_0045ad90 before SPEECH slots and transient overlay"],
  [0x0045ad90, "66 a1 2a 66 7c 00 83 ec 0c 66 3d 01 00 75 35", "renderer separates exact-one selection, no selection, and multi-selection paths"],
  [0x0045add4, "66 85 c0 75 0d", "only selection count exactly zero enters the no-selection renderer"],
  [0x0045adee, "56 b9 18 94 55 00 e8 b7 fd fe ff 83 f8 01", "command-grid renderer first requires destination surface lock result exactly one"],
  [0x0045ae10, "6a 78 53 b9 d8 5e 7c 00 e8 e3 63 00 00", "renderer obtains command slot zero from owner 0x007c5ed8"],
  [0x0045ae60, "8b 0d 64 bd 88 00 99 f7 ff", "renderer divides slot by the initialized column count"],
  [0x0045ae6e, "03 c1 8b f2 0f af f0 a1 6c bd 88 00 03 f0", "renderer computes column x from cell width, gap, and origin"],
  [0x0045ae81, "66 8b 15 6a bd 88 00 8b f8 66 a1 66 bd 88 00 66 03 d0", "renderer computes row y from cell height, gap, and origin"],
  [0x0045af90, "68 86 00 00 00 52 b9 d8 5e 7c 00 e8 60 62 00 00", "renderer reads the command frame/resource index through the same owner"],
  [0x004590b0, "83 3d 70 6e c0 00 01 74 50", "command-grid input is disabled when DAT_00c06e70 is exactly one"],
  [0x00459121, "8b 5c 24 10 68 8a 00 00 00 53 b9 d8 5e 7c 00 e8 cb 80 00 00 66 85 c0", "hit testing first rejects an owner slot with zero control identifier"],
  [0x0045917f, "3b d5 5d 7e 46 03 c1 03 c6 3b d0 7d 3e", "pointer x is strict interior, excluding both horizontal edges"],
  [0x00459191, "0f bf 35 66 bd 88 00 0f bf 0d 6a bd 88 00 03 ce", "pointer y uses the same row formula and strict vertical boundaries"],
  [0x0045b3f6, "66 83 b9 ce e9 82 00 00 75 0d 6a 23 6a 01", "no-selection producer writes a real command control into owner slot one"],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

const REFERENCE_SPECS = [
  ["selection renderer callers", "to", "0x0045ad90", 1, "b5693d194d40de2110de8509ca08c5b3c3a1381eb0f1808cdc413173a73c913b"],
  ["command input callers", "to", "0x00459110", 1, "4182b760d3b5c3d6809a8838eb6199fadc3c24c2fc63006f4977f83bc2bab0e4"],
  ["HUD root outgoing", "fromFunctionEntry", "0x004475a0", 233, "81f7e6c7c7aba4adaa5ee2e3b18ac6e26672481a6bd8aeb6a68ef4918af07dc9"],
];

export function extractGameplaySelectionCommandPanel({ executablePath = DEFAULT_EXECUTABLE_PATH, functionsPath = DEFAULT_FUNCTIONS_PATH, referencesPath = DEFAULT_REFERENCES_PATH, panelPath = DEFAULT_PANEL_PATH, buttonPath = DEFAULT_BUTTON_PATH } = {}) {
  const { buffer, image } = readPeImage(executablePath);
  assertEqual(sha256(buffer), EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);
  const functionsBytes = readFileSync(functionsPath);
  const referencesBytes = readFileSync(referencesPath);
  assertEqual(sha256(functionsBytes), EXPECTED_FUNCTIONS_SHA256, `${functionsPath} SHA-256`);
  assertEqual(sha256(referencesBytes), EXPECTED_REFERENCES_SHA256, `${referencesPath} SHA-256`);
  const functions = readJson(functionsPath);
  const references = readJson(referencesPath);
  assertEqual(functions.sourceSha256, EXPECTED_EXECUTABLE_SHA256, `${functionsPath} source SHA-256`);
  assertEqual(references.sourceSha256, EXPECTED_EXECUTABLE_SHA256, `${referencesPath} source SHA-256`);
  const panelBytes = readFileSync(panelPath);
  const buttonBytes = readFileSync(buttonPath);
  assertEqual(sha256(panelBytes), EXPECTED_PANEL_SHA256, `${panelPath} SHA-256`);
  assertEqual(sha256(buttonBytes), EXPECTED_BUTTON_SHA256, `${buttonPath} SHA-256`);
  const panel = parseSpriteLikeHeader(panelBytes, panelPath);
  const button = parseSpriteLikeHeader(buttonBytes, buttonPath);
  assertDeepEqual({ width: panel.width, height: panel.height, frameCount: panel.frameCount }, { width: 640, height: 163, frameCount: 1 }, "pannel.spr header");
  assertDeepEqual({ width: button.width, height: button.height, frameCount: button.frameCount }, { width: 34, height: 34, frameCount: 289 }, "button.spr header");
  return {
    question: "What statically provable object owns the gameplay selection/command action grid, and what are its exact shared-640×480 canvas, grid geometry, no-selection dispatch, draw and strict-input bounds?",
    analysisStatus: "static-confirmed-for-bounded-gameplay-command-grid",
    reproductionStatus: "reproduction-complete-for-bounded-command-grid-geometry-and-slot-admission",
    implementationStatus: "analysis-only-no-product-change",
    sources: { executableSha256: EXPECTED_EXECUTABLE_SHA256, functionsSha256: EXPECTED_FUNCTIONS_SHA256, referencesSha256: EXPECTED_REFERENCES_SHA256, panel: { path: panelPath, sha256: EXPECTED_PANEL_SHA256, width: panel.width, height: panel.height, frameCount: panel.frameCount }, button: { path: buttonPath, sha256: EXPECTED_BUTTON_SHA256, width: button.width, height: button.height, frameCount: button.frameCount } },
    owner: { address: "0x007c5ed8", actionSlots: "nine indexed command slots read by FUN_0045ad90 through owner methods; no-selection producer FUN_0045b3a0 writes the same owner", unrelatedOwners: ["0x005e3680 is SPEECH portrait/label state", "0x00bcdd58 is the refuted transient formatted overlay"] },
    geometry: { sharedCanvas: SHARED_CANVAS, panelAsset: PANEL_ASSET_BOUNDS, actionGrid: ACTION_GRID, actionSlots: Array.from({ length: 9 }, (_, slot) => commandSlotRect(slot)) },
    render: { rootCallsite: "0x00447aba", renderer: "FUN_0045ad90", order: ["selection-count branch", "exact-one selected entity delegate or no-selection seven-type delegate", "destination lock", "owner command slots 0..8", "later SPEECH slot dispatcher", "later transient formatted overlay"], lockGate: "DAT_00559418 lock result must equal 1; otherwise the bounded command-grid slot reads/draws do not occur", noSelection: "selection count raw WORD exactly 0 selects FUN_0045b8b0 before the common nine command-slot loop", exactOne: "exactly one searches selected record and delegates to FUN_00421390", multiSelection: "other nonzero counts skip both of those delegates but continue to the bounded command-grid draw path" },
    input: { function: "FUN_00459110", disabledWhen: "DAT_00c06e70 == 1", presenceGate: "owner slot control identifier must be nonzero", bounds: "left < pointerX < right and top < pointerY < bottom", unsupportedSlot: "FUN_00461200 rejects signed indices below 0 or at least 9 by returning zero before the owner field read", downstreamBoundary: "A successful hit only establishes slot admission here; FUN_00459490's later left/right release and command delivery are separately bounded evidence." },
    rawCodeRanges: RAW_CODE_RANGES.map((range) => verifyRawCodeRange(buffer, image, range)),
    evidencePoints: EVIDENCE.map((point) => verifyEvidencePoint(buffer, image, point)),
    referenceSets: REFERENCE_SPECS.map(([label, key, value, count, digest]) => verifyReferenceSet(references, { label, key, value, count, digest })),
    unresolvedBoundary: "This closes the shared 640×480 canvas, the common pannel.spr resource dimensions, and the nine-slot command-grid owner/geometry/hit boundary. It does not close a direct pannel.spr-to-final-blit callsite or coordinate, rename every command identifier, infer the selected-entity renderer FUN_00421390's complete contents, or claim a product selectionPanel parity mapping. Indirect runtime surface method results after a null/missing resource pointer are static-only and are represented as unsafe downstream calls, not fabricated success.",
  };
}

export function reproduceGameplayCommandGrid(input) {
  assertRecord(input, "input");
  const selectionCount = assertInteger(input.selectionCount, 0, 20, "selectionCount");
  const surfaceLockSucceeded = assertBoolean(input.surfaceLockSucceeded, "surfaceLockSucceeded");
  const output = { selectionCount, commandGrid: ACTION_GRID, branch: selectionCount === 0 ? "no-selection" : selectionCount === 1 ? "single-selection" : "multi-selection", operations: [] };
  if (selectionCount === 0) output.operations.push({ type: "delegate-no-selection-renderer-before-command-grid" });
  else if (selectionCount === 1) output.operations.push({ type: "delegate-single-selection-record-before-command-grid" });
  if (!surfaceLockSucceeded) { output.operations.push({ type: "skip-command-grid-surface-lock-failure" }); return output; }
  const slots = assertSlots(input.slots);
  for (let slot = 0; slot < slots.length; slot += 1) {
    if (slots[slot].rendererEnabled === 0) continue;
    output.operations.push({ type: "draw-command-slot", slot, frameOrResourceIndex: slots[slot].frameOrResourceIndex, rect: commandSlotRect(slot) });
  }
  if (input.hitTest === undefined) return output;
  const hitTest = assertRecord(input.hitTest, "hitTest");
  const disabled = assertBoolean(hitTest.disabled, "hitTest.disabled");
  const slot = assertInteger(hitTest.slot, -32768, 32767, "hitTest.slot");
  if (slot < 0 || slot >= 9) {
    output.hitTest = { slot, rect: null, result: "reject-unsupported-slot" };
    return output;
  }
  const pointerX = assertInteger(hitTest.pointerX, -32768, 32767, "hitTest.pointerX");
  const pointerY = assertInteger(hitTest.pointerY, -32768, 32767, "hitTest.pointerY");
  const rect = commandSlotRect(slot);
  const hit = !disabled && slots[slot].inputControlId !== 0 && pointerX > rect.left && pointerX < rect.right && pointerY > rect.top && pointerY < rect.bottom;
  output.hitTest = { slot, rect, result: hit ? "admit-command-slot" : disabled ? "reject-disabled" : slots[slot].inputControlId === 0 ? "reject-empty-or-stale-slot" : "reject-outside-strict-interior" };
  return output;
}

function commandSlotRect(slot) { const column = slot % ACTION_GRID.columns; const row = Math.trunc(slot / ACTION_GRID.columns); const left = ACTION_GRID.left + column * (ACTION_GRID.cellWidth + ACTION_GRID.horizontalGap); const top = ACTION_GRID.top + row * (ACTION_GRID.cellHeight + ACTION_GRID.verticalGap); return { left, top, right: left + ACTION_GRID.cellWidth, bottom: top + ACTION_GRID.cellHeight, width: ACTION_GRID.cellWidth, height: ACTION_GRID.cellHeight }; }
function verifyReferenceSet(references, spec) { const rows = references.references.filter((entry) => entry[spec.key] === spec.value && (spec.key !== "to" || entry.type === "UNCONDITIONAL_CALL")).map(({ from, to, type, fromFunctionEntry }) => ({ from, to, type, fromFunctionEntry })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))); const digest = createHash("sha256").update(JSON.stringify(rows)).digest("hex"); assertEqual(rows.length, spec.count, `${spec.label} count`); assertEqual(digest, spec.digest, `${spec.label} digest`); return { label: spec.label, count: rows.length, digest, references: rows }; }
function assertSlots(value) {
  if (!Array.isArray(value) || value.length !== 9) throw new TypeError("slots must be an array of exactly nine command-slot records");
  return value.map((entry, index) => {
    assertRecord(entry, `slots[${index}]`);
    return {
      rendererEnabled: assertInteger(entry.rendererEnabled, 0, 0xffff, `slots[${index}].rendererEnabled`),
      frameOrResourceIndex: assertInteger(entry.frameOrResourceIndex, 0, 0xffff, `slots[${index}].frameOrResourceIndex`),
      inputControlId: assertInteger(entry.inputControlId, 0, 0xffff, `slots[${index}].inputControlId`),
    };
  });
}
function assertRecord(value, label) { if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`); return value; }
function assertBoolean(value, label) { if (typeof value !== "boolean") throw new TypeError(`${label} must be a boolean`); return value; }
function assertInteger(value, min, max, label) { if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(`${label} must be an integer in ${min}..${max}`); return value; }
function assertDeepEqual(actual, expected, label) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} mismatch`); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(extractGameplaySelectionCommandPanel(), null, 2));
