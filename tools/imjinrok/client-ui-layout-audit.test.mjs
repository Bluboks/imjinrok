import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractClientUiLayoutAudit } from "./extract-client-ui-layout-audit.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("client UI layout audit identifies current provisional hard-coded layout surfaces", () => {
  const report = extractClientUiLayoutAudit(repositoryRoot);

  assert.equal(report.summary.probeCount, 6);
  assert.equal(report.summary.allPatternsPresent, true);
  assert.equal(report.summary.unprovenOriginalParityCount, 6);
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
  assertTraceTargets(probesById.get("action-grid-layout"), [
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
  assertTraceTargets(probesById.get("campaign-dialogue-layout"), [
    "YOKCANCEL",
    "YSELECTSTAGE",
    "briefing-resource-xrefs",
  ]);
});

function assertTraceTargets(probe, expectedTargets) {
  assert.ok(probe);
  assert.deepEqual(probe.originalTraceTargets, expectedTargets);
  assert.match(probe.originalEvidenceStatus, /^unproven/);
  assert.equal(probe.patterns.every((pattern) => pattern.present && Number.isInteger(pattern.line)), true);
}
