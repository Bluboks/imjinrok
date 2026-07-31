import type { UnitDefinitionId } from "../../shared/src/index.js";
import type { WorldState } from "./types.js";
import {
  DEFAULT_POPULATION_LIMIT,
  getPopulationCost,
  getPopulationProvided,
  getProviderSupplyCapacityState,
  type ProviderSupplyCapacityState,
} from "./capacity.js";

export { DEFAULT_POPULATION_LIMIT, getPopulationCost, getPopulationProvided } from "./capacity.js";
export type PlayerPopulationState = ProviderSupplyCapacityState;

export function getPlayerPopulationState(
  state: WorldState,
  playerId: string,
  limit = DEFAULT_POPULATION_LIMIT,
): PlayerPopulationState {
  return getProviderSupplyCapacityState(state, playerId, limit);
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

  return getProviderSupplyCapacityState(state, playerId, limit).available >= cost;
}
