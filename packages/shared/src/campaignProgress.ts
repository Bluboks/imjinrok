import type { ScenarioDefinition } from "./scenarios.js";

export const CAMPAIGN_PROGRESS_VERSION = 1;
export const IMJINROK_CAMPAIGN_PROGRESS_STORAGE_KEY = "isorts.campaign.imjinrok.progress";

export interface CampaignProgressState {
  version: typeof CAMPAIGN_PROGRESS_VERSION;
  completedScenarioIds: string[];
  lastCompletedScenarioId?: string;
  updatedAt?: string;
}

export function createCampaignProgressState(
  scenarios: readonly ScenarioDefinition[],
  completedScenarioIds: readonly string[] = [],
  lastCompletedScenarioId?: string,
  updatedAt?: string,
): CampaignProgressState {
  const knownScenarioIds = new Set(scenarios.map((scenario) => scenario.id));
  const completedSet = new Set(completedScenarioIds.filter((scenarioId) => knownScenarioIds.has(scenarioId)));
  const progress: CampaignProgressState = {
    version: CAMPAIGN_PROGRESS_VERSION,
    completedScenarioIds: scenarios.filter((scenario) => completedSet.has(scenario.id)).map((scenario) => scenario.id),
  };

  if (lastCompletedScenarioId && knownScenarioIds.has(lastCompletedScenarioId)) {
    progress.lastCompletedScenarioId = lastCompletedScenarioId;
  }

  if (updatedAt) {
    progress.updatedAt = updatedAt;
  }

  return progress;
}

export function normalizeCampaignProgressState(
  value: unknown,
  scenarios: readonly ScenarioDefinition[],
): CampaignProgressState {
  if (!value || typeof value !== "object") {
    return createCampaignProgressState(scenarios);
  }

  const progress = value as Partial<CampaignProgressState>;
  const completedScenarioIds = Array.isArray(progress.completedScenarioIds)
    ? progress.completedScenarioIds.filter((scenarioId): scenarioId is string => typeof scenarioId === "string")
    : [];
  const lastCompletedScenarioId = typeof progress.lastCompletedScenarioId === "string" ? progress.lastCompletedScenarioId : undefined;
  const updatedAt = typeof progress.updatedAt === "string" ? progress.updatedAt : undefined;

  return createCampaignProgressState(scenarios, completedScenarioIds, lastCompletedScenarioId, updatedAt);
}

export function markCampaignScenarioCompleted(
  progress: CampaignProgressState,
  scenarios: readonly ScenarioDefinition[],
  scenarioId: string,
  updatedAt?: string,
): CampaignProgressState {
  return createCampaignProgressState(
    scenarios,
    [...progress.completedScenarioIds, scenarioId],
    scenarioId,
    updatedAt,
  );
}

export function isCampaignScenarioCompleted(progress: CampaignProgressState, scenarioId: string): boolean {
  return progress.completedScenarioIds.includes(scenarioId);
}

export function isCampaignComplete(
  scenarios: readonly ScenarioDefinition[],
  progress: CampaignProgressState,
): boolean {
  return scenarios.length > 0 && scenarios.every((scenario) => isCampaignScenarioCompleted(progress, scenario.id));
}

export function isCampaignScenarioUnlocked(
  scenarios: readonly ScenarioDefinition[],
  progress: CampaignProgressState,
  scenarioId: string,
): boolean {
  const index = scenarios.findIndex((scenario) => scenario.id === scenarioId);

  if (index < 0) {
    return false;
  }

  if (index === 0 || isCampaignScenarioCompleted(progress, scenarioId)) {
    return true;
  }

  const previousScenario = scenarios[index - 1];

  return previousScenario ? isCampaignScenarioCompleted(progress, previousScenario.id) : false;
}

export function getNextCampaignScenario(
  scenarios: readonly ScenarioDefinition[],
  scenarioId: string,
): ScenarioDefinition | null {
  const index = scenarios.findIndex((scenario) => scenario.id === scenarioId);

  return index >= 0 ? scenarios[index + 1] ?? null : null;
}

export function getCampaignContinueScenario(
  scenarios: readonly ScenarioDefinition[],
  progress: CampaignProgressState,
): ScenarioDefinition | null {
  if (scenarios.length === 0) {
    return null;
  }

  const completedScenarioIds = new Set(progress.completedScenarioIds);

  return scenarios.find((scenario) => !completedScenarioIds.has(scenario.id)) ?? null;
}
