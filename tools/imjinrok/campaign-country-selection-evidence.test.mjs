import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  createCampaignCountrySelectionFixture,
  extractCampaignCountrySelectionEvidence,
  resolveSourceCountryMaskIndex,
} from "./extract-campaign-country-selection-evidence.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const fixturePath = resolve(repositoryRoot, "analysis/fixtures/campaign-country-selection-evidence.json");

test("statically recovers the country-selection mask, screens, and routing", () => {
  const fixture = createCampaignCountrySelectionFixture();
  assert.equal(readFileSync(fixturePath, "utf8"), `${JSON.stringify(fixture)}\n`);

  const report = extractCampaignCountrySelectionEvidence();
  assert.equal(report.analysisStatus, fixture.analysisStatus);
  assert.equal(report.reproductionStatus, fixture.reproductionStatus);
  assert.deepEqual(report.maskRegions, [
    { id: "korea", sourceMaskIndex: 68, selectedScreen: "stage-korea", selectionIndex: 0, sourceNationValue: 1, pixelCount: 33492, bounds: { minX: 431, minY: 28, maxX: 612, maxY: 346 } },
    { id: "japan", sourceMaskIndex: 70, selectedScreen: "stage-japan", selectionIndex: 1, sourceNationValue: 2, pixelCount: 19518, bounds: { minX: 517, minY: 72, maxX: 613, maxY: 342 } },
    { id: "china", sourceMaskIndex: 69, selectedScreen: "stage-china", selectionIndex: 2, sourceNationValue: 3, pixelCount: 23891, bounds: { minX: 320, minY: 59, maxX: 445, maxY: 350 } },
  ]);
  assert.match(report.unresolved, /browser pointerup/u);

  for (const vector of fixture.vectors) {
    assert.equal(resolveSourceCountryMaskIndex(vector.input.maskIndex), vector.expected, vector.id);
  }
});
