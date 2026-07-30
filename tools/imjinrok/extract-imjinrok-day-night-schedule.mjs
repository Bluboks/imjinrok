#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readPeImage } from "./pe-image.mjs";
import { assertEqual, readJson, sha256, verifyEvidencePoint, verifyRawCodeRange } from "./static-evidence.mjs";

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DEFAULT_ORIGINAL_ROOT = resolve(REPOSITORY_ROOT, "original/imjinrok2");
const DEFAULT_EXECUTABLE_PATH = resolve(DEFAULT_ORIGINAL_ROOT, "imjinrok2.exe");
const DEFAULT_REFERENCES_PATH = resolve(REPOSITORY_ROOT, "analysis/generated/imjinrok2/references.json");

export const EXPECTED_EXECUTABLE_SHA256 = "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_REFERENCES_SHA256 = "f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5";

const PALETTES = [
  ["imjin2", "pal/imjin2.pal", "5ba2c020e9bd89210a10550fb4baaee8ab8bb316d4a2c7e66bdb24c6c8c4323b", "0x004bbb58", null, "base palette loaded before the night variants"],
  ["night1", "pal/night1.pal", "b085583412b8bb79bdf9b72d836881be37f6f36ad50d073db06bebd1c2670122", "0x004bbb2c", "0x00bcd148", "first night-transition palette"],
  ["night2", "pal/night2.pal", "c45727bd8ffed04bf572da5ab38b14b7fcb819f540a15a2e5d13730357bda17d", "0x004bbafc", "0x00bcd448", "second night-transition palette"],
  ["night3", "pal/night3.pal", "4fe0c28dc64480c6f00876c5ee484e1b3caa77b3b63b27387c6cf7702c3d2f97", "0x004bbaec", "0x00bcd748", "third night-transition palette"],
  ["night4", "pal/night4.pal", "f8328d22007407df426dff9e489f43718e28772d03b3ddd5f663a5dd57156e95", "0x004bbadc", "0x00bcda48", "fourth night-transition palette"],
].map(([id, path, digest, pathReference, destination, role]) => ({ id, path, sha256: digest, pathReference, destination, role }));

const PALETTE_BY_ID = new Map(PALETTES.map((palette) => [palette.id, palette]));
const STATE_LAYOUT = {
  cycle: "+0x00",
  field4: "+0x04",
  phase: "+0x08",
  subTick: "+0x0c",
  field10: "+0x10",
  field14: "+0x14",
  advanceGate: "+0x18",
  phaseLightFlag: "+0x1c",
};

const RAW_CODE_RANGES = [
  ["palette-load-and-initial-copy", 0x00440540, 0x004407c5, "2d0f93e2d2f9693b3a3f03f6b7cea9ad170cc9b8fafdb2c083b2b20c72d83d77"],
  ["palette-apply-boundary", 0x004400b0, 0x0044010a, "4db0ede8a3f35f473d27a40c9e599e7d8a4c9853fab46fe447bf1bfb6e64524e"],
  ["day-night-state-constructor", 0x004924c0, 0x004924e2, "7a17687f7e9bb6dc4ce7a0af55499d9bf8052571d058c0a4aebd52ba78af7ffe"],
  ["day-night-state-advance-and-schedule", 0x00492510, 0x0049262b, "6b7c412c8dd54b168d05f768979f6d181fe6f6b66e68d194d200e2ce4770e6c8"],
  ["day-night-force-palette-boundary", 0x00492630, 0x00492650, "32f6f525f8ca41a50b56b7bc9f54bd65df879710d2c9296186fb0098822f7a48"],
  ["gameplay-day-night-caller-branch", 0x00447360, 0x00447470, "281878db5442431f97821712d0b4f35314d76c306a60b9a35bbef84a7cc913a2"],
].map(([id, start, endExclusive, digest]) => ({ id, start, endExclusive, sha256: digest }));

const EVIDENCE_POINTS = [
  [0x00440553, "68 58 bb 4b 00", "FUN_00440540 supplies pal\\imjin2.pal"],
  [0x00440611, "68 2c bb 4b 00", "FUN_00440540 supplies pal\\night1.pal"],
  [0x00440627, "68 48 d1 bc 00", "night1 loader destination is 0x00bcd148"],
  [0x00440657, "68 fc ba 4b 00", "FUN_00440540 supplies pal\\night2.pal"],
  [0x00440668, "68 48 d4 bc 00", "night2 loader destination is 0x00bcd448"],
  [0x0044069d, "68 ec ba 4b 00", "FUN_00440540 supplies pal\\night3.pal"],
  [0x004406b3, "68 48 d7 bc 00", "night3 loader destination is 0x00bcd748"],
  [0x004406e3, "68 dc ba 4b 00", "FUN_00440540 supplies pal\\night4.pal"],
  [0x004406f9, "68 48 da bc 00", "night4 loader destination is 0x00bcda48"],
  [0x004407ab, "b9 00 03 00 00", "initial palette copy uses 0x300 DWORDs"],
  [0x004407b0, "be 48 d1 bc 00", "initial palette copy source is night1 destination"],
  [0x004407b5, "bf e8 33 aa 00", "initial palette copy destination is 0x00aa33e8"],
  [0x004407ba, "f3 a5", "initial palette copy is REP MOVSD"],
  [0x004400b0, "56 8b 74 24 08 57", "FUN_004400b0 reads its palette pointer argument"],
  [0x004400c4, "c0 e2 02", "FUN_004400b0 scales each source palette component by left shift two"],
  [0x004400e5, "68 b8 a9 55 00 68 00 01 00 00 6a 00", "FUN_004400b0 submits a 256-entry palette update"],
  [0x004400fb, "b9 c0 00 00 00", "FUN_004400b0 copies 0x300 DWORDs after submission"],
  [0x004924c0, "33 c0 c7 41 04 ff ff ff ff 89 01 c7 41 1c 01 00 00 00", "constructor sets cycle zero, field +4 minus one, and phase light flag one"],
  [0x004924d2, "89 41 08 89 41 0c 89 41 14 89 41 10 89 41 18", "constructor clears phase, subTick, fields +10/+14, and advance gate"],
  [0x00492515, "39 4e 18", "advance is gated by field +0x18"],
  [0x0049251d, "3d 1c 02 00 00", "subTick advance condition compares against 540"],
  [0x00492528, "81 7e 0c 1c 02 00 00", "phase boundary tests subTick equal to 540"],
  [0x0049253d, "83 f8 10", "phase wraps at 16"],
  [0x00492556, "c7 46 1c 01 00 00 00", "phases zero through seven set phase light flag one"],
  [0x0049256c, "68 48 d1 bc 00", "phase 8 subTick 0 applies night1"],
  [0x0049257a, "6a 41", "phase 8 subTick 0 emits event 0x41 after palette application"],
  [0x00492590, "68 48 d4 bc 00", "phase 8 subTick 2 applies night2"],
  [0x004925a9, "68 48 d7 bc 00", "phase 8 subTick 4 applies night3"],
  [0x004925c2, "68 48 da bc 00", "phase 8 subTick 6 applies night4"],
  [0x004925dd, "68 48 d7 bc 00", "phase 0 subTick 0 applies night3"],
  [0x004925eb, "6a 42", "phase 0 subTick 0 emits event 0x42 after palette application"],
  [0x00492602, "68 48 d4 bc 00", "phase 0 subTick 2 applies night2"],
  [0x0049261c, "68 48 d1 bc 00", "phase 0 subTick 4 applies night1"],
  [0x00492630, "83 79 1c 01", "FUN_00492630 branches on phase light flag"],
  [0x00492636, "68 48 d1 bc 00", "phase light flag one force-applies night1"],
  [0x00492644, "68 48 da bc 00", "other phase light flag values force-apply night4"],
  [0x004473f0, "75 7e", "gameplay outer branch skips the update on its nonzero condition"],
  [0x004473f2, "b9 a8 60 7c 00 e8 14 b1 04 00", "gameplay branch calls FUN_00492510 with state at 0x007c60a8"],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

const REQUIRED_REFERENCE_EDGES = [
  ["0x00440553", "0x004bbb58", "DATA"],
  ["0x00440611", "0x004bbb2c", "DATA"],
  ["0x00440627", "0x00bcd148", "DATA"],
  ["0x00440657", "0x004bbafc", "DATA"],
  ["0x00440668", "0x00bcd448", "DATA"],
  ["0x0044069d", "0x004bbaec", "DATA"],
  ["0x004406b3", "0x00bcd748", "DATA"],
  ["0x004406e3", "0x004bbadc", "DATA"],
  ["0x004406f9", "0x00bcda48", "DATA"],
  ["0x004407b0", "0x00bcd148", "DATA"],
  ["0x004407b5", "0x00aa33e8", "DATA"],
  ["0x004473f7", "0x00492510", "UNCONDITIONAL_CALL"],
  ["0x00492571", "0x004400b0", "UNCONDITIONAL_CALL"],
  ["0x0049257c", "0x00472f50", "UNCONDITIONAL_CALL"],
  ["0x00492595", "0x004400b0", "UNCONDITIONAL_CALL"],
  ["0x004925ae", "0x004400b0", "UNCONDITIONAL_CALL"],
  ["0x004925c7", "0x004400b0", "UNCONDITIONAL_CALL"],
  ["0x004925e2", "0x004400b0", "UNCONDITIONAL_CALL"],
  ["0x004925ed", "0x00472f50", "UNCONDITIONAL_CALL"],
  ["0x00492607", "0x004400b0", "UNCONDITIONAL_CALL"],
  ["0x00492621", "0x004400b0", "UNCONDITIONAL_CALL"],
  ["0x0049263b", "0x004400b0", "UNCONDITIONAL_CALL"],
  ["0x00492649", "0x004400b0", "UNCONDITIONAL_CALL"],
];

export function createInitialDayNightState() {
  return { cycle: 0, field4: -1, phase: 0, subTick: 0, field10: 0, field14: 0, advanceGate: 0, phaseLightFlag: 1 };
}

export function extractImjinrokDayNightSchedule({ executablePath = DEFAULT_EXECUTABLE_PATH, referencesPath = DEFAULT_REFERENCES_PATH, originalRoot = DEFAULT_ORIGINAL_ROOT } = {}) {
  const { buffer, image } = readPeImage(executablePath);
  assertEqual(sha256(buffer), EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);
  const referencesBytes = readFileSync(referencesPath);
  assertEqual(sha256(referencesBytes), EXPECTED_REFERENCES_SHA256, `${referencesPath} SHA-256`);
  const references = readJson(referencesPath);
  assertEqual(references.sourceSha256, EXPECTED_EXECUTABLE_SHA256, `${referencesPath} source SHA-256`);
  const paletteSources = PALETTES.map((palette) => verifyPalette(originalRoot, palette));
  const referenceEdges = REQUIRED_REFERENCE_EDGES.map(([from, to, type]) => requireReference(references, from, to, type));

  return {
    question: "Which original palette files, state transitions, and ordered palette events make up the bounded Imjinrok day/night schedule?",
    analysisStatus: "static-confirmed-for-palette-load-state-advance-and-bounded-event-order",
    reproductionStatus: "reproduction-complete-for-initial-state-advance-wrap-palette-event-order-and-advance-gate",
    implementationStatus: "analysis-only-no-product-day-night-or-true-color-policy-change",
    sources: {
      executable: { path: executablePath, sha256: EXPECTED_EXECUTABLE_SHA256 },
      references: { path: referencesPath, sha256: EXPECTED_REFERENCES_SHA256 },
      palettes: paletteSources,
    },
    functions: {
      paletteLoader: "FUN_00440540",
      paletteApply: "FUN_004400b0",
      stateConstructor: "FUN_004924c0",
      stateAdvance: "FUN_00492510",
      forcePalette: "FUN_00492630",
      gameplayCaller: "FUN_00447360",
    },
    stateLayout: STATE_LAYOUT,
    constructorState: createInitialDayNightState(),
    timing: { subTicksPerPhase: 540, phasesPerCycle: 16, admittedUpdatesPerCycle: 8640, admittedUpdatesToPhase8Boundary: 4320 },
    paletteLoader: {
      initialCopy: { source: "night1", sourceAddress: "0x00bcd148", destination: "0x00aa33e8", dwordCount: 0x300, byteCount: 0xc00 },
      failureBoundary: "Each palette load checks its loader result and takes the shared cannot-open-palette reporting path; this extractor does not manufacture a successful load after that failure path.",
    },
    paletteApplyBoundary: {
      firstPaletteBytesReadForSubmission: 768,
      componentTransform: "each source byte is shifted left by two before the 256-entry submission",
      postSubmitCopy: "then REP MOVSD copies 0x300 DWORDs (0x0c00 bytes) from the supplied address; the night destinations are contiguous 0x300-byte regions, so a night1-address call starts at the four-palette block",
    },
    schedule: scheduleDescription(),
    referenceEdges,
    rawCodeRanges: RAW_CODE_RANGES.map((range) => verifyRawCodeRange(buffer, image, range)),
    evidencePoints: EVIDENCE_POINTS.map((point) => verifyEvidencePoint(buffer, image, point)),
    unresolvedBoundary: "The exact gameplay update rate or wall-clock calibration, true-color/palette-shader port, sight-radius semantics, map-specific enablement, and higher-level callers of FUN_00492630 are not established by this bounded evidence.",
  };
}

export function reproduceDayNightUpdate(input) {
  assertRecord(input, "input");
  const state = normalizeState(input.state);
  const operations = [];
  if (state.advanceGate === 0 && state.subTick < 540) {
    state.subTick += 1;
    operations.push({ type: "increment-subTick", subTick: state.subTick });
  } else if (state.advanceGate !== 0) {
    operations.push({ type: "advance-gate-prevents-subTick-increment", advanceGate: state.advanceGate });
  } else {
    operations.push({ type: "subTick-is-not-less-than-540-no-increment", subTick: state.subTick });
  }
  if (state.subTick === 540) {
    state.subTick = 0;
    state.phase += 1;
    operations.push({ type: "reset-subTick-and-increment-phase", phase: state.phase });
    if (state.phase === 16) {
      state.phase = 0;
      state.cycle = (state.cycle + 1) >>> 0;
      operations.push({ type: "wrap-phase-and-increment-cycle", cycle: state.cycle });
    }
  }
  state.phaseLightFlag = state.phase < 8 ? 1 : 0;
  operations.push({ type: "set-phase-light-flag", value: state.phaseLightFlag });
  operations.push(...scheduleOperations(state));
  return { state, operations };
}

export function reproduceForcedDayNightPalette(input) {
  assertRecord(input, "input");
  const phaseLightFlag = assertInteger(input.phaseLightFlag, 0, 0xffffffff, "phaseLightFlag");
  const palette = phaseLightFlag === 1 ? "night1" : "night4";
  return { phaseLightFlag, operations: [paletteOperation(palette, "force-palette-from-phase-light-flag")] };
}

export function createImjinrokDayNightScheduleFixture() {
  const vectors = [
    ["constructor-initial-state", createInitialDayNightState()],
    ["initial-admitted-update", { state: createInitialDayNightState() }],
    ["phase-8-subtick-0-night1-then-event-41", { state: { ...createInitialDayNightState(), phase: 7, subTick: 539 } }],
    ["phase-8-subtick-2-night2", { state: { ...createInitialDayNightState(), phase: 8, subTick: 1, phaseLightFlag: 0 } }],
    ["phase-8-subtick-4-night3", { state: { ...createInitialDayNightState(), phase: 8, subTick: 3, phaseLightFlag: 0 } }],
    ["phase-8-subtick-6-night4", { state: { ...createInitialDayNightState(), phase: 8, subTick: 5, phaseLightFlag: 0 } }],
    ["phase-0-subtick-0-night3-then-event-42-and-cycle-wrap", { state: { ...createInitialDayNightState(), cycle: 9, phase: 15, subTick: 539, phaseLightFlag: 0 } }],
    ["phase-0-subtick-2-night2", { state: { ...createInitialDayNightState(), subTick: 1 } }],
    ["phase-0-subtick-4-night1", { state: { ...createInitialDayNightState(), subTick: 3 } }],
    ["advance-gate-holds-phase8-boundary-and-repeats-its-scheduled-operations", { state: { ...createInitialDayNightState(), phase: 8, subTick: 0, advanceGate: 1, phaseLightFlag: 0 } }],
  ].map(([id, input]) => ({ id, input, expected: id === "constructor-initial-state" ? input : reproduceDayNightUpdate(input) }));
  return {
    sourceExecutableSha256: EXPECTED_EXECUTABLE_SHA256,
    sourceReferencesSha256: EXPECTED_REFERENCES_SHA256,
    palettes: PALETTES.map(({ id, path, sha256: digest }) => ({ id, path, sha256: digest, bytes: 768 })),
    timing: { subTicksPerPhase: 540, phasesPerCycle: 16, admittedUpdatesPerCycle: 8640, admittedUpdatesToPhase8Boundary: 4320 },
    vectors,
    forceVectors: [
      { id: "flag-one-forces-night1", input: { phaseLightFlag: 1 }, expected: reproduceForcedDayNightPalette({ phaseLightFlag: 1 }) },
      { id: "other-flag-forces-night4", input: { phaseLightFlag: 0 }, expected: reproduceForcedDayNightPalette({ phaseLightFlag: 0 }) },
    ],
  };
}

function scheduleDescription() {
  return [
    { phase: 8, subTick: 0, operations: ["apply night1", "emit 0x41"] },
    { phase: 8, subTick: 2, operations: ["apply night2"] },
    { phase: 8, subTick: 4, operations: ["apply night3"] },
    { phase: 8, subTick: 6, operations: ["apply night4"] },
    { phase: 0, subTick: 0, operations: ["apply night3", "emit 0x42"] },
    { phase: 0, subTick: 2, operations: ["apply night2"] },
    { phase: 0, subTick: 4, operations: ["apply night1"] },
  ];
}

function scheduleOperations(state) {
  const operations = [];
  if (state.phase === 8 && state.subTick === 0) {
    operations.push(paletteOperation("night1", "phase-8-subTick-0"), { type: "emit-event", event: "0x41" });
  } else if (state.phase === 8 && state.subTick === 2) {
    operations.push(paletteOperation("night2", "phase-8-subTick-2"));
  } else if (state.phase === 8 && state.subTick === 4) {
    operations.push(paletteOperation("night3", "phase-8-subTick-4"));
  } else if (state.phase === 8 && state.subTick === 6) {
    operations.push(paletteOperation("night4", "phase-8-subTick-6"));
  } else if (state.phase === 0 && state.subTick === 0) {
    operations.push(paletteOperation("night3", "phase-0-subTick-0"), { type: "emit-event", event: "0x42" });
  } else if (state.phase === 0 && state.subTick === 2) {
    operations.push(paletteOperation("night2", "phase-0-subTick-2"));
  } else if (state.phase === 0 && state.subTick === 4) {
    operations.push(paletteOperation("night1", "phase-0-subTick-4"));
  }
  return operations;
}

function paletteOperation(paletteId, trigger) {
  const palette = PALETTE_BY_ID.get(paletteId);
  return { type: "apply-palette", palette: paletteId, destination: palette.destination, trigger };
}

function verifyPalette(originalRoot, palette) {
  const path = resolve(originalRoot, palette.path);
  const bytes = readFileSync(path);
  assertEqual(bytes.length, 768, `${path} byte length`);
  assertEqual(sha256(bytes), palette.sha256, `${path} SHA-256`);
  return { id: palette.id, path, sha256: palette.sha256, bytes: bytes.length, pathReference: palette.pathReference, destination: palette.destination, role: palette.role };
}

function requireReference(references, from, to, type) {
  const entry = references.references?.find((candidate) => candidate.from === from && candidate.to === to && candidate.type === type);
  if (!entry) throw new Error(`references.json is missing required ${type} edge ${from} -> ${to}`);
  return { from, to, type, fromFunctionEntry: entry.fromFunctionEntry };
}

function normalizeState(value) {
  assertRecord(value, "input.state");
  return {
    cycle: assertInteger(value.cycle, 0, 0xffffffff, "input.state.cycle"),
    field4: assertInteger(value.field4, -0x80000000, 0x7fffffff, "input.state.field4"),
    phase: assertInteger(value.phase, 0, 15, "input.state.phase"),
    subTick: assertInteger(value.subTick, 0, 540, "input.state.subTick"),
    field10: assertInteger(value.field10, -0x80000000, 0x7fffffff, "input.state.field10"),
    field14: assertInteger(value.field14, -0x80000000, 0x7fffffff, "input.state.field14"),
    advanceGate: assertInteger(value.advanceGate, 0, 0xffffffff, "input.state.advanceGate"),
    phaseLightFlag: assertInteger(value.phaseLightFlag, 0, 0xffffffff, "input.state.phaseLightFlag"),
  };
}

function assertRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
}

function assertInteger(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(`${label} must be an integer in ${min}..${max}`);
  return value;
}

function parseArgs(argv) {
  if (argv.length === 0) return { mode: "report" };
  if (argv.length === 1 && argv[0] === "--fixture") return { mode: "fixture" };
  throw new Error("usage: extract-imjinrok-day-night-schedule.mjs [--fixture]");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { mode } = parseArgs(process.argv.slice(2));
  const artifact = mode === "fixture" ? createImjinrokDayNightScheduleFixture() : extractImjinrokDayNightSchedule();
  process.stdout.write(`${JSON.stringify(artifact, null, mode === "fixture" ? undefined : 2)}\n`);
}
