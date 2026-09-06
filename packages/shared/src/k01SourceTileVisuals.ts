import { K01_SOURCE_TILE_VISUAL_ARTIFACT } from "./generated/k01SourceTileVisualArtifact.js";
import { getK01MapProtocolChannel } from "./mapDataProtocol.js";
import type { TileCell } from "./maps.js";

export const K01_SOURCE_TILE_VISUAL_DIMENSIONS = K01_SOURCE_TILE_VISUAL_ARTIFACT.dimensions;
export const K01_SOURCE_TILE_VISUAL_PAIR_DIGEST = K01_SOURCE_TILE_VISUAL_ARTIFACT.pairStreamSha256;
export const K01_SOURCE_TILE_VISUAL_PLACEMENT_OFFSET_DIGEST = K01_SOURCE_TILE_VISUAL_ARTIFACT.placementOffsetYStreamSha256;
export const K01_SOURCE_TILE_IMAGE_GEOMETRY = {
  width: 64,
  height: 48,
  footprintAnchor: { x: 32, y: 0 },
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
type K01SourceTileRawPlacementMagnitude = 0 | 16 | 32 | 48 | 64;
type K01SourceTilePlacementOffsetY = 0 | -16 | -32 | -48 | -64;
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
export function getK01SourceTileRawPlacementArgumentDelta(x: number, y: number): K01SourceTileRawPlacementMagnitude {
  const { width, height } = K01_SOURCE_TILE_VISUAL_DIMENSIONS;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= width || y < 0 || y >= height) {
    throw new RangeError(`K01 source tile coordinates outside 0..${width - 1},0..${height - 1}: ${x},${y}`);
  }
  const encodedY = placementOffsetYBytes[x * height + y];
  if (encodedY === undefined) {
    throw new Error(`K01 source tile (${x},${y}) is outside the generated placement-offset stream.`);
  }
  return decodeRawPlacementMagnitude(encodedY, x, y);
}

/**
 * The recovered full-map raster draws selected 64x48 frames from a top-edge
 * anchor. Its bounded raw second-argument adjustment is retained as the
 * source-image y offset; broader original pivot/clip behavior is unresolved.
 */
export function getK01SourceTilePlacementOffset(x: number, y: number): { readonly x: 0; readonly y: K01SourceTilePlacementOffsetY } {
  const rawDelta = getK01SourceTileRawPlacementArgumentDelta(x, y);
  const offsetY = toPlacementOffsetY(rawDelta);
  return { x: 0, y: offsetY };
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
      const rawShift = getK01SourceTileRawPlacementArgumentDelta(x, y);
      tile.tilesetVisuals = {
        ...tile.tilesetVisuals,
        flatAssetKey: getK01SourceTileFlatAssetKey(x, y),
        sourcePixelOffset: getK01SourceTilePlacementOffset(x, y),
        sourceRawRasterVerticalShiftPx: rawShift,
        flatArtworkEmbedsRelief: true,
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
  const expectedDistribution = { zero: 1331, negative16: 617, negative32: 1335, negative48: 128, negative64: 189 } as const;
  for (const [key, expectedCount] of Object.entries(expectedDistribution)) {
    if (offsetDistribution[key as keyof typeof expectedDistribution] !== expectedCount) {
      throw new Error("K01 source tile visual artifact has an invalid placement-offset distribution.");
    }
  }
  const expectedOffsetBytes = { zero: 0, negative16: 0xf0, negative32: 0xe0, negative48: 0xd0, negative64: 0xc0 } as const;
  for (const [key, byte] of Object.entries(expectedOffsetBytes)) {
    if (placementOffsetYBytes.filter((value) => value === byte).length !== offsetDistribution[key as keyof typeof offsetDistribution]) {
      throw new Error("K01 source tile visual artifact placement-offset bytes do not match their distribution.");
    }
  }
  const protocolObjectBytes = getK01MapProtocolChannel("objectIndex");
  const protocolFrameBytes = getK01MapProtocolChannel("frameIndex");
  const protocolShiftBytes = getK01MapProtocolChannel("rawRasterVerticalShift");
  if (protocolObjectBytes.length !== width * height || protocolFrameBytes.length !== width * height || protocolShiftBytes.length !== width * height) {
    throw new Error("K01 source tile visual artifact protocol streams do not match the map dimensions.");
  }
  for (let index = 0; index < width * height; index += 1) {
    if (pairBytes[index * 2] !== protocolObjectBytes[index] || pairBytes[index * 2 + 1] !== protocolFrameBytes[index]) {
      throw new Error(`K01 source tile visual artifact diverges from map protocol at ordinal ${index}.`);
    }
    const rawShift = protocolShiftBytes[index];
    if (rawShift === undefined) throw new Error(`K01 source tile protocol is missing raw shift at ordinal ${index}.`);
    const expectedEncodedShift = encodeRawPlacementMagnitude(rawShift, index);
    if (placementOffsetYBytes[index] !== expectedEncodedShift) throw new Error(`K01 source tile placement shift diverges from map protocol at ordinal ${index}.`);
  }
  const uniqueAssetKeys = new Set(assets.map((asset) => asset.assetKey));
  if (assets.length !== uniqueAssetKeys.size || assets.length !== 243) {
    throw new Error(`K01 source tile visual artifact requires 243 unique assets; received ${assets.length}.`);
  }
}

function decodeRawPlacementMagnitude(encodedByte: number, x: number, y: number): K01SourceTileRawPlacementMagnitude {
  const rawDelta = encodedByte === 0 ? 0 : 0x100 - encodedByte;
  switch (rawDelta) {
    case 0:
    case 16:
    case 32:
    case 48:
    case 64:
      return rawDelta;
    default:
      throw new Error(`K01 source tile (${x},${y}) has unsupported raw placement delta ${rawDelta}.`);
  }
}

function encodeRawPlacementMagnitude(rawShift: number, index: number): number {
  switch (rawShift) {
    case 0:
    case 16:
    case 32:
    case 48:
    case 64:
      return rawShift === 0 ? 0 : 0x100 - rawShift;
    default:
      throw new Error(`K01 source tile protocol has unsupported raw shift ${rawShift} at ordinal ${index}.`);
  }
}

function toPlacementOffsetY(rawDelta: K01SourceTileRawPlacementMagnitude): K01SourceTilePlacementOffsetY {
  switch (rawDelta) {
    case 0: return 0;
    case 16: return -16;
    case 32: return -32;
    case 48: return -48;
    case 64: return -64;
  }
}

function decodeBase64(value: string): Uint8Array {
  const decoded = globalThis.atob(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}
