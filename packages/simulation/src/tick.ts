import { createUnitId, findBuildWorkPath, findUnitSpawnPoint } from "./commands.js";
import { applyScenarioScriptedEvents, evaluateScenarioRuntime } from "./scenario.js";
import { SIM_TICK_SECONDS } from "./constants.js";
import { advanceConstructionHealth, isUnitUnderConstruction, updateConstructionHealth } from "./construction.js";
import { advanceOriginalDemolitionTick, calculateProjectDemolitionRefund } from "./demolition.js";
import { resolveDamageAmount } from "./damage.js";
import { applyAuraAttackDamage, defaultAuraProfileRegistry, refreshAuraEffects, type AuraProfileRegistry } from "./aura.js";
import { arePlayersAllied, arePlayersEnemies } from "./diplomacy.js";
import { createUnitState } from "./entities.js";
import { getEnvironmentSightMultiplier, updateEnvironment } from "./environment.js";
import { applyNavigationRoute, clearNavigationRoute, findNavigationRouteForUnit, findPathForUnit } from "./navigation.js";
import {
  canUnitOccupyPosition,
  createMovementReservationForState,
  reserveUnitPositionForState,
  type MovementReservation,
} from "./collision.js";
import { getFootprintTiles } from "./placement.js";
import { canCompleteQueuedPlayerCapacity } from "./capacity.js";
import { applyCompletedResearchToUnit, completeResearch } from "./research.js";
import { findHarvestableResourceTile, findResourceNode, findResourceTile, getResourceDefinition, harvestResource, isResourceHarvestable, updateResourceRegrowth } from "./resources.js";
import { isTilePassableForUnit, resolveFloodDrowning } from "./terrain.js";
import { iterateUnitsOrdered, removeUnitFromWorld } from "./units.js";
import { advanceUnitOrientationForProjectTarget, getSourceOrientationProfileForUnit } from "./orientation.js";
import { getIdleCombatPolicy } from "./idleCombatPolicy.js";
import { createCurrentVisibilityResolver, getAttackTargetAuthorityPolicy, isAttackTargetAuthorized, type AttackTargetAuthorityPolicy } from "./attackTargetAuthorityPolicy.js";
import { tryExecutePlayerAutoAbility } from "./autoAbilityPolicy.js";
import { advanceProjectileSystem, PRODUCT_PROJECTILE_REGISTRY, type ProjectileRegistry } from "./projectiles.js";
import {
  resolveCombatProjectileImpacts,
  resolveProjectileDeliveryProfileId,
  spawnCombatProjectile,
} from "./projectileCombat.js";
import { unitCanPerformAction, unitDefinitions, type BankResourceKind, type BuildingDefinitionId, type GridPoint, type ScenarioAreaDefinition, type UnitDefinition } from "../../shared/src/index.js";
import type { UnitState, UnitTargetSelectorState, WorldState } from "./types.js";

const TARGET_EPSILON = 0.001;
const DEFAULT_GATHER_CAPACITY = 10;
const RESOURCE_RETARGET_RADIUS = 10;
const REPAIR_HEALTH_PER_TICK = 4;
const COMBAT_EVENT_RETENTION_TICKS = 8;
const PROJECTILE_IMPACT_EVENT_RETENTION_TICKS = 8;
const FAST_PRODUCTION_WORK_TICK_AMOUNT = 4;

export interface AdvanceWorldTickOptions {
  /** Product default; executable registries are caller-owned and never serialized. */
  projectileRegistry?: ProjectileRegistry;
  /** Optional caller-owned aura registry for a mod or isolated simulation. */
  auraProfileRegistry?: AuraProfileRegistry;
}

export function advanceWorldTick(state: WorldState, options: AdvanceWorldTickOptions = {}): void {
  if (state.scenario.status !== "running") {
    return;
  }

  const attackTargetAuthorityPolicy = getAttackTargetAuthorityPolicy(state.attackTargetAuthorityPolicyId);
  state.tick += 1;
  pruneCombatEvents(state);
  pruneProjectileImpactEvents(state);
  // Environment updates first so future systems read this tick's state.
  updateEnvironment(state);
  advanceExplicitAttackTargetAuthorities(state, attackTargetAuthorityPolicy);
  updateResourceRegrowth(state);
  resolveFloodDrowning(state);
  applyScenarioScriptedEvents(state);
  if (state.scenario.status !== "running") {
    return;
  }
  advanceProductionQueues(state);
  advanceResearchQueues(state);
  advanceBuildingDemolitions(state);

  const movementReservation = createMovementReservationForState(state);

  for (const unit of iterateUnitsOrdered(state)) {
    if (state.units[unit.id]) {
      advanceUnitScriptedBehavior(state, unit);
      advanceUnitMovement(state, unit, SIM_TICK_SECONDS, movementReservation);
      advanceOpportunisticResourceDropoff(state, unit);
      advanceUnitPatrol(state, unit);
      advanceUnitGathering(state, unit);
      advanceUnitConstruction(state, unit);
      advanceUnitRepair(state, unit);
    }
  }

  // Aura effects are a live, derived snapshot: movement, owner teams, and
  // source removal from a preceding tick are all resolved before damage.
  refreshAuraEffects(state, options.auraProfileRegistry ?? defaultAuraProfileRegistry);

  const projectileRegistry = options.projectileRegistry ?? PRODUCT_PROJECTILE_REGISTRY;
  const projectileImpacts = advanceProjectileLifecycle(state, projectileRegistry);
  resolveCombatProjectileImpacts(state, projectileImpacts);
  advanceUnitCombat(state, projectileRegistry);
  advanceSourceOrientationAdapters(state);

  resolveFloodDrowning(state);

  resolveScenarioRuntimeFollowUps(state);
}

/**
 * Fair policies stop before movement, combat, orientation, or abilities can
 * consume a hidden target's live state. There is no remembered target-position
 * model, so losing authority deterministically cancels the order.
 */
function advanceExplicitAttackTargetAuthorities(
  state: WorldState,
  policy: AttackTargetAuthorityPolicy,
): void {
  const getCurrentVisibility = createCurrentVisibilityResolver(state);

  for (const unit of iterateUnitsOrdered(state)) {
    if (unit.currentOrder?.type !== "attack-unit") {
      continue;
    }

    const target = state.units[unit.currentOrder.targetUnitId];
    if (!target || !isAttackTargetAuthorized(policy, state, unit, target, getCurrentVisibility)) {
      clearUnitOrder(unit);
    }
  }
}

/**
 * Isolated before combat so projectiles created by a later combat phase cannot
 * accidentally consume an advance in their spawn tick.
 */
function advanceProjectileLifecycle(state: WorldState, registry: ProjectileRegistry) {
  const result = advanceProjectileSystem(state.projectileSystem, registry);
  state.projectileSystem = result.state;
  for (const impact of result.impacts) {
    state.projectileImpactEvents.push({ ...impact, tick: state.tick });
  }
  return result.impacts;
}

/**
 * Product tick/order targets are an explicit source-backed adaptation. The
 * recovered scheduler and action selectors do not prove that every project
 * tick/order reaches the original raw-16 helper.
 */
function advanceSourceOrientationAdapters(state: WorldState): void {
  for (const unit of iterateUnitsOrdered(state)) {
    if (!getSourceOrientationProfileForUnit(unit)) {
      continue;
    }

    const attackTarget = unit.currentOrder?.type === "attack-unit"
      ? state.units[unit.currentOrder.targetUnitId]
      : undefined;
    const target = attackTarget?.position ?? unit.movementTarget;

    if (target) {
      advanceUnitOrientationForProjectTarget(unit, target);
    }
  }
}

function advanceUnitScriptedBehavior(state: WorldState, unit: UnitState): void {
  const behavior = unit.scriptedBehavior;

  if (!behavior || unit.movementSpeed <= 0) {
    return;
  }

  const interval = Math.max(1, behavior.checkIntervalTicks ?? 1);

  if (state.tick % interval !== 0) {
    return;
  }

  if (isPointInScenarioArea(unit.position, behavior.whileInsideArea)) {
    reissueScriptedMove(state, unit, behavior);
    return;
  }

  applyFollowUpAttackTarget(state, unit, behavior.attackTarget);
}

function resolveScenarioRuntimeFollowUps(state: WorldState): void {
  const maxPasses = Object.keys(state.scenario.objectives).length + Object.keys(state.scenario.scriptedEvents).length + 1;

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const eventCountBeforePass = state.scenario.events.length;

    evaluateScenarioRuntime(state);
    if (state.scenario.status !== "running") {
      return;
    }

    applyScenarioScriptedEvents(state);
    if (state.scenario.status !== "running" || state.scenario.events.length === eventCountBeforePass) {
      return;
    }
  }
}

function reissueScriptedMove(
  state: WorldState,
  unit: UnitState,
  behavior: NonNullable<UnitState["scriptedBehavior"]>,
): void {
  const route = findNavigationRouteForUnit(state, unit, behavior.moveTarget, { allowPartial: behavior.allowPartialPath === true });

  if (!route) {
    return;
  }

  applyNavigationRoute(unit, route);
  unit.currentOrder = {
    type: "move",
    target: { ...behavior.moveTarget },
    followUpAttackTarget: { ...behavior.attackTarget },
    followUpWhenOutsideArea: { ...behavior.whileInsideArea },
    ...(behavior.checkIntervalTicks !== undefined ? { followUpCheckIntervalTicks: behavior.checkIntervalTicks } : {}),
  };
}

function advanceProductionQueues(state: WorldState): void {
  for (const unit of iterateUnitsOrdered(state)) {
    const queue = unit.productionQueue;
    const queueItem = queue?.[0];

    if (isUnitUnderConstruction(unit) || unit.demolition || !queue || !queueItem) {
      continue;
    }

    queueItem.remainingTicks = Math.max(0, queueItem.remainingTicks - getPlayerWorkTickAmount(state, unit.playerId));

    if (queueItem.remainingTicks > 0) {
      continue;
    }

    if (!canCompleteQueuedUnit(state, unit.playerId, unit.id, queueItem.id, queueItem.unit)) {
      queueItem.remainingTicks = 1;
      continue;
    }

    const spawn = findUnitSpawnPoint(state, unit, queueItem.unit);

    if (!spawn) {
      queueItem.remainingTicks = 1;
      continue;
    }

    const unitId = createUnitId(state, unit.playerId, queueItem.unit);
    const trainedUnit = createUnitState(unitId, unit.playerId, queueItem.unit, spawn);
    applyCompletedResearchToUnit(state, trainedUnit);
    state.units[unitId] = trainedUnit;
    applyProductionRally(state, unit, trainedUnit);
    queue.shift();

    if (queue.length === 0) {
      delete unit.productionQueue;
    }
  }
}

function canCompleteQueuedUnit(
  state: WorldState,
  playerId: string,
  sourceUnitId: string,
  queueItemId: string,
  unitKind: UnitState["kind"],
): boolean {
  return canCompleteQueuedPlayerCapacity(
    state,
    playerId,
    sourceUnitId,
    queueItemId,
    unitKind,
    state.capacityPolicyId,
  ).admitted;
}

function getPlayerWorkTickAmount(state: WorldState, playerId: string): number {
  return state.playerCheats[playerId]?.fastProduction ? FAST_PRODUCTION_WORK_TICK_AMOUNT : 1;
}

function advanceResearchQueues(state: WorldState): void {
  for (const unit of iterateUnitsOrdered(state)) {
    const queue = unit.researchQueue;
    const queueItem = queue?.[0];

    if (isUnitUnderConstruction(unit) || unit.demolition || !queue || !queueItem) {
      continue;
    }

    queueItem.remainingTicks = Math.max(0, queueItem.remainingTicks - getPlayerWorkTickAmount(state, unit.playerId));

    if (queueItem.remainingTicks > 0) {
      continue;
    }

    completeResearch(state, unit.playerId, queueItem.research);
    queue.shift();

    if (queue.length === 0) {
      delete unit.researchQueue;
    }
  }
}

function advanceBuildingDemolitions(state: WorldState): void {
  for (const building of iterateUnitsOrdered(state)) {
    if (!building.demolition) {
      continue;
    }

    const result = advanceOriginalDemolitionTick(building.demolition, building.health);

    if (!result.completed) {
      building.demolition = result.demolition;
      building.health = result.health;
      continue;
    }

    refundProjectDemolitionCost(state, building);
    removeUnitFromWorld(state, building.id);
  }
}

/**
 * Deliberate product adapter: this applies the generic full-cost refund
 * selected by `calculateProjectDemolitionRefund`, not an assertion that every
 * current bank resource is an original action-13 refund resource.
 */
function refundProjectDemolitionCost(state: WorldState, building: UnitState): void {
  const bank = state.playerResources[building.playerId];

  if (!bank) {
    return;
  }

  const refund = calculateProjectDemolitionRefund((unitDefinitions[building.kind] as UnitDefinition).cost);

  for (const [resource, amount] of Object.entries(refund)) {
    const kind = resource as BankResourceKind;
    bank[kind] += amount ?? 0;
  }
}

function applyProductionRally(state: WorldState, building: UnitState, unit: UnitState): void {
  const rallyPoint = building.rallyPoint;

  if (!rallyPoint || unit.movementSpeed <= 0) {
    return;
  }

  if (rallyPoint.resourceKind && unitCanPerformAction(unit.kind, "gather")) {
    const resourceRally = resolveProductionResourceRally(state, unit, rallyPoint);

    if (resourceRally) {
      clearNavigationRoute(unit);
      unit.movementPath = resourceRally.path;
      setNextMovementTarget(unit, resourceRally.path);
      unit.currentOrder = {
        type: "gather",
        resourceId: resourceRally.resourceId,
        target: { ...resourceRally.target },
      };
      return;
    }
  }

  if (!unitCanPerformAction(unit.kind, "move")) {
    return;
  }

  const route = findNavigationRouteForUnit(state, unit, rallyPoint.target);

  if (!route) {
    return;
  }

  const orderType = rallyPoint.mode === "attack-move" && unitCanPerformAction(unit.kind, "attack-move")
    ? "attack-move"
    : "move";

  applyNavigationRoute(unit, route);
  unit.currentOrder = { type: orderType, target: { ...route.requestedGoal } };
}

function resolveProductionResourceRally(
  state: WorldState,
  unit: UnitState,
  rallyPoint: NonNullable<UnitState["rallyPoint"]>,
): { resourceId: string; target: GridPoint; path: GridPoint[] } | null {
  if (rallyPoint.resourceId) {
    const resourceTarget = findHarvestableResourceTile(state.map, rallyPoint.resourceId);

    if (resourceTarget) {
      const route = findNavigationRouteForUnit(state, unit, resourceTarget);

      if (route) {
        return { resourceId: rallyPoint.resourceId, target: route.requestedGoal, path: route.path };
      }
    }
  }

  if (!rallyPoint.resourceKind) {
    return null;
  }

  const replacement = findNearestReachableHarvestableResource(state, unit, rallyPoint.resourceKind, {
    anchor: rallyPoint.target,
    maxAnchorDistance: RESOURCE_RETARGET_RADIUS,
  });

  if (!replacement) {
    return null;
  }

  const route = findNavigationRouteForUnit(state, unit, replacement.point);

  return route
    ? { resourceId: replacement.id, target: route.requestedGoal, path: route.path }
    : null;
}

function setNextMovementTarget(unit: UnitState, path: readonly GridPoint[]): void {
  const nextTarget = path[0];

  if (nextTarget) {
    unit.movementTarget = nextTarget;
    return;
  }

  delete unit.movementTarget;
}

function advanceUnitMovement(
  state: WorldState,
  unit: UnitState,
  deltaSeconds: number,
  movementReservation: MovementReservation,
): void {
  const target = unit.movementTarget;

  if (applyConditionalTravelFollowUp(state, unit)) {
    return;
  }

  if (!target || unit.movementSpeed <= 0) {
    if (!target) {
      repathBlockedMovementWaypoint(state, unit);
      completeTerminalTravelOrder(state, unit, false);
    }
    return;
  }

  if (!isTilePassableForUnit(state, unit, { x: Math.round(target.x), y: Math.round(target.y) })) {
    clearBlockedMovementWaypoint(unit);
    return;
  }

  // A presently occupied footprint is a queue, not a new route request. The
  // blocker may leave on a later tick; keeping this waypoint prevents repeated
  // whole-map searches while preserving the occupied source footprint.
  if (!canUnitOccupyPosition(state, unit, target)) {
    return;
  }

  if (!reserveUnitPositionForState(state, movementReservation, unit, target)) {
    repathBlockedMovementWaypoint(state, unit);
    return;
  }

  const deltaX = target.x - unit.position.x;
  const deltaY = target.y - unit.position.y;
  const distance = Math.hypot(deltaX, deltaY);

  if (distance <= TARGET_EPSILON) {
    unit.position = { ...target };
    advanceMovementWaypoint(state, unit);
    applyConditionalTravelFollowUp(state, unit);
    return;
  }

  const step = unit.movementSpeed * deltaSeconds;

  if (step >= distance) {
    unit.position = { ...target };
    advanceMovementWaypoint(state, unit);
    applyConditionalTravelFollowUp(state, unit);
    return;
  }

  unit.position = {
    x: unit.position.x + (deltaX / distance) * step,
    y: unit.position.y + (deltaY / distance) * step,
  };
  applyConditionalTravelFollowUp(state, unit);
}

function clearBlockedMovementWaypoint(unit: UnitState): void {
  delete unit.movementTarget;
  delete unit.movementPath;
  clearNavigationRoute(unit);

  if (unit.currentOrder?.type === "move") {
    clearUnitOrder(unit);
  }
}

function repathBlockedMovementWaypoint(state: WorldState, unit: UnitState): void {
  const destination = getMovementDestination(unit);

  if (!destination) {
    return;
  }

  const route = findNavigationRouteForUnit(state, unit, destination, {
    allowPartial: unit.scriptedBehavior?.allowPartialPath === true,
  });

  if (!route) {
    return;
  }

  if (unit.currentOrder?.type === "move" || unit.currentOrder?.type === "attack-move" || unit.currentOrder?.type === "patrol") {
    applyNavigationRoute(unit, route);
  } else {
    clearNavigationRoute(unit);
    unit.movementPath = route.path;
    setNextMovementTarget(unit, route.path);
  }
}

function getMovementDestination(unit: UnitState): GridPoint | undefined {
  switch (unit.currentOrder?.type) {
    case "move":
    case "attack-move":
      return unit.currentOrder.target;
    case "patrol":
      return unit.currentOrder.nextTarget;
    case "build":
    case "gather":
      return unit.currentOrder.target;
    default:
      return unit.movementPath?.at(-1) ?? unit.movementTarget;
  }
}

function advanceMovementWaypoint(state: WorldState, unit: UnitState): void {
  if (unit.movementPath && unit.movementPath.length > 0) {
    unit.movementPath.shift();
  }

  const nextTarget = unit.movementPath?.[0];

  if (nextTarget) {
    unit.movementTarget = { ...nextTarget };
    return;
  }

  delete unit.movementTarget;
  delete unit.movementPath;
  completeTerminalTravelOrder(state, unit, true);
}

function completeTerminalTravelOrder(state: WorldState, unit: UnitState, pathExhausted: boolean): void {
  const order = unit.currentOrder;

  if (
    (order?.type === "move" || order?.type === "attack-move") &&
    unit.navigation?.terminalReason === "mobile-obstruction"
  ) {
    return;
  }

  if (pathExhausted && order?.type === "move" && order.followUpAttackTarget && !unit.movementTarget && !unit.movementPath) {
    applyFollowUpAttackTarget(state, unit, order.followUpAttackTarget);
    return;
  }

  if (
    (order?.type === "move" || order?.type === "attack-move") &&
    unit.navigation?.terminalReason === "blocked-goal" &&
    sameTile(unit.position, unit.navigation.resolvedGoal)
  ) {
    clearUnitOrder(unit);
    return;
  }

  if ((order?.type === "move" || order?.type === "attack-move") && isAtOrderTarget(unit, order.target)) {
    clearUnitOrder(unit);
    return;
  }
}

function applyConditionalTravelFollowUp(state: WorldState, unit: UnitState): boolean {
  const order = unit.currentOrder;

  if (order?.type !== "move" || !order.followUpAttackTarget || !order.followUpWhenOutsideArea) {
    return false;
  }

  const interval = Math.max(1, order.followUpCheckIntervalTicks ?? 1);

  if (state.tick % interval !== 0 || isPointInScenarioArea(unit.position, order.followUpWhenOutsideArea)) {
    return false;
  }

  applyFollowUpAttackTarget(state, unit, order.followUpAttackTarget);
  return true;
}

function applyFollowUpAttackTarget(
  state: WorldState,
  unit: UnitState,
  selector: UnitTargetSelectorState,
): void {
  const target = findNearestFollowUpAttackTarget(state, unit, selector);

  delete unit.movementTarget;
  delete unit.movementPath;
  clearNavigationRoute(unit);

  if (!target) {
    delete unit.currentOrder;
    return;
  }

  unit.currentOrder = { type: "attack-unit", targetUnitId: target.id };
}

function findNearestFollowUpAttackTarget(
  state: WorldState,
  unit: UnitState,
  selector: UnitTargetSelectorState,
): UnitState | null {
  let bestTarget: UnitState | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const target of iterateUnitsOrdered(state)) {
    if (target.kind !== selector.targetKind || target.health.current <= 0) {
      continue;
    }

    if (selector.playerId !== undefined && target.playerId !== selector.playerId) {
      continue;
    }

    if (!arePlayersEnemies(state, target.playerId, unit.playerId)) {
      continue;
    }

    const distance = getPointDistanceSq(unit.position, target.position);

    if (distance < bestDistance) {
      bestTarget = target;
      bestDistance = distance;
    }
  }

  return bestTarget;
}

function isPointInScenarioArea(point: GridPoint, area: ScenarioAreaDefinition): boolean {
  return point.x >= area.x && point.x < area.x + area.width && point.y >= area.y && point.y < area.y + area.height;
}

function advanceUnitGathering(state: WorldState, unit: UnitState): void {
  if (unit.currentOrder?.type !== "gather") {
    return;
  }

  const carriedAmount = unit.carriedResource?.amount ?? 0;
  const gatherCapacity = getGatherCapacity(unit);
  const resourceTile = findResourceTile(state.map, unit.currentOrder.resourceId);
  const resource = findResourceNode(state.map, unit.currentOrder.resourceId);
  const resourceDefinition = resource ? getResourceDefinition(resource) : undefined;

  if (carriedAmount > 0 && (!resourceTile || !resourceDefinition || carriedAmount >= gatherCapacity || unit.carriedResource?.kind !== resourceDefinition.yieldResource)) {
    advanceUnitResourceDropoff(state, unit);
    return;
  }

  if (!resourceTile || !resourceDefinition) {
    clearUnitOrder(unit);
    return;
  }

  unit.currentOrder.target = { ...resourceTile };

  if (unit.movementTarget) {
    return;
  }

  if (!isWithinGatherRange(unit.position, resourceTile)) {
    moveUnitToGatherRange(state, unit, resourceTile);
    return;
  }

  const remainingCapacity = gatherCapacity - carriedAmount;
  const result = harvestResource(state, unit.currentOrder.resourceId, remainingCapacity);

  if (!result.ok) {
    if ((unit.carriedResource?.amount ?? 0) > 0) {
      advanceUnitResourceDropoff(state, unit);
      return;
    }

    clearUnitOrder(unit);
    return;
  }

  unit.carriedResource = {
    kind: result.kind,
    amount: (unit.carriedResource?.amount ?? 0) + result.gathered,
  };

  if (result.depleted || unit.carriedResource.amount >= gatherCapacity) {
    advanceUnitResourceDropoff(state, unit);
  }
}

function moveUnitToGatherRange(state: WorldState, unit: UnitState, resourceTile: GridPoint): void {
  const path = findPathForUnit(state, unit, resourceTile);

  if (!path) {
    clearUnitOrder(unit);
    return;
  }

  unit.movementPath = path;
  const nextTarget = path[0];

  if (nextTarget) {
    unit.movementTarget = nextTarget;
    return;
  }

  delete unit.movementTarget;
}

function isWithinGatherRange(position: GridPoint, resourceTile: GridPoint): boolean {
  return Math.max(Math.abs(Math.round(position.x) - resourceTile.x), Math.abs(Math.round(position.y) - resourceTile.y)) <= 1;
}

function advanceUnitResourceDropoff(state: WorldState, unit: UnitState): void {
  const carriedResource = unit.carriedResource;

  if (!carriedResource || carriedResource.amount <= 0) {
    return;
  }

  const dropoff = findNearestResourceDropoff(state, unit, carriedResource.kind);

  if (!dropoff) {
    waitForResourceDropoff(unit);
    return;
  }

  if (!isWithinDropoffRange(unit.position, dropoff)) {
    moveUnitToDropoff(state, unit, dropoff);
    return;
  }

  if (!depositCarriedResource(state, unit, carriedResource)) {
    return;
  }

  redirectGathererAfterDepletedResource(state, unit, carriedResource.kind);
}

function advanceOpportunisticResourceDropoff(state: WorldState, unit: UnitState): void {
  const carriedResource = unit.carriedResource;

  if (unit.currentOrder?.type === "gather" || unit.movementTarget || !carriedResource || carriedResource.amount <= 0) {
    return;
  }

  const dropoff = findNearestResourceDropoff(state, unit, carriedResource.kind);

  if (!dropoff || !isWithinDropoffRange(unit.position, dropoff)) {
    return;
  }

  depositCarriedResource(state, unit, carriedResource);
}

function depositCarriedResource(
  state: WorldState,
  unit: UnitState,
  carriedResource: NonNullable<UnitState["carriedResource"]>,
): boolean {
  const bank = state.playerResources[unit.playerId];

  if (!bank) {
    clearUnitOrder(unit);
    return false;
  }

  bank[carriedResource.kind] += carriedResource.amount;
  delete unit.carriedResource;
  return true;
}

function waitForResourceDropoff(unit: UnitState): void {
  delete unit.movementTarget;
  delete unit.movementPath;
}

function redirectGathererAfterDepletedResource(state: WorldState, unit: UnitState, resourceKind: BankResourceKind): void {
  if (unit.currentOrder?.type !== "gather" || findHarvestableResourceTile(state.map, unit.currentOrder.resourceId)) {
    return;
  }

  const nextResource = findNearestReachableHarvestableResource(state, unit, resourceKind, {
    anchor: unit.currentOrder.target,
    maxAnchorDistance: RESOURCE_RETARGET_RADIUS,
  });

  if (!nextResource) {
    clearUnitOrder(unit);
    return;
  }

  unit.currentOrder = { type: "gather", resourceId: nextResource.id, target: { ...nextResource.point } };
  moveUnitToGatherRange(state, unit, nextResource.point);
}

function findNearestReachableHarvestableResource(
  state: WorldState,
  unit: UnitState,
  resourceKind: BankResourceKind,
  options: { anchor?: GridPoint; maxAnchorDistance?: number } = {},
): { id: string; point: GridPoint } | null {
  let nearestResource: { id: string; point: GridPoint } | null = null;
  let nearestDistanceSq = Number.POSITIVE_INFINITY;
  const anchorDistanceSq = options.maxAnchorDistance === undefined
    ? Number.POSITIVE_INFINITY
    : Math.max(0, options.maxAnchorDistance) * Math.max(0, options.maxAnchorDistance);

  for (const layer of state.map.layers) {
    for (let tileIndex = 0; tileIndex < layer.tiles.length; tileIndex += 1) {
      const resource = layer.tiles[tileIndex]?.resource;
      const definition = resource ? getResourceDefinition(resource) : undefined;

      if (!resource || !definition || definition.yieldResource !== resourceKind || !isResourceHarvestable(resource)) {
        continue;
      }

      const point = {
        x: tileIndex % state.map.width,
        y: Math.floor(tileIndex / state.map.width),
      };

      if (options.anchor && getPointDistanceSq(options.anchor, point) > anchorDistanceSq) {
        continue;
      }

      const distanceSq = getPointDistanceSq(unit.position, point);

      if (
        distanceSq > nearestDistanceSq ||
        (distanceSq === nearestDistanceSq && nearestResource && resource.id.localeCompare(nearestResource.id) >= 0)
      ) {
        continue;
      }

      if (!findPathForUnit(state, unit, point)) {
        continue;
      }

      nearestResource = { id: resource.id, point };
      nearestDistanceSq = distanceSq;
    }
  }

  return nearestResource;
}

function getPointDistanceSq(a: GridPoint, b: GridPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;

  return dx * dx + dy * dy;
}

function moveUnitToDropoff(state: WorldState, unit: UnitState, dropoff: UnitState): void {
  const path = findPathForUnit(state, unit, dropoff.position);

  if (!path) {
    clearUnitOrder(unit);
    return;
  }

  unit.movementPath = path;
  const nextTarget = path[0];

  if (nextTarget) {
    unit.movementTarget = nextTarget;
    return;
  }

  delete unit.movementTarget;
}

function findNearestResourceDropoff(state: WorldState, unit: UnitState, resourceKind: BankResourceKind): UnitState | null {
  let nearestDropoff: UnitState | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of iterateUnitsOrdered(state)) {
    if (candidate.playerId !== unit.playerId) {
      continue;
    }

    if (isUnitUnderConstruction(candidate)) {
      continue;
    }

    const acceptedResources = (unitDefinitions[candidate.kind] as UnitDefinition).resourceDropoff;
    if (!acceptedResources?.includes(resourceKind)) {
      continue;
    }

    if (!isWithinDropoffRange(unit.position, candidate) && !findPathForUnit(state, unit, candidate.position)) {
      continue;
    }

    const distance = getDistanceToFootprint(unit.position, candidate);

    if (distance < nearestDistance) {
      nearestDropoff = candidate;
      nearestDistance = distance;
    }
  }

  return nearestDropoff;
}

function isWithinDropoffRange(position: GridPoint, dropoff: UnitState): boolean {
  return getDistanceToFootprint(position, dropoff) <= 1;
}

function getDistanceToFootprint(position: GridPoint, unit: UnitState): number {
  const footprint = unitDefinitions[unit.kind].footprint;
  const roundedPosition = { x: Math.round(position.x), y: Math.round(position.y) };
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const tile of getFootprintTiles(unit.position, footprint)) {
    nearestDistance = Math.min(
      nearestDistance,
      Math.max(Math.abs(roundedPosition.x - tile.x), Math.abs(roundedPosition.y - tile.y)),
    );
  }

  return nearestDistance;
}

function getGatherCapacity(unit: UnitState): number {
  return Math.max(1, (unitDefinitions[unit.kind] as UnitDefinition).resourceGatherCapacity ?? DEFAULT_GATHER_CAPACITY);
}

function advanceUnitConstruction(state: WorldState, unit: UnitState): void {
  if (unit.currentOrder?.type !== "build") {
    return;
  }

  const building = unit.currentOrder.buildingUnitId ? state.units[unit.currentOrder.buildingUnitId] : null;

  if (!building || building.kind !== unit.currentOrder.building || !isUnitUnderConstruction(building)) {
    clearUnitOrder(unit);
    return;
  }

  if (unit.movementTarget) {
    return;
  }

  if (!isWithinBuildRange(unit.position, building)) {
    moveUnitToBuildRange(state, unit, building);
    return;
  }

  const construction = building.construction;

  if (!construction) {
    clearUnitOrder(unit);
    return;
  }

  construction.remainingTicks = Math.max(0, construction.remainingTicks - getPlayerWorkTickAmount(state, unit.playerId));
  advanceConstructionHealth(building);

  if (construction.remainingTicks > 0) {
    return;
  }

  delete building.construction;
  clearUnitOrder(unit);
}

function isWithinBuildRange(position: GridPoint, building: UnitState): boolean {
  return getDistanceToFootprint(position, building) <= 1;
}

function moveUnitToBuildRange(state: WorldState, unit: UnitState, building: UnitState): void {
  const path = findBuildWorkPath(state, unit, building.kind as BuildingDefinitionId, building.position);

  if (!path) {
    clearUnitOrder(unit);
    return;
  }

  unit.movementPath = path;
  const nextTarget = path[0];

  if (nextTarget) {
    unit.movementTarget = nextTarget;
    return;
  }

  delete unit.movementTarget;
}

function clearUnitOrder(unit: UnitState): void {
  delete unit.movementTarget;
  delete unit.movementPath;
  delete unit.currentOrder;
  clearNavigationRoute(unit);
}

function advanceUnitRepair(state: WorldState, unit: UnitState): void {
  if (unit.currentOrder?.type !== "repair") {
    return;
  }

  const target = state.units[unit.currentOrder.targetUnitId];

  if (
    !target ||
    target.playerId !== unit.playerId ||
    unitDefinitions[target.kind].category !== "building"
  ) {
    clearUnitOrder(unit);
    return;
  }

  const targetUnderConstruction = isUnitUnderConstruction(target);

  if (!targetUnderConstruction && target.health.current >= target.health.max) {
    target.health.current = target.health.max;
    clearUnitOrder(unit);
    return;
  }

  if (unit.movementTarget) {
    return;
  }

  if (!isWithinRepairRange(unit.position, target)) {
    moveUnitToRepairRange(state, unit, target);
    return;
  }

  if (targetUnderConstruction) {
    advanceAssistedConstruction(state, unit, target);
    return;
  }

  target.health.current = Math.min(target.health.max, target.health.current + REPAIR_HEALTH_PER_TICK);

  if (target.health.current >= target.health.max) {
    clearUnitOrder(unit);
  }
}

function advanceAssistedConstruction(state: WorldState, worker: UnitState, building: UnitState): void {
  const construction = building.construction;

  if (!construction) {
    clearUnitOrder(worker);
    return;
  }

  construction.remainingTicks = Math.max(0, construction.remainingTicks - getPlayerWorkTickAmount(state, worker.playerId));
  advanceConstructionHealth(building);

  if (construction.remainingTicks > 0) {
    return;
  }

  delete building.construction;
  clearUnitOrder(worker);
}

function isWithinRepairRange(position: GridPoint, target: UnitState): boolean {
  return getDistanceToFootprint(position, target) <= 1;
}

function moveUnitToRepairRange(state: WorldState, unit: UnitState, target: UnitState): void {
  const path = findBuildWorkPath(state, unit, target.kind as BuildingDefinitionId, target.position);

  if (!path) {
    clearUnitOrder(unit);
    return;
  }

  unit.movementPath = path;
  setNextMovementTarget(unit, path);
}

function advanceUnitPatrol(state: WorldState, unit: UnitState): void {
  if (unit.currentOrder?.type !== "patrol" || unit.movementTarget) {
    return;
  }

  const order = unit.currentOrder;

  if (unit.navigation?.terminalReason === "mobile-obstruction") {
    // Re-evaluate the exact requested group after a blocker may have left. If
    // the target is still occupied, retain the pending wait; once it becomes
    // reachable, continue through the normal patrol leg/reversal handling.
    const resumedRoute = findNavigationRouteForUnit(state, unit, order.nextTarget);

    if (!resumedRoute) {
      clearUnitOrder(unit);
      return;
    }

    if (resumedRoute.terminalReason !== "already-at-goal") {
      applyNavigationRoute(unit, resumedRoute);
      return;
    }

    clearNavigationRoute(unit);
  }

  if (
    unit.navigation?.terminalReason === "blocked-goal" &&
    sameTile(unit.position, unit.navigation.resolvedGoal)
  ) {
    order.nextTarget = sameTile(order.nextTarget, order.target) ? { ...order.origin } : { ...order.target };
    clearNavigationRoute(unit);
  } else if (isAtOrderTarget(unit, order.nextTarget)) {
    order.nextTarget = sameTile(order.nextTarget, order.target) ? { ...order.origin } : { ...order.target };
  }

  const route = findNavigationRouteForUnit(state, unit, order.nextTarget);

  if (!route) {
    clearUnitOrder(unit);
    return;
  }

  applyNavigationRoute(unit, route);
}

function advanceUnitCombat(state: WorldState, projectileRegistry: ProjectileRegistry): void {
  for (const unit of iterateUnitsOrdered(state)) {
    if (!state.units[unit.id]) {
      continue;
    }

    if (isUnitUnderConstruction(unit) || unit.demolition) {
      continue;
    }

    if (unit.attackCooldownTicks !== undefined) {
      unit.attackCooldownTicks = Math.max(0, unit.attackCooldownTicks - 1);
    }

    const definition = unitDefinitions[unit.kind] as UnitDefinition;
    const combat = definition.combat;
    if (!combat) {
      continue;
    }

    const activeAttackTarget = unit.currentOrder?.type === "attack-unit"
      ? state.units[unit.currentOrder.targetUnitId]
      : undefined;
    if (tryExecutePlayerAutoAbility(state, unit, activeAttackTarget, clearUnitOrder)) {
      // A successfully delivered project auto ability consumes this combat
      // update, mirroring the confirmed class-78 normal-attack skip boundary.
      continue;
    }

    const target = getCombatTarget(state, unit, combat);

    if (isAggressiveTravelOrder(unit) && !target) {
      resumeAggressiveTravelDestination(state, unit);
      continue;
    }

    if (unit.currentOrder?.type === "attack-unit" && !target) {
      clearUnitOrder(unit);
      continue;
    }

    if (!target) {
      continue;
    }

    if (shouldAcquireAttackTarget(state, unit, target)) {
      unit.currentOrder = { type: "attack-unit", targetUnitId: target.id };
    }

    const distance = getUnitDistance(unit, target);
    if (shouldMoveTowardCombatTarget(unit, combat, distance)) {
      if (!moveUnitTowardCombatTarget(state, unit, target)) {
        if (unit.currentOrder?.type === "attack-unit" && !canReachAttackTargetPastMobileBlockers(state, unit, target)) {
          clearUnitOrder(unit);
        } else if (isAggressiveTravelOrder(unit)) {
          resumeAggressiveTravelDestination(state, unit);
        }
      }
      continue;
    }

    delete unit.movementTarget;
    delete unit.movementPath;

    if ((unit.attackCooldownTicks ?? 0) > 0) {
      continue;
    }

    const projectileProfileId = resolveProjectileDeliveryProfileId(unit, combat);
    if (projectileProfileId !== undefined) {
      spawnCombatProjectile(state, projectileRegistry, {
        profileId: projectileProfileId,
        source: unit,
        target,
        combat,
      });
      unit.attackCooldownTicks = combat.cooldownTicks;
      continue;
    }

    const damage = state.playerCheats[target.playerId]?.invincible
      ? 0
      : resolveDamageAmount({ amount: applyAuraAttackDamage(unit, combat.damage), type: combat.damageType ?? "physical" }, state);

    target.health.current = Math.max(0, target.health.current - damage);
    pushCombatEvent(state, unit, target, damage);
    unit.attackCooldownTicks = combat.cooldownTicks;

    if (target.health.current <= 0) {
      removeUnitFromWorld(state, target.id);
    }
  }
}

function pruneCombatEvents(state: WorldState): void {
  state.combatEvents = state.combatEvents.filter((event) => state.tick - event.tick <= COMBAT_EVENT_RETENTION_TICKS);
}

function pruneProjectileImpactEvents(state: WorldState): void {
  state.projectileImpactEvents = state.projectileImpactEvents.filter(
    (event) => state.tick - event.tick <= PROJECTILE_IMPACT_EVENT_RETENTION_TICKS,
  );
}

function pushCombatEvent(
  state: WorldState,
  source: UnitState,
  target: UnitState,
  damage: number,
): void {
  state.combatEvents.push({
    id: `${state.tick}:${source.id}:${target.id}`,
    tick: state.tick,
    sourceUnitId: source.id,
    targetUnitId: target.id,
    sourcePlayerId: source.playerId,
    targetPlayerId: target.playerId,
    sourceKind: source.kind,
    targetKind: target.kind,
    sourcePosition: { ...source.position },
    targetPosition: { ...target.position },
    damage,
    killed: target.health.current <= 0,
  });
}

function getCombatTarget(
  state: WorldState,
  unit: UnitState,
  combat: NonNullable<UnitDefinition["combat"]>,
): UnitState | null {
  if (unit.currentOrder?.type === "attack-unit") {
    const target = state.units[unit.currentOrder.targetUnitId];

    if (!target || arePlayersAllied(state, target.playerId, unit.playerId) || target.health.current <= 0) {
      return null;
    }

    return target;
  }

  if (unit.currentOrder?.type === "move") {
    return null;
  }

  if (isAggressiveTravelOrder(unit)) {
    return findNearestEnemyInRange(state, unit, combat.aggroRange, combat);
  }

  if (unit.currentOrder) {
    return findNearestEnemyInRange(state, unit, combat.range, combat);
  }

  const policy = getIdleCombatPolicy(unit.idleCombatPolicyId);
  return policy.selectTarget({
    state,
    unit,
    combat,
    findNearestEnemyInRange: (range) => findNearestEnemyInRange(state, unit, range, combat),
  });
}

function canReachAttackTargetPastMobileBlockers(state: WorldState, unit: UnitState, target: UnitState): boolean {
  return findPathForUnit(state, unit, target.position, { ignoreMobileBlockers: true }) !== null;
}

function shouldAcquireAttackTarget(state: WorldState, unit: UnitState, target: UnitState): boolean {
  return !unit.currentOrder && unit.movementSpeed > 0 && arePlayersEnemies(state, target.playerId, unit.playerId);
}

function shouldMoveTowardCombatTarget(
  unit: UnitState,
  combat: NonNullable<UnitDefinition["combat"]>,
  distance: number,
): boolean {
  if (distance <= combat.range || unit.movementSpeed <= 0) {
    return false;
  }

  return isAggressiveTravelOrder(unit) || unit.currentOrder?.type === "attack-unit";
}

function moveUnitTowardCombatTarget(state: WorldState, unit: UnitState, target: UnitState): boolean {
  const route = findNavigationRouteForUnit(state, unit, {
    x: Math.round(target.position.x),
    y: Math.round(target.position.y),
  });

  if (!route) {
    return false;
  }

  clearNavigationRoute(unit);
  unit.movementPath = route.path;
  setNextMovementTarget(unit, route.path);

  return true;
}

function resumeAggressiveTravelDestination(state: WorldState, unit: UnitState): void {
  const target = getAggressiveTravelTarget(unit);

  if (!target || pathEndsAt(unit, target) || isAtOrderTarget(unit, target)) {
    return;
  }

  const route = findNavigationRouteForUnit(state, unit, target);

  if (!route) {
    return;
  }

  applyNavigationRoute(unit, route);
}

function isAggressiveTravelOrder(unit: UnitState): boolean {
  return unit.currentOrder?.type === "attack-move" || unit.currentOrder?.type === "patrol";
}

function getAggressiveTravelTarget(unit: UnitState): GridPoint | null {
  if (unit.currentOrder?.type === "attack-move") {
    return unit.currentOrder.target;
  }

  if (unit.currentOrder?.type === "patrol") {
    return unit.currentOrder.nextTarget;
  }

  return null;
}

function pathEndsAt(unit: UnitState, target: GridPoint): boolean {
  const pathEnd = unit.movementPath?.at(-1);

  return pathEnd ? sameTile(pathEnd, target) : false;
}

function isAtOrderTarget(unit: UnitState, target: GridPoint): boolean {
  return Math.hypot(unit.position.x - target.x, unit.position.y - target.y) <= TARGET_EPSILON;
}

function sameTile(a: GridPoint, b: GridPoint): boolean {
  return Math.round(a.x) === Math.round(b.x) && Math.round(a.y) === Math.round(b.y);
}

function findNearestEnemyInRange(
  state: WorldState,
  unit: UnitState,
  range: number,
  combat: NonNullable<UnitDefinition["combat"]>,
): UnitState | null {
  let nearestEnemy: UnitState | null = null;
  const visibleRange = Math.min(range, getUnitSightRange(state, unit));
  let nearestDistanceSq = visibleRange * visibleRange;

  for (const candidate of iterateUnitsOrdered(state)) {
    if (!arePlayersEnemies(state, candidate.playerId, unit.playerId) || candidate.health.current <= 0) {
      continue;
    }

    const distanceSq = getUnitDistanceSq(unit, candidate);
    if (distanceSq <= nearestDistanceSq && canEngageCombatTarget(state, unit, candidate, combat, distanceSq)) {
      nearestEnemy = candidate;
      nearestDistanceSq = distanceSq;
    }
  }

  return nearestEnemy;
}

function getUnitSightRange(state: WorldState, unit: UnitState): number {
  const definition = unitDefinitions[unit.kind];
  const sightMultiplier = getEnvironmentSightMultiplier(state.environment, state.map.environment);

  return Math.max(0, Math.floor(definition.sightRadius * sightMultiplier));
}

function canEngageCombatTarget(
  state: WorldState,
  unit: UnitState,
  target: UnitState,
  combat: NonNullable<UnitDefinition["combat"]>,
  distanceSq = getUnitDistanceSq(unit, target),
): boolean {
  return (
    distanceSq <= combat.range * combat.range ||
    (unit.movementSpeed > 0 && findPathForUnit(state, unit, target.position) !== null)
  );
}

function getUnitDistance(unit: UnitState, target: UnitState): number {
  return Math.sqrt(getUnitDistanceSq(unit, target));
}

function getUnitDistanceSq(unit: UnitState, target: UnitState): number {
  let nearestDistanceSq = Number.POSITIVE_INFINITY;

  for (const sourceTile of getCombatFootprintTiles(unit)) {
    for (const targetTile of getCombatFootprintTiles(target)) {
      const deltaX = sourceTile.x - targetTile.x;
      const deltaY = sourceTile.y - targetTile.y;

      nearestDistanceSq = Math.min(nearestDistanceSq, deltaX * deltaX + deltaY * deltaY);
    }
  }

  return nearestDistanceSq;
}

function getCombatFootprintTiles(unit: UnitState): GridPoint[] {
  const footprint = unitDefinitions[unit.kind].footprint;

  return getFootprintTiles(unit.position, footprint);
}
