import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { inflateSync } from "node:zlib";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const artifactPath = resolve(repositoryRoot, "packages/shared/src/generated/k01SourceTileVisualArtifact.ts");
const assetDirectory = resolve(repositoryRoot, "apps/game-client/public/assets/themes/default/terrain/imjinrok-normal");
const manifestPath = resolve(assetDirectory, "k01-source-tiles.manifest.json");
const tileWidth = 64;
const tileHeight = 32;
const sourceHeight = 48;

test("K01 source-raster final composition keeps mixed placement-level boundaries on their selected surfaces", (t) => {
  const artifact = readArtifact();
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const assetByPair = new Map(manifest.assets.map((asset) => [`${asset.stem}:${asset.frame}`, asset]));
  const assetByKey = new Map(manifest.assets.map((asset) => [asset.assetKey, asset]));
  const alphaByPair = new Map();

  for (const asset of manifest.assets) {
    alphaByPair.set(`${asset.stem}:${asset.frame}`, readPngAlpha(resolve(assetDirectory, asset.fileName)));
  }
  const underlayAsset = assetByKey.get("k01-source:grss1:0000");
  assert.ok(underlayAsset);
  const underlayAlpha = alphaByPair.get(`${underlayAsset.stem}:${underlayAsset.frame}`);
  assert.ok(underlayAlpha);
  const selectedOffsetY = (x, y) => rawDeltaY(artifact, x, y);
  const sourceRaster = measureComposition(artifact, assetByPair, alphaByPair, null, selectedOffsetY, null);
  const adaptedRaster = measureComposition(artifact, assetByPair, alphaByPair, underlayAlpha, selectedOffsetY, selectedOffsetY);
  const rawAnchorUnderlayRaster = measureComposition(artifact, assetByPair, alphaByPair, underlayAlpha, selectedOffsetY, () => 0);

  assert.equal(manifest.productRenderingAdapter?.imageGeometry?.footprintAnchor?.y, 0);
  assert.equal(sourceRaster.rawDeltaCellCount, 735);
  assert.equal(sourceRaster.mixedRawDeltaNeighborCount, 798);
  assert.equal(sourceRaster.uncoveredFootprintPixels, 74771, "selected source frames retain measured alpha gaps in the corrected logical diamond coverage probe");
  assert.equal(adaptedRaster.uncoveredFootprintPixels, 0, "the explicit source-art coverage pass must cover every corrected K01 terrain-domain pixel");
  assert.equal(adaptedRaster.mixedBoundaryFootprintPixels, 965632);
  assert.equal(adaptedRaster.mixedBoundaryUncoveredFootprintPixels, 0, "final source-raster composition must leave no hole at a mixed placement-level boundary");
  assert.equal(rawAnchorUnderlayRaster.uncoveredFootprintPixels, 5139, "a raw-anchor coverage pass leaves holes outside the selected alpha footprint");
  assert.equal(rawAnchorUnderlayRaster.mixedBoundaryUncoveredFootprintPixels, 4430, "a raw-anchor coverage pass leaves holes at mixed placement-level boundaries");
  assert.equal(adaptedRaster.topmostDrawDigest, "df44797cc4fa1786240f33fbb7ec79534033baa53bd1789ede4e8b751cb259cb", "the two-pass product compositor must retain its global selected-frame order");
  assert.notEqual(adaptedRaster.topmostDrawDigest, rawAnchorUnderlayRaster.topmostDrawDigest, "the final compositor output mask must distinguish aligned coverage from a raw-anchor underlay");

  t.diagnostic(JSON.stringify({
    sourceRaster: summarizeCoverage(sourceRaster),
    adaptedRaster: summarizeCoverage(adaptedRaster),
    rawAnchorUnderlayRaster: summarizeCoverage(rawAnchorUnderlayRaster),
  }));
});

function readArtifact() {
  const source = readFileSync(artifactPath, "utf8");
  const match = source.match(/= (\{[\s\S]*\}) as const;\n$/u);
  assert.ok(match, "K01 source tile artifact must contain JSON runtime data");
  return JSON.parse(match[1]);
}

function measureComposition(artifact, assetByPair, alphaByPair, underlayAlpha, selectedOffsetYForCell, underlayOffsetYForCell) {
  const { width, height } = artifact.dimensions;
  const pairBytes = Buffer.from(artifact.pairBytesBase64, "base64");
  const canvas = createCanvas(width, height);
  const sourceAlpha = new Uint8Array(canvas.width * canvas.height);
  const coverageAlpha = new Uint8Array(canvas.width * canvas.height);
  const footprint = new Uint8Array(canvas.width * canvas.height);
  const mixedBoundaryFootprint = new Uint8Array(canvas.width * canvas.height);
  const topmostDraw = new Uint16Array(canvas.width * canvas.height);
  let rawDeltaCellCount = 0;
  let mixedRawDeltaNeighborCount = 0;

  if (underlayAlpha && underlayOffsetYForCell) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const center = cellCenter(canvas, x, y);
        compositeAlpha(coverageAlpha, canvas, underlayAlpha, center.x - 32, center.y + underlayOffsetYForCell(x, y), topmostDraw, 1);
      }
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pairOffset = (x * height + y) * 2;
      const stem = artifact.objectStems[pairBytes[pairOffset]];
      const frame = pairBytes[pairOffset + 1];
      const asset = assetByPair.get(`${stem}:${frame}`);
      assert.ok(asset, `K01 map cell ${x},${y} must select an emitted source PNG`);
      const alpha = alphaByPair.get(`${stem}:${frame}`);
      assert.ok(alpha, `K01 map cell ${x},${y} must have an emitted PNG alpha mask`);
      const offsetY = selectedOffsetYForCell(x, y);
      if (offsetY !== 0) rawDeltaCellCount += 1;
      const center = cellCenter(canvas, x, y);
      compositeAlpha(sourceAlpha, canvas, alpha, center.x - 32, center.y + offsetY, topmostDraw, y * width + x + 2);
      fillDiamond(footprint, canvas, center, offsetY);

      for (const neighbor of [{ x: x + 1, y }, { x, y: y + 1 }]) {
        if (neighbor.x < width && neighbor.y < height && offsetY !== selectedOffsetYForCell(neighbor.x, neighbor.y)) {
          mixedRawDeltaNeighborCount += 1;
          fillDiamond(mixedBoundaryFootprint, canvas, center, offsetY);
          const neighborCenter = cellCenter(canvas, neighbor.x, neighbor.y);
          fillDiamond(mixedBoundaryFootprint, canvas, neighborCenter, selectedOffsetYForCell(neighbor.x, neighbor.y));
        }
      }
    }
  }

  let footprintPixels = 0;
  let uncoveredFootprintPixels = 0;
  let mixedBoundaryFootprintPixels = 0;
  let mixedBoundaryUncoveredFootprintPixels = 0;
  for (let index = 0; index < footprint.length; index += 1) {
    const uncovered = sourceAlpha[index] === 0 && coverageAlpha[index] === 0;
    if (footprint[index] === 1) {
      footprintPixels += 1;
      if (uncovered) uncoveredFootprintPixels += 1;
    }
    if (mixedBoundaryFootprint[index] === 1) {
      mixedBoundaryFootprintPixels += 1;
      if (uncovered) mixedBoundaryUncoveredFootprintPixels += 1;
    }
  }

  return {
    rawDeltaCellCount,
    mixedRawDeltaNeighborCount,
    footprintPixels,
    uncoveredFootprintPixels,
    mixedBoundaryFootprintPixels,
    mixedBoundaryUncoveredFootprintPixels,
    topmostDrawDigest: hashTopmostDraw(topmostDraw),
  };
}

function rawDeltaY(artifact, x, y) {
  return artifact.placementOffsetYBytesBase64
    ? (Buffer.from(artifact.placementOffsetYBytesBase64, "base64")[x * artifact.dimensions.height + y] === 0xf0 ? -16 : 0)
    : 0;
}

function createCanvas(width, height) {
  return {
    width: width * tileWidth + tileWidth,
    height: height * tileHeight + sourceHeight * 2,
    origin: { x: width * tileWidth / 2, y: sourceHeight },
  };
}

function cellCenter(canvas, x, y) {
  return { x: canvas.origin.x + (x - y) * (tileWidth / 2), y: canvas.origin.y + (x + y) * (tileHeight / 2) };
}

function compositeAlpha(target, canvas, alpha, left, top, topmostDraw, drawId) {
  for (let y = 0; y < alpha.height; y += 1) {
    for (let x = 0; x < alpha.width; x += 1) {
      if (alpha.bytes[y * alpha.width + x] === 0) continue;
      const targetX = left + x;
      const targetY = top + y;
      if (targetX >= 0 && targetX < canvas.width && targetY >= 0 && targetY < canvas.height) {
        const index = targetY * canvas.width + targetX;
        target[index] = 1;
        if (topmostDraw && drawId !== undefined) topmostDraw[index] = drawId;
      }
    }
  }
}

function fillDiamond(target, canvas, center, offsetY) {
  const left = center.x - tileWidth / 2;
  const top = center.y + offsetY;
  for (let y = 0; y < tileHeight; y += 1) {
    for (let x = 0; x < tileWidth; x += 1) {
      if (Math.abs(x + 0.5 - tileWidth / 2) / (tileWidth / 2) + Math.abs(y + 0.5 - tileHeight / 2) / (tileHeight / 2) > 1) continue;
      target[(top + y) * canvas.width + left + x] = 1;
    }
  }
}

function readPngAlpha(path) {
  const png = readFileSync(path);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], `${path} must be a PNG`);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  assert.equal(png[24], 8, `${path} must retain 8-bit source PNG depth`);
  assert.equal(png[25], 6, `${path} must retain RGBA source PNG alpha`);
  const idat = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") idat.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const rowLength = width * 4 + 1;
  assert.equal(raw.length, height * rowLength, `${path} has unexpected RGBA scanline length`);
  const bytes = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    assert.equal(raw[y * rowLength], 0, `${path} must use exporter filter 0 for reproducible alpha coverage`);
    for (let x = 0; x < width; x += 1) bytes[y * width + x] = raw[y * rowLength + 1 + x * 4 + 3];
  }
  return { width, height, bytes };
}

function summarizeCoverage(result) {
  return {
    rawDeltaCellCount: result.rawDeltaCellCount,
    mixedRawDeltaNeighborCount: result.mixedRawDeltaNeighborCount,
    footprintPixels: result.footprintPixels,
    uncoveredFootprintPixels: result.uncoveredFootprintPixels,
    mixedBoundaryFootprintPixels: result.mixedBoundaryFootprintPixels,
    mixedBoundaryUncoveredFootprintPixels: result.mixedBoundaryUncoveredFootprintPixels,
    topmostDrawDigest: result.topmostDrawDigest,
  };
}

function hashTopmostDraw(topmostDraw) {
  const bytes = Buffer.allocUnsafe(topmostDraw.length * 2);
  for (let index = 0; index < topmostDraw.length; index += 1) {
    bytes.writeUInt16LE(topmostDraw[index], index * 2);
  }
  return createHash("sha256").update(bytes).digest("hex");
}
