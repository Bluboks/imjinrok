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
