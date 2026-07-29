import {
  getTileAt,
  terrainDefinitions,
  type GridPoint,
  type MapDefinition,
} from "../../shared/src/index.js";
import { getEntityBlockingTiles } from "./collision.js";
import { isTilePassableForUnit } from "./terrain.js";
import type { UnitState, WorldState } from "./types.js";

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

export interface FindPathOptions {
  allowPartial?: boolean;
  /**
   * Use only for reachability checks. Movement paths keep mobile footprints
   * blocked so their waypoints remain immediately occupiable.
   */
  ignoreMobileBlockers?: boolean;
}

export function findPathForUnit(
  state: WorldState,
  unit: UnitState,
  target: GridPoint,
  options: FindPathOptions = {},
): GridPoint[] | null {
  const start = toTilePoint(unit.position);
  const requestedGoal = toTilePoint(target);
  const blockedTiles = getEntityBlockingTiles(state, unit.id, options.ignoreMobileBlockers !== true);
  const startKey = toTileKey(start);

  blockedTiles.delete(startKey);

  const goals = resolveWalkableGoals(state, unit, requestedGoal, blockedTiles);

  if (goals.length === 0) {
    return null;
  }

  return findPathToAnyGoal(state, unit, start, goals, blockedTiles, requestedGoal, options);
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
): GridPoint[] {
  if (isWalkable(state, unit, requestedGoal, blockedTiles)) {
    return [requestedGoal];
  }

  const goals: GridPoint[] = [];
  const queue = [requestedGoal];
  const visited = new Set([toTileKey(requestedGoal)]);
  const canTraverseBlockedTile = createBlockedGoalTraversal(state, requestedGoal, blockedTiles);

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
  requestedGoal: GridPoint,
  blockedTiles: ReadonlySet<string>,
): (point: GridPoint) => boolean {
  const requestedKey = toTileKey(requestedGoal);

  if (blockedTiles.has(requestedKey)) {
    return (point) => blockedTiles.has(toTileKey(point));
  }

  const requestedTile = getTileAt(state.map, requestedGoal.x, requestedGoal.y);

  if (terrainDefinitions[requestedTile.terrain].blocksMovement) {
    return (point) => getTileAt(state.map, point.x, point.y).terrain === requestedTile.terrain;
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
