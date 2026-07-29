import assert from "node:assert/strict";
import { closeSync, copyFileSync, mkdtempSync, openSync, readFileSync, rmSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  EXPECTED_BUTTON_SHA256,
  EXPECTED_EXECUTABLE_SHA256,
  EXPECTED_REFERENCES_SHA256,
  createCommandIconFrameBindingFixture,
  extractCommandIconFrameBinding,
  reproduceCommandIconFrameBinding,
} from "./extract-command-icon-frame-binding.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const executablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const buttonPath = join(repositoryRoot, "original/imjinrok2/fnt/button.spr");
const referencesPath = join(repositoryRoot, "analysis/generated/imjinrok2/references.json");
const fixturePath = join(repositoryRoot, "analysis/fixtures/command-icon-frame-binding-vectors.json");
const fixtureBytes = readFileSync(fixturePath, "utf8");
const fixture = JSON.parse(fixtureBytes);

test("source-binds labelled and unlabelled original command records to exact button.spr pixel frames", () => {
  assert.deepEqual(fixture, createCommandIconFrameBindingFixture());
  assert.equal(fixtureBytes, `${JSON.stringify(createCommandIconFrameBindingFixture())}\n`);
  assert.equal(fixture.sourceExecutableSha256, EXPECTED_EXECUTABLE_SHA256);
  assert.equal(fixture.sourceButtonSha256, EXPECTED_BUTTON_SHA256);
  assert.equal(fixture.sourceReferencesSha256, EXPECTED_REFERENCES_SHA256);
  const report = extractCommandIconFrameBinding({ executablePath, buttonPath, referencesPath });

  assert.equal(report.analysisStatus, "static-confirmed-for-bounded-command-action-label-and-button-frame-bindings");
  assert.equal(report.loaderContract.runtimeRecord, "0x00899828");
  assert.equal(report.loaderContract.runtimePayloadPointerField, "0x0089a41c");
  assert.equal(report.loaderContract.runtimeFrameOffsetTable, "0x00899ce8");
  assert.ok(report.rawCodeRanges.some(({ id }) => id === "common-spr-loader"));
  assert.deepEqual(
    report.controlRecord.bindings.map(({ actionId, frameIndex, frame, sourceLabel }) => ({ actionId, frameIndex, relativeOffset: frame.relativeOffset, label: sourceLabel?.value })),
    [
      { actionId: 2, frameIndex: 43, relativeOffset: 29161, label: "정지" },
      { actionId: 3, frameIndex: 6, relativeOffset: 3176, label: "이동" },
      { actionId: 5, frameIndex: 4, relativeOffset: 2200, label: "공격" },
      { actionId: 11, frameIndex: 16, relativeOffset: 8056, label: "건설" },
      { actionId: 16, frameIndex: 12, relativeOffset: 6104, label: "수리" },
      { actionId: 19, frameIndex: 45, relativeOffset: 30977, label: "취소" },
      { actionId: 21, frameIndex: 11, relativeOffset: 5196, label: "집결지설정" },
      { actionId: 35, frameIndex: 10, relativeOffset: 4288, label: "순찰" },
      { actionId: 39, frameIndex: 39, relativeOffset: 25529, label: "사수" },
      { actionId: 61, frameIndex: 27, relativeOffset: 14656, label: undefined },
      { actionId: 62, frameIndex: 26, relativeOffset: 13748, label: undefined },
      { actionId: 63, frameIndex: 28, relativeOffset: 15564, label: undefined },
      { actionId: 64, frameIndex: 29, relativeOffset: 16472, label: undefined },
    ],
  );
  assert.equal(report.controlRecord.commandLabelCopy.runtimeBase, "0x00aa4018");
  assert.deepEqual(report.renderer.submittedDimensions, { width: 34, height: 34 });
});

test("reproduces labelled and unlabelled control frames plus bounded no-draw failure vectors", () => {
  for (const vector of fixture.vectors) {
    assert.deepEqual(reproduceCommandIconFrameBinding(vector.input), vector.expected, vector.id);
  }
});

test("rejects malformed reached inputs instead of manufacturing a frame binding", () => {
  assert.throws(
    () => reproduceCommandIconFrameBinding({ slotPresent: true, buttonLoadSucceeded: true, actionId: 61.5, frameCount: 289 }),
    /actionId must be an integer in 0\.\.65535/u,
  );
  assert.throws(
    () => reproduceCommandIconFrameBinding({ slotPresent: true, buttonLoadSucceeded: true, actionId: 61, frameCount: -1 }),
    /frameCount must be an integer in 0\.\.10000/u,
  );
  assert.throws(
    () => reproduceCommandIconFrameBinding({ slotPresent: "present" }),
    /slotPresent must be a boolean/u,
  );
});

test("does not validate unreachable values after disabled slots or loader failure", () => {
  assert.deepEqual(
    reproduceCommandIconFrameBinding({ slotPresent: false, buttonLoadSucceeded: "unreached", actionId: "unreached", frameCount: "unreached" }),
    { slotPresent: false, operations: [{ type: "selected-slot-absent-no-frame-lookup-or-draw" }] },
  );
  assert.deepEqual(
    reproduceCommandIconFrameBinding({ slotPresent: true, buttonLoadSucceeded: false, actionId: "unreached", frameCount: "unreached" }),
    { slotPresent: true, operations: [{ type: "button-loader-failure-no-frame-resolution-or-draw" }] },
  );
});

test("rejects tampered executable, button sprite, and references inputs", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "imjinrok-command-icon-frame-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const alteredExecutablePath = join(directory, "imjinrok2.exe");
  const alteredButtonPath = join(directory, "button.spr");
  const alteredReferencesPath = join(directory, "references.json");
  copyFileSync(executablePath, alteredExecutablePath);
  copyFileSync(buttonPath, alteredButtonPath);
  copyFileSync(referencesPath, alteredReferencesPath);
  flipByte(alteredExecutablePath, 0x4c8524 - 0x400000);
  flipByte(alteredButtonPath, 4);
  flipByte(alteredReferencesPath, 0);

  assert.throws(() => extractCommandIconFrameBinding({ executablePath: alteredExecutablePath, buttonPath, referencesPath }), /imjinrok2\.exe SHA-256 mismatch/u);
  assert.throws(() => extractCommandIconFrameBinding({ executablePath, buttonPath: alteredButtonPath, referencesPath }), /button\.spr SHA-256 mismatch/u);
  assert.throws(() => extractCommandIconFrameBinding({ executablePath, buttonPath, referencesPath: alteredReferencesPath }), /references\.json SHA-256 mismatch/u);
});

function flipByte(path, offset) {
  const descriptor = openSync(path, "r+");
  try {
    const current = Buffer.alloc(1);
    readFileSync(path).copy(current, 0, offset, offset + 1);
    current[0] ^= 0xff;
    writeSync(descriptor, current, 0, 1, offset);
  } finally {
    closeSync(descriptor);
  }
}
