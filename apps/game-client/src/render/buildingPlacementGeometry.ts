import { getFootprintTiles } from "@simulation";
import type { FootprintDefinition, GridPoint, MapDefinition } from "@shared";
import { resolveGridGroundContactWorldPosition } from "./gridGroundContactPosition.js";

export interface BuildingPlacementGeometry {
  actualTiles: GridPoint[];
  farCell: GridPoint;
  footprintBounds: { minX: number; minY: number; maxX: number; maxY: number };
  projectedSpriteGroundContact: GridPoint;
  semanticCenterWorld: GridPoint;
  footprintCenterWorld: GridPoint;
  footprintPolygon: GridPoint[];
  localSpriteOffset: GridPoint;
}

export interface BuildingPlacementGeometryInput {
  position: GridPoint;
  footprint: FootprintDefinition;
  mapOrigin: GridPoint;
  map: MapDefinition;
}

/**
 * Adapts the product interaction footprint to the source renderer's far-cell
 * sprite anchor while preserving the unit's semantic center as its container.
 */
export function resolveBuildingPlacementGeometry({
  position,
  footprint,
  mapOrigin,
  map,
}: BuildingPlacementGeometryInput): BuildingPlacementGeometry {
  const actualTiles = getFootprintTiles(position, footprint);
  if (actualTiles.length === 0) {
    throw new RangeError("Building placement geometry requires a positive footprint and finite position.");
  }

  const footprintBounds = actualTiles.reduce((bounds, tile) => ({
    minX: Math.min(bounds.minX, tile.x),
    minY: Math.min(bounds.minY, tile.y),
    maxX: Math.max(bounds.maxX, tile.x),
    maxY: Math.max(bounds.maxY, tile.y),
  }), {
    minX: actualTiles[0]!.x,
    minY: actualTiles[0]!.y,
    maxX: actualTiles[0]!.x,
    maxY: actualTiles[0]!.y,
  });
  const farCell = { x: footprintBounds.maxX, y: footprintBounds.maxY };
  const semanticCenterWorld = resolveGridGroundContactWorldPosition(position, mapOrigin, map);
  const footprintCenterWorld = resolveGridGroundContactWorldPosition({
    x: (footprintBounds.minX + footprintBounds.maxX) / 2,
    y: (footprintBounds.minY + footprintBounds.maxY) / 2,
  }, mapOrigin, map);
  const projectedSpriteGroundContact = resolveGridGroundContactWorldPosition(farCell, mapOrigin, map);
  const footprintPolygon = [
    resolveGridGroundContactWorldPosition({ x: footprintBounds.minX - 0.5, y: footprintBounds.minY - 0.5 }, mapOrigin, map),
    resolveGridGroundContactWorldPosition({ x: footprintBounds.maxX + 0.5, y: footprintBounds.minY - 0.5 }, mapOrigin, map),
    resolveGridGroundContactWorldPosition({ x: footprintBounds.maxX + 0.5, y: footprintBounds.maxY + 0.5 }, mapOrigin, map),
    resolveGridGroundContactWorldPosition({ x: footprintBounds.minX - 0.5, y: footprintBounds.maxY + 0.5 }, mapOrigin, map),
  ];

  return {
    actualTiles,
    farCell,
    footprintBounds,
    projectedSpriteGroundContact,
    semanticCenterWorld,
    footprintCenterWorld,
    footprintPolygon,
    localSpriteOffset: {
      x: projectedSpriteGroundContact.x - semanticCenterWorld.x,
      y: projectedSpriteGroundContact.y - semanticCenterWorld.y,
    },
  };
}
