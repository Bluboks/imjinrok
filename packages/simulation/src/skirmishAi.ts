import {
  getTileAt,
  resourceDefinitions,
  unitCanPerformAction,
  unitDefinitions,
  type BankResourceKind,
  type BuildingDefinitionId,
  type GridPoint,
  type ResourceDefinition,
  type ResourceNode,
  type UnitDefinitionId,
} from "../../shared/src/index.js";
import { isUnitUnderConstruction } from "./construction.js";
import { findBuildWorkPath, findUnitSpawnPoint, issueCommand as issueWorldCommand, TOWN_BELL_RADIUS } from "./commands.js";
import { arePlayersEnemies } from "./diplomacy.js";
import { createUnitState } from "./entities.js";
import { findNavigationRouteForUnit, findPathForUnit } from "./navigation.js";
import { validateBuildingPlacement } from "./placement.js";
import { getPlayerPopulationState } from "./population.js";
import { isResearchCompleted, isResearchPending } from "./research.js";
import { getResourceNodeState } from "./resources.js";
import {
  CORE_OMNISCIENT_SKIRMISH_AI_PERCEPTION_POLICY_ID,
  getSkirmishAiPerceptionPolicy,
  type SkirmishAiPerceptionPolicy,
} from "./skirmishAiPerception.js";
import {
  BUILTIN_BALANCED_SKIRMISH_AI_STRATEGY_ID,
  getSkirmishAiStrategy,
  registerSkirmishAiStrategy,
  type SkirmishAiStrategy,
} from "./skirmishAiStrategy.js";
import type { UnitState, WorldState } from "./types.js";

export type SkirmishAiDifficulty = "easy" | "normal" | "hard";

const BUILTIN_RESOURCE_DEFINITIONS = resourceDefinitions as Readonly<Record<string, ResourceDefinition>>;

export interface SkirmishAiTuning {
  orderIntervalTicks: number;
  attackStartTicks: number;
  attackIntervalTicks: number;
  attackWaveSize: number;
  targetWorkerCount: number;
  maxEconomyQueue: number;
  maxMilitaryQueue: number;
  populationBuffer: number;
  workerHarasserCount: number;
  baseDefenseRadius: number;
  maxBaseDefenders: number;
  maxRepairWorkers: number;
  maxDefensiveBeacons: number;
}

export interface SkirmishAiControllerOptions {
  difficulty?: SkirmishAiDifficulty;
  tuning?: Partial<SkirmishAiTuning>;
  /** Stable registered strategy id. Existing callers retain builtin-balanced. */
  strategyId?: string;
  /**
   * Stable registered perception policy id. Defaults to core:omniscient for
   * direct-controller compatibility; product local skirmishes opt into fair visibility.
   */
  perceptionPolicyId?: string;
}

export const SKIRMISH_AI_TUNING: Record<SkirmishAiDifficulty, SkirmishAiTuning> = {
  easy: {
    orderIntervalTicks: 60,
    attackStartTicks: 720,
    attackIntervalTicks: 300,
    attackWaveSize: 1,
    targetWorkerCount: 5,
    maxEconomyQueue: 1,
    maxMilitaryQueue: 1,
    populationBuffer: 1,
    workerHarasserCount: 0,
    baseDefenseRadius: 10,
    maxBaseDefenders: 2,
    maxRepairWorkers: 1,
    maxDefensiveBeacons: 0,
  },
  normal: {
    orderIntervalTicks: 45,
    attackStartTicks: 420,
    attackIntervalTicks: 180,
    attackWaveSize: 3,
    targetWorkerCount: 8,
    maxEconomyQueue: 1,
    maxMilitaryQueue: 2,
    populationBuffer: 2,
    workerHarasserCount: 1,
    baseDefenseRadius: 14,
    maxBaseDefenders: 4,
    maxRepairWorkers: 2,
    maxDefensiveBeacons: 1,
  },
  hard: {
    orderIntervalTicks: 30,
    attackStartTicks: 300,
    attackIntervalTicks: 120,
    attackWaveSize: 5,
    targetWorkerCount: 12,
    maxEconomyQueue: 2,
    maxMilitaryQueue: 3,
    populationBuffer: 3,
    workerHarasserCount: 1,
    baseDefenseRadius: 18,
    maxBaseDefenders: 6,
    maxRepairWorkers: 3,
    maxDefensiveBeacons: 2,
  },
};

const builtinBalancedStrategy: SkirmishAiStrategy = {
  id: BUILTIN_BALANCED_SKIRMISH_AI_STRATEGY_ID,
  updatePlayer: ({ updateBuiltinBalancedPlayer }) => updateBuiltinBalancedPlayer(),
};

registerSkirmishAiStrategy(builtinBalancedStrategy);

interface ResourceTarget {
  id: string;
  point: GridPoint;
  resource: ResourceNode;
  yieldResource: BankResourceKind;
}

export class SkirmishAiController {
  private readonly tuning: SkirmishAiTuning;
  private readonly strategy: SkirmishAiStrategy;
  private readonly perceptionPolicy: SkirmishAiPerceptionPolicy;
  private readonly initializedAutoAbilityPlayers = new Set<string>();

  constructor(
    private readonly playerIds: readonly string[],
    options: SkirmishAiControllerOptions = {},
  ) {
    this.tuning = {
      ...SKIRMISH_AI_TUNING[options.difficulty ?? "normal"],
      ...(options.tuning ?? {}),
    };
    this.strategy = getSkirmishAiStrategy(options.strategyId ?? BUILTIN_BALANCED_SKIRMISH_AI_STRATEGY_ID);
    this.perceptionPolicy = getSkirmishAiPerceptionPolicy(
      options.perceptionPolicyId ?? CORE_OMNISCIENT_SKIRMISH_AI_PERCEPTION_POLICY_ID,
    );
  }

  update(state: WorldState): void {
    const orderIntervalTicks = Math.max(1, Math.round(this.tuning.orderIntervalTicks));

    if (state.scenario.status !== "running" || state.tick % orderIntervalTicks !== 0) {
      return;
    }

    for (const playerId of [...this.playerIds].sort()) {
      if (state.players[playerId]) {
        const enemyUnits = this.collectPerceivedEnemyUnits(state, playerId);
        this.strategy.updatePlayer({
          state,
          playerId,
          tuning: this.tuning,
          enemyUnits,
          issueCommand: issueWorldCommand,
          updateBuiltinBalancedPlayer: () => this.updateBuiltinBalancedPlayer(state, playerId, enemyUnits),
        });
      }
    }
  }

  private collectPerceivedEnemyUnits(state: WorldState, playerId: string): UnitState[] {
    const unitsById = new Map<string, UnitState>();

    for (const unit of this.perceptionPolicy.selectEnemyUnits({ state, playerId })) {
      if (state.units[unit.id] === unit && arePlayersEnemies(state, unit.playerId, playerId)) {
        unitsById.set(unit.id, unit);
      }
    }

    return [...unitsById.values()].sort((left, right) => left.id.localeCompare(right.id));
  }

  private updateBuiltinBalancedPlayer(state: WorldState, playerId: string, enemyUnits: readonly UnitState[]): void {
    const player = state.players[playerId];
    if (!this.initializedAutoAbilityPlayers.has(playerId)) {
      // Undefined is the source-aligned disabled default; an explicit command
      // (including false) wins over this built-in AI convenience exactly once.
      if (player && player.magicAutoUseEnabled === undefined) {
        player.magicAutoUseEnabled = true;
      }
      this.initializedAutoAbilityPlayers.add(playerId);
    }

    const units = Object.values(state.units)
      .filter((unit) => unit.playerId === playerId)
      .sort((a, b) => a.id.localeCompare(b.id));

    const completedUnits = units.filter((unit) => !isUnitUnderConstruction(unit));
    const workers = completedUnits.filter((unit) => unitCanPerformAction(unit.kind, "gather"));
    const townCenters = completedUnits.filter((unit) => unitCanPerformAction(unit.kind, "train-villager"));
    const barracks = completedUnits.filter((unit) => unitCanPerformAction(unit.kind, "train-swordsman"));
    const hasAnyTownCenter = units.some((unit) => unit.kind === "town-center");
    const hasAnyBarracks = units.some((unit) => unit.kind === "barracks");
    const fighters = completedUnits.filter((unit) => unit.kind !== "villager" && unitCanPerformAction(unit.kind, "attack-move"));
    const resourceTargets = collectResourceTargets(state);
    const resourcePlan = createResourceGatherPlan(
      state,
      playerId,
      workers.length,
      hasAnyBarracks,
      this.tuning.maxDefensiveBeacons,
      resourceTargets,
    );
    const resourceAssignments = countWorkerResourceAssignments(workers, resourceTargets);
    const reservedWorkerIds = collectReservedWorkerIds(workers);
    const newlyRepairingWorkerIds = new Set<string>();

    if (!hasAnyTownCenter) {
      this.tryBuildTownCenter(state, playerId, workers, resourceTargets, reservedWorkerIds);
    }

    this.ensurePopulationRoom(state, playerId, workers, townCenters, reservedWorkerIds);

    townCenters.forEach((building) => {
      this.ensureGatherRally(state, playerId, building, resourceTargets);
      this.ensureLoomResearch(state, playerId, building, workers);

      if (workers.length + countQueuedUnits(units, "villager") < this.tuning.targetWorkerCount) {
        this.issueTrainUnit(state, playerId, building, "villager", this.tuning.maxEconomyQueue);
      }
    });

    if (!hasAnyBarracks) {
      this.tryBuildBarracks(state, playerId, workers, townCenters, reservedWorkerIds);
    }

    this.repairDamagedBuildings(state, playerId, workers, completedUnits, reservedWorkerIds, newlyRepairingWorkerIds);
    this.ensureDefensiveBeacons(state, playerId, workers, units, townCenters, reservedWorkerIds);

    barracks.forEach((building) => {
      this.ensureAttackRally(state, playerId, building, enemyUnits);
      this.issueTrainMilitaryUnit(state, playerId, building, units);
    });

    const baseThreat = findNearestThreatNearBase(completedUnits, enemyUnits, this.tuning.baseDefenseRadius);
    const defenderIds = new Set<string>();

    if (baseThreat) {
      const recalledWorkerIds = this.issueTownBellResponse(state, playerId, townCenters, workers, baseThreat);
      recalledWorkerIds.forEach((workerId) => reservedWorkerIds.add(workerId));

      fighters.forEach((unit) => {
        if (isDefendingThreat(unit, baseThreat)) {
          defenderIds.add(unit.id);
          return;
        }

        const route = findNavigationRouteForUnit(state, unit, baseThreat.position);

        if (defenderIds.size >= this.tuning.maxBaseDefenders || !route) {
          return;
        }

        if (this.issueAttackMove(state, playerId, unit, baseThreat.position)) {
          defenderIds.add(unit.id);
        }
      });
    }

    this.issueAttackWave(state, playerId, fighters, defenderIds, enemyUnits);

    workers.forEach((unit, index) => {
      if (reservedWorkerIds.has(unit.id)) {
        return;
      }

      if (this.shouldSendWorkerHarasser(state, index)) {
        const enemy = findNearestReachableEnemyUnit(state, unit, enemyUnits);

        if (enemy) {
          this.issueAttackMove(state, playerId, unit, enemy.position);
          return;
        }
      }

      if (unit.currentOrder?.type === "gather") {
        const resourceId = unit.currentOrder.resourceId;
        const currentTarget = findResourceTargetById(resourceTargets, resourceId);

        if (currentTarget && shouldKeepActiveGatherAssignment(state, unit, currentTarget, resourcePlan, resourceAssignments)) {
          return;
        }

        if (currentTarget) {
          resourceAssignments[currentTarget.yieldResource] = Math.max(0, resourceAssignments[currentTarget.yieldResource] - 1);
        }
      }

      const target = findPlannedResourceTarget(state, unit, resourceTargets, resourcePlan, resourceAssignments) ??
        findNearestReachableResource(state, unit, resourceTargets);

      if (target) {
        const result = this.issueGather(state, playerId, unit, target);

        if (result.ok) {
          resourceAssignments[target.yieldResource] += 1;
        }
      }
    });
  }

  private issueTownBellResponse(
    state: WorldState,
    playerId: string,
    townCenters: readonly UnitState[],
    workers: readonly UnitState[],
    threat: UnitState,
  ): string[] {
    const townCenter = findNearestUnit(townCenters, threat.position);

    if (!townCenter || !unitCanPerformAction(townCenter.kind, "town-bell")) {
      return [];
    }

    const workersInBellRange = workers.filter((worker) =>
      worker.currentOrder?.type !== "build" &&
      worker.currentOrder?.type !== "repair" &&
      getDistanceSq(worker.position, townCenter.position) <= TOWN_BELL_RADIUS * TOWN_BELL_RADIUS,
    );

    if (workersInBellRange.length === 0) {
      return [];
    }

    const alreadyRecalled = workersInBellRange.every((worker) =>
      worker.currentOrder?.type === "move" &&
      getDistanceSq(worker.currentOrder.target, townCenter.position) <= 4,
    );

    if (!alreadyRecalled) {
      issueWorldCommand(state, {
        sessionId: "local-ai",
        playerId,
        issuedAtTick: state.tick,
        command: {
          type: "town-bell",
          buildingUnitId: townCenter.id,
        },
      });
    }

    return workersInBellRange.map((worker) => worker.id);
  }

  private ensureLoomResearch(
    state: WorldState,
    playerId: string,
    townCenter: UnitState,
    workers: readonly UnitState[],
  ): void {
    const workerThreshold = Math.min(this.tuning.targetWorkerCount, 8);

    if (
      workers.length < workerThreshold ||
      isResearchCompleted(state, playerId, "loom") ||
      isResearchPending(state, playerId, "loom") ||
      (townCenter.productionQueue?.length ?? 0) > 0 ||
      (townCenter.researchQueue?.length ?? 0) > 0
    ) {
      return;
    }

    issueWorldCommand(state, {
      sessionId: "local-ai",
      playerId,
      issuedAtTick: state.tick,
      command: {
        type: "research",
        buildingUnitId: townCenter.id,
        research: "loom",
      },
    });
  }

  private ensurePopulationRoom(
    state: WorldState,
    playerId: string,
    workers: readonly UnitState[],
    townCenters: readonly UnitState[],
    reservedWorkerIds: Set<string>,
  ): void {
    const population = getPlayerPopulationState(state, playerId);

    if (population.cap >= population.limit || population.available > this.tuning.populationBuffer) {
      return;
    }

    if (Object.values(state.units).some((unit) => unit.playerId === playerId && unit.kind === "house" && isUnitUnderConstruction(unit))) {
      return;
    }

    const builder = findAvailableWorker(workers, reservedWorkerIds);
    const anchor = townCenters[0] ?? builder;
    const target = builder && anchor ? findBuildTargetNear(state, builder, anchor.position, "house") : null;

    if (!builder || !target) {
      return;
    }

    const result = issueWorldCommand(state, {
      sessionId: "local-ai",
      playerId,
      issuedAtTick: state.tick,
      command: {
        type: "build",
        builderUnitId: builder.id,
        building: "house",
        target,
      },
    });

    if (result.ok) {
      reservedWorkerIds.add(builder.id);
    }
  }

  private shouldSendWorkerHarasser(state: WorldState, workerIndex: number): boolean {
    return (
      workerIndex < this.tuning.workerHarasserCount &&
      state.tick >= this.tuning.attackStartTicks * 2 &&
      state.tick % this.tuning.attackIntervalTicks === 0
    );
  }

  private issueGather(state: WorldState, playerId: string, unit: UnitState, target: ResourceTarget): ReturnType<typeof issueWorldCommand> {
    return issueWorldCommand(state, {
      sessionId: "local-ai",
      playerId,
      issuedAtTick: state.tick,
      command: {
        type: "gather",
        unitId: unit.id,
        resourceId: target.id,
      },
    });
  }

  private tryBuildTownCenter(
    state: WorldState,
    playerId: string,
    workers: readonly UnitState[],
    resourceTargets: readonly ResourceTarget[],
    reservedWorkerIds: Set<string>,
  ): void {
    const builder = findAvailableWorker(workers, reservedWorkerIds);

    if (!builder) {
      return;
    }

    const resourceAnchor = findNearestResource(builder.position, resourceTargets);
    const anchor = resourceAnchor?.point ?? builder.position;
    const target = findBuildTargetNear(state, builder, anchor, "town-center", 16);

    if (!target) {
      return;
    }

    const result = issueWorldCommand(state, {
      sessionId: "local-ai",
      playerId,
      issuedAtTick: state.tick,
      command: {
        type: "build",
        builderUnitId: builder.id,
        building: "town-center",
        target,
      },
    });

    if (result.ok) {
      reservedWorkerIds.add(builder.id);
    }
  }

  private issueTrainMilitaryUnit(
    state: WorldState,
    playerId: string,
    building: UnitState,
    units: readonly UnitState[],
  ): void {
    const preferredUnit = chooseBarracksUnit(units);
    const fallbackUnit = preferredUnit === "archer" ? "swordsman" : "archer";

    if (this.issueTrainUnit(state, playerId, building, preferredUnit, this.tuning.maxMilitaryQueue)) {
      return;
    }

    this.issueTrainUnit(state, playerId, building, fallbackUnit, this.tuning.maxMilitaryQueue);
  }

  private issueTrainUnit(
    state: WorldState,
    playerId: string,
    building: UnitState,
    unit: UnitDefinitionId,
    maxQueueSize: number,
  ): boolean {
    if ((building.productionQueue?.length ?? 0) >= maxQueueSize) {
      return false;
    }

    const result = issueWorldCommand(state, {
      sessionId: "local-ai",
      playerId,
      issuedAtTick: state.tick,
      command: {
        type: "train-unit",
        buildingUnitId: building.id,
        unit,
      },
    });

    return result.ok && result.navigationAccepted === true;
  }

  private tryBuildBarracks(
    state: WorldState,
    playerId: string,
    workers: readonly UnitState[],
    townCenters: readonly UnitState[],
    reservedWorkerIds: Set<string>,
  ): void {
    const builder = findAvailableWorker(workers, reservedWorkerIds);
    const anchor = townCenters[0] ?? builder;
    const target = builder && anchor ? findBuildTargetNear(state, builder, anchor.position, "barracks") : null;

    if (!builder || !target) {
      return;
    }

    const result = issueWorldCommand(state, {
      sessionId: "local-ai",
      playerId,
      issuedAtTick: state.tick,
      command: {
        type: "build",
        builderUnitId: builder.id,
        building: "barracks",
        target,
      },
    });

    if (result.ok) {
      reservedWorkerIds.add(builder.id);
    }
  }

  private repairDamagedBuildings(
    state: WorldState,
    playerId: string,
    workers: readonly UnitState[],
    units: readonly UnitState[],
    reservedWorkerIds: Set<string>,
    newlyRepairingWorkerIds: Set<string>,
  ): void {
    const damagedBuildings = units
      .filter((unit) => unitDefinitions[unit.kind].category === "building" && unit.health.current < unit.health.max)
      .sort((a, b) => {
        const healthRatioDelta = a.health.current / a.health.max - b.health.current / b.health.max;

        return healthRatioDelta !== 0 ? healthRatioDelta : a.id.localeCompare(b.id);
      });

    if (damagedBuildings.length === 0) {
      return;
    }

    for (const building of damagedBuildings) {
      if (
        countRepairingWorkers(workers) + newlyRepairingWorkerIds.size >= this.tuning.maxRepairWorkers ||
        hasWorkerRepairingTarget(workers, building.id)
      ) {
        continue;
      }

      const worker = findNearestAvailableRepairWorker(workers, building, reservedWorkerIds);

      if (!worker || !findPathForUnit(state, worker, building.position)) {
        continue;
      }

      const result = issueWorldCommand(state, {
        sessionId: "local-ai",
        playerId,
        issuedAtTick: state.tick,
        command: {
          type: "repair",
          workerUnitId: worker.id,
          targetUnitId: building.id,
        },
      });

      if (result.ok) {
        reservedWorkerIds.add(worker.id);
        newlyRepairingWorkerIds.add(worker.id);
      }
    }
  }

  private ensureDefensiveBeacons(
    state: WorldState,
    playerId: string,
    workers: readonly UnitState[],
    units: readonly UnitState[],
    townCenters: readonly UnitState[],
    reservedWorkerIds: Set<string>,
  ): void {
    if (this.tuning.maxDefensiveBeacons <= 0 || workers.length < Math.min(this.tuning.targetWorkerCount, 6)) {
      return;
    }

    const beaconCount = units.filter((unit) => unit.kind === "beacon").length;

    if (beaconCount >= this.tuning.maxDefensiveBeacons) {
      return;
    }

    const anchor = townCenters[0];
    const builder = findAvailableWorker(workers, reservedWorkerIds);

    if (!anchor || !builder) {
      return;
    }

    const target = findBuildTargetNear(state, builder, anchor.position, "beacon", 7);

    if (!target) {
      return;
    }

    const result = issueWorldCommand(state, {
      sessionId: "local-ai",
      playerId,
      issuedAtTick: state.tick,
      command: {
        type: "build",
        builderUnitId: builder.id,
        building: "beacon",
        target,
      },
    });

    if (result.ok) {
      reservedWorkerIds.add(builder.id);
    }
  }

  private ensureGatherRally(
    state: WorldState,
    playerId: string,
    building: UnitState,
    resourceTargets: readonly ResourceTarget[],
  ): void {
    const target =
      findNearestReachableProductionResource(state, playerId, building, "villager", resourceTargets) ??
      findNearestResource(building.position, resourceTargets);

    if (!target || building.rallyPoint?.resourceId === target.id) {
      return;
    }

    this.issueRallyPoint(state, playerId, building, target.point, target.id);
  }

  private ensureAttackRally(
    state: WorldState,
    playerId: string,
    building: UnitState,
    enemyUnits: readonly UnitState[],
  ): void {
    const enemy = findNearestReachableRallyEnemy(state, playerId, building, "swordsman", enemyUnits) ?? findNearestEnemyUnit(building, enemyUnits);

    if (!enemy) {
      return;
    }

    const target = {
      x: Math.round(enemy.position.x),
      y: Math.round(enemy.position.y),
    };

    if (
      building.rallyPoint?.mode === "attack-move" &&
      !building.rallyPoint.resourceId &&
      getDistanceSq(building.rallyPoint.target, target) <= 4
    ) {
      return;
    }

    this.issueRallyPoint(state, playerId, building, target, undefined, "attack-move");
  }

  private issueRallyPoint(
    state: WorldState,
    playerId: string,
    building: UnitState,
    target: GridPoint,
    resourceId?: string,
    mode?: "move" | "attack-move",
  ): void {
    issueWorldCommand(state, {
      sessionId: "local-ai",
      playerId,
      issuedAtTick: state.tick,
      command: {
        type: "set-rally-point",
        buildingUnitId: building.id,
        target,
        ...(resourceId ? { resourceId } : {}),
        ...(mode ? { mode } : {}),
      },
    });
  }

  private issueAttackMove(state: WorldState, playerId: string, unit: UnitState, target: GridPoint): boolean {
    if (!unitCanPerformAction(unit.kind, "attack-move")) {
      return false;
    }

    const result = issueWorldCommand(state, {
      sessionId: "local-ai",
      playerId,
      issuedAtTick: state.tick,
      command: {
        type: "attack-move",
        unitId: unit.id,
        target,
      },
    });

    return result.ok;
  }

  private issueAttackWave(
    state: WorldState,
    playerId: string,
    fighters: readonly UnitState[],
    defenderIds: ReadonlySet<string>,
    enemyUnits: readonly UnitState[],
  ): void {
    if (state.tick < this.tuning.attackStartTicks || state.tick % this.tuning.attackIntervalTicks !== 0) {
      return;
    }

    const waveSize = Math.max(1, Math.round(this.tuning.attackWaveSize));
    const candidates = fighters
      .filter((unit) => !defenderIds.has(unit.id) && !hasActiveAggressiveOrder(unit))
      .slice(0, waveSize);

    for (const unit of candidates) {
      const enemy = findNearestReachableEnemyUnit(state, unit, enemyUnits);

      if (enemy) {
        this.issueAttackMove(state, playerId, unit, enemy.position);
      }
    }
  }
}

function collectResourceTargets(state: WorldState): ResourceTarget[] {
  const targets: ResourceTarget[] = [];

  for (let y = 0; y < state.map.height; y += 1) {
    for (let x = 0; x < state.map.width; x += 1) {
      const resource = getTileAt(state.map, x, y).resource;

      if (resource && resource.amount > 0 && getResourceNodeState(resource) === "active") {
        const definition = BUILTIN_RESOURCE_DEFINITIONS[resource.kind];

        if (!definition) {
          continue;
        }

        targets.push({
          id: resource.id,
          point: { x, y },
          resource,
          yieldResource: definition.yieldResource,
        });
      }
    }
  }

  return targets.sort((a, b) => a.id.localeCompare(b.id));
}

function countQueuedUnits(units: readonly UnitState[], unit: UnitDefinitionId): number {
  return units.reduce(
    (count, candidate) => count + (candidate.productionQueue?.filter((item) => item.unit === unit).length ?? 0),
    0,
  );
}

function chooseBarracksUnit(units: readonly UnitState[]): UnitDefinitionId {
  const swordsmen = countUnitsAndQueued(units, "swordsman");
  const archers = countUnitsAndQueued(units, "archer");

  return archers * 2 < swordsmen ? "archer" : "swordsman";
}

function countUnitsAndQueued(units: readonly UnitState[], unit: UnitDefinitionId): number {
  return units.filter((candidate) => candidate.kind === unit && !isUnitUnderConstruction(candidate)).length + countQueuedUnits(units, unit);
}

function collectReservedWorkerIds(workers: readonly UnitState[]): Set<string> {
  return new Set(
    workers
      .filter((unit) => unit.currentOrder?.type === "build" || unit.currentOrder?.type === "repair")
      .map((unit) => unit.id),
  );
}

function createResourceGatherPlan(
  state: WorldState,
  playerId: string,
  workerCount: number,
  hasBarracks: boolean,
  maxDefensiveBeacons: number,
  targets: readonly ResourceTarget[],
): Record<BankResourceKind, number> {
  const plan: Record<BankResourceKind, number> = { food: 0, wood: 0, gold: 0, stone: 0 };

  if (workerCount <= 0) {
    return plan;
  }

  const available = new Set(targets.map((target) => target.yieldResource));
  const resources = state.playerResources[playerId] ?? { food: 0, wood: 0, gold: 0, stone: 0 };
  const wantsGold = hasBarracks && available.has("gold") && workerCount >= 4;
  const wantsStone = maxDefensiveBeacons > 0 && available.has("stone") && workerCount >= 6 && resources.stone < getTargetStoneReserve(maxDefensiveBeacons);
  const wantsWood = available.has("wood");
  const wantsFood = available.has("food");

  if (wantsGold) {
    plan.gold = Math.max(resources.gold < 40 ? 2 : 1, Math.floor(workerCount * 0.2));
  }

  if (wantsStone) {
    plan.stone = 1;
  }

  if (wantsWood) {
    plan.wood = Math.max(resources.wood < 175 ? 2 : 1, Math.floor(workerCount * 0.25));
  }

  if (wantsFood) {
    plan.food = Math.max(1, workerCount - plan.wood - plan.gold - plan.stone);
  }

  const plannedWorkers = plan.food + plan.wood + plan.gold + plan.stone;

  if (plannedWorkers < workerCount) {
    const fallback = wantsFood ? "food" : wantsWood ? "wood" : wantsGold ? "gold" : wantsStone || available.has("stone") ? "stone" : null;

    if (fallback) {
      plan[fallback] += workerCount - plannedWorkers;
    }
  }

  return plan;
}

function getTargetStoneReserve(maxDefensiveBeacons: number): number {
  const townCenterStoneCost = unitDefinitions["town-center"].cost?.stone ?? 0;
  const beaconStoneCost = unitDefinitions.beacon.cost?.stone ?? 0;

  return townCenterStoneCost + beaconStoneCost * Math.max(1, maxDefensiveBeacons);
}

function countWorkerResourceAssignments(
  workers: readonly UnitState[],
  targets: readonly ResourceTarget[],
): Record<BankResourceKind, number> {
  const assignments: Record<BankResourceKind, number> = { food: 0, wood: 0, gold: 0, stone: 0 };

  for (const worker of workers) {
    if (worker.currentOrder?.type !== "gather") {
      continue;
    }

    const target = findResourceTargetById(targets, worker.currentOrder.resourceId);

    if (target) {
      assignments[target.yieldResource] += 1;
    }
  }

  return assignments;
}

function shouldKeepGatherAssignment(
  target: ResourceTarget,
  plan: Readonly<Record<BankResourceKind, number>>,
  assignments: Readonly<Record<BankResourceKind, number>>,
): boolean {
  return assignments[target.yieldResource] <= plan[target.yieldResource] || !hasUnderfilledResource(plan, assignments);
}

function shouldKeepActiveGatherAssignment(
  state: WorldState,
  unit: UnitState,
  target: ResourceTarget,
  plan: Readonly<Record<BankResourceKind, number>>,
  assignments: Readonly<Record<BankResourceKind, number>>,
): boolean {
  return shouldKeepGatherAssignment(target, plan, assignments) && isGatherAssignmentReachable(state, unit, target);
}

function isGatherAssignmentReachable(state: WorldState, unit: UnitState, target: ResourceTarget): boolean {
  if ((unit.carriedResource?.amount ?? 0) > 0 || unit.movementTarget || (unit.movementPath?.length ?? 0) > 0) {
    return true;
  }

  return findPathForUnit(state, unit, target.point) !== null;
}

function findPlannedResourceTarget(
  state: WorldState,
  unit: UnitState,
  targets: readonly ResourceTarget[],
  plan: Readonly<Record<BankResourceKind, number>>,
  assignments: Readonly<Record<BankResourceKind, number>>,
): ResourceTarget | null {
  const underfilledResources = (["food", "wood", "gold", "stone"] as const)
    .filter((resource) => assignments[resource] < plan[resource]);

  if (underfilledResources.length === 0) {
    return null;
  }

  const resource = underfilledResources.sort((a, b) => {
    const deficitDelta = (plan[b] - assignments[b]) - (plan[a] - assignments[a]);

    return deficitDelta !== 0 ? deficitDelta : getResourcePriority(a) - getResourcePriority(b);
  })[0];

  return resource ? findNearestReachableResource(state, unit, targets.filter((target) => target.yieldResource === resource)) : null;
}

function hasUnderfilledResource(
  plan: Readonly<Record<BankResourceKind, number>>,
  assignments: Readonly<Record<BankResourceKind, number>>,
): boolean {
  return (["food", "wood", "gold", "stone"] as const).some((resource) => assignments[resource] < plan[resource]);
}

function findResourceTargetById(targets: readonly ResourceTarget[], resourceId: string): ResourceTarget | null {
  return targets.find((target) => target.id === resourceId) ?? null;
}

function getResourcePriority(resource: BankResourceKind): number {
  switch (resource) {
    case "food":
      return 0;
    case "wood":
      return 1;
    case "gold":
      return 2;
    case "stone":
      return 3;
  }
}

function findAvailableWorker(workers: readonly UnitState[], reservedWorkerIds: ReadonlySet<string>): UnitState | null {
  return workers.find((unit) => !reservedWorkerIds.has(unit.id) && unit.currentOrder?.type !== "build" && unit.currentOrder?.type !== "repair") ?? null;
}

function hasWorkerRepairingTarget(workers: readonly UnitState[], targetUnitId: string): boolean {
  return workers.some((unit) => unit.currentOrder?.type === "repair" && unit.currentOrder.targetUnitId === targetUnitId);
}

function countRepairingWorkers(workers: readonly UnitState[]): number {
  return workers.filter((unit) => unit.currentOrder?.type === "repair").length;
}

function findNearestAvailableRepairWorker(
  workers: readonly UnitState[],
  building: UnitState,
  reservedWorkerIds: ReadonlySet<string>,
): UnitState | null {
  let nearestWorker: UnitState | null = null;
  let nearestDistanceSq = Number.POSITIVE_INFINITY;

  for (const worker of workers) {
    if (reservedWorkerIds.has(worker.id) || worker.currentOrder?.type === "build" || worker.currentOrder?.type === "repair") {
      continue;
    }

    const distanceSq = getDistanceSq(worker.position, building.position);

    if (distanceSq < nearestDistanceSq) {
      nearestWorker = worker;
      nearestDistanceSq = distanceSq;
    }
  }

  return nearestWorker;
}

function hasActiveAggressiveOrder(unit: UnitState): boolean {
  if (unit.currentOrder?.type === "attack-unit" || unit.currentOrder?.type === "patrol") {
    return true;
  }

  if (unit.currentOrder?.type !== "attack-move") {
    return false;
  }

  return unit.movementTarget !== undefined || Boolean(unit.movementPath?.length) || getDistanceSq(unit.position, unit.currentOrder.target) > 1;
}

function isDefendingThreat(unit: UnitState, threat: UnitState): boolean {
  if (unit.currentOrder?.type === "attack-unit") {
    return unit.currentOrder.targetUnitId === threat.id;
  }

  if (unit.currentOrder?.type !== "attack-move") {
    return false;
  }

  return getDistanceSq(unit.currentOrder.target, threat.position) <= 1;
}

function findBuildTargetNear(
  state: WorldState,
  builder: UnitState,
  anchor: GridPoint,
  building: BuildingDefinitionId,
  searchRadius = 10,
): GridPoint | null {
  const footprint = unitDefinitions[building].footprint;
  const origin = { x: Math.round(anchor.x), y: Math.round(anchor.y) };
  const startDistance = Math.max(2, footprint.width, footprint.height);

  for (let distance = startDistance; distance <= startDistance + searchRadius; distance += 1) {
    for (let y = origin.y - distance; y <= origin.y + distance; y += 1) {
      for (let x = origin.x - distance; x <= origin.x + distance; x += 1) {
        if (Math.max(Math.abs(x - origin.x), Math.abs(y - origin.y)) !== distance) {
          continue;
        }

        const target = { x, y };
        if (validateBuildingPlacement(state, building, target).ok && findBuildWorkPath(state, builder, building, target)) {
          return target;
        }
      }
    }
  }

  return null;
}

function findNearestResource(position: GridPoint, targets: readonly ResourceTarget[]): ResourceTarget | null {
  let nearestTarget: ResourceTarget | null = null;
  let nearestDistanceSq = Number.POSITIVE_INFINITY;

  for (const target of targets) {
    const distanceSq = getDistanceSq(position, target.point);

    if (distanceSq < nearestDistanceSq) {
      nearestTarget = target;
      nearestDistanceSq = distanceSq;
    }
  }

  return nearestTarget;
}

function findNearestReachableResource(
  state: WorldState,
  unit: UnitState,
  targets: readonly ResourceTarget[],
): ResourceTarget | null {
  for (const target of targets.slice().sort((a, b) => {
    const distanceDelta = getDistanceSq(unit.position, a.point) - getDistanceSq(unit.position, b.point);

    return distanceDelta !== 0 ? distanceDelta : a.id.localeCompare(b.id);
  })) {
    if (findPathForUnit(state, unit, target.point)) {
      return target;
    }
  }

  return null;
}

function findNearestEnemyUnit(unit: UnitState, enemyUnits: readonly UnitState[]): UnitState | null {
  let nearestEnemy: UnitState | null = null;
  let nearestDistanceSq = Number.POSITIVE_INFINITY;

  for (const candidate of enemyUnits) {
    const distanceSq = getDistanceSq(unit.position, candidate.position);
    if (distanceSq < nearestDistanceSq) {
      nearestEnemy = candidate;
      nearestDistanceSq = distanceSq;
    }
  }

  return nearestEnemy;
}

function findNearestReachableEnemyUnit(state: WorldState, unit: UnitState, enemyUnits: readonly UnitState[]): UnitState | null {
  for (const enemy of collectEnemyUnitsByDistance(unit, enemyUnits)) {
    if (findPathForUnit(state, unit, enemy.position)) {
      return enemy;
    }
  }

  return null;
}

function findNearestReachableRallyEnemy(
  state: WorldState,
  playerId: string,
  building: UnitState,
  unitKind: UnitDefinitionId,
  enemyUnits: readonly UnitState[],
): UnitState | null {
  const spawn = findUnitSpawnPoint(state, building, unitKind);

  if (!spawn) {
    return null;
  }

  const probe = createUnitState(`${building.id}-rally-probe`, playerId, unitKind, spawn);

  return findNearestReachableEnemyUnit(state, probe, enemyUnits);
}

function findNearestReachableProductionResource(
  state: WorldState,
  playerId: string,
  building: UnitState,
  unitKind: UnitDefinitionId,
  targets: readonly ResourceTarget[],
): ResourceTarget | null {
  const spawn = findUnitSpawnPoint(state, building, unitKind);

  if (!spawn) {
    return null;
  }

  const probe = createUnitState(`${building.id}-resource-rally-probe`, playerId, unitKind, spawn);

  return findNearestReachableResource(state, probe, targets);
}

function findNearestUnit(units: readonly UnitState[], position: GridPoint): UnitState | null {
  let nearestUnit: UnitState | null = null;
  let nearestDistanceSq = Number.POSITIVE_INFINITY;

  for (const unit of units) {
    const distanceSq = getDistanceSq(unit.position, position);

    if (distanceSq < nearestDistanceSq) {
      nearestUnit = unit;
      nearestDistanceSq = distanceSq;
    }
  }

  return nearestUnit;
}

function findNearestThreatNearBase(
  units: readonly UnitState[],
  enemyUnits: readonly UnitState[],
  radius: number,
): UnitState | null {
  const buildings = units.filter((unit) => unitDefinitions[unit.kind].category === "building");

  if (buildings.length === 0) {
    return null;
  }

  const radiusSq = radius * radius;
  let nearestThreat: UnitState | null = null;
  let nearestDistanceSq = Number.POSITIVE_INFINITY;

  for (const threat of enemyUnits) {
    for (const building of buildings) {
      const distanceSq = getDistanceSq(threat.position, building.position);

      if (distanceSq > radiusSq || distanceSq >= nearestDistanceSq) {
        continue;
      }

      nearestThreat = threat;
      nearestDistanceSq = distanceSq;
    }
  }

  return nearestThreat;
}

function collectEnemyUnitsByDistance(unit: UnitState, enemyUnits: readonly UnitState[]): UnitState[] {
  return enemyUnits.slice()
    .sort((a, b) => {
      const distanceDelta = getDistanceSq(unit.position, a.position) - getDistanceSq(unit.position, b.position);

      return distanceDelta !== 0 ? distanceDelta : a.id.localeCompare(b.id);
    });
}

function getDistanceSq(a: GridPoint, b: GridPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;

  return dx * dx + dy * dy;
}
