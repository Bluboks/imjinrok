import {
  getTileAt,
  resolveMapElevationProfile,
  sampleMapSurfaceElevation,
  type TerrainKindSlot,
  type GridPoint,
  type MapDefinition,
} from "@shared";

export interface TerrainElevationPresentation {
  readonly level: number;
  readonly liftPixels: number;
  /** Source flat art may already contain its own visual relief. */
  readonly rendersGenericElevation: boolean;
}

/**
 * Resolves one cell against the shared map elevation contract. Terrain and fog
 * use nearest cell sampling, while mobile entities may opt into bilinear
 * sampling through the same shared API at their own presentation boundary.
 */
export function resolveTerrainElevationPresentation(
  map: MapDefinition,
  point: GridPoint,
): TerrainElevationPresentation {
  if (!Number.isInteger(point.x) || !Number.isInteger(point.y)
    || point.x < 0 || point.x >= map.width || point.y < 0 || point.y >= map.height) {
    throw new RangeError(`Terrain elevation presentation requires an in-bounds integer cell; received ${point.x},${point.y}.`);
  }
  const tile = getTileAt(map, point.x, point.y);
  const surface = sampleMapSurfaceElevation(map, point, { sampling: "nearest" });

  return {
    level: surface.level,
    liftPixels: surface.liftPixels,
    rendersGenericElevation: tile.tilesetVisuals?.flatArtworkEmbedsRelief !== true,
  };
}

export function resolveTerrainElevationStepHeight(map: MapDefinition): number {
  return resolveMapElevationProfile(map).stepHeight;
}

/** Source fog is the counterpart of flat source art, not a generic height overlay. */
export function shouldRenderSourceFogComposite(
  presentation: Pick<TerrainElevationPresentation, "level" | "rendersGenericElevation">,
): boolean {
  return presentation.level <= 0 || !presentation.rendersGenericElevation;
}

export function resolveTerrainElevationOverlayLiftPixels(
  presentation: Pick<TerrainElevationPresentation, "liftPixels">,
  slot: TerrainKindSlot,
  stepHeight: number,
): number {
  if (!Number.isFinite(presentation.liftPixels) || presentation.liftPixels < 0) {
    throw new RangeError(`Terrain elevation lift must be a non-negative finite pixel value; received ${presentation.liftPixels}.`);
  }
  if (!Number.isFinite(stepHeight) || stepHeight <= 0) {
    throw new RangeError(`Terrain elevation step height must be finite and positive; received ${stepHeight}.`);
  }
  return presentation.liftPixels + (slot === "plateauTop" ? 0 : stepHeight);
}
