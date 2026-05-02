import { evaluateScenarioRuntime } from "./scenario.js";
import { SIM_TICK_SECONDS } from "./constants.js";
import { updateEnvironment } from "./environment.js";
import { findPathForUnit } from "./navigation.js";
import { findResourceTile, gatherResourceForPlayer, updateResourceRegrowth } from "./resources.js";
import { isTilePassableForUnit, resolveFloodDrowning } from "./terrain.js";
import { iterateUnitsOrdered } from "./units.js";
import type { GridPoint } from "../../shared/src/index.js";
import type { UnitState, WorldState } from "./types.js";

const TARGET_EPSILON = 0.001;

export function advanceWorldTick(state: WorldState): void {
  state.tick += 1;
  // Environment updates first so future systems read this tick's state.
  updateEnvironment(state);
  updateResourceRegrowth(state);
  resolveFloodDrowning(state);

  for (const unit of iterateUnitsOrdered(state)) {
    if (state.units[unit.id]) {
      advanceUnitMovement(state, unit, SIM_TICK_SECONDS);
      advanceUnitGathering(state, unit);
    }
  }

  resolveFloodDrowning(state);

  evaluateScenarioRuntime(state);
}

function advanceUnitMovement(state: WorldState, unit: UnitState, deltaSeconds: number): void {
  const target = unit.movementTarget;

  if (!target || unit.movementSpeed <= 0) {
    return;
  }

  if (!isTilePassableForUnit(state, unit, { x: Math.round(target.x), y: Math.round(target.y) })) {
    delete unit.movementTarget;
    delete unit.movementPath;
    delete unit.currentOrder;
    return;
  }

  const deltaX = target.x - unit.position.x;
  const deltaY = target.y - unit.position.y;
  const distance = Math.hypot(deltaX, deltaY);

  if (distance <= TARGET_EPSILON) {
    unit.position = { ...target };
    advanceMovementWaypoint(unit);
    return;
  }

  const step = unit.movementSpeed * deltaSeconds;

  if (step >= distance) {
    unit.position = { ...target };
    advanceMovementWaypoint(unit);
    return;
  }

  unit.position = {
    x: unit.position.x + (deltaX / distance) * step,
    y: unit.position.y + (deltaY / distance) * step,
  };
}

function advanceMovementWaypoint(unit: UnitState): void {
  if (unit.movementPath && unit.movementPath.length > 0) {
    unit.movementPath.shift();
  }

  const nextTarget = unit.movementPath?.[0];

  if (nextTarget) {
    unit.movementTarget = { ...nextTarget };
    return;
  }

  delete unit.movementTarget;
  delete unit.movementPath;
}

function advanceUnitGathering(state: WorldState, unit: UnitState): void {
  if (unit.currentOrder?.type !== "gather") {
    return;
  }

  const resourceTile = findResourceTile(state.map, unit.currentOrder.resourceId);

  if (!resourceTile) {
    clearUnitOrder(unit);
    return;
  }

  unit.currentOrder.target = { ...resourceTile };

  if (unit.movementTarget) {
    return;
  }

  if (!isWithinGatherRange(unit.position, resourceTile)) {
    moveUnitToGatherRange(state, unit, resourceTile);
    return;
  }

  const result = gatherResourceForPlayer(state, unit.playerId, unit.currentOrder.resourceId);

  if (!result.ok || result.depleted) {
    clearUnitOrder(unit);
  }
}

function moveUnitToGatherRange(state: WorldState, unit: UnitState, resourceTile: GridPoint): void {
  const path = findPathForUnit(state, unit, resourceTile);

  if (!path) {
    clearUnitOrder(unit);
    return;
  }

  unit.movementPath = path;
  const nextTarget = path[0];

  if (nextTarget) {
    unit.movementTarget = nextTarget;
    return;
  }

  delete unit.movementTarget;
}

function isWithinGatherRange(position: GridPoint, resourceTile: GridPoint): boolean {
  return Math.max(Math.abs(Math.round(position.x) - resourceTile.x), Math.abs(Math.round(position.y) - resourceTile.y)) <= 1;
}

function clearUnitOrder(unit: UnitState): void {
  delete unit.movementTarget;
  delete unit.movementPath;
  delete unit.currentOrder;
}
