import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

import { extractK01MobileOccupancyBoundary } from "./extract-k01-mobile-occupancy-boundary.mjs";

const root = resolve(import.meta.dirname, "../..");
const fixture = JSON.parse(readFileSync(join(root, "analysis/fixtures/k01-mobile-occupancy-boundary.json"), "utf8"));

test("K01 mobile occupancy boundary is source-bound and remains explicitly unresolved", () => {
  const report = extractK01MobileOccupancyBoundary();

  assert.deepEqual(
    {
      analysisStatus: report.analysisStatus,
      reproductionStatus: report.reproductionStatus,
      implementationStatus: report.implementationStatus,
      actionOneCallOrder: report.actionOneCallOrder,
      firstUnresolvedFunction: report.unresolvedEdge.firstUnresolvedFunction,
      vectorIds: report.vectors.map(({ id }) => id),
    },
    fixture,
  );
  assert.equal(report.byteAnchors.length, 8);
  assert.equal(report.functions.length, 7);
  assert.equal(report.fields.find(({ offset }) => offset === "+0x1b6")?.width, "WORD");
  assert.match(report.unresolvedEdge.consequence, /No original-profile movement occupancy adapter/);
});
