import { defaultSkirmishScenario, factions, type MapDefinition, type ScenarioDefinition } from "../../shared/src/index.js";
import { createPlayerUnits } from "./entities.js";
import type { PlayerState, ResourceBank, UnitState, WorldState } from "./types.js";

export type { AttributePool, PlayerState, ResourceBank, UnitState, WorldState } from "./types.js";
export { applyCommand } from "./commands.js";
export { advanceWorldTick } from "./tick.js";

export function createInitialWorldState(
  map: MapDefinition,
  playerIds: string[],
  scenario: ScenarioDefinition = defaultSkirmishScenario,
): WorldState {
  const units: Record<string, UnitState> = {};
  const players: Record<string, PlayerState> = {};
  const playerResources: Record<string, ResourceBank> = {};

  playerIds.forEach((playerId, index) => {
    const fallbackFaction = factions[index % factions.length] ?? "blue";
    const spawn = map.spawnPoints[index] ?? {
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
    map,
    players,
    units,
    playerResources,
    lastAcceptedCommand: null,
  };
}
