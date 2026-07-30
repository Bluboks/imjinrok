import { unitDefinitions, type UnitDefinition } from "../../shared/src/index.js";
import { arePlayersEnemies } from "./diplomacy.js";
import type { UnitState, WorldState } from "./types.js";

export interface AutoAbilityPolicyContext {
  state: WorldState;
  caster: UnitState;
  target: UnitState;
  /** A project clock adaptation, not the recovered original global LCG. */
  cadenceDue: boolean;
  clearUnitOrder: (unit: UnitState) => void;
}

export interface AutoAbilityPolicy {
  /** Stable serialized profile id. */
  id: string;
  /** Project scheduler cadence; original class-78 uses a separate global LCG. */
  cadenceTicks: number;
  tryExecute(context: AutoAbilityPolicyContext): boolean;
}

export const K01_RYU_AUTO_ABILITY_PROFILE_ID = "k01-ryu-seong-ryong-action-40";
export const K01_RYU_ACTION_40_MANA_COST = 70;
export const K01_RYU_PROJECT_MANA_POOL = 70;

const k01RyuAutoAbilityPolicy: AutoAbilityPolicy = {
  id: K01_RYU_AUTO_ABILITY_PROFILE_ID,
  cadenceTicks: 3,
  tryExecute: ({ state, caster, target, cadenceDue, clearUnitOrder }) => {
    if (!cadenceDue || caster.mana.current < K01_RYU_ACTION_40_MANA_COST) {
      return false;
    }

    const targetDefinition = unitDefinitions[target.kind] as UnitDefinition;
    const threshold = Math.trunc(target.health.max * 2 / 3);

    // The raw flags, active registry and team fields have no project analogue.
    // This bounded adapter intentionally uses only live enemy, non-building,
    // positive-health targets and the statically confirmed strict HP boundary.
    if (
      targetDefinition.category === "building" ||
      target.health.current <= 0 ||
      target.health.current >= threshold ||
      !arePlayersEnemies(state, target.playerId, caster.playerId)
    ) {
      return false;
    }

    caster.mana.current = Math.max(0, caster.mana.current - K01_RYU_ACTION_40_MANA_COST);
    target.playerId = caster.playerId;
    // Product adapter cleanup: source pending records do not map one-to-one to
    // project orders, so do not leave the caster attacking its new ally.
    clearUnitOrder(caster);
    clearUnitOrder(target);
    return true;
  },
};

const policiesById = new Map<string, AutoAbilityPolicy>([
  [k01RyuAutoAbilityPolicy.id, k01RyuAutoAbilityPolicy],
]);
const profileIdByUnitKind = new Map<string, string>([
  ["ryu-seong-ryong", K01_RYU_AUTO_ABILITY_PROFILE_ID],
]);

export function registerAutoAbilityPolicy(
  unitKind: string,
  policy: AutoAbilityPolicy,
): () => void {
  validateAutoAbilityPolicy(policy);

  if (policiesById.has(policy.id) || profileIdByUnitKind.has(unitKind)) {
    throw new Error(`auto ability policy or unit binding already exists: ${policy.id}/${unitKind}`);
  }

  policiesById.set(policy.id, policy);
  profileIdByUnitKind.set(unitKind, policy.id);
  return () => {
    policiesById.delete(policy.id);
    profileIdByUnitKind.delete(unitKind);
  };
}

export function getAutoAbilityPolicyForUnit(unit: Pick<UnitState, "kind" | "autoAbilityProfileId">): AutoAbilityPolicy | undefined {
  const profileId = unit.autoAbilityProfileId ?? profileIdByUnitKind.get(unit.kind);
  return profileId ? policiesById.get(profileId) : undefined;
}

export function tryExecutePlayerAutoAbility(
  state: WorldState,
  caster: UnitState,
  target: UnitState | undefined,
  clearUnitOrder: (unit: UnitState) => void,
): boolean {
  if (!target || state.players[caster.playerId]?.magicAutoUseEnabled !== true) {
    return false;
  }

  const policy = getAutoAbilityPolicyForUnit(caster);
  if (!policy) {
    return false;
  }

  return policy.tryExecute({
    state,
    caster,
    target,
    cadenceDue: state.tick % Math.max(1, Math.round(policy.cadenceTicks)) === 0,
    clearUnitOrder,
  });
}

function validateAutoAbilityPolicy(policy: AutoAbilityPolicy): void {
  if (!policy.id.trim()) {
    throw new Error("auto ability policy id must not be empty");
  }

  if (!Number.isFinite(policy.cadenceTicks) || policy.cadenceTicks < 1) {
    throw new Error(`auto ability policy ${policy.id} cadenceTicks must be a positive finite number`);
  }

  if (typeof policy.tryExecute !== "function") {
    throw new Error(`auto ability policy ${policy.id} must provide tryExecute`);
  }
}
