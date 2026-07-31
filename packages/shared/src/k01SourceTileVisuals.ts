import { K01_SOURCE_TILE_VISUAL_ARTIFACT } from "./generated/k01SourceTileVisualArtifact.js";
import type { TileCell } from "./maps.js";

export const K01_SOURCE_TILE_VISUAL_DIMENSIONS = K01_SOURCE_TILE_VISUAL_ARTIFACT.dimensions;
export const K01_SOURCE_TILE_VISUAL_PAIR_DIGEST = K01_SOURCE_TILE_VISUAL_ARTIFACT.pairStreamSha256;
export const K01_SOURCE_TILE_VISUAL_PLACEMENT_OFFSET_DIGEST = K01_SOURCE_TILE_VISUAL_ARTIFACT.placementOffsetYStreamSha256;
export const K01_SOURCE_TILE_IMAGE_GEOMETRY = {
  width: 64,
  height: 48,
  footprintAnchor: { x: 32, y: 0 },
} as const;
/**
 * Hash-bound K01 `FUN_00464cc0` output-Y additions; see
 * `docs/reverse-engineering/mechanics/k01-cell-projection-output-tables.md`.
 * They are source projection values, not a recovered terrain-height or
 * image-pivot meaning.
 */
export const K01_SOURCE_CELL_PROJECTION_OUTPUT_Y_ADDITIONS = {
  base: 16,
  raised: 9,
} as const;
/**
 * Product ground-contact adaptation derived from K01's `+16` versus `+9`
 * per-cell output-Y additions. The source artwork still uses its independent
 * raw raster `0/16` branch through `sourcePixelOffset`.
 */
export const K01_SOURCE_RELATIVE_CELL_PROJECTION_LIFT_PX =
  K01_SOURCE_CELL_PROJECTION_OUTPUT_Y_ADDITIONS.base - K01_SOURCE_CELL_PROJECTION_OUTPUT_Y_ADDITIONS.raised;
/** Product-only alpha-coverage fallback; not an original draw-layer claim. */
export const K01_SOURCE_TILE_UNDERLAY_ASSET_KEY = "k01-source:grss1:0000";

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
 * The hash-bound second raw placement-argument delta. This is retained as
 * source evidence, rather than being named as a web screen-axis adjustment.
 */
export function getK01SourceTileRawPlacementArgumentDelta(x: number, y: number): 0 | 16 {
  const { width, height } = K01_SOURCE_TILE_VISUAL_DIMENSIONS;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= width || y < 0 || y >= height) {
    throw new RangeError(`K01 source tile coordinates outside 0..${width - 1},0..${height - 1}: ${x},${y}`);
  }
  const encodedY = placementOffsetYBytes[x * height + y];
  if (encodedY === undefined) {
    throw new Error(`K01 source tile (${x},${y}) is outside the generated placement-offset stream.`);
  }
  const rawDelta = encodedY > 0x7f ? -(encodedY - 0x100) : encodedY;
  if (rawDelta !== 0 && rawDelta !== 16) {
    throw new Error(`K01 source tile (${x},${y}) has unsupported raw placement delta ${rawDelta}.`);
  }
  return rawDelta;
}

/**
 * The recovered full-map raster draws selected 64x48 frames from a top-edge
 * anchor. Its bounded raw second-argument adjustment is retained as the
 * source-image y offset; broader original pivot/clip behavior is unresolved.
 */
export function getK01SourceTilePlacementOffset(x: number, y: number): { readonly x: 0; readonly y: 0 | -16 } {
  return { x: 0, y: getK01SourceTileRawPlacementArgumentDelta(x, y) === 16 ? -16 : 0 };
}

export function getK01SourceTileVisualAssets(): readonly K01SourceTileVisualAsset[] {
  return assets;
}

export function getK01SourceTileUnderlayAssetKey(x: number, y: number): string {
  getK01SourceTileFlatAssetKey(x, y);
  return K01_SOURCE_TILE_UNDERLAY_ASSET_KEY;
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
        underlayAssetKey: getK01SourceTileUnderlayAssetKey(x, y),
        sourcePixelOffset: getK01SourceTilePlacementOffset(x, y),
        flatArtworkEmbedsRelief: true,
      };
      // Product adaptation, not a claim that the source helper's human meaning
      // is fully recovered: the hash-bound 0/16 stream becomes base/raised.
      tile.elevation = getK01SourceTileRawPlacementArgumentDelta(x, y) === 16 ? 1 : 0;
    }
  }
}

export function assertK01SourceTileVisualArtifact(): void {
  if (K01_SOURCE_CELL_PROJECTION_OUTPUT_Y_ADDITIONS.base !== 16
    || K01_SOURCE_CELL_PROJECTION_OUTPUT_Y_ADDITIONS.raised !== 9
    || K01_SOURCE_RELATIVE_CELL_PROJECTION_LIFT_PX !== 7) {
    throw new Error("K01 source cell-projection lift must remain the proven 16 minus 9 pixel difference.");
  }
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
  if (!uniqueAssetKeys.has(K01_SOURCE_TILE_UNDERLAY_ASSET_KEY)) {
    throw new Error(`K01 source tile visual artifact is missing underlay asset '${K01_SOURCE_TILE_UNDERLAY_ASSET_KEY}'.`);
  }
}

function decodeBase64(value: string): Uint8Array {
  const decoded = globalThis.atob(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}
