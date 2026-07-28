import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { closeSync, copyFileSync, mkdtempSync, openSync, readFileSync, rmSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  EXPECTED_EXECUTABLE_SHA256,
  extractGameplaySelectionCommandPanel,
  reproduceGameplayCommandGrid,
} from "./extract-gameplay-selection-command-panel.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const buttonPath = join(repositoryRoot, "original/imjinrok2/fnt/button.spr");
const fixture = JSON.parse(readFileSync(
  join(repositoryRoot, "analysis/fixtures/gameplay-selection-command-panel-vectors.json"),
  "utf8",
));

test("binds the scoped command-grid evidence to the original executable", () => {
  assert.equal(fixture.sourceExecutableSha256, EXPECTED_EXECUTABLE_SHA256);
  const report = extractGameplaySelectionCommandPanel();

  assert.equal(report.analysisStatus, "static-confirmed-for-owner-and-parametric-command-grid");
  assert.equal(report.reproductionStatus, "reproduction-complete-for-parametric-grid-formula-and-slot-admission");
  assert.equal(report.implementationStatus, "analysis-only-no-product-change");
  assert.equal(report.owner.address, "0x007c5ed8");
  assert.deepEqual(report.geometry.sharedCanvas, { width: 640, height: 480 });
  assert.deepEqual(report.geometry.panelAsset, { width: 640, height: 163, frameCount: 1 });
  assert.deepEqual(report.geometry.actionGrid, {
    columns: 3,
    rows: 3,
    left: 525,
    top: 363,
    horizontalGap: 2,
    verticalGap: 2,
    cellWidthSource: "signed WORD[0x0089982c]",
    cellHeightSource: "signed WORD[0x00899830]",
    cellSizeStatus: "unresolved-runtime-source-binding",
  });
  assert.equal(report.geometry.exactRectangles, "unresolved because the producer binding of DAT_0089982c/0x00899830 is not closed to fnt\\button.spr");
  assert.deepEqual(report.slotBoundary, {
    renderer: "FUN_0045ad90 increments slot index from 0 while cursor 0x007c66f0 advances by 2 to exclusive 0x007c6702: exactly 9 iterations",
    getter: "FUN_00461200 returns zero for signed index <0 or >=9 before owner storage read",
    ownerIndexDomain: "0..8",
  });
  assert.match(report.unresolvedBoundary, /34×34 cells and exact slot rectangles are not static-confirmed/u);
});

test("reproduces every bounded branch, strict edge, disable, and owner-index vector", () => {
  for (const vector of fixture.vectors) {
    const output = reproduceGameplayCommandGrid(vector.input);
    assert.equal(sha256Json(output), vector.expectedOutputSha256, vector.id);
  }
});

test("refuses malformed source-domain values instead of inventing a command-grid result", () => {
  assert.throws(
    () => reproduceGameplayCommandGrid({ selectionCount: 21, surfaceLockSucceeded: false }),
    /selectionCount must be an integer in 0\.\.20/u,
  );
  assert.throws(
    () => reproduceGameplayCommandGrid({ selectionCount: 0, surfaceLockSucceeded: true, runtimeCellWidth: 34, runtimeCellHeight: 34, slots: [] }),
    /exactly nine command-slot records/u,
  );
  assert.throws(
    () => reproduceGameplayCommandGrid({
      selectionCount: 0,
      surfaceLockSucceeded: true,
      runtimeCellWidth: 34,
      runtimeCellHeight: 34,
      slots: Array.from({ length: 9 }, () => ({ rendererEnabled: 0, frameOrResourceIndex: 0, inputControlId: 0 })),
      hitTest: { disabled: false, slot: 0, pointerX: 1.5, pointerY: 1 },
    }),
    /pointerX must be an integer/u,
  );
});

test("rejects a tampered button resource before accepting its header", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "imjinrok-command-grid-"));
  const tamperedButtonPath = join(directory, "button.spr");
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  copyFileSync(buttonPath, tamperedButtonPath);
  const descriptor = openSync(tamperedButtonPath, "r+");
  writeSync(descriptor, Buffer.from([0]), 0, 1, 0);
  closeSync(descriptor);

  assert.throws(
    () => extractGameplaySelectionCommandPanel({ buttonPath: tamperedButtonPath }),
    /button\.spr SHA-256 mismatch/u,
  );
});

function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
