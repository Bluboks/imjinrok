import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractClientUiLayoutAudit } from "./extract-client-ui-layout-audit.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("client UI layout audit separates original evidence from intentional product adaptations", () => {
  const report = extractClientUiLayoutAudit(repositoryRoot);

  assert.equal(report.summary.probeCount, 6);
  assert.equal(report.summary.allPatternsPresent, true);
  assert.equal(report.summary.unprovenOriginalParityCount, 4);
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
    "intentional-adaptive-4x3-12-slot-product-policy-with-static-proven-3x3-research-helper",
  );
  assert.equal(
    actionGridLayout.originalEvidenceStatus,
    "static-proven-original-K01-3x3-geometry-and-strict-hit-in-research-helper;intentional-product-adaptation-4x3-12-slot",
  );
  assert.deepEqual(actionGridLayout.originalTraceTargets, [
    "FUN_00443360",
    "FUN_00481ee0",
    "FUN_0045ad90",
    "FUN_00459110",
    "FUN_00447a0f",
  ]);
  assert.match(actionGridLayout.followUp, /3x3 geometry and strict interior hit in the research helper/u);
  assert.match(actionGridLayout.followUp, /adaptive 4x3\/12-slot policy/u);
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
    "static-proven-for-SPEECH-slots-and-text;project-adaptation-for-portrait-scale-in-and-base-to-completed-frame-fade",
  );
  assert.equal(
    dialogueLayout.currentBasis,
    "static-proven-SPEECH-slots-and-text-with-project-portrait-scale-and-briefing-frame-fade-adaptations",
  );
  assert.match(dialogueLayout.followUp, /SPEECH slot\/text mapping separate from project portrait scale-in/u);
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
