import test from "node:test";
import assert from "node:assert/strict";
import { k01ReinforcementAdapter, k01SourceOpeningAdapter } from "@shared";
import { UNIT_AUDIO_CUES } from "./gameplayAudio.js";
import { K01_GAMEPLAY_AUDIO_COVERAGE } from "./k01GameplayAudioCoverage.js";

test("K01 gameplay-audio inventory accounts for every source-spawnable kind exactly once", () => {
  const scenarioKinds = new Set([
    ...k01SourceOpeningAdapter.map(({ projectKind }) => projectKind),
    ...k01ReinforcementAdapter.map(({ projectKind }) => projectKind),
  ]);
  const inventoryKinds = K01_GAMEPLAY_AUDIO_COVERAGE.map(({ kind }) => kind);

  assert.equal(new Set(inventoryKinds).size, inventoryKinds.length, "K01 inventory kinds must be unique");
  assert.deepEqual(new Set(inventoryKinds), scenarioKinds);
});

test("K01 unresolved identities cannot inherit guessed gameplay-audio defaults", () => {
  for (const coverage of K01_GAMEPLAY_AUDIO_COVERAGE) {
    const configuredActions = Object.entries(UNIT_AUDIO_CUES[coverage.kind] ?? {})
      .map(([action, cueKey]) => ({ action, cueKey }))
      .sort(compareActionCoverage);
    const inventoriedActions = [...coverage.actions].sort(compareActionCoverage);

    assert.deepEqual(configuredActions, inventoriedActions, coverage.kind);
    if (coverage.status === "unresolved") {
      assert.deepEqual(configuredActions, [], `${coverage.kind} must not receive a guessed default`);
    }
  }
});

function compareActionCoverage(
  left: { action: string; cueKey: string },
  right: { action: string; cueKey: string },
): number {
  return `${left.action}:${left.cueKey}`.localeCompare(`${right.action}:${right.cueKey}`);
}
