#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseSpriteLikeHeader } from "./codec.mjs";
import { extractEntityTypeCatalog } from "./extract-entity-type-catalog.mjs";
import { readPeImage, toHex } from "./pe-image.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_SEEDS_PATH = "analysis/generated/imjinrok2/seeds.json";
const DEFAULT_FUNCTIONS_PATH = "analysis/generated/imjinrok2/functions.json";
const DEFAULT_OUTPUT_JSON = "analysis/generated/original-entity-visual-profiles.json";
const DEFAULT_OUTPUT_TS = "packages/shared/src/originalEntityTypeProfiles.generated.ts";
const DEFAULT_OUTPUT_FIXTURE = "analysis/fixtures/original-entity-visual-profiles-vectors.json";

const RENDERER_FUNCTIONS = {
  entityRenderer: 0x0041fdb0,
  buildingRenderer: 0x00421c50,
  screenRectClearPivot: 0x00438930,
  screenRectCenteredPivot: 0x00438aa0,
};

const BUILDING_FLAG = 0x00000002;
const BLOCKER_FLAG_MASK = 0x00020002;
const CONSTRUCTION_PHASE_THRESHOLDS = [0, 10, 20, 30, 40, 50, 70, 100];

const SWITCH_CLASS_START = 41;
const SWITCH_CLASS_END = 95;
const SWITCH_DESTINATION_TABLE_VA = 0x00423028;
const SWITCH_SELECTOR_TABLE_VA = 0x00423064;
const SWITCH_DESTINATION_COUNT = 15;
const SWITCH_CLASS_COUNT = SWITCH_CLASS_END - SWITCH_CLASS_START + 1;

const CONTINUOUS_CASES = new Map([
  [0x00422323, { frameStart: 12, frameCount: 16, divisor: 4 }],
  [0x00422280, { frameStart: 16, frameCount: 11, divisor: 4 }],
  [0x004228bc, { frameStart: 14, frameCount: 7, divisor: 4 }],
  [0x00422ed5, { frameStart: 9, frameCount: 19, divisor: 4 }],
  [0x00422197, { frameStart: 9, frameCount: 7, divisor: 4 }],
  [0x00422abb, { frameStart: 10, frameCount: 10, divisor: 4 }],
  [0x00422b85, { frameStart: 21, frameCount: 8, divisor: 4 }],
  [0x00422c88, { frameStart: 9, frameCount: 10, divisor: 4 }],
  [0x004229d1, { frameStart: 11, frameCount: 10, divisor: 4 }],
  [0x00422dc0, { frameStart: 10, frameCount: 10, divisor: 4 }],
]);

const SPECIAL_CASES = new Set([0x00421ecb, 0x00421def, 0x00421ce4, 0x00421c85]);

const CODE_ANCHORS = [
  ["entity-renderer-building-renderer-call", 0x00420764, "e8 e7 14 00 00", "FUN_0041fdb0 calls FUN_00421c50 after entity render helpers"],
  ["building-renderer-entry-and-positive-health-gate", 0x00421c50, "83 ec 14 53 55 56 8b f1 33 ed 57 66 39 6e 3e", "FUN_00421c50 starts with entity health gate before class switch"],
  ["building-renderer-class-switch-normalization", 0x00421c65, "33 c0 8a 46 37 83 c0 d7 83 f8 36", "building renderer selects class 41..95 through byte class minus 0x29"],
  ["building-renderer-class-selector-load", 0x00421c78, "8a 88 64 30 42 00", "building renderer loads selector byte from 0x00423064 after class normalization"],
  ["building-renderer-class-switch-table", 0x00421c7e, "ff 24 8d 28 30 42 00", "building renderer dispatches through selector-indexed destination table 0x00423028"],
  ["building-renderer-destination-table-prefix", SWITCH_DESTINATION_TABLE_VA, "23 23 42 00 80 22 42 00 bc 28 42 00 d5 2e 42 00 97 21 42 00 cb 1e 42 00 bb 2a 42 00 85 2b 42 00 88 2c 42 00 d1 29 42 00 c0 2d 42 00 e4 1c 42 00 ef 1d 42 00 85 1c 42 00 1d 30 42 00", "15-entry selector destination table"],
  ["building-renderer-shared-effect-state-gate", 0x00422607, "66 83 be 50 05 00 00 01 75 65 66 39 ae 52 05 00 00", "shared post-branch effect path gates on entity WORD fields +0x550 and +0x552"],
  ["building-renderer-shared-effect-counter", 0x0042262c, "66 ff 86 54 05 00 00", "shared post-branch effect path increments entity WORD counter +0x554"],
  ["screen-rect-clear-pivot-dimensions", 0x00438939, "8a 8e e3 01 00 00", "FUN_00438930 reads current SPR width byte +0x1e3 for screen-rect geometry"],
  ["screen-rect-clear-pivot-flag-split", 0x004389ac, "8a 46 74 a8 08 74 66", "FUN_00438930 branches on low-byte flags bit 0x08"],
  ["screen-rect-centered-pivot-dimensions", 0x00438aa1, "8a 99 e3 01 00 00", "FUN_00438aa0 reads current SPR width byte +0x1e3 for screen-rect geometry"],
  ["screen-rect-centered-pivot-flag-split", 0x00438b0e, "8a 41 74 a8 08", "FUN_00438aa0 branches on low-byte flags bit 0x08"],
  ["type-writer-render-offset-load", 0x0045bd20, "66 8b 44 24 14", "one-based writer argument 5 is loaded as a WORD"],
  ["type-writer-render-offset-write", 0x0045bd2e, "66 89 41 0c", "one-based writer argument 5 is written to type record +0x0c"],
];

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const report = extractOriginalEntityVisualProfiles({
    executablePath: args.input ?? DEFAULT_EXECUTABLE_PATH,
    seedsPath: args.seeds ?? DEFAULT_SEEDS_PATH,
    functionsPath: args.functions ?? DEFAULT_FUNCTIONS_PATH,
  });
  if (args.output) writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`);
  if (args.ts) writeFileSync(args.ts, renderGeneratedTypeScript(report, args.ts));
  if (args.fixture) writeFileSync(args.fixture, `${JSON.stringify(buildFixture(report), null, 2)}\n`);
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else printSummary(report, args.output, args.ts);
}

export function extractOriginalEntityVisualProfiles({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  seedsPath = DEFAULT_SEEDS_PATH,
  functionsPath = DEFAULT_FUNCTIONS_PATH,
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  const executableSha256 = sha256(buffer);
  const catalog = extractEntityTypeCatalog({ executablePath, seedsPath });
  const functions = readJson(functionsPath, "function analysis");
  assertEqual(functions.sourceSha256, executableSha256, `${functionsPath} source SHA-256`);
  const anchors = CODE_ANCHORS.map(([id, va, bytes, meaning]) => validateAnchor(buffer, image, { id, va, bytes, meaning }));
  const switchTables = extractSwitchTables(buffer, image);
  const types = catalog.types.map((type) => buildEntityProfile(type, executablePath));
  const buildingProfiles = types.filter((type) => (type.flags & BUILDING_FLAG) !== 0).map((type) => buildBuildingProfile(type, switchTables.classDestinations));
  const switchCases = buildSwitchCases(switchTables.classDestinations);

  return {
    schemaVersion: 1,
    evidenceStatus: "static-confirmed-render-pivot-and-building-switch-map",
    analysisScope: "All 95 canonical type records receive source dimensions, numeric flags, signed type +0x0c vertical offset, and the renderer pivot split. Building profiles are limited to flag bit 0x2; the renderer's selector and destination tables are read directly from the PE, continuous draw ranges are paired with the shared source tick, and stateful/random draws remain quarantined in conditionalEffects.",
    source: {
      executablePath,
      executableSha256,
      seedsPath,
      seedsSha256: catalog.source.seedsSha256,
      functionsPath,
      functionsSha256: sha256(readFileSync(functionsPath)),
      catalogSha256: sha256(Buffer.from(JSON.stringify(catalog))),
    },
    renderer: {
      functions: Object.fromEntries(Object.entries(RENDERER_FUNCTIONS).map(([name, entry]) => [name, toHex(entry)])),
      pivotFormula: "flags low-byte bit 0x08 clear => (current SPR width/2, current SPR height - signed type record +0x0c); set => (current SPR width/2, current SPR height/2)",
      runtimeFieldsExcluded: ["entity+0x1bc", "entity+0x1be", "entity+0x1d6", "entity+0x1d8", "entity+0x1da", "entity+0x1dc", "entity+0x1e0"],
      codeAnchors: anchors,
      analyzedFunctionSummaries: summarizeFunctions(functions, Object.values(RENDERER_FUNCTIONS)),
    },
    buildingRenderer: {
      function: toHex(RENDERER_FUNCTIONS.buildingRenderer),
      switchAddress: "0x00421c7e",
      switchSelector: "signed-independent byte class - 0x29, range 0..0x36; classes 41..95, default outside",
      switchTables,
      switchCases,
      construction: {
        phaseThresholds: CONSTRUCTION_PHASE_THRESHOLDS,
        frameFormula: "constructionPhase + (typeBaseFrame - 7)",
        status: "static-confirmed-generic-selector",
      },
      completedBody: {
        healthyFormula: "typeBaseFrame",
        damagedFormula: "typeBaseFrame + 1",
        damageFormula: "effectiveHealth=(100-constructionPercent)*trunc(maximumHealth/100)+currentHealth; damaged when effectiveHealth < trunc(maximumHealth*50/100)",
        status: "static-confirmed-generic-health-selector",
      },
    },
    summary: {
      typeCount: types.length,
      buildingProfileCount: buildingProfiles.length,
      continuousOverlayDrawCount: buildingProfiles.filter((type) => type.overlays.some((overlay) => overlay.category === "continuous")).length,
      quarantinedConditionalDrawCount: buildingProfiles.reduce((count, type) => count + type.conditionalEffects.length, 0),
      classesWithConditionalEffect: buildingProfiles.filter((type) => type.conditionalEffects.length > 0).length,
      classesWithContinuousOverlay: buildingProfiles.filter((type) => type.overlay.category === "continuous").length,
      classesWithSpecialOverlay: buildingProfiles.filter((type) => type.overlay.category === "conditional/random/special").length,
      classesWithNoOverlay: buildingProfiles.filter((type) => type.overlay.category === "none").length,
      blockerMaskMatches: types.filter((type) => (type.flags & BLOCKER_FLAG_MASK) !== 0).length,
    },
    types,
    buildingProfiles,
  };
}

function buildEntityProfile(type, executablePath) {
  const sourceRoot = resolve(dirname(executablePath));
  const spritePath = resolveSourcePath(sourceRoot, type.sprite.sourcePath);
  let bytes;
  let header;
  try {
    bytes = readFileSync(spritePath);
    header = parseSpriteLikeHeader(bytes, spritePath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const flags = Number.parseInt(type.definition.flags, 16);
  const verticalOffset = type.definition.renderVerticalOffset;
  const centered = (flags & 0x08) !== 0;
  const pivot = {
    x: header ? Math.trunc(header.width / 2) : null,
    y: header ? (centered ? Math.trunc(header.height / 2) : header.height - verticalOffset) : null,
  };
  return {
    internalClass: type.internalClass,
    originalGameplayName: type.originalGameplayName,
    flags,
    flagsHex: type.definition.flags,
    blockerMaskMatch: (flags & BLOCKER_FLAG_MASK) !== 0,
    sprite: {
      slot: type.sprite.slot,
      baseFrame: type.sprite.baseFrame,
      sourcePath: type.sprite.sourcePath,
      sourcePathNormalized: type.sprite.sourcePathNormalized,
      sourcePathResolved: relative(sourceRoot, spritePath).replaceAll("\\", "/"),
      sha256: bytes ? sha256(bytes) : null,
      width: header?.width ?? null,
      height: header?.height ?? null,
      frameCount: header?.frameCount ?? null,
    },
    render: {
      verticalOffset,
      verticalOffsetField: "+0x0c",
      writerArgumentOrdinal: 5,
      pivotMode: centered ? "center" : "type-offset",
      pivot,
      formula: centered ? "(current SPR width/2, current SPR height/2)" : "(current SPR width/2, current SPR height - signed type +0x0c)",
      evidenceStatus: header ? "static-confirmed" : "unresolved-missing-source-sprite",
    },
  };
}

function resolveSourcePath(baseDirectory, sourcePath) {
  let current = resolve(baseDirectory);
  for (const segment of sourcePath.replaceAll("\\", "/").split("/").filter(Boolean)) {
    let entries;
    try {
      entries = readdirSync(current);
    } catch (error) {
      if (error.code === "ENOENT") throw error;
      throw error;
    }
    const matches = entries.filter((entry) => entry.toLowerCase() === segment.toLowerCase());
    if (matches.length > 1) {
      throw new Error(`Case-insensitive source path collision under ${current}: ${matches.join(", ")}`);
    }
    if (matches.length === 0) {
      const error = new Error(`Source sprite path does not exist: ${sourcePath}`);
      error.code = "ENOENT";
      throw error;
    }
    current = resolve(current, matches[0]);
  }
  return current;
}

export function calculateStaticPivot({ width, height, flags, verticalOffset }) {
  for (const [label, value] of Object.entries({ width, height, flags, verticalOffset })) {
    if (!Number.isInteger(value)) throw new TypeError(`${label} must be an integer`);
  }
  if (width <= 0 || height <= 0) throw new RangeError("SPR dimensions must be positive");
  const centered = (flags & 0x08) !== 0;
  return {
    pivotMode: centered ? "center" : "type-offset",
    x: Math.trunc(width / 2),
    y: centered ? Math.trunc(height / 2) : height - verticalOffset,
  };
}

export function selectContinuousOverlayFrame({ frameStart, frameCount, sourceGlobalTick, sourceGlobalTickDivisor }) {
  for (const [label, value] of Object.entries({ frameStart, frameCount, sourceGlobalTick, sourceGlobalTickDivisor })) {
    if (!Number.isInteger(value)) throw new TypeError(`${label} must be an integer`);
  }
  if (frameStart < 0 || frameCount <= 0 || sourceGlobalTick < 0 || sourceGlobalTickDivisor <= 0) {
    throw new RangeError("continuous overlay inputs must be non-negative with positive divisor/count");
  }
  return frameStart + Math.trunc(sourceGlobalTick / sourceGlobalTickDivisor) % frameCount;
}

function extractSwitchTables(buffer, image) {
  const destinationOffset = image.vaToRawOffset(SWITCH_DESTINATION_TABLE_VA);
  const selectorOffset = image.vaToRawOffset(SWITCH_SELECTOR_TABLE_VA);
  if (destinationOffset === undefined || selectorOffset === undefined) {
    throw new RangeError("Building renderer switch tables are not backed by PE sections");
  }
  const destinationBytes = buffer.subarray(destinationOffset, destinationOffset + SWITCH_DESTINATION_COUNT * 4);
  const selectorBytes = buffer.subarray(selectorOffset, selectorOffset + SWITCH_CLASS_COUNT);
  if (destinationBytes.length !== SWITCH_DESTINATION_COUNT * 4 || selectorBytes.length !== SWITCH_CLASS_COUNT) {
    throw new RangeError("Building renderer switch table spans are truncated");
  }
  const destinations = Array.from({ length: SWITCH_DESTINATION_COUNT }, (_, index) => destinationBytes.readUInt32LE(index * 4));
  const classDestinations = {};
  for (let index = 0; index < SWITCH_CLASS_COUNT; index += 1) {
    const selector = selectorBytes[index];
    if (selector >= destinations.length) throw new Error(`Invalid building renderer selector ${selector} for class ${SWITCH_CLASS_START + index}`);
    classDestinations[SWITCH_CLASS_START + index] = destinations[selector];
  }
  return {
    destinationTableVa: toHex(SWITCH_DESTINATION_TABLE_VA),
    destinationTableEntryCount: destinations.length,
    destinationTableBytesHex: destinationBytes.toString("hex"),
    destinationTableSha256: sha256(destinationBytes),
    destinationTable: destinations.map((destination, selector) => ({ selector, destination: toHex(destination) })),
    selectorTableVa: toHex(SWITCH_SELECTOR_TABLE_VA),
    selectorTableEntryCount: selectorBytes.length,
    selectorTableBytesHex: selectorBytes.toString("hex"),
    selectorTableSha256: sha256(selectorBytes),
    selectorTable: Array.from(selectorBytes, (selector, index) => ({ internalClass: SWITCH_CLASS_START + index, selector, destination: toHex(destinations[selector]) })),
    classDestinations: Object.fromEntries(Object.entries(classDestinations).map(([internalClass, destination]) => [internalClass, toHex(destination)])),
  };
}

function buildBuildingProfile(type, classDestinations) {
  const destinationHex = classDestinations[type.internalClass];
  const destination = destinationHex === undefined ? undefined : Number.parseInt(destinationHex, 16);
  const overlays = classifySwitchCase(destination);
  const switchCase = overlays[0];
  const baseFrame = type.sprite.baseFrame;
  return {
    internalClass: type.internalClass,
    originalGameplayName: type.originalGameplayName,
    flags: type.flags,
    sourcePath: type.sprite.sourcePath,
    construction: {
      phaseThresholds: CONSTRUCTION_PHASE_THRESHOLDS,
      frameFormula: "constructionPhase + (typeBaseFrame - 7)",
      status: "static-confirmed-generic-selector",
    },
    completedBody: {
      healthyFrame: baseFrame,
      damagedFrame: baseFrame + 1,
      damageFormula: "effectiveHealth=(100-constructionPercent)*trunc(maximumHealth/100)+currentHealth",
      thresholdFormula: "threshold=trunc(maximumHealth*50/100)",
      damagedWhen: "effectiveHealth < threshold",
      boundary: "effectiveHealth == threshold is healthy",
      status: "static-confirmed-generic-health-selector",
    },
    overlay: switchCase,
    overlays,
    conditionalEffects: overlays.filter((overlay) => overlay.category === "conditional/random/special"),
  };
}

function classifySwitchCase(destination) {
  if (destination === undefined || destination === 0x0042301d) return [{ category: "none", status: "static-confirmed-switch-default" }];
  const continuous = CONTINUOUS_CASES.get(destination);
  if (continuous) {
    const primary = {
      category: "continuous",
      frameStart: continuous.frameStart,
      frameCount: continuous.frameCount,
      sourceGlobalTickDivisor: continuous.divisor,
      status: continuous.status ?? (continuous.frameStart === null ? "unresolved-source-frame-table" : "static-confirmed-frame-range"),
      adaptation: "global source tick is shifted by 2 bits before this branch divisor; wall-clock/FPS unit is unresolved",
    };
    if (destination === 0x00422323) {
      return [primary, {
        category: "conditional/random/special",
        status: "static-confirmed-conditional-effect-gate",
        gateFields: ["entity+0x08c", "entity+0x02c"],
        sharedStateFields: ["entity+0x550", "entity+0x552", "entity+0x554"],
        secondaryRendererEntries: ["0x004517a0", "0x00451910", "0x0044e160"],
        note: "The class-41 destination includes completion/state gates and a separate effect draw after the continuous body path; the secondary producer is quarantined from runtime continuous selection.",
      }];
    }
    return [primary];
  }
  if (SPECIAL_CASES.has(destination)) {
    return [{
      category: "conditional/random/special",
      status: "static-confirmed-special-branch",
      sourceGlobalTickDivisor: null,
      note: "Branch has completion/state/owner or action-dependent gates and must not be represented as a continuous animation.",
    }];
  }
  return [{ category: "none", status: "static-confirmed-switch-default" }];
}

function buildSwitchCases(classDestinations) {
  const cases = [];
  for (let internalClass = 1; internalClass <= 95; internalClass += 1) {
    const destinationHex = classDestinations[internalClass];
    const destination = destinationHex === undefined ? undefined : Number.parseInt(destinationHex, 16);
    const overlays = classifySwitchCase(destination);
    cases.push({ internalClass, destination: destinationHex ?? null, overlays, conditionalEffects: overlays.filter((overlay) => overlay.category === "conditional/random/special"), ...overlays[0] });
  }
  return cases;
}

function summarizeFunctions(document, entries) {
  return entries.map((entry) => {
    const functionReport = document.functions.find((candidate) => candidate.entry === toHex(entry));
    if (!functionReport) return { entry: toHex(entry), status: "unresolved-function-summary" };
    return { entry: functionReport.entry, name: functionReport.name, bodyRanges: functionReport.bodyRanges, instructionCount: functionReport.instructionCount, instructionSha256: functionReport.instructionSha256 };
  });
}

function buildFixture(report) {
  const class76 = report.types.find((type) => type.internalClass === 76);
  const class50 = report.buildingProfiles.find((type) => type.internalClass === 50);
  const class57 = report.buildingProfiles.find((type) => type.internalClass === 57);
  return {
    schemaVersion: 1,
    sourceExecutableSha256: report.source.executableSha256,
    completeClasses: report.types.map((type) => type.internalClass),
    pivotVectors: [
      { internalClass: 76, dimensions: [class76.sprite.width, class76.sprite.height], verticalOffset: class76.render.verticalOffset, flags: class76.flags, pivotMode: class76.render.pivotMode, pivot: class76.render.pivot },
      { internalClass: 49, dimensions: [report.types[48].sprite.width, report.types[48].sprite.height], verticalOffset: report.types[48].render.verticalOffset, flags: report.types[48].flags, pivotMode: report.types[48].render.pivotMode, pivot: report.types[48].render.pivot },
    ],
    buildingOverlayVectors: [
      { internalClass: 50, frameRange: [class50.overlay.frameStart, class50.overlay.frameStart + class50.overlay.frameCount - 1], sourceGlobalTickDivisor: class50.overlay.sourceGlobalTickDivisor },
      { internalClass: 57, frameRange: [class57.overlay.frameStart, class57.overlay.frameStart + class57.overlay.frameCount - 1], sourceGlobalTickDivisor: class57.overlay.sourceGlobalTickDivisor },
    ],
  };
}

function renderGeneratedTypeScript(report, outputPath) {
  const generatorPath = fileURLToPath(import.meta.url);
  const generatorSha256 = sha256(readFileSync(generatorPath));
  const types = Object.fromEntries(report.types.map((type) => [type.internalClass, {
    internalClass: type.internalClass,
    originalGameplayName: type.originalGameplayName,
    flags: type.flags,
    sprite: type.sprite,
    render: type.render,
  }]));
  const buildings = report.buildingProfiles.map((profile) => profile);
  return `// GENERATED FILE - DO NOT EDIT. Regenerate with tools/imjinrok/extract-original-entity-visual-profiles.mjs.\n// generatorSha256: ${generatorSha256}\n// executableSha256: ${report.source.executableSha256}\n// outputPath: ${outputPath}\n\nexport const originalEntityTypeProfilesByClass = ${JSON.stringify(types, null, 2)} as const;\n\nexport const originalBuildingVisualProfiles = ${JSON.stringify(buildings, null, 2)} as const;\n`;
}

function readJson(path, label) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (error) { throw new Error(`Cannot read ${label} from ${path}: ${error.message}`, { cause: error }); }
}

function validateAnchor(buffer, image, anchor) {
  const offset = image.vaToRawOffset(anchor.va);
  if (offset === undefined) throw new RangeError(`${toHex(anchor.va)} is not backed by a PE section`);
  const expected = Buffer.from(anchor.bytes.replaceAll(" ", ""), "hex");
  const actual = buffer.subarray(offset, offset + expected.length);
  if (!actual.equals(expected)) throw new Error(`Static code anchor ${anchor.id} mismatch at ${toHex(anchor.va)}`);
  return { ...anchor, va: toHex(anchor.va), expectedBytes: anchor.bytes, actualBytes: actual.toString("hex").match(/../g).join(" "), matched: true };
}

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function assertEqual(actual, expected, label) { if (actual !== expected) throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`); }
function parseArgs(argv) {
  const parsed = {};
  const keys = { "--input": "input", "--seeds": "seeds", "--functions": "functions", "--output": "output", "--ts": "ts", "--fixture": "fixture" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") { parsed.json = true; continue; }
    const key = keys[arg];
    if (!key || !argv[index + 1]) throw new Error(`${arg} requires a path`);
    parsed[key] = argv[++index];
  }
  return parsed;
}
function printSummary(report, output, ts) { console.log(`Original visual profiles: ${report.summary.typeCount} classes, ${report.summary.buildingProfileCount} building profiles`); if (output) console.log(`  json: ${output}`); if (ts) console.log(`  ts: ${ts}`); }
