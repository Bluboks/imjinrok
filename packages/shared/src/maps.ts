import type { GridPoint } from "./commands.js";

export const terrainTypes = ["grass", "forest", "water", "cliff"] as const;
export type TerrainType = (typeof terrainTypes)[number];

export const factions = ["blue", "red", "green", "yellow"] as const;
export type FactionId = (typeof factions)[number];

export interface ResourceNode {
  id: string;
  kind: "tree" | "gold" | "stone" | "berry";
  amount: number;
}

export interface TileCell {
  terrain: TerrainType;
  elevation: number;
  resource?: ResourceNode;
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

export function getTileAt(map: MapDefinition, x: number, y: number): TileCell {
  const layer = map.layers[0];
  const index = getTileIndex(map.width, x, y);

  return layer?.tiles[index] ?? { terrain: "grass", elevation: 0 };
}

export const defaultMap: MapDefinition = (() => {
  const demoMapSize = 256;
  const map = createBlankMap({
    id: "river-crossing",
    name: "River Crossing",
    description: "Massive 256x256 river-crossing battlefield with multiple lanes and contested ridges.",
    width: demoMapSize,
    height: demoMapSize,
    tags: ["skirmish", "1v1", "custom-lobby", "automatch"],
  });

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

  return map;
})();
