import { evaluateScenarioRuntime } from "./scenario.js";
import { SIM_TICK_SECONDS } from "./constants.js";
import { iterateUnitsOrdered } from "./units.js";
import type { UnitState, WorldState } from "./types.js";

const TARGET_EPSILON = 0.001;

export function advanceWorldTick(state: WorldState): void {
  state.tick += 1;

  for (const unit of iterateUnitsOrdered(state)) {
    advanceUnitMovement(unit, SIM_TICK_SECONDS);
  }

  evaluateScenarioRuntime(state);
}

function advanceUnitMovement(unit: UnitState, deltaSeconds: number): void {
  const target = unit.movementTarget;

  if (!target || unit.movementSpeed <= 0) {
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
