import {
  defaultSkirmishScenario,
  factions,
  getTileAt,
  terrainDefinitions,
  unitDefinitions,
  type GridPoint,
  type MapDefinition,
  type ScenarioDefinition,
  type StartingUnitDefinition,
} from "../../shared/src/index.js";
import { createUnitState } from "./entities.js";
import { createInitialEnvironmentState } from "./environment.js";
import { getFootprintTiles } from "./placement.js";
import { resolveMovementCollisionProfileId } from "./movementCollisionPolicy.js";
import { resolvePathfindingProfileId } from "./navigation.js";
import { createProjectileSystemState } from "./projectiles.js";
import { resolveAttackTargetAuthorityPolicyId } from "./attackTargetAuthorityPolicy.js";
import { resolveCapacityPolicyId } from "./capacity.js";
import "./k01WarExpenseCapacity.js";
import { cloneSourceRuntimeProfileEnvelope, createSourceRuntimeProfileEnvelope, resolveSourceRuntimeProfileId } from "./k01SourceRuntimeProfile.js";
import { requireInitialPlacementPolicy } from "./initialPlacement.js";
import { resolveSourceRuntimeInitialPlacementPolicyId } from "./k01SourceRuntimeProfile.js";
import { createPlayerResearchState } from "./research.js";
import { resourceBlocksBuilding, resourceBlocksMovement } from "./resources.js";
import { applyScenarioScriptedEvents, createScenarioRuntimeState } from "./scenario.js";
import type { PlayerCheatState, PlayerState, ResourceBank, UnitState, WorldSnapshot, WorldState } from "./types.js";

const STARTING_PLACEMENT_SEARCH_RADIUS = 12;

export type { AttributePool, CarriedResourceState, CombatEventState, ConstructionState, DemolitionState, ObjectiveRuntimeState, ObjectiveStatus, PlayerCheatState, PlayerResearchState, PlayerState, PlayerTeamId, ProductionQueueItemState, RallyPointState, ResearchQueueItemState, ResourceBank, ScenarioRuntimeEvent, ScenarioRuntimeState, ScenarioStatus, ScriptedEventRuntimeState, ScriptedEventStatus, SourceRuntimeProfileEnvelope, UnitNavigationState, UnitOrderState, UnitScriptedBehaviorState, UnitState, WorldSnapshot, WorldState } from "./types.js";
export { getBuildTimeTicks, getConstructionProgress, isUnitUnderConstruction } from "./construction.js";
export { applyCommand, findBuildWorkPath, issueCommand, validateCommand, type CommandValidationResult, type IssueCommandResult } from "./commands.js";
export { arePlayersAllied, arePlayersEnemies, getPlayerTeamId } from "./diplomacy.js";
export {
  CORE_CURRENT_VISIBILITY_STOP_AUTHORITY_POLICY_ID,
  CORE_EXPLICIT_TARGET_TRACKING_AUTHORITY_POLICY_ID,
  createCurrentVisibilityResolver,
  getAttackTargetAuthorityPolicy,
  isAttackTargetAuthorized,
  registerAttackTargetAuthorityPolicy,
  requireAttackTargetAuthorityPolicy,
  resolveAttackTargetAuthorityPolicyId,
  type AttackTargetAuthorityPolicy,
  type AttackTargetAuthorityPolicyContext,
} from "./attackTargetAuthorityPolicy.js";
export { resolveDamageAmount, type DamagePacket } from "./damage.js";
export {
  applyAuraAttackDamage,
  defaultAuraProfileRegistry,
  AuraProfileRegistry,
  refreshAuraEffects,
  registerAuraProfile,
  type AuraProfile,
  type RegisterAuraProfileOptions,
} from "./aura.js";
export {
  advanceOriginalProjectilePoolRandomState,
  allocateOriginalProjectileSlot,
  buildOriginalRyuProjectileRoute,
  calculateOriginalEffectKindNineDamage,
  ORIGINAL_PROJECTILE_POOL_RANDOM_MODULUS,
  ORIGINAL_PROJECTILE_POOL_RANDOM_MULTIPLIER,
  ORIGINAL_PROJECTILE_SLOT_COUNT,
  ORIGINAL_RYU_PROJECTILE_EFFECT_KIND,
  ORIGINAL_RYU_PROJECTILE_SAMPLE_INTERVAL,
  ORIGINAL_RYU_PROJECTILE_SUBTYPE,
  resolveOriginalRyuProjectileImpact,
  type OriginalProjectilePoint,
  type OriginalProjectilePoolRandomState,
  type OriginalProjectileRoute,
  type OriginalRyuProjectileImpactInput,
  type OriginalRyuProjectileImpactResult,
} from "./originalRyuProjectile.js";
export type { EnvironmentState } from "./environment.js";
export {
  CORE_A_STAR_PATHFINDER_ID,
  SOURCE_GREEDY_ACCEPTED_NODE_LIMIT,
  SOURCE_GREEDY_CANDIDATE_OFFSETS,
  SOURCE_GREEDY_LOCAL_ADAPTER_PATHFINDER_ID,
  coreAStarPathfinder,
  applyNavigationRoute,
  clearNavigationRoute,
  findPathForUnit,
  findNavigationRouteForUnit,
  isTerrainWalkable,
  resolvePathfindingProfileId,
  runSourceGreedyLocalSearch,
  sourceGreedyLocalAdapterPathfinder,
  type FindPathOptions,
  type NavigationRoute,
  type NavigationTerminalReason,
  type SourceGreedyLocalSearchResult,
} from "./navigation.js";
export { defaultPathfinderRegistry, PathfinderRegistry, registerPathfinder, requirePathfinder, type RegisterPathfinderOptions } from "./pathfinderRegistry.js";
export type { Pathfinder } from "./pathfinder.js";
export {
  CORE_STRICT_FOOTPRINT_RESERVATION_POLICY_ID,
  coreStrictFootprintReservationPolicy,
  defaultMovementCollisionPolicyRegistry,
  getMovementCollisionPolicy,
  registerMovementCollisionPolicy,
  requireMovementCollisionPolicy,
  resolveMovementCollisionProfileId,
  MovementCollisionPolicyRegistry,
  type MovementCollisionPolicy,
  type MovementBlockingGroup,
  type MovementBlockingGroupClassification,
  type MovementReservation,
  type RegisterMovementCollisionPolicyOptions,
} from "./movementCollisionPolicy.js";
export { getBlockingGroupAtTile } from "./collision.js";
export { getFootprintTiles, validateBuildingPlacement, type BuildingPlacementValidationResult } from "./placement.js";
export {
  canAdmitPlayerCapacity,
  canCompleteQueuedPlayerCapacity,
  coreProviderSupplyCapacityPolicy,
  coreUncappedCapacityPolicy,
  createCapacityPolicy,
  createCategoryCapacityConstraint,
  createFixedBudgetCapacityPolicy,
  createKindCapacityConstraint,
  createProviderSupplyCapacityPolicy,
  createTotalCountCapacityConstraint,
  createUncappedCapacityPolicy,
  defaultCapacityPolicyRegistry,
  evaluatePlayerCapacity,
  getProviderSupplyCapacityState,
  registerCapacityPolicy,
  requireCapacityPolicy,
  resolveCapacityPolicyId,
  CapacityPolicyRegistry,
  CORE_PROVIDER_SUPPLY_CAPACITY_POLICY_ID,
  CORE_UNCAPPED_CAPACITY_POLICY_ID,
  type CapacityAdmissionRequest,
  type CapacityAdmissionResult,
  type CapacityConstraint,
  type CapacityConstraintOutcome,
  type CapacityConstraintResult,
  type CapacityEntry,
  type CapacityEntryLocation,
  type CapacityEvaluation,
  type CapacityPolicy,
  type CapacityPolicyContext,
  type CapacityPresentation,
  type CapacityRequestPhase,
  type CapacityRejection,
  type CapacityRejectionReason,
  type CapacityUnitCategory,
  type CreateTotalCountCapacityConstraintOptions,
  type ProviderSupplyCapacityState,
} from "./capacity.js";
export { canQueuePopulation, DEFAULT_POPULATION_LIMIT, getPlayerPopulationState, getPopulationCost, getPopulationProvided, type PlayerPopulationState } from "./population.js";
export {
  createK01WarExpenseCapacityPolicy,
  getK01WarExpenseCost,
  getK01WarExpenseKindAdapter,
  k01WarExpenseCapacityPolicy,
  k01WarExpenseCapacityPresentation,
  k01WarExpenseKindAdapters,
  k01WarExpenseWithBuildingGateCapacityPolicy,
  K01_WAR_EXPENSE_BUILDING_COUNT_CAP,
  K01_WAR_EXPENSE_CAP,
  K01_WAR_EXPENSE_CAPACITY_POLICY_ID,
  K01_WAR_EXPENSE_ENTITY_COUNT_CAP,
  K01_WAR_EXPENSE_WITH_BUILDING_GATE_CAPACITY_POLICY_ID,
  type CreateK01WarExpenseCapacityPolicyOptions,
  type K01OriginalBuildingGateMode,
  type K01WarExpenseIdentityMapping,
  type K01WarExpenseKindAdapter,
} from "./k01WarExpenseCapacity.js";
export { applyCompletedResearchToUnit, completeResearch, createPlayerResearchState, isResearchCompleted, isResearchPending } from "./research.js";
export { findHarvestableResourceTile, findNearestHarvestableResource, findResourceNode, findResourceTile, getResourceNodeState, harvestResource, isResourceHarvestable, resourceBlocksBuilding, resourceBlocksMovement, updateResourceRegrowth } from "./resources.js";
export { applyScenarioScriptedEvents, completeScenarioRuntime, createScenarioRuntimeState, evaluateScenarioRuntime } from "./scenario.js";
export { SIM_TICK_SECONDS, SIM_TICKS_PER_SECOND } from "./constants.js";
export { isTileFlooded, isTilePassableForUnit } from "./terrain.js";
export { advanceWorldTick, type AdvanceWorldTickOptions } from "./tick.js";
export {
  advanceSourceOrientation,
  createSourceOrientationState,
  getRawDirectionForFacing,
  getSourceOrientationProfileForUnit,
  K01_TURTLE_TANK_ORIENTATION_PROFILE,
  registerSourceOrientationProfile,
  type SourceOrientationProfile,
  type SourceOrientationState,
} from "./orientation.js";
export { iterateUnitsOrdered } from "./units.js";
export { areTilesVisible, createPlayerVisibility, getTileVisibility, updatePlayerVisibility, updatePlayerVisibilityWithChanges, TileVisibility, type PlayerVisibilityChangeOptions, type PlayerVisibilityState, type PlayerVisibilityUpdate } from "./visibility.js";

export function createInitialWorldState(
  map: MapDefinition,
  playerIds: string[],
  scenario: ScenarioDefinition = defaultSkirmishScenario,
  playerTeams: Partial<Record<string, string>> = {},
): WorldState {
  const worldMap = structuredClone(map);
  const units: Record<string, UnitState> = {};
  const players: Record<string, PlayerState> = {};
  const playerResources: Record<string, ResourceBank> = {};
  const playerResearch: WorldState["playerResearch"] = {};
  const playerCheats: Record<string, PlayerCheatState> = {};
  const sourceRuntimeProfileId = resolveSourceRuntimeProfileId(scenario.sourceRuntimeProfileId);
  const initialPlacementPolicyId = resolveSourceRuntimeInitialPlacementPolicyId(sourceRuntimeProfileId);
  const initialPlacementPolicy = initialPlacementPolicyId === undefined
    ? undefined
    : requireInitialPlacementPolicy(initialPlacementPolicyId);
  const exactStartingPositions = initialPlacementPolicy?.resolveStartingPositions({
    map: worldMap,
    players: playerIds.map((playerId, index) => {
      const spawn = worldMap.spawnPoints[index] ?? {
        id: `fallback-${index}`,
        x: 2 + index,
        y: 2 + index,
        faction: factions[index % factions.length] ?? "blue",
      };
      const playerStart = scenario.playerStarts?.[playerId] ?? scenario.playerStarts?.[`player-${index + 1}`];
      return {
        playerId,
        spawn: { x: spawn.x, y: spawn.y },
        startingUnits: playerStart?.startingUnits ?? scenario.startingUnits,
      };
    }),
    existingUnits: units,
  });

  playerIds.forEach((playerId, index) => {
    const fallbackFaction = factions[index % factions.length] ?? "blue";
    const spawn = worldMap.spawnPoints[index] ?? {
      id: `fallback-${index}`,
      x: 2 + index,
      y: 2 + index,
      faction: fallbackFaction,
    };
    const playerStart = scenario.playerStarts?.[playerId] ?? scenario.playerStarts?.[`player-${index + 1}`];
    const startingResources = {
      ...scenario.startingResources,
      ...(playerStart?.startingResources ?? {}),
    };
    const startingUnits = playerStart?.startingUnits ?? scenario.startingUnits;

    const player: PlayerState = { id: playerId, faction: spawn.faction };
    const teamId = playerTeams[playerId];

    if (teamId) {
      player.teamId = teamId;
    }

    players[playerId] = player;
    playerResources[playerId] = startingResources;
    playerResearch[playerId] = createPlayerResearchState();
    playerCheats[playerId] = {};

    for (const unit of createPlacedStartingUnits(
      playerId,
      { x: spawn.x, y: spawn.y },
      startingUnits,
      worldMap,
      units,
      exactStartingPositions?.get(playerId),
    )) {
      units[unit.id] = unit;
    }
  });

  const state: WorldState = {
    tick: 0,
    map: worldMap,
    attackTargetAuthorityPolicyId: resolveAttackTargetAuthorityPolicyId(scenario.attackTargetAuthorityPolicyId),
    ...(scenario.auraProfileId !== undefined ? { auraProfileId: scenario.auraProfileId } : {}),
    pathfindingProfileId: resolvePathfindingProfileId(worldMap, scenario),
    capacityPolicyId: resolveCapacityPolicyId(scenario.capacityPolicyId),
    movementCollisionProfileId: resolveMovementCollisionProfileId(worldMap.movementCollisionProfileId),
    environment: createInitialEnvironmentState(worldMap),
    scenario: createScenarioRuntimeState(scenario),
    players,
    units,
    playerResources,
    playerResearch,
    playerCheats,
    combatEvents: [],
    projectileSystem: createProjectileSystemState(),
    projectileImpactEvents: [],
    simulationEvents: [],
    nextSimulationEventSequence: 1,
    lastAcceptedCommand: null,
  };

  if (sourceRuntimeProfileId !== undefined) {
    state.sourceRuntimeProfile = createSourceRuntimeProfileEnvelope(sourceRuntimeProfileId);
  }

  applyScenarioScriptedEvents(state, { tickTriggersOnly: true });

  return state;
}

export function toWorldSnapshot(state: WorldState): WorldSnapshot {
  const sourceRuntimeProfile = state.sourceRuntimeProfile === undefined
    ? undefined
    : cloneSourceRuntimeProfileEnvelope(state.sourceRuntimeProfile);
  const snapshot = structuredClone(state);

  if (sourceRuntimeProfile !== undefined) {
    snapshot.sourceRuntimeProfile = sourceRuntimeProfile;
  }

  return snapshot;
}

function createPlacedStartingUnits(
  playerId: string,
  spawn: GridPoint,
  startingUnits: readonly StartingUnitDefinition[],
  map: MapDefinition,
  placedUnits: Readonly<Record<string, UnitState>>,
  exactPositions?: readonly GridPoint[],
): UnitState[] {
  if (exactPositions !== undefined && exactPositions.length !== startingUnits.length) {
    throw new Error(
      `Initial placement policy returned ${exactPositions.length} positions for ${startingUnits.length} starting units of player '${playerId}'.`,
    );
  }

  const units: UnitState[] = [];
  const occupiedUnits: Record<string, UnitState> = { ...placedUnits };

  for (const [definitionIndex, definition] of startingUnits.entries()) {
    const requestedPosition = {
      x: spawn.x + definition.offset.x,
      y: spawn.y + definition.offset.y,
    };
    const exactPosition = exactPositions?.[definitionIndex];
    const unit = createUnitState(
      `${playerId}-${definition.idSuffix}`,
      playerId,
      definition.kind,
      exactPosition ?? requestedPosition,
    );
    const placement = exactPosition === undefined
      ? findStartingPlacement(map, occupiedUnits, unit, requestedPosition)
      : exactPosition;

    unit.position = placement ?? clampMapPoint(map, requestedPosition);
    units.push(unit);
    occupiedUnits[unit.id] = unit;
  }

  return units;
}

function findStartingPlacement(
  map: MapDefinition,
  placedUnits: Readonly<Record<string, UnitState>>,
  unit: UnitState,
  requestedPosition: GridPoint,
): GridPoint | null {
  const origin = clampMapPoint(map, requestedPosition);
  const visited = new Set<string>();

  for (let distance = 0; distance <= STARTING_PLACEMENT_SEARCH_RADIUS; distance += 1) {
    for (let y = origin.y - distance; y <= origin.y + distance; y += 1) {
      for (let x = origin.x - distance; x <= origin.x + distance; x += 1) {
        if (Math.max(Math.abs(x - origin.x), Math.abs(y - origin.y)) !== distance) {
          continue;
        }

        const point = clampMapPoint(map, { x, y });
        const key = toTileKey(point);

        if (visited.has(key)) {
          continue;
        }

        visited.add(key);

        if (isStartingPlacementValid(map, placedUnits, unit, point)) {
          return point;
        }
      }
    }
  }

  return null;
}

function isStartingPlacementValid(
  map: MapDefinition,
  placedUnits: Readonly<Record<string, UnitState>>,
  unit: UnitState,
  point: GridPoint,
): boolean {
  const definition = unitDefinitions[unit.kind];
  const occupiedTiles = getOccupiedStartingTiles(placedUnits);

  if (definition.category === "building") {
    const placement = definition.placement;

    if (!placement) {
      return false;
    }

    for (const tile of getFootprintTiles(point, definition.footprint)) {
      if (!isPointInMap(map, tile) || occupiedTiles.has(toTileKey(tile))) {
        return false;
      }

      const mapTile = getTileAt(map, tile.x, tile.y);

      const allowedTerrain: readonly string[] = placement.allowedTerrain;

      if (!allowedTerrain.includes(mapTile.terrain) || resourceBlocksBuilding(mapTile.resource)) {
        return false;
      }
    }

    return true;
  }

  for (const footprintTile of getFootprintTiles(point, definition.footprint)) {
    if (!isPointInMap(map, footprintTile) || occupiedTiles.has(toTileKey(footprintTile))) {
      return false;
    }

    const tile = getTileAt(map, footprintTile.x, footprintTile.y);

    if (terrainDefinitions[tile.terrain].blocksMovement || resourceBlocksMovement(tile.resource)) {
      return false;
    }
  }

  return true;
}

function getOccupiedStartingTiles(units: Readonly<Record<string, UnitState>>): Set<string> {
  const occupiedTiles = new Set<string>();

  for (const unit of Object.values(units)) {
    const footprint = unitDefinitions[unit.kind].footprint;

    if (!footprint.blocksMovement) {
      continue;
    }

    for (const tile of getFootprintTiles(unit.position, footprint)) {
      occupiedTiles.add(toTileKey(tile));
    }
  }

  return occupiedTiles;
}

function clampMapPoint(map: MapDefinition, point: GridPoint): GridPoint {
  return {
    x: Math.max(0, Math.min(map.width - 1, Math.round(point.x))),
    y: Math.max(0, Math.min(map.height - 1, Math.round(point.y))),
  };
}

function isPointInMap(map: MapDefinition, point: GridPoint): boolean {
  return point.x >= 0 && point.x < map.width && point.y >= 0 && point.y < map.height;
}

function toTileKey(point: GridPoint): string {
  return `${point.x},${point.y}`;
}
