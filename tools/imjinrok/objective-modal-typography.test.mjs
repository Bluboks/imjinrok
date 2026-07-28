import test from "node:test";
import assert from "node:assert/strict";
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
  EXPECTED_K01_SCRIPT_SHA256,
  extractObjectiveModalTypography,
  reproduceObjectiveFontInitialization,
  reproduceObjectiveTextLayout,
} from "./extract-objective-modal-typography.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const executablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const k01ScriptPath = join(repositoryRoot, "original/imjinrok2/script/K0110");
const seedsPath = join(repositoryRoot, "analysis/generated/imjinrok2/seeds.json");
const functionsPath = join(
  repositoryRoot,
  "analysis/generated/imjinrok2/functions.json",
);
const referencesPath = join(
  repositoryRoot,
  "analysis/generated/imjinrok2/references.json",
);
const fixturePath = join(
  repositoryRoot,
  "analysis/fixtures/objective-modal-typography-vectors.json",
);
const vectors = JSON.parse(readFileSync(fixturePath, "utf8"));

test("binds typography vectors to the exact executable and K0110 script", () => {
  assert.equal(vectors.sourceExecutableSha256, EXPECTED_EXECUTABLE_SHA256);
  assert.equal(vectors.sourceK01ScriptSha256, EXPECTED_K01_SCRIPT_SHA256);
  assert.equal(
    vectors.syntheticMeasurementNotice,
    "fullStringMeasuredHeight and chunkWidths are supplied synthetic GDI SIZE values for deterministic control-flow reproduction; they do not establish actual K0110 line breaks, actual K0110 glyph widths, or the original empty string SIZE.cy.",
  );
});

test("recovers the five-argument objective renderer and exact GDI font lifecycle", () => {
  const report = extract();

  assert.equal(report.analysisStatus, "static-confirmed");
  assert.equal(report.reproductionStatus, "partial-reproduction");
  assert.deepEqual(report.recoveredCallingConvention.arguments, [
    "signed WORD requestedMaxWidth",
    "NUL-terminated Windows-949 byte string pointer",
    "signed WORD* widthOut",
    "signed WORD* heightOut",
    "COLORREF textColor",
  ]);
  assert.deepEqual(report.font.request, {
    face: "Arial",
    logicalHeight: 12,
    logicalWidth: 0,
    escapement: 0,
    orientation: 0,
    weight: 0,
    italic: false,
    underline: false,
    strikeOut: false,
    charSet: "0x81 HANGEUL_CHARSET",
    outputPrecision: 0,
    clipPrecision: 0,
    quality: 0,
    pitchAndFamily: 0,
  });
  assert.equal(report.renderer.requestedMaxWidth, 320);
  assert.equal(report.renderer.effectiveMaxWidth, 300);
});

test("extracts the two exact K0110 OBJECTIVE byte strings", () => {
  const report = extract();

  assert.deepEqual(report.k01Objective, {
    primaryText:
      "1. 봉화대를 짓고 적군 섬멸 (유성룡, 권율은 살아 남아야 한다.)",
    primaryCp949Hex: vectors.k01Objective.primaryCp949Hex,
    secondaryText: "",
    secondaryCp949Hex: vectors.k01Objective.secondaryCp949Hex,
  });
});

test("verifies full function boundaries, evidence anchors, imports, and complete reference sets", () => {
  const report = extract();

  assert.equal(report.seededFunctions.length, 2);
  assert.equal(report.rawCodeRanges.length, 6);
  assert.equal(report.functionCatalog.length, 8);
  assert.equal(report.evidencePoints.length, 24);
  assert.equal(report.imports.dll, "GDI32.dll");
  assert.deepEqual(
    report.imports.functions.map(({ name }) => name),
    [
      "CreateFontA",
      "SetTextColor",
      "SetBkMode",
      "TextOutA",
      "SelectObject",
      "GetTextExtentPoint32A",
      "DeleteObject",
    ],
  );
  assert.deepEqual(
    report.referenceSets.map(({ label, count }) => ({ label, count })),
    [
      { label: "FUN_004a9010 callers", count: 8 },
      { label: "DAT_00634e38 references", count: 11 },
      { label: "FUN_004a92f0 callers", count: 2 },
      { label: "FUN_004a9310 callers", count: 2 },
      { label: "FUN_004a9370 callers", count: 2 },
      { label: "FUN_004402b0 callers", count: 1 },
      { label: "FUN_0045f190 callers", count: 1 },
      { label: "FUN_0045f250 callers", count: 2 },
    ],
  );
});

test("reproduces every font lifecycle and deterministic layout vector", () => {
  for (const vector of vectors.fontLifecycleVectors) {
    assert.deepEqual(
      reproduceObjectiveFontInitialization(vector.input),
      vector.expected,
      vector.id,
    );
  }
  for (const vector of vectors.layoutVectors) {
    assert.deepEqual(
      reproduceObjectiveTextLayout(vector.input),
      vector.expected,
      vector.id,
    );
  }
});

test("the K01 vector exercises CP949 byte tokenization and wrapping under supplied synthetic GDI measurements", () => {
  const vector = vectors.layoutVectors.find(
    ({ id }) =>
      id === "k01-primary-supplied-synthetic-gdi-metrics-wrap",
  );
  const result = reproduceObjectiveTextLayout(vector.input);

  assert.equal(result.lineCount, 2);
  assert.deepEqual(
    result.lines.flatMap(({ chunkCp949Hex }) => chunkCp949Hex),
    [
      "312e20",
      "bac0c8adb4ebb8a620",
      "c1feb0ed20",
      "c0fbb1ba20",
      "bcb6b8ea20",
      "28c0afbcbab7e62c20",
      "b1c7c0b2c0ba20",
      "bbecbec620",
      "b3b2bec6bedf20",
      "c7d1b4d92e29",
    ],
  );
  assert.equal(result.events.includes("wrap-before-chunk-5"), true);
});

test("HDC acquisition failure does not require or inspect unreachable GDI inputs", () => {
  const vector = vectors.layoutVectors.find(
    ({ id }) => id === "hdc-acquisition-failure-returns-one-by-one",
  );

  assert.deepEqual(
    reproduceObjectiveTextLayout(vector.input),
    vector.expected,
  );
  assert.deepEqual(
    reproduceObjectiveTextLayout({
      ...vector.input,
      fontSelectionSucceeded: "not-reached",
      gdiMeasurementsSucceeded: false,
      fullStringMeasuredHeight: 0,
      chunkWidths: "not-reached",
    }),
    vector.expected,
  );
});

test("the empty secondary vector follows the acquired-HDC path with a supplied synthetic zero SIZE.cy", () => {
  const vector = vectors.layoutVectors.find(
    ({ id }) =>
      id === "empty-secondary-supplied-synthetic-zero-height",
  );

  assert.deepEqual(reproduceObjectiveTextLayout(vector.input), {
    status: "rendered",
    effectiveMaxWidth: 300,
    lineHeight: 0,
    measuredWidth: 1,
    measuredHeight: 1,
    lineCount: 1,
    errorReported: false,
    hdcReleased: true,
    events: [
      "clear-scratch-rect-0-0-299-249-index-254",
      "acquire-scratch-hdc",
      "set-transparent-background-mode",
      "select-DAT_00634e38",
      "measure-font-height-with-full-input",
      "release-scratch-hdc",
    ],
    lines: [{ y: 0, width: 0, chunkCp949Hex: [] }],
    drawCalls: [],
  });
  assert.deepEqual(
    reproduceObjectiveTextLayout(vector.input),
    vector.expected,
  );
});

test("rejects invalid field values instead of inventing native GDI results", () => {
  const base = vectors.layoutVectors[0].input;
  assert.throws(
    () => reproduceObjectiveTextLayout({ ...base, requestedMaxWidth: 32768 }),
    /requestedMaxWidth must be a signed WORD/,
  );
  assert.throws(
    () => reproduceObjectiveTextLayout({ ...base, textCp949Hex: "abc" }),
    /even-length lowercase hexadecimal/,
  );
  assert.throws(
    () =>
      reproduceObjectiveTextLayout({
        ...base,
        fullStringMeasuredHeight: -1,
      }),
    /fullStringMeasuredHeight must be the nonnegative GDI LONG SIZE\.cy/,
  );
  assert.throws(
    () => reproduceObjectiveTextLayout({ ...base, chunkWidths: [1] }),
    /exactly 10 measurements/,
  );
  assert.throws(
    () =>
      reproduceObjectiveTextLayout({
        ...base,
        gdiMeasurementsSucceeded: false,
      }),
    /failed measurements have no deterministic reproduction/,
  );
  assert.throws(
    () => reproduceObjectiveFontInitialization({ createFontSucceeded: 1 }),
    /createFontSucceeded must be boolean/,
  );
});

test("rejects altered executable, K0110, and stale generated inputs", () => {
  const directory = mkdtempSync(join(tmpdir(), "imjinrok-objective-typography-"));
  const alteredExecutablePath = join(directory, "imjinrok2.exe");
  const alteredScriptPath = join(directory, "K0110");
  copyFileSync(executablePath, alteredExecutablePath);
  copyFileSync(k01ScriptPath, alteredScriptPath);
  flipByte(alteredExecutablePath, 0xa9010);
  flipByte(alteredScriptPath, 0x0450);

  assert.throws(
    () => extractObjectiveModalTypography({ executablePath: alteredExecutablePath }),
    /imjinrok2\.exe SHA-256 mismatch/,
  );
  assert.throws(
    () => extractObjectiveModalTypography({ k01ScriptPath: alteredScriptPath }),
    /K0110 SHA-256 mismatch/,
  );

  for (const [name, property] of [
    ["seeds.json", "seedsPath"],
    ["functions.json", "functionsPath"],
    ["references.json", "referencesPath"],
  ]) {
    const path = join(directory, name);
    writeFileSync(
      path,
      JSON.stringify({ sourceSha256: "0".repeat(64), functions: [], references: [] }),
    );
    assert.throws(
      () => extractObjectiveModalTypography({ [property]: path }),
      /source SHA-256 mismatch/,
      property,
    );
  }
});

test("rejects tampered function and reference provenance independently", () => {
  const directory = mkdtempSync(join(tmpdir(), "imjinrok-objective-provenance-"));
  const alteredFunctionsPath = join(directory, "functions.json");
  const alteredReferencesPath = join(directory, "references.json");
  const functions = JSON.parse(readFileSync(functionsPath, "utf8"));
  const references = JSON.parse(readFileSync(referencesPath, "utf8"));
  functions.functions = functions.functions.filter(
    ({ entry }) => entry !== "0x004a9370",
  );
  references.references = references.references.filter(
    ({ from }) => from !== "0x004a58e4",
  );
  writeFileSync(alteredFunctionsPath, JSON.stringify(functions));
  writeFileSync(alteredReferencesPath, JSON.stringify(references));

  assert.throws(
    () => extractObjectiveModalTypography({ functionsPath: alteredFunctionsPath }),
    /functions\.json is missing 0x004a9370/,
  );
  assert.throws(
    () =>
      extractObjectiveModalTypography({
        referencesPath: alteredReferencesPath,
      }),
    /FUN_004a9010 callers structured reference count mismatch/,
  );
});

test("rejects a mutated objective-font reference while preserving renderer callers", () => {
  const directory = mkdtempSync(join(tmpdir(), "imjinrok-objective-font-refs-"));
  const alteredReferencesPath = join(directory, "references.json");
  const references = JSON.parse(readFileSync(referencesPath, "utf8"));
  const fontWrite = references.references.find(
    ({ from, to }) => from === "0x004403af" && to === "0x00634e38",
  );
  fontWrite.type = "READ";
  writeFileSync(alteredReferencesPath, JSON.stringify(references));

  assert.throws(
    () =>
      extractObjectiveModalTypography({
        referencesPath: alteredReferencesPath,
      }),
    /DAT_00634e38 references structured reference digest mismatch/,
  );
});

function extract() {
  return extractObjectiveModalTypography({
    executablePath,
    k01ScriptPath,
    seedsPath,
    functionsPath,
    referencesPath,
  });
}

function flipByte(path, offset) {
  const buffer = readFileSync(path);
  buffer[offset] ^= 0xff;
  writeFileSync(path, buffer);
}
