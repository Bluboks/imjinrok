import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractCampaignMvpAudit } from "./extract-campaign-mvp-audit.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("campaign MVP audit separates source-backed implementation from partial original runtime observation", () => {
  const report = extractCampaignMvpAudit(repositoryRoot);
  const requirementsById = new Map(report.requirements.map((requirement) => [requirement.id, requirement]));

  assert.deepEqual(report.summary, {
    requirementCount: 5,
    achievedWithoutRuntimeCount: 4,
    partialRuntimeCount: 1,
    missingRuntimeCount: 0,
    failingEvidenceCount: 0,
  });
  assert.equal(requirementsById.get("original-executable-k01-asset-references")?.status, "achieved-without-runtime");
  assert.equal(requirementsById.get("source-script-dialogue-coverage")?.status, "achieved-without-runtime");
  assert.equal(requirementsById.get("client-scenario-definition-source-parity")?.status, "achieved-without-runtime");
  assert.equal(requirementsById.get("simulation-runtime-model-coverage")?.status, "achieved-without-runtime");
  assert.deepEqual(
    requirementsById.get("simulation-runtime-model-coverage")?.evidence.find((item) =>
      item.detail === "imjinrok K01 reinforcement preserves its static-proven requested coordinates through an occupied anchor"
    ),
    {
      id: "text:imjinrok K01 reinforcement preserves its static-proven requested coordinates through an occupied anchor",
      present: true,
      source: "packages/simulation/src/simulation.test.ts",
      detail: "imjinrok K01 reinforcement preserves its static-proven requested coordinates through an occupied anchor",
    },
  );
  assert.equal(requirementsById.get("original-executable-k01-runtime-observation")?.status, "partial-runtime-observation");
});

test("campaign MVP audit verifies K01 source script speech coverage", () => {
  const report = extractCampaignMvpAudit(repositoryRoot);
  const sourceCoverage = report.requirements.find((requirement) => requirement.id === "source-script-dialogue-coverage");

  assert.ok(sourceCoverage);
  assert.deepEqual(
    sourceCoverage.evidence.map((item) => item.detail),
    [
      "speechCount=11",
      "speechCount=3",
      "speechCount=3",
    ],
  );
});

test("campaign MVP audit keeps required original runtime follow-up explicit", () => {
  const report = extractCampaignMvpAudit(repositoryRoot);
  const runtimeObservation = report.requirements.find((requirement) =>
    requirement.id === "original-executable-k01-runtime-observation"
  );

  assert.ok(runtimeObservation);
  assert.equal(
    runtimeObservation.evidence.find((item) => item.id === "vm-note:k01-stage-select-ui-callsite-capture")?.present,
    true,
  );
  assert.equal(
    runtimeObservation.evidence.find((item) => item.id === "vm-note:k01-hero-panel-lookup-callsite-capture")?.present,
    true,
  );
  assert.equal(
    runtimeObservation.evidence.find((item) => item.id === "vm-note:k01-hero-panel-frame-draw-callsite-capture")
      ?.present,
    true,
  );
  assert.equal(
    runtimeObservation.evidence.find((item) => item.id === "vm-note:k01-game-speed-settings-runtime-capture")?.present,
    true,
  );
  assert.deepEqual(runtimeObservation.remaining, [
    "Capture remaining objective/progress K01 HUD/mechanics with QGA notes.",
    "Capture or improve the natural, unforced beacon-construction route if parity claims depend on UI construction timing.",
    "Record the evidence under docs/reverse-engineering before claiming full parity.",
  ]);
});
