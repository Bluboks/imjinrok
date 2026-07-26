import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUILDING_IDENTITY,
  CONSTRUCTION_PHASE_THRESHOLDS,
  EXPECTED_EXECUTABLE_SHA256,
  EXPECTED_SPRITE_SHA256,
  extractBuildingStatePilot,
  selectBuildingBodyFrame,
  selectConstructionPhase,
} from "./extract-building-state-pilot.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const executablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const spritePath = join(repositoryRoot, "original/imjinrok2/char/hqk.spr");
const jumpTablesPath = join(repositoryRoot, "analysis/generated/imjinrok2/jump-tables.json");

test("extracts the Korean HQ identity and body-state evidence chain", () => {
  const report = extractBuildingStatePilot({ executablePath, spritePath, jumpTablesPath });

  assert.equal(report.analysisStatus, "static-confirmed-for-korean-hq-body-states");
  assert.deepEqual(
    {
      internalClass: report.identity.internalClass,
      originalGameplayName: report.identity.originalGameplayName,
      spriteSlot: report.identity.spriteSlot,
      sourcePath: report.identity.sourcePath,
      healthyFrame: report.identity.healthyFrame,
      damagedFrame: report.identity.damagedFrame,
    },
    {
      internalClass: 49,
      originalGameplayName: "조선 본영",
      spriteSlot: 141,
      sourcePath: "char\\hqk.spr",
      healthyFrame: 7,
      damagedFrame: 8,
    },
  );
  assert.equal(report.sources.executable.sha256, EXPECTED_EXECUTABLE_SHA256);
  assert.equal(report.sources.sprite.sha256, EXPECTED_SPRITE_SHA256);
  assert.deepEqual(
    {
      width: report.sources.sprite.width,
      height: report.sources.sprite.height,
      frameCount: report.sources.sprite.frameCount,
    },
    { width: 131, height: 131, frameCount: 20 },
  );
  assert.equal(report.resourceBinding.pointerCell, "0x004bc2c8");
  assert.equal(report.resourceBinding.sourcePathPointer, "0x004bcf34");
  assert.equal(report.typeDefinition.recordAddress, "0x00886d9c");
  assert.equal(report.typeDefinition.originalGameplayName, "조선 본영");
  assert.equal(report.construction.frameSelectorFunction, "0x0041a9e0");
  assert.equal(report.construction.koreanHqRenderFormula, "renderFrame = constructionPhase + (7 - 7) = constructionPhase");
  assert.equal(report.entityFields.renderFrame, "+0x0c");
  assert.equal(report.evidencePoints.every((point) => point.matched), true);
});

test("reproduces every construction phase boundary", () => {
  const vectors = [
    [0, 0],
    [9, 0],
    [10, 1],
    [19, 1],
    [20, 2],
    [29, 2],
    [30, 3],
    [39, 3],
    [40, 4],
    [49, 4],
    [50, 5],
    [69, 5],
    [70, 6],
    [99, 6],
    [100, 7],
  ];

  assert.deepEqual(CONSTRUCTION_PHASE_THRESHOLDS, [0, 10, 20, 30, 40, 50, 70, 100]);
  for (const [constructionPercent, expectedFrame] of vectors) {
    assert.equal(selectConstructionPhase(constructionPercent), expectedFrame, String(constructionPercent));
  }
  assert.throws(() => selectConstructionPhase(-1), /outside integer range 0\.\.100/);
  assert.throws(() => selectConstructionPhase(10.5), /outside integer range 0\.\.100/);
  assert.throws(() => selectConstructionPhase(101), /outside integer range 0\.\.100/);
});

test("reproduces the effective-health formula and strict 50-percent boundary", () => {
  assert.deepEqual(
    selectBuildingBodyFrame({ constructionPercent: 100, maximumHealth: 1_500, currentHealth: 750 }),
    {
      constructionPercent: 100,
      maximumHealth: 1_500,
      currentHealth: 750,
      effectiveHealth: 750,
      threshold: 750,
      damaged: false,
      frameIndex: BUILDING_IDENTITY.healthyFrame,
    },
  );
  assert.equal(
    selectBuildingBodyFrame({ constructionPercent: 100, maximumHealth: 1_500, currentHealth: 749 }).frameIndex,
    BUILDING_IDENTITY.damagedFrame,
  );
  assert.equal(
    selectBuildingBodyFrame({ constructionPercent: 50, maximumHealth: 1_500, currentHealth: 0 }).frameIndex,
    BUILDING_IDENTITY.healthyFrame,
  );
  assert.equal(
    selectBuildingBodyFrame({ constructionPercent: 90, maximumHealth: 1_500, currentHealth: 599 }).frameIndex,
    BUILDING_IDENTITY.damagedFrame,
  );
  assert.throws(
    () => selectBuildingBodyFrame({ constructionPercent: 100, maximumHealth: 0, currentHealth: 0 }),
    /Maximum health must be positive/,
  );
});
