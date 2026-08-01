import {
  getTileAt,
  terrainDefinitions,
  type GridPoint,
  type MapDefinition,
  type ScenarioDefinition,
} from "../../shared/src/index.js";
import { getBlockingGroupAtTile, getEntityBlockingTiles } from "./collision.js";
import { defaultPathfinderRegistry, requirePathfinder } from "./pathfinderRegistry.js";
import type { FindPathOptions, Pathfinder } from "./pathfinder.js";
import { resourceBlocksMovement } from "./resources.js";
import { isTilePassableForUnit } from "./terrain.js";
import type { MovementBlockingGroup } from "./movementCollisionPolicy.js";
import type { NavigationTerminalReason, UnitNavigationState, UnitState, WorldState } from "./types.js";

const NEIGHBORS: readonly GridPoint[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: 1, y: 1 },
  { x: -1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: -1 },
];

const MAX_PATHFINDING_ITERATIONS = 100_000;
const MAX_GOAL_SEARCH_NODES = 8_192;
const MAX_GOAL_CANDIDATES = 64;

export type { FindPathOptions } from "./pathfinder.js";
export type { NavigationTerminalReason } from "./types.js";

/**
 * Owns strategic destination separately from physical movement waypoints.
 * `path` never uses the current tile as a sentinel; terminal intent is explicit.
 */
export interface NavigationRoute extends UnitNavigationState {
  readonly path: GridPoint[];
}

export const CORE_A_STAR_PATHFINDER_ID = "core:a-star";
/**
 * A source-backed local greedy search adapted to the product's full-path
 * navigation contract. It is not a claim of full original-game parity.
 */
export const SOURCE_GREEDY_LOCAL_ADAPTER_PATHFINDER_ID = "imjinrok:source-greedy-local-adapter";

const SOURCE_GREEDY_SEARCH_RADIUS = 25;
/** Product-wide accepted-node budget adapted conservatively from the source gate. */
export const SOURCE_GREEDY_ACCEPTED_NODE_LIMIT = 6_000;

/** Actual core-search order, not the helper-only y-biased vector. */
export const SOURCE_GREEDY_CANDIDATE_OFFSETS: readonly GridPoint[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 1 },
  { x: -1, y: 1 },
  { x: 0, y: -1 },
];

export const coreAStarPathfinder: Pathfinder = {
  id: CORE_A_STAR_PATHFINDER_ID,
  findPath: findPathWithCoreAStar,
};

export const sourceGreedyLocalAdapterPathfinder: Pathfinder = {
  id: SOURCE_GREEDY_LOCAL_ADAPTER_PATHFINDER_ID,
  findPath: findPathWithSourceGreedyLocalAdapter,
};

defaultPathfinderRegistry.register(coreAStarPathfinder);
defaultPathfinderRegistry.register(sourceGreedyLocalAdapterPathfinder);

/** Scenario selection takes precedence over the optional map selection. */
export function resolvePathfindingProfileId(map: MapDefinition, scenario: ScenarioDefinition): string {
  const profileId = scenario.pathfindingProfileId ?? map.pathfindingProfileId ?? CORE_A_STAR_PATHFINDER_ID;
  requirePathfinder(profileId);
  return profileId;
}

export function findPathForUnit(
  state: WorldState,
  unit: UnitState,
  target: GridPoint,
  options: FindPathOptions = {},
): GridPoint[] | null {
  return requirePathfinder(state.pathfindingProfileId).findPath(state, unit, target, options);
}

export function findNavigationRouteForUnit(
  state: WorldState,
  unit: UnitState,
  target: GridPoint,
  options: FindPathOptions = {},
): NavigationRoute | null {
  const requestedGoal = toTilePoint(target);
  const start = toTilePoint(unit.position);
  const path = findPathForUnit(state, unit, requestedGoal, options);

  if (path === null) {
    return null;
  }

  const requestedBlocker = getRequestedBlockingGroup(state, unit, requestedGoal, options);
  const resolvedGoal = path.at(-1) ?? start;
  const terminalReason = sameTile(start, requestedGoal) && path.length === 0 &&
    isTilePassableForUnit(state, unit, requestedGoal) && requestedBlocker === null
    ? "already-at-goal"
    : sameTile(resolvedGoal, requestedGoal)
      ? undefined
      : requestedBlocker?.classification === "mobile"
        ? "mobile-obstruction"
        : "blocked-goal";

  return {
    path,
    requestedGoal,
    resolvedGoal,
    ...(terminalReason ? { terminalReason } : {}),
  };
}

/** Applies one strategic route without duplicating semantic endpoint inference in callers. */
export function applyNavigationRoute(unit: UnitState, route: NavigationRoute): void {
  unit.navigation = {
    requestedGoal: { ...route.requestedGoal },
    resolvedGoal: { ...route.resolvedGoal },
    ...(route.terminalReason ? { terminalReason: route.terminalReason } : {}),
  };
  unit.movementPath = route.path.map((point) => ({ ...point }));
  const nextTarget = unit.movementPath[0];

  if (nextTarget) {
    unit.movementTarget = { ...nextTarget };
  } else if (route.terminalReason === "mobile-obstruction") {
    // A concrete resolved endpoint keeps legacy observers aware of a pending
    // mobile wait; the ordinary waypoint array remains free of sentinels.
    unit.movementTarget = { ...route.resolvedGoal };
  } else {
    delete unit.movementTarget;
  }
}

export function clearNavigationRoute(unit: UnitState): void {
  delete unit.navigation;
}

function findPathWithCoreAStar(
  state: WorldState,
  unit: UnitState,
  target: GridPoint,
  options: FindPathOptions = {},
): GridPoint[] | null {
  const start = toTilePoint(unit.position);
  const requestedGoal = toTilePoint(target);
  const blockedTilesWithoutMobile = getEntityBlockingTiles(state, unit.id, false);
  const blockedTilesWithMobile = getEntityBlockingTiles(state, unit.id, true);
  const blockedTiles = options.ignoreMobileBlockers === true
    ? blockedTilesWithoutMobile
    : blockedTilesWithMobile;
  const mobileBlockedTiles = getMobileBlockedTiles(blockedTilesWithMobile, blockedTilesWithoutMobile);
  const requestedBlocker = getRequestedBlockingGroup(
    state,
    unit,
    requestedGoal,
    options,
    blockedTiles,
    blockedTilesWithoutMobile,
    mobileBlockedTiles,
    blockedTilesWithMobile,
  );
  const startKey = toTileKey(start);

  blockedTiles.delete(startKey);

  const goals = resolveWalkableGoals(state, unit, requestedGoal, blockedTiles, requestedBlocker);

  if (goals.length === 0) {
    return null;
  }

  return findPathToAnyGoal(state, unit, start, goals, blockedTiles, requestedGoal, options);
}

/**
 * Product adapter around the bounded source kernel. Each call retains the
 * source search's score/order/window/cap rules, then this adapter chains its
 * insertion-parent traces into the product's complete path contract.
 *
 * Goal adaptation, product passability/collision callbacks, accepted-node budgeting,
 * and chaining are product policy. In particular this intentionally does not
 * reproduce the source waypoint postprocess, workspace lifecycle, terrain
 * mask producer, or caller-side movement lifecycle.
 */
function findPathWithSourceGreedyLocalAdapter(
  state: WorldState,
  unit: UnitState,
  target: GridPoint,
  options: FindPathOptions = {},
): GridPoint[] | null {
  const start = toTilePoint(unit.position);
  const requestedGoal = toTilePoint(target);
  const blockedTilesWithoutMobile = getEntityBlockingTiles(state, unit.id, false);
  const blockedTilesWithMobile = getEntityBlockingTiles(state, unit.id, true);
  const blockedTiles = options.ignoreMobileBlockers === true
    ? blockedTilesWithoutMobile
    : blockedTilesWithMobile;
  const mobileBlockedTiles = getMobileBlockedTiles(blockedTilesWithMobile, blockedTilesWithoutMobile);
  const requestedBlocker = getRequestedBlockingGroup(
    state,
    unit,
    requestedGoal,
    options,
    blockedTiles,
    blockedTilesWithoutMobile,
    mobileBlockedTiles,
    blockedTilesWithMobile,
  );
  const startKey = toTileKey(start);

  blockedTiles.delete(startKey);

  // Reusing the existing product resolution keeps blocked-goal behavior
  // consistent with core:a-star; the source kernel still scores against the
  // user's requested tile, rather than an arbitrary resolved neighbor.
  const goals = resolveWalkableGoals(state, unit, requestedGoal, blockedTiles, requestedBlocker);

  if (goals.length === 0) {
    return null;
  }

  const goalKeys = new Set(goals.map(toTileKey));
  let current = start;
  let acceptedNodes = 0;
  const path: GridPoint[] = [];
  const chainedEndpoints = new Set([startKey]);

  if (goalKeys.has(startKey)) {
    return [];
  }

  while (acceptedNodes < SOURCE_GREEDY_ACCEPTED_NODE_LIMIT) {
    const local = runSourceGreedyLocalSearch(
      state,
      unit,
      current,
      requestedGoal,
      goalKeys,
      blockedTiles,
      SOURCE_GREEDY_ACCEPTED_NODE_LIMIT - acceptedNodes,
    );
    acceptedNodes += local.acceptedNodes;

    const trace = local.insertionParentTrace.slice(1);

    // A local search that has admitted no candidate, produced no endpoint
    // progress, or returns to a chained point cannot advance this product
    // path. Every accepted, appended local segment consumes the finite total
    // accepted-node budget, so no fabricated query-count cap is needed.
    if (
      local.acceptedNodes === 0 ||
      trace.length === 0 ||
      trace.some((point) => chainedEndpoints.has(toTileKey(point)))
    ) {
      break;
    }

    path.push(...trace);
    for (const point of trace) {
      chainedEndpoints.add(toTileKey(point));
    }
    current = trace[trace.length - 1] ?? current;

    if (local.reachedGoal) {
      return path;
    }
  }

  return options.allowPartial === true && path.length > 0 ? path : null;
}

function getMobileBlockedTiles(blockedTiles: ReadonlySet<string>, blockedTilesWithoutMobile: ReadonlySet<string>): Set<string> {
  return new Set([...blockedTiles].filter((key) => !blockedTilesWithoutMobile.has(key)));
}

function getRequestedBlockingGroup(
  state: WorldState,
  unit: UnitState,
  requestedGoal: GridPoint,
  options: FindPathOptions,
  blockedTiles?: ReadonlySet<string>,
  blockedTilesWithoutMobile?: ReadonlySet<string>,
  mobileBlockedTiles?: ReadonlySet<string>,
  blockedTilesWithMobile?: ReadonlySet<string>,
): MovementBlockingGroup | null {
  const effectiveBlockedTilesWithoutMobile = blockedTilesWithoutMobile ?? getEntityBlockingTiles(state, unit.id, false);
  const aggregateBlockedTiles = blockedTilesWithMobile ?? getEntityBlockingTiles(state, unit.id, true);
  validateBlockingTileMonotonicity(effectiveBlockedTilesWithoutMobile, aggregateBlockedTiles);
  const effectiveBlockedTiles = blockedTiles ?? (options.ignoreMobileBlockers === true
    ? effectiveBlockedTilesWithoutMobile
    : aggregateBlockedTiles);
  const effectiveMobileBlockedTiles = mobileBlockedTiles ?? getMobileBlockedTiles(aggregateBlockedTiles, effectiveBlockedTilesWithoutMobile);
  const requestedKey = toTileKey(requestedGoal);

  if (!isTilePassableForUnit(state, unit, requestedGoal) || !effectiveBlockedTiles.has(requestedKey)) {
    return null;
  }

  const staticBlocked = effectiveBlockedTilesWithoutMobile.has(requestedKey);
  const classification = staticBlocked ? "static" : effectiveMobileBlockedTiles.has(requestedKey) ? "mobile" : null;

  if (!classification) {
    throw new Error(`Movement collision policy returned inconsistent blocking tiles for requested goal '${requestedKey}'.`);
  }

  const group = getBlockingGroupAtTile(state, unit.id, requestedGoal, classification === "mobile");

  if (!group) {
    throw new Error(`Movement collision policy '${state.movementCollisionProfileId ?? "default"}' returned no blocking group for requested goal '${requestedKey}'.`);
  }

  validateBlockingGroup(
    state,
    unit,
    group,
    requestedGoal,
    classification,
    aggregateBlockedTiles,
    effectiveBlockedTilesWithoutMobile,
  );
  return group;
}

function validateBlockingTileMonotonicity(
  blockedTilesWithoutMobile: ReadonlySet<string>,
  blockedTilesWithMobile: ReadonlySet<string>,
): void {
  for (const key of blockedTilesWithoutMobile) {
    if (!blockedTilesWithMobile.has(key)) {
      throw new Error(`Movement collision policy returned a non-monotonic blocking view: without-mobile tile '${key}' is absent from the with-mobile aggregate.`);
    }
  }
}

function validateBlockingGroup(
  state: WorldState,
  unit: UnitState,
  group: MovementBlockingGroup,
  requestedGoal: GridPoint,
  expectedClassification: MovementBlockingGroup["classification"],
  blockedTilesWithMobile: ReadonlySet<string>,
  blockedTilesWithoutMobile: ReadonlySet<string>,
): void {
  validateBlockingGroupShape(state, group, requestedGoal, expectedClassification);
  const keys = new Set(group.tiles.map(toTileKey));

  const applicableAggregate = expectedClassification === "static"
    ? blockedTilesWithoutMobile
    : blockedTilesWithMobile;

  for (const tile of group.tiles) {
    const key = toTileKey(tile);

    if (!applicableAggregate.has(key)) {
      throw new Error(`Movement collision policy returned a ${expectedClassification} blocking-group tile '${key}' absent from its applicable aggregate.`);
    }

    const tileGroup = getBlockingGroupAtTile(
      state,
      unit.id,
      tile,
      expectedClassification === "mobile",
    );

    if (!tileGroup) {
      throw new Error(`Movement collision policy returned no ${expectedClassification} blocking group for declared tile '${key}'.`);
    }

    validateBlockingGroupShape(state, tileGroup, tile, expectedClassification);
    const tileGroupKeys = new Set(tileGroup.tiles.map(toTileKey));

    if (
      tileGroup.id !== group.id ||
      tileGroup.classification !== group.classification ||
      tileGroupKeys.size !== keys.size ||
      [...keys].some((groupKey) => !tileGroupKeys.has(groupKey))
    ) {
      throw new Error(`Movement collision policy returned inconsistent blocker group identity for declared tile '${key}'.`);
    }
  }
}

function validateBlockingGroupShape(
  state: WorldState,
  group: MovementBlockingGroup,
  requestedGoal: GridPoint,
  expectedClassification: MovementBlockingGroup["classification"],
): void {
  if (
    typeof group.id !== "string" ||
    !group.id.trim() ||
    group.classification !== expectedClassification ||
    !Array.isArray(group.tiles) ||
    group.tiles.length === 0
  ) {
    throw new Error("Movement collision policy returned an invalid blocking group.");
  }

  const keys = new Set<string>();

  for (const tile of group.tiles) {
    if (!tile || typeof tile !== "object" || !Number.isInteger(tile.x) || !Number.isInteger(tile.y)) {
      throw new Error("Movement collision policy returned a non-integer blocking-group tile.");
    }

    if (tile.x < 0 || tile.x >= state.map.width || tile.y < 0 || tile.y >= state.map.height) {
      throw new Error("Movement collision policy returned an out-of-map blocking-group tile.");
    }

    const key = toTileKey(tile);

    if (keys.has(key)) {
      throw new Error("Movement collision policy returned duplicate blocking-group tiles.");
    }

    keys.add(key);
  }

  if (!keys.has(toTileKey(requestedGoal))) {
    throw new Error("Movement collision policy returned a blocking group that does not contain the requested tile.");
  }
}

/** Product-callback adapter for one bounded source-greedy local search. */
export interface SourceGreedyLocalSearchResult {
  readonly acceptedNodes: number;
  readonly frontierCapacity: number;
  readonly insertionParentTrace: GridPoint[];
  readonly maximumFrontierSize: number;
  readonly reachedGoal: boolean;
}

interface SourceGreedyVisit {
  readonly coordinate: GridPoint;
  readonly parentKey: string | null;
}

interface SourceGreedyFrontierEntry {
  readonly coordinate: GridPoint;
  readonly score: number;
}

export function runSourceGreedyLocalSearch(
  state: WorldState,
  unit: UnitState,
  start: GridPoint,
  requestedGoal: GridPoint,
  goalKeys: ReadonlySet<string>,
  blockedTiles: ReadonlySet<string>,
  acceptedNodeBudget: number,
): SourceGreedyLocalSearchResult {
  const startKey = toTileKey(start);
  const frontierCapacity = sourceGreedyFrontierCapacity(start, requestedGoal);
  const visits = new Map<string, SourceGreedyVisit>([[startKey, { coordinate: start, parentKey: null }]]);
  const initialEntry: SourceGreedyFrontierEntry = { coordinate: start, score: squaredDistance(start, requestedGoal) };
  const frontier: SourceGreedyFrontierEntry[] = [initialEntry];
  let closest = initialEntry;
  let acceptedNodes = 0;
  let maximumFrontierSize = frontier.length;

  while (frontier.length > 0 && acceptedNodes < acceptedNodeBudget) {
    const currentIndex = selectStrictClosestFrontierIndex(frontier);
    const current = frontier.splice(currentIndex, 1)[0];

    if (!current) {
      break;
    }

    if (goalKeys.has(toTileKey(current.coordinate))) {
      return finishSourceGreedyLocalSearch(current.coordinate, true, acceptedNodes, frontierCapacity, maximumFrontierSize, visits);
    }

    for (const offset of SOURCE_GREEDY_CANDIDATE_OFFSETS) {
      if (acceptedNodes >= acceptedNodeBudget) {
        break;
      }

      const candidate = { x: current.coordinate.x + offset.x, y: current.coordinate.y + offset.y };
      const candidateKey = toTileKey(candidate);

      if (
        Math.abs(candidate.x - start.x) > SOURCE_GREEDY_SEARCH_RADIUS ||
        Math.abs(candidate.y - start.y) > SOURCE_GREEDY_SEARCH_RADIUS ||
        visits.has(candidateKey) ||
        !isWalkable(state, unit, candidate, blockedTiles)
      ) {
        continue;
      }

      const entry = { coordinate: candidate, score: squaredDistance(candidate, requestedGoal) };
      visits.set(candidateKey, { coordinate: candidate, parentKey: toTileKey(current.coordinate) });
      frontier.push(entry);
      acceptedNodes += 1;
      maximumFrontierSize = Math.max(maximumFrontierSize, frontier.length);

      if (entry.score < closest.score) {
        closest = entry;
      }

      if (goalKeys.has(candidateKey)) {
        return finishSourceGreedyLocalSearch(candidate, true, acceptedNodes, frontierCapacity, maximumFrontierSize, visits);
      }

      if (frontier.length >= frontierCapacity) {
        return finishSourceGreedyLocalSearch(closest.coordinate, false, acceptedNodes, frontierCapacity, maximumFrontierSize, visits);
      }
    }
  }

  return finishSourceGreedyLocalSearch(closest.coordinate, false, acceptedNodes, frontierCapacity, maximumFrontierSize, visits);
}

function sourceGreedyFrontierCapacity(start: GridPoint, target: GridPoint): number {
  const chebyshevDistance = Math.max(Math.abs(target.x - start.x), Math.abs(target.y - start.y));

  if (chebyshevDistance <= 2) {
    return 26;
  }

  return chebyshevDistance <= 4 ? 40 : 80;
}

function selectStrictClosestFrontierIndex(frontier: readonly SourceGreedyFrontierEntry[]): number {
  let selectedIndex = 0;
  let selectedScore = frontier[0]?.score ?? Number.POSITIVE_INFINITY;

  for (let index = 1; index < frontier.length; index += 1) {
    const score = frontier[index]?.score ?? Number.POSITIVE_INFINITY;

    if (score < selectedScore) {
      selectedIndex = index;
      selectedScore = score;
    }
  }

  return selectedIndex;
}

function finishSourceGreedyLocalSearch(
  endpoint: GridPoint,
  reachedGoal: boolean,
  acceptedNodes: number,
  frontierCapacity: number,
  maximumFrontierSize: number,
  visits: ReadonlyMap<string, SourceGreedyVisit>,
): SourceGreedyLocalSearchResult {
  const trace: GridPoint[] = [];
  let visit = visits.get(toTileKey(endpoint));

  while (visit) {
    trace.push(visit.coordinate);
    visit = visit.parentKey ? visits.get(visit.parentKey) : undefined;
  }

  trace.reverse();
  return { acceptedNodes, frontierCapacity, insertionParentTrace: trace, maximumFrontierSize, reachedGoal };
}

function findPathToAnyGoal(
  state: WorldState,
  unit: UnitState,
  start: GridPoint,
  goals: readonly GridPoint[],
  blockedTiles: ReadonlySet<string>,
  requestedGoal: GridPoint,
  options: FindPathOptions,
): GridPoint[] | null {
  const startKey = toTileKey(start);
  const goalKeys = new Set(goals.map(toTileKey));
  let closestReachableKey = startKey;
  let closestReachableScore = heuristic(start, requestedGoal);

  if (goalKeys.has(startKey)) {
    return [];
  }

  const openSet = [start];
  const openKeys = new Set([startKey]);
  const cameFrom = new Map<string, string>();
  const pointsByKey = new Map<string, GridPoint>([[startKey, start]]);
  const gScore = new Map<string, number>([[startKey, 0]]);
  const fScore = new Map<string, number>([[startKey, goalHeuristic(start, goals, requestedGoal)]]);
  let iterations = 0;

  while (openSet.length > 0 && iterations < MAX_PATHFINDING_ITERATIONS) {
    iterations += 1;
    const currentIndex = getLowestScoreIndex(openSet, fScore);
    const current = openSet.splice(currentIndex, 1)[0];

    if (!current) {
      break;
    }

    const currentKey = toTileKey(current);
    openKeys.delete(currentKey);

    if (goalKeys.has(currentKey)) {
      return reconstructPath(cameFrom, pointsByKey, currentKey);
    }

    const currentScore = heuristic(current, requestedGoal);

    if (currentScore < closestReachableScore) {
      closestReachableKey = currentKey;
      closestReachableScore = currentScore;
    }

    for (const neighborOffset of NEIGHBORS) {
      const neighbor = { x: current.x + neighborOffset.x, y: current.y + neighborOffset.y };

      if (!isWalkable(state, unit, neighbor, blockedTiles)) {
        continue;
      }

      if (isDiagonal(neighborOffset) && !canMoveDiagonally(state, unit, current, neighborOffset, blockedTiles)) {
        continue;
      }

      const neighborKey = toTileKey(neighbor);
      const movementCost = neighborOffset.x !== 0 && neighborOffset.y !== 0 ? Math.SQRT2 : 1;
      const tentativeGScore = (gScore.get(currentKey) ?? Number.POSITIVE_INFINITY) + movementCost;

      if (tentativeGScore >= (gScore.get(neighborKey) ?? Number.POSITIVE_INFINITY)) {
        continue;
      }

      cameFrom.set(neighborKey, currentKey);
      pointsByKey.set(neighborKey, neighbor);
      gScore.set(neighborKey, tentativeGScore);
      fScore.set(neighborKey, tentativeGScore + goalHeuristic(neighbor, goals, requestedGoal));

      if (!openKeys.has(neighborKey)) {
        openSet.push(neighbor);
        openKeys.add(neighborKey);
      }
    }
  }

  if (options.allowPartial === true && closestReachableKey !== startKey) {
    return reconstructPath(cameFrom, pointsByKey, closestReachableKey);
  }

  return null;
}

export function isTerrainWalkable(map: MapDefinition, point: GridPoint): boolean {
  if (!isPointInMap(map, point)) {
    return false;
  }

  const tile = getTileAt(map, point.x, point.y);

  return !terrainDefinitions[tile.terrain].blocksMovement;
}

function resolveWalkableGoals(
  state: WorldState,
  unit: UnitState,
  requestedGoal: GridPoint,
  blockedTiles: ReadonlySet<string>,
  requestedBlocker: MovementBlockingGroup | null,
): GridPoint[] {
  if (isWalkable(state, unit, requestedGoal, blockedTiles)) {
    return [requestedGoal];
  }

  const goals: GridPoint[] = [];
  const queue = [requestedGoal];
  const visited = new Set([toTileKey(requestedGoal)]);
  const canTraverseBlockedTile = createBlockedGoalTraversal(
    state,
    unit,
    requestedGoal,
    blockedTiles,
    requestedBlocker,
  );

  while (queue.length > 0 && visited.size < MAX_GOAL_SEARCH_NODES && goals.length < MAX_GOAL_CANDIDATES) {
    const current = queue.shift();

    if (!current) {
      break;
    }

    for (const offset of NEIGHBORS) {
      const neighbor = { x: current.x + offset.x, y: current.y + offset.y };

      if (!isPointInMap(state.map, neighbor)) {
        continue;
      }

      const neighborKey = toTileKey(neighbor);

      if (visited.has(neighborKey)) {
        continue;
      }

      visited.add(neighborKey);

      if (isWalkable(state, unit, neighbor, blockedTiles)) {
        goals.push(neighbor);
        continue;
      }

      if (canTraverseBlockedTile(neighbor)) {
        queue.push(neighbor);
      }
    }
  }

  return goals;
}

function createBlockedGoalTraversal(
  state: WorldState,
  unit: UnitState,
  requestedGoal: GridPoint,
  blockedTiles: ReadonlySet<string>,
  requestedBlocker: MovementBlockingGroup | null,
): (point: GridPoint) => boolean {
  const requestedKey = toTileKey(requestedGoal);
  const requestedTile = getTileAt(state.map, requestedGoal.x, requestedGoal.y);

  // Terrain/resource denial owns the requested tile before collision policy
  // occupancy is considered. A mobile occupant must not change that route.
  if (!isTilePassableForUnit(state, unit, requestedGoal)) {
    if (terrainDefinitions[requestedTile.terrain].blocksMovement) {
      return (point) => getTileAt(state.map, point.x, point.y).terrain === requestedTile.terrain;
    }

    if (resourceBlocksMovement(requestedTile.resource)) {
      return (point) => sameTile(point, requestedGoal);
    }

    return () => false;
  }

  if (blockedTiles.has(requestedKey)) {
    if (!requestedBlocker) {
      throw new Error(`Movement collision policy did not provide a blocking group for requested goal '${requestedKey}'.`);
    }

    const groupKeys = new Set(requestedBlocker.tiles.map(toTileKey));
    return (point) => groupKeys.has(toTileKey(point));
  }

  return () => false;
}

function isWalkable(state: WorldState, unit: UnitState, point: GridPoint, blockedTiles: ReadonlySet<string>): boolean {
  return isTilePassableForUnit(state, unit, point) && !blockedTiles.has(toTileKey(point));
}

function canMoveDiagonally(
  state: WorldState,
  unit: UnitState,
  current: GridPoint,
  offset: GridPoint,
  blockedTiles: ReadonlySet<string>,
): boolean {
  return (
    isWalkable(state, unit, { x: current.x + offset.x, y: current.y }, blockedTiles) &&
    isWalkable(state, unit, { x: current.x, y: current.y + offset.y }, blockedTiles)
  );
}

function isDiagonal(offset: GridPoint): boolean {
  return offset.x !== 0 && offset.y !== 0;
}

function getLowestScoreIndex(points: readonly GridPoint[], fScore: ReadonlyMap<string, number>): number {
  let bestIndex = 0;
  let bestScore = Number.POSITIVE_INFINITY;

  points.forEach((point, index) => {
    const score = fScore.get(toTileKey(point)) ?? Number.POSITIVE_INFINITY;

    if (score < bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  });

  return bestIndex;
}

function reconstructPath(
  cameFrom: ReadonlyMap<string, string>,
  pointsByKey: ReadonlyMap<string, GridPoint>,
  currentKey: string,
): GridPoint[] {
  const path: GridPoint[] = [];
  let key = currentKey;

  while (cameFrom.has(key)) {
    const point = pointsByKey.get(key);

    if (!point) {
      break;
    }

    path.unshift(point);
    key = cameFrom.get(key) ?? key;
  }

  return path;
}

function toTilePoint(point: GridPoint): GridPoint {
  return {
    x: Math.round(point.x),
    y: Math.round(point.y),
  };
}

function isPointInMap(map: MapDefinition, point: GridPoint): boolean {
  return point.x >= 0 && point.x < map.width && point.y >= 0 && point.y < map.height;
}

function heuristic(from: GridPoint, to: GridPoint): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

function squaredDistance(from: GridPoint, to: GridPoint): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return dx * dx + dy * dy;
}

function goalHeuristic(from: GridPoint, goals: readonly GridPoint[], fallback: GridPoint): number {
  let best = heuristic(from, fallback);

  for (const goal of goals) {
    best = Math.min(best, heuristic(from, goal));
  }

  return best;
}

function toTileKey(point: GridPoint): string {
  return `${point.x},${point.y}`;
}

function sameTile(a: GridPoint, b: GridPoint): boolean {
  return a.x === b.x && a.y === b.y;
}
