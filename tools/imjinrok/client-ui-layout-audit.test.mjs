import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractClientUiLayoutAudit } from "./extract-client-ui-layout-audit.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("client UI layout audit separates provisional surfaces from the proven SPEECH layout", () => {
  const report = extractClientUiLayoutAudit(repositoryRoot);

  assert.equal(report.summary.probeCount, 6);
  assert.equal(report.summary.allPatternsPresent, true);
  assert.equal(report.summary.unprovenOriginalParityCount, 5);
  assert.deepEqual(
    report.probes.map((probe) => probe.id),
    [
      "hud-shell-responsive-layout",
      "minimap-diamond-layout",
      "action-grid-layout",
      "selection-panel-layout",
      "gameplay-selection-hitbox",
      "campaign-dialogue-layout",
    ],
  );
});

test("client UI layout audit routes provisional surfaces to original binary trace targets", () => {
  const report = extractClientUiLayoutAudit(repositoryRoot);
  const probesById = new Map(report.probes.map((probe) => [probe.id, probe]));

  assertTraceTargets(probesById.get("hud-shell-responsive-layout"), [
    "mouse-interface-primary",
    "mouse-interface-secondary",
  ]);
  assertTraceTargets(probesById.get("minimap-diamond-layout"), [
    "mouse-interface-primary",
    "mouse-interface-secondary",
  ]);
  assertTraceTargets(probesById.get("selection-panel-layout"), [
    "mouse-interface-primary",
    "mouse-interface-secondary",
  ]);
  assertTraceTargets(probesById.get("gameplay-selection-hitbox"), [
    "draw-runtime-breakpoints",
    "mouse-interface-primary",
    "mouse-interface-secondary",
  ]);
  const actionGridLayout = probesById.get("action-grid-layout");
  assert.ok(actionGridLayout);
  assert.equal(
    actionGridLayout.currentBasis,
    "static-proven-K01-command-grid-geometry-with-client-generic-grid-adaptations",
  );
  assert.equal(
    actionGridLayout.originalEvidenceStatus,
    "static-proven-K01-grid-geometry-and-strict-hit;unproven-generic-4x3-labels-actions-and-HUD-placement",
  );
  assert.deepEqual(actionGridLayout.originalTraceTargets, [
    "FUN_00443360",
    "FUN_00481ee0",
    "FUN_0045ad90",
    "FUN_00459110",
    "FUN_00447a0f",
  ]);
  assert.match(actionGridLayout.followUp, /K01-only nine-slot geometry and strict hit/u);
  assert.equal(
    actionGridLayout.patterns.every(
      (pattern) => pattern.present && Number.isInteger(pattern.line),
    ),
    true,
  );
  const dialogueLayout = probesById.get("campaign-dialogue-layout");
  assert.ok(dialogueLayout);
  assert.deepEqual(dialogueLayout.originalTraceTargets, [
    "FUN_0048311e",
    "FUN_004a7a50",
    "FUN_004a8410",
  ]);
  assert.equal(
    dialogueLayout.originalEvidenceStatus,
    "static-proven-for-speech-slots-and-text",
  );
  assert.equal(
    dialogueLayout.patterns.every(
      (pattern) => pattern.present && Number.isInteger(pattern.line),
    ),
    true,
  );
});

function assertTraceTargets(probe, expectedTargets) {
  assert.ok(probe);
  assert.deepEqual(probe.originalTraceTargets, expectedTargets);
  assert.match(probe.originalEvidenceStatus, /^unproven/);
  assert.equal(probe.patterns.every((pattern) => pattern.present && Number.isInteger(pattern.line)), true);
}
