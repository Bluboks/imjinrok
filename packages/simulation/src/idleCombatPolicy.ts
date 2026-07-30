import type { UnitDefinition } from "../../shared/src/index.js";
import type { UnitState, WorldState } from "./types.js";

export interface IdleCombatPolicyContext {
  state: WorldState;
  unit: UnitState;
  combat: NonNullable<UnitDefinition["combat"]>;
  findNearestEnemyInRange: (range: number) => UnitState | null;
}

export interface IdleCombatPolicy {
  /** Stable, serializable profile id. */
  id: string;
  selectTarget(context: IdleCombatPolicyContext): UnitState | null;
}

export const BUILTIN_IDLE_COMBAT_POLICY_ID = "builtin-mobile-aggro-stationary-guard";

const builtinIdleCombatPolicy: IdleCombatPolicy = {
  id: BUILTIN_IDLE_COMBAT_POLICY_ID,
  selectTarget: ({ unit, combat, findNearestEnemyInRange }) =>
    findNearestEnemyInRange(unit.movementSpeed > 0 ? combat.aggroRange : combat.range),
};

const policiesById = new Map<string, IdleCombatPolicy>([
  [builtinIdleCombatPolicy.id, builtinIdleCombatPolicy],
]);

/**
 * Registers a mod-defined idle policy. Profiles are deliberately explicit so
 * snapshots only carry ids, never executable behavior.
 */
export function registerIdleCombatPolicy(policy: IdleCombatPolicy): () => void {
  validateIdleCombatPolicy(policy);

  if (policiesById.has(policy.id)) {
    throw new Error(`idle combat policy already exists: ${policy.id}`);
  }

  policiesById.set(policy.id, policy);
  return () => {
    policiesById.delete(policy.id);
  };
}

/** Unknown or legacy ids fall back to the compatibility-preserving built-in policy. */
export function getIdleCombatPolicy(profileId: string | undefined): IdleCombatPolicy {
  return policiesById.get(profileId ?? BUILTIN_IDLE_COMBAT_POLICY_ID) ?? builtinIdleCombatPolicy;
}

function validateIdleCombatPolicy(policy: IdleCombatPolicy): void {
  if (!policy.id.trim()) {
    throw new Error("idle combat policy id must not be empty");
  }

  if (typeof policy.selectTarget !== "function") {
    throw new Error(`idle combat policy ${policy.id} must provide selectTarget`);
  }
}
