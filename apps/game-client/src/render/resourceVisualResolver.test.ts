import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { createContentRegistry, createImjinrokMapScaffold } from "@shared";
import {
  getRegisteredResourceVisualPreloadDescriptors,
  getMapResourceVisualPreloadDescriptors,
  requireResourceVisualTexture,
  resolveMapResourceVisual,
  resolveMapResourceVisualTextureKey,
  resolveResourceVisualPlacement,
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

test("preloads every registered resource visual deterministically before a launch map is known", () => {
  const registry = createContentRegistry();
  registry.resourceVisualSets["custom-visuals"] = {
    id: "custom-visuals",
    displayName: "Custom Visuals",
    resources: {
      berries: {
        states: {
          active: { url: "/assets/custom/berries-active.png", frame: 0 },
          depleted: { url: "/assets/custom/berries-depleted.png", frame: 1 },
        },
        evidenceStatus: "source-backed-adaptation",
      },
    },
    evidenceStatus: "source-backed-adaptation",
  };

  assert.deepEqual(
    getRegisteredResourceVisualPreloadDescriptors(registry).map((descriptor) => descriptor.textureKey),
    [
      "resource-visual:custom-visuals:berries:active",
      "resource-visual:custom-visuals:berries:depleted",
      "resource-visual:imjinrok-source-resource-adaptation:bamboo:active",
      "resource-visual:imjinrok-source-resource-adaptation:potato:active",
      "resource-visual:imjinrok-source-resource-adaptation:rice:active",
      "resource-visual:imjinrok-source-resource-adaptation:tree:active",
    ],
  );
});

test("uses a source-preserving project placement at the resource container ground contact", () => {
  assert.deepEqual(resolveResourceVisualPlacement(64, 32), {
    originX: 0.5,
    originY: 1,
    scale: 1,
    localX: 0,
    localY: 32 / 3,
  });
  assert.deepEqual(resolveResourceVisualPlacement(96, 48), {
    originX: 0.5,
    originY: 1,
    scale: 1.5,
    localX: 0,
    localY: 16,
  });
  assert.throws(() => resolveResourceVisualPlacement(0, 32), /positive finite/);
});

test("fails loudly when a selected resource visual texture was not preloaded", () => {
  assert.throws(
    () => requireResourceVisualTexture("resource-visual:custom-visuals:berries:active", () => false),
    /Required resource visual texture is not loaded/,
  );
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
