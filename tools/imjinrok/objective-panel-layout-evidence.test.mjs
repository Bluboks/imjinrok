import test from "node:test";
import assert from "node:assert/strict";
import {
  copyFileSync,
  mkdtempSync,
  openSync,
  closeSync,
  readFileSync,
  readSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_EXECUTABLE_SHA256,
  EXPECTED_OBJECTIVE_BORDER_SHA256,
  ORIGINAL_OBJECTIVE_PANEL_LAYOUT,
  extractObjectivePanelLayoutEvidence,
  reproduceObjectivePanelOwnerFrame,
  reproduceObjectivePanelUpdate,
} from "./extract-objective-panel-layout-evidence.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const executablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const spritePath = join(repositoryRoot, "original/imjinrok2/yfnt/objectiveborder.spr");
const seedsPath = join(repositoryRoot, "analysis/generated/imjinrok2/seeds.json");
const referencesPath = join(repositoryRoot, "analysis/generated/imjinrok2/references.json");
const vectors = JSON.parse(
  readFileSync(join(repositoryRoot, "analysis/fixtures/objective-panel-layout-vectors.json"), "utf8"),
);

test("binds reproduction vectors to the exact original executable and sprite", () => {
  assert.equal(vectors.sourceExecutableSha256, EXPECTED_EXECUTABLE_SHA256);
  assert.equal(vectors.sourceSpriteSha256, EXPECTED_OBJECTIVE_BORDER_SHA256);
});

test("extracts the objective modal's distinct frame, content, and dismiss-control rectangles", () => {
  const report = extractObjectivePanelLayoutEvidence({
    executablePath,
    spritePath,
    seedsPath,
    referencesPath,
  });

  assert.equal(report.analysisStatus, "static-confirmed");
  assert.equal(report.reproductionStatus, "reproduction-complete");
  assert.deepEqual(report.coordinateSystem, { width: 640, height: 480, origin: "top-left" });
  assert.deepEqual(report.layout, {
    baseWidth: 640,
    baseHeight: 480,
    resourcePath: "yfnt\\objectiveborder.spr",
    frame: { x: 112, y: 81, right: 528, bottom: 317, width: 416, height: 236 },
    content: { x: 158, y: 135, right: 478, bottom: 259, width: 320, height: 124 },
    dismissButton: { x: 415, y: 267, right: 495, bottom: 291, width: 80, height: 24 },
    text: { maxWidth: 320, firstCenterY: 166, secondCenterY: 228 },
  });
  assert.deepEqual(report.layout, ORIGINAL_OBJECTIVE_PANEL_LAYOUT);
});

test("binds the frame geometry to the exact one-frame original sprite", () => {
  const report = extractObjectivePanelLayoutEvidence({
    executablePath,
    spritePath,
    seedsPath,
    referencesPath,
  });

  assert.deepEqual(report.sources.sprite, {
    path: spritePath,
    embeddedPath: "yfnt\\objectiveborder.spr",
    sha256: EXPECTED_OBJECTIVE_BORDER_SHA256,
    width: 416,
    height: 236,
    frameCount: 1,
  });
  assert.equal(report.sources.executable.sha256, EXPECTED_EXECUTABLE_SHA256);
});

test("verifies complete seeded function bodies, CFGs, and manually recovered vtable targets", () => {
  const report = extractObjectivePanelLayoutEvidence({
    executablePath,
    spritePath,
    seedsPath,
    referencesPath,
  });

  assert.equal(report.functions.length, 20);
  assert.equal(report.functions.every((fn) => fn.blockCount > 0 && fn.instructionCount > 0), true);
  assert.equal(report.rawCodeRanges.length, 5);
  assert.equal(report.evidencePoints.length, 24);
});

test("preserves the direct-reference audit while pointing to the resolved K01 binding", () => {
  const report = extractObjectivePanelLayoutEvidence({
    executablePath,
    spritePath,
    seedsPath,
    referencesPath,
  });

  assert.deepEqual(report.pilotBinding, {
    status: "static-confirmed-by-dedicated-binding-extractor",
    conclusion:
      "the direct-reference set alone has no literal 0x3f0 write, but the complete upstream return path is now recovered: a return of 1 from control 0x005527b0 sets FUN_004495e0's pending return to 0x3f0; independent later controls 0x005528f8, 0x00552ae0, and 0x00552850 then run in that order and can replace it with 0x3ee, 0x3ec, and 0x3ea; when none matches, FUN_00449090 writes 0x3f0 to DAT_00552998, and the dedicated binding extractor proves DAT_0088afcc=1 selects K0110 for K01",
    stateStorage: {
      address: "0x00552998",
      width: "signed WORD",
      directReferences: [
        { from: "0x0044900e", type: "WRITE", fromFunctionEntry: "0x00448ff0" },
        { from: "0x00449044", type: "WRITE", fromFunctionEntry: "0x00449030" },
        { from: "0x004490b8", type: "READ", fromFunctionEntry: "0x00449090" },
        { from: "0x004490d9", type: "WRITE", fromFunctionEntry: "0x00449090" },
        { from: "0x00449105", type: "WRITE", fromFunctionEntry: "0x00449090" },
        { from: "0x00449116", type: "WRITE", fromFunctionEntry: "0x00449090" },
        { from: "0x00449143", type: "WRITE", fromFunctionEntry: "0x00449090" },
        { from: "0x00449160", type: "WRITE", fromFunctionEntry: "0x00449090" },
        { from: "0x00449188", type: "WRITE", fromFunctionEntry: "0x00449090" },
        { from: "0x0044919a", type: "WRITE", fromFunctionEntry: "0x00449090" },
        { from: "0x004491af", type: "WRITE", fromFunctionEntry: "0x00449090" },
        { from: "0x004491c1", type: "WRITE", fromFunctionEntry: "0x00449090" },
        { from: "0x004491e0", type: "WRITE", fromFunctionEntry: "0x00449090" },
        { from: "0x0044921f", type: "READ", fromFunctionEntry: "0x00449090" },
      ],
      knownExternalInitializers: [
        { address: "0x0044900e", value: "0x3e8", function: "0x00448ff0" },
        { address: "0x00449044", value: "0x3ed", function: "0x00449030" },
      ],
      handlerReturnValueWrites: [
        { address: "0x00449105", call: "0x004490ed to FUN_004495e0" },
        { address: "0x00449143", call: "0x00449132 to FUN_004aa810" },
        { address: "0x00449188", call: "0x0044917b to FUN_004aa810" },
        { address: "0x004491af", call: "0x004491a5 to FUN_004a6c80" },
      ],
      directReferenceScope:
        "the complete structured direct-reference set has no direct literal write of 0x3f0; this does not exclude indirect memory writes",
      resolvedProducer:
        "0x004496b5 sets EDI=0x3f0 after control 0x005527b0 matches; independent controls 0x005528f8, 0x00552ae0, and 0x00552850 then run in order and can overwrite it with 0x3ee, 0x3ec, and 0x3ea; 0x004498ec returns the final DI in AX and 0x00449105 stores SI to DAT_00552998",
      consumer: "0x004491bc in FUN_00449090",
    },
    textRecordSelection: {
      stageIndex: "signed WORD DAT_0088afcc",
      tableBase: "0x00abf0e8",
      recordStride: 128,
      pathSelectionRange: "0x004a57fa-0x004a581a",
      extractorCall: "0x004a5839 to FUN_004838f0",
      outputs:
        "two local buffers copied from the first type-7 record payload at offsets 0x000 and 0x100",
      resolved:
        "FUN_0048d690 stores Korean campaign stage 1 as DAT_0088afcc=1; record 1 is script\\k0110 and its OBJECTIVE arguments are the K01 modal text inputs",
      dedicatedExtractor: "tools/imjinrok/extract-objective-modal-k01-binding.mjs",
    },
  });
});

test("reproduces every original objective-panel update vector", () => {
  for (const vector of vectors.updateVectors) {
    assert.deepEqual(reproduceObjectivePanelUpdate(vector.input), vector.expected, vector.id);
  }
});

test("reproduces every scoped owner lifecycle and cleanup vector", () => {
  for (const vector of vectors.ownerVectors) {
    assert.deepEqual(reproduceObjectivePanelOwnerFrame(vector.input), vector.expected, vector.id);
  }
});

test("reports the exact split between static analysis and reproduction scope", () => {
  const report = extractObjectivePanelLayoutEvidence({
    executablePath,
    spritePath,
    seedsPath,
    referencesPath,
  });

  assert.match(report.analysisScope, /resource-loader failures/);
  assert.match(report.reproductionScope, /clear-lock success and failure/);
  assert.deepEqual(report.staticOnlyScope, [
    "runtime objective SPR loader failures and the caller's continue-after-error behavior",
    "control press-sound and internal latch mutations, which do not change this question's dismiss return value",
  ]);
});

test("rejects values that cannot be represented by the original fields", () => {
  const base = vectors.updateVectors[0].input;
  assert.throws(
    () => reproduceObjectivePanelUpdate({ ...base, pointerX: 32768 }),
    /pointerX must be a signed WORD/,
  );
  assert.throws(
    () => reproduceObjectivePanelUpdate({ ...base, pointerY: -32769 }),
    /pointerY must be a signed WORD/,
  );
  assert.throws(
    () => reproduceObjectivePanelUpdate({ ...base, currentButtonDown: 0x1_0000_0000 }),
    /currentButtonDown must fit the original 32-bit field/,
  );
  assert.throws(
    () => reproduceObjectivePanelUpdate({ ...base, surfaceLockSucceeded: 1 }),
    /surfaceLockSucceeded must be boolean/,
  );
  assert.throws(
    () =>
      reproduceObjectivePanelOwnerFrame({
        ownerEnabled: 1,
        state: 0x3f1,
        update: vectors.updateVectors[2].input,
      }),
    /cleanupSurfaceLockSucceeded is required for dismissal cleanup/,
  );
  assert.throws(
    () => reproduceObjectivePanelOwnerFrame({ ownerEnabled: 1, state: 32768 }),
    /state must be a signed WORD/,
  );
});

test("refuses altered executable and sprite inputs", () => {
  const directory = mkdtempSync(join(tmpdir(), "imjinrok-objective-panel-inputs-"));
  const alteredExecutablePath = join(directory, "imjinrok2.exe");
  const alteredSpritePath = join(directory, "objectiveborder.spr");
  copyFileSync(executablePath, alteredExecutablePath);
  copyFileSync(spritePath, alteredSpritePath);
  flipByte(alteredExecutablePath, 0xa5a69);
  flipByte(alteredSpritePath, 0x0bf4);

  assert.throws(
    () => extractObjectivePanelLayoutEvidence({ executablePath: alteredExecutablePath, spritePath, seedsPath }),
    /imjinrok2\.exe SHA-256 mismatch/,
  );
  assert.throws(
    () => extractObjectivePanelLayoutEvidence({ executablePath, spritePath: alteredSpritePath, seedsPath }),
    /objectiveborder\.spr SHA-256 mismatch/,
  );
});

test("rejects stale or incomplete static-analysis input", () => {
  const directory = mkdtempSync(join(tmpdir(), "imjinrok-objective-panel-seeds-"));
  const staleSeedsPath = join(directory, "stale.json");
  const incompleteSeedsPath = join(directory, "incomplete.json");
  const incompleteReferencesPath = join(directory, "incomplete-references.json");
  writeFileSync(staleSeedsPath, JSON.stringify({ sourceSha256: "0".repeat(64), functions: [] }));
  writeFileSync(
    incompleteSeedsPath,
    JSON.stringify({ sourceSha256: EXPECTED_EXECUTABLE_SHA256, functions: [] }),
  );
  writeFileSync(
    incompleteReferencesPath,
    JSON.stringify({ sourceSha256: EXPECTED_EXECUTABLE_SHA256, references: [] }),
  );

  assert.throws(
    () => extractObjectivePanelLayoutEvidence({ executablePath, spritePath, seedsPath: staleSeedsPath }),
    /source SHA-256 mismatch/,
  );
  assert.throws(
    () => extractObjectivePanelLayoutEvidence({ executablePath, spritePath, seedsPath: incompleteSeedsPath }),
    /missing seeded function 0x00449090/,
  );
  assert.throws(
    () =>
      extractObjectivePanelLayoutEvidence({
        executablePath,
        spritePath,
        seedsPath,
        referencesPath: incompleteReferencesPath,
      }),
    /DAT_00552998 complete direct-reference set mismatch/,
  );
});

function flipByte(path, offset) {
  const handle = openSync(path, "r+");
  try {
    const byte = Buffer.alloc(1);
    readSync(handle, byte, 0, 1, offset);
    byte[0] ^= 0xff;
    writeSync(handle, byte, 0, 1, offset);
  } finally {
    closeSync(handle);
  }
}
