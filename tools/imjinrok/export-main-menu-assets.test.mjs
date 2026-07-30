import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import test from "node:test";

import { exportMainMenuAssets } from "./export-main-menu-assets.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const committedAssetDirectory = resolve(repositoryRoot, "apps/game-client/public/assets/themes/default/ui/main-menu");
const sourceRoot = resolve(repositoryRoot, "original/imjinrok2");

test("exports the hash-bound main menu catalog deterministically and exactly matches committed PNGs", (t) => {
  const first = mkdtempSync(join(tmpdir(), "imjinrok-main-menu-a-"));
  const second = mkdtempSync(join(tmpdir(), "imjinrok-main-menu-b-"));
  t.after(() => rmSync(first, { recursive: true, force: true }));
  t.after(() => rmSync(second, { recursive: true, force: true }));

  const one = exportMainMenuAssets({ assetDirectory: join(first, "assets") });
  const two = exportMainMenuAssets({ assetDirectory: join(second, "assets") });

  assert.equal(one.assetCount, 61);
  assert.deepEqual(one.manifest, two.manifest);
  assert.deepEqual(one.manifest.palette, {
    sourcePath: "original/imjinrok2/pal/initmenu.pal",
    sha256: "c41e62408a8275e7a0c3e5402974beda50382ffcc382db94056db9e18291370d",
    byteLength: 768,
  });
  assert.ok(one.manifest.resources.every((resource) => resource.sourcePath.startsWith("original/imjinrok2/") && resource.sourceSha256.length === 64));
  assert.ok(one.manifest.resources.flatMap((resource) => resource.exportedFrames).every((frame) => frame.fileName.includes("/") && frame.sha256.length === 64));
  assert.deepEqual(one.manifest.resources.map((resource) => ({ id: resource.id, dimensions: [resource.dimensions.width, resource.dimensions.height], frameCount: resource.frameCount, exportedFrameCount: resource.exportedFrames.length })), [
    { id: "landing-title", dimensions: [640, 480], frameCount: 1, exportedFrameCount: 1 },
    { id: "menu-border", dimensions: [172, 310], frameCount: 1, exportedFrameCount: 1 },
    { id: "menu-button", dimensions: [144, 38], frameCount: 24, exportedFrameCount: 24 },
    { id: "nation-button", dimensions: [58, 30], frameCount: 9, exportedFrameCount: 9 },
    { id: "stage-border", dimensions: [320, 350], frameCount: 1, exportedFrameCount: 1 },
    { id: "stage-default", dimensions: [640, 480], frameCount: 1, exportedFrameCount: 1 },
    { id: "stage-korea", dimensions: [640, 480], frameCount: 1, exportedFrameCount: 1 },
    { id: "stage-japan", dimensions: [640, 480], frameCount: 1, exportedFrameCount: 1 },
    { id: "stage-china", dimensions: [640, 480], frameCount: 1, exportedFrameCount: 1 },
    { id: "stage-to-select", dimensions: [640, 480], frameCount: 1, exportedFrameCount: 1 },
    { id: "select-box", dimensions: [32, 32], frameCount: 20, exportedFrameCount: 20 },
  ]);

  assertEqualFileTrees(join(first, "assets"), join(second, "assets"));
  assertEqualFileTrees(join(first, "assets"), committedAssetDirectory);
});

test("rejects altered palette or menu sprite bytes before writing their output", (t) => {
  const alteredRoot = mkdtempSync(join(tmpdir(), "imjinrok-main-menu-source-"));
  const outputDirectory = mkdtempSync(join(tmpdir(), "imjinrok-main-menu-output-"));
  t.after(() => rmSync(alteredRoot, { recursive: true, force: true }));
  t.after(() => rmSync(outputDirectory, { recursive: true, force: true }));
  cpSync(sourceRoot, alteredRoot, { recursive: true });

  const alteredPalette = resolve(alteredRoot, "pal/initmenu.pal");
  const paletteBytes = readFileSync(alteredPalette);
  paletteBytes[0] ^= 0xff;
  writeFileSync(alteredPalette, paletteBytes);
  assert.throws(() => exportMainMenuAssets({ originalRoot: alteredRoot, assetDirectory: outputDirectory }), /pal\/initmenu\.pal SHA-256 mismatch/u);

  cpSync(sourceRoot, alteredRoot, { recursive: true, force: true });
  const alteredTitle = resolve(alteredRoot, "yfnt/title.spr");
  const titleBytes = readFileSync(alteredTitle);
  titleBytes[titleBytes.length - 1] ^= 0xff;
  writeFileSync(alteredTitle, titleBytes);
  assert.throws(() => exportMainMenuAssets({ originalRoot: alteredRoot, assetDirectory: outputDirectory }), /yfnt\/title\.spr SHA-256 mismatch/u);
});

function assertEqualFileTrees(left, right) {
  const leftFiles = listFiles(left);
  const rightFiles = listFiles(right);
  assert.deepEqual(leftFiles, rightFiles);
  for (const file of leftFiles) assert.deepEqual(readFileSync(resolve(left, file)), readFileSync(resolve(right, file)), file);
}

function listFiles(directory) {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(directory, resolve(entry.parentPath, entry.name)))
    .sort();
}
