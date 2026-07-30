import { unitDefinitions, type GridPoint, type StartingUnitDefinition, type UnitDefinitionId } from "../../shared/src/index.js";
import { createSourceOrientationState, getSourceOrientationProfileForUnit } from "./orientation.js";
import { K01_RYU_AUTO_ABILITY_PROFILE_ID, K01_RYU_PROJECT_MANA_POOL, getAutoAbilityPolicyForUnit } from "./autoAbilityPolicy.js";
import type { AttributePool, UnitState } from "./types.js";

function createPool(max: number): AttributePool {
  return {
    current: max,
    max,
  };
}

export function createUnitState(
  id: string,
  playerId: string,
  kind: UnitDefinitionId,
  position: GridPoint,
): UnitState {
  const attributes = unitDefinitions[kind].baseAttributes;

  const unit: UnitState = {
    id,
    playerId,
    kind,
    position,
    movementSpeed: attributes.movementSpeed,
    health: createPool(attributes.health),
    mana: createPool(attributes.mana),
  };

  const orientationProfile = getSourceOrientationProfileForUnit(unit);
  if (orientationProfile) {
    // The initial raw direction is a source-backed project spawn adaptation.
    unit.sourceOrientation = createSourceOrientationState(orientationProfile);
  }

  if (getAutoAbilityPolicyForUnit(unit)?.id === K01_RYU_AUTO_ABILITY_PROFILE_ID) {
    // Product-only mana pool: enough for one source-backed action-40 cast;
    // it is deliberately not asserted as an original unit-stat recovery.
    unit.mana = createPool(K01_RYU_PROJECT_MANA_POOL);
  }

  return unit;
}

export function createPlayerUnits(
  playerId: string,
  position: GridPoint,
  startingUnits: readonly StartingUnitDefinition[],
): UnitState[] {
  return startingUnits.map((unit) =>
    createUnitState(`${playerId}-${unit.idSuffix}`, playerId, unit.kind, {
      x: position.x + unit.offset.x,
      y: position.y + unit.offset.y,
    }),
  );
}
