import {
  getTileAt,
  unitDefinitions,
  type BuildingDefinitionId,
  type GridPoint,
  type TerrainType,
} from "../../shared/src/index.js";
import { resourceBlocksBuilding } from "./resources.js";
import { getFootprintTiles, getUnitFootprintTiles, resolveEffectiveFootprint } from "./footprints.js";
import type { WorldState } from "./types.js";
import { iterateUnitsOrdered } from "./units.js";

export { getFootprintTiles } from "./footprints.js";

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

  const { footprint, anchor } = resolveEffectiveFootprint(state, building);
  const footprintTiles = getFootprintTiles(target, footprint, anchor);
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

    if (resourceBlocksBuilding(mapTile.resource)) {
      return { ok: false, reason: "building footprint overlaps a resource" };
    }

    if (occupiedTiles.has(toTileKey(tile))) {
      return { ok: false, reason: "building footprint is occupied" };
    }
  }

  return { ok: true, tiles: footprintTiles };
}

function getBlockingTileSet(state: WorldState): Set<string> {
  const occupiedTiles = new Set<string>();

  for (const unit of iterateUnitsOrdered(state)) {
    const footprint = resolveEffectiveFootprint(state, unit.kind).footprint;

    if (!footprint.blocksMovement) {
      continue;
    }

    for (const tile of getUnitFootprintTiles(state, unit.kind, unit.position)) {
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
