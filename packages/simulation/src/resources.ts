import {
  resourceDefinitions,
  type GridPoint,
  type MapDefinition,
  type ResourceDefinition,
  type ResourceNode,
  type ResourceNodeState,
  type TileCell,
} from "../../shared/src/index.js";
import type { WorldState } from "./types.js";

const builtinResourceDefinitions = resourceDefinitions as Readonly<Record<string, ResourceDefinition>>;

export type GatherResourceResult =
  | { ok: true; gathered: number; depleted: boolean; removed: boolean }
  | { ok: false; reason: string };

interface ResourceTileLocation {
  tile: TileCell;
  resource: ResourceNode;
  point: GridPoint;
}

export function getResourceDefinition(resource: ResourceNode | string): ResourceDefinition | undefined {
  const kind = typeof resource === "string" ? resource : resource.kind;

  return builtinResourceDefinitions[kind];
}

export function getResourceNodeState(resource: ResourceNode): ResourceNodeState {
  if (resource.state === "active" && resource.amount <= 0) {
    return "depleted";
  }

  return resource.state ?? (resource.amount > 0 ? "active" : "depleted");
}

export function isResourceHarvestable(resource: ResourceNode): boolean {
  return getResourceDefinition(resource) !== undefined && getResourceNodeState(resource) === "active" && resource.amount > 0;
}

export function resourceBlocksMovement(resource?: ResourceNode): boolean {
  if (!resource) {
    return false;
  }

  const definition = getResourceDefinition(resource);

  if (!definition) {
    return true;
  }

  return getResourceOccupancy(resource, definition)?.blocksMovement ?? false;
}

export function resourceBlocksBuilding(resource?: ResourceNode): boolean {
  if (!resource) {
    return false;
  }

  const definition = getResourceDefinition(resource);

  if (!definition) {
    return true;
  }

  return getResourceOccupancy(resource, definition)?.blocksBuilding ?? false;
}

export function findResourceTile(map: MapDefinition, resourceId: string): GridPoint | null {
  const location = findResourceTileLocation(map, resourceId);

  return location ? { ...location.point } : null;
}

export function findHarvestableResourceTile(map: MapDefinition, resourceId: string): GridPoint | null {
  const location = findResourceTileLocation(map, resourceId);

  if (!location || !isResourceHarvestable(location.resource)) {
    return null;
  }

  return { ...location.point };
}

export function gatherResourceForPlayer(state: WorldState, playerId: string, resourceId: string): GatherResourceResult {
  const location = findResourceTileLocation(state.map, resourceId);

  if (!location) {
    return { ok: false, reason: "resource node not found" };
  }

  const definition = getResourceDefinition(location.resource);

  if (!definition || !isResourceHarvestable(location.resource)) {
    return { ok: false, reason: "resource node is not harvestable" };
  }

  const bank = state.playerResources[playerId];

  if (!bank) {
    return { ok: false, reason: "player resource bank not found" };
  }

  const gathered = Math.min(definition.gatherAmountPerTick, location.resource.amount);

  location.resource.amount -= gathered;
  bank[definition.yieldResource] += gathered;

  if (location.resource.amount > 0) {
    location.resource.state = "active";
    delete location.resource.regrowTicks;
    return { ok: true, gathered, depleted: false, removed: false };
  }

  if (definition.depletion.mode === "remove") {
    delete location.tile.resource;
    return { ok: true, gathered, depleted: true, removed: true };
  }

  location.resource.amount = 0;
  location.resource.state = "depleted";

  if (definition.regrowth) {
    location.resource.regrowTicks = location.resource.regrowTicks ?? 0;
  } else {
    delete location.resource.regrowTicks;
  }

  return { ok: true, gathered, depleted: true, removed: false };
}

export function updateResourceRegrowth(state: WorldState): void {
  if (state.environment.weather !== "rain") {
    return;
  }

  for (const layer of state.map.layers) {
    for (const tile of layer.tiles) {
      const resource = tile.resource;

      if (!resource || getResourceNodeState(resource) !== "depleted") {
        continue;
      }

      const definition = getResourceDefinition(resource);

      if (!definition?.regrowth || definition.regrowth.trigger !== "rain") {
        continue;
      }

      const nextRegrowTicks = (resource.regrowTicks ?? 0) + 1;

      if (nextRegrowTicks < definition.regrowth.requiredTicks) {
        resource.regrowTicks = nextRegrowTicks;
        continue;
      }

      resource.state = "active";
      resource.amount = definition.regrowth.restoreAmount === "full"
        ? definition.capacity
        : Math.min(definition.capacity, definition.regrowth.restoreAmount);
      delete resource.regrowTicks;
    }
  }
}

function getResourceOccupancy(resource: ResourceNode, definition: ResourceDefinition): ResourceDefinition["activeOccupancy"] | undefined {
  if (getResourceNodeState(resource) === "active") {
    return definition.activeOccupancy;
  }

  if (definition.depletion.mode !== "stay") {
    return undefined;
  }

  return definition.depletion.depletedOccupancy;
}

function findResourceTileLocation(map: MapDefinition, resourceId: string): ResourceTileLocation | null {
  for (const layer of map.layers) {
    for (let tileIndex = 0; tileIndex < layer.tiles.length; tileIndex += 1) {
      const tile = layer.tiles[tileIndex];

      if (!tile?.resource || tile.resource.id !== resourceId) {
        continue;
      }

      return {
        tile,
        resource: tile.resource,
        point: {
          x: tileIndex % map.width,
          y: Math.floor(tileIndex / map.width),
        },
      };
    }
  }

  return null;
}
