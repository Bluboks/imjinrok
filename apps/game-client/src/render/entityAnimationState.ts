import type { EntityVisual } from "@shared";
import type { UnitState } from "@simulation";
import { isBelowOriginalBuildingDamageThreshold } from "../originalBuildingVisualState.js";

export type EntityAnimationStateUnit = Pick<
  UnitState,
  | "attackCooldownTicks"
  | "carriedResource"
  | "construction"
  | "demolition"
  | "currentOrder"
  | "health"
  | "movementPath"
  | "movementTarget"
  | "movementBlocked"
  | "navigation"
>;

export function getEntityAnimationStateKey(
  unit: EntityAnimationStateUnit,
  visual: Pick<EntityVisual, "states">,
): string | null {
  const candidates: string[] = [];

  if (unit.demolition || unit.construction) {
    candidates.push("construction");
  }

  if (visual.states.damaged && isBelowOriginalBuildingDamageThreshold(unit.health)) {
    candidates.push("damaged");
  }

  if ((unit.attackCooldownTicks ?? 0) > 0) {
    candidates.push("attack");
  }

  const hasTravelIntent = unit.movementTarget !== undefined ||
    (unit.movementPath?.length ?? 0) > 0 ||
    unit.navigation?.terminalReason === "mobile-obstruction";
  const isMoving = hasTravelIntent && unit.movementBlocked !== true;
  const isCarryingResource = (unit.carriedResource?.amount ?? 0) > 0;

  if (!hasTravelIntent && unit.currentOrder?.type === "repair") {
    candidates.push("repair", "build");
  }

  if (!hasTravelIntent && unit.currentOrder?.type === "build") {
    candidates.push("build");
  }

  if (!hasTravelIntent && unit.currentOrder?.type === "gather") {
    candidates.push("gather");
  }

  if (isCarryingResource) {
    if (isMoving) {
      candidates.push("carry", "move", "walk");
    } else {
      candidates.push("carry-idle", "carry");
    }
  } else {
    if (isMoving) {
      candidates.push("move", "walk");
    }
  }

  if (isMoving && unit.currentOrder?.type === "repair") {
    candidates.push("repair", "build");
  }

  if (isMoving && unit.currentOrder?.type === "build") {
    candidates.push("build");
  }

  candidates.push("idle");

  for (const candidate of candidates) {
    if (visual.states[candidate]) {
      return candidate;
    }
  }

  return Object.keys(visual.states)[0] ?? null;
}
