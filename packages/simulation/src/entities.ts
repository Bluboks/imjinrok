import { unitDefinitions, type GridPoint, type StartingUnitDefinition, type UnitDefinitionId } from "../../shared/src/index.js";
import { createSourceOrientationState, getSourceOrientationProfileForUnit } from "./orientation.js";
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
