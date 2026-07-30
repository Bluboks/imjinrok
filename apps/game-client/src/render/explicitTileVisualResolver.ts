import type {
  ContentRegistry,
  MapDefinition,
  TileCell,
  VisualAssetGeometry,
  VisualAssetRef,
} from "@shared";

export type ExplicitTileVisualCollection = "flat" | "elevation";

export interface ExplicitTileVisualPreloadDescriptor extends VisualAssetRef {
  readonly tilesetId: string;
  readonly assetKey: string;
  readonly collection: ExplicitTileVisualCollection;
  readonly textureKey: string;
}

export interface ExplicitTileVisualDescriptor extends ExplicitTileVisualPreloadDescriptor {
  readonly imageGeometry: VisualAssetGeometry;
  /** Asset-native pixel translation selected by the map for this cell. */
  readonly sourcePixelOffset: { readonly x: number; readonly y: number };
}

export interface ExplicitTileVisualPlacement {
  readonly origin: { x: number; y: number };
  readonly position: { x: number; y: number };
  readonly scale: number;
}

export interface ExplicitTileVisualWorldBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface TileImagePlacementInput {
  readonly imageGeometry: VisualAssetGeometry;
  readonly sourcePixelOffset?: { readonly x: number; readonly y: number };
}

type TilesetRegistry = Pick<ContentRegistry, "tilesets">;
type TilesetMap = Pick<MapDefinition, "id" | "tilesetId" | "layers">;

/**
 * Resolves only a tile's explicit mod-authored selection. A null result means
 * the product theme fallback remains responsible for that surface.
 */
export function resolveExplicitTileVisual(
  registry: TilesetRegistry,
  map: Pick<TilesetMap, "id" | "tilesetId">,
  tile: Pick<TileCell, "tilesetVisuals">,
  collection: ExplicitTileVisualCollection,
): ExplicitTileVisualDescriptor | null {
  const assetKey = collection === "flat"
    ? tile.tilesetVisuals?.flatAssetKey
    : tile.tilesetVisuals?.elevationAssetKey;
  if (assetKey === undefined) {
    return null;
  }

  const tileset = resolveTileset(registry, map);
  const assets = collection === "flat" ? tileset.terrainAssets : tileset.elevationAssets ?? {};
  const otherAssets = collection === "flat" ? tileset.elevationAssets : tileset.terrainAssets;
  const asset = assets[assetKey];

  if (!asset) {
    const otherCollection = collection === "flat" ? "elevationAssets" : "terrainAssets";
    if (otherAssets?.[assetKey]) {
      throw new Error(`Tileset '${tileset.id}' asset '${assetKey}' belongs to ${otherCollection}, not the ${collection} collection.`);
    }
    throw new Error(`Tileset '${tileset.id}' has no ${collection} asset '${assetKey}'.`);
  }

  assertImageGeometry(asset.imageGeometry, tileset.id, assetKey);
  return {
    ...asset,
    tilesetId: tileset.id,
    assetKey,
    collection,
    textureKey: createTextureKey(tileset.id, collection, assetKey, asset.frame),
    imageGeometry: asset.imageGeometry,
    sourcePixelOffset: tile.tilesetVisuals?.sourcePixelOffset ?? { x: 0, y: 0 },
  };
}

/**
 * Resolves an optional terrain-asset underlay without inheriting the flat
 * artwork's source offset. It is a shared-ground-contact composition layer.
 */
export function resolveExplicitTileUnderlayVisual(
  registry: TilesetRegistry,
  map: Pick<TilesetMap, "id" | "tilesetId">,
  tile: Pick<TileCell, "tilesetVisuals">,
): ExplicitTileVisualDescriptor | null {
  const underlayAssetKey = tile.tilesetVisuals?.underlayAssetKey;
  if (underlayAssetKey === undefined) return null;
  return resolveExplicitTileVisual(registry, map, { tilesetVisuals: { flatAssetKey: underlayAssetKey } }, "flat");
}

/** Preloads all registry assets because the launch map is selected after preload. */
export function getRegisteredExplicitTileVisualPreloadDescriptors(
  registry: TilesetRegistry,
): ExplicitTileVisualPreloadDescriptor[] {
  const descriptors: ExplicitTileVisualPreloadDescriptor[] = [];

  for (const tilesetId of Object.keys(registry.tilesets).sort()) {
    const tileset = registry.tilesets[tilesetId];
    if (!tileset) continue;
    addPreloadDescriptors(descriptors, tileset.id, "flat", tileset.terrainAssets);
    addPreloadDescriptors(descriptors, tileset.id, "elevation", tileset.elevationAssets ?? {});
  }

  return descriptors.sort((left, right) => left.textureKey.localeCompare(right.textureKey));
}

export function getMapExplicitTileVisualPreloadDescriptors(
  registry: TilesetRegistry,
  map: TilesetMap,
): ExplicitTileVisualDescriptor[] {
  const descriptors = new Map<string, ExplicitTileVisualDescriptor>();

  for (const layer of map.layers) {
    for (const tile of layer.tiles) {
      for (const collection of ["flat", "elevation"] as const) {
        const descriptor = resolveExplicitTileVisual(registry, map, tile, collection);
        if (descriptor) {
          descriptors.set(descriptor.textureKey, descriptor);
        }
      }
      const underlay = resolveExplicitTileUnderlayVisual(registry, map, tile);
      if (underlay) {
        descriptors.set(underlay.textureKey, underlay);
      }
    }
  }

  return Array.from(descriptors.values()).sort((left, right) => left.textureKey.localeCompare(right.textureKey));
}

export function resolveExplicitTileVisualPlacement(
  descriptor: Pick<ExplicitTileVisualDescriptor, "imageGeometry" | "sourcePixelOffset">,
  groundContact: { x: number; y: number },
  mapTileWidth: number,
  mapTileHeight: number,
  elevationSteps = 0,
  elevationStepHeight = mapTileHeight / 2,
): ExplicitTileVisualPlacement {
  return resolveTileImagePlacement(descriptor, groundContact, mapTileWidth, mapTileHeight, elevationSteps, elevationStepHeight);
}

/**
 * Shared product placement adapter for explicit terrain, its fog base, and
 * source fog composites. Offsets remain in source-image pixels and therefore
 * scale with the selected asset.
 */
export function resolveTileImagePlacement(
  descriptor: TileImagePlacementInput,
  groundContact: { x: number; y: number },
  mapTileWidth: number,
  mapTileHeight: number,
  elevationSteps = 0,
  elevationStepHeight = mapTileHeight / 2,
): ExplicitTileVisualPlacement {
  if (!Number.isFinite(mapTileWidth) || mapTileWidth <= 0 || !Number.isFinite(mapTileHeight) || mapTileHeight <= 0) {
    throw new RangeError(`explicit tile placement requires positive finite map tile dimensions; received ${mapTileWidth}x${mapTileHeight}`);
  }
  if (!Number.isInteger(elevationSteps) || elevationSteps < 0) {
    throw new RangeError(`explicit tile placement requires a non-negative integer elevation step; received ${elevationSteps}`);
  }
  if (!Number.isFinite(elevationStepHeight) || elevationStepHeight <= 0) {
    throw new RangeError(`explicit tile placement requires a positive finite elevation step height; received ${elevationStepHeight}`);
  }
  assertFiniteGroundContact(groundContact);

  const geometry = descriptor.imageGeometry;
  assertImageGeometry(geometry, "explicit", "asset");
  const scale = mapTileWidth / geometry.width;
  const sourcePixelOffset = descriptor.sourcePixelOffset ?? { x: 0, y: 0 };
  assertSourcePixelOffset(sourcePixelOffset);

  return {
    origin: {
      x: geometry.footprintAnchor.x / geometry.width,
      y: geometry.footprintAnchor.y / geometry.height,
    },
    position: {
      x: groundContact.x + sourcePixelOffset.x * scale,
      y: groundContact.y - elevationStepHeight * elevationSteps + sourcePixelOffset.y * scale,
    },
    scale,
  };
}

/** Includes source canvas overhang so chunk textures cannot clip explicit art. */
export function resolveExplicitTileVisualWorldBounds(
  descriptor: Pick<ExplicitTileVisualDescriptor, "imageGeometry" | "sourcePixelOffset">,
  groundContact: { x: number; y: number },
  mapTileWidth: number,
  mapTileHeight: number,
  elevationSteps = 0,
  elevationStepHeight = mapTileHeight / 2,
): ExplicitTileVisualWorldBounds {
  const placement = resolveExplicitTileVisualPlacement(
    descriptor,
    groundContact,
    mapTileWidth,
    mapTileHeight,
    elevationSteps,
    elevationStepHeight,
  );
  const geometry = descriptor.imageGeometry;
  const width = geometry.width * placement.scale;
  const height = geometry.height * placement.scale;
  const left = placement.position.x - geometry.footprintAnchor.x * placement.scale;
  const top = placement.position.y - geometry.footprintAnchor.y * placement.scale;

  return { left, top, right: left + width, bottom: top + height };
}

export function requireExplicitTileVisualTexture(textureKey: string, exists: (textureKey: string) => boolean): void {
  if (!exists(textureKey)) {
    throw new Error(`Required explicit tile visual texture is not loaded: ${textureKey}`);
  }
}

function addPreloadDescriptors(
  descriptors: ExplicitTileVisualPreloadDescriptor[],
  tilesetId: string,
  collection: ExplicitTileVisualCollection,
  assets: Readonly<Record<string, VisualAssetRef>>,
): void {
  for (const assetKey of Object.keys(assets).sort()) {
    const asset = assets[assetKey];
    if (!asset) continue;
    descriptors.push({
      ...asset,
      tilesetId,
      assetKey,
      collection,
      textureKey: createTextureKey(tilesetId, collection, assetKey, asset.frame),
    });
  }
}

function resolveTileset(registry: TilesetRegistry, map: Pick<TilesetMap, "id" | "tilesetId">) {
  if (!map.tilesetId) {
    throw new Error(`Map '${map.id}' selects an explicit tile visual without tilesetId.`);
  }
  const tileset = registry.tilesets[map.tilesetId];
  if (!tileset) {
    throw new Error(`Map '${map.id}' references unregistered tileset '${map.tilesetId}'.`);
  }
  return tileset;
}

function assertImageGeometry(
  geometry: VisualAssetGeometry | undefined,
  tilesetId: string,
  assetKey: string,
): asserts geometry is VisualAssetGeometry {
  if (!geometry) {
    throw new Error(`Tileset '${tilesetId}' asset '${assetKey}' requires imageGeometry for explicit tile rendering.`);
  }
  if (!Number.isFinite(geometry.width) || geometry.width <= 0 || !Number.isFinite(geometry.height) || geometry.height <= 0) {
    throw new Error(`Tileset '${tilesetId}' asset '${assetKey}' has invalid imageGeometry dimensions.`);
  }
  const { x, y } = geometry.footprintAnchor;
  if (!Number.isFinite(x) || x < 0 || x > geometry.width || !Number.isFinite(y) || y < 0 || y > geometry.height) {
    throw new Error(`Tileset '${tilesetId}' asset '${assetKey}' has an imageGeometry footprint anchor outside its image.`);
  }
}

function assertSourcePixelOffset(offset: { readonly x: number; readonly y: number }): void {
  if (!Number.isFinite(offset.x) || !Number.isFinite(offset.y)) {
    throw new Error("Explicit tile visual sourcePixelOffset must contain finite x and y values.");
  }
}

function assertFiniteGroundContact(groundContact: { readonly x: number; readonly y: number }): void {
  if (!Number.isFinite(groundContact.x) || !Number.isFinite(groundContact.y)) {
    throw new RangeError(
      `Explicit tile placement ground-contact coordinates must be finite; received ${groundContact.x},${groundContact.y}.`,
    );
  }
}

function createTextureKey(
  tilesetId: string,
  collection: ExplicitTileVisualCollection,
  assetKey: string,
  frame: number,
): string {
  return `tileset-visual:${tilesetId}:${collection}:${assetKey}:frame-${frame}`;
}
