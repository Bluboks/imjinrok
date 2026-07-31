import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { exportSourceClockAssets } from "./export-source-clock-assets.mjs";

test("exports every hash-bound clock frame and records the explicit runtime adapter boundary", async () => {
  const assetDirectory = await mkdtemp(join(tmpdir(), "source-clock-export-"));
  try {
    const manifest = exportSourceClockAssets({ assetDirectory });

    assert.equal(manifest.assetMappingStatus, "source-identity-with-intentional-superset-runtime-adapter");
    assert.deepEqual(manifest.productAdapter.runtimeFrameIndexes, Array.from({ length: 16 }, (_value, index) => index));
    assert.equal(manifest.assets.length, 20);
    assert.deepEqual(manifest.assets.map((asset) => asset.frameIndex), Array.from({ length: 20 }, (_value, index) => index));
    await Promise.all(manifest.assets.map((asset) => stat(join(assetDirectory, asset.fileName))));
  } finally {
    await rm(assetDirectory, { recursive: true, force: true });
  }
});
