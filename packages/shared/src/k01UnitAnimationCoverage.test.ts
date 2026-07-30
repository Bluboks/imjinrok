import assert from "node:assert/strict";
import test from "node:test";
import {
  assessK01UnitAnimationCoverage,
  collectK01MobileSpawnKinds,
  collectScenarioSpawnKinds,
  defaultTheme,
  imjinrokK01Scenario,
  K01_UNIT_ANIMATION_EVIDENCE,
} from "./index.js";

test("K01 initial and scripted mobile kinds have an explicit source animation evidence entry", () => {
  const allSpawnKinds = collectScenarioSpawnKinds(imjinrokK01Scenario);
  const mobileSpawnKinds = collectK01MobileSpawnKinds(imjinrokK01Scenario);

  assert.deepEqual(allSpawnKinds, [
    "archer",
    "barracks",
    "gwon-yul",
    "house",
    "japanese-camp-barracks",
    "japanese-camp-firehouse",
    "japanese-camp-house",
    "japanese-camp-tower",
    "japanese-farmer",
    "japanese-gunner",
    "japanese-hq",
    "japanese-konishi",
    "japanese-samurai",
    "japanese-shrine-maiden",
    "japanese-swordsman",
    "japanese-turtle-tank",
    "korean-monk",
    "korean-training-command",
    "ryu-seong-ryong",
    "swordsman",
    "town-center",
    "villager",
  ]);
  assert.deepEqual(mobileSpawnKinds, K01_UNIT_ANIMATION_EVIDENCE.map(({ kind }) => kind).sort());
});

test("K01 source-evidenced states have live source-backed clips and quarantines are explicit", () => {
  const coverage = assessK01UnitAnimationCoverage(defaultTheme);

  for (const result of coverage) {
    assert.ok(result.visualId, `${result.kind} requires an entity visual binding`);
    assert.deepEqual(result.missingStates, [], `${result.kind} source state binding drifted`);
    assert.deepEqual(result.missingFrames, [], `${result.kind} source frame binding drifted`);
    assert.deepEqual(
      result.missingSourceOrientationDirections,
      [],
      `${result.kind} source orientation binding drifted`,
    );
    assert.ok(result.evidenceDocument.startsWith("docs/reverse-engineering/mechanics/"));
    assert.ok(result.quarantines.length > 0, `${result.kind} must state any intentionally unsupported scope`);
    assert.ok(result.quarantines.every(({ state, reason }) => state.length > 0 && reason.length > 0));
  }
});
