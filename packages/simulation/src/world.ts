import { defaultSkirmishScenario, factions, type MapDefinition, type ScenarioDefinition } from "../../shared/src/index.js";
import { createPlayerUnits } from "./entities.js";
import { createInitialEnvironmentState } from "./environment.js";
import { createScenarioRuntimeState } from "./scenario.js";
import type { PlayerState, ResourceBank, UnitState, WorldSnapshot, WorldState } from "./types.js";

export type { AttributePool, ObjectiveRuntimeState, ObjectiveStatus, PlayerState, ResourceBank, ScenarioRuntimeEvent, ScenarioRuntimeState, ScenarioStatus, UnitState, WorldSnapshot, WorldState } from "./types.js";
export { applyCommand, issueCommand, validateCommand, type CommandValidationResult, type IssueCommandResult } from "./commands.js";
export { resolveDamageAmount, type DamagePacket } from "./damage.js";
export type { EnvironmentState } from "./environment.js";
export { findPathForUnit, isTerrainWalkable } from "./navigation.js";
export { getFootprintTiles, validateBuildingPlacement, type BuildingPlacementValidationResult } from "./placement.js";
export { findHarvestableResourceTile, findResourceTile, getResourceNodeState, isResourceHarvestable, resourceBlocksBuilding, resourceBlocksMovement, updateResourceRegrowth } from "./resources.js";
export { createScenarioRuntimeState, evaluateScenarioRuntime } from "./scenario.js";
export { SIM_TICK_SECONDS, SIM_TICKS_PER_SECOND } from "./constants.js";
export { isTileFlooded, isTilePassableForUnit } from "./terrain.js";
export { advanceWorldTick } from "./tick.js";
export { iterateUnitsOrdered } from "./units.js";
export { createPlayerVisibility, getTileVisibility, updatePlayerVisibility, updatePlayerVisibilityWithChanges, TileVisibility, type PlayerVisibilityChangeOptions, type PlayerVisibilityState, type PlayerVisibilityUpdate } from "./visibility.js";

export function createInitialWorldState(
  map: MapDefinition,
  playerIds: string[],
  scenario: ScenarioDefinition = defaultSkirmishScenario,
): WorldState {
  const worldMap = structuredClone(map);
  const units: Record<string, UnitState> = {};
  const players: Record<string, PlayerState> = {};
  const playerResources: Record<string, ResourceBank> = {};

  playerIds.forEach((playerId, index) => {
    const fallbackFaction = factions[index % factions.length] ?? "blue";
    const spawn = worldMap.spawnPoints[index] ?? {
      id: `fallback-${index}`,
      x: 2 + index,
      y: 2 + index,
      faction: fallbackFaction,
    };

    players[playerId] = { id: playerId, faction: spawn.faction };
    playerResources[playerId] = { ...scenario.startingResources };

    for (const unit of createPlayerUnits(playerId, { x: spawn.x, y: spawn.y }, scenario.startingUnits)) {
      units[unit.id] = unit;
    }
  });

  return {
    tick: 0,
    map: worldMap,
    environment: createInitialEnvironmentState(worldMap),
    scenario: createScenarioRuntimeState(scenario),
    players,
    units,
    playerResources,
    lastAcceptedCommand: null,
  };
}

export function toWorldSnapshot(state: WorldState): WorldSnapshot {
  return structuredClone(state);
}
