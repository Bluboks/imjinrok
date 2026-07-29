import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { createContentRegistry, createImjinrokMapScaffold } from "@shared";
import {
  getMapResourceVisualPreloadDescriptors,
  resolveMapResourceVisual,
  resolveMapResourceVisualTextureKey,
} from "./resourceVisualResolver";

const assetRoot = resolve("apps/game-client/public/assets/themes/default/resources/imjinrok");

test("resolves source-backed crop and tree frame-zero adaptations from the map-selected set", () => {
  const map = createImjinrokMapScaffold("imjinrok-k01");
  assert.ok(map);
  const registry = createContentRegistry();

  assert.deepEqual(resolveMapResourceVisual(registry, map, "rice", "active"), {
    url: "/assets/themes/default/resources/imjinrok/crop0_0000.png",
    frame: 0,
  });
  assert.deepEqual(resolveMapResourceVisual(registry, map, "bamboo", "active"), {
    url: "/assets/themes/default/resources/imjinrok/tree0_0000.png",
    frame: 0,
  });
  assert.equal(
    resolveMapResourceVisualTextureKey(registry, map, "rice", "active"),
    "resource-visual:imjinrok-source-resource-adaptation:rice:active",
  );
});

test("returns null for unmapped kinds and states, including depleted source adaptations", () => {
  const map = createImjinrokMapScaffold("imjinrok-k01");
  assert.ok(map);
  const registry = createContentRegistry();

  assert.equal(resolveMapResourceVisual(registry, map, "gold", "active"), null);
  assert.equal(resolveMapResourceVisual(registry, map, "rice", "depleted"), null);
  assert.equal(resolveMapResourceVisualTextureKey(registry, map, "rice", "depleted"), null);
});

test("fails loudly when a map does not select a registered resource visual set", () => {
  const registry = createContentRegistry();
  const map = createImjinrokMapScaffold("imjinrok-k01");
  assert.ok(map);

  map.resourceVisualSetId = "missing-resource-set";
  assert.throws(
    () => resolveMapResourceVisual(registry, map, "rice", "active"),
    /references unregistered resource visual set 'missing-resource-set'/,
  );
});

test("legacy maps without a resource visual set keep placeholder fallback behavior", () => {
  const registry = createContentRegistry();
  const map = createImjinrokMapScaffold("imjinrok-k01");
  assert.ok(map);
  delete map.resourceVisualSetId;

  assert.equal(resolveMapResourceVisual(registry, map, "rice", "active"), null);
  assert.equal(resolveMapResourceVisualTextureKey(registry, map, "rice", "active"), null);
  assert.deepEqual(getMapResourceVisualPreloadDescriptors(registry, map), []);
});

test("provides deterministic preload descriptors for mapped active frame-zero assets", () => {
  const map = createImjinrokMapScaffold("imjinrok-k01");
  assert.ok(map);
  const descriptors = getMapResourceVisualPreloadDescriptors(createContentRegistry(), map);

  assert.deepEqual(descriptors, [
    {
      textureKey: "resource-visual:imjinrok-source-resource-adaptation:bamboo:active",
      resourceKind: "bamboo",
      state: "active",
      url: "/assets/themes/default/resources/imjinrok/tree0_0000.png",
      frame: 0,
    },
    {
      textureKey: "resource-visual:imjinrok-source-resource-adaptation:potato:active",
      resourceKind: "potato",
      state: "active",
      url: "/assets/themes/default/resources/imjinrok/crop0_0000.png",
      frame: 0,
    },
    {
      textureKey: "resource-visual:imjinrok-source-resource-adaptation:rice:active",
      resourceKind: "rice",
      state: "active",
      url: "/assets/themes/default/resources/imjinrok/crop0_0000.png",
      frame: 0,
    },
    {
      textureKey: "resource-visual:imjinrok-source-resource-adaptation:tree:active",
      resourceKind: "tree",
      state: "active",
      url: "/assets/themes/default/resources/imjinrok/tree0_0000.png",
      frame: 0,
    },
  ]);
});

test("frame-zero exports retain their manifest identity and deterministic PNG hashes", () => {
  assertFrameZeroAsset("crop0", "fnt/crop0.spr", "8568c0d30ffbf9b10b0d20fb315213dbcb2b060f751fbd7da0b0529ea7fccde3");
  assertFrameZeroAsset("tree0", "fnt/tree0.spr", "a570071fbdd7ba2b989e23c1d978025d11cd7fb6f06ba8f87a781939732cecfc");
  assertFrameZeroAsset("resource", "fnt/resource.spr", "5cf8b3bedc3dddb7d20e8f35a176237085284c7d485059c1bb955354a0e5521f");
});

function assertFrameZeroAsset(stem: string, sourceSuffix: string, pngSha256: string): void {
  const manifest = JSON.parse(readFileSync(resolve(assetRoot, `${stem}.manifest.json`), "utf8")) as {
    source: string;
    exportedFrames: { index: number; fileName: string }[];
  };
  const png = readFileSync(resolve(assetRoot, `${stem}_0000.png`));

  assert.ok(manifest.source.endsWith(sourceSuffix));
  assert.deepEqual(manifest.exportedFrames, [{ index: 0, fileName: `${stem}_0000.png` }]);
  assert.equal(createHash("sha256").update(png).digest("hex"), pngSha256);
}
