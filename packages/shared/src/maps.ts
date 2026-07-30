import type { GridPoint } from "./commands.js";
import { resourceDefinitions, type BuiltInResourceDefinitionId, type FactionId, type ResourceDefinitionId, type TerrainType } from "./content.js";
import type { EnvironmentPreset } from "./environment.js";

export type ResourceNodeState = "active" | "depleted";

export interface ResourceNode {
  id: string;
  kind: ResourceDefinitionId;
  amount: number;
  state?: ResourceNodeState;
  regrowTicks?: number;
}

/**
 * Optional mod-authored selection of assets from the map's tileset. Leaving
 * either key absent preserves the product theme renderer for that surface.
 */
export interface TileTilesetVisualSelection {
  flatAssetKey?: string;
  elevationAssetKey?: string;
  /**
   * Optional opaque terrain-footprint artwork composited before `flatAssetKey`.
   * It uses the same terrain-asset collection but intentionally has no source
   * pixel translation: it establishes the shared map ground contact.
   */
  underlayAssetKey?: string;
  /**
   * Optional asset-native pixel translation applied after the shared
   * ground-contact anchor. This is a map/content rendering contract; it does
   * not assign a terrain or world-coordinate meaning to the source data.
   */
  sourcePixelOffset?: { x: number; y: number };
}

/**
 * Optional map-selected fog family. The value is profile-defined, so custom
 * maps can opt into their own fog renderer without making map identity part
 * of the client render policy.
 */
export interface TileFogVisualSelection {
  familyIndex?: number;
}

export interface TileCell {
  terrain: TerrainType;
  elevation: number;
  resource?: ResourceNode;
  tilesetVisuals?: TileTilesetVisualSelection;
  fogVisuals?: TileFogVisualSelection;
}

export interface TileLayer {
  id: string;
  name: string;
  tiles: TileCell[];
}

export interface SpawnPoint extends GridPoint {
  id: string;
  faction: FactionId;
}

export interface MapDefinition {
  id: string;
  name: string;
  description: string;
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  layers: TileLayer[];
  spawnPoints: SpawnPoint[];
  tags: string[];
  sourceInitialView?: GridPoint;
  environment?: EnvironmentPreset;
  /** Optional so saved/custom maps created before visual packs remain valid. */
  tilesetId?: string;
  /** Optional renderer fog profile; omitted maps keep the generic fog. */
  fogVisualProfileId?: string;
  environmentVisualProfileId?: string;
  resourceVisualSetId?: string;
  /**
   * Optional content-selected navigation profile. The simulation resolves this
   * stable id to a registered Pathfinder when it creates a world.
   */
  pathfindingProfileId?: string;
}

export function getTileIndex(width: number, x: number, y: number): number {
  return y * width + x;
}

export function createBlankLayer(
  width: number,
  height: number,
  terrain: TerrainType = "grass",
): TileLayer {
  return {
    id: "ground",
    name: "Ground",
    tiles: Array.from({ length: width * height }, () => ({
      terrain,
      elevation: 0,
    })),
  };
}

export function createDefaultSpawnPoints(width: number, height: number): SpawnPoint[] {
  const padding = 3;

  return [
    { id: "spawn-blue", x: padding, y: padding, faction: "blue" },
    { id: "spawn-red", x: width - (padding + 1), y: height - (padding + 1), faction: "red" },
    { id: "spawn-green", x: width - (padding + 1), y: padding, faction: "green" },
    { id: "spawn-yellow", x: padding, y: height - (padding + 1), faction: "yellow" },
  ];
}

export function createBlankMap(options?: Partial<Pick<MapDefinition, "id" | "name" | "description" | "width" | "height" | "tileWidth" | "tileHeight" | "tags">>): MapDefinition {
  const width = options?.width ?? 32;
  const height = options?.height ?? 32;

  return {
    id: options?.id ?? "blank-frontier",
    name: options?.name ?? "Blank Frontier",
    description: options?.description ?? "Fresh isometric battleground scaffold for RTS prototyping.",
    width,
    height,
    tileWidth: options?.tileWidth ?? 64,
    tileHeight: options?.tileHeight ?? 32,
    layers: [createBlankLayer(width, height)],
    spawnPoints: createDefaultSpawnPoints(width, height),
    tags: options?.tags ?? ["skirmish", "editor-ready"],
    tilesetId: "core-default",
    environmentVisualProfileId: "core-default",
    resourceVisualSetId: "core-default",
    pathfindingProfileId: "core:a-star",
  };
}

function setTerrain(map: MapDefinition, x: number, y: number, terrain: TerrainType): void {
  const groundLayer = map.layers[0];

  if (!groundLayer) {
    return;
  }

  const index = getTileIndex(map.width, x, y);
  const currentTile = groundLayer.tiles[index];

  if (!currentTile) {
    return;
  }

  groundLayer.tiles[index] = {
    ...currentTile,
    terrain,
  };
}

function setTerrainAndElevation(map: MapDefinition, x: number, y: number, terrain: TerrainType, elevation: number): void {
  const groundLayer = map.layers[0];

  if (!groundLayer || x < 0 || x >= map.width || y < 0 || y >= map.height) {
    return;
  }

  const index = getTileIndex(map.width, x, y);
  const currentTile = groundLayer.tiles[index];

  if (!currentTile) {
    return;
  }

  groundLayer.tiles[index] = {
    ...currentTile,
    terrain,
    elevation,
  };
}

function placeResource(
  map: MapDefinition,
  x: number,
  y: number,
  kind: BuiltInResourceDefinitionId,
  options?: Partial<Pick<ResourceNode, "amount" | "state" | "regrowTicks">>,
): void {
  const groundLayer = map.layers[0];

  if (!groundLayer || x < 0 || x >= map.width || y < 0 || y >= map.height) {
    return;
  }

  const index = getTileIndex(map.width, x, y);
  const currentTile = groundLayer.tiles[index];

  if (!currentTile) {
    return;
  }

  groundLayer.tiles[index] = {
    ...currentTile,
    terrain: "grass",
    elevation: 0,
    resource: {
      id: `demo-${kind}-${x}-${y}`,
      kind,
      amount: options?.amount ?? resourceDefinitions[kind].capacity,
      ...(options?.state ? { state: options.state } : {}),
      ...(options?.regrowTicks !== undefined ? { regrowTicks: options.regrowTicks } : {}),
    },
  };
}

export function getTileAt(map: MapDefinition, x: number, y: number): TileCell {
  const layer = map.layers[0];
  const index = getTileIndex(map.width, x, y);

  return layer?.tiles[index] ?? { terrain: "grass", elevation: 0 };
}

export const defaultMap: MapDefinition = (() => {
  const demoMapSize = 256;
  const map = createBlankMap({
    id: "river-crossing",
    name: "강변 격전지",
    description: "여러 진입로와 쟁탈 능선을 갖춘 256x256 강변 전장.",
    width: demoMapSize,
    height: demoMapSize,
    tags: ["skirmish", "1v1", "custom-lobby", "automatch"],
  });
  // Project-authored opt-in cycle for the default skirmish map. It is not an
  // assertion about any original mission's palette or timing.
  map.environment = {
    dayNight: {
      cycleTicks: 6_000,
      dayStartTick: 600,
      nightStartTick: 4_800,
      nightSightMultiplier: 0.6,
      lightCurve: [
        { tick: 0, phase: "dawn", lightLevel01: 0.65 },
        { tick: 600, phase: "day", lightLevel01: 1 },
        { tick: 4_200, phase: "dusk", lightLevel01: 0.65 },
        { tick: 4_800, phase: "night", lightLevel01: 0.3 },
      ],
    },
  };

  const fillRect = (fromX: number, fromY: number, toX: number, toY: number, terrain: TerrainType): void => {
    for (let y = fromY; y <= toY; y += 1) {
      for (let x = fromX; x <= toX; x += 1) {
        setTerrain(map, x, y, terrain);
      }
    }
  };

  fillRect(0, 96, map.width - 1, 159, "water");

  fillRect(48, 120, 88, 136, "grass");
  fillRect(108, 124, 148, 132, "grass");
  fillRect(168, 120, 208, 136, "grass");

  fillRect(178, 22, 232, 78, "forest");
  fillRect(22, 176, 78, 232, "forest");
  fillRect(18, 20, 62, 76, "forest");
  fillRect(194, 188, 238, 238, "forest");
  fillRect(92, 190, 132, 224, "forest");
  fillRect(134, 24, 164, 58, "forest");

  fillRect(88, 32, 160, 80, "cliff");
  fillRect(96, 178, 168, 224, "cliff");
  fillRect(112, 86, 152, 94, "cliff");
  fillRect(104, 162, 160, 170, "cliff");
  fillRect(34, 84, 78, 92, "cliff");
  fillRect(178, 164, 222, 172, "cliff");

  const addTwoStepHillDemo = (center: GridPoint): void => {
    for (let y = center.y - 4; y <= center.y + 4; y += 1) {
      for (let x = center.x - 4; x <= center.x + 4; x += 1) {
        setTerrainAndElevation(map, x, y, "grass", 0);
      }
    }

    for (let y = center.y - 3; y <= center.y + 3; y += 1) {
      for (let x = center.x - 3; x <= center.x + 3; x += 1) {
        setTerrainAndElevation(map, x, y, "grass", 1);
      }
    }

    for (let y = center.y - 1; y <= center.y + 1; y += 1) {
      for (let x = center.x - 1; x <= center.x + 1; x += 1) {
        setTerrainAndElevation(map, x, y, "grass", 2);
      }
    }
  };

  const addStarterResourceDemo = (anchor: GridPoint, directionX: -1 | 1, directionY: -1 | 1): void => {
    const resourceOffsets = [
      { kind: "rice", dx: 6 * directionX, dy: 0 },
      { kind: "rice", dx: 7 * directionX, dy: 0 },
      { kind: "rice", dx: 6 * directionX, dy: 1 * directionY },
      { kind: "potato", dx: 3 * directionX, dy: 6 * directionY },
      { kind: "potato", dx: 4 * directionX, dy: 6 * directionY },
      { kind: "tree", dx: 8 * directionX, dy: 3 * directionY },
      { kind: "tree", dx: 9 * directionX, dy: 3 * directionY },
      { kind: "bamboo", dx: 7 * directionX, dy: 6 * directionY },
      { kind: "bamboo", dx: 8 * directionX, dy: 6 * directionY },
    ] as const;

    for (const resource of resourceOffsets) {
      placeResource(map, anchor.x + resource.dx, anchor.y + resource.dy, resource.kind);
    }
  };

  // Terrain visual MVP: a wider two-step hill: 7x7 level-1 plateau, 3x3 level-2 top.
  addTwoStepHillDemo({ x: 128, y: 128 });
  // Same test hill near the north/local starting area for quick in-game inspection.
  addTwoStepHillDemo({ x: 12, y: 12 });

  addStarterResourceDemo({ x: 3, y: 3 }, 1, 1);
  addStarterResourceDemo({ x: map.width - 4, y: map.height - 4 }, -1, -1);
  addStarterResourceDemo({ x: map.width - 4, y: 3 }, -1, 1);
  addStarterResourceDemo({ x: 3, y: map.height - 4 }, 1, -1);

  return map;
})();
