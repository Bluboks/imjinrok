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
  const map = createBlankMap({
    id: "river-crossing",
    name: "River Crossing",
    description: "Two major lanes with a contested center ridge.",
    width: 24,
    height: 24,
    tags: ["skirmish", "1v1", "custom-lobby", "automatch"],
  });

  for (let y = 9; y <= 14; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      setTerrain(map, x, y, "water");
    }
  }

  for (let x = 8; x <= 15; x += 1) {
    setTerrain(map, x, 11, "grass");
    setTerrain(map, x, 12, "grass");
  }

  for (let y = 3; y <= 7; y += 1) {
    for (let x = 16; x <= 20; x += 1) {
      setTerrain(map, x, y, "forest");
    }
  }

  for (let y = 16; y <= 20; y += 1) {
    for (let x = 3; x <= 7; x += 1) {
      setTerrain(map, x, y, "forest");
    }
  }

  for (let y = 5; y <= 8; y += 1) {
    for (let x = 9; x <= 14; x += 1) {
      setTerrain(map, x, y, "cliff");
    }
  }

  return map;
})();
