import {
  getTileAt,
  unitDefinitions,
  type BuildingDefinitionId,
  type FootprintDefinition,
  type GridPoint,
  type TerrainType,
} from "../../shared/src/index.js";
import type { WorldState } from "./types.js";
import { iterateUnitsOrdered } from "./units.js";

export type BuildingPlacementValidationResult =
  | { ok: true; tiles: GridPoint[] }
  | { ok: false; reason: string };

export function validateBuildingPlacement(
  state: WorldState,
  building: BuildingDefinitionId,
  target: GridPoint,
): BuildingPlacementValidationResult {
  const definition = unitDefinitions[building];
  const placement = definition.placement;

  if (!placement) {
    return { ok: false, reason: "unit is not placeable" };
  }

  const footprintTiles = getFootprintTiles(target, definition.footprint);
  const allowedTerrain: readonly TerrainType[] = placement.allowedTerrain;

  if (footprintTiles.length === 0) {
    return { ok: false, reason: "building footprint is invalid" };
  }

  const occupiedTiles = getBlockingTileSet(state);

  for (const tile of footprintTiles) {
    if (!isTileInMap(state, tile)) {
      return { ok: false, reason: "building footprint is outside map" };
    }

    const mapTile = getTileAt(state.map, tile.x, tile.y);

    if (!allowedTerrain.includes(mapTile.terrain)) {
      return { ok: false, reason: `cannot build on ${mapTile.terrain}` };
    }

    if (mapTile.resource) {
      return { ok: false, reason: "building footprint overlaps a resource" };
    }

    if (occupiedTiles.has(toTileKey(tile))) {
      return { ok: false, reason: "building footprint is occupied" };
    }
  }

  return { ok: true, tiles: footprintTiles };
}

export function getFootprintTiles(center: GridPoint, footprint: FootprintDefinition): GridPoint[] {
  const width = Math.floor(footprint.width);
  const height = Math.floor(footprint.height);

  if (width <= 0 || height <= 0 || !Number.isFinite(center.x) || !Number.isFinite(center.y)) {
    return [];
  }

  const originX = Math.round(center.x - (width - 1) / 2);
  const originY = Math.round(center.y - (height - 1) / 2);
  const tiles: GridPoint[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      tiles.push({ x: originX + x, y: originY + y });
    }
  }

  return tiles;
}

function getBlockingTileSet(state: WorldState): Set<string> {
  const occupiedTiles = new Set<string>();

  for (const unit of iterateUnitsOrdered(state)) {
    const footprint = unitDefinitions[unit.kind].footprint;

    if (!footprint.blocksMovement) {
      continue;
    }

    for (const tile of getFootprintTiles(unit.position, footprint)) {
      occupiedTiles.add(toTileKey(tile));
    }
  }

  return occupiedTiles;
}

function isTileInMap(state: WorldState, tile: GridPoint): boolean {
  return tile.x >= 0 && tile.x < state.map.width && tile.y >= 0 && tile.y < state.map.height;
}

function toTileKey(tile: GridPoint): string {
  return `${tile.x},${tile.y}`;
}
