#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const defaultArtifactPath = resolve(repositoryRoot, "packages/shared/src/generated/k01SourceTileVisualArtifact.ts");
const defaultAssetDirectory = resolve(repositoryRoot, "apps/game-client/public/assets/themes/default/terrain/imjinrok-normal");
const defaultManifestPath = resolve(defaultAssetDirectory, "k01-source-tiles.manifest.json");
const defaultOutputPath = resolve(repositoryRoot, "analysis/fixtures/k01-terrain-diagnostic.json");
const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;
const SOURCE_RASTER_TOP_PADDING = 200;

/**
 * Produces a coordinate-complete product diagnostic from the committed K01
 * source-tile export. The projection and full-raster y-then-x draw order are
 * statically recovered; broader source pivot and clipping semantics remain
 * deliberately unresolved.
 */
export function exportK01TerrainDiagnostic(options = {}) {
  const artifactPath = options.artifactPath ?? defaultArtifactPath;
  const assetDirectory = options.assetDirectory ?? defaultAssetDirectory;
  const manifestPath = options.manifestPath ?? resolve(assetDirectory, "k01-source-tiles.manifest.json");
  const outputPath = options.outputPath ?? defaultOutputPath;
  const artifact = readArtifact(artifactPath);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assertArtifactAndManifest(artifact, manifest);

  const pairBytes = Buffer.from(artifact.pairBytesBase64, "base64");
  const rawPlacementBytes = Buffer.from(artifact.placementOffsetYBytesBase64, "base64");
  const assetsByKey = new Map(manifest.assets.map((asset) => [asset.assetKey, asset]));
  const alphaByKey = new Map();
  const cells = [];

  for (let x = 0; x < artifact.dimensions.width; x += 1) {
    for (let y = 0; y < artifact.dimensions.height; y += 1) {
      const sourceOrdinal = x * artifact.dimensions.height + y;
      const productOrdinal = y * artifact.dimensions.width + x;
      const objectIndex = pairBytes[sourceOrdinal * 2];
      const frameIndex = pairBytes[sourceOrdinal * 2 + 1];
      const rawPlacementByte = rawPlacementBytes[sourceOrdinal];
      if (objectIndex === undefined || frameIndex === undefined || rawPlacementByte === undefined) {
        throw new Error(`K01 terrain diagnostic is missing source data for ${x},${y}.`);
      }
      const stem = artifact.objectStems[objectIndex];
      if (typeof stem !== "string") throw new Error(`K01 terrain diagnostic has no source stem for object ${objectIndex}.`);
      const assetKey = createAssetKey(stem, frameIndex);
      const asset = assetsByKey.get(assetKey);
      if (!asset) throw new Error(`K01 terrain diagnostic has no emitted PNG for ${x},${y} (${assetKey}).`);
      let alphaImage = alphaByKey.get(assetKey);
      if (!alphaImage) {
        alphaImage = readPngAlpha(resolve(assetDirectory, asset.fileName));
        alphaByKey.set(assetKey, alphaImage);
      }

      const rawPlacement = resolveRawPlacement(rawPlacementByte, x, y);
      cells.push({
        coordinate: { x, y },
        sourceOrdinal,
        productOrdinal,
        sourcePair: { objectIndex, frameIndex, stem, assetKey },
        rawPlacement,
        projectedGroundPoint: {
          x: (x - y) * (TILE_WIDTH / 2) + artifact.dimensions.width * (TILE_WIDTH / 2),
          y: (x + y) * (TILE_HEIGHT / 2) + SOURCE_RASTER_TOP_PADDING,
        },
        rasterDraw: {
          left: (x - y) * (TILE_WIDTH / 2) + artifact.dimensions.width * (TILE_WIDTH / 2) - TILE_WIDTH / 2,
          top: (x + y) * (TILE_HEIGHT / 2) + SOURCE_RASTER_TOP_PADDING - rawPlacement.argumentDeltaMagnitude,
          width: TILE_WIDTH,
          height: 48,
        },
        pngAlpha: alphaImage.measurement,
      });
    }
  }

  const report = {
    generatedBy: "tools/imjinrok/export-k01-terrain-diagnostic.mjs",
    evidenceStatus: {
      sourcePair: "static-proven; hash-bound K01 x-major object/frame stream",
      rawPlacement: "static-proven FUN_00469510 raw second-argument adjustment and drawTop subtraction",
      projectedGroundPoint: "static-proven FUN_00466f20 base projection and source-raster origin; broader original pixel pivot remains unconfirmed",
      pngAlpha: "deterministic measurement of emitted PNG alpha and the statically recovered y-major/x-major full-raster composition",
      originalRendererParity: "unconfirmed",
    },
    coordinateOrder: {
      source: "x-major: sourceOrdinal = x * height + y",
      product: "row-major: productOrdinal = y * width + x",
    },
    dimensions: artifact.dimensions,
    sourceRaster: {
      width: artifact.dimensions.width * TILE_WIDTH,
      height: artifact.dimensions.height * TILE_HEIGHT + SOURCE_RASTER_TOP_PADDING,
      drawOrder: "y-major then x-major",
      coverage: measureSourceRasterCoverage(cells, alphaByKey),
    },
    cellCount: cells.length,
    sourcePairStreamSha256: artifact.pairStreamSha256,
    rawPlacementStreamSha256: artifact.placementOffsetYStreamSha256,
    cellRecordsSha256: sha256(JSON.stringify(cells)),
    cells,
  };
  if (outputPath !== null) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

function readArtifact(path) {
  const source = readFileSync(path, "utf8");
  const match = source.match(/= (\{[\s\S]*\}) as const;\n$/u);
  if (!match) throw new Error(`K01 source tile artifact does not contain JSON runtime data: ${path}`);
  return JSON.parse(match[1]);
}

function assertArtifactAndManifest(artifact, manifest) {
  const { width, height } = artifact.dimensions ?? {};
  if (width !== 60 || height !== 60 || artifact.pairCount !== width * height) {
    throw new Error("K01 terrain diagnostic requires the 60x60 source-tile artifact.");
  }
  if (typeof artifact.pairBytesBase64 !== "string" || typeof artifact.placementOffsetYBytesBase64 !== "string") {
    throw new Error("K01 terrain diagnostic artifact is missing encoded source streams.");
  }
  const pairBytes = Buffer.from(artifact.pairBytesBase64, "base64");
  const rawPlacementBytes = Buffer.from(artifact.placementOffsetYBytesBase64, "base64");
  if (pairBytes.length !== artifact.pairCount * 2 || rawPlacementBytes.length !== artifact.pairCount) {
    throw new Error("K01 terrain diagnostic artifact stream lengths do not match its dimensions.");
  }
  if (sha256(pairBytes) !== artifact.pairStreamSha256 || sha256(rawPlacementBytes) !== artifact.placementOffsetYStreamSha256) {
    throw new Error("K01 terrain diagnostic artifact stream digest mismatch.");
  }
  if (manifest.sourceSelector?.pairStreamSha256 !== artifact.pairStreamSha256 || manifest.sourceSelector?.cellCount !== artifact.pairCount) {
    throw new Error("K01 terrain diagnostic manifest does not match the source-tile artifact.");
  }
  if (!Array.isArray(manifest.assets) || manifest.assets.length !== 243) {
    throw new Error("K01 terrain diagnostic requires the complete 243-frame emitted source catalog.");
  }
}

function resolveRawPlacement(byte, x, y) {
  if (byte === 0) {
    return { encodedByte: 0, argumentDeltaMagnitude: 0, argumentAdjustment: 0, productElevationLevel: 0 };
  }
  if (byte === 0xf0) {
    return { encodedByte: 0xf0, argumentDeltaMagnitude: 16, argumentAdjustment: -16, productElevationLevel: 1 };
  }
  throw new Error(`K01 terrain diagnostic has unsupported raw placement byte 0x${byte.toString(16).padStart(2, "0")} at ${x},${y}.`);
}

function readPngAlpha(path) {
  const png = readFileSync(path);
  assertPng(png, path);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const raw = inflateSync(Buffer.concat(readIdatChunks(png, path)));
  const rowLength = width * 4 + 1;
  if (raw.length !== height * rowLength) throw new Error(`${path} has an unexpected RGBA scanline length.`);

  let nonTransparentPixelCount = 0;
  let footprintCoveredPixelCount = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let footprintPixelCount = 0;
  for (let y = 0; y < height; y += 1) {
    if (raw[y * rowLength] !== 0) throw new Error(`${path} must use PNG filter 0 for deterministic K01 alpha diagnostics.`);
    for (let x = 0; x < width; x += 1) {
      const alpha = raw[y * rowLength + 1 + x * 4 + 3];
      const withinFootprint = isWithinLogicalDiamond(x, y);
      if (withinFootprint) footprintPixelCount += 1;
      if (alpha === 0) continue;
      nonTransparentPixelCount += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      if (withinFootprint) footprintCoveredPixelCount += 1;
    }
  }
  if (maxX < 0 || maxY < 0) throw new Error(`${path} has no non-transparent pixels.`);
  return {
    width,
    height,
    alpha: extractAlphaBytes(raw, width, height),
    measurement: {
      bounds: { left: minX, top: minY, rightExclusive: maxX + 1, bottomExclusive: maxY + 1 },
      nonTransparentPixelCount,
      logicalFootprint: {
        pixelCount: footprintPixelCount,
        coveredPixelCount: footprintCoveredPixelCount,
        uncoveredPixelCount: footprintPixelCount - footprintCoveredPixelCount,
      },
    },
  };
}

function extractAlphaBytes(raw, width, height) {
  const rowLength = width * 4 + 1;
  const alpha = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) alpha[y * width + x] = raw[y * rowLength + 1 + x * 4 + 3];
  }
  return alpha;
}

function measureSourceRasterCoverage(cells, alphaByKey) {
  const width = 60 * TILE_WIDTH;
  const height = 60 * TILE_HEIGHT + SOURCE_RASTER_TOP_PADDING;
  const sourceAlpha = new Uint8Array(width * height);
  const terrainDomain = new Uint8Array(width * height);
  for (const cell of cells) {
    const alphaImage = alphaByKey.get(cell.sourcePair.assetKey);
    if (!alphaImage) throw new Error(`K01 terrain diagnostic has no alpha image for ${cell.sourcePair.assetKey}.`);
    compositeAlpha(sourceAlpha, width, height, alphaImage, cell.rasterDraw.left, cell.rasterDraw.top);
    fillLogicalDiamond(
      terrainDomain,
      width,
      height,
      cell.projectedGroundPoint.x,
      cell.projectedGroundPoint.y - cell.rawPlacement.argumentDeltaMagnitude,
    );
  }

  let terrainDomainPixelCount = 0;
  let uncoveredPixelCount = 0;
  let outerBoundaryTransparentPixelCount = 0;
  let internalHolePixelCount = 0;
  let holeLeft = width;
  let holeTop = height;
  let holeRight = -1;
  let holeBottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (terrainDomain[index] !== 1) continue;
      terrainDomainPixelCount += 1;
      if (sourceAlpha[index] !== 0) continue;
      uncoveredPixelCount += 1;
      if (isTerrainDomainBoundary(terrainDomain, width, height, x, y)) {
        outerBoundaryTransparentPixelCount += 1;
        continue;
      }
      internalHolePixelCount += 1;
      holeLeft = Math.min(holeLeft, x);
      holeTop = Math.min(holeTop, y);
      holeRight = Math.max(holeRight, x);
      holeBottom = Math.max(holeBottom, y);
    }
  }
  return {
    terrainDomainPixelCount,
    uncoveredPixelCount,
    outerBoundaryTransparentPixelCount,
    internalHolePixelCount,
    internalHoleBounds: internalHolePixelCount === 0
      ? null
      : { left: holeLeft, top: holeTop, rightExclusive: holeRight + 1, bottomExclusive: holeBottom + 1 },
  };
}

function compositeAlpha(target, targetWidth, targetHeight, image, left, top) {
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.alpha[y * image.width + x] === 0) continue;
      const targetX = left + x;
      const targetY = top + y;
      if (targetX >= 0 && targetX < targetWidth && targetY >= 0 && targetY < targetHeight) {
        target[targetY * targetWidth + targetX] = 1;
      }
    }
  }
}

function fillLogicalDiamond(target, width, height, centerX, topY) {
  for (let y = 0; y < TILE_HEIGHT; y += 1) {
    for (let x = 0; x < TILE_WIDTH; x += 1) {
      if (!isWithinLogicalDiamond(x, y)) continue;
      const targetX = centerX - TILE_WIDTH / 2 + x;
      const targetY = topY + y;
      if (targetX >= 0 && targetX < width && targetY >= 0 && targetY < height) target[targetY * width + targetX] = 1;
    }
  }
}

function isTerrainDomainBoundary(domain, width, height, x, y) {
  for (const [offsetX, offsetY] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const neighborX = x + offsetX;
    const neighborY = y + offsetY;
    if (neighborX < 0 || neighborX >= width || neighborY < 0 || neighborY >= height || domain[neighborY * width + neighborX] === 0) {
      return true;
    }
  }
  return false;
}

function assertPng(png, path) {
  if (!png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    throw new Error(`${path} must be a PNG.`);
  }
  if (png[24] !== 8 || png[25] !== 6) throw new Error(`${path} must be an 8-bit RGBA PNG.`);
}

function readIdatChunks(png, path) {
  const chunks = [];
  for (let offset = 8; offset < png.length;) {
    if (offset + 12 > png.length) throw new Error(`${path} has a truncated PNG chunk.`);
    const length = png.readUInt32BE(offset);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > png.length) throw new Error(`${path} has a truncated PNG chunk payload.`);
    if (png.toString("ascii", offset + 4, offset + 8) === "IDAT") chunks.push(png.subarray(dataStart, dataEnd));
    offset = dataEnd + 4;
  }
  if (chunks.length === 0) throw new Error(`${path} has no PNG IDAT data.`);
  return chunks;
}

function isWithinLogicalDiamond(x, y) {
  return Math.abs(x + 0.5 - TILE_WIDTH / 2) / (TILE_WIDTH / 2)
    + Math.abs(y + 0.5 - TILE_HEIGHT / 2) / (TILE_HEIGHT / 2) <= 1;
}

function createAssetKey(stem, frame) {
  return `k01-source:${stem}:${String(frame).padStart(4, "0")}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === "--out" && value) {
      options.outputPath = resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown or incomplete argument: ${argument}`);
  }
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  exportK01TerrainDiagnostic(parseArguments(process.argv.slice(2)));
}
