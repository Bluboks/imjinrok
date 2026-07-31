import type { BankResourceKind, UnitDefinition } from "../../shared/src/index.js";
import type { AttributePool, DemolitionState } from "./types.js";

export const ORIGINAL_DEMOLITION_INITIAL_PROGRESS = 100;

/** Exact action-13 `+0x8c` to `+0x1b2` threshold selection. */
export function getOriginalDemolitionPhase(progress: number): number {
  if (progress < 10) return 0;
  if (progress < 20) return 1;
  if (progress < 30) return 2;
  if (progress < 40) return 3;
  if (progress < 50) return 4;
  if (progress < 70) return 5;
  if (progress < 100) return 6;
  return 7;
}

export function createDemolitionState(): DemolitionState {
  return {
    progress: ORIGINAL_DEMOLITION_INITIAL_PROGRESS,
    phase: getOriginalDemolitionPhase(ORIGINAL_DEMOLITION_INITIAL_PROGRESS),
  };
}

export interface DemolitionTickResult {
  demolition: DemolitionState;
  health: AttributePool;
  completed: boolean;
}

export interface DemolitionDecrementResult {
  progress: number;
  health: AttributePool;
  completed: boolean;
}

/** Exact `FUN_00438090` progress/health helper, including its underflow rule. */
export function replayOriginalDemolitionDecrement(
  progress: number,
  health: AttributePool,
  delta: number,
): DemolitionDecrementResult {
  const normalizedProgress = normalizeProgress(progress);
  const normalizedDelta = Math.max(0, Math.trunc(delta));
  const currentHealth = Math.min(health.current, health.max);

  if (normalizedProgress < normalizedDelta) {
    return { progress: 0, health: { ...health, current: currentHealth }, completed: true };
  }

  const nextProgress = normalizedProgress - normalizedDelta;
  const targetHealth = Math.max(1, Math.trunc(health.max * nextProgress / 100));

  return {
    progress: nextProgress,
    health: { ...health, current: Math.min(currentHealth, targetHealth) },
    completed: false,
  };
}

/**
 * Source helper parity: a progress value equal to its delta reaches zero but
 * does not complete until the following tick. The phase is written before the
 * helper decrement, matching the recovered update order.
 */
export function advanceOriginalDemolitionTick(
  demolition: DemolitionState,
  health: AttributePool,
): DemolitionTickResult {
  const progress = normalizeProgress(demolition.progress);
  const phase = getOriginalDemolitionPhase(progress);

  if (progress <= 0) {
    return {
      demolition: { progress: 0, phase },
      health: { ...health, current: Math.min(health.current, health.max) },
      completed: true,
    };
  }

  const delta = progress >= 2 ? 2 : 1;
  const result = replayOriginalDemolitionDecrement(progress, health, delta);

  return {
    demolition: { progress: result.progress, phase },
    health: result.health,
    completed: result.completed,
  };
}

/**
 * Project adaptation boundary. The original refund path is proven only for
 * grain and wood; until a source resource profile is connected, the generic
 * content cost is refunded in full. Keeping this pure makes a future registry
 * profile replacement independent from demolition progression.
 */
export function calculateProjectDemolitionRefund(
  cost: UnitDefinition["cost"],
): Partial<Record<BankResourceKind, number>> {
  const refund: Partial<Record<BankResourceKind, number>> = {};

  for (const [resource, amount] of Object.entries(cost ?? {})) {
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      continue;
    }
    refund[resource as BankResourceKind] = amount;
  }

  return refund;
}

function normalizeProgress(progress: number): number {
  if (!Number.isFinite(progress)) {
    return 0;
  }
  return Math.max(0, Math.min(ORIGINAL_DEMOLITION_INITIAL_PROGRESS, Math.trunc(progress)));
}
