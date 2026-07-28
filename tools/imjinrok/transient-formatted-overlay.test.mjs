import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_EXECUTABLE_SHA256,
  extractTransientFormattedOverlay,
  reproduceOverlayProduction,
  reproduceTransientFormattedOverlay,
} from "./extract-transient-formatted-overlay.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const executablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const functionsPath = join(repositoryRoot, "analysis/generated/imjinrok2/functions.json");
const referencesPath = join(repositoryRoot, "analysis/generated/imjinrok2/references.json");
const fixturePath = join(
  repositoryRoot,
  "analysis/fixtures/transient-formatted-overlay-vectors.json",
);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

test("binds vectors to the exact executable and synthetic-metric evidence boundary", () => {
  assert.equal(fixture.sourceExecutableSha256, EXPECTED_EXECUTABLE_SHA256);
  assert.match(fixture.scopeNotice, /do not establish original glyph widths/u);
  assert.match(fixture.scopeNotice, /post-call RECT values are supplied synthetic inputs/u);
  assert.match(fixture.scopeNotice, /fixed bottom selection panel/u);
});

test("recovers exact renderer, producer, caller, import, and reference provenance", () => {
  const report = extractTransientFormattedOverlay({
    executablePath,
    functionsPath,
    referencesPath,
  });
  assert.equal(
    report.analysisStatus,
    "static-confirmed-render-control-flow-with-bounded-producer-alias-scope",
  );
  assert.equal(
    report.reproductionStatus,
    "scoped-reproduction-complete-with-supplied-text-metrics-post-call-rect-and-cache-gated-base-helper",
  );
  assert.equal(report.implementationStatus, "analysis-only-no-product-change");
  assert.equal(report.rawCodeRanges.length, 6);
  assert.equal(report.functionCatalog.length, 6);
  assert.equal(report.evidencePoints.length, 27);
  assert.equal(report.referenceSets.length, 12);
  assert.deepEqual(
    report.referenceSets.find(({ label }) => label === "FUN_004567c0 callers").references,
    [{
      from: "0x00447b23",
      to: "0x004567c0",
      type: "UNCONDITIONAL_CALL",
      fromFunctionEntry: "0x004475a0",
    }],
  );
  assert.deepEqual(
    report.referenceSets.find(({ label }) => label === "FUN_00456630 callers").references,
    [
      {
        from: "0x0045aa2f",
        to: "0x00456630",
        type: "UNCONDITIONAL_CALL",
        fromFunctionEntry: "0x00459490",
      },
      {
        from: "0x0045acd9",
        to: "0x00456630",
        type: "UNCONDITIONAL_CALL",
        fromFunctionEntry: "0x00459490",
      },
    ],
  );
  assert.deepEqual(
    report.referenceSets.find(({ label }) => label === "FUN_00457460 callers").references,
    [
      {
        from: "0x0045740c",
        to: "0x00457460",
        type: "UNCONDITIONAL_CALL",
        fromFunctionEntry: "0x004567c0",
      },
      {
        from: "0x0046f253",
        to: "0x00457460",
        type: "UNCONDITIONAL_CALL",
        fromFunctionEntry: "0x0046f140",
      },
    ],
  );
  assert.deepEqual(
    report.imports.map(({ name }) => name),
    [
      "SetBkColor",
      "SetTextColor",
      "SetBkMode",
      "TextOutA",
      "SelectObject",
      "GetTextExtentPoint32A",
      "lstrlenA",
      "wsprintfA",
    ],
  );
  assert.deepEqual(
    report.formatStrings.map(({ value }) => value),
    [")", "%c", "(", " %d ", "%s", "%s(%c)"],
  );
  assert.match(report.semanticConclusion, /disproves the fixed bottom-selection-panel/u);
  assert.match(report.semanticConclusion, /x=200,y=350/u);
  assert.match(report.baseStringHelper, /equal cached bytes also proceed/u);
  assert.match(report.ownerFields.field_0x82, /signed low WORD of post-call RECT\.right/u);
  assert.match(report.ownerFields.field_0x82, /full post-call RECT\.right/u);
  assert.match(report.ownerFields.field_0x84, /signed low WORD of post-call RECT\.bottom/u);
  assert.match(report.ownerFields.field_0x84, /full post-call RECT\.bottom/u);
  assert.match(report.completenessBoundary, /whole helper FUN_00457460/u);
  assert.match(report.completenessBoundary, /complete two-caller structured set/u);
  assert.match(
    report.completenessBoundary,
    /0x0046f253\/FUN_0046f140 is boundary-only/u,
  );
  assert.match(report.completenessBoundary, /second caller's UI meaning is not expanded/u);
  assert.match(report.completenessBoundary, /arbitrary alias writes/u);
});

test("reproduces every complete producer and renderer vector", () => {
  const produced = new Map();
  for (const vector of fixture.producerVectors) {
    const output = reproduceOverlayProduction({
      ...vector.input,
      initial: baseState(),
    });
    assert.equal(sha256Json(output), vector.expectedOutputSha256, vector.id);
    produced.set(vector.id, output);
  }
  for (const vector of fixture.renderVectors) {
    const initial = vector.producerVectorId
      ? structuredClone(produced.get(vector.producerVectorId))
      : baseState();
    if (vector.stateOverrides) Object.assign(initial, structuredClone(vector.stateOverrides));
    const output = reproduceTransientFormattedOverlay({ ...vector.input, initial });
    assert.equal(sha256Json(output), vector.expectedOutputSha256, vector.id);
  }
});

test("preserves measured layout, icon-lock failure, draw order, and exact placement", () => {
  const output = reproduceRender("synthetic-metrics-normal-layout-with-one-icon-lock-failure");
  assert.deepEqual(
    output.operations.find(({ type }) => type === "measure-content"),
    {
      type: "measure-content",
      formattedPrimary: "Kwon",
      maxWidth: 74,
      totalHeight: 33,
      numericRowWidth: 74,
      numericRowHeight: 10,
    },
  );
  assert.deepEqual(
    output.operations.find(({ type }) => type === "request-transient-surface"),
    {
      type: "request-transient-surface",
      initialRect: { left: 0, top: 0, right: 89, bottom: 48 },
      postCallRect: { left: 0, top: 0, right: 89, bottom: 48 },
      requestedWidth: 89,
      requestedHeight: 48,
    },
  );
  assert.deepEqual(
    output.operations.filter(({ type }) =>
      type === "draw-runtime-icon"
      || type === "numeric-icon-lock-failed"
      || type === "draw-numeric-text"),
    [
      { type: "draw-runtime-icon", index: 0, x: 7, y: 20 },
      { type: "draw-numeric-text", index: 0, text: " 12 ", x: 15, y: 20 },
      { type: "numeric-icon-lock-failed", index: 2 },
      { type: "draw-numeric-text", index: 2, text: " -3 ", x: 45, y: 20 },
    ],
  );
  assert.deepEqual(
    output.operations.find(({ type }) => type === "draw-extra-line"),
    { type: "draw-extra-line", index: 0, text: "line", x: 7, y: 30 },
  );
  assert.deepEqual(
    output.operations.filter(({ type }) =>
      type === "update-base-text-cache-before-hdc"
      || type === "measure-base-text-result-unused"
      || type === "draw-base-text"),
    [
      {
        type: "update-base-text-cache-before-hdc",
        context: 10,
        text: "notice",
      },
      { type: "measure-base-text-result-unused", text: "notice" },
      { type: "draw-base-text", text: "notice", x: 200, y: 350 },
    ],
  );
  assert.deepEqual(output.final, {
    dirtyWord: 0,
    coordinateX: 276,
    coordinateY: 352,
    baseText: "notice",
    primaryText: "Kwon",
    values: [12, 0, -3, 0],
    selectorByte: 0,
    extraLines: [
      { activeState: 1, text: "line" },
      { activeState: 0, text: "retained-extra-1" },
      { activeState: 0, text: "retained-extra-2" },
    ],
  });
});

test("draws a nonzero selector as four segments and clamps both near edges", () => {
  const output = reproduceRender("synthetic-suffix-segments-and-near-edge-clamp");
  assert.deepEqual(
    output.operations.filter(({ type }) => type === "draw-primary-segment"),
    [
      { type: "draw-primary-segment", text: "A", color: "default", x: 7, y: 7 },
      { type: "draw-primary-segment", text: "(", color: "default", x: 15, y: 7 },
      {
        type: "draw-primary-segment",
        text: "K",
        color: "highlight-0x00b4dce1",
        x: 23,
        y: 7,
      },
      { type: "draw-primary-segment", text: ")", color: "default", x: 31, y: 7 },
    ],
  );
  assert.deepEqual(
    output.operations.find(({ type }) => type === "position-transient-surface"),
    {
      type: "position-transient-surface",
      x: 0,
      y: 0,
      postCallRect: { left: 0, top: 0, right: 47, bottom: 27 },
    },
  );
});

test("uses separate-half block alignment and keeps narrower extra lines at block left", () => {
  const output = reproduceRender(
    "synthetic-post-call-rect-separate-half-rounding-and-block-left-extra-line",
  );
  assert.deepEqual(
    output.operations.filter(({ type }) =>
      type === "draw-primary-text" || type === "draw-extra-line"),
    [
      { type: "draw-primary-text", text: "wide", x: 3, y: 3 },
      { type: "draw-extra-line", index: 0, text: "n", x: 3, y: 5 },
    ],
  );
  assert.deepEqual(output.operations.at(-1), {
    type: "blit-transient-surface",
    x: 95,
    y: 90,
    postCallRect: { left: 2, top: 4, right: 10, bottom: 10 },
  });
});

test("does not read numeric branch outcomes when all numeric WORD values are zero", () => {
  const vector = fixture.renderVectors.find(
    ({ id }) =>
      id === "synthetic-post-call-rect-separate-half-rounding-and-block-left-extra-line",
  );
  assert.ok(vector);
  const input = structuredClone(vector.input);
  input.numericIconLockSucceeded = "unreachable-invalid";
  input.numericHdcReacquired = { unreachable: true };
  const initial = baseState();
  Object.assign(initial, structuredClone(vector.stateOverrides));

  const output = reproduceTransientFormattedOverlay({ ...input, initial });

  assert.equal(output.status, "rendered");
  assert.deepEqual(
    output.operations.filter(({ type }) =>
      type === "release-draw-hdc-before-icon"
      || type === "draw-runtime-icon"
      || type === "numeric-icon-lock-failed"
      || type === "reacquire-draw-hdc-after-icon"
      || type === "draw-numeric-text"),
    [],
  );
});

test("clamps far edges with one-pixel margins and oversized post-call bounds to zero", () => {
  const far = reproduceRender("far-edge-clamp-keeps-one-pixel-margin");
  assert.deepEqual(
    far.operations.find(({ type }) => type === "position-transient-surface"),
    {
      type: "position-transient-surface",
      x: 614,
      y: 454,
      postCallRect: { left: 0, top: 0, right: 25, bottom: 25 },
    },
  );
  const oversized = reproduceRender(
    "post-call-rect-larger-than-runtime-clamps-to-zero",
  );
  assert.deepEqual(
    oversized.operations.find(({ type }) => type === "position-transient-surface"),
    {
      type: "position-transient-surface",
      x: 0,
      y: 0,
      postCallRect: { left: -2, top: -3, right: 25, bottom: 25 },
    },
  );
});

test("reproduces the base-text helper's exact unusual cache gate and HDC ordering", () => {
  const empty = reproduceRender("synthetic-suffix-segments-and-near-edge-clamp");
  assert.deepEqual(
    empty.operations.filter(({ type }) => type.startsWith("base-text-")),
    [{ type: "base-text-empty-no-op" }],
  );

  const sameContextDifferent = reproduceRender(
    "initial-hdc-failure-does-not-read-content-fields",
  );
  assert.deepEqual(
    sameContextDifferent.operations.filter(({ type }) => type.startsWith("base-text-")),
    [{
      type: "base-text-same-context-different-cache-no-op",
      currentContext: 5,
      text: "base",
    }],
  );
  assert.deepEqual(sameContextDifferent.finalBaseTextCache, {
    context: 5,
    text: "different",
  });

  const sameContextSame = reproduceRender(
    "draw-hdc-failure-still-invokes-base-helper-and-blits",
  );
  assert.ok(
    sameContextSame.operations.some(({ type }) => type === "draw-base-text"),
  );
  const changedContext = reproduceRender(
    "synthetic-metrics-normal-layout-with-one-icon-lock-failure",
  );
  assert.ok(
    changedContext.operations.some(({ type }) => type === "draw-base-text"),
  );
  const changedContextInput = structuredClone(fixture.renderVectors[0].input);
  changedContextInput.baseTextCache.text = 1;
  const changedContextWithUnreadOldText = reproduceTransientFormattedOverlay({
    ...changedContextInput,
    initial: producedState(fixture.renderVectors[0].producerVectorId),
  });
  assert.deepEqual(changedContextWithUnreadOldText.finalBaseTextCache, {
    context: 10,
    text: "notice",
  });

  const hdcFailure = reproduceRender(
    "base-cache-update-survives-hdc-acquisition-failure",
  );
  assert.deepEqual(
    hdcFailure.operations.filter(({ type }) =>
      type === "update-base-text-cache-before-hdc"
      || type === "base-text-hdc-acquisition-failed"),
    [
      {
        type: "update-base-text-cache-before-hdc",
        context: 8,
        text: "cache-me",
      },
      { type: "base-text-hdc-acquisition-failed" },
    ],
  );
  assert.deepEqual(hdcFailure.finalBaseTextCache, {
    context: 8,
    text: "cache-me",
  });
});

test("follows dirty and HDC failure reachability without reading inaccessible fields", () => {
  assert.doesNotThrow(() => reproduceRender("dirty-zero-does-not-read-any-downstream-field"));
  const initialHdcFailure = reproduceRender(
    "initial-hdc-failure-does-not-read-content-fields",
  );
  assert.deepEqual(
    initialHdcFailure.operations.map(({ type }) => type),
    [
      "clear-dirty-word",
      "initial-hdc-acquisition-failed",
      "request-transient-surface",
      "position-transient-surface",
      "draw-hdc-acquisition-failed",
      "base-text-same-context-different-cache-no-op",
      "blit-transient-surface",
    ],
  );
  const drawFailure = reproduceRender(
    "draw-hdc-failure-still-invokes-base-helper-and-blits",
  );
  assert.deepEqual(drawFailure.operations.slice(-2), [
    { type: "release-base-text-hdc" },
    {
      type: "blit-transient-surface",
      x: 276,
      y: 352,
      postCallRect: { left: 0, top: 0, right: 89, bottom: 48 },
    },
  ]);
});

test("rejects reached native-width, bounded-buffer, and unresolved failure inputs", () => {
  const producer = fixture.producerVectors[0];
  assert.throws(
    () => reproduceOverlayProduction({
      ...producer.input,
      selectorByte: 128,
      initial: baseState(),
    }),
    /selectorByte must fit a signed byte/u,
  );
  const normal = fixture.renderVectors[0];
  const initial = producedState(normal.producerVectorId);
  assert.throws(
    () => reproduceTransientFormattedOverlay({
      ...normal.input,
      measurements: normal.input.measurements.slice(0, 2),
      initial,
    }),
    /missing supplied GDI measurement/u,
  );
  const reacquireFailure = structuredClone(normal.input);
  reacquireFailure.numericHdcReacquired[0] = false;
  assert.throws(
    () => reproduceTransientFormattedOverlay({
      ...reacquireFailure,
      initial: producedState(normal.producerVectorId),
    }),
    /numeric HDC reacquisition 0 failed/u,
  );
  const activeBadText = producedState(normal.producerVectorId);
  activeBadText.extraLines[0].text = 1;
  assert.throws(
    () => reproduceTransientFormattedOverlay({ ...normal.input, initial: activeBadText }),
    /initial\.extraLines\[0\]\.text must be a NUL-free reproduced byte string/u,
  );
  const excessiveWidth = structuredClone(normal.input);
  excessiveWidth.measurements[0].width = 0x8000;
  assert.throws(
    () => reproduceTransientFormattedOverlay({
      ...excessiveWidth,
      initial: producedState(normal.producerVectorId),
    }),
    /derived maxWidth must fit the scoped nonnegative signed-WORD subset/u,
  );
  const excessiveHeight = structuredClone(normal.input);
  excessiveHeight.measurements[0].height = 0x8000;
  assert.throws(
    () => reproduceTransientFormattedOverlay({
      ...excessiveHeight,
      initial: producedState(normal.producerVectorId),
    }),
    /derived totalHeight must fit the scoped nonnegative signed-WORD subset/u,
  );
  assert.throws(
    () => reproduceOverlayProduction({
      ...producer.input,
      baseText: "x".repeat(128),
      initial: baseState(),
    }),
    /baseText must fit 127 bytes plus NUL/u,
  );
  assert.throws(
    () => reproduceOverlayProduction({
      ...producer.input,
      primaryText: "x".repeat(128),
      initial: baseState(),
    }),
    /primaryText must fit 127 bytes plus NUL/u,
  );
  assert.throws(
    () => reproduceOverlayProduction({
      ...producer.input,
      extraTexts: ["x".repeat(128), null, null],
      initial: baseState(),
    }),
    /extraTexts\[0\] must fit 127 bytes plus NUL/u,
  );
  assert.throws(
    () => reproduceOverlayProduction({
      ...producer.input,
      baseText: "\u0100",
      initial: baseState(),
    }),
    /baseText must use one JavaScript code unit per reproduced source byte/u,
  );
  const suffixOverflow = producedState(normal.producerVectorId);
  suffixOverflow.primaryText = "x".repeat(125);
  suffixOverflow.selectorByte = 1;
  assert.throws(
    () => reproduceTransientFormattedOverlay({ ...normal.input, initial: suffixOverflow }),
    /formatted primary text must fit 127 bytes plus NUL/u,
  );
  const nullBase = producedState(normal.producerVectorId);
  nullBase.baseText = null;
  assert.throws(
    () => reproduceTransientFormattedOverlay({ ...normal.input, initial: nullBase }),
    /would be dereferenced by FUN_00457460 length scan before its null guard/u,
  );
  assert.throws(
    () => reproduceTransientFormattedOverlay({
      ...normal.input,
      postCallRect: { left: 0, top: 0, right: 0x8000, bottom: 48 },
      initial: producedState(normal.producerVectorId),
    }),
    /postCallRect\.right must be in the supported positive signed-WORD layout range/u,
  );
});

test("is deterministic and rejects stale executable, function, and reference inputs", () => {
  assert.deepEqual(
    extractTransientFormattedOverlay({ executablePath, functionsPath, referencesPath }),
    extractTransientFormattedOverlay({ executablePath, functionsPath, referencesPath }),
  );
  const directory = mkdtempSync(join(tmpdir(), "transient-overlay-"));
  const badExecutable = join(directory, "imjinrok2.exe");
  copyFileSync(executablePath, badExecutable);
  const executable = readFileSync(badExecutable);
  executable[0x10] ^= 0xff;
  writeFileSync(badExecutable, executable);
  assert.throws(
    () => extractTransientFormattedOverlay({ executablePath: badExecutable }),
    /SHA-256 mismatch/u,
  );

  const badFunctions = join(directory, "functions.json");
  const functions = JSON.parse(readFileSync(functionsPath, "utf8"));
  functions.functions.find(({ entry }) => entry === "0x004567c0").instructionCount -= 1;
  writeFileSync(badFunctions, JSON.stringify(functions));
  assert.throws(
    () => extractTransientFormattedOverlay({ functionsPath: badFunctions }),
    /0x004567c0 instructionCount mismatch/u,
  );

  const badReferences = join(directory, "references.json");
  const references = JSON.parse(readFileSync(referencesPath, "utf8"));
  references.references = references.references.filter(
    ({ from, to }) => from !== "0x00447b23" || to !== "0x004567c0",
  );
  writeFileSync(badReferences, JSON.stringify(references));
  assert.throws(
    () => extractTransientFormattedOverlay({ referencesPath: badReferences }),
    /FUN_004567c0 callers structured reference count mismatch/u,
  );

  const badHelperReferences = join(directory, "helper-references.json");
  const helperReferences = JSON.parse(readFileSync(referencesPath, "utf8"));
  helperReferences.references = helperReferences.references.filter(
    ({ from, to }) => from !== "0x004574d1" || to !== "0x005e2dc4",
  );
  writeFileSync(badHelperReferences, JSON.stringify(helperReferences));
  assert.throws(
    () => extractTransientFormattedOverlay({ referencesPath: badHelperReferences }),
    /cached context 0x005e2dc4 refs structured reference count mismatch/u,
  );
});

function baseState() {
  return structuredClone(fixture.initialState);
}

function producedState(id) {
  const vector = fixture.producerVectors.find((candidate) => candidate.id === id);
  if (!vector) throw new Error(`unknown producer vector ${id}`);
  return reproduceOverlayProduction({ ...vector.input, initial: baseState() });
}

function reproduceRender(id) {
  const vector = fixture.renderVectors.find((candidate) => candidate.id === id);
  if (!vector) throw new Error(`unknown render vector ${id}`);
  const initial = vector.producerVectorId
    ? producedState(vector.producerVectorId)
    : baseState();
  if (vector.stateOverrides) Object.assign(initial, structuredClone(vector.stateOverrides));
  return reproduceTransientFormattedOverlay({ ...vector.input, initial });
}

function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
