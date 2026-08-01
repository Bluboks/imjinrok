import type { GridPoint } from "../../shared/src/index.js";
import {
  coreStrictFootprintReservationPolicy,
  getMovementCollisionPolicy,
  getUnitOccupancyTiles,
  type MovementReservation,
  type MovementBlockingGroup,
} from "./movementCollisionPolicy.js";
import type { UnitState, WorldState } from "./types.js";

export { getUnitOccupancyTiles, type MovementBlockingGroup, type MovementReservation } from "./movementCollisionPolicy.js";

/** Delegates obstacle reporting to the world-selected movement collision policy. */
export function getEntityBlockingTiles(
  state: WorldState,
  excludedUnitId?: string,
  includeMobile = true,
): Set<string> {
  return getMovementCollisionPolicy(state).getEntityBlockingTiles(state, excludedUnitId, includeMobile);
}

/** Delegates exact requested-blocker grouping to the world-selected collision policy. */
export function getBlockingGroupAtTile(
  state: WorldState,
  excludedUnitId: string | undefined,
  tile: GridPoint,
  includeMobile = true,
): MovementBlockingGroup | null {
  return getMovementCollisionPolicy(state).getBlockingGroupAtTile(state, excludedUnitId, tile, includeMobile);
}

/** Delegates movement-step admission to the world-selected collision policy. */
export function canUnitOccupyPosition(
  state: WorldState,
  unit: UnitState,
  position: GridPoint,
): boolean {
  return getMovementCollisionPolicy(state).canUnitOccupyPosition(state, unit, position);
}

/** Existing direct callers retain the established strict default policy. */
export function createMovementReservation(): MovementReservation {
  return coreStrictFootprintReservationPolicy.createReservation();
}

/** Tick code must create a reservation owned by the selected world policy. */
export function createMovementReservationForState(state: WorldState): MovementReservation {
  return getMovementCollisionPolicy(state).createReservation();
}

/** Existing direct callers retain the established strict default policy. */
export function reserveUnitPosition(
  reservation: MovementReservation,
  unit: UnitState,
  position: GridPoint,
): boolean {
  return coreStrictFootprintReservationPolicy.reserveUnitPosition(reservation, unit, position);
}

/** Tick code delegates claim arbitration to the selected world policy. */
export function reserveUnitPositionForState(
  state: WorldState,
  reservation: MovementReservation,
  unit: UnitState,
  position: GridPoint,
): boolean {
  return getMovementCollisionPolicy(state).reserveUnitPosition(reservation, unit, position);
}
