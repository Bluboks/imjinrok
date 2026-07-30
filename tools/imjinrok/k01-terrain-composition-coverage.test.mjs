import assert from "node:assert/strict";
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

test("K01 emitted source PNG alpha requires a footprint underlay and rejects the raw delta as a web y axis", (t) => {
  const artifact = readArtifact();
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const assetByPair = new Map(manifest.assets.map((asset) => [`${asset.stem}:${asset.frame}`, asset]));
  const alphaByPair = new Map();

  for (const asset of manifest.assets) {
    alphaByPair.set(`${asset.stem}:${asset.frame}`, readPngAlpha(resolve(assetDirectory, asset.fileName)));
  }

  const legacy = measureCoverage(artifact, assetByPair, alphaByPair, (x, y) => rawDeltaY(artifact, x, y));
  const product = measureCoverage(artifact, assetByPair, alphaByPair, () => 0);

  // The exact raw stream has 735 delta-bearing cells. Treating those cells as
  // web-y translations introduces a discontinuity at every mixed low-nibble
  // neighbor boundary, while the ground-contact adapter has none.
  assert.equal(legacy.rawDeltaCellCount, 735);
  assert.equal(legacy.mixedRawDeltaNeighborCount, 798);
  assert.equal(product.mixedRawDeltaNeighborCount, 0);
  assert.equal(legacy.uncoveredFootprintPixels, 153600, "source PNG alpha alone must expose logical terrain holes");
  assert.equal(product.uncoveredFootprintPixels, 161043, "a neutral web placement does not make alpha-bearing source frames opaque");
  assert.equal(product.uncoveredFootprintPixelsWithUnderlay, 0, "terrain footprint underlay must cover every logical K01 diamond pixel");

  t.diagnostic(JSON.stringify({
    legacy: summarizeCoverage(legacy),
    product: summarizeCoverage(product),
  }));
});

function readArtifact() {
  const source = readFileSync(artifactPath, "utf8");
  const match = source.match(/= (\{[\s\S]*\}) as const;\n$/u);
  assert.ok(match, "K01 source tile artifact must contain JSON runtime data");
  return JSON.parse(match[1]);
}

function measureCoverage(artifact, assetByPair, alphaByPair, offsetYForCell) {
  const { width, height } = artifact.dimensions;
  const pairBytes = Buffer.from(artifact.pairBytesBase64, "base64");
  const canvas = createCanvas(width, height);
  const sourceAlpha = new Uint8Array(canvas.width * canvas.height);
  const footprint = new Uint8Array(canvas.width * canvas.height);
  const terrainUnderlay = new Uint8Array(canvas.width * canvas.height);
  let rawDeltaCellCount = 0;
  let mixedRawDeltaNeighborCount = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pairOffset = (x * height + y) * 2;
      const stem = artifact.objectStems[pairBytes[pairOffset]];
      const frame = pairBytes[pairOffset + 1];
      const asset = assetByPair.get(`${stem}:${frame}`);
      assert.ok(asset, `K01 map cell ${x},${y} must select an emitted source PNG`);
      const alpha = alphaByPair.get(`${stem}:${frame}`);
      assert.ok(alpha, `K01 map cell ${x},${y} must have an emitted PNG alpha mask`);
      const offsetY = offsetYForCell(x, y);
      if (offsetY !== 0) rawDeltaCellCount += 1;
      compositeAlpha(sourceAlpha, canvas, alpha, cellCenter(canvas, x, y).x - 32, cellCenter(canvas, x, y).y - 16 + offsetY);
      fillDiamond(footprint, canvas, cellCenter(canvas, x, y));
      fillDiamond(terrainUnderlay, canvas, cellCenter(canvas, x, y));

      for (const neighbor of [{ x: x + 1, y }, { x, y: y + 1 }]) {
        if (neighbor.x < width && neighbor.y < height && offsetY !== offsetYForCell(neighbor.x, neighbor.y)) {
          mixedRawDeltaNeighborCount += 1;
        }
      }
    }
  }

  let footprintPixels = 0;
  let uncoveredFootprintPixels = 0;
  let uncoveredFootprintPixelsWithUnderlay = 0;
  for (let index = 0; index < footprint.length; index += 1) {
    if (footprint[index] !== 1) continue;
    footprintPixels += 1;
    if (sourceAlpha[index] === 0) uncoveredFootprintPixels += 1;
    if (terrainUnderlay[index] === 0) uncoveredFootprintPixelsWithUnderlay += 1;
  }

  return {
    rawDeltaCellCount,
    mixedRawDeltaNeighborCount,
    footprintPixels,
    uncoveredFootprintPixels,
    uncoveredFootprintPixelsWithUnderlay,
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

function compositeAlpha(target, canvas, alpha, left, top) {
  for (let y = 0; y < alpha.height; y += 1) {
    for (let x = 0; x < alpha.width; x += 1) {
      if (alpha.bytes[y * alpha.width + x] === 0) continue;
      const targetX = left + x;
      const targetY = top + y;
      if (targetX >= 0 && targetX < canvas.width && targetY >= 0 && targetY < canvas.height) {
        target[targetY * canvas.width + targetX] = 1;
      }
    }
  }
}

function fillDiamond(target, canvas, center) {
  const left = center.x - tileWidth / 2;
  const top = center.y - tileHeight / 2;
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
  };
}
