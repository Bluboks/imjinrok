import type { ContentRegistry } from "./contentPack.js";
import { validateDayNightCycle } from "./environment.js";
import { isSurfaceElevationSampling } from "./elevationProfile.js";
import type { MapDefinition } from "./maps.js";
import type { VisualAssetRef } from "./tilesets.js";

export interface MapValidationIssue {
  path: string;
  message: string;
}

export interface MapValidationResult {
  ok: boolean;
  issues: readonly MapValidationIssue[];
}

export function validateMapDefinition(map: MapDefinition, registry: ContentRegistry): MapValidationResult {
  const issues: MapValidationIssue[] = [];

  if (!map.id.trim()) {
    issues.push(issue("id", "Map id is required."));
  }
  if (!Number.isInteger(map.width) || map.width <= 0) {
    issues.push(issue("width", "Map width must be a positive integer."));
  }
  if (!Number.isInteger(map.height) || map.height <= 0) {
    issues.push(issue("height", "Map height must be a positive integer."));
  }
  if (!Number.isFinite(map.tileWidth) || map.tileWidth <= 0) {
    issues.push(issue("tileWidth", "Tile width must be positive."));
  }
  if (!Number.isFinite(map.tileHeight) || map.tileHeight <= 0) {
    issues.push(issue("tileHeight", "Tile height must be positive."));
  }
  validateElevationProfile(map, issues);

  validateReference(map.tilesetId, registry.tilesets, "tilesetId", "tileset", issues);
  validateReference(map.environmentVisualProfileId, registry.environmentVisualProfiles, "environmentVisualProfileId", "environment visual profile", issues);
  validateReference(map.resourceVisualSetId, registry.resourceVisualSets, "resourceVisualSetId", "resource visual set", issues);
  validatePathfindingProfileReference(map.pathfindingProfileId, registry.pathfindingProfiles, issues);
  validateMovementCollisionProfileReference(map.movementCollisionProfileId, registry.movementCollisionProfiles, issues);

  for (const environmentIssue of map.environment?.dayNight ? validateDayNightCycle(map.environment.dayNight) : []) {
    issues.push(issue(`environment.dayNight.${environmentIssue.path}`, environmentIssue.message));
  }
  validateDayNightVisualSteps(map, registry, issues);

  const expectedTileCount = map.width * map.height;
  map.layers.forEach((layer, layerIndex) => {
    if (layer.tiles.length !== expectedTileCount) {
      issues.push(issue(`layers[${layerIndex}].tiles`, `Expected ${expectedTileCount} tiles, received ${layer.tiles.length}.`));
    }

    layer.tiles.forEach((tile, tileIndex) => {
      if (!registry.terrains[tile.terrain]) {
        issues.push(issue(`layers[${layerIndex}].tiles[${tileIndex}].terrain`, `Unknown terrain '${tile.terrain}'.`));
      }
      if (!Number.isInteger(tile.elevation) || tile.elevation < 0) {
        issues.push(issue(`layers[${layerIndex}].tiles[${tileIndex}].elevation`, "Elevation must be a non-negative integer."));
      }
      if (tile.resource && !registry.resources[tile.resource.kind]) {
        issues.push(issue(`layers[${layerIndex}].tiles[${tileIndex}].resource.kind`, `Unknown resource '${tile.resource.kind}'.`));
      }
      validateTileTilesetVisuals(map, registry, tile, `layers[${layerIndex}].tiles[${tileIndex}]`, issues);
    });
  });

  return { ok: issues.length === 0, issues };
}

function validateElevationProfile(map: MapDefinition, issues: MapValidationIssue[]): void {
  const profile = map.elevationProfile;
  if (!profile) return;
  if (profile.stepHeight !== undefined && (!Number.isFinite(profile.stepHeight) || profile.stepHeight <= 0)) {
    issues.push(issue("elevationProfile.stepHeight", "Elevation profile stepHeight must be finite and positive."));
  }
  if (profile.sampling !== undefined && !isSurfaceElevationSampling(profile.sampling)) {
    issues.push(issue("elevationProfile.sampling", "Elevation profile sampling must be 'bilinear' or 'nearest'."));
  }
}

function validateDayNightVisualSteps(map: MapDefinition, registry: ContentRegistry, issues: MapValidationIssue[]): void {
  const visualSteps = map.environment?.dayNight?.visualSteps;
  if (!visualSteps) {
    return;
  }
  const profileId = map.environmentVisualProfileId;
  if (!profileId) {
    issues.push(issue("environmentVisualProfileId", "Day/night visual steps require an environment visual profile."));
    return;
  }
  const profile = registry.environmentVisualProfiles[profileId];
  if (!profile) {
    return;
  }
  const paletteIds = new Set(profile.paletteAssets?.map((asset) => asset.id) ?? []);
  visualSteps.forEach((step, index) => {
    if (!paletteIds.has(step.paletteId)) {
      issues.push(issue(`environment.dayNight.visualSteps[${index}].paletteId`, `Unknown palette '${step.paletteId}' in environment visual profile '${profileId}'.`));
    }
  });
}

export function assertValidMapDefinition(map: MapDefinition, registry: ContentRegistry): void {
  const result = validateMapDefinition(map, registry);

  if (!result.ok) {
    throw new Error(`Invalid map definition '${map.id}': ${result.issues.map((entry) => `${entry.path}: ${entry.message}`).join(" ")}`);
  }
}

function validateReference(
  reference: string | undefined,
  definitions: Readonly<Record<string, unknown>>,
  path: string,
  kind: string,
  issues: MapValidationIssue[],
): void {
  if (reference !== undefined && !definitions[reference]) {
    issues.push(issue(path, `Unknown ${kind} '${reference}'.`));
  }
}

function validatePathfindingProfileReference(
  profileId: string | undefined,
  profiles: Readonly<Record<string, unknown>>,
  issues: MapValidationIssue[],
): void {
  if (profileId === undefined) {
    return;
  }
  if (!profileId.trim()) {
    issues.push(issue("pathfindingProfileId", "Pathfinding profile id must not be empty."));
    return;
  }
  if (!profiles[profileId]) {
    issues.push(issue("pathfindingProfileId", `Unknown pathfinding profile '${profileId}'.`));
  }
}

function validateMovementCollisionProfileReference(
  profileId: string | undefined,
  profiles: Readonly<Record<string, unknown>>,
  issues: MapValidationIssue[],
): void {
  if (profileId === undefined) {
    return;
  }
  if (!profileId.trim()) {
    issues.push(issue("movementCollisionProfileId", "Movement collision profile id must not be empty."));
    return;
  }
  if (!profiles[profileId]) {
    issues.push(issue("movementCollisionProfileId", `Unknown movement collision profile '${profileId}'.`));
  }
}

function validateTileTilesetVisuals(
  map: MapDefinition,
  registry: ContentRegistry,
  tile: MapDefinition["layers"][number]["tiles"][number],
  tilePath: string,
  issues: MapValidationIssue[],
): void {
  const selection = tile.tilesetVisuals;

  if (!selection) {
    return;
  }

  if (selection.sourcePixelOffset !== undefined) {
    if (selection.flatAssetKey === undefined && selection.elevationAssetKey === undefined) {
      issues.push(issue(`${tilePath}.tilesetVisuals.sourcePixelOffset`, "Explicit tile placement offset requires a selected tile asset."));
    }
    if (!Number.isFinite(selection.sourcePixelOffset.x)) {
      issues.push(issue(`${tilePath}.tilesetVisuals.sourcePixelOffset.x`, "Tile placement offset x must be finite."));
    }
    if (!Number.isFinite(selection.sourcePixelOffset.y)) {
      issues.push(issue(`${tilePath}.tilesetVisuals.sourcePixelOffset.y`, "Tile placement offset y must be finite."));
    }
  }
  if (selection.flatArtworkEmbedsRelief !== undefined && typeof selection.flatArtworkEmbedsRelief !== "boolean") {
    issues.push(issue(`${tilePath}.tilesetVisuals.flatArtworkEmbedsRelief`, "Embedded flat artwork relief must be boolean."));
  }
  if (selection.flatArtworkEmbedsRelief === true && selection.flatAssetKey === undefined) {
    issues.push(issue(`${tilePath}.tilesetVisuals.flatArtworkEmbedsRelief`, "Embedded flat artwork relief requires a selected flat tile asset."));
  }

  const tilesetId = map.tilesetId;
  if (!tilesetId) {
    if (selection.flatAssetKey !== undefined) {
      issues.push(issue(`${tilePath}.tilesetVisuals.flatAssetKey`, "Explicit flat asset selection requires map.tilesetId."));
    }
    if (selection.elevationAssetKey !== undefined) {
      issues.push(issue(`${tilePath}.tilesetVisuals.elevationAssetKey`, "Explicit elevation asset selection requires map.tilesetId."));
    }
    if (selection.underlayAssetKey !== undefined) {
      issues.push(issue(`${tilePath}.tilesetVisuals.underlayAssetKey`, "Explicit tile underlay selection requires map.tilesetId."));
    }
    return;
  }

  const tileset = registry.tilesets[tilesetId];
  if (!tileset) {
    return;
  }

  validateSelectedTileAsset(
    selection.flatAssetKey,
    tileset.terrainAssets,
    tileset.elevationAssets,
    "flat",
    `${tilePath}.tilesetVisuals.flatAssetKey`,
    issues,
  );
  validateSelectedTileAsset(
    selection.elevationAssetKey,
    tileset.elevationAssets ?? {},
    tileset.terrainAssets,
    "elevation",
    `${tilePath}.tilesetVisuals.elevationAssetKey`,
    issues,
  );
  validateSelectedTileAsset(
    selection.underlayAssetKey,
    tileset.terrainAssets,
    tileset.elevationAssets,
    "underlay",
    `${tilePath}.tilesetVisuals.underlayAssetKey`,
    issues,
  );
}

function validateSelectedTileAsset(
  assetKey: string | undefined,
  expectedAssets: Readonly<Record<string, VisualAssetRef>>,
  otherAssets: Readonly<Record<string, VisualAssetRef>> | undefined,
  collection: "flat" | "elevation" | "underlay",
  path: string,
  issues: MapValidationIssue[],
): void {
  if (assetKey === undefined) {
    return;
  }

  const asset = expectedAssets[assetKey];
  if (!asset) {
    const otherCollection = collection === "elevation" ? "terrainAssets" : "elevationAssets";
    const message = otherAssets?.[assetKey]
      ? `Asset '${assetKey}' belongs to ${otherCollection}, not the ${collection} collection.`
      : `Unknown ${collection} asset '${assetKey}'.`;
    issues.push(issue(path, message));
    return;
  }

  const geometry = asset.imageGeometry;
  if (!geometry) {
    issues.push(issue(`${path}.imageGeometry`, "Explicit tile assets require image geometry."));
    return;
  }
  if (!Number.isFinite(geometry.width) || geometry.width <= 0) {
    issues.push(issue(`${path}.imageGeometry.width`, "Image width must be positive."));
  }
  if (!Number.isFinite(geometry.height) || geometry.height <= 0) {
    issues.push(issue(`${path}.imageGeometry.height`, "Image height must be positive."));
  }
  if (!Number.isFinite(geometry.footprintAnchor.x) || geometry.footprintAnchor.x < 0 || geometry.footprintAnchor.x > geometry.width) {
    issues.push(issue(`${path}.imageGeometry.footprintAnchor.x`, "Footprint anchor x must be inside the image."));
  }
  if (!Number.isFinite(geometry.footprintAnchor.y) || geometry.footprintAnchor.y < 0 || geometry.footprintAnchor.y > geometry.height) {
    issues.push(issue(`${path}.imageGeometry.footprintAnchor.y`, "Footprint anchor y must be inside the image."));
  }
}

function issue(path: string, message: string): MapValidationIssue {
  return { path, message };
}
