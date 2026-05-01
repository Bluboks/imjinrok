import {
  getTileAt,
  terrainDefinitions,
  unitDefinitions,
  type GridPoint,
  type MapDefinition,
} from "../../shared/src/index.js";
import { getFootprintTiles } from "./placement.js";
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

export function findPathForUnit(state: WorldState, unit: UnitState, target: GridPoint): GridPoint[] | null {
  const start = toTilePoint(unit.position);
  const requestedGoal = toTilePoint(target);
  const blockedTiles = getStaticBlockingTiles(state);
  const startKey = toTileKey(start);

  blockedTiles.delete(startKey);

  const goal = resolveWalkableGoal(state.map, requestedGoal, blockedTiles);

  if (!goal) {
    return null;
  }

  const goalKey = toTileKey(goal);

  if (startKey === goalKey) {
    return [];
  }

  const openSet = [start];
  const openKeys = new Set([startKey]);
  const cameFrom = new Map<string, string>();
  const pointsByKey = new Map<string, GridPoint>([[startKey, start]]);
  const gScore = new Map<string, number>([[startKey, 0]]);
  const fScore = new Map<string, number>([[startKey, heuristic(start, goal)]]);
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

    if (currentKey === goalKey) {
      return reconstructPath(cameFrom, pointsByKey, currentKey);
    }

    for (const neighborOffset of NEIGHBORS) {
      const neighbor = { x: current.x + neighborOffset.x, y: current.y + neighborOffset.y };

      if (!isWalkable(state.map, neighbor, blockedTiles)) {
        continue;
      }

      if (isDiagonal(neighborOffset) && !canMoveDiagonally(state.map, current, neighborOffset, blockedTiles)) {
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
      fScore.set(neighborKey, tentativeGScore + heuristic(neighbor, goal));

      if (!openKeys.has(neighborKey)) {
        openSet.push(neighbor);
        openKeys.add(neighborKey);
      }
    }
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

function getStaticBlockingTiles(state: WorldState): Set<string> {
  const blockedTiles = new Set<string>();

  for (const unit of Object.values(state.units)) {
    const definition = unitDefinitions[unit.kind];

    if (definition.category !== "building" || !definition.footprint.blocksMovement) {
      continue;
    }

    const footprintTiles = getFootprintTiles(unit.position, definition.footprint);

    for (const tile of footprintTiles) {
      blockedTiles.add(toTileKey(tile));
    }
  }

  return blockedTiles;
}

function resolveWalkableGoal(map: MapDefinition, requestedGoal: GridPoint, blockedTiles: ReadonlySet<string>): GridPoint | null {
  if (isWalkable(map, requestedGoal, blockedTiles)) {
    return requestedGoal;
  }

  const queue = [requestedGoal];
  const visited = new Set([toTileKey(requestedGoal)]);

  while (queue.length > 0 && visited.size < MAX_GOAL_SEARCH_NODES) {
    const current = queue.shift();

    if (!current) {
      break;
    }

    for (const offset of NEIGHBORS) {
      const neighbor = { x: current.x + offset.x, y: current.y + offset.y };

      if (!isPointInMap(map, neighbor)) {
        continue;
      }

      const neighborKey = toTileKey(neighbor);

      if (visited.has(neighborKey)) {
        continue;
      }

      if (isWalkable(map, neighbor, blockedTiles)) {
        return neighbor;
      }

      visited.add(neighborKey);
      queue.push(neighbor);
    }
  }

  return null;
}

function isWalkable(map: MapDefinition, point: GridPoint, blockedTiles: ReadonlySet<string>): boolean {
  return isTerrainWalkable(map, point) && !blockedTiles.has(toTileKey(point));
}

function canMoveDiagonally(
  map: MapDefinition,
  current: GridPoint,
  offset: GridPoint,
  blockedTiles: ReadonlySet<string>,
): boolean {
  return (
    isWalkable(map, { x: current.x + offset.x, y: current.y }, blockedTiles) &&
    isWalkable(map, { x: current.x, y: current.y + offset.y }, blockedTiles)
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

function toTileKey(point: GridPoint): string {
  return `${point.x},${point.y}`;
}
