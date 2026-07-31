#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { decodeSpriteFrame, encodeRgbaPng, indexedToRgba, parseSpriteLikeHeader, readPalette } from "./codec.mjs";
import { extractSourceClockAsset } from "./extract-source-clock-asset.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DEFAULT_ASSET_DIRECTORY = resolve(repositoryRoot, "apps/game-client/public/assets/themes/default/ui/source-clock");
const DEFAULT_FIXTURE_PATH = resolve(repositoryRoot, "analysis/fixtures/source-clock-asset.json");

/**
 * Exports every source frame without selecting one for runtime use. The source
 * identity is retained for future analysis; the responsive web clock is drawn
 * from the simulation environment and does not claim these frames' meanings.
 */
export function exportSourceClockAssets({
  assetDirectory = DEFAULT_ASSET_DIRECTORY,
  fixturePath = DEFAULT_FIXTURE_PATH,
} = {}) {
  const evidence = extractSourceClockAsset();
  const expected = JSON.parse(readFileSync(fixturePath, "utf8"));
  if (JSON.stringify(evidence) !== JSON.stringify(expected)) {
    throw new Error(`Source-clock evidence fixture is stale: ${fixturePath}`);
  }
  const sprite = readFileSync(resolve(repositoryRoot, evidence.source.clockSprite.path));
  const palette = readPalette(readFileSync(resolve(repositoryRoot, "original/imjinrok2/pal/imjin2.pal")), "pal/imjin2.pal");
  const header = parseSpriteLikeHeader(sprite, evidence.source.clockSprite.path);
  mkdirSync(assetDirectory, { recursive: true });
  const assets = header.frames.map((frame) => {
    const fileName = `clock_${String(frame.index).padStart(4, "0")}.png`;
    const png = encodeRgbaPng(header.width, header.height, indexedToRgba(decodeSpriteFrame(sprite, header, frame.index), palette));
    writeFileSync(resolve(assetDirectory, fileName), png);
    return { frameIndex: frame.index, fileName, sha256: sha256(png) };
  });
  const manifest = {
    generatedBy: "tools/imjinrok/export-source-clock-assets.mjs",
    sourceClockEvidenceFixture: "analysis/fixtures/source-clock-asset.json",
    source: evidence.source,
    assetMappingStatus: "unverified-no-runtime-frame-binding",
    productBoundary: "These exports are intentionally not loaded by the web HUD clock until a complete original draw/frame mapping is statically confirmed and reproduced.",
    assets,
  };
  writeFileSync(resolve(assetDirectory, "clock.manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  exportSourceClockAssets();
}
