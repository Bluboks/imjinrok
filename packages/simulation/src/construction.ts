import { unitDefinitions, type UnitDefinition, type UnitDefinitionId } from "../../shared/src/index.js";
import type { UnitState } from "./types.js";

export function isUnitUnderConstruction(unit: UnitState): boolean {
  return (unit.construction?.remainingTicks ?? 0) > 0;
}

export function getBuildTimeTicks(kind: UnitDefinitionId): number {
  return Math.max(1, (unitDefinitions[kind] as UnitDefinition).buildTimeTicks ?? 1);
}

export function getConstructionProgress(unit: UnitState): number {
  const construction = unit.construction;

  if (!construction) {
    return 1;
  }

  return Math.max(0, Math.min(1, (construction.totalTicks - construction.remainingTicks) / construction.totalTicks));
}

export function updateConstructionHealth(unit: UnitState): void {
  updateConstructionHealthWithOptions(unit);
}

export function advanceConstructionHealth(unit: UnitState): void {
  updateConstructionHealthWithOptions(unit, { preserveDamage: true });
}

function updateConstructionHealthWithOptions(
  unit: UnitState,
  options: { preserveDamage?: boolean } = {},
): void {
  if (!unit.construction) {
    unit.health.current = unit.health.max;
    return;
  }

  const targetHealth = getConstructionHealthAtRemainingTicks(unit, unit.construction.remainingTicks);

  if (!options.preserveDamage) {
    unit.health.current = targetHealth;
    return;
  }

  const previousRemainingTicks = Math.min(unit.construction.totalTicks, unit.construction.remainingTicks + 1);
  const previousTargetHealth = getConstructionHealthAtRemainingTicks(unit, previousRemainingTicks);
  const progressDelta = Math.max(0, targetHealth - previousTargetHealth);

  unit.health.current = Math.max(1, Math.min(targetHealth, unit.health.current + progressDelta));
}

function getConstructionHealthAtRemainingTicks(unit: UnitState, remainingTicks: number): number {
  const construction = unit.construction;

  if (!construction) {
    return unit.health.max;
  }

  const totalTicks = Math.max(1, construction.totalTicks);
  const clampedRemainingTicks = Math.max(0, Math.min(totalTicks, remainingTicks));
  const progress = Math.max(0, Math.min(1, (totalTicks - clampedRemainingTicks) / totalTicks));

  return Math.max(1, Math.ceil(unit.health.max * (0.1 + progress * 0.9)));
}
