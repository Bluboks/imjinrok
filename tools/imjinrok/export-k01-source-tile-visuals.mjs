#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { decodeSpriteFrame, encodeRgbaPng, indexedToRgba, parseSpriteLikeHeader, readPalette } from "./codec.mjs";
import { extractK01SourceTileSelector } from "./extract-k01-source-tile-selector.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const defaultOriginalRoot = resolve(repositoryRoot, "original/imjinrok2");
const defaultAssetDirectory = resolve(repositoryRoot, "apps/game-client/public/assets/themes/default/terrain/imjinrok-normal");
const defaultArtifactPath = resolve(repositoryRoot, "packages/shared/src/generated/k01SourceTileVisualArtifact.ts");
const defaultSelectorFixturePath = resolve(repositoryRoot, "analysis/fixtures/k01-source-tile-selector.json");
const defaultManifestPath = resolve(defaultAssetDirectory, "k01-source-tiles.manifest.json");

/**
 * Exports only the source frames selected by K01's static object/frame stream.
 * The emitted TypeScript is browser-safe data: it never reads original files at
 * runtime. This product export uses a declared 64x48/32,16 placement adapter;
 * it does not assert original pixel pivot parity.
 */
export function exportK01SourceTileVisuals(options = {}) {
  const originalRoot = options.originalRoot ?? defaultOriginalRoot;
  const assetDirectory = options.assetDirectory ?? defaultAssetDirectory;
  const artifactPath = options.artifactPath ?? defaultArtifactPath;
  const selectorFixturePath = options.selectorFixturePath ?? defaultSelectorFixturePath;
  const manifestPath = options.manifestPath ?? resolve(assetDirectory, "k01-source-tiles.manifest.json");
  const selector = extractK01SourceTileSelector({ originalRoot });
  assertSelectorFixture(selectorFixturePath, selector);

  const pairBytes = Buffer.from(selector.pairStream.bytesBase64 ?? "", "base64");
  // The canonical selector fixture deliberately does not duplicate the stream;
  // recover it from its validated map bytes through the canonical extractor.
  const pairs = collectPairs(selector, originalRoot);
  const actualBytes = Buffer.from(pairs.flatMap((pair) => [pair.objectIndex, pair.frameIndex]));
  assertEqual(actualBytes.length, selector.pairStream.byteCount, "K01 selector pair byte count");
  assertEqual(sha256(actualBytes), selector.pairStream.sha256, "K01 selector pair digest");
  if (pairBytes.length !== 0) assertEqual(pairBytes.toString("hex"), actualBytes.toString("hex"), "K01 selector embedded pair stream");

  const sourcesByObject = new Map(selector.objects.map((source) => [source.objectIndex, source]));
  const selectedByStem = new Map();
  for (const pair of pairs) {
    const source = sourcesByObject.get(pair.objectIndex);
    if (!source) throw new Error(`K01 object ${pair.objectIndex} lacks a hash-bound source entry.`);
    const stem = source.fileName.replace(/\.ytl$/u, "");
    const frames = selectedByStem.get(stem) ?? new Set();
    frames.add(pair.frameIndex);
    selectedByStem.set(stem, frames);
  }

  mkdirSync(assetDirectory, { recursive: true });
  const palette = readPalette(readFileSync(resolve(originalRoot, "pal/imjin2.pal")), "pal/imjin2.pal");
  const emittedAssets = [];
  for (const source of [...selector.objects].sort((left, right) => left.objectIndex - right.objectIndex)) {
    const stem = source.fileName.replace(/\.ytl$/u, "");
    const selectedFrames = [...(selectedByStem.get(stem) ?? [])].sort((left, right) => left - right);
    if (selectedFrames.length === 0) continue;
    const sourceBuffer = readFileSync(resolve(originalRoot, source.sourcePath));
    assertEqual(sha256(sourceBuffer), source.sha256, `${source.sourcePath} SHA-256`);
    const header = parseSpriteLikeHeader(sourceBuffer, source.sourcePath);
    assertEqual(header.width, 64, `${source.sourcePath} width`);
    assertEqual(header.height, 48, `${source.sourcePath} height`);
    assertEqual(header.frameCount, source.frameCount, `${source.sourcePath} frame count`);

    for (const frame of selectedFrames) {
      const fileName = `${stem}_${String(frame).padStart(4, "0")}.png`;
      const png = encodeRgbaPng(header.width, header.height, indexedToRgba(decodeSpriteFrame(sourceBuffer, header, frame, { layout: "ytl" }), palette));
      writeFileSync(resolve(assetDirectory, fileName), png);
      emittedAssets.push({
        assetKey: createAssetKey(stem, frame),
        stem,
        frame,
        fileName,
        sha256: sha256(png),
        sourcePath: source.sourcePath,
        sourceSha256: source.sha256,
      });
    }
  }
  emittedAssets.sort((left, right) => left.assetKey.localeCompare(right.assetKey));
  assertEqual(emittedAssets.length, selector.pairStream.uniquePairCount, "K01 selected PNG count");

  const manifest = {
    generatedBy: "tools/imjinrok/export-k01-source-tile-visuals.mjs",
    sourceSelector: {
      fixture: relative(repositoryRoot, selectorFixturePath),
      mapSha256: selector.sources.map.sha256,
      executableSha256: selector.sources.executable.sha256,
      pairStreamSha256: selector.pairStream.sha256,
      coordinateOrder: selector.pairStream.coordinateOrder,
      dimensions: selector.pairStream.dimensions,
      cellCount: selector.pairStream.count,
      uniqueAssetCount: selector.pairStream.uniquePairCount,
    },
    productRenderingAdapter: {
      imageGeometry: { width: 64, height: 48, footprintAnchor: { x: 32, y: 16 } },
      note: "Map ground-contact placement is a product/mod rendering adapter, not proven original pixel pivot parity.",
    },
    assets: emittedAssets,
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  mkdirSync(dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, renderArtifact(selector, actualBytes, emittedAssets));

  return { assetDirectory, artifactPath, manifestPath, assetCount: emittedAssets.length, assetBytes: emittedAssets.reduce((total, asset) => total + readFileSync(resolve(assetDirectory, asset.fileName)).length, 0), manifest };
}

function collectPairs(selector, originalRoot) {
  const map = readFileSync(resolve(originalRoot, selector.sources.map.path.replace(/^original\/imjinrok2\//u, "")));
  const pairs = [];
  for (let x = 0; x < selector.map.width; x += 1) {
    for (let y = 0; y < selector.map.height; y += 1) {
      const offset = x * 180 + y;
      pairs.push({ objectIndex: map[0x3a3a4 + offset], frameIndex: map[0x42234 + offset] });
    }
  }
  return pairs;
}

function renderArtifact(selector, pairBytes, assets) {
  const objectStems = Object.fromEntries(selector.objects.map((source) => [source.objectIndex, source.fileName.replace(/\.ytl$/u, "")]));
  return `// Generated by tools/imjinrok/export-k01-source-tile-visuals.mjs. Do not edit by hand.\n// Runtime data only; original files are never read by the web client.\nexport const K01_SOURCE_TILE_VISUAL_ARTIFACT = ${JSON.stringify({
    dimensions: selector.pairStream.dimensions,
    pairCount: selector.pairStream.count,
    pairStreamSha256: selector.pairStream.sha256,
    pairBytesBase64: pairBytes.toString("base64"),
    objectStems,
    assets: assets.map(({ assetKey, stem, frame, fileName, sourcePath, sourceSha256 }) => ({ assetKey, stem, frame, fileName, sourcePath, sourceSha256 })),
  }, null, 2)} as const;\n`;
}

function assertSelectorFixture(path, selector) {
  const expected = JSON.parse(readFileSync(path, "utf8"));
  if (JSON.stringify(expected) !== JSON.stringify(selector)) {
    throw new Error(`K01 selector fixture does not match canonical hash-bound extractor output: ${path}`);
  }
}

function createAssetKey(stem, frame) {
  return `k01-source:${stem}:${String(frame).padStart(4, "0")}`;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  exportK01SourceTileVisuals();
}
