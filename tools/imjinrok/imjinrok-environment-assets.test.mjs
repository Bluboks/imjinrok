import assert from "node:assert/strict";
import test from "node:test";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { extractImjinrokEnvironmentAssets } from "./extract-imjinrok-environment-assets.mjs";
import { exportImjinrokEnvironmentAssets } from "./export-imjinrok-environment-assets.mjs";

test("catalogues all source tileset containers with complete header and family coverage", () => {
  const report = extractImjinrokEnvironmentAssets();
  const categories = new Set(report.sourceFiles.map((entry) => entry.category));
  const paths = new Set(report.sourceFiles.map((entry) => entry.sourcePath));

  assert.deepEqual([...categories].filter((category) => category.startsWith("tileset:")).sort(), ["tileset:brown", "tileset:normal", "tileset:snow"]);
  for (const path of ["tile/normal/grss1.ytl", "tile/snow/sea0.ytl", "tile/brown/hill0.ytl", "tile/normal/fog0.spr", "pal/night1.pal", "tempeft/night1.YAV", "fnt/resource.spr"]) {
    assert.ok(paths.has(path), `missing ${path}`);
  }
  assert.ok(report.sourceFiles.every((entry) => entry.sha256.length === 64 && entry.size > 0 && entry.extension && entry.familyStem));
  assert.equal(report.tilesetSymmetry.fileNameSetsSymmetric, true);
  assert.equal(report.tilesetSymmetry.headerShapesSymmetric, true);

  for (const theme of ["normal", "snow", "brown"]) {
    const entries = report.sourceFiles.filter((entry) => entry.category === `tileset:${theme}`);
    const familyCounts = countBy(entries, (entry) => entry.familyStem);

    assert.equal(entries.length, 78, theme);
    assert.deepEqual(familyCounts, {
      black: 1,
      blacktile: 1,
      castle: 3,
      diff: 16,
      fog: 15,
      grss: 15,
      hill: 17,
      newblk: 5,
      sea: 4,
      shallow: 1,
    });
    assert.deepEqual(
      entries.filter((entry) => entry.familyStem === "fog").map((entry) => entry.sourcePath.split("/").at(-1)).sort(),
      Array.from({ length: 15 }, (_value, index) => `fog${index}.spr`).sort(),
    );
  }

  for (const entry of report.sourceFiles.filter((candidate) => [".spr", ".ytl", ".ypr"].includes(candidate.extension))) {
    assert.ok(Number.isInteger(entry.width) && entry.width > 0, entry.sourcePath);
    assert.ok(Number.isInteger(entry.height) && entry.height > 0, entry.sourcePath);
    assert.ok(Number.isInteger(entry.frameCount) && entry.frameCount > 0, entry.sourcePath);
    assert.ok(Number.isInteger(entry.endOffset) && entry.endOffset > 0, entry.sourcePath);
  }

  const fixture = JSON.parse(readFileSync(resolve("analysis/fixtures/imjinrok-environment-assets.json"), "utf8"));
  assert.deepEqual(report, fixture);
});

test("rejects stale source bytes and malformed sprite headers before emitting a catalog", () => {
  const report = extractImjinrokEnvironmentAssets();
  const staleRoot = copyCatalogSources(report);
  const stalePath = resolve(staleRoot, "tile/normal/grss1.ytl");
  const staleBytes = readFileSync(stalePath);
  staleBytes[staleBytes.length - 1] ^= 0xff;
  writeFileSync(stalePath, staleBytes);

  assert.throws(
    () => extractImjinrokEnvironmentAssets({ originalRoot: staleRoot }),
    /tileset:normal source digest mismatch/,
  );

  const malformedRoot = copyCatalogSources(report);
  const malformedPath = resolve(malformedRoot, "tile/normal/grss1.ytl");
  const malformedBytes = readFileSync(malformedPath);
  malformedBytes[0] ^= 0xff;
  writeFileSync(malformedPath, malformedBytes);

  assert.throws(
    () => extractImjinrokEnvironmentAssets({ originalRoot: malformedRoot }),
    /tile\/normal\/grss1\.ytl: magic mismatch/,
  );

  const invalidRangeRoot = copyCatalogSources(report);
  const invalidRangePath = resolve(invalidRangeRoot, "tile/normal/grss1.ytl");
  const invalidRangeBytes = readFileSync(invalidRangePath);
  invalidRangeBytes.writeUInt32LE(0xffffffff, 0x0bc8);
  writeFileSync(invalidRangePath, invalidRangeBytes);

  assert.throws(
    () => extractImjinrokEnvironmentAssets({ originalRoot: invalidRangeRoot }),
    /tile\/normal\/grss1\.ytl: frame \d+ range exceeds file bounds/,
  );
});

test("exports deterministic representative terrain, resource, and palette manifests", () => {
  const assetRoot = mkdtempSync(resolve(tmpdir(), "imjinrok-environment-assets-"));
  exportImjinrokEnvironmentAssets({ assetRoot });

  const grassManifest = JSON.parse(readFileSync(resolve(assetRoot, "terrain/imjinrok-normal/grss1.manifest.json"), "utf8"));
  const resourceManifest = JSON.parse(readFileSync(resolve(assetRoot, "resources/imjinrok/resource.manifest.json"), "utf8"));
  const paletteManifest = JSON.parse(readFileSync(resolve(assetRoot, "environment/imjinrok-night/night1.pal.json"), "utf8"));

  assert.deepEqual(grassManifest.exportedFrames, [{ index: 0, fileName: "grss1_0000.png" }]);
  assert.deepEqual(resourceManifest.exportedFrames, [{ index: 0, fileName: "resource_0000.png" }]);
  assert.equal(paletteManifest.evidenceStatus, "unresolved");
  assert.equal(paletteManifest.source, "pal/night1.pal");
});

function copyCatalogSources(report) {
  const root = mkdtempSync(resolve(tmpdir(), "imjinrok-environment-source-"));
  const sourceRoot = resolve("original/imjinrok2");

  for (const entry of report.sourceFiles) {
    const destination = resolve(root, entry.sourcePath);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(resolve(sourceRoot, entry.sourcePath), destination);
  }

  return root;
}

function countBy(entries, getKey) {
  const counts = {};
  for (const entry of entries) {
    const key = getKey(entry);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}
