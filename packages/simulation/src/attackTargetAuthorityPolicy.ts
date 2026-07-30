import { createPlayerVisibility, getTileVisibility, TileVisibility, updatePlayerVisibility, type PlayerVisibilityState } from "./visibility.js";
import type { UnitState, WorldState } from "./types.js";

/** Preserves existing explicit-order tracking, including targets outside current sight. */
export const CORE_EXPLICIT_TARGET_TRACKING_AUTHORITY_POLICY_ID = "core:explicit-target-tracking";
/** Fair skirmish policy: explicit unit-target orders require current player visibility. */
export const CORE_CURRENT_VISIBILITY_STOP_AUTHORITY_POLICY_ID = "core:current-visibility-stop";

export interface AttackTargetAuthorityPolicyContext {
  state: WorldState;
  attacker: UnitState;
  target: UnitState;
  /** Tick-local visibility lookup; policy executables must never retain it in snapshots. */
  getCurrentVisibility(playerId: string): PlayerVisibilityState;
}

/**
 * Determines whether an existing explicit attack-unit order may keep using
 * its target. Executable policies are registry-owned; snapshots store only
 * the selected stable id on WorldState.
 */
export interface AttackTargetAuthorityPolicy {
  readonly id: string;
  authorizesTarget(context: AttackTargetAuthorityPolicyContext): boolean;
}

const policiesById = new Map<string, AttackTargetAuthorityPolicy>();

export function registerAttackTargetAuthorityPolicy(policy: AttackTargetAuthorityPolicy): () => void {
  validatePolicy(policy);
  if (policiesById.has(policy.id)) {
    throw new Error(`Attack target authority policy '${policy.id}' is already registered.`);
  }

  policiesById.set(policy.id, policy);
  return () => {
    policiesById.delete(policy.id);
  };
}

export function requireAttackTargetAuthorityPolicy(id: string): AttackTargetAuthorityPolicy {
  assertPolicyId(id);
  const policy = policiesById.get(id);

  if (!policy) {
    throw new Error(`Unknown attack target authority policy '${id}'. Register its policy before creating or advancing the world.`);
  }

  return policy;
}

/** Resolves legacy scenarios to the explicit compatibility policy. */
export function resolveAttackTargetAuthorityPolicyId(policyId: string | undefined): string {
  const resolvedPolicyId = policyId ?? CORE_EXPLICIT_TARGET_TRACKING_AUTHORITY_POLICY_ID;
  requireAttackTargetAuthorityPolicy(resolvedPolicyId);
  return resolvedPolicyId;
}

/** Legacy snapshots without a selection retain the explicit compatibility preset. */
export function getAttackTargetAuthorityPolicy(policyId: string | undefined): AttackTargetAuthorityPolicy {
  return requireAttackTargetAuthorityPolicy(resolveAttackTargetAuthorityPolicyId(policyId));
}

/** Caches one current-visibility grid per player for a single authority pass. */
export function createCurrentVisibilityResolver(state: WorldState): (playerId: string) => PlayerVisibilityState {
  const visibilityByPlayerId = new Map<string, PlayerVisibilityState>();

  return (playerId) => {
    const cached = visibilityByPlayerId.get(playerId);
    if (cached) {
      return cached;
    }

    const visibility = updatePlayerVisibility(createPlayerVisibility(state.map), state, playerId);
    visibilityByPlayerId.set(playerId, visibility);
    return visibility;
  };
}

export function isAttackTargetAuthorized(
  policy: AttackTargetAuthorityPolicy,
  state: WorldState,
  attacker: UnitState,
  target: UnitState,
  getCurrentVisibility = createCurrentVisibilityResolver(state),
): boolean {
  return policy.authorizesTarget({ state, attacker, target, getCurrentVisibility });
}

registerAttackTargetAuthorityPolicy({
  id: CORE_EXPLICIT_TARGET_TRACKING_AUTHORITY_POLICY_ID,
  authorizesTarget: () => true,
});

registerAttackTargetAuthorityPolicy({
  id: CORE_CURRENT_VISIBILITY_STOP_AUTHORITY_POLICY_ID,
  authorizesTarget: ({ attacker, target, getCurrentVisibility }) => {
    const visibility = getCurrentVisibility(attacker.playerId);
    return getTileVisibility(visibility, target.position) === TileVisibility.Visible;
  },
});

function validatePolicy(policy: AttackTargetAuthorityPolicy): void {
  assertPolicyId(policy.id);
  if (typeof policy.authorizesTarget !== "function") {
    throw new Error(`Attack target authority policy '${policy.id}' must provide authorizesTarget.`);
  }
}

function assertPolicyId(id: string): void {
  if (!id.trim()) {
    throw new Error("Attack target authority policy id must not be empty.");
  }
  if (id !== id.trim()) {
    throw new Error(`Attack target authority policy id '${id}' must not have surrounding whitespace.`);
  }
}
