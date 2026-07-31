import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assessK01EntityVisualCoverage,
  assessK01UnitAnimationCoverage,
  collectK01BuildingSpawnKinds,
  collectK01MobileSpawnKinds,
  collectScenarioSpawnKinds,
  defaultTheme,
  getK01SelectionPortraitRegistry,
  imjinrokK01Scenario,
  K01_BUILDING_VISUAL_EVIDENCE,
  K01_ENTITY_VISUAL_EVIDENCE,
  K01_UNIT_ANIMATION_EVIDENCE,
  resolveEntityPortraitFrame,
} from "./index.js";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const defaultThemeAssetRoot = join(repositoryRoot, "apps/game-client/public/assets/themes/default");

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

test("K01 initial and scripted entity roster has exact source-backed default visual coverage", () => {
  const allSpawnKinds = collectScenarioSpawnKinds(imjinrokK01Scenario);
  const buildingSpawnKinds = collectK01BuildingSpawnKinds(imjinrokK01Scenario);
  const coverage = assessK01EntityVisualCoverage(defaultTheme);

  assert.deepEqual(buildingSpawnKinds, K01_BUILDING_VISUAL_EVIDENCE.map(({ kind }) => kind).sort());
  assert.deepEqual(allSpawnKinds, K01_ENTITY_VISUAL_EVIDENCE.map(({ kind }) => kind).sort());

  for (const result of coverage) {
    assert.ok(result.visualId, `${result.kind} requires an entity visual binding`);
    assert.deepEqual(result.missingStates, [], `${result.kind} source visual state binding drifted`);
    assert.deepEqual(result.missingFrames, [], `${result.kind} source visual frame binding drifted`);
    assert.equal(result.missingDefaultFrame, false, `${result.kind} default source frame drifted`);
    assert.equal(
      result.missingExplicitSelectionRepresentative,
      false,
      `${result.kind} must use its exact source selection portrait`,
    );
    assert.ok(result.quarantines.length > 0, `${result.kind} must name unresolved visual scope`);

    const visual = defaultTheme.visuals[result.visualId!];
    assert.equal(visual?.kind, "entity", `${result.kind} must bind an entity visual`);
    if (visual?.kind !== "entity") {
      continue;
    }

    const portrait = resolveEntityPortraitFrame(visual);
    assert.equal(portrait?.frame, visual.portrait, `${result.kind} must not select a runtime portrait fallback`);
    assert.equal(
      existsSync(join(defaultThemeAssetRoot, "ui/portraits", portrait?.frame.fileName ?? "")),
      true,
      `${result.kind} portrait must resolve to a loadable converted source frame`,
    );
  }
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

test("K01 selection registry exposes every spawnable entity's exact source portrait", () => {
  const registry = getK01SelectionPortraitRegistry(defaultTheme);

  assert.deepEqual(
    registry.map(({ kind }) => kind).sort(),
    collectScenarioSpawnKinds(imjinrokK01Scenario),
  );

  for (const entry of registry) {
    assert.equal(entry.semanticStatus, "source-selection-panel-portrait");
    assert.equal(entry.frame.fileName, entry.sourcePortraitFrameFileName);
    assert.ok(entry.evidenceDocument.startsWith("docs/reverse-engineering/"));
    assert.ok(entry.quarantines.length > 0, `${entry.kind} must retain unsupported visual scope`);
    assert.equal(
      existsSync(join(defaultThemeAssetRoot, "ui/portraits", entry.sourcePortraitFrameFileName)),
      true,
      `${entry.kind} portrait must be a converted source frame`,
    );
  }
});

test("K01 selection registry omits a drifted portrait instead of falling back", () => {
  const visualId = defaultTheme.entityBindings.villager;
  const visual = defaultTheme.visuals[visualId];

  assert.equal(visual?.kind, "entity");
  if (visual?.kind !== "entity" || visual.portrait === undefined) {
    return;
  }

  const driftedTheme = {
    ...defaultTheme,
    visuals: {
      ...defaultTheme.visuals,
      [visualId]: {
        ...visual,
        portrait: { ...visual.portrait, fileName: "farmerk_0247.png" },
      },
    },
  };

  assert.equal(
    getK01SelectionPortraitRegistry(driftedTheme).some(({ kind }) => kind === "villager"),
    false,
  );
});
