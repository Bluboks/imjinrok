/**
 * Product-only conversion for the source state-8 fog gradient. The original
 * indexed blend is not reproduced here; source RGB intensity becomes opacity
 * for the registered dark overlay color.
 */
export function adaptSourceFogUnseenPixels(
  sourcePixels: Uint8ClampedArray,
  overlayTint: number,
): Uint8ClampedArray {
  if (sourcePixels.length % 4 !== 0) {
    throw new RangeError(`source fog pixel data must contain complete RGBA pixels; received ${sourcePixels.length} bytes`);
  }
  if (!Number.isInteger(overlayTint) || overlayTint < 0 || overlayTint > 0xffffff) {
    throw new RangeError(`source fog overlay tint must be an RGB integer; received ${String(overlayTint)}`);
  }
  const red = (overlayTint >>> 16) & 0xff;
  const green = (overlayTint >>> 8) & 0xff;
  const blue = overlayTint & 0xff;
  const output = new Uint8ClampedArray(sourcePixels);
  for (let index = 0; index < output.length; index += 4) {
    const sourceAlpha = sourcePixels[index + 3] ?? 0;
    const sourceIntensity = Math.max(sourcePixels[index] ?? 0, sourcePixels[index + 1] ?? 0, sourcePixels[index + 2] ?? 0);
    output[index] = red;
    output[index + 1] = green;
    output[index + 2] = blue;
    output[index + 3] = Math.round((sourceAlpha * (255 - sourceIntensity)) / 255);
  }
  return output;
}

export function getSourceFogUnseenTextureKey(sourceTextureKey: string): string {
  if (!sourceTextureKey) throw new Error("source fog texture key must not be empty");
  return `${sourceTextureKey}-unseen-alpha-adapted`;
}

export function resolveSourceFogChunkDepth(
  flatTerrainDepth: number,
  terrainChunkDepths: readonly number[],
  usesSourceRaster: boolean,
): number {
  const normalDepth = flatTerrainDepth + 1;
  if (!usesSourceRaster || terrainChunkDepths.length === 0) return normalDepth;
  return Math.max(normalDepth, ...terrainChunkDepths.map((depth) => depth + 1));
}
