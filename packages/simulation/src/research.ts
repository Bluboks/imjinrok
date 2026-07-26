import { unitDefinitions, type ResearchDefinitionId } from "../../shared/src/index.js";
import type { PlayerResearchState, UnitState, WorldState } from "./types.js";
import { iterateUnitsOrdered } from "./units.js";

const LOOM_VILLAGER_HEALTH_BONUS = 15;

export function createPlayerResearchState(): PlayerResearchState {
  return { completed: {} };
}

export function isResearchCompleted(state: WorldState, playerId: string, research: ResearchDefinitionId): boolean {
  return state.playerResearch[playerId]?.completed[research] === true;
}

export function isResearchPending(state: WorldState, playerId: string, research: ResearchDefinitionId): boolean {
  return iterateUnitsOrdered(state).some((unit) =>
    unit.playerId === playerId &&
    (unit.researchQueue?.some((item) => item.research === research) ?? false),
  );
}

export function completeResearch(state: WorldState, playerId: string, research: ResearchDefinitionId): void {
  const researchState = state.playerResearch[playerId] ?? createPlayerResearchState();
  state.playerResearch[playerId] = researchState;

  if (researchState.completed[research]) {
    return;
  }

  researchState.completed[research] = true;

  for (const unit of iterateUnitsOrdered(state)) {
    if (unit.playerId === playerId) {
      applyCompletedResearchToUnit(state, unit);
    }
  }
}

export function applyCompletedResearchToUnit(state: WorldState, unit: UnitState): void {
  if (isResearchCompleted(state, unit.playerId, "loom")) {
    applyLoomToUnit(unit);
  }
}

function applyLoomToUnit(unit: UnitState): void {
  if (unit.kind !== "villager") {
    return;
  }

  const targetMaxHealth = unitDefinitions.villager.baseAttributes.health + LOOM_VILLAGER_HEALTH_BONUS;
  const bonusDelta = targetMaxHealth - unit.health.max;

  if (bonusDelta <= 0) {
    return;
  }

  unit.health.max = targetMaxHealth;
  unit.health.current = Math.min(targetMaxHealth, unit.health.current + bonusDelta);
}
