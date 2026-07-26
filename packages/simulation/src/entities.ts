import { unitDefinitions, type GridPoint, type StartingUnitDefinition, type UnitDefinitionId } from "../../shared/src/index.js";
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

  return {
    id,
    playerId,
    kind,
    position,
    movementSpeed: attributes.movementSpeed,
    health: createPool(attributes.health),
    mana: createPool(attributes.mana),
  };
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
