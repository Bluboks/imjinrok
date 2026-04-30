import type { CommandEnvelope, GridPoint, MapDefinition } from "../../shared/src/index.js";

export interface ResourceBank {
  food: number;
  wood: number;
  gold: number;
  stone: number;
}

export interface UnitState {
  id: string;
  playerId: string;
  kind: "villager" | "town-center";
  position: GridPoint;
  hp: number;
}

export interface WorldState {
  tick: number;
  map: MapDefinition;
  units: Record<string, UnitState>;
  playerResources: Record<string, ResourceBank>;
  lastAcceptedCommand: CommandEnvelope | null;
}

function createPlayerUnits(playerId: string, position: GridPoint): UnitState[] {
  return [
    {
      id: `${playerId}-town-center`,
      playerId,
      kind: "town-center",
      position,
      hp: 2400,
    },
    {
      id: `${playerId}-villager-1`,
      playerId,
      kind: "villager",
      position: { x: position.x + 1, y: position.y },
      hp: 25,
    },
    {
      id: `${playerId}-villager-2`,
      playerId,
      kind: "villager",
      position: { x: position.x, y: position.y + 1 },
      hp: 25,
    },
    {
      id: `${playerId}-villager-3`,
      playerId,
      kind: "villager",
      position: { x: position.x + 1, y: position.y + 1 },
      hp: 25,
    },
  ];
}

export function createInitialWorldState(map: MapDefinition, playerIds: string[]): WorldState {
  const units: Record<string, UnitState> = {};
  const playerResources: Record<string, ResourceBank> = {};

  playerIds.forEach((playerId, index) => {
    const spawn = map.spawnPoints[index] ?? {
      id: `fallback-${index}`,
      x: 2 + index,
      y: 2 + index,
      faction: "blue",
    };

    playerResources[playerId] = {
      food: 200,
      wood: 200,
      gold: 100,
      stone: 100,
    };

    for (const unit of createPlayerUnits(playerId, { x: spawn.x, y: spawn.y })) {
      units[unit.id] = unit;
    }
  });

  return {
    tick: 0,
    map,
    units,
    playerResources,
    lastAcceptedCommand: null,
  };
}

export function applyCommand(state: WorldState, envelope: CommandEnvelope): void {
  state.lastAcceptedCommand = envelope;

  switch (envelope.command.type) {
    case "move":
    case "attack-move": {
      const unit = state.units[envelope.command.unitId];

      if (!unit) {
        return;
      }

      unit.position = { ...envelope.command.target };
      return;
    }
    case "build":
    case "gather":
    case "stop":
      return;
  }
}

export function advanceWorldTick(state: WorldState): void {
  state.tick += 1;
}
