import type { MapDefinition } from "@shared";

export interface TerrainRasterWorldBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface SourceTerrainRasterRegion extends TerrainRasterWorldBounds {
  readonly width: number;
  readonly height: number;
}

export interface SourceTerrainRasterPlan {
  readonly drawOrder: "y-major then x-major";
  readonly regions: readonly SourceTerrainRasterRegion[];
  readonly cells: readonly { readonly x: number; readonly y: number }[];
  /** Optional opaque RGB fill applied to each output region before replay. */
  readonly clearColor: number | undefined;
  readonly coverage: SourceTerrainRasterCoveragePlan | null;
}

export interface SourceTerrainRasterCoveragePlan {
  readonly mode: "canonical-source-art" | "legacy-authored-underlay";
  readonly assetKey?: string;
  readonly placement: "selected-frame-offset" | "authored-per-cell";
  readonly evidenceStatus?: "의도적 적응";
}

/**
 * Selects the source-art raster path from an explicit tile composition
 * profile, rather than a map identifier. Source alpha frames can overlap tile
 * boundaries, so they must replay in one global y-then-x order in every
 * non-overlapping output region.
 */
export function createSourceTerrainRasterPlan(
  map: Pick<MapDefinition, "width" | "height" | "layers" | "terrainCompositionProfile" | "sourceRasterClearColor" | "sourceRasterCoverage">,
  worldBounds: TerrainRasterWorldBounds,
  maxTextureSize: number,
): SourceTerrainRasterPlan | null {
  if (!usesSourceTerrainRasterComposition(map)) return null;
  assertRasterBounds(worldBounds);
  if (!Number.isInteger(maxTextureSize) || maxTextureSize <= 0) {
    throw new RangeError(`Source terrain raster maximum texture size must be a positive integer; received ${maxTextureSize}.`);
  }
  assertSourceRasterClearColor(map.sourceRasterClearColor);

  const cells = [];
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      cells.push({ x, y });
    }
  }
  return {
    drawOrder: "y-major then x-major",
    regions: partitionWorldBounds(worldBounds, maxTextureSize),
    cells,
    clearColor: map.sourceRasterClearColor,
    coverage: map.sourceRasterCoverage
      ?? (map.terrainCompositionProfile === "source-raster-underlay"
        ? { mode: "legacy-authored-underlay", placement: "authored-per-cell" }
        : null),
  };
}

export function usesSourceTerrainRasterComposition(
  map: Pick<MapDefinition, "width" | "height" | "layers" | "terrainCompositionProfile" | "sourceRasterClearColor" | "sourceRasterCoverage">,
): boolean {
  const tiles = map.layers[0]?.tiles;
  return (map.terrainCompositionProfile === "source-raster" || map.terrainCompositionProfile === "source-raster-underlay")
    && tiles !== undefined
    && tiles.length === map.width * map.height
    && tiles.every((tile) => tile.tilesetVisuals?.flatAssetKey !== undefined && tile.tilesetVisuals.flatArtworkEmbedsRelief === true);
}

function partitionWorldBounds(bounds: TerrainRasterWorldBounds, maxTextureSize: number): SourceTerrainRasterRegion[] {
  const regions = [];
  for (let top = bounds.top; top < bounds.bottom; top += maxTextureSize) {
    const bottom = Math.min(top + maxTextureSize, bounds.bottom);
    for (let left = bounds.left; left < bounds.right; left += maxTextureSize) {
      const right = Math.min(left + maxTextureSize, bounds.right);
      regions.push({ left, top, right, bottom, width: Math.ceil(right - left), height: Math.ceil(bottom - top) });
    }
  }
  return regions;
}

function assertRasterBounds(bounds: TerrainRasterWorldBounds): void {
  if (!Number.isFinite(bounds.left) || !Number.isFinite(bounds.top)
    || !Number.isFinite(bounds.right) || !Number.isFinite(bounds.bottom)
    || bounds.right <= bounds.left || bounds.bottom <= bounds.top) {
    throw new RangeError("Source terrain raster bounds must be finite with positive width and height.");
  }
}

function assertSourceRasterClearColor(clearColor: number | undefined): void {
  if (clearColor === undefined) return;
  if (!Number.isInteger(clearColor) || clearColor < 0 || clearColor > 0xffffff) {
    throw new RangeError(`Source terrain raster clear color must be an integer RGB value from 0x000000 through 0xffffff; received ${clearColor}.`);
  }
}
