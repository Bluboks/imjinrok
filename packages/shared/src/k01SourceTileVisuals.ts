import { K01_SOURCE_TILE_VISUAL_ARTIFACT } from "./generated/k01SourceTileVisualArtifact.js";
import type { TileCell } from "./maps.js";

export const K01_SOURCE_TILE_VISUAL_DIMENSIONS = K01_SOURCE_TILE_VISUAL_ARTIFACT.dimensions;
export const K01_SOURCE_TILE_VISUAL_PAIR_DIGEST = K01_SOURCE_TILE_VISUAL_ARTIFACT.pairStreamSha256;
export const K01_SOURCE_TILE_VISUAL_PLACEMENT_OFFSET_DIGEST = K01_SOURCE_TILE_VISUAL_ARTIFACT.placementOffsetYStreamSha256;
export const K01_SOURCE_TILE_IMAGE_GEOMETRY = {
  width: 64,
  height: 48,
  footprintAnchor: { x: 32, y: 16 },
} as const;

export interface K01SourceTileVisualAsset {
  readonly assetKey: string;
  readonly stem: string;
  readonly frame: number;
  readonly fileName: string;
  readonly sourcePath: string;
  readonly sourceSha256: string;
}

const pairBytes = decodeBase64(K01_SOURCE_TILE_VISUAL_ARTIFACT.pairBytesBase64);
const placementOffsetYBytes = decodeBase64(K01_SOURCE_TILE_VISUAL_ARTIFACT.placementOffsetYBytesBase64);
const assets = K01_SOURCE_TILE_VISUAL_ARTIFACT.assets;
const assetKeyBySourcePair = new Map<string, string>(assets.map((asset) => [`${asset.stem}:${asset.frame}`, asset.assetKey]));
const stemByObjectIndex = new Map<number, string>(
  Object.entries(K01_SOURCE_TILE_VISUAL_ARTIFACT.objectStems).map(([objectIndex, stem]) => [Number(objectIndex), stem]),
);

assertK01SourceTileVisualArtifact();

/** Product/map adapter from original x-major bytes to the web map's row-major cells. */
export function getK01SourceTileFlatAssetKey(x: number, y: number): string {
  const { width, height } = K01_SOURCE_TILE_VISUAL_DIMENSIONS;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= width || y < 0 || y >= height) {
    throw new RangeError(`K01 source tile coordinates outside 0..${width - 1},0..${height - 1}: ${x},${y}`);
  }
  const offset = (x * height + y) * 2;
  const objectIndex = pairBytes[offset];
  const frameIndex = pairBytes[offset + 1];
  if (objectIndex === undefined || frameIndex === undefined) {
    throw new Error(`K01 source tile (${x},${y}) is outside the generated pair stream.`);
  }
  const stem = stemByObjectIndex.get(objectIndex);
  const assetKey = stem === undefined ? undefined : assetKeyBySourcePair.get(`${stem}:${frameIndex}`);
  if (!assetKey) {
    throw new Error(`K01 source tile (${x},${y}) has no registered flat visual for object ${objectIndex}, frame ${frameIndex}.`);
  }
  return assetKey;
}

/**
 * Source-backed product placement adaptation for the K01 second raw placement
 * argument. The original screen axis/pivot remains unresolved; the adapter
 * applies this asset-native y translation consistently to terrain and fog.
 */
export function getK01SourceTilePlacementOffset(x: number, y: number): { readonly x: 0; readonly y: 0 | -16 } {
  const { width, height } = K01_SOURCE_TILE_VISUAL_DIMENSIONS;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= width || y < 0 || y >= height) {
    throw new RangeError(`K01 source tile coordinates outside 0..${width - 1},0..${height - 1}: ${x},${y}`);
  }
  const encodedY = placementOffsetYBytes[x * height + y];
  if (encodedY === undefined) {
    throw new Error(`K01 source tile (${x},${y}) is outside the generated placement-offset stream.`);
  }
  const yOffset = encodedY > 0x7f ? encodedY - 0x100 : encodedY;
  if (yOffset !== 0 && yOffset !== -16) {
    throw new Error(`K01 source tile (${x},${y}) has unsupported placement offset ${yOffset}.`);
  }
  return { x: 0, y: yOffset };
}

export function getK01SourceTileVisualAssets(): readonly K01SourceTileVisualAsset[] {
  return assets;
}

export function applyK01SourceTileVisuals(tiles: TileCell[], width: number, height: number): void {
  if (width !== K01_SOURCE_TILE_VISUAL_DIMENSIONS.width || height !== K01_SOURCE_TILE_VISUAL_DIMENSIONS.height) {
    throw new Error(`K01 source tile visuals require ${K01_SOURCE_TILE_VISUAL_DIMENSIONS.width}x${K01_SOURCE_TILE_VISUAL_DIMENSIONS.height}; received ${width}x${height}.`);
  }
  if (tiles.length !== K01_SOURCE_TILE_VISUAL_ARTIFACT.pairCount) {
    throw new Error(`K01 source tile visuals require ${K01_SOURCE_TILE_VISUAL_ARTIFACT.pairCount} product tiles; received ${tiles.length}.`);
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const tileIndex = y * width + x;
      const tile = tiles[tileIndex];
      if (!tile) throw new Error(`K01 source tile visual is missing product tile ${x},${y}.`);
      tile.tilesetVisuals = {
        ...tile.tilesetVisuals,
        flatAssetKey: getK01SourceTileFlatAssetKey(x, y),
        sourcePixelOffset: getK01SourceTilePlacementOffset(x, y),
      };
    }
  }
}

export function assertK01SourceTileVisualArtifact(): void {
  const { width, height } = K01_SOURCE_TILE_VISUAL_DIMENSIONS;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error("K01 source tile visual artifact has invalid dimensions.");
  }
  if (K01_SOURCE_TILE_VISUAL_ARTIFACT.pairCount !== width * height || pairBytes.length !== K01_SOURCE_TILE_VISUAL_ARTIFACT.pairCount * 2) {
    throw new Error("K01 source tile visual artifact pair count does not match its dimensions.");
  }
  if (placementOffsetYBytes.length !== K01_SOURCE_TILE_VISUAL_ARTIFACT.pairCount) {
    throw new Error("K01 source tile visual artifact placement-offset count does not match its dimensions.");
  }
  if (!/^[a-f0-9]{64}$/u.test(K01_SOURCE_TILE_VISUAL_PAIR_DIGEST)) {
    throw new Error("K01 source tile visual artifact has an invalid pair-stream SHA-256 digest.");
  }
  if (!/^[a-f0-9]{64}$/u.test(K01_SOURCE_TILE_VISUAL_PLACEMENT_OFFSET_DIGEST)) {
    throw new Error("K01 source tile visual artifact has an invalid placement-offset SHA-256 digest.");
  }
  const offsetDistribution = K01_SOURCE_TILE_VISUAL_ARTIFACT.placementOffsetYDistribution;
  if (offsetDistribution.zero !== 2865 || offsetDistribution.negative16 !== 735) {
    throw new Error("K01 source tile visual artifact has an invalid placement-offset distribution.");
  }
  if (placementOffsetYBytes.filter((value) => value === 0).length !== offsetDistribution.zero
    || placementOffsetYBytes.filter((value) => value === 0xf0).length !== offsetDistribution.negative16) {
    throw new Error("K01 source tile visual artifact placement-offset bytes do not match their distribution.");
  }
  const uniqueAssetKeys = new Set(assets.map((asset) => asset.assetKey));
  if (assets.length !== uniqueAssetKeys.size || assets.length !== 243) {
    throw new Error(`K01 source tile visual artifact requires 243 unique assets; received ${assets.length}.`);
  }
}

function decodeBase64(value: string): Uint8Array {
  const decoded = globalThis.atob(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}
