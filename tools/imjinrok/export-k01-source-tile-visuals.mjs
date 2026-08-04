#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { decodeSpriteFrame, encodeRgbaPng, indexedToRgba, parseSpriteLikeHeader, readPalette } from "./codec.mjs";
import { extractK01TilePlacementElevationEvidence } from "./extract-k01-tile-placement-elevation-evidence.mjs";
import { extractK01SourceTileSelector } from "./extract-k01-source-tile-selector.mjs";
import { extractK01MapDataProtocol, validateProtocolArtifact } from "./map-data-protocol.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const defaultOriginalRoot = resolve(repositoryRoot, "original/imjinrok2");
const defaultAssetDirectory = resolve(repositoryRoot, "apps/game-client/public/assets/themes/default/terrain/imjinrok-normal");
const defaultArtifactPath = resolve(repositoryRoot, "packages/shared/src/generated/k01SourceTileVisualArtifact.ts");
const defaultSelectorFixturePath = resolve(repositoryRoot, "analysis/fixtures/k01-source-tile-selector.json");
const defaultPlacementEvidenceFixturePath = resolve(repositoryRoot, "analysis/fixtures/k01-tile-placement-elevation-evidence.json");
const defaultManifestPath = resolve(defaultAssetDirectory, "k01-source-tiles.manifest.json");
const defaultProtocolPath = resolve(repositoryRoot, "analysis/generated/k01-map-data-protocol.json");

/**
 * Exports only the source frames selected by K01's static object/frame stream.
 * The emitted TypeScript is browser-safe data: it never reads original files at
 * runtime. This product export uses a declared 64x48/32,0 placement adapter;
 * it does not assert original pixel pivot parity.
 */
export function exportK01SourceTileVisuals(options = {}) {
  const originalRoot = options.originalRoot ?? defaultOriginalRoot;
  const assetDirectory = options.assetDirectory ?? defaultAssetDirectory;
  const artifactPath = options.artifactPath ?? defaultArtifactPath;
  const selectorFixturePath = options.selectorFixturePath ?? defaultSelectorFixturePath;
  const placementEvidenceFixturePath = options.placementEvidenceFixturePath ?? defaultPlacementEvidenceFixturePath;
  const protocolPath = options.protocolPath ?? defaultProtocolPath;
  const manifestPath = options.manifestPath ?? resolve(assetDirectory, "k01-source-tiles.manifest.json");
  const protocol = extractK01MapDataProtocol({ originalRoot });
  const expectedProtocol = JSON.parse(readFileSync(protocolPath, "utf8"));
  validateProtocolArtifact(expectedProtocol);
  if (JSON.stringify(expectedProtocol) !== JSON.stringify(protocol)) throw new Error(`K01 map-data protocol artifact drift: ${protocolPath}`);
  const selector = extractK01SourceTileSelector({ originalRoot });
  assertSelectorFixture(selectorFixturePath, selector);
  const placementEvidence = extractK01TilePlacementElevationEvidence({ originalRoot });
  assertPlacementEvidenceFixture(placementEvidenceFixturePath, placementEvidence);

  const pairBytes = decodeProtocolPairBytes(protocol);
  const pairs = collectPairs(protocol);
  const placementOffsetYBytes = collectPlacementOffsetYBytes(protocol, placementEvidence);
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
    protocol: {
      fixture: relative(repositoryRoot, protocolPath),
      version: protocol.protocolVersion,
      profileId: protocol.profileId,
      mapSha256: protocol.sources.map.sha256,
    },
    productRenderingAdapter: {
      imageGeometry: { width: 64, height: 48, footprintAnchor: { x: 32, y: 0 } },
      rawPlacementArgumentDelta: {
        source: "FUN_00469330/FUN_00469510 K01 second raw placement argument adjustment. Its screen/world axis and pixel pivot are unresolved.",
        values: { zero: 2865, positive16: 735 },
      },
      webPlacement: {
        sourceRasterClearColor: "0x000000",
        choice: "native-exact mode retains selected source frames over an opaque black clear; the product adaptation may opt into one map-level canonical grss1 frame 0 coverage pass replayed for every cell before selected frames, using each selected frame's source placement offset.",
        basis: "The bounded compositor contract replays each selected YTL payload verbatim after clearing every output region to palette entry 0 (RGB 0,0,0); the source offset stream remains independent placement metadata.",
        evidenceStatus: "native source fact plus explicit product adaptation (의도적 적응)",
      },
      note: "The bounded draw rectangle establishes this top-edge placement adapter only. Original pixel pivot, clipping/mode behavior outside the bounded main raster, and full renderer parity remain unconfirmed.",
    },
    assets: emittedAssets,
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  mkdirSync(dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, renderArtifact(selector, actualBytes, placementOffsetYBytes, emittedAssets));

  return { assetDirectory, artifactPath, manifestPath, assetCount: emittedAssets.length, assetBytes: emittedAssets.reduce((total, asset) => total + readFileSync(resolve(assetDirectory, asset.fileName)).length, 0), manifest };
}

function decodeProtocolPairBytes(protocol) {
  const objectBytes = Buffer.from(protocol.channels.objectIndex.valuesBase64, "base64");
  const frameBytes = Buffer.from(protocol.channels.frameIndex.valuesBase64, "base64");
  const bytes = Buffer.alloc(objectBytes.length * 2);
  for (let index = 0; index < objectBytes.length; index += 1) {
    bytes[index * 2] = objectBytes[index];
    bytes[index * 2 + 1] = frameBytes[index];
  }
  return bytes;
}

function collectPairs(protocol) {
  const objectBytes = Buffer.from(protocol.channels.objectIndex.valuesBase64, "base64");
  const frameBytes = Buffer.from(protocol.channels.frameIndex.valuesBase64, "base64");
  const pairs = [];
  for (let x = 0; x < protocol.dimensions.width; x += 1) {
    for (let y = 0; y < protocol.dimensions.height; y += 1) {
      const offset = x * protocol.dimensions.height + y;
      pairs.push({ objectIndex: objectBytes[offset], frameIndex: frameBytes[offset] });
    }
  }
  return pairs;
}

function collectPlacementOffsetYBytes(protocol, placementEvidence) {
  const rawShiftBytes = Buffer.from(protocol.channels.rawRasterVerticalShift.valuesBase64, "base64");
  const bytes = Buffer.from(rawShiftBytes);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = bytes[index] === 16 ? 0xf0 : bytes[index];
  const zero = bytes.filter((value) => value === 0).length;
  const negative16 = bytes.filter((value) => value === 0xf0).length;
  assertEqual(zero, placementEvidence.placement.lowNibbleBranch.K01Distribution.verticalShift[0], "K01 placement zero-offset count");
  assertEqual(negative16, placementEvidence.placement.lowNibbleBranch.K01Distribution.verticalShift[16], "K01 placement negative-16-offset count");
  if (zero + negative16 !== bytes.length) throw new Error("K01 placement offset stream contains an unsupported value.");
  return bytes;
}

function renderArtifact(selector, pairBytes, placementOffsetYBytes, assets) {
  const objectStems = Object.fromEntries(selector.objects.map((source) => [source.objectIndex, source.fileName.replace(/\.ytl$/u, "")]));
  return `// Generated by tools/imjinrok/export-k01-source-tile-visuals.mjs. Do not edit by hand.\n// Runtime data only; original files are never read by the web client.\nexport const K01_SOURCE_TILE_VISUAL_ARTIFACT = ${JSON.stringify({
    dimensions: selector.pairStream.dimensions,
    pairCount: selector.pairStream.count,
    pairStreamSha256: selector.pairStream.sha256,
    pairBytesBase64: pairBytes.toString("base64"),
    placementOffsetYStreamSha256: sha256(placementOffsetYBytes),
    placementOffsetYBytesBase64: placementOffsetYBytes.toString("base64"),
    placementOffsetYDistribution: {
      zero: placementOffsetYBytes.filter((value) => value === 0).length,
      negative16: placementOffsetYBytes.filter((value) => value === 0xf0).length,
    },
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

function assertPlacementEvidenceFixture(path, evidence) {
  const expected = JSON.parse(readFileSync(path, "utf8"));
  if (JSON.stringify(expected) !== JSON.stringify(evidence)) {
    throw new Error(`K01 placement evidence fixture does not match canonical hash-bound extractor output: ${path}`);
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
