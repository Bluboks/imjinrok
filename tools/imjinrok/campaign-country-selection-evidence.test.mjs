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
    { id: "korea", sourceMaskIndex: 68, selectedScreen: "stage-korea", selectionIndex: 0, sourceNationValue: 1, rgb: { red: 0, green: 202, blue: 0 }, pixelCount: 33492, bounds: { minX: 431, minY: 28, maxX: 612, maxY: 346 } },
    { id: "japan", sourceMaskIndex: 70, selectedScreen: "stage-japan", selectionIndex: 1, sourceNationValue: 2, rgb: { red: 202, green: 202, blue: 0 }, pixelCount: 19518, bounds: { minX: 517, minY: 72, maxX: 613, maxY: 342 } },
    { id: "china", sourceMaskIndex: 69, selectedScreen: "stage-china", selectionIndex: 2, sourceNationValue: 3, rgb: { red: 202, green: 0, blue: 0 }, pixelCount: 23891, bounds: { minX: 320, minY: 59, maxX: 445, maxY: 350 } },
  ]);
  assert.deepEqual(report.sources.palette, {
    path: "original/imjinrok2/pal/imjin2.pal",
    sha256: "5ba2c020e9bd89210a10550fb4baaee8ab8bb316d4a2c7e66bdb24c6c8c4323b",
  });
  assert.match(report.unresolved, /browser pointerup/u);

  for (const vector of fixture.vectors) {
    assert.equal(resolveSourceCountryMaskIndex(vector.input.maskIndex), vector.expected, vector.id);
  }
});
