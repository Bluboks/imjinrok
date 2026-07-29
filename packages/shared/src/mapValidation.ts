import type { ContentRegistry } from "./contentPack.js";
import type { MapDefinition } from "./maps.js";

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

  validateReference(map.tilesetId, registry.tilesets, "tilesetId", "tileset", issues);
  validateReference(map.environmentVisualProfileId, registry.environmentVisualProfiles, "environmentVisualProfileId", "environment visual profile", issues);
  validateReference(map.resourceVisualSetId, registry.resourceVisualSets, "resourceVisualSetId", "resource visual set", issues);

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
    });
  });

  return { ok: issues.length === 0, issues };
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

function issue(path: string, message: string): MapValidationIssue {
  return { path, message };
}
