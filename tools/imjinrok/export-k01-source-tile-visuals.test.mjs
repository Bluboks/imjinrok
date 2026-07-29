import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { exportK01SourceTileVisuals } from "./export-k01-source-tile-visuals.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const committedAssetDirectory = resolve(repositoryRoot, "apps/game-client/public/assets/themes/default/terrain/imjinrok-normal");
const committedArtifactPath = resolve(repositoryRoot, "packages/shared/src/generated/k01SourceTileVisualArtifact.ts");
const committedManifestPath = resolve(committedAssetDirectory, "k01-source-tiles.manifest.json");
const selectorFixturePath = resolve(repositoryRoot, "analysis/fixtures/k01-source-tile-selector.json");

test("exports the committed K01-only 243-frame visual catalog deterministically", (t) => {
  const directory = mkdtempSync(resolve(tmpdir(), "k01-source-tile-export-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const assetDirectory = resolve(directory, "assets");
  const artifactPath = resolve(directory, "k01SourceTileVisualArtifact.ts");
  const manifestPath = resolve(assetDirectory, "k01-source-tiles.manifest.json");
  const result = exportK01SourceTileVisuals({ assetDirectory, artifactPath, manifestPath });

  assert.equal(result.assetCount, 243);
  assert.ok(result.assetBytes > 0);
  assert.deepEqual(readFileSync(artifactPath), readFileSync(committedArtifactPath));
  assert.deepEqual(readFileSync(manifestPath), readFileSync(committedManifestPath));
  for (const asset of result.manifest.assets) {
    assert.deepEqual(readFileSync(resolve(assetDirectory, asset.fileName)), readFileSync(resolve(committedAssetDirectory, asset.fileName)), asset.fileName);
  }
});

test("rejects a stale selector fixture before exporting source tiles", (t) => {
  const directory = mkdtempSync(resolve(tmpdir(), "k01-source-tile-stale-fixture-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const staleFixturePath = resolve(directory, "selector.json");
  const fixture = JSON.parse(readFileSync(selectorFixturePath, "utf8"));
  fixture.pairStream.sha256 = "0".repeat(64);
  writeFileSync(staleFixturePath, `${JSON.stringify(fixture)}\n`);

  assert.throws(
    () => exportK01SourceTileVisuals({ assetDirectory: resolve(directory, "assets"), artifactPath: resolve(directory, "artifact.ts"), selectorFixturePath: staleFixturePath }),
    /fixture does not match canonical hash-bound extractor output/u,
  );
});
