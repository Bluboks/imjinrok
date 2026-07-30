#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { decodeSpriteFrame, encodeRgbaPng, indexedToRgba, parseSpriteLikeHeader, readPalette } from "./codec.mjs";
import { lookupFogNeighborMask, reproduceFogSubframeIndices } from "./extract-source-fog-render-evidence.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const defaultOriginalRoot = resolve(repositoryRoot, "original/imjinrok2");
const defaultEvidencePath = resolve(repositoryRoot, "analysis/fixtures/source-fog-render-evidence.json");
const defaultAssetDirectory = resolve(repositoryRoot, "apps/game-client/public/assets/themes/default/fog/normal/composites");
const defaultArtifactPath = resolve(repositoryRoot, "packages/shared/src/generated/k01SourceFogArtifact.ts");
const defaultManifestPath = resolve(defaultAssetDirectory, "source-fog-composites.manifest.json");

const COMPOSITE_WIDTH = 64;
const COMPOSITE_HEIGHT = 48;
const SELECTOR_DOMAIN = Array.from({ length: 14 }, (_value, index) => index);

/**
 * Exports 15 x 14 transparent 64x48 images. Each image is the byte-proven
 * outer-major/inner-minor sequence laid out as two 32px columns by three 16px
 * rows. The final alpha/visibility mapping and world placement stay product
 * adapters; this tool only fixes source resource/frame selection.
 */
export function exportSourceFogComposites(options = {}) {
  const originalRoot = options.originalRoot ?? defaultOriginalRoot;
  const evidencePath = options.evidencePath ?? defaultEvidencePath;
  const assetDirectory = options.assetDirectory ?? defaultAssetDirectory;
  const artifactPath = options.artifactPath ?? defaultArtifactPath;
  const manifestPath = options.manifestPath ?? defaultManifestPath;
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  const fogResources = evidence.resources?.fog;
  if (!Array.isArray(fogResources) || fogResources.length !== 15) {
    throw new Error("Source fog evidence requires exactly 15 fog family resources.");
  }
  const selectorDomain = evidence.frameSelection?.callerSelectorDomain;
  if (JSON.stringify(selectorDomain) !== JSON.stringify(SELECTOR_DOMAIN)) {
    throw new Error("Source fog evidence selector domain must be exactly 0..13.");
  }
  if (JSON.stringify(evidence.neighborLookup?.values) !== JSON.stringify(Array.from({ length: 16 }, (_value, mask) => lookupFogNeighborMask(mask)))) {
    throw new Error("Source fog evidence lookup table does not match the hash-bound extractor.");
  }

  const palette = readPalette(readFileSync(resolve(originalRoot, "pal/imjin2.pal")), "pal/imjin2.pal");
  mkdirSync(assetDirectory, { recursive: true });
  const assets = [];

  for (const resource of fogResources) {
    assertFamilyResource(resource);
    const sourcePath = resolve(originalRoot, "tile/normal", resource.fileName);
    const sourceBytes = readFileSync(sourcePath);
    assertEqual(sha256(sourceBytes), resource.sha256, `${resource.sourcePath} SHA-256`);
    const header = parseSpriteLikeHeader(sourceBytes, resource.sourcePath);
    assertEqual(JSON.stringify(pickHeader(header)), JSON.stringify(resource.header), `${resource.sourcePath} header`);

    for (const selector of SELECTOR_DOMAIN) {
      const frames = reproduceFogSubframeIndices(selector);
      const png = encodeRgbaPng(COMPOSITE_WIDTH, COMPOSITE_HEIGHT, composeFrames(sourceBytes, header, palette, frames));
      const fileName = `fog${resource.resourceIndex - 60}_selector${String(selector).padStart(2, "0")}.png`;
      writeFileSync(resolve(assetDirectory, fileName), png);
      assets.push({
        familyIndex: resource.resourceIndex - 60,
        selector,
        sourceFrameIndices: frames,
        fileName,
        sha256: sha256(png),
      });
    }
  }

  const k01 = exportK01FamilyArtifact(evidence, originalRoot, artifactPath);
  const manifest = {
    generatedBy: "tools/imjinrok/export-source-fog-composites.mjs",
    sourceEvidence: relative(repositoryRoot, evidencePath),
    imageGeometry: { width: COMPOSITE_WIDTH, height: COMPOSITE_HEIGHT, subframeGrid: { columns: 2, rows: 3 } },
    productRenderingAdapter: {
      note: "Source family/frame selection is static-backed. Product visibility-to-state mapping, alpha, scheduler, and world placement are adaptations, not original pixel parity.",
    },
    k01FamilyArtifact: "packages/shared/src/generated/k01SourceFogArtifact.ts",
    assets,
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { assetDirectory, artifactPath, manifestPath, assetCount: assets.length, manifest, k01 };
}

function composeFrames(sourceBytes, header, palette, frameIndices) {
  const rgba = Buffer.alloc(COMPOSITE_WIDTH * COMPOSITE_HEIGHT * 4);
  for (let outer = 0; outer < 3; outer += 1) {
    for (let inner = 0; inner < 2; inner += 1) {
      const frameIndex = frameIndices[outer * 2 + inner];
      if (frameIndex === undefined) throw new Error("Source fog frame vector must contain six subframes.");
      const frame = indexedToRgba(decodeSpriteFrame(sourceBytes, header, frameIndex), palette);
      for (let row = 0; row < header.height; row += 1) {
        const sourceOffset = row * header.width * 4;
        const targetOffset = ((outer * header.height + row) * COMPOSITE_WIDTH + inner * header.width) * 4;
        frame.copy(rgba, targetOffset, sourceOffset, sourceOffset + header.width * 4);
      }
    }
  }
  return rgba;
}

function exportK01FamilyArtifact(evidence, originalRoot, artifactPath) {
  const k01 = evidence.resources?.k01FamilyBytes;
  if (!k01 || k01.dimensions?.width !== 60 || k01.dimensions?.height !== 60 || k01.cellCount !== 3600) {
    throw new Error("Source fog evidence requires a 60x60 K01 family-byte stream.");
  }
  const map = readFileSync(resolve(originalRoot, "stagemap/k01.map"));
  const values = [];
  for (let x = 0; x < k01.dimensions.width; x += 1) {
    for (let y = 0; y < k01.dimensions.height; y += 1) values.push(map[0x4a0c4 + x * 180 + y]);
  }
  const bytes = Buffer.from(values);
  assertEqual(sha256(bytes), k01.valueStreamSha256, "K01 source fog family-byte digest");
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const distribution = [...counts.entries()]
    .sort(([left], [right]) => left - right)
    .map(([value, count]) => ({ value, count }));
  assertEqual(JSON.stringify(distribution), JSON.stringify(k01.distribution), "K01 source fog family-byte distribution");
  mkdirSync(dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, `// Generated by tools/imjinrok/export-source-fog-composites.mjs. Do not edit by hand.\n// Runtime data only; original files are never read by the web client.\nexport const K01_SOURCE_FOG_ARTIFACT = ${JSON.stringify({
    dimensions: k01.dimensions,
    cellCount: k01.cellCount,
    familyBytesSha256: k01.valueStreamSha256,
    familyBytesBase64: bytes.toString("base64"),
    distribution,
  }, null, 2)} as const;\n`);
  return { digest: k01.valueStreamSha256, distribution };
}

function assertFamilyResource(resource) {
  const familyIndex = resource.resourceIndex - 60;
  if (!Number.isInteger(familyIndex) || familyIndex < 0 || familyIndex > 14) {
    throw new Error(`Source fog resource index ${String(resource.resourceIndex)} is outside families 0..14.`);
  }
  if (resource.fileName !== `fog${familyIndex}.spr`) {
    throw new Error(`Source fog family ${familyIndex} has unexpected file ${String(resource.fileName)}.`);
  }
}

function pickHeader(header) {
  return { width: header.width, height: header.height, frameCount: header.frameCount, atlasWidth: 1024, atlasHeight: 48 };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} mismatch: expected ${expected}, received ${actual}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(exportSourceFogComposites(), null, 2));
}
