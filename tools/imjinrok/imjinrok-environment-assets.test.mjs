import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { extractImjinrokEnvironmentAssets } from "./extract-imjinrok-environment-assets.mjs";
import { exportImjinrokEnvironmentAssets } from "./export-imjinrok-environment-assets.mjs";

test("catalogues all source tileset families and unresolved night/resource assets", () => {
  const report = extractImjinrokEnvironmentAssets();
  const categories = new Set(report.sourceFiles.map((entry) => entry.category));
  const paths = new Set(report.sourceFiles.map((entry) => entry.sourcePath));

  assert.deepEqual([...categories].filter((category) => category.startsWith("tileset:")).sort(), ["tileset:brown", "tileset:normal", "tileset:snow"]);
  for (const path of ["tile/normal/grss1.ytl", "tile/snow/sea0.ytl", "tile/brown/hill0.ytl", "tile/normal/fog0.spr", "pal/night1.pal", "tempeft/night1.YAV", "fnt/resource.spr"]) {
    assert.ok(paths.has(path), `missing ${path}`);
  }
  assert.ok(report.sourceFiles.every((entry) => entry.sha256.length === 64 && entry.size > 0));
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
