import {
  getScenarioLaunchPlayerIds,
  getScenarioLaunchPlayerTeams,
  type ConnectionMode,
  type EntryMode,
  type GridPoint,
  type MapDefinition,
  type ResourceNode,
  type ScenarioDefinition,
  type ScenarioType,
  type SessionSummary,
} from "@shared";
import type { PlayerVisibilityState, SkirmishAiDifficulty, WorldSnapshot } from "@simulation";

export const QUICK_SAVE_VERSION = 4;
export const SUPPORTED_QUICK_SAVE_VERSIONS = [2, 3, QUICK_SAVE_VERSION] as const;
export const LATEST_QUICK_SAVE_STORAGE_KEY = "isorts.quickSave.latest";

export type QuickSaveVersion = (typeof SUPPORTED_QUICK_SAVE_VERSIONS)[number];

export interface SerializedPlayerVisibilityState {
  width: number;
  height: number;
  tiles: number[];
}

export type SerializedControlGroups = Record<string, string[]>;

export interface SerializedKnownResourceView {
  point: GridPoint;
  resource: ResourceNode;
}

export interface SerializedMissionDialogueState {
  dialogueId: string;
  lineIndex: number;
}

export interface GameLaunchContext {
  entryMode: EntryMode;
  connectionMode: ConnectionMode;
  scenarioType: ScenarioType;
  session: SessionSummary | null;
  serverOnline: boolean;
  mapId?: string;
  mapDefinition?: MapDefinition;
  scenario?: ScenarioDefinition;
  playerIds?: string[];
  playerTeams?: Record<string, string>;
  aiPlayerIds?: string[];
  aiDifficulty?: SkirmishAiDifficulty;
  resumeSnapshot?: WorldSnapshot;
  resumePlayerVisibility?: SerializedPlayerVisibilityState;
  resumeControlGroups?: SerializedControlGroups;
  resumeKnownResources?: SerializedKnownResourceView[];
  resumeMissionDialogue?: SerializedMissionDialogueState;
  triggeredMissionDialogueIds?: string[];
}

export interface QuickSavePayload {
  version: QuickSaveVersion;
  contextKey: string;
  savedAt: string;
  launchContext: GameLaunchContext;
  snapshot: WorldSnapshot;
  playerVisibility?: SerializedPlayerVisibilityState;
  controlGroups?: SerializedControlGroups;
  knownResources?: SerializedKnownResourceView[];
  activeMissionDialogue?: SerializedMissionDialogueState;
  triggeredMissionDialogueIds?: string[];
}

export function createFreshLaunchContext(context: GameLaunchContext): GameLaunchContext {
  const freshContext: GameLaunchContext = { ...context };

  delete freshContext.resumeSnapshot;
  delete freshContext.resumePlayerVisibility;
  delete freshContext.resumeControlGroups;
  delete freshContext.resumeKnownResources;
  delete freshContext.resumeMissionDialogue;
  delete freshContext.triggeredMissionDialogueIds;

  return freshContext;
}

export function createCampaignMissionLaunchContext(
  scenario: ScenarioDefinition,
  map: MapDefinition,
): GameLaunchContext {
  return {
    entryMode: "singleplayer",
    connectionMode: "local",
    scenarioType: "campaign",
    session: null,
    serverOnline: false,
    mapId: map.id,
    mapDefinition: map,
    scenario,
    playerIds: getScenarioLaunchPlayerIds(scenario),
    playerTeams: getScenarioLaunchPlayerTeams(scenario),
  };
}

export function inferQuickSaveAiPlayerIds(
  snapshot: WorldSnapshot,
  savedAiPlayerIds: readonly string[] | undefined,
): string[] {
  const playerIds = Object.keys(snapshot.players);
  const playerIdSet = new Set(playerIds);
  const primaryPlayerId = playerIds[0];

  if (!primaryPlayerId) {
    return [];
  }

  if (savedAiPlayerIds !== undefined) {
    return uniquePlayerIds(savedAiPlayerIds)
      .filter((playerId) => playerId !== primaryPlayerId && playerIdSet.has(playerId));
  }

  const primaryTeamId = getSnapshotPlayerTeamId(snapshot, primaryPlayerId);

  return playerIds
    .slice(1)
    .filter((playerId) => getSnapshotPlayerTeamId(snapshot, playerId) !== primaryTeamId);
}

export function isSupportedQuickSaveVersion(value: unknown): value is QuickSaveVersion {
  return SUPPORTED_QUICK_SAVE_VERSIONS.includes(value as QuickSaveVersion);
}

export function isOptionalStringArray(value: unknown): value is string[] | undefined {
  return value === undefined || (Array.isArray(value) && value.every((item) => typeof item === "string"));
}

export function normalizeOptionalMissionDialogueState(value: unknown): SerializedMissionDialogueState | undefined | null {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value) || typeof value.dialogueId !== "string") {
    return null;
  }

  const dialogueId = value.dialogueId.trim();
  const lineIndex = value.lineIndex;

  if (!dialogueId || typeof lineIndex !== "number" || !Number.isInteger(lineIndex) || lineIndex < 0) {
    return null;
  }

  return {
    dialogueId,
    lineIndex,
  };
}

export function normalizeSerializedControlGroups(value: unknown): SerializedControlGroups | null {
  if (!isRecord(value)) {
    return null;
  }

  const groups: SerializedControlGroups = {};

  for (const [group, unitIds] of Object.entries(value)) {
    if (!/^\d$/.test(group) || !Array.isArray(unitIds) || !unitIds.every((unitId) => typeof unitId === "string")) {
      return null;
    }

    groups[group] = [...new Set(unitIds)];
  }

  return groups;
}

export function normalizeSerializedKnownResources(value: unknown): SerializedKnownResourceView[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const resources: SerializedKnownResourceView[] = [];
  const seenPoints = new Set<string>();

  for (const item of value) {
    if (!isRecord(item) || !isGridPoint(item.point) || !isSerializedResourceNode(item.resource)) {
      return null;
    }

    const point = {
      x: Math.round(item.point.x),
      y: Math.round(item.point.y),
    };
    const key = `${point.x},${point.y}`;

    if (seenPoints.has(key)) {
      continue;
    }

    seenPoints.add(key);
    resources.push({
      point,
      resource: normalizeSerializedResourceNode(item.resource),
    });
  }

  return resources;
}

export function normalizeSavedWorldSnapshot(snapshot: unknown): WorldSnapshot | null {
  if (!isRecord(snapshot)) {
    return null;
  }

  const candidate = snapshot as Partial<WorldSnapshot>;

  if (
    typeof candidate.tick !== "number" ||
    !Number.isFinite(candidate.tick) ||
    !isRecord(candidate.map) ||
    typeof candidate.map.id !== "string" ||
    typeof candidate.map.width !== "number" ||
    typeof candidate.map.height !== "number" ||
    !Array.isArray(candidate.map.layers) ||
    !isRecord(candidate.scenario) ||
    typeof candidate.scenario.id !== "string" ||
    !isScenarioStatus(candidate.scenario.status) ||
    !isRecord(candidate.scenario.objectives) ||
    (candidate.scenario.scriptedEvents !== undefined && !isRecord(candidate.scenario.scriptedEvents)) ||
    (candidate.scenario.events !== undefined && !Array.isArray(candidate.scenario.events)) ||
    !isRecord(candidate.players) ||
    !isRecord(candidate.units) ||
    !isRecord(candidate.playerResources) ||
    (candidate.playerResearch !== undefined && !isRecord(candidate.playerResearch)) ||
    (candidate.playerCheats !== undefined && !isRecord(candidate.playerCheats)) ||
    (candidate.combatEvents !== undefined && !Array.isArray(candidate.combatEvents))
  ) {
    return null;
  }

  candidate.scenario.scriptedEvents ??= {};
  candidate.scenario.events ??= [];
  candidate.scenario.completionMode = candidate.scenario.completionMode === "scripted" ? "scripted" : "objectives";
  candidate.environment = normalizeSavedEnvironment(candidate.environment);
  candidate.playerResearch ??= {};
  candidate.playerCheats ??= {};
  candidate.combatEvents ??= [];
  candidate.lastAcceptedCommand ??= null;

  return candidate as WorldSnapshot;
}

function normalizeSavedEnvironment(value: unknown): WorldSnapshot["environment"] {
  if (!isRecord(value)) {
    return {
      weather: "clear",
      timeOfDay01: 0,
      dayPhase: "day",
    };
  }

  const weather = isWeatherKind(value.weather) ? value.weather : "clear";
  const timeOfDay01 = typeof value.timeOfDay01 === "number" && Number.isFinite(value.timeOfDay01)
    ? Math.min(1, Math.max(0, value.timeOfDay01))
    : 0;
  const dayPhase = value.dayPhase === "night" ? "night" : "day";
  const normalized: WorldSnapshot["environment"] = {
    weather,
    timeOfDay01,
    dayPhase,
  };

  if (isWeatherKind(value.weatherOverride)) {
    normalized.weatherOverride = value.weatherOverride;
  }

  if (typeof value.weatherOverrideUntilTick === "number" && Number.isFinite(value.weatherOverrideUntilTick)) {
    normalized.weatherOverrideUntilTick = Math.max(0, Math.floor(value.weatherOverrideUntilTick));
  }

  return normalized;
}

export function serializePlayerVisibilityState(visibility: PlayerVisibilityState): SerializedPlayerVisibilityState {
  return {
    width: visibility.width,
    height: visibility.height,
    tiles: Array.from(visibility.tiles),
  };
}

export function deserializePlayerVisibilityState(value: unknown): PlayerVisibilityState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<SerializedPlayerVisibilityState>;
  const { width, height, tiles } = candidate;

  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    !Array.isArray(tiles) ||
    tiles.length !== width * height ||
    !tiles.every((tile) => Number.isInteger(tile) && tile >= 0 && tile <= 2)
  ) {
    return null;
  }

  return {
    width,
    height,
    tiles: Uint8Array.from(tiles),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isGridPoint(value: unknown): value is GridPoint {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    typeof value.y === "number" &&
    Number.isFinite(value.y)
  );
}

function isSerializedResourceNode(value: unknown): value is ResourceNode {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.kind === "string" &&
    typeof value.amount === "number" &&
    Number.isFinite(value.amount) &&
    (value.state === undefined || value.state === "active" || value.state === "depleted") &&
    (value.regrowTicks === undefined || (typeof value.regrowTicks === "number" && Number.isFinite(value.regrowTicks)))
  );
}

function normalizeSerializedResourceNode(resource: ResourceNode): ResourceNode {
  const normalized: ResourceNode = {
    id: resource.id,
    kind: resource.kind,
    amount: Math.max(0, resource.amount),
  };

  if (resource.state !== undefined) {
    normalized.state = resource.state;
  }

  if (resource.regrowTicks !== undefined) {
    normalized.regrowTicks = Math.max(0, resource.regrowTicks);
  }

  return normalized;
}

function uniquePlayerIds(playerIds: readonly string[]): string[] {
  return [...new Set(playerIds.filter((playerId): playerId is string => typeof playerId === "string"))];
}

function getSnapshotPlayerTeamId(snapshot: WorldSnapshot, playerId: string): string {
  return snapshot.players[playerId]?.teamId ?? playerId;
}

function isScenarioStatus(value: unknown): value is WorldSnapshot["scenario"]["status"] {
  return value === "running" || value === "victory" || value === "defeat";
}

function isWeatherKind(value: unknown): value is WorldSnapshot["environment"]["weather"] {
  return value === "clear" || value === "rain";
}
