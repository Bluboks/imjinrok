import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { createContentRegistry, createImjinrokMapScaffold } from "@shared";
import {
  createSourcePaletteOverlayAdapter,
  getRegisteredEnvironmentPalettePreloadDescriptors,
  resolveSelectedEnvironmentPalette,
} from "./environmentPaletteVisualResolver.js";

const sourceBytes = Array.from({ length: 768 }, (_value, index) => index % 64);

test("K01 resolves its selected source palette stage from the profile", () => {
  const map = createImjinrokMapScaffold("imjinrok-k01");
  assert.ok(map);
  const descriptor = resolveSelectedEnvironmentPalette(createContentRegistry(), map, { visualPaletteId: "night3" });

  assert.deepEqual(descriptor && [descriptor.profileId, descriptor.paletteId, descriptor.frame, descriptor.cacheKey], [
    "imjinrok-source-day-night-palette",
    "night3",
    2,
    "environment-palette:imjinrok-source-day-night-palette:night3",
  ]);
});

test("palette manifests produce deterministic source-backed overlay adapter values", () => {
  const descriptor = resolveSelectedEnvironmentPalette(createContentRegistry(), createImjinrokMapScaffold("imjinrok-k01")!, { visualPaletteId: "night1" });
  assert.ok(descriptor);
  const manifest = {
    source: "pal/night1.pal",
    sha256: descriptor.sourceSha256,
    byteLength: 768,
    rgb6: sourceBytes,
    evidenceStatus: "source-backed-adaptation" as const,
  };

  assert.deepEqual(createSourcePaletteOverlayAdapter(descriptor, manifest), createSourcePaletteOverlayAdapter(descriptor, manifest));
  assert.throws(
    () => createSourcePaletteOverlayAdapter(descriptor, { ...manifest, rgb6: [] }),
    /exactly 768 source bytes/,
  );
  assert.throws(
    () => createSourcePaletteOverlayAdapter(descriptor, { ...manifest, sha256: "stale" }),
    /SHA-256 does not match/,
  );
});

test("generated palette manifests retain each selected source hash and consumable bytes", () => {
  const profile = createContentRegistry().environmentVisualProfiles["imjinrok-source-day-night-palette"];
  assert.ok(profile);

  for (const asset of profile.paletteAssets ?? []) {
    const fileName = asset.url.split("/").at(-1);
    assert.ok(fileName);
    const manifest = JSON.parse(readFileSync(resolve("apps/game-client/public/assets/themes/default/environment/imjinrok-night", fileName), "utf8"));
    assert.equal(manifest.sha256, asset.sourceSha256, asset.id);
    assert.equal(manifest.byteLength, 768, asset.id);
    assert.equal(manifest.rgb6.length, 768, asset.id);
    assert.equal(createSourcePaletteOverlayAdapter({ ...asset, profileId: profile.id, paletteId: asset.id, cacheKey: "test" }, manifest).evidenceStatus, "source-backed-adaptation");
  }
});

test("registered palette manifests are deterministically preloaded and duplicate resources fail", () => {
  const registry = createContentRegistry();
  assert.deepEqual(
    getRegisteredEnvironmentPalettePreloadDescriptors(registry).map((descriptor) => descriptor.cacheKey),
    [
      "environment-palette:imjinrok-source-day-night-palette:night1",
      "environment-palette:imjinrok-source-day-night-palette:night2",
      "environment-palette:imjinrok-source-day-night-palette:night3",
      "environment-palette:imjinrok-source-day-night-palette:night4",
    ],
  );

  const map = createImjinrokMapScaffold("imjinrok-k01");
  assert.ok(map);
  assert.throws(
    () => resolveSelectedEnvironmentPalette(registry, map, { visualPaletteId: "missing" }),
    /has no palette 'missing'/,
  );
});
