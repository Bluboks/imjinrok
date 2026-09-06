import {
  getTileAt,
  k01SourceOpeningAdapter,
  terrainDefinitions,
  unitDefinitions,
  type GridPoint,
  type K01SourceFootprint,
  type MapDefinition,
  type StartingUnitDefinition,
  type TerrainType,
} from "../../shared/src/index.js";
import { resourceBlocksBuilding, resourceBlocksMovement } from "./resources.js";
import { getFootprintTiles, getUnitFootprintTiles, K01_SOURCE_RUNTIME_FOOTPRINT_CONTEXT } from "./footprints.js";
import type { UnitState } from "./types.js";

export interface InitialPlacementPlayerRequest {
  readonly playerId: string;
  readonly spawn: GridPoint;
  readonly startingUnits: readonly StartingUnitDefinition[];
}

export interface InitialPlacementRequest {
  readonly map: MapDefinition;
  readonly players: readonly InitialPlacementPlayerRequest[];
  readonly existingUnits?: Readonly<Record<string, UnitState>>;
}

export interface InitialPlacementPolicy {
  readonly id: string;
  resolveStartingPositions(request: InitialPlacementRequest): ReadonlyMap<string, readonly GridPoint[]>;
}

export interface RegisterInitialPlacementPolicyOptions {
  readonly replace?: boolean;
}

export class InitialPlacementPolicyRegistry {
  private readonly policies = new Map<string, InitialPlacementPolicy>();

  register(policy: InitialPlacementPolicy, options: RegisterInitialPlacementPolicyOptions = {}): void {
    assertPolicyId(policy.id);
    if (typeof policy.resolveStartingPositions !== "function") {
      throw new TypeError(`Initial placement policy '${policy.id}' must provide resolveStartingPositions.`);
    }
    if (this.policies.has(policy.id) && options.replace !== true) {
      throw new Error(`Initial placement policy '${policy.id}' is already registered.`);
    }
    this.policies.set(policy.id, policy);
  }

  require(id: string): InitialPlacementPolicy {
    assertPolicyId(id);
    const policy = this.policies.get(id);
    if (!policy) {
      throw new Error(`Unknown initial placement policy '${id}'. Register its policy before creating the world.`);
    }
    return policy;
  }

  unregister(id: string): void {
    this.policies.delete(id);
  }
}

export const defaultInitialPlacementPolicyRegistry = new InitialPlacementPolicyRegistry();

export function registerInitialPlacementPolicy(
  policy: InitialPlacementPolicy,
  options?: RegisterInitialPlacementPolicyOptions,
): () => void {
  defaultInitialPlacementPolicyRegistry.register(policy, options);
  return () => defaultInitialPlacementPolicyRegistry.unregister(policy.id);
}

export function requireInitialPlacementPolicy(id: string): InitialPlacementPolicy {
  return defaultInitialPlacementPolicyRegistry.require(id);
}

export const K01_SOURCE_EXACT_OPENING_PLACEMENT_POLICY_ID = "k01:source-exact-opening";

export const k01SourceExactOpeningPlacementPolicy: InitialPlacementPolicy = {
  id: K01_SOURCE_EXACT_OPENING_PLACEMENT_POLICY_ID,
  resolveStartingPositions(request) {
    return resolveK01StartingPositions(request);
  },
};

defaultInitialPlacementPolicyRegistry.register(k01SourceExactOpeningPlacementPolicy);

function resolveK01StartingPositions(request: InitialPlacementRequest): ReadonlyMap<string, readonly GridPoint[]> {
  const occupiedTiles = createOccupiedTileOwners(request.existingUnits ?? {});
  const positionsByPlayer = new Map<string, readonly GridPoint[]>();
  const seenRecordIds = new Set<string>();

  for (const player of request.players) {
    if (positionsByPlayer.has(player.playerId)) {
      throw new Error(`K01 exact opening placement has duplicate player '${player.playerId}'.`);
    }

    const positions: GridPoint[] = [];
    for (const [recordIndex, definition] of player.startingUnits.entries()) {
      const identity = `${player.playerId}:${definition.idSuffix}`;
      const record = findK01SourceRecord(definition.idSuffix);

      if (!record) {
        throw placementFailure(identity, recordIndex, "unsupported source record identity");
      }
      if (seenRecordIds.has(record.idSuffix)) {
        throw placementFailure(identity, recordIndex, "duplicate source record identity");
      }
      seenRecordIds.add(record.idSuffix);
      if (record.identityMapping !== "exact-static-identity-source") {
        throw placementFailure(identity, recordIndex, "source identity mapping is not proven");
      }
      if (record.projectKind !== definition.kind) {
        throw placementFailure(identity, recordIndex, `kind mapping mismatch (expected '${record.projectKind}')`);
      }
      if (!samePoint(record.offset, definition.offset)) {
        throw placementFailure(identity, recordIndex, "source coordinate offset mismatch");
      }
      if (!isIntegerPoint(player.spawn)) {
        throw placementFailure(identity, recordIndex, "spawn coordinate is not an integer GridPoint");
      }

      const requestedPosition = {
        x: player.spawn.x + definition.offset.x,
        y: player.spawn.y + definition.offset.y,
      };
      if (!isIntegerPoint(requestedPosition)) {
        throw placementFailure(identity, recordIndex, "requested coordinate is not an integer GridPoint");
      }

      const footprint = resolveRecordFootprint(record.sourceFootprint, definition, identity, recordIndex);
      const footprintTiles = deriveSourceFootprintTiles(requestedPosition, footprint);
      validateFootprintAdmission(
        request.map,
        definition,
        identity,
        recordIndex,
        footprintTiles,
        occupiedTiles,
      );

      positions.push(requestedPosition);
      reserveFootprint(occupiedTiles, identity, footprintTiles);
    }

    positionsByPlayer.set(player.playerId, positions);
  }

  return positionsByPlayer;
}

function findK01SourceRecord(idSuffix: string): (typeof k01SourceOpeningAdapter)[number] | undefined {
  return k01SourceOpeningAdapter.find((record) => record.idSuffix === idSuffix);
}

function resolveRecordFootprint(
  sourceFootprint: K01SourceFootprint | undefined,
  definition: StartingUnitDefinition,
  identity: string,
  recordIndex: number,
): K01SourceFootprint {
  if (sourceFootprint === undefined) {
    const productFootprint = unitDefinitions[definition.kind].footprint;
    if (unitDefinitions[definition.kind].category === "building") {
      throw placementFailure(identity, recordIndex, "unsupported source footprint extent for building");
    }
    // X02 closes only the source building/control footprint subset. Mobile
    // and hero records remain exact at their requested semantic coordinate
    // with the existing 1x1 product contract; this is not source evidence.
    if (
      productFootprint.width !== 1 ||
      productFootprint.height !== 1 ||
      !productFootprint.blocksMovement
    ) {
      throw placementFailure(identity, recordIndex, "unsupported product-adaptation footprint");
    }
    return { width: 1, height: 1, evidence: "project-adaptation" };
  }

  const footprint = sourceFootprint;
  if (
    !Number.isInteger(footprint.width) ||
    !Number.isInteger(footprint.height) ||
    footprint.width < 1 ||
    footprint.width > 0x7f ||
    footprint.height < 1 ||
    footprint.height > 0x7f
  ) {
    throw placementFailure(identity, recordIndex, "unsupported or invalid source footprint extent");
  }
  if (footprint.evidence !== "static-confirmed") {
    throw placementFailure(identity, recordIndex, "unsupported source footprint evidence");
  }

  return footprint;
}

function deriveSourceFootprintTiles(center: GridPoint, footprint: K01SourceFootprint): GridPoint[] {
  return getFootprintTiles(center, { width: footprint.width, height: footprint.height, blocksMovement: true }, "source-center");
}

function validateFootprintAdmission(
  map: MapDefinition,
  definition: StartingUnitDefinition,
  identity: string,
  recordIndex: number,
  footprintTiles: readonly GridPoint[],
  occupiedTiles: ReadonlyMap<string, string>,
): void {
  const unitDefinition = unitDefinitions[definition.kind];
  const placement = "placement" in unitDefinition ? unitDefinition.placement : undefined;

  if (footprintTiles.length === 0) {
    throw placementFailure(identity, recordIndex, "source footprint produced no valid tiles");
  }

  for (const tile of footprintTiles) {
    if (!isPointInMap(map, tile)) {
      throw placementFailure(identity, recordIndex, `source footprint tile (${tile.x},${tile.y}) is outside map`);
    }

    const owner = occupiedTiles.get(toTileKey(tile));
    if (owner !== undefined) {
      throw placementFailure(identity, recordIndex, `source footprint tile (${tile.x},${tile.y}) is occupied by '${owner}'`);
    }

    const mapTile = getTileAt(map, tile.x, tile.y);
    if (unitDefinition.category === "building") {
      if (!("placement" in unitDefinition) || !placement) {
        throw placementFailure(identity, recordIndex, "building has no placement contract");
      }
      const allowedTerrain: readonly TerrainType[] = placement.allowedTerrain;
      if (!allowedTerrain.includes(mapTile.terrain)) {
        throw placementFailure(identity, recordIndex, `cannot build on ${mapTile.terrain} at (${tile.x},${tile.y})`);
      }
      if (resourceBlocksBuilding(mapTile.resource)) {
        throw placementFailure(identity, recordIndex, `building footprint overlaps a resource at (${tile.x},${tile.y})`);
      }
      continue;
    }

    if (terrainDefinitions[mapTile.terrain].blocksMovement) {
      throw placementFailure(identity, recordIndex, `terrain ${mapTile.terrain} blocks movement at (${tile.x},${tile.y})`);
    }
    if (resourceBlocksMovement(mapTile.resource)) {
      throw placementFailure(identity, recordIndex, `resource blocks movement at (${tile.x},${tile.y})`);
    }
  }
}

function createOccupiedTileOwners(units: Readonly<Record<string, UnitState>>): Map<string, string> {
  const occupied = new Map<string, string>();
  for (const unit of Object.values(units)) {
    const definition = unitDefinitions[unit.kind];
    if (!definition.footprint.blocksMovement) {
      continue;
    }

    const footprint = getUnitFootprintTiles(K01_SOURCE_RUNTIME_FOOTPRINT_CONTEXT, unit.kind, unit.position);
    if (footprint.length === 0) {
      throw placementFailure(unit.id, -1, "existing unit source footprint produced no valid tiles");
    }
    for (const tile of footprint) {
      occupied.set(toTileKey(tile), unit.id);
    }
  }
  return occupied;
}

function reserveFootprint(occupied: Map<string, string>, owner: string, tiles: readonly GridPoint[]): void {
  for (const tile of tiles) {
    occupied.set(toTileKey(tile), owner);
  }
}

function isPointInMap(map: MapDefinition, point: GridPoint): boolean {
  return point.x >= 0 && point.x < map.width && point.y >= 0 && point.y < map.height;
}

function isIntegerPoint(point: GridPoint): boolean {
  return Number.isInteger(point.x) && Number.isInteger(point.y);
}

function samePoint(left: GridPoint, right: GridPoint): boolean {
  return left.x === right.x && left.y === right.y;
}

function toTileKey(point: GridPoint): string {
  return `${point.x},${point.y}`;
}

function placementFailure(identity: string, recordIndex: number, reason: string): Error {
  return new Error(`K01 exact opening placement failed for record '${identity}' at index ${recordIndex}: ${reason}.`);
}

function assertPolicyId(id: string): void {
  if (!id.trim() || id !== id.trim()) {
    throw new Error("Initial placement policy id must be non-empty and have no surrounding whitespace.");
  }
}
