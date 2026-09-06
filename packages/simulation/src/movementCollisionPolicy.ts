import { type GridPoint } from "../../shared/src/index.js";
import { getUnitFootprintTiles, resolveEffectiveFootprint } from "./footprints.js";
import type { UnitState, WorldState } from "./types.js";
import { iterateUnitsOrdered } from "./units.js";

export const CORE_STRICT_FOOTPRINT_RESERVATION_POLICY_ID = "core:strict-footprint-reservation";

export type MovementBlockingGroupClassification = "mobile" | "static";

/** Exact policy-owned blocker footprint selected by a requested tile. */
export interface MovementBlockingGroup {
  readonly id: string;
  readonly classification: MovementBlockingGroupClassification;
  readonly tiles: readonly GridPoint[];
}

/** Opaque tick-local state owned and interpreted by its collision policy. */
export interface MovementReservation {
  readonly policyId: string;
}

/**
 * Separates movement-step admission from route selection. A Pathfinder may use
 * the policy's occupied-tile view, while each policy retains full control over
 * tick-local reservations and whether a footprint may enter a target position.
 */
export interface MovementCollisionPolicy {
  readonly id: string;
  getEntityBlockingTiles(state: WorldState, excludedUnitId?: string, includeMobile?: boolean): Set<string>;
  getBlockingGroupAtTile(
    state: WorldState,
    excludedUnitId: string | undefined,
    tile: GridPoint,
    includeMobile?: boolean,
  ): MovementBlockingGroup | null;
  canUnitOccupyPosition(state: WorldState, unit: UnitState, position: GridPoint): boolean;
  createReservation(): MovementReservation;
  reserveUnitPosition(reservation: MovementReservation, unit: UnitState, position: GridPoint, state?: WorldState): boolean;
}

export interface RegisterMovementCollisionPolicyOptions {
  /** Replaces the policy currently registered for this exact stable id. */
  replace?: boolean;
}

export class MovementCollisionPolicyRegistry {
  private readonly policies = new Map<string, MovementCollisionPolicy>();

  register(policy: MovementCollisionPolicy, options: RegisterMovementCollisionPolicyOptions = {}): void {
    assertMovementCollisionPolicyId(policy.id);

    if (this.policies.has(policy.id) && options.replace !== true) {
      throw new Error(`Movement collision policy '${policy.id}' is already registered.`);
    }

    this.policies.set(policy.id, policy);
  }

  require(id: string): MovementCollisionPolicy {
    assertMovementCollisionPolicyId(id);
    const policy = this.policies.get(id);

    if (!policy) {
      throw new Error(`Unknown movement collision profile '${id}'. Register its policy before creating the world.`);
    }

    return policy;
  }

  has(id: string): boolean {
    return this.policies.has(id);
  }

  ids(): readonly string[] {
    return [...this.policies.keys()].sort();
  }
}

interface StrictFootprintReservation extends MovementReservation {
  readonly policyId: typeof CORE_STRICT_FOOTPRINT_RESERVATION_POLICY_ID;
  readonly claimedUnitIdsByTile: Map<string, string>;
}

/**
 * Existing project behavior: every blocking footprint blocks immediately, and
 * stable tick order grants the first claim on an otherwise empty waypoint.
 * This is intentionally project-only, not an original-game collision claim.
 */
export const coreStrictFootprintReservationPolicy: MovementCollisionPolicy = {
  id: CORE_STRICT_FOOTPRINT_RESERVATION_POLICY_ID,
  getEntityBlockingTiles(state, excludedUnitId, includeMobile = true) {
    return new Set(getOccupyingUnitIdsByTile(state, excludedUnitId, includeMobile).keys());
  },
  getBlockingGroupAtTile(state, excludedUnitId, tile, includeMobile = true) {
    const requestedKey = toTileKey(tile);
    const candidates = [...iterateUnitsOrdered(state)].filter((unit) =>
      unit.id !== excludedUnitId &&
      resolveEffectiveFootprint(state, unit.kind).footprint.blocksMovement &&
      (includeMobile || unit.movementSpeed <= 0),
    );
    const seed = candidates.find((unit) => getUnitOccupancyTiles(unit, state).some((occupancyTile) => toTileKey(occupancyTile) === requestedKey));

    if (!seed) {
      return null;
    }

    const classification = seed.movementSpeed > 0 ? "mobile" : "static";
    const group = candidates.filter((candidate) =>
      (candidate.movementSpeed > 0) === (classification === "mobile") &&
      areOccupancyGroupsConnected(candidate, seed, candidates, state),
    );
    const tiles = [...new Map(
      group.flatMap((candidate) => getUnitOccupancyTiles(candidate, state).map((occupancyTile) => [
        toTileKey(occupancyTile),
        occupancyTile,
      ] as const)),
    ).values()];

    return {
      id: group[0]?.id ?? seed.id,
      classification,
      tiles,
    };
  },
  canUnitOccupyPosition(state, unit, position) {
    const tiles = getUnitFootprintTiles(state, unit.kind, position);

    if (tiles.length === 0) {
      return false;
    }

    const occupants = getOccupyingUnitIdsByTile(state, unit.id);

    return tiles.every((tile) => {
      const occupantIds = occupants.get(toTileKey(tile)) ?? [];
      return isTileInMap(state, tile) && occupantIds.length === 0;
    });
  },
  createReservation() {
    return {
      policyId: CORE_STRICT_FOOTPRINT_RESERVATION_POLICY_ID,
      claimedUnitIdsByTile: new Map(),
    };
  },
  reserveUnitPosition(reservation, unit, position, state) {
    const strictReservation = requireStrictFootprintReservation(reservation);
    const tiles = getUnitFootprintTiles(state, unit.kind, position);

    if (tiles.length === 0 || tiles.some((tile) => strictReservation.claimedUnitIdsByTile.has(toTileKey(tile)))) {
      return false;
    }

    for (const tile of tiles) {
      strictReservation.claimedUnitIdsByTile.set(toTileKey(tile), unit.id);
    }

    return true;
  },
};

export const defaultMovementCollisionPolicyRegistry = new MovementCollisionPolicyRegistry();

defaultMovementCollisionPolicyRegistry.register(coreStrictFootprintReservationPolicy);

export function registerMovementCollisionPolicy(
  policy: MovementCollisionPolicy,
  options?: RegisterMovementCollisionPolicyOptions,
): void {
  defaultMovementCollisionPolicyRegistry.register(policy, options);
}

export function requireMovementCollisionPolicy(id: string): MovementCollisionPolicy {
  return defaultMovementCollisionPolicyRegistry.require(id);
}

export function getMovementCollisionPolicy(state: WorldState): MovementCollisionPolicy {
  return requireMovementCollisionPolicy(state.movementCollisionProfileId ?? CORE_STRICT_FOOTPRINT_RESERVATION_POLICY_ID);
}

export function resolveMovementCollisionProfileId(mapProfileId: string | undefined): string {
  const profileId = mapProfileId ?? CORE_STRICT_FOOTPRINT_RESERVATION_POLICY_ID;
  requireMovementCollisionPolicy(profileId);
  return profileId;
}

export function getUnitOccupancyTiles(
  unit: UnitState,
  context?: Pick<WorldState, "sourceRuntimeProfile">,
): GridPoint[] {
  return getUnitFootprintTiles(context, unit.kind, unit.position);
}

function getOccupyingUnitIdsByTile(
  state: WorldState,
  excludedUnitId?: string,
  includeMobile = true,
): ReadonlyMap<string, readonly string[]> {
  const occupants = new Map<string, string[]>();

  for (const unit of iterateUnitsOrdered(state)) {
    if (
      unit.id === excludedUnitId ||
      !resolveEffectiveFootprint(state, unit.kind).footprint.blocksMovement ||
      (!includeMobile && unit.movementSpeed > 0)
    ) {
      continue;
    }

    for (const tile of getUnitOccupancyTiles(unit, state)) {
      const key = toTileKey(tile);
      const tileOccupants = occupants.get(key) ?? [];
      tileOccupants.push(unit.id);
      occupants.set(key, tileOccupants);
    }
  }

  return occupants;
}

function areOccupancyGroupsConnected(
  candidate: UnitState,
  seed: UnitState,
  candidates: readonly UnitState[],
  context?: Pick<WorldState, "sourceRuntimeProfile">,
): boolean {
  // Overlapping same-class blockers form one policy-owned canonical group so
  // every declared footprint tile resolves to one stable identity. Adjacent
  // but non-overlapping blockers remain independent groups.
  const classification = seed.movementSpeed > 0;
  const connectedIds = new Set<string>([seed.id]);
  const connectedUnits: UnitState[] = [seed];

  for (let index = 0; index < connectedUnits.length; index += 1) {
    const connected = connectedUnits[index];
    if (!connected) {
      continue;
    }

    const connectedTiles = getUnitOccupancyTiles(connected, context);

    for (const next of candidates) {
      if (
        connectedIds.has(next.id) ||
        (next.movementSpeed > 0) !== classification ||
        !occupancyTilesOverlap(connectedTiles, getUnitOccupancyTiles(next, context))
      ) {
        continue;
      }

      connectedIds.add(next.id);
      connectedUnits.push(next);
    }
  }

  return connectedIds.has(candidate.id);
}

function occupancyTilesOverlap(left: readonly GridPoint[], right: readonly GridPoint[]): boolean {
  const rightKeys = new Set(right.map(toTileKey));
  return left.some((tile) => rightKeys.has(toTileKey(tile)));
}

function requireStrictFootprintReservation(reservation: MovementReservation): StrictFootprintReservation {
  if (
    reservation.policyId !== CORE_STRICT_FOOTPRINT_RESERVATION_POLICY_ID ||
    !("claimedUnitIdsByTile" in reservation) ||
    !(reservation.claimedUnitIdsByTile instanceof Map)
  ) {
    throw new Error("Strict footprint policy received a reservation owned by another movement collision policy.");
  }

  return {
    policyId: CORE_STRICT_FOOTPRINT_RESERVATION_POLICY_ID,
    claimedUnitIdsByTile: reservation.claimedUnitIdsByTile,
  };
}

function assertMovementCollisionPolicyId(id: string): void {
  if (!id.trim()) {
    throw new Error("Movement collision profile id must not be empty.");
  }
  if (id !== id.trim()) {
    throw new Error(`Movement collision profile id '${id}' must not have surrounding whitespace.`);
  }
}

function isTileInMap(state: WorldState, tile: GridPoint): boolean {
  return tile.x >= 0 && tile.x < state.map.width && tile.y >= 0 && tile.y < state.map.height;
}

function toTileKey(tile: GridPoint): string {
  return `${tile.x},${tile.y}`;
}
