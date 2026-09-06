import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { exportK01TerrainDiagnostic } from "./export-k01-terrain-diagnostic.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const artifactPath = resolve(repositoryRoot, "packages/shared/src/generated/k01SourceTileVisualArtifact.ts");
const assetDirectory = resolve(repositoryRoot, "apps/game-client/public/assets/themes/default/terrain/imjinrok-normal");

test("K01 terrain diagnostic preserves every source/product coordinate and measures the selected PNG alpha", (t) => {
  const directory = mkdtempSync(resolve(tmpdir(), "k01-terrain-diagnostic-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const firstOutput = resolve(directory, "first.json");
  const secondOutput = resolve(directory, "second.json");
  const first = exportK01TerrainDiagnostic({ artifactPath, assetDirectory, outputPath: firstOutput });
  exportK01TerrainDiagnostic({ artifactPath, assetDirectory, outputPath: secondOutput });

  assert.deepEqual(readFileSync(firstOutput), readFileSync(secondOutput));
  assert.equal(first.cellCount, 3_600);
  assert.equal(first.cells.length, 3_600);
  assert.equal(first.cellRecordsSha256, "582d9408e3fc067ced0234b09e6ca39690ab9ccefc414e5dcf2e46a3de8b84c9");
  assert.deepEqual(first.coordinateOrder, {
    source: "x-major: sourceOrdinal = x * height + y",
    product: "row-major: productOrdinal = y * width + x",
  });
  assert.equal(first.evidenceStatus.originalRendererParity, "unconfirmed");
  assert.deepEqual(first.sourceRaster, {
    width: 3840,
    height: 2120,
    drawOrder: "y-major then x-major",
    coverage: {
      terrainDomainPixelCount: 3530496,
      uncoveredPixelCount: 5139,
      outerBoundaryTransparentPixelCount: 709,
      internalHolePixelCount: 4430,
      internalHoleBounds: { left: 3, top: 169, rightExclusive: 3485, bottomExclusive: 1133 },
    },
  });

  const origin = first.cells[0];
  const nextSource = first.cells[1];
  const nextProductRow = first.cells[60];
  const finalCell = first.cells.at(-1);
  assert.deepEqual(origin, {
    coordinate: { x: 0, y: 0 },
    sourceOrdinal: 0,
    productOrdinal: 0,
    sourcePair: { objectIndex: 0, frameIndex: 39, stem: "hill0", assetKey: "k01-source:hill0:0039" },
    rawPlacement: { encodedByte: 224, argumentDeltaMagnitude: 32, argumentAdjustment: -32 },
    projectedGroundPoint: { x: 1920, y: 200 },
    rasterDraw: { left: 1888, top: 168, width: 64, height: 48 },
    pngAlpha: origin.pngAlpha,
  });
  assert.equal(origin.pngAlpha.bounds.left >= 0, true);
  assert.equal(origin.pngAlpha.bounds.top >= 0, true);
  assert.equal(origin.pngAlpha.logicalFootprint.pixelCount, 1024);
  assert.equal(origin.pngAlpha.logicalFootprint.coveredPixelCount < origin.pngAlpha.logicalFootprint.pixelCount, true);
  assert.deepEqual(nextSource.coordinate, { x: 0, y: 1 });
  assert.equal(nextSource.sourceOrdinal, 1);
  assert.equal(nextSource.productOrdinal, 60);
  assert.deepEqual(nextProductRow.coordinate, { x: 1, y: 0 });
  assert.equal(nextProductRow.sourceOrdinal, 60);
  assert.equal(nextProductRow.productOrdinal, 1);
  assert.deepEqual(finalCell?.coordinate, { x: 59, y: 59 });
  assert.deepEqual(finalCell?.sourcePair, { objectIndex: 31, frameIndex: 18, stem: "grss1", assetKey: "k01-source:grss1:0018" });
  assert.deepEqual(finalCell?.projectedGroundPoint, { x: 1920, y: 2088 });
});

test("K01 terrain diagnostic rejects tampered pair and raw-placement streams", (t) => {
  const directory = mkdtempSync(resolve(tmpdir(), "k01-terrain-diagnostic-tamper-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = readFileSync(artifactPath, "utf8");
  const tamperedArtifactPath = resolve(directory, "artifact.ts");
  writeFileSync(tamperedArtifactPath, source.replace("pairBytesBase64", "pairBytesBase64Tampered"));
  assert.throws(
    () => exportK01TerrainDiagnostic({ artifactPath: tamperedArtifactPath, assetDirectory, outputPath: null }),
    /missing encoded source streams|stream lengths|digest mismatch/u,
  );
});
