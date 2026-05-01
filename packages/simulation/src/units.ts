import type { UnitState, WorldState } from "./types.js";

export function iterateUnitsOrdered(state: WorldState): UnitState[] {
  return Object.keys(state.units)
    .sort()
    .map((unitId) => state.units[unitId])
    .filter((unit): unit is UnitState => unit !== undefined);
}
