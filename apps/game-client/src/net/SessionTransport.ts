import { resourceDefinitions, type CommandEnvelope, type MapDefinition, type ResourceDefinition, type ScenarioDefinition } from "@shared";
import { advanceWorldTick, completeScenarioRuntime, CORE_CURRENT_VISIBILITY_SKIRMISH_AI_PERCEPTION_POLICY_ID, createInitialWorldState, createPlayerResearchState, createProjectileSystemState, issueCommand as issueWorldCommand, parseSerializedProjectileImpactLog, parseSerializedProjectileSystemState, PRODUCT_PROJECTILE_REGISTRY, SIM_TICK_SECONDS, SkirmishAiController, type IssueCommandResult, type ProjectileRegistry, type ScenarioStatus, type SkirmishAiControllerOptions, type WorldSnapshot, type WorldState } from "@simulation";
import type { GameLaunchContext } from "../session.js";
import { NetworkClient } from "./NetworkClient.js";

const REMOTE_POLL_INTERVAL_MS = 200;
const SIM_TICK_MILLISECONDS = SIM_TICK_SECONDS * 1000;
const MIN_PLAYBACK_SPEED = 0.25;
const MAX_PLAYBACK_SPEED = 4;

export interface SessionPlaybackState {
  paused: boolean;
  speed: number;
  controllable: boolean;
}

/**
 * Product-superset host boundary for local authoritative simulation only.
 * Executable policies remain caller-owned and are never part of a snapshot.
 */
export interface SessionTransportSimulationOptions {
  projectileRegistry?: ProjectileRegistry;
}

export interface SessionTransport {
  readonly isRemote: boolean;
  getSnapshot(): WorldState;
  replaceSnapshot(snapshot: WorldSnapshot, scenario?: ScenarioDefinition): boolean;
  getPlaybackState(): SessionPlaybackState;
  setPaused(paused: boolean): void;
  setPlaybackSpeed(speed: number): void;
  forceScenarioResult(status: Extract<ScenarioStatus, "victory" | "defeat">): boolean;
  update(time: number, delta: number): void;
  issueCommand(envelope: CommandEnvelope): Promise<IssueCommandResult> | IssueCommandResult;
  dispose(): void;
}

export class LocalSessionTransport implements SessionTransport {
  readonly isRemote = false;
  private lastTickAt = 0;
  private tickAccumulatorMs = 0;
  private paused = false;
  private playbackSpeed = 1;
  private readonly aiController: SkirmishAiController | null;

  constructor(
    private worldState: WorldState,
    aiPlayerIds: readonly string[] = [],
    aiOptions: SkirmishAiControllerOptions = {},
    private readonly mapMetadataSource: MapDefinition = worldState.map,
    private readonly projectileRegistry: ProjectileRegistry = PRODUCT_PROJECTILE_REGISTRY,
  ) {
    this.aiController = aiPlayerIds.length > 0 ? new SkirmishAiController(aiPlayerIds, aiOptions) : null;
    this.stopForTerminalScenario();
  }

  getSnapshot(): WorldState {
    return this.worldState;
  }

  replaceSnapshot(snapshot: WorldSnapshot, scenario?: ScenarioDefinition): boolean {
    this.worldState = normalizeWorldSnapshot(snapshot, scenario, this.mapMetadataSource);
    this.lastTickAt = 0;
    this.tickAccumulatorMs = 0;
    return true;
  }

  getPlaybackState(): SessionPlaybackState {
    const terminal = this.isTerminalScenario();

    return {
      paused: terminal || this.paused,
      speed: this.playbackSpeed,
      controllable: !terminal,
    };
  }

  setPaused(paused: boolean): void {
    if (this.stopForTerminalScenario()) {
      return;
    }

    this.paused = paused;
    this.tickAccumulatorMs = 0;
  }

  setPlaybackSpeed(speed: number): void {
    if (!Number.isFinite(speed)) {
      return;
    }

    this.playbackSpeed = Math.min(MAX_PLAYBACK_SPEED, Math.max(MIN_PLAYBACK_SPEED, speed));
  }

  forceScenarioResult(status: Extract<ScenarioStatus, "victory" | "defeat">): boolean {
    const completed = completeScenarioRuntime(this.worldState, status);

    if (completed) {
      this.stopForTerminalScenario();
    }

    return completed;
  }

  update(time: number, delta = 0): void {
    const elapsedMs = this.lastTickAt === 0 ? delta : time - this.lastTickAt;

    this.lastTickAt = time;

    if (this.paused || this.stopForTerminalScenario()) {
      this.tickAccumulatorMs = 0;
      return;
    }

    this.tickAccumulatorMs += Math.max(0, elapsedMs * this.playbackSpeed);

    if (this.tickAccumulatorMs < SIM_TICK_MILLISECONDS) {
      return;
    }

    while (this.tickAccumulatorMs >= SIM_TICK_MILLISECONDS) {
      advanceWorldTick(this.worldState, { projectileRegistry: this.projectileRegistry });

      if (this.stopForTerminalScenario()) {
        break;
      }

      this.aiController?.update(this.worldState);
      this.tickAccumulatorMs -= SIM_TICK_MILLISECONDS;
    }
  }

  issueCommand(envelope: CommandEnvelope): IssueCommandResult {
    return issueWorldCommand(this.worldState, envelope);
  }

  dispose(): void {
    // No external resources.
  }

  private isTerminalScenario(): boolean {
    return this.worldState.scenario.status !== "running";
  }

  private stopForTerminalScenario(): boolean {
    if (!this.isTerminalScenario()) {
      return false;
    }

    this.paused = true;
    this.tickAccumulatorMs = 0;
    return true;
  }
}

export class RemoteSessionTransport implements SessionTransport {
  readonly isRemote = true;
  private latestSnapshot: WorldState;
  private lastPollAt = Number.NEGATIVE_INFINITY;
  private snapshotRequestInFlight = false;
  private disposed = false;

  constructor(
    initialSnapshot: WorldState,
    private readonly networkClient: NetworkClient,
    private readonly sessionId: string,
    private readonly mapMetadataSource: MapDefinition = initialSnapshot.map,
  ) {
    this.latestSnapshot = initialSnapshot;
  }

  getSnapshot(): WorldState {
    return this.latestSnapshot;
  }

  replaceSnapshot(_snapshot: WorldSnapshot, _scenario?: ScenarioDefinition): boolean {
    return false;
  }

  getPlaybackState(): SessionPlaybackState {
    return {
      paused: false,
      speed: 1,
      controllable: false,
    };
  }

  setPaused(_paused: boolean): void {
    // Remote sessions are advanced by the authoritative server.
  }

  setPlaybackSpeed(_speed: number): void {
    // Remote sessions are advanced by the authoritative server.
  }

  forceScenarioResult(_status: Extract<ScenarioStatus, "victory" | "defeat">): boolean {
    return false;
  }

  update(time: number): void {
    if (this.disposed || this.snapshotRequestInFlight || time - this.lastPollAt < REMOTE_POLL_INTERVAL_MS) {
      return;
    }

    this.lastPollAt = time;
    this.snapshotRequestInFlight = true;
    void this.networkClient
      .getSessionSnapshot(this.sessionId)
      .then((snapshot) => {
        if (!this.disposed) {
          this.latestSnapshot = this.mergeSnapshot(snapshot);
        }
      })
      .catch((error: unknown) => {
        console.warn("Failed to fetch session snapshot", error);
      })
      .finally(() => {
        this.snapshotRequestInFlight = false;
      });
  }

  async issueCommand(envelope: CommandEnvelope): Promise<IssueCommandResult> {
    try {
      const result = await this.networkClient.issueCommand(envelope);

      if (!result.ok) {
        return { ok: false, reason: result.reason };
      }

      return { ok: true, envelope: result.command };
    } catch (error) {
      console.warn("Failed to issue session command", error);
      return { ok: false, reason: "command request failed" };
    }
  }

  dispose(): void {
    this.disposed = true;
  }

  private mergeSnapshot(snapshot: WorldSnapshot): WorldState {
    if (snapshot.tick === this.latestSnapshot.tick) {
      return this.latestSnapshot;
    }

    return normalizeWorldSnapshot(snapshot, undefined, this.mapMetadataSource);
  }
}

function normalizeWorldSnapshot(
  snapshot: WorldSnapshot,
  scenario?: ScenarioDefinition,
  mapMetadataSource?: MapDefinition,
): WorldState {
  const normalized = structuredClone(snapshot) as WorldState;
  normalized.scenario.scriptedEvents ??= {};
  normalized.scenario.events ??= [];
  normalized.scenario.completionMode = scenario?.id === normalized.scenario.id
    ? scenario.completionMode ?? "objectives"
    : normalized.scenario.completionMode === "scripted"
      ? "scripted"
      : "objectives";
  normalized.environment = normalizeRuntimeEnvironment(normalized.environment);
  normalized.playerResearch ??= {};
  normalized.playerCheats ??= {};
  normalized.combatEvents ??= [];
  normalized.projectileSystem = normalizeRuntimeProjectileSystem(normalized.projectileSystem);
  normalized.projectileImpactEvents = normalizeRuntimeProjectileImpactEvents(normalized.projectileImpactEvents);
  normalized.lastAcceptedCommand ??= null;
  hydrateScenarioObjectiveMetadata(normalized, scenario);
  hydrateMapMetadata(normalized, mapMetadataSource);

  for (const playerId of Object.keys(normalized.players)) {
    normalized.playerResearch[playerId] ??= createPlayerResearchState();
    normalized.playerCheats[playerId] ??= {};
  }

  hydrateRallyResourceKinds(normalized);

  return normalized;
}

function normalizeRuntimeProjectileSystem(value: unknown): WorldState["projectileSystem"] {
  if (value === undefined) return createProjectileSystemState();
  const parsed = parseSerializedProjectileSystemState(value);
  if (!parsed) throw new TypeError("world snapshot contains malformed projectile lifecycle state");
  return parsed;
}

function normalizeRuntimeProjectileImpactEvents(value: unknown): WorldState["projectileImpactEvents"] {
  if (value === undefined) return [];
  const parsed = parseSerializedProjectileImpactLog(value);
  if (!parsed) throw new TypeError("world snapshot contains malformed projectile impact events");
  return parsed;
}

function normalizeRuntimeEnvironment(value: unknown): WorldState["environment"] {
  if (!value || typeof value !== "object") {
    return {
      weather: "clear",
      timeOfDay01: 0,
      dayPhase: "day",
    };
  }

  const candidate = value as Partial<WorldState["environment"]>;
  const environment: WorldState["environment"] = {
    weather: candidate.weather === "rain" ? "rain" : "clear",
    timeOfDay01: typeof candidate.timeOfDay01 === "number" && Number.isFinite(candidate.timeOfDay01)
      ? Math.min(1, Math.max(0, candidate.timeOfDay01))
      : 0,
    dayPhase: candidate.dayPhase === "night" ? "night" : "day",
  };

  if (candidate.weatherOverride === "clear" || candidate.weatherOverride === "rain") {
    environment.weatherOverride = candidate.weatherOverride;
  }

  if (typeof candidate.weatherOverrideUntilTick === "number" && Number.isFinite(candidate.weatherOverrideUntilTick)) {
    environment.weatherOverrideUntilTick = Math.max(0, Math.floor(candidate.weatherOverrideUntilTick));
  }

  if (typeof candidate.lightLevel01 === "number" && Number.isFinite(candidate.lightLevel01)) {
    environment.lightLevel01 = Math.min(1, Math.max(0, candidate.lightLevel01));
  }
  if (typeof candidate.visualPaletteId === "string" && candidate.visualPaletteId.trim()) {
    environment.visualPaletteId = candidate.visualPaletteId;
  }

  return environment;
}

function hydrateMapMetadata(state: WorldState, mapMetadataSource: MapDefinition | undefined): void {
  if (!mapMetadataSource || mapMetadataSource.id !== state.map.id || !mapMetadataSource.sourceInitialView) {
    return;
  }

  state.map.sourceInitialView = { ...mapMetadataSource.sourceInitialView };
}

function hydrateScenarioObjectiveMetadata(state: WorldState, scenario: ScenarioDefinition | undefined): void {
  if (!scenario || scenario.id !== state.scenario.id) {
    return;
  }

  for (const objectiveDefinition of scenario.objectives) {
    const objective = state.scenario.objectives[objectiveDefinition.id];

    if (!objective) {
      continue;
    }

    objective.label = objectiveDefinition.label;
    objective.description = objectiveDefinition.description;
    objective.type = objectiveDefinition.type;
    objective.required = objectiveDefinition.required;

    setOptionalObjectiveMetadata(objective, "visibleAfterObjectiveId", objectiveDefinition.visibleAfterObjectiveId);
    setOptionalObjectiveMetadata(
      objective,
      "completionRequiresObjectiveIds",
      objectiveDefinition.completionRequiresObjectiveIds ? [...objectiveDefinition.completionRequiresObjectiveIds] : undefined,
    );
    setOptionalObjectiveMetadata(objective, "defeatOnFailure", objectiveDefinition.defeatOnFailure);
    setOptionalObjectiveMetadata(objective, "playerId", objectiveDefinition.playerId);
    setOptionalObjectiveMetadata(objective, "targetKind", objectiveDefinition.targetKind);
    setOptionalObjectiveMetadata(objective, "count", objectiveDefinition.count);
    setOptionalObjectiveMetadata(objective, "area", objectiveDefinition.area ? { ...objectiveDefinition.area } : undefined);
    setOptionalObjectiveMetadata(
      objective,
      "routeWaypoints",
      objectiveDefinition.routeWaypoints?.map((point) => ({ ...point })),
    );
    setOptionalObjectiveMetadata(objective, "routeWaypointLabels", objectiveDefinition.routeWaypointLabels ? [...objectiveDefinition.routeWaypointLabels] : undefined);
    setOptionalObjectiveMetadata(objective, "durationTicks", objectiveDefinition.durationTicks);
    setOptionalObjectiveMetadata(objective, "resources", objectiveDefinition.resources ? { ...objectiveDefinition.resources } : undefined);
  }
}

function setOptionalObjectiveMetadata<Key extends keyof WorldState["scenario"]["objectives"][string]>(
  objective: WorldState["scenario"]["objectives"][string],
  key: Key,
  value: WorldState["scenario"]["objectives"][string][Key] | undefined,
): void {
  if (value === undefined) {
    delete objective[key];
    return;
  }

  objective[key] = value;
}

function hydrateRallyResourceKinds(state: WorldState): void {
  const definitions = resourceDefinitions as Readonly<Record<string, ResourceDefinition>>;

  for (const unit of Object.values(state.units)) {
    const rallyPoint = unit.rallyPoint;

    if (!rallyPoint?.resourceId || rallyPoint.resourceKind) {
      continue;
    }

    const resource = findSnapshotResourceNode(state, rallyPoint.resourceId);
    const resourceKind = resource ? definitions[resource.kind]?.yieldResource : undefined;

    if (resourceKind) {
      rallyPoint.resourceKind = resourceKind;
    }
  }
}

function findSnapshotResourceNode(
  state: WorldState,
  resourceId: string,
): { kind: string } | null {
  for (const layer of state.map.layers) {
    for (const tile of layer.tiles) {
      if (tile.resource?.id === resourceId) {
        return tile.resource;
      }
    }
  }

  return null;
}

export function createSessionTransport(
  context: GameLaunchContext,
  map: MapDefinition,
  players: string[],
  networkClient = new NetworkClient(),
  simulationOptions: SessionTransportSimulationOptions = {},
): SessionTransport {
  const initialSnapshot = context.resumeSnapshot
    ? normalizeWorldSnapshot(context.resumeSnapshot, context.scenario, map)
    : createInitialWorldState(map, players, context.scenario, context.playerTeams);

  if (context.connectionMode === "local" || !context.session) {
    return new LocalSessionTransport(
      initialSnapshot,
      getLocalAiPlayerIds(context),
      {
        ...(context.aiDifficulty ? { difficulty: context.aiDifficulty } : {}),
        perceptionPolicyId: CORE_CURRENT_VISIBILITY_SKIRMISH_AI_PERCEPTION_POLICY_ID,
      },
      map,
      simulationOptions.projectileRegistry ?? PRODUCT_PROJECTILE_REGISTRY,
    );
  }

  return new RemoteSessionTransport(initialSnapshot, networkClient, context.session.id, map);
}

function getLocalAiPlayerIds(context: GameLaunchContext): readonly string[] {
  if (context.scenarioType === "campaign") {
    return [];
  }

  return context.aiPlayerIds ?? [];
}
