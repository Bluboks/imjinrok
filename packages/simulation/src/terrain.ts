import { getTileAt, terrainDefinitions, unitDefinitions, type GridPoint, type TerrainDefinition } from "../../shared/src/index.js";
import type { UnitState, WorldState } from "./types.js";
import { iterateUnitsOrdered } from "./units.js";

export function isTileFlooded(state: WorldState, point: GridPoint): boolean {
  if (!isPointInMap(state, point) || state.environment.weather !== "rain") {
    return false;
  }

  const tile = getTileAt(state.map, point.x, point.y);
  const terrain: TerrainDefinition = terrainDefinitions[tile.terrain];

  return terrain.floodsInRain === true;
}

export function isTilePassableForUnit(state: WorldState, _unit: UnitState, point: GridPoint): boolean {
  if (!isPointInMap(state, point) || isTileFlooded(state, point)) {
    return false;
  }

  const tile = getTileAt(state.map, point.x, point.y);

  return !terrainDefinitions[tile.terrain].blocksMovement;
}

export function resolveFloodDrowning(state: WorldState): void {
  const drownedUnitIds: string[] = [];

  for (const unit of iterateUnitsOrdered(state)) {
    const definition = unitDefinitions[unit.kind];

    if (definition.category === "building") {
      continue;
    }

    const tile = { x: Math.round(unit.position.x), y: Math.round(unit.position.y) };

    if (isTileFlooded(state, tile)) {
      drownedUnitIds.push(unit.id);
    }
  }

  for (const unitId of drownedUnitIds) {
    delete state.units[unitId];
  }
}

function isPointInMap(state: WorldState, point: GridPoint): boolean {
  return point.x >= 0 && point.x < state.map.width && point.y >= 0 && point.y < state.map.height;
}
