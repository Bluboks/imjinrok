import type {
  ContentRegistry,
  MapDefinition,
  ResourceVisualSetDefinition,
  ResourceVisualState,
  VisualAssetRef,
} from "@shared";

export interface ResourceVisualPreloadDescriptor extends VisualAssetRef {
  textureKey: string;
  resourceKind: string;
  state: ResourceVisualState;
}

export interface ResourceVisualPlacement {
  readonly originX: 0.5;
  readonly originY: 1;
  readonly scale: number;
  readonly localX: 0;
  readonly localY: number;
}

type ResourceVisualRegistry = Pick<ContentRegistry, "resourceVisualSets">;
type ResourceVisualMap = Pick<MapDefinition, "id" | "resourceVisualSetId">;

/**
 * Resolves a map-selected resource visual without knowing any campaign, theme,
 * or renderer details. Missing resource kinds/states intentionally have no
 * visual contract and return null.
 */
export function resolveMapResourceVisual(
  registry: ResourceVisualRegistry,
  map: ResourceVisualMap,
  resourceKind: string,
  state: ResourceVisualState,
): VisualAssetRef | null {
  const visualSet = resolveResourceVisualSet(registry, map);
  if (!visualSet) {
    return null;
  }
  const asset = visualSet.resources[resourceKind]?.states[state];

  return asset ? { ...asset } : null;
}

export function resolveMapResourceVisualTextureKey(
  registry: ResourceVisualRegistry,
  map: ResourceVisualMap,
  resourceKind: string,
  state: ResourceVisualState,
): string | null {
  const visualSet = resolveResourceVisualSet(registry, map);
  if (!visualSet) {
    return null;
  }
  const asset = visualSet.resources[resourceKind]?.states[state];

  return asset ? createTextureKey(visualSet.id, resourceKind, state) : null;
}

export function getMapResourceVisualPreloadDescriptors(
  registry: ResourceVisualRegistry,
  map: ResourceVisualMap,
): ResourceVisualPreloadDescriptor[] {
  const visualSet = resolveResourceVisualSet(registry, map);
  if (!visualSet) {
    return [];
  }

  return getResourceVisualPreloadDescriptors(visualSet);
}

/**
 * Preload every registered visual because the launch map is not known until after
 * Phaser's preload phase. Ordering is stable across content-pack insertion order.
 */
export function getRegisteredResourceVisualPreloadDescriptors(
  registry: ResourceVisualRegistry,
): ResourceVisualPreloadDescriptor[] {
  return Object.keys(registry.resourceVisualSets)
    .sort()
    .flatMap((visualSetId) => {
      const visualSet = registry.resourceVisualSets[visualSetId];
      return visualSet ? getResourceVisualPreloadDescriptors(visualSet) : [];
    });
}

/**
 * A source image uses its native aspect ratio and rests on its container's
 * terrain ground contact. The 64px reference width is a project adaptation,
 * not an original sprite pivot or scale claim.
 */
export function resolveResourceVisualPlacement(
  mapTileWidth: number,
  mapTileHeight: number,
): ResourceVisualPlacement {
  if (!Number.isFinite(mapTileWidth) || mapTileWidth <= 0 || !Number.isFinite(mapTileHeight) || mapTileHeight <= 0) {
    throw new RangeError(`resource visual placement requires positive finite map tile dimensions; received ${mapTileWidth}x${mapTileHeight}`);
  }

  return {
    originX: 0.5,
    originY: 1,
    scale: mapTileWidth / 64,
    localX: 0,
    localY: 0,
  };
}

export function requireResourceVisualTexture(
  textureKey: string,
  exists: (textureKey: string) => boolean,
): void {
  if (!exists(textureKey)) {
    throw new Error(`Required resource visual texture is not loaded: ${textureKey}`);
  }
}

function getResourceVisualPreloadDescriptors(visualSet: ResourceVisualSetDefinition): ResourceVisualPreloadDescriptor[] {
  const descriptors: ResourceVisualPreloadDescriptor[] = [];

  for (const resourceKind of Object.keys(visualSet.resources).sort()) {
    const identity = visualSet.resources[resourceKind];
    if (!identity) {
      continue;
    }

    for (const state of ["active", "depleted"] as const) {
      const asset = identity.states[state];
      if (!asset) {
        continue;
      }

      descriptors.push({
        textureKey: createTextureKey(visualSet.id, resourceKind, state),
        resourceKind,
        state,
        ...asset,
      });
    }
  }

  return descriptors;
}

function resolveResourceVisualSet(registry: ResourceVisualRegistry, map: ResourceVisualMap): ResourceVisualSetDefinition | null {
  const visualSetId = map.resourceVisualSetId;
  if (!visualSetId) {
    return null;
  }

  const visualSet = registry.resourceVisualSets[visualSetId];
  if (!visualSet) {
    throw new Error(`Map '${map.id}' references unregistered resource visual set '${visualSetId}'.`);
  }

  return visualSet;
}

function createTextureKey(visualSetId: string, resourceKind: string, state: ResourceVisualState): string {
  return `resource-visual:${visualSetId}:${resourceKind}:${state}`;
}
