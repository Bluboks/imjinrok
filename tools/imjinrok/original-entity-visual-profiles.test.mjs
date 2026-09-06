import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  calculateStaticPivot,
  extractOriginalEntityVisualProfiles,
  selectContinuousOverlayFrame,
} from "./extract-original-entity-visual-profiles.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const executablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const seedsPath = join(repositoryRoot, "analysis/generated/imjinrok2/seeds.json");
const functionsPath = join(repositoryRoot, "analysis/generated/imjinrok2/functions.json");
const generatedReportPath = join(repositoryRoot, "analysis/generated/original-entity-visual-profiles.json");
const generatedFixturePath = join(repositoryRoot, "analysis/fixtures/original-entity-visual-profiles-vectors.json");

test("extracts complete type pivots and the two-stage building switch map", () => {
  const report = extractOriginalEntityVisualProfiles({ executablePath, seedsPath, functionsPath });
  assert.deepEqual(report.summary, {
    typeCount: 95,
    buildingProfileCount: 35,
    continuousOverlayDrawCount: 12,
    quarantinedConditionalDrawCount: 2,
    classesWithConditionalEffect: 2,
    classesWithContinuousOverlay: 12,
    classesWithSpecialOverlay: 1,
    classesWithNoOverlay: 22,
    blockerMaskMatches: 38,
  });
  assert.deepEqual(report.types.map((type) => type.internalClass), Array.from({ length: 95 }, (_, index) => index + 1));
  assert.ok(report.types.every((type) => Number.isInteger(type.flags)));
  assert.equal(report.types.filter((type) => type.render.evidenceStatus === "unresolved-missing-source-sprite").length, 0);
  assert.ok(report.types.every((type) => Number.isInteger(type.sprite.width) && Number.isInteger(type.sprite.height) && Number.isInteger(type.sprite.frameCount)));
  assert.ok(report.types.every((type) => type.render.verticalOffsetField === "+0x0c" && type.render.writerArgumentOrdinal === 5));
  assert.ok(report.types.every((type) => (type.flags & 0x00020002) !== 0 ? type.blockerMaskMatch : !type.blockerMaskMatch));
  assert.ok(report.renderer.codeAnchors.every((anchor) => anchor.matched));
  assert.equal(report.renderer.nativeDimensionFields.footprintWidth, "entity +0x1e3 signed BYTE (far occupied-cell extent; not SPR pixel width)");
  assert.equal(report.renderer.nativeDimensionFields.pixelWidth, "entity +0x1da signed WORD copied from SPR slot table globals +0x88c0bc with stride 0xbf8");

  assert.equal(report.buildingRenderer.switchTables.destinationTableEntryCount, 15);
  assert.equal(report.buildingRenderer.switchTables.selectorTableEntryCount, 55);
  assert.equal(report.buildingRenderer.switchTables.destinationTableSha256, "8add6e9681c751bad7478b85da6886c993ac705891091d7dcc2fef921668404b");
  assert.equal(report.buildingRenderer.switchTables.selectorTableSha256, "95ea741d97bd53a0538619dd706118106e48b7fd66d41b671e8196f7565007a6");
  const switchCases = new Map(report.buildingRenderer.switchCases.map((entry) => [entry.internalClass, entry]));
  for (const [internalClass, destination] of [[41, "0x00422323"], [50, "0x00422197"], [57, "0x00422c88"], [61, "0x00422c88"], [69, "0x004229d1"], [95, "0x00421c85"]]) {
    assert.equal(switchCases.get(internalClass)?.destination, destination);
  }

  const class76 = report.types.find((type) => type.internalClass === 76);
  assert.deepEqual(class76?.sprite && [class76.sprite.width, class76.sprite.height], [128, 108]);
  assert.equal(class76?.render.verticalOffset, 23);
  assert.deepEqual(class76?.render.pivot, { x: 64, y: 85 });
  assert.equal(class76?.render.pivotMode, "type-offset");
  assert.equal(report.types.find((type) => type.internalClass === 31)?.sprite.sourcePathResolved, "char/Farmerj.spr");
  const centered = report.types.find((type) => (type.flags & 0x08) !== 0 && type.sprite.width !== null);
  assert.ok(centered);
  const centeredPivot = calculateStaticPivot({ width: centered.sprite.width, height: centered.sprite.height, flags: centered.flags, verticalOffset: centered.render.verticalOffset });
  assert.equal(centered.render.pivotMode, centeredPivot.pivotMode);
  assert.deepEqual(centered.render.pivot, { x: centeredPivot.x, y: centeredPivot.y });

  for (const [internalClass, frameRange, divisor] of [[50, [9, 15], 4], [57, [9, 18], 4]]) {
    const profile = report.buildingProfiles.find((entry) => entry.internalClass === internalClass);
    assert.deepEqual([profile?.overlay.frameStart, profile?.overlay.frameStart + profile?.overlay.frameCount - 1], frameRange);
    assert.equal(profile?.overlay.sourceGlobalTickDivisor, divisor);
  }
  const class41 = report.buildingProfiles.find((entry) => entry.internalClass === 41);
  assert.equal(class41?.overlays.length, 2);
  assert.deepEqual(class41?.conditionalEffects[0]?.sharedStateFields, ["entity+0x550", "entity+0x552", "entity+0x554"]);
  assert.deepEqual(class41?.conditionalEffects[0]?.secondaryRendererEntries, ["0x004517a0", "0x00451910", "0x0044e160"]);
});

test("keeps frame cadence integer and rejects invalid vectors", () => {
  assert.equal(selectContinuousOverlayFrame({ frameStart: 9, frameCount: 7, sourceGlobalTick: 0, sourceGlobalTickDivisor: 4 }), 9);
  assert.equal(selectContinuousOverlayFrame({ frameStart: 9, frameCount: 7, sourceGlobalTick: 4, sourceGlobalTickDivisor: 4 }), 10);
  assert.equal(selectContinuousOverlayFrame({ frameStart: 9, frameCount: 10, sourceGlobalTick: 40, sourceGlobalTickDivisor: 4 }), 9);
  assert.throws(() => calculateStaticPivot({ width: 0, height: 108, flags: 0, verticalOffset: 0 }), /positive/);
  assert.throws(() => selectContinuousOverlayFrame({ frameStart: 9, frameCount: 0, sourceGlobalTick: 0, sourceGlobalTickDivisor: 4 }), /positive/);
});

test("generated report and fixture remain deterministic", () => {
  const generated = JSON.parse(readFileSync(generatedReportPath, "utf8"));
  const regenerated = extractOriginalEntityVisualProfiles();
  assert.deepEqual(generated, regenerated);
  const fixture = JSON.parse(readFileSync(generatedFixturePath, "utf8"));
  assert.deepEqual(fixture.completeClasses, Array.from({ length: 95 }, (_, index) => index + 1));
  assert.deepEqual(fixture.buildingOverlayVectors, [
    { internalClass: 50, frameRange: [9, 15], sourceGlobalTickDivisor: 4 },
    { internalClass: 57, frameRange: [9, 18], sourceGlobalTickDivisor: 4 },
  ]);
  assert.deepEqual(fixture.dimensionProvenance, {
    footprintFields: ["entity+0x1e3 signed BYTE", "entity+0x1e4 signed BYTE"],
    pixelFields: ["entity+0x1da signed WORD", "entity+0x1dc signed WORD"],
    sourceHeaderDimensionsRemainStaticRepresentative: true,
  });
});
