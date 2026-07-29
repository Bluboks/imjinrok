import { createUnitId, findBuildWorkPath, findUnitSpawnPoint } from "./commands.js";
import { applyScenarioScriptedEvents, evaluateScenarioRuntime } from "./scenario.js";
import { SIM_TICK_SECONDS } from "./constants.js";
import { advanceConstructionHealth, isUnitUnderConstruction, updateConstructionHealth } from "./construction.js";
import { resolveDamageAmount } from "./damage.js";
import { arePlayersAllied, arePlayersEnemies } from "./diplomacy.js";
import { createUnitState } from "./entities.js";
import { getEnvironmentSightMultiplier, updateEnvironment } from "./environment.js";
import { findPathForUnit } from "./navigation.js";
import { canUnitOccupyPosition, createMovementReservation, reserveUnitPosition, type MovementReservation } from "./collision.js";
import { getFootprintTiles } from "./placement.js";
import { getPlayerPopulationState, getPopulationCost } from "./population.js";
import { applyCompletedResearchToUnit, completeResearch } from "./research.js";
import { findHarvestableResourceTile, findResourceNode, findResourceTile, getResourceDefinition, harvestResource, isResourceHarvestable, updateResourceRegrowth } from "./resources.js";
import { isTilePassableForUnit, resolveFloodDrowning } from "./terrain.js";
import { iterateUnitsOrdered, removeUnitFromWorld } from "./units.js";
import { unitCanPerformAction, unitDefinitions, type BankResourceKind, type BuildingDefinitionId, type GridPoint, type ScenarioAreaDefinition, type UnitDefinition } from "../../shared/src/index.js";
import type { UnitState, UnitTargetSelectorState, WorldState } from "./types.js";

const TARGET_EPSILON = 0.001;
const DEFAULT_GATHER_CAPACITY = 10;
const RESOURCE_RETARGET_RADIUS = 10;
const REPAIR_HEALTH_PER_TICK = 4;
const COMBAT_EVENT_RETENTION_TICKS = 8;
const FAST_PRODUCTION_WORK_TICK_AMOUNT = 4;

export function advanceWorldTick(state: WorldState): void {
  if (state.scenario.status !== "running") {
    return;
  }

  state.tick += 1;
  pruneCombatEvents(state);
  // Environment updates first so future systems read this tick's state.
  updateEnvironment(state);
  updateResourceRegrowth(state);
  resolveFloodDrowning(state);
  applyScenarioScriptedEvents(state);
  if (state.scenario.status !== "running") {
    return;
  }
  advanceProductionQueues(state);
  advanceResearchQueues(state);

  const movementReservation = createMovementReservation();

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

  advanceUnitCombat(state);

  resolveFloodDrowning(state);

  resolveScenarioRuntimeFollowUps(state);
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
  const path = findPathForUnit(state, unit, behavior.moveTarget, { allowPartial: behavior.allowPartialPath === true });

  if (!path) {
    return;
  }

  unit.movementPath = path;
  setNextMovementTarget(unit, path);
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

    if (isUnitUnderConstruction(unit) || !queue || !queueItem) {
      continue;
    }

    queueItem.remainingTicks = Math.max(0, queueItem.remainingTicks - getPlayerWorkTickAmount(state, unit.playerId));

    if (queueItem.remainingTicks > 0) {
      continue;
    }

    if (!canCompleteQueuedUnit(state, unit.playerId, queueItem.unit)) {
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

function canCompleteQueuedUnit(state: WorldState, playerId: string, unitKind: UnitState["kind"]): boolean {
  const populationCost = getPopulationCost(unitKind);

  if (populationCost <= 0) {
    return true;
  }

  const population = getPlayerPopulationState(state, playerId);

  return population.used + populationCost <= population.cap;
}

function getPlayerWorkTickAmount(state: WorldState, playerId: string): number {
  return state.playerCheats[playerId]?.fastProduction ? FAST_PRODUCTION_WORK_TICK_AMOUNT : 1;
}

function advanceResearchQueues(state: WorldState): void {
  for (const unit of iterateUnitsOrdered(state)) {
    const queue = unit.researchQueue;
    const queueItem = queue?.[0];

    if (isUnitUnderConstruction(unit) || !queue || !queueItem) {
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

function applyProductionRally(state: WorldState, building: UnitState, unit: UnitState): void {
  const rallyPoint = building.rallyPoint;

  if (!rallyPoint || unit.movementSpeed <= 0) {
    return;
  }

  if (rallyPoint.resourceKind && unitCanPerformAction(unit.kind, "gather")) {
    const resourceRally = resolveProductionResourceRally(state, unit, rallyPoint);

    if (resourceRally) {
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

  const path = findPathForUnit(state, unit, rallyPoint.target);

  if (!path) {
    return;
  }

  const orderType = rallyPoint.mode === "attack-move" && unitCanPerformAction(unit.kind, "attack-move")
    ? "attack-move"
    : "move";

  unit.movementPath = path;
  setNextMovementTarget(unit, path);
  unit.currentOrder = { type: orderType, target: { ...(path[path.length - 1] ?? rallyPoint.target) } };
}

function resolveProductionResourceRally(
  state: WorldState,
  unit: UnitState,
  rallyPoint: NonNullable<UnitState["rallyPoint"]>,
): { resourceId: string; target: GridPoint; path: GridPoint[] } | null {
  if (rallyPoint.resourceId) {
    const resourceTarget = findHarvestableResourceTile(state.map, rallyPoint.resourceId);

    if (resourceTarget) {
      const path = findPathForUnit(state, unit, resourceTarget);

      if (path) {
        return { resourceId: rallyPoint.resourceId, target: resourceTarget, path };
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

  const path = findPathForUnit(state, unit, replacement.point);

  return path
    ? { resourceId: replacement.id, target: replacement.point, path }
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

  if (!reserveUnitPosition(movementReservation, unit, target)) {
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

  if (unit.currentOrder?.type === "move") {
    delete unit.currentOrder;
  }
}

function repathBlockedMovementWaypoint(state: WorldState, unit: UnitState): void {
  const destination = getMovementDestination(unit);

  if (!destination) {
    return;
  }

  const path = findPathForUnit(state, unit, destination, {
    allowPartial: unit.scriptedBehavior?.allowPartialPath === true,
  });

  if (!path) {
    return;
  }

  // The only reachable fallback can be the current footprint. Keep the blocked
  // target so a later removal or move can admit the unit on a future tick.
  if (path.length === 0) {
    return;
  }

  unit.movementPath = path;
  setNextMovementTarget(unit, path);
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

  if (pathExhausted && order?.type === "move" && order.followUpAttackTarget && !unit.movementTarget && !unit.movementPath) {
    applyFollowUpAttackTarget(state, unit, order.followUpAttackTarget);
    return;
  }

  if ((order?.type === "move" || order?.type === "attack-move") && isAtOrderTarget(unit, order.target)) {
    delete unit.currentOrder;
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

  if (isAtOrderTarget(unit, order.nextTarget)) {
    order.nextTarget = sameTile(order.nextTarget, order.target) ? { ...order.origin } : { ...order.target };
  }

  const path = findPathForUnit(state, unit, order.nextTarget);

  if (!path) {
    clearUnitOrder(unit);
    return;
  }

  unit.movementPath = path;
  setNextMovementTarget(unit, path);
}

function advanceUnitCombat(state: WorldState): void {
  for (const unit of iterateUnitsOrdered(state)) {
    if (!state.units[unit.id]) {
      continue;
    }

    if (isUnitUnderConstruction(unit)) {
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

    const damage = state.playerCheats[target.playerId]?.invincible
      ? 0
      : resolveDamageAmount({ amount: combat.damage, type: combat.damageType ?? "physical" }, state);

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

  const engagementRange = getEngagementRange(unit, combat);

  return findNearestEnemyInRange(state, unit, engagementRange, combat);
}

function canReachAttackTargetPastMobileBlockers(state: WorldState, unit: UnitState, target: UnitState): boolean {
  return findPathForUnit(state, unit, target.position, { ignoreMobileBlockers: true }) !== null;
}

function getEngagementRange(unit: UnitState, combat: NonNullable<UnitDefinition["combat"]>): number {
  if (isAggressiveTravelOrder(unit)) {
    return combat.aggroRange;
  }

  if (!unit.currentOrder && unit.movementSpeed > 0) {
    return combat.aggroRange;
  }

  return combat.range;
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
  const path = findPathForUnit(state, unit, {
    x: Math.round(target.position.x),
    y: Math.round(target.position.y),
  });

  if (!path) {
    return false;
  }

  unit.movementPath = path;
  const nextTarget = path[0];

  if (nextTarget) {
    unit.movementTarget = nextTarget;
  } else {
    delete unit.movementTarget;
  }

  return true;
}

function resumeAggressiveTravelDestination(state: WorldState, unit: UnitState): void {
  const target = getAggressiveTravelTarget(unit);

  if (!target || pathEndsAt(unit, target) || isAtOrderTarget(unit, target)) {
    return;
  }

  const path = findPathForUnit(state, unit, target);

  if (!path) {
    return;
  }

  unit.movementPath = path;
  const nextTarget = path[0];

  if (nextTarget) {
    unit.movementTarget = nextTarget;
  } else {
    delete unit.movementTarget;
  }
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
