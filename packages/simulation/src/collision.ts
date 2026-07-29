import { unitDefinitions, type GridPoint } from "../../shared/src/index.js";
import { getFootprintTiles } from "./placement.js";
import type { UnitState, WorldState } from "./types.js";
import { iterateUnitsOrdered } from "./units.js";

/**
 * The simulation position is an entity's ground contact. Footprints are derived
 * only from that position, never from a sprite pivot or a render bounds.
 */
export function getUnitOccupancyTiles(unit: UnitState): GridPoint[] {
  return getFootprintTiles(unit.position, unitDefinitions[unit.kind].footprint);
}

export function getOccupyingUnitIdsByTile(
  state: WorldState,
  excludedUnitId?: string,
): ReadonlyMap<string, readonly string[]> {
  const occupants = new Map<string, string[]>();

  for (const unit of iterateUnitsOrdered(state)) {
    if (unit.id === excludedUnitId || !unitDefinitions[unit.kind].footprint.blocksMovement) {
      continue;
    }

    for (const tile of getUnitOccupancyTiles(unit)) {
      const key = toTileKey(tile);
      const tileOccupants = occupants.get(key) ?? [];
      tileOccupants.push(unit.id);
      occupants.set(key, tileOccupants);
    }
  }

  return occupants;
}

export function getEntityBlockingTiles(state: WorldState, excludedUnitId?: string): Set<string> {
  return new Set(getOccupyingUnitIdsByTile(state, excludedUnitId).keys());
}

export function canUnitOccupyPosition(state: WorldState, unit: UnitState, position: GridPoint): boolean {
  const footprint = unitDefinitions[unit.kind].footprint;
  const tiles = getFootprintTiles(position, footprint);

  if (tiles.length === 0) {
    return false;
  }

  const occupants = getOccupyingUnitIdsByTile(state, unit.id);

  return tiles.every((tile) => isTileInMap(state, tile) && !occupants.has(toTileKey(tile)));
}

/** Tick-local claims prevent two units from beginning travel toward the same empty footprint. */
export interface MovementReservation {
  readonly claimedUnitIdsByTile: Map<string, string>;
}

export function createMovementReservation(): MovementReservation {
  return { claimedUnitIdsByTile: new Map() };
}

export function reserveUnitPosition(
  reservation: MovementReservation,
  unit: UnitState,
  position: GridPoint,
): boolean {
  const tiles = getFootprintTiles(position, unitDefinitions[unit.kind].footprint);

  if (tiles.length === 0 || tiles.some((tile) => reservation.claimedUnitIdsByTile.has(toTileKey(tile)))) {
    return false;
  }

  for (const tile of tiles) {
    reservation.claimedUnitIdsByTile.set(toTileKey(tile), unit.id);
  }

  return true;
}

function isTileInMap(state: WorldState, tile: GridPoint): boolean {
  return tile.x >= 0 && tile.x < state.map.width && tile.y >= 0 && tile.y < state.map.height;
}

function toTileKey(tile: GridPoint): string {
  return `${tile.x},${tile.y}`;
}
