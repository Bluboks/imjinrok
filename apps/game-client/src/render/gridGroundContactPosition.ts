import type { GridPoint, MapDefinition } from "@shared";
import { cartToIso } from "@simulation";

type GridGroundContactMapGeometry = Pick<MapDefinition, "tileWidth" | "tileHeight">;

/**
 * Resolves the simulation grid point to the center of its terrain diamond.
 * Source frame pivots remain local image-origin adapters and do not affect this
 * world-space ground contact.
 */
export function resolveGridGroundContactWorldPosition(
  point: GridPoint,
  mapOrigin: GridPoint,
  map: GridGroundContactMapGeometry,
): GridPoint {
  const iso = cartToIso(point, map.tileWidth, map.tileHeight);

  return {
    x: mapOrigin.x + iso.x,
    y: mapOrigin.y + iso.y,
  };
}
