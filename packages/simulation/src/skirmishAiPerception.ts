import { arePlayersEnemies } from "./diplomacy.js";
import { createPlayerVisibility, getTileVisibility, TileVisibility, updatePlayerVisibility } from "./visibility.js";
import type { UnitState, WorldState } from "./types.js";
import { iterateUnitsOrdered } from "./units.js";

/** Compatibility policy: the controller may reason about every live enemy. */
export const CORE_OMNISCIENT_SKIRMISH_AI_PERCEPTION_POLICY_ID = "core:omniscient";
/** Fair product policy: the controller may reason only about enemies visible now. */
export const CORE_CURRENT_VISIBILITY_SKIRMISH_AI_PERCEPTION_POLICY_ID = "core:current-visibility";

export interface SkirmishAiPerceptionContext {
  state: WorldState;
  playerId: string;
}

/**
 * Serializable policy identity with executable behavior registered locally.
 * Policies report current observations only; they must not retain enemy memory.
 */
export interface SkirmishAiPerceptionPolicy {
  id: string;
  selectEnemyUnits(context: SkirmishAiPerceptionContext): readonly UnitState[];
}

const policiesById = new Map<string, SkirmishAiPerceptionPolicy>();

export function registerSkirmishAiPerceptionPolicy(policy: SkirmishAiPerceptionPolicy): () => void {
  validatePolicy(policy);
  if (policiesById.has(policy.id)) {
    throw new Error(`skirmish AI perception policy already exists: ${policy.id}`);
  }

  policiesById.set(policy.id, policy);
  return () => {
    policiesById.delete(policy.id);
  };
}

export function getSkirmishAiPerceptionPolicy(policyId: string): SkirmishAiPerceptionPolicy {
  const policy = policiesById.get(policyId);
  if (!policy) {
    throw new Error(`unknown skirmish AI perception policy: ${policyId}`);
  }
  return policy;
}

registerSkirmishAiPerceptionPolicy({
  id: CORE_OMNISCIENT_SKIRMISH_AI_PERCEPTION_POLICY_ID,
  selectEnemyUnits: ({ state, playerId }) => collectEnemyUnits(state, playerId),
});

registerSkirmishAiPerceptionPolicy({
  id: CORE_CURRENT_VISIBILITY_SKIRMISH_AI_PERCEPTION_POLICY_ID,
  selectEnemyUnits: ({ state, playerId }) => {
    const visibility = updatePlayerVisibility(createPlayerVisibility(state.map), state, playerId);

    return collectEnemyUnits(state, playerId)
      .filter((unit) => getTileVisibility(visibility, unit.position) === TileVisibility.Visible);
  },
});

function collectEnemyUnits(state: WorldState, playerId: string): UnitState[] {
  return iterateUnitsOrdered(state)
    .filter((unit) => arePlayersEnemies(state, unit.playerId, playerId));
}

function validatePolicy(policy: SkirmishAiPerceptionPolicy): void {
  if (typeof policy.id !== "string" || !policy.id.trim()) {
    throw new Error("skirmish AI perception policy id must not be empty");
  }
  if (typeof policy.selectEnemyUnits !== "function") {
    throw new Error(`skirmish AI perception policy ${policy.id} must provide selectEnemyUnits`);
  }
}
