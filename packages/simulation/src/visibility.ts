import { getTileIndex, unitDefinitions, type GridPoint, type MapDefinition } from "../../shared/src/index.js";
import { isUnitUnderConstruction } from "./construction.js";
import { getEnvironmentSightMultiplier } from "./environment.js";
import type { WorldState } from "./types.js";
import { iterateUnitsOrdered } from "./units.js";

export enum TileVisibility {
  Unexplored = 0,
  Explored = 1,
  Visible = 2,
}

export interface PlayerVisibilityState {
  width: number;
  height: number;
  tiles: Uint8Array;
}

export interface PlayerVisibilityChangeOptions {
  dirtyChunks?: Uint8Array;
  chunkSize?: number;
}

export interface PlayerVisibilityUpdate {
  visibility: PlayerVisibilityState;
  dirtyChunkCount: number;
}

interface TileOffset {
  dx: number;
  dy: number;
}

const radiusOffsetCache = new Map<number, readonly TileOffset[]>();

export function createPlayerVisibility(map: MapDefinition): PlayerVisibilityState {
  return {
    width: map.width,
    height: map.height,
    tiles: new Uint8Array(map.width * map.height),
  };
}

export function updatePlayerVisibility(
  previous: PlayerVisibilityState,
  state: WorldState,
  playerId: string,
): PlayerVisibilityState {
  return updatePlayerVisibilityWithChanges(previous, state, playerId).visibility;
}

export function updatePlayerVisibilityWithChanges(
  previous: PlayerVisibilityState,
  state: WorldState,
  playerId: string,
  options: PlayerVisibilityChangeOptions = {},
): PlayerVisibilityUpdate {
  const tiles = new Uint8Array(previous.tiles.length);

  for (let index = 0; index < previous.tiles.length; index += 1) {
    const previousTile = previous.tiles[index] ?? TileVisibility.Unexplored;
    tiles[index] = previousTile === TileVisibility.Visible ? TileVisibility.Explored : previousTile;
  }

  const visibility: PlayerVisibilityState = {
    width: previous.width,
    height: previous.height,
    tiles,
  };

  const sightMultiplier = getEnvironmentSightMultiplier(state.environment, state.map.environment);

  for (const unit of iterateUnitsOrdered(state)) {
    if (unit.playerId !== playerId || isUnitUnderConstruction(unit)) {
      continue;
    }

    const definition = unitDefinitions[unit.kind];
    const sightRadius = Math.max(0, Math.floor(definition.sightRadius * sightMultiplier));
    const origin = toVisionTile(unit.position);
    for (const offset of getCircularTileOffsets(sightRadius)) {
      const x = origin.x + offset.dx;
      const y = origin.y + offset.dy;

      if (x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) {
        continue;
      }

      tiles[getTileIndex(state.map.width, x, y)] = TileVisibility.Visible;
    }
  }

  return {
    visibility,
    dirtyChunkCount: markDirtyChunks(previous, visibility, options),
  };
}

export function getTileVisibility(visibility: PlayerVisibilityState, point: GridPoint): TileVisibility {
  const tile = toVisionTile(point);

  if (tile.x < 0 || tile.y < 0 || tile.x >= visibility.width || tile.y >= visibility.height) {
    return TileVisibility.Unexplored;
  }

  return visibility.tiles[getTileIndex(visibility.width, tile.x, tile.y)] ?? TileVisibility.Unexplored;
}

export function areTilesVisible(visibility: PlayerVisibilityState, points: readonly GridPoint[]): boolean {
  return points.every((point) => getTileVisibility(visibility, point) === TileVisibility.Visible);
}

function toVisionTile(point: GridPoint): GridPoint {
  return {
    x: Math.round(point.x),
    y: Math.round(point.y),
  };
}

function getCircularTileOffsets(radius: number): readonly TileOffset[] {
  const cached = radiusOffsetCache.get(radius);

  if (cached) {
    return cached;
  }

  const offsets: TileOffset[] = [];
  const radiusSquared = radius * radius;

  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx * dx + dy * dy <= radiusSquared) {
        offsets.push({ dx, dy });
      }
    }
  }

  radiusOffsetCache.set(radius, offsets);
  return offsets;
}

function markDirtyChunks(
  previous: PlayerVisibilityState,
  next: PlayerVisibilityState,
  options: PlayerVisibilityChangeOptions,
): number {
  const dirtyChunks = options.dirtyChunks;

  if (!dirtyChunks) {
    return 0;
  }

  const chunkSize = options.chunkSize;

  if (!chunkSize || chunkSize <= 0) {
    throw new Error("visibility dirty chunk tracking requires a positive chunkSize");
  }

  dirtyChunks.fill(0);

  const chunksPerRow = Math.ceil(previous.width / chunkSize);
  let dirtyChunkCount = 0;

  for (let index = 0; index < previous.tiles.length; index += 1) {
    if (previous.tiles[index] === next.tiles[index]) {
      continue;
    }

    const x = index % previous.width;
    const y = Math.floor(index / previous.width);
    const chunkX = Math.floor(x / chunkSize);
    const chunkY = Math.floor(y / chunkSize);
    const chunkIndex = chunkY * chunksPerRow + chunkX;

    if (dirtyChunks[chunkIndex] === 1) {
      continue;
    }

    dirtyChunks[chunkIndex] = 1;
    dirtyChunkCount += 1;
  }

  return dirtyChunkCount;
}
