import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { closeSync, copyFileSync, mkdtempSync, openSync, readFileSync, rmSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  EXPECTED_BUTTON_SHA256,
  EXPECTED_EXECUTABLE_SHA256,
  EXPECTED_PANEL_SHA256,
  extractGameplaySelectionCommandPanel,
  reproduceGameplayCommandGrid,
} from "./extract-gameplay-selection-command-panel.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const buttonPath = join(repositoryRoot, "original/imjinrok2/fnt/button.spr");
const panelPath = join(repositoryRoot, "original/imjinrok2/fnt/pannel.spr");
const fixture = JSON.parse(readFileSync(
  join(repositoryRoot, "analysis/fixtures/gameplay-selection-command-panel-vectors.json"),
  "utf8",
));

test("binds the scoped command-grid evidence to the original executable", () => {
  assert.equal(fixture.sourceExecutableSha256, EXPECTED_EXECUTABLE_SHA256);
  assert.equal(fixture.sourceButtonSha256, EXPECTED_BUTTON_SHA256);
  assert.equal(fixture.sourcePanelSha256, EXPECTED_PANEL_SHA256);
  const report = extractGameplaySelectionCommandPanel();

  assert.deepEqual(
    {
      analysisStatus: report.analysisStatus,
      reproductionStatus: report.reproductionStatus,
      implementationStatus: report.implementationStatus,
    },
    fixture.expectedStatus,
  );
  assert.equal(report.owner.address, "0x007c5ed8");
  assert.deepEqual(report.geometry.sharedCanvas, { width: 640, height: 480 });
  assert.deepEqual(report.geometry.panelAsset, { width: 640, height: 163, frameCount: 1 });
  assert.deepEqual(report.geometry.actionGrid, fixture.canonicalGeometry.actionGrid);
  assert.deepEqual(report.geometry.exactRectangles, fixture.canonicalGeometry.exactRectangles);
  assert.deepEqual(report.geometry.panelHudBlit.rectangle, fixture.canonicalGeometry.panelHudBlitRectangle);
  assert.deepEqual(report.geometry.panelHudBlit.ordering.slice(-1), ["later call FUN_0045ad90 renders the common selection-command grid"]);
  assert.equal(report.sourceBindings.commandGridCellSize.analysisStatus, "static-confirmed-for-common-loader-to-command-grid-cell-size");
  assert.equal(report.sourceBindings.commandGridCellSize.loader.buttonRecord, "0x00899828");
  assert.deepEqual(report.sourceBindings.commandGridCellSize.fields.gridInitializer.values.effectiveSignedInt16, { cellWidth: 34, cellHeight: 34 });
  assert.equal(report.sourceBindings.panelHudBlit.analysisStatus, "static-confirmed-for-pannel-loader-to-hud-blit");
  assert.equal(report.sourceBindings.panelHudBlit.finalBlit.consumer.callsite, "0x00447a0f");
  assert.deepEqual(report.slotBoundary, {
    renderer: "FUN_0045ad90 increments slot index from 0 while cursor 0x007c66f0 advances by 2 to exclusive 0x007c6702: exactly 9 iterations",
    getter: "FUN_00461200 returns zero for signed index <0 or >=9 before owner storage read",
    ownerIndexDomain: "0..8",
  });
  assert.match(report.unresolvedBoundary, /record-18 -> fnt\\button\.spr 34×34/u);
  assert.match(report.unresolvedBoundary, /later computed-alias writer/u);
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

test("rejects tampered source resources before accepting the cell-size or panel bindings", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "imjinrok-command-grid-"));
  const tamperedButtonPath = join(directory, "button.spr");
  const tamperedPanelPath = join(directory, "pannel.spr");
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  copyFileSync(buttonPath, tamperedButtonPath);
  copyFileSync(panelPath, tamperedPanelPath);
  const descriptor = openSync(tamperedButtonPath, "r+");
  const panelDescriptor = openSync(tamperedPanelPath, "r+");
  try {
    writeSync(descriptor, Buffer.from([0]), 0, 1, 0);
    writeSync(panelDescriptor, Buffer.from([0]), 0, 1, 0);
  } finally {
    closeSync(descriptor);
    closeSync(panelDescriptor);
  }

  assert.throws(
    () => extractGameplaySelectionCommandPanel({ buttonPath: tamperedButtonPath }),
    /button\.spr SHA-256 mismatch/u,
  );
  assert.throws(
    () => extractGameplaySelectionCommandPanel({ panelPath: tamperedPanelPath }),
    /pannel\.spr SHA-256 mismatch/u,
  );
});

function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
