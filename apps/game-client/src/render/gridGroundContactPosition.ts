import { sampleMapSurfaceElevation, type GridPoint, type MapDefinition } from "@shared";
import { cartToIso } from "@simulation";

/**
 * Resolves a simulation point to the sampled terrain surface. Entity-frame
 * pivots remain local image-origin adapters and do not affect this world-space
 * ground contact.
 */
export function resolveGridGroundContactWorldPosition(
  point: GridPoint,
  mapOrigin: GridPoint,
  map: MapDefinition,
): GridPoint {
  const iso = cartToIso(point, map.tileWidth, map.tileHeight);
  const surface = sampleMapSurfaceElevation(map, point);

  return {
    x: mapOrigin.x + iso.x,
    y: mapOrigin.y + iso.y - surface.liftPixels,
  };
}
