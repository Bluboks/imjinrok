import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { exportSourceFogComposites } from "./export-source-fog-composites.mjs";

test("exports all source fog family-selector composites with deterministic hashes and K01 family artifact", () => {
  const first = mkdtempSync(join(tmpdir(), "imjinrok-source-fog-a-"));
  const second = mkdtempSync(join(tmpdir(), "imjinrok-source-fog-b-"));
  const one = exportSourceFogComposites({
    assetDirectory: join(first, "assets"),
    artifactPath: join(first, "k01SourceFogArtifact.ts"),
    manifestPath: join(first, "manifest.json"),
  });
  const two = exportSourceFogComposites({
    assetDirectory: join(second, "assets"),
    artifactPath: join(second, "k01SourceFogArtifact.ts"),
    manifestPath: join(second, "manifest.json"),
  });

  assert.equal(one.assetCount, 210);
  assert.deepEqual(one.manifest.imageGeometry, { width: 64, height: 48, subframeGrid: { columns: 2, rows: 3 } });
  assert.deepEqual(one.manifest.assets, two.manifest.assets);
  assert.deepEqual(one.manifest.assets[0], {
    familyIndex: 0,
    selector: 0,
    sourceFrameIndices: [0, 1, 32, 33, 64, 65],
    fileName: "fog0_selector00.png",
    sha256: "7641aaf1b4d530b8c2dc6694fddfcb8ba3af4358198b6eaaf630c29624a86111",
  });
  assert.deepEqual(one.manifest.assets.at(-1), {
    familyIndex: 14,
    selector: 13,
    sourceFrameIndices: [26, 27, 58, 59, 90, 91],
    fileName: "fog14_selector13.png",
    sha256: "21612aed8424c792d974df26cee42afd65aa88827000acc524266fa15d53ad54",
  });
  assert.equal(readFileSync(join(first, "manifest.json"), "utf8"), readFileSync(join(second, "manifest.json"), "utf8"));
  assert.equal(readFileSync(join(first, "k01SourceFogArtifact.ts"), "utf8"), readFileSync(join(second, "k01SourceFogArtifact.ts"), "utf8"));

  const committed = JSON.parse(readFileSync(resolve("apps/game-client/public/assets/themes/default/fog/normal/composites/source-fog-composites.manifest.json"), "utf8"));
  assert.deepEqual(committed.assets, one.manifest.assets);
});
