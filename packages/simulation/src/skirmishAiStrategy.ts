import type { IssueCommandResult, issueCommand } from "./commands.js";
import type { SkirmishAiTuning } from "./skirmishAi.js";
import type { UnitState, WorldState } from "./types.js";

export interface SkirmishAiStrategyContext {
  state: WorldState;
  playerId: string;
  tuning: Readonly<SkirmishAiTuning>;
  /** Current deterministic observations selected by the controller's perception policy. */
  enemyUnits: readonly UnitState[];
  /** Stable command boundary for strategies that do not mutate orders directly. */
  issueCommand: (state: WorldState, envelope: Parameters<typeof issueCommand>[1]) => IssueCommandResult;
  /** Compatibility hook used only by the built-in profile. */
  updateBuiltinBalancedPlayer: () => void;
}

export interface SkirmishAiStrategy {
  id: string;
  updatePlayer(context: SkirmishAiStrategyContext): void;
}

export const BUILTIN_BALANCED_SKIRMISH_AI_STRATEGY_ID = "builtin-balanced";

const strategiesById = new Map<string, SkirmishAiStrategy>();

export function registerSkirmishAiStrategy(strategy: SkirmishAiStrategy): () => void {
  validateStrategy(strategy);
  if (strategiesById.has(strategy.id)) {
    throw new Error(`skirmish AI strategy already exists: ${strategy.id}`);
  }

  strategiesById.set(strategy.id, strategy);
  return () => {
    strategiesById.delete(strategy.id);
  };
}

export function getSkirmishAiStrategy(strategyId: string): SkirmishAiStrategy {
  const strategy = strategiesById.get(strategyId);
  if (!strategy) {
    throw new Error(`unknown skirmish AI strategy: ${strategyId}`);
  }
  return strategy;
}

function validateStrategy(strategy: SkirmishAiStrategy): void {
  if (!strategy.id.trim()) {
    throw new Error("skirmish AI strategy id must not be empty");
  }
  if (typeof strategy.updatePlayer !== "function") {
    throw new Error(`skirmish AI strategy ${strategy.id} must provide updatePlayer`);
  }
}
