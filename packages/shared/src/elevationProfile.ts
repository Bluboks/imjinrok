import type { GridPoint } from "./commands.js";
import { getTileIndex, type MapDefinition } from "./maps.js";

export type SurfaceElevationSampling = "bilinear" | "nearest";

/**
 * Mod-authorable physical surface policy. Tile-cell elevation remains the
 * discrete authored level; this profile determines how continuous movers
 * sample between those cell centers.
 */
export interface MapElevationProfile {
  stepHeight?: number;
  sampling?: SurfaceElevationSampling;
}

export interface ResolvedMapElevationProfile {
  readonly stepHeight: number;
  readonly sampling: SurfaceElevationSampling;
}

export interface SurfaceElevationSample {
  readonly level: number;
  readonly liftPixels: number;
}

export interface SurfaceElevationSampleOptions {
  sampling?: SurfaceElevationSampling;
}

export function resolveMapElevationProfile(map: Pick<MapDefinition, "tileHeight" | "elevationProfile">): ResolvedMapElevationProfile {
  if (!Number.isFinite(map.tileHeight) || map.tileHeight <= 0) {
    throw new RangeError("Map tileHeight must be finite and positive before resolving an elevation profile.");
  }

  const stepHeight = map.elevationProfile?.stepHeight ?? map.tileHeight / 2;
  const sampling = map.elevationProfile?.sampling ?? "bilinear";
  assertPositiveFinite(stepHeight, "Elevation profile stepHeight");
  assertSurfaceElevationSampling(sampling, "Elevation profile sampling");
  return { stepHeight, sampling };
}

/**
 * Samples the physical map surface at cell-center grid coordinates. Fractional
 * coordinates interpolate neighbouring cell levels; map edges clamp rather
 * than reading outside the authored map.
 */
export function sampleMapSurfaceElevation(
  map: MapDefinition,
  point: GridPoint,
  options: SurfaceElevationSampleOptions = {},
): SurfaceElevationSample {
  assertFinitePoint(point);
  const profile = resolveMapElevationProfile(map);
  const sampling = options.sampling ?? profile.sampling;
  assertSurfaceElevationSampling(sampling, "Surface elevation sampling");
  assertMapSurface(map);

  const level = sampling === "nearest"
    ? readElevation(map, Math.round(point.x), Math.round(point.y))
    : sampleBilinearElevation(map, point);
  return { level, liftPixels: level * profile.stepHeight };
}

export function isSurfaceElevationSampling(value: unknown): value is SurfaceElevationSampling {
  return value === "bilinear" || value === "nearest";
}

function sampleBilinearElevation(map: MapDefinition, point: GridPoint): number {
  const x0 = Math.floor(point.x);
  const y0 = Math.floor(point.y);
  const tx = point.x - x0;
  const ty = point.y - y0;
  const top = interpolate(readElevation(map, x0, y0), readElevation(map, x0 + 1, y0), tx);
  const bottom = interpolate(readElevation(map, x0, y0 + 1), readElevation(map, x0 + 1, y0 + 1), tx);
  return interpolate(top, bottom, ty);
}

function readElevation(map: MapDefinition, x: number, y: number): number {
  const clampedX = Math.min(Math.max(x, 0), map.width - 1);
  const clampedY = Math.min(Math.max(y, 0), map.height - 1);
  const tile = map.layers[0]?.tiles[getTileIndex(map.width, clampedX, clampedY)];
  if (!tile) {
    throw new Error(`Map surface is missing tile ${clampedX},${clampedY}.`);
  }
  if (!Number.isInteger(tile.elevation) || tile.elevation < 0) {
    throw new RangeError(`Map surface tile ${clampedX},${clampedY} has an invalid discrete elevation.`);
  }
  return tile.elevation;
}

function assertMapSurface(map: MapDefinition): void {
  if (!Number.isInteger(map.width) || map.width <= 0 || !Number.isInteger(map.height) || map.height <= 0) {
    throw new RangeError("Map surface dimensions must be positive integers.");
  }
  const expectedTileCount = map.width * map.height;
  if (map.layers[0]?.tiles.length !== expectedTileCount) {
    throw new Error(`Map surface requires ${expectedTileCount} ground tiles.`);
  }
}

function assertFinitePoint(point: GridPoint): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new TypeError("Surface elevation coordinates must be finite.");
  }
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be finite and positive.`);
  }
}

function assertSurfaceElevationSampling(value: unknown, label: string): asserts value is SurfaceElevationSampling {
  if (!isSurfaceElevationSampling(value)) {
    throw new TypeError(`${label} must be 'bilinear' or 'nearest'.`);
  }
}

function interpolate(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}
