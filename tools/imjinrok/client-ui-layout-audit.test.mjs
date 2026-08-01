import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractClientUiLayoutAudit } from "./extract-client-ui-layout-audit.mjs";
import { imjinrokK01Scenario } from "../../packages/shared/src/scenarios.ts";
import {
  assertPresentationTimingPolicy,
  shouldReplayMissionBriefingVoice,
} from "../../apps/game-client/src/missionPresentationTimeline.ts";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("client UI layout audit separates original evidence from intentional product adaptations", () => {
  const report = extractClientUiLayoutAudit(repositoryRoot);
  const policy = imjinrokK01Scenario.briefing?.timing?.presentationPolicy;
  assertPresentationTimingPolicy(policy);
  assert.equal(policy.classification, "intentional-adaptation");
  assert.equal(policy.sourceParity, "not-established");
  assert.equal(shouldReplayMissionBriefingVoice("resize"), false);
  assert.equal(shouldReplayMissionBriefingVoice("font-ready"), false);

  assert.equal(report.summary.probeCount, 7);
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
      "pre-game-briefing-layout",
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
    "static-proven-for-SPEECH-slots-and-text;project-adaptation-for-portrait-scale-in",
  );
  assert.equal(
    dialogueLayout.currentBasis,
    "static-proven-SPEECH-slots-and-text-with-project-portrait-scale-in-adaptation",
  );
  assert.match(dialogueLayout.followUp, /in-game SPEECH slot\/text mapping separate from project portrait scale-in/u);
  assert.equal(
    dialogueLayout.patterns.every(
      (pattern) => pattern.present && Number.isInteger(pattern.line),
    ),
    true,
  );
  const preGameBriefingLayout = probesById.get("pre-game-briefing-layout");
  assert.ok(preGameBriefingLayout);
  assert.deepEqual(preGameBriefingLayout.originalTraceTargets, [
    "FUN_0048311e",
    "FUN_004a7a50",
    "FUN_004a8410",
  ]);
  assert.equal(
    preGameBriefingLayout.originalEvidenceStatus,
    "source-timing-order-and-update-semantics-preserved-as-metadata;static-proven-for-SPEECH-slots-text-and-labels;project-adaptation-for-web-calibrated-portrait-cadence-and-final-click-dismiss",
  );
  assert.equal(
    preGameBriefingLayout.currentBasis,
    "source-timing-metadata-and-static-proven-SPEECH-slots-text-labels-with-explicit-web-calibrated-presentation-and-final-click-adaptations",
  );
  assert.match(preGameBriefingLayout.followUp, /source timing order\/update semantics/u);
  assert.match(preGameBriefingLayout.followUp, /SPEECH slots, text, and labels/u);
  assert.match(preGameBriefingLayout.followUp, /explicit web-calibrated portrait\/title policy and final-click dismiss/u);
  assert.equal(
    preGameBriefingLayout.patterns.every(
      (pattern) => pattern.present && Number.isInteger(pattern.line),
    ),
    true,
  );
  assert.deepEqual(
    preGameBriefingLayout.patterns.map((pattern) => pattern.text),
    [
      "const targetScale = portrait.width / 130;",
      "const label = this.context?.scenario?.briefing?.portraitLabels?.[normalizeMissionPortraitId(participant.portraitId)];",
      "layout.label.centerX, layout.label.y, label",
    ],
  );
});

function assertTraceTargets(probe, expectedTargets) {
  assert.ok(probe);
  assert.deepEqual(probe.originalTraceTargets, expectedTargets);
  assert.match(probe.originalEvidenceStatus, /^unproven/);
  assert.equal(probe.patterns.every((pattern) => pattern.present && Number.isInteger(pattern.line)), true);
}
