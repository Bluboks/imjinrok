import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  EXPECTED_EXECUTABLE_SHA256,
  extractGameplaySelectionCommandPanel,
  reproduceGameplayCommandGrid,
} from "./extract-gameplay-selection-command-panel.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const fixture = JSON.parse(readFileSync(
  join(repositoryRoot, "analysis/fixtures/gameplay-selection-command-panel-vectors.json"),
  "utf8",
));

test("binds the scoped command-grid evidence to the original executable", () => {
  assert.equal(fixture.sourceExecutableSha256, EXPECTED_EXECUTABLE_SHA256);
  const report = extractGameplaySelectionCommandPanel();

  assert.equal(report.analysisStatus, "static-confirmed-for-bounded-gameplay-command-grid");
  assert.equal(report.reproductionStatus, "reproduction-complete-for-bounded-command-grid-geometry-and-slot-admission");
  assert.equal(report.implementationStatus, "analysis-only-no-product-change");
  assert.equal(report.owner.address, "0x007c5ed8");
  assert.deepEqual(report.geometry.sharedCanvas, { width: 640, height: 480 });
  assert.deepEqual(report.geometry.panelAsset, { width: 640, height: 163, frameCount: 1 });
  assert.equal(report.geometry.actionSlots.length, 9);
  assert.deepEqual(report.geometry.actionSlots[0], { left: 525, top: 363, right: 559, bottom: 397, width: 34, height: 34 });
  assert.deepEqual(report.geometry.actionSlots[8], { left: 597, top: 435, right: 631, bottom: 469, width: 34, height: 34 });
  assert.match(report.unresolvedBoundary, /does not close a direct pannel\.spr-to-final-blit callsite/u);
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
    () => reproduceGameplayCommandGrid({ selectionCount: 0, surfaceLockSucceeded: true, slots: [] }),
    /exactly nine command-slot records/u,
  );
  assert.throws(
    () => reproduceGameplayCommandGrid({
      selectionCount: 0,
      surfaceLockSucceeded: true,
      slots: Array.from({ length: 9 }, () => ({ rendererEnabled: 0, frameOrResourceIndex: 0, inputControlId: 0 })),
      hitTest: { disabled: false, slot: 0, pointerX: 1.5, pointerY: 1 },
    }),
    /pointerX must be an integer/u,
  );
});

function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
