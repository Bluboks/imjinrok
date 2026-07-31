import assert from "node:assert/strict";
import { mkdtemp, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { exportSourceClockAssets } from "./export-source-clock-assets.mjs";

test("exports every hash-bound clock frame without inventing a runtime binding", async () => {
  const assetDirectory = await mkdtemp(join(tmpdir(), "source-clock-export-"));
  const manifest = exportSourceClockAssets({ assetDirectory });

  assert.equal(manifest.assetMappingStatus, "unverified-no-runtime-frame-binding");
  assert.equal(manifest.assets.length, 20);
  assert.deepEqual(manifest.assets.map((asset) => asset.frameIndex), Array.from({ length: 20 }, (_value, index) => index));
  await Promise.all(manifest.assets.map((asset) => stat(join(assetDirectory, asset.fileName))));
});
