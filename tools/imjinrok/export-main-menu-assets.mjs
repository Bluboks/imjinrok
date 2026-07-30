#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { decodeSpriteFrame, encodeRgbaPng, indexedToRgba, parseSpriteLikeHeader, readPalette } from "./codec.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const defaultOriginalRoot = resolve(repositoryRoot, "original/imjinrok2");
const defaultAssetDirectory = resolve(repositoryRoot, "apps/game-client/public/assets/themes/default/ui/main-menu");

const PALETTES = [
  palette("initmenu", "pal/initmenu.pal", "c41e62408a8275e7a0c3e5402974beda50382ffcc382db94056db9e18291370d"),
  palette("imjin2", "pal/imjin2.pal", "5ba2c020e9bd89210a10550fb4baaee8ab8bb316d4a2c7e66bdb24c6c8c4323b"),
];

const RESOURCES = [
  resource("landing-title", "initmenu", "yfnt/title.spr", "title", [0], "9cacc8892982dbe02047898530c5f44c5fba4b6115f9774fb690c9a0a763d03f", 640, 480, 1),
  resource("menu-border", "initmenu", "yfnt/gamemenuborder.spr", "game-menu-border", [0], "48f60d170a8305fbfc2a08d41b3de96bf19dfe99d9d3460996037df41ed6a8ed", 172, 310, 1),
  resource("menu-button", "initmenu", "yfnt/gamemenubutton.spr", "game-menu-buttons", allFrames(24), "ec73af9d1d5c739a8fd40fa9436a77fc92eb13f5ebb99a745d1279244129c387", 144, 38, 24),
  resource("nation-button", "imjin2", "yfnt/NationButtons.spr", "nation-buttons", allFrames(9), "98304a61e4d8bd4017e7da6763e4194c4d55422a4891c5cf534ab5dd6c362885", 58, 30, 9),
  resource("stage-border", "imjin2", "yfnt/selectstageborder.spr", "stage-border", [0], "d3776a9766b8cc437c261c488adbd09f968be4502f3074c7cd8cf4c0363ebad9", 320, 350, 1),
  resource("stage-default", "imjin2", "yfnt/titlestartstage.spr", "stage/title", [0], "d457f6409dab0697b5434f49315a3bed3b552278b42619fc3719ed355e1ed1ba", 640, 480, 1),
  resource("stage-korea", "imjin2", "yfnt/titlestartstagekorea.spr", "stage/korea", [0], "65e6758ccf575925b9b20b346a786eeeae39fcc9bd8a96d2ec4c6c0916909c53", 640, 480, 1),
  resource("stage-japan", "imjin2", "yfnt/titlestartstagejapan.spr", "stage/japan", [0], "29f202d78c67df2515643c38fc2608a27b5530ec4611380127acac456540bd45", 640, 480, 1),
  resource("stage-china", "imjin2", "yfnt/titlestartstagechina.spr", "stage/china", [0], "f570f95741097955a1fbdc7cff48682588043d00aa18d816cb82b0cc7e96311c", 640, 480, 1),
  resource("stage-to-select", "imjin2", "yfnt/titlestartstagetoselect.spr", "stage/to-select", [0], "98f0b6f38e7fc341f7a869fb4488c852d394093a2bc455c11a74ce843fa404ca", 640, 480, 1),
  resource("select-box", "imjin2", "fnt/selectbox.spr", "stage/select-box", allFrames(20), "fe066fb527354f848876507d9da36cae1769f3676fe4554328b705a47c5ef0cd", 32, 32, 20),
];

/**
 * Converts original main-menu resources with their statically selected palette.
 * Resource ids describe export groups only; frame meaning remains source frame
 * index until a separately evidenced UI binding consumes it.
 */
export function exportMainMenuAssets(options = {}) {
  const originalRoot = options.originalRoot ?? defaultOriginalRoot;
  const assetDirectory = options.assetDirectory ?? defaultAssetDirectory;
  const manifestPath = options.manifestPath ?? resolve(assetDirectory, "main-menu.manifest.json");
  const palettes = new Map(PALETTES.map((definition) => [definition.id, readVerifiedPalette(originalRoot, definition)]));
  const exportedResources = [];

  for (const definition of RESOURCES) {
    const palette = palettes.get(definition.paletteId);
    if (!palette) throw new Error(`Unknown palette '${definition.paletteId}' for ${definition.id}`);
    const sourceBytes = readFileSync(resolve(originalRoot, definition.sourcePath));
    assertEqual(sha256(sourceBytes), definition.sha256, `${definition.sourcePath} SHA-256`);
    const header = parseSpriteLikeHeader(sourceBytes, definition.sourcePath);
    assertEqual(JSON.stringify(headerShape(header)), JSON.stringify(definition.header), `${definition.sourcePath} header`);
    const directory = resolve(assetDirectory, definition.directory);
    mkdirSync(directory, { recursive: true });
    const exportedFrames = definition.frames.map((index) => {
      const fileName = `${definition.stem}_${String(index).padStart(4, "0")}.png`;
      const png = encodeRgbaPng(header.width, header.height, indexedToRgba(decodeSpriteFrame(sourceBytes, header, index), palette));
      writeFileSync(resolve(directory, fileName), png);
      return { index, fileName: `${definition.directory}/${fileName}`, sha256: sha256(png) };
    });
    exportedResources.push({
      id: definition.id,
      paletteId: definition.paletteId,
      sourcePath: `original/imjinrok2/${definition.sourcePath}`,
      sourceSha256: definition.sha256,
      layout: "spr",
      dimensions: { width: definition.header.width, height: definition.header.height },
      frameCount: definition.header.frameCount,
      exportedFrames,
    });
  }
  const manifest = {
    generatedBy: "tools/imjinrok/export-main-menu-assets.mjs",
    palettes: PALETTES.map(({ id, sourcePath, sha256: digest, byteLength }) => ({ id, sourcePath: `original/imjinrok2/${sourcePath}`, sha256: digest, byteLength })),
    resources: exportedResources,
  };
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { assetDirectory, manifestPath, manifest, assetCount: exportedResources.reduce((count, resource) => count + resource.exportedFrames.length, 0) };
}

function palette(id, sourcePath, digest) {
  return { id, sourcePath, sha256: digest, byteLength: 768 };
}

function resource(id, paletteId, sourcePath, directory, frames, sha256Value, width, height, frameCount) {
  return {
    id,
    paletteId,
    sourcePath,
    directory,
    frames,
    stem: sourcePath.split("/").at(-1).replace(/\.spr$/u, ""),
    sha256: sha256Value,
    header: { width, height, frameCount },
  };
}

function readVerifiedPalette(originalRoot, definition) {
  const bytes = readFileSync(resolve(originalRoot, definition.sourcePath));
  assertEqual(bytes.length, definition.byteLength, `${definition.sourcePath} byte length`);
  assertEqual(sha256(bytes), definition.sha256, `${definition.sourcePath} SHA-256`);
  return readPalette(bytes, definition.sourcePath);
}

function allFrames(frameCount) {
  return Array.from({ length: frameCount }, (_value, index) => index);
}

function headerShape(header) {
  return { width: header.width, height: header.height, frameCount: header.frameCount };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} mismatch: expected ${expected}, received ${actual}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(exportMainMenuAssets(), null, 2));
}
