import assert from "node:assert/strict";
import { closeSync, copyFileSync, mkdtempSync, openSync, readFileSync, rmSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  EXPECTED_BUTTON_SHA256,
  EXPECTED_EXECUTABLE_SHA256,
  extractCommandGridCellSizeBinding,
  reproduceCommandGridCellSizeBinding,
} from "./extract-command-grid-cell-size-binding.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const executablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const buttonPath = join(repositoryRoot, "original/imjinrok2/fnt/button.spr");
const referencesPath = join(repositoryRoot, "analysis/generated/imjinrok2/references.json");
const fixture = JSON.parse(readFileSync(join(repositoryRoot, "analysis/fixtures/command-grid-cell-size-binding-vectors.json"), "utf8"));

test("source-binds common table entry 18, its loader record, and the 34 by 34 grid words", () => {
  assert.equal(fixture.sourceExecutableSha256, EXPECTED_EXECUTABLE_SHA256);
  assert.equal(fixture.sourceButtonSha256, EXPECTED_BUTTON_SHA256);
  const report = extractCommandGridCellSizeBinding({ executablePath, buttonPath, referencesPath });

  assert.equal(report.analysisStatus, "static-confirmed-for-common-loader-to-command-grid-cell-size");
  assert.equal(report.loader.loadedEntryCount, 226);
  assert.deepEqual(report.loader.button, {
    index: 18,
    tableEntry: "0x004bc0dc",
    embeddedPathAddress: "0x004bd830",
    embeddedPath: "fnt\\button.spr",
  });
  assert.equal(report.loader.buttonRecord, "0x00899828");
  assert.deepEqual(report.fields.runtimeRecord.aliasWords, { width: "DAT_0089982c", height: "DAT_00899830" });
  assert.deepEqual(report.fields.gridInitializer.values, {
    rawLowWords: { cellWidth: 34, cellHeight: 34 },
    effectiveSignedInt16: { cellWidth: 34, cellHeight: 34 },
  });
  assert.match(report.writerScope, /nine READ references and no direct WRITE/u);
});

test("reproduces source reachability, failure, canonical transfer, and low-WORD field width", () => {
  for (const vector of fixture.vectors) {
    assert.deepEqual(reproduceCommandGridCellSizeBinding(vector.input), vector.expected, vector.id);
  }
});

test("rejects malformed reachable loader fields rather than fabricating a transfer", () => {
  assert.throws(
    () => reproduceCommandGridCellSizeBinding({ tableEntryCount: 19, buttonLoadSucceeded: true, header: { magic: 8, width: 34, height: 34 }, layoutInitializerReached: true }),
    /header\.magic must be the original sprite DWORD value 9/u,
  );
  assert.throws(
    () => reproduceCommandGridCellSizeBinding({ tableEntryCount: 19, buttonLoadSucceeded: true, header: { magic: 9, width: -1, height: 34 }, layoutInitializerReached: true }),
    /header\.width must be an integer in 0\.\.4294967295/u,
  );
  assert.throws(
    () => reproduceCommandGridCellSizeBinding({ tableEntryCount: 19, buttonLoadSucceeded: "failed", header: { magic: 9, width: 34, height: 34 }, layoutInitializerReached: true }),
    /buttonLoadSucceeded must be a boolean/u,
  );
  assert.throws(
    () => reproduceCommandGridCellSizeBinding({ tableEntryCount: 19, buttonLoadSucceeded: true, header: { magic: 9, width: 34, height: 34 }, layoutInitializerReached: "reached" }),
    /layoutInitializerReached must be a boolean/u,
  );
});

test("does not validate malformed later values when the source table does not reach index 18", () => {
  assert.deepEqual(
    reproduceCommandGridCellSizeBinding({ tableEntryCount: 18, buttonLoadSucceeded: "not-reached", header: null, layoutInitializerReached: "not-reached" }),
    { targetIndex: 18, tableEntryCount: 18, operations: [{ type: "button-record-unreached-before-table-boundary" }] },
  );
  assert.deepEqual(
    reproduceCommandGridCellSizeBinding({ tableEntryCount: 19, buttonLoadSucceeded: false, header: null, layoutInitializerReached: "not-reached" }),
    {
      targetIndex: 18,
      tableEntryCount: 19,
      operations: [
        { type: "reach-button-table-entry", record: "0x00899828" },
        { type: "button-loader-failure-continues-common-table", runtimeCellSize: "indeterminate" },
      ],
    },
  );
});

test("rejects tampered original executable, sprite resource, and generated references", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "imjinrok-command-grid-cell-size-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const alteredExecutablePath = join(directory, "imjinrok2.exe");
  const alteredButtonPath = join(directory, "button.spr");
  const alteredReferencesPath = join(directory, "references.json");
  copyFileSync(executablePath, alteredExecutablePath);
  copyFileSync(buttonPath, alteredButtonPath);
  copyFileSync(referencesPath, alteredReferencesPath);
  flipByte(alteredExecutablePath, 0x4bc0dc - 0x400000);
  flipByte(alteredButtonPath, 4);
  flipByte(alteredReferencesPath, 0);

  assert.throws(() => extractCommandGridCellSizeBinding({ executablePath: alteredExecutablePath, buttonPath, referencesPath }), /imjinrok2\.exe SHA-256 mismatch/u);
  assert.throws(() => extractCommandGridCellSizeBinding({ executablePath, buttonPath: alteredButtonPath, referencesPath }), /button\.spr SHA-256 mismatch/u);
  assert.throws(() => extractCommandGridCellSizeBinding({ executablePath, buttonPath, referencesPath: alteredReferencesPath }), /references\.json SHA-256 mismatch/u);
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
