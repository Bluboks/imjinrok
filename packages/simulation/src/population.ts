import { unitDefinitions, type UnitDefinition, type UnitDefinitionId } from "../../shared/src/index.js";
import type { WorldState } from "./types.js";
import { isUnitUnderConstruction } from "./construction.js";
import { iterateUnitsOrdered } from "./units.js";

export const DEFAULT_POPULATION_LIMIT = 50;

export interface PlayerPopulationState {
  used: number;
  pending: number;
  provided: number;
  cap: number;
  limit: number;
  available: number;
}

export function getPlayerPopulationState(
  state: WorldState,
  playerId: string,
  limit = DEFAULT_POPULATION_LIMIT,
): PlayerPopulationState {
  let used = 0;
  let pending = 0;
  let provided = 0;

  for (const unit of iterateUnitsOrdered(state)) {
    if (unit.playerId !== playerId) {
      continue;
    }

    used += getPopulationCost(unit.kind);

    if (!isUnitUnderConstruction(unit)) {
      provided += getPopulationProvided(unit.kind);
    }

    for (const queueItem of unit.productionQueue ?? []) {
      pending += getPopulationCost(queueItem.unit);
    }
  }

  const cap = Math.min(Math.max(0, limit), Math.max(0, provided));

  return {
    used,
    pending,
    provided,
    cap,
    limit,
    available: Math.max(0, cap - used - pending),
  };
}

export function canQueuePopulation(
  state: WorldState,
  playerId: string,
  unit: UnitDefinitionId,
  limit = DEFAULT_POPULATION_LIMIT,
): boolean {
  const cost = getPopulationCost(unit);

  if (cost <= 0) {
    return true;
  }

  return getPlayerPopulationState(state, playerId, limit).available >= cost;
}

export function getPopulationCost(kind: UnitDefinitionId): number {
  return Math.max(0, (unitDefinitions[kind] as UnitDefinition).populationCost ?? 0);
}

export function getPopulationProvided(kind: UnitDefinitionId): number {
  return Math.max(0, (unitDefinitions[kind] as UnitDefinition).populationProvided ?? 0);
}
