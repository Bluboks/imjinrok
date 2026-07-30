import { K01_SOURCE_FOG_ARTIFACT } from "./generated/k01SourceFogArtifact.js";
import type { TileCell } from "./maps.js";

export const K01_SOURCE_FOG_DIMENSIONS = K01_SOURCE_FOG_ARTIFACT.dimensions;
export const K01_SOURCE_FOG_FAMILY_DIGEST = K01_SOURCE_FOG_ARTIFACT.familyBytesSha256;

const familyBytes = decodeBase64(K01_SOURCE_FOG_ARTIFACT.familyBytesBase64);

assertK01SourceFogArtifact();

/**
 * Product/map adapter from original x-major bytes to row-major web-map tiles.
 * These bytes select a source family only; their runtime producer and human
 * terrain/visibility meaning remain unresolved.
 */
export function getK01SourceFogFamilyIndex(x: number, y: number): number {
  const { width, height } = K01_SOURCE_FOG_DIMENSIONS;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= width || y < 0 || y >= height) {
    throw new RangeError(`K01 source fog coordinates outside 0..${width - 1},0..${height - 1}: ${x},${y}`);
  }
  const familyIndex = familyBytes[x * height + y];
  if (familyIndex === undefined) throw new Error(`K01 source fog (${x},${y}) is outside the generated family stream.`);
  return familyIndex;
}

export function applyK01SourceFogVisuals(tiles: TileCell[], width: number, height: number): void {
  if (width !== K01_SOURCE_FOG_DIMENSIONS.width || height !== K01_SOURCE_FOG_DIMENSIONS.height) {
    throw new Error(`K01 source fog visuals require ${K01_SOURCE_FOG_DIMENSIONS.width}x${K01_SOURCE_FOG_DIMENSIONS.height}; received ${width}x${height}.`);
  }
  if (tiles.length !== K01_SOURCE_FOG_ARTIFACT.cellCount) {
    throw new Error(`K01 source fog visuals require ${K01_SOURCE_FOG_ARTIFACT.cellCount} product tiles; received ${tiles.length}.`);
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const tile = tiles[y * width + x];
      if (!tile) throw new Error(`K01 source fog visual is missing product tile ${x},${y}.`);
      tile.fogVisuals = { ...tile.fogVisuals, familyIndex: getK01SourceFogFamilyIndex(x, y) };
    }
  }
}

export function assertK01SourceFogArtifact(): void {
  const { width, height } = K01_SOURCE_FOG_DIMENSIONS;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error("K01 source fog artifact has invalid dimensions.");
  }
  if (K01_SOURCE_FOG_ARTIFACT.cellCount !== width * height || familyBytes.length !== K01_SOURCE_FOG_ARTIFACT.cellCount) {
    throw new Error("K01 source fog artifact family count does not match its dimensions.");
  }
  if (!/^[a-f0-9]{64}$/u.test(K01_SOURCE_FOG_FAMILY_DIGEST)) {
    throw new Error("K01 source fog artifact has an invalid family-stream SHA-256 digest.");
  }
  if (familyBytes.some((value) => value > 14)) {
    throw new Error("K01 source fog artifact has a family index outside 0..14.");
  }
}

function decodeBase64(value: string): Uint8Array {
  const decoded = globalThis.atob(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}
