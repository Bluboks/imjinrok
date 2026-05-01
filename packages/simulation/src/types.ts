import type { CommandEnvelope, FactionId, GridPoint, MapDefinition, ResourceAmountSet, UnitDefinitionId } from "../../shared/src/index.js";

export type ResourceBank = ResourceAmountSet;

export interface AttributePool {
  current: number;
  max: number;
}

export interface UnitState {
  id: string;
  playerId: string;
  kind: UnitDefinitionId;
  position: GridPoint;
  movementSpeed: number;
  movementTarget?: GridPoint;
  health: AttributePool;
  mana: AttributePool;
}

export interface PlayerState {
  id: string;
  faction: FactionId;
}

export interface WorldState {
  tick: number;
  map: MapDefinition;
  players: Record<string, PlayerState>;
  units: Record<string, UnitState>;
  playerResources: Record<string, ResourceBank>;
  lastAcceptedCommand: CommandEnvelope | null;
}
