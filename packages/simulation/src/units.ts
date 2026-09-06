import type { UnitState, WorldState } from "./types.js";
import { removeSourceRuntimeProfileUnit } from "./k01SourceRuntimeProfile.js";

export function iterateUnitsOrdered(state: WorldState): UnitState[] {
  return Object.keys(state.units)
    .sort()
    .map((unitId) => state.units[unitId])
    .filter((unit): unit is UnitState => unit !== undefined);
}

export function removeUnitFromWorld(state: WorldState, unitId: string): boolean {
  if (!state.units[unitId]) {
    return false;
  }

  const nextSourceRuntimeProfile = removeSourceRuntimeProfileUnit(state.sourceRuntimeProfile, unitId);
  if (nextSourceRuntimeProfile !== undefined) {
    state.sourceRuntimeProfile = nextSourceRuntimeProfile;
  }
  delete state.units[unitId];
  clearUnitReferences(state, unitId);
  return true;
}

function clearUnitReferences(state: WorldState, unitId: string): void {
  for (const unit of iterateUnitsOrdered(state)) {
    if (unit.auraEffects) {
      const remainingEffects = Object.fromEntries(
        Object.entries(unit.auraEffects).filter(([, effect]) => effect.providerUnitId !== unitId),
      );
      if (Object.keys(remainingEffects).length === 0) {
        delete unit.auraEffects;
      } else {
        unit.auraEffects = remainingEffects;
      }
    }

    const order = unit.currentOrder;

    if (
      (order?.type === "attack-unit" && order.targetUnitId === unitId) ||
      (order?.type === "repair" && order.targetUnitId === unitId) ||
      (order?.type === "build" && order.buildingUnitId === unitId)
    ) {
      delete unit.movementTarget;
      delete unit.movementPath;
      delete unit.navigation;
      delete unit.currentOrder;
    }

    if (unit.construction?.builderUnitId === unitId) {
      delete unit.construction.builderUnitId;
    }
  }
}
