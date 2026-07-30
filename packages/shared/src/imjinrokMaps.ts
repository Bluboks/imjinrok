import { resourceDefinitions, type BuiltInResourceDefinitionId, type FactionId, type TerrainType } from "./content.js";
import { applyK01SourceTileVisuals } from "./k01SourceTileVisuals.js";
import { applyK01SourceFogVisuals } from "./k01SourceFogVisuals.js";
import { createBlankMap, getTileIndex, type MapDefinition, type ResourceNode, type SpawnPoint, type TileCell } from "./maps.js";

const FACTIONS: readonly FactionId[] = ["blue", "red", "green", "yellow"];
const RANDOM_MAP_ID_PREFIX = "random-";
const K01_TERRAIN_RLE =
  "01o 11h9 22 11m 22 11k 22 11m 22 11e 2c 11c 2c 1m 22 1k 2h 1l 22 1k 2h 1l 24 1g 24 3f 1l 24 1g 24 3f 1n 24 1a 26 3h 1n 24 1a 26 3h 1p 22 18 24 3l 1p 22 18 24 3l 1p 22 18 24 3l 1p 22 18 24 3l 1p 22 12 28 3n 1p 22 12 28 3n 1p 26 3t 1p 26 3t 1r 24 3t 1r 24 3t 1r 24 3t 1r 24 3t 1p 26 3t 1p 26 3t 1p 22 3x 1p 22 3x";
const K02_TERRAIN_RLE =
  "01a4 2c 17 2d 1i 21 14 22 15 2b 16 215 03c 27 18 21 1i 2e 15 27 14 29 14 217 03c 24 12 21 12 217 15 23 14 29 14 217 03c 215 14 2d 18 28 15 215 03c 2k 11 26 12 2d 1b 25 1a 28 14 25 1c 28 11 25 16 23 03c 2c 18 2c 12 29 14 24 13 23 12 22 19 26 16 23 11 21 11 2c 13 22 11 21 11 2c 03c 2a 14 2g 12 2e 19 25 13 21 11 22 16 27 13 22 11 23 11 2a 13 22 13 21 13 28 03c 28 12 2i 14 2j 12 27 15 23 13 27 19 23 11 22 11 26 13 23 12 22 12 21 11 26 03c 29 14 2h 13 27 15 27 12 29 1b 27 13 2h 13 2g 03c 2b 12 26 11 2b 12 27 12 24 14 24 14 2a 15 28 13 2h 13 2g 03c 2b 13 2b 12 24 11 21 11 26 13 25 12 2a 14 29 13 25 15 2f 15 2e 03c 11 24 12 23 13 27 11 24 12 23 13 29 12 29 14 27 14 2f 16 2e 16 2b 03c 13 27 16 22 11 21 16 24 13 25 11 23 11 21 11 2c 14 27 14 2e 14 21 11 2d 15 21 11 28 03c 23 1a 26 11 24 17 28 12 21 12 2h 13 28 16 25 17 21 11 2b 16 22 11 28 03c 1a 2a 1b 2a 14 27 12 21 14 22 12 22 13 29 1b 21 11 2g 12 21 11 2a 03c 28 1b 2f 15 22 13 26 1a 26 16 28 13 26 11 2j 13 28 03c 2f 14 2h 13 23 14 25 14 23 14 22 12 25 15 2c 11 21 12 2g 11 21 12 28 03c 2f 15 2f 16 22 14 25 14 25 15 2a 14 28 11 21 12 28 12 26 14 28 03c 2i 12 2i 13 21 15 25 14 28 16 2b 1b 2a 1c 26 03c 2j 11 2j 12 21 12 28 13 2d 16 2f 14 2h 13 27 01o";

export interface ImjinrokMapMetadata {
  id: string;
  sourcePath: string;
  name: string;
  kind: "campaign" | "skirmish";
  width: number;
  height: number;
  themeId: number;
  tileTheme: "normal" | "snow" | "brown";
  view: { x: number; y: number };
  sourceSpawns?: readonly { x: number; y: number }[];
  spawns: readonly { x: number; y: number }[];
  missionRouteWaypoints?: readonly { x: number; y: number }[];
  terrainMaskRle?: string;
  sourceRecordProbe?: ImjinrokMapRecordProbe;
}

export interface ImjinrokMapRecordProbe {
  layoutAssumption: string;
  nonZeroRecords: number;
  nonZeroBoundingBox: SourceBoundingBox | null;
  clusterCount: number;
  largestClusters: readonly ImjinrokMapRecordClusterProbe[];
}

export interface ImjinrokMapRecordClusterProbe {
  count: number;
  boundingBox: SourceBoundingBox;
  topSignature: string;
}

export interface SourceBoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const imjinrokMapMetadatas = [
  {
    id: "imjinrok-k01",
    sourcePath: "stagemap/k01.map",
    name: "K01 Opening",
    kind: "campaign",
    width: 60,
    height: 60,
    themeId: 0,
    tileTheme: "normal",
    view: { x: 13, y: 8 },
    sourceSpawns: [
      { x: 6, y: 6 },
    ],
    spawns: [
      { x: 6, y: 6 },
      { x: 52, y: 52 },
    ],
    terrainMaskRle: K01_TERRAIN_RLE,
    sourceRecordProbe: {
      layoutAssumption: "row-major 256x256 records of 16 bytes at 0xbd8c",
      nonZeroRecords: 253,
      nonZeroBoundingBox: { minX: 0, minY: 23, maxX: 59, maxY: 56 },
      clusterCount: 38,
      largestClusters: [
        {
          count: 14,
          boundingBox: { minX: 10, minY: 39, maxX: 19, maxY: 41 },
          topSignature: "02020202020202020202020202020202",
        },
        {
          count: 12,
          boundingBox: { minX: 0, minY: 39, maxX: 8, maxY: 41 },
          topSignature: "02020202020202020202020101010101",
        },
        {
          count: 10,
          boundingBox: { minX: 9, minY: 55, maxX: 16, maxY: 56 },
          topSignature: "00000000000000000000000001040e0e",
        },
      ],
    },
  },
  {
    id: "imjinrok-k02",
    sourcePath: "stagemap/k02.map",
    name: "K02 Advance",
    kind: "campaign",
    width: 80,
    height: 80,
    themeId: 0,
    tileTheme: "normal",
    view: { x: 59, y: 47 },
    sourceSpawns: [
      { x: 4, y: 70 },
    ],
    missionRouteWaypoints: [
      { x: 6, y: 71 },
      { x: 33, y: 28 },
      { x: 76, y: 3 },
    ],
    spawns: [
      { x: 4, y: 70 },
      { x: 72, y: 8 },
      { x: 32, y: 27 },
    ],
    terrainMaskRle: K02_TERRAIN_RLE,
    sourceRecordProbe: {
      layoutAssumption: "row-major 256x256 records of 16 bytes at 0xbd8c",
      nonZeroRecords: 892,
      nonZeroBoundingBox: { minX: 0, minY: 23, maxX: 79, maxY: 79 },
      clusterCount: 62,
      largestClusters: [
        {
          count: 73,
          boundingBox: { minX: 17, minY: 23, maxX: 77, maxY: 29 },
          topSignature: "80008000800080008000800080008000",
        },
        {
          count: 68,
          boundingBox: { minX: 0, minY: 23, maxX: 55, maxY: 29 },
          topSignature: "80008000800080008000800080008000",
        },
        {
          count: 49,
          boundingBox: { minX: 39, minY: 25, maxX: 79, maxY: 29 },
          topSignature: "80008000800080008000800080008000",
        },
        {
          count: 39,
          boundingBox: { minX: 0, minY: 23, maxX: 32, maxY: 26 },
          topSignature: "80008000800080008000800080008000",
        },
        {
          count: 23,
          boundingBox: { minX: 28, minY: 70, maxX: 41, maxY: 73 },
          topSignature: "0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f",
        },
      ],
    },
  },
  {
    id: "imjinrok-cpu-4p-128",
    sourcePath: "cusmap/(4p,128X128)-original.map",
    name: "Original 4P 128 Scaffold",
    kind: "skirmish",
    width: 128,
    height: 128,
    themeId: 0,
    tileTheme: "normal",
    view: { x: 63, y: 82 },
    spawns: [
      { x: 12, y: 12 },
      { x: 115, y: 115 },
      { x: 115, y: 12 },
      { x: 12, y: 115 },
    ],
  },
] as const satisfies readonly ImjinrokMapMetadata[];

export function getImjinrokMapMetadata(mapId: string): ImjinrokMapMetadata | null {
  return imjinrokMapMetadatas.find((metadata) => metadata.id === mapId) ?? null;
}

export function createImjinrokMapScaffold(mapId: string): MapDefinition | null {
  const metadata = getImjinrokMapMetadata(mapId);

  if (!metadata) {
    return null;
  }

  const map = createBlankMap({
    id: metadata.id,
    name: metadata.name,
    description: metadata.terrainMaskRle
      ? `Playable scaffold imported from ${metadata.sourcePath} with a source-derived terrain mask.`
      : `Playable scaffold imported from ${metadata.sourcePath}. Terrain records are still being decoded.`,
    width: metadata.width,
    height: metadata.height,
    tags: [
      "imjinrok-original",
      metadata.kind,
      "import-scaffold",
      metadata.terrainMaskRle ? "terrain-mask" : "terrain-placeholder",
      `theme-${metadata.tileTheme}`,
    ],
  });

  map.sourceInitialView = { ...metadata.view };
  map.tilesetId = `imjinrok-${metadata.tileTheme}`;
  map.resourceVisualSetId = "imjinrok-source-resource-adaptation";
  applyOriginalTerrainMask(map, metadata.terrainMaskRle);
  map.spawnPoints = createSpawnPoints(metadata.spawns, metadata.width, metadata.height);
  carveSpawnLanes(map);
  clearStarterAreas(map);
  if (metadata.kind === "skirmish") {
    addSymmetricStarterResources(map);
    addCenterResourcePatch(map);
  }
  carveMissionRoute(map, metadata.missionRouteWaypoints);
  if (metadata.id === "imjinrok-k01") {
    // The palette identity/ticks are exact bounded source schedule facts. One
    // product simulation update per source admitted update is an explicit
    // calibration; true-color rendering remains a separate adapter.
    map.environmentVisualProfileId = "imjinrok-source-day-night-palette";
    map.environment = {
      dayNight: {
        cycleTicks: 8_640,
        dayStartTick: 0,
        nightStartTick: 4_320,
        visualSteps: [
          { tick: 0, paletteId: "night3" },
          { tick: 2, paletteId: "night2" },
          { tick: 4, paletteId: "night1" },
          { tick: 4_320, paletteId: "night1" },
          { tick: 4_322, paletteId: "night2" },
          { tick: 4_324, paletteId: "night3" },
          { tick: 4_326, paletteId: "night4" },
        ],
      },
    };
    const groundLayer = map.layers[0];
    if (!groundLayer) throw new Error("K01 scaffold has no ground layer for source tile visual assignment.");
    applyK01SourceTileVisuals(groundLayer.tiles, map.width, map.height);
    map.fogVisualProfileId = "imjinrok-source-fog-composite";
    applyK01SourceFogVisuals(groundLayer.tiles, map.width, map.height);
  }

  return map;
}

export interface CreateMapDefinitionFromIdOptions {
  randomSize?: number | undefined;
}

export function createMapDefinitionFromId(
  mapId: string | undefined,
  options: CreateMapDefinitionFromIdOptions = {},
): MapDefinition | null {
  if (!mapId) {
    return null;
  }

  const imjinrokMap = createImjinrokMapScaffold(mapId);

  if (imjinrokMap) {
    return imjinrokMap;
  }

  const randomSeed = getRandomSkirmishMapSeed(mapId);

  return randomSeed === null ? null : createRandomSkirmishMap(randomSeed, options.randomSize);
}

export function getRandomSkirmishMapSeed(mapId: string): number | null {
  if (!mapId.startsWith(RANDOM_MAP_ID_PREFIX)) {
    return null;
  }

  const encodedSeed = mapId.slice(RANDOM_MAP_ID_PREFIX.length);

  if (!/^[0-9a-z]+$/i.test(encodedSeed)) {
    return null;
  }

  const seed = Number.parseInt(encodedSeed, 36);

  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) {
    return null;
  }

  return seed >>> 0;
}

function applyOriginalTerrainMask(map: MapDefinition, terrainMaskRle: string | undefined): void {
  if (!terrainMaskRle) {
    return;
  }

  const values = decodeTerrainMaskRle(terrainMaskRle, map.width * map.height);

  values.forEach((value, index) => {
    const x = index % map.width;
    const y = Math.floor(index / map.width);

    setTile(map, x, y, {
      terrain: toTerrainType(value),
      elevation: 0,
    });
  });
}

function decodeTerrainMaskRle(rle: string, expectedLength: number): number[] {
  const output: number[] = [];

  for (const token of rle.split(/\s+/)) {
    if (!token) {
      continue;
    }

    const value = Number.parseInt(token[0] ?? "0", 10);
    const count = Number.parseInt(token.slice(1), 36);

    if (!Number.isInteger(value) || !Number.isInteger(count) || count <= 0) {
      throw new Error(`Invalid terrain mask token '${token}'`);
    }

    output.push(...Array.from({ length: count }, () => value));
  }

  if (output.length !== expectedLength) {
    throw new Error(`Terrain mask length ${output.length} does not match ${expectedLength}`);
  }

  return output;
}

function toTerrainType(value: number): TerrainType {
  switch (value) {
    case 0:
      return "water";
    case 2:
      return "forest";
    case 3:
      return "shallowWater";
    case 1:
    default:
      return "grass";
  }
}

export function createRandomSkirmishMap(seed: number, size = 96): MapDefinition {
  const normalizedSize = Math.max(48, Math.min(192, Math.floor(size)));
  const map = createBlankMap({
    id: `random-${seed.toString(36)}`,
    name: `Random Skirmish ${seed.toString(36).toUpperCase()}`,
    description: `Deterministic random skirmish generated from seed ${seed}.`,
    width: normalizedSize,
    height: normalizedSize,
    tags: ["skirmish", "random", "cpu-ready"],
  });
  const random = createLcg(seed);

  map.spawnPoints = createSpawnPoints(
    [
      { x: 6, y: 6 },
      { x: normalizedSize - 7, y: normalizedSize - 7 },
      { x: normalizedSize - 7, y: 6 },
      { x: 6, y: normalizedSize - 7 },
    ],
    normalizedSize,
    normalizedSize,
  );

  for (let patch = 0; patch < 18; patch += 1) {
    const center = {
      x: Math.floor(random() * normalizedSize),
      y: Math.floor(random() * normalizedSize),
    };
    const radius = 3 + Math.floor(random() * 6);
    const terrain: TerrainType = patch % 5 === 0 ? "shallowWater" : "forest";

    fillDisc(map, center.x, center.y, radius, terrain);
  }

  carveSpawnLanes(map);
  clearStarterAreas(map);
  addSymmetricStarterResources(map);
  addCenterResourcePatch(map);

  return map;
}

function createSpawnPoints(spawns: readonly { x: number; y: number }[], width: number, height: number): SpawnPoint[] {
  return spawns.map((spawn, index) => ({
    id: `spawn-${index + 1}`,
    x: clamp(Math.round(spawn.x), 0, width - 1),
    y: clamp(Math.round(spawn.y), 0, height - 1),
    faction: FACTIONS[index % FACTIONS.length] ?? "blue",
  }));
}

function addSymmetricStarterResources(map: MapDefinition): void {
  for (const spawn of map.spawnPoints) {
    const directionX = spawn.x < map.width / 2 ? 1 : -1;
    const directionY = spawn.y < map.height / 2 ? 1 : -1;
    const prefix = `${map.id}-${spawn.id}`;

    placeResource(map, spawn.x + 5 * directionX, spawn.y, "rice", `${prefix}-rice-1`);
    placeResource(map, spawn.x + 6 * directionX, spawn.y, "rice", `${prefix}-rice-2`);
    placeResource(map, spawn.x + 5 * directionX, spawn.y + directionY, "potato", `${prefix}-potato-1`);
    placeResource(map, spawn.x + 3 * directionX, spawn.y + 5 * directionY, "tree", `${prefix}-tree-1`);
    placeResource(map, spawn.x + 4 * directionX, spawn.y + 5 * directionY, "tree", `${prefix}-tree-2`);
    placeResource(map, spawn.x + 7 * directionX, spawn.y + 4 * directionY, "bamboo", `${prefix}-bamboo-1`);
    placeResource(map, spawn.x + 8 * directionX, spawn.y + 4 * directionY, "bamboo", `${prefix}-bamboo-2`);
    placeResource(map, spawn.x + 8 * directionX, spawn.y + 7 * directionY, "gold", `${prefix}-gold-1`, 600);
    placeResource(map, spawn.x + 9 * directionX, spawn.y + 7 * directionY, "stone", `${prefix}-stone-1`, 600);
  }
}

function addCenterResourcePatch(map: MapDefinition): void {
  const centerX = Math.floor(map.width / 2);
  const centerY = Math.floor(map.height / 2);

  placeResource(map, centerX - 1, centerY, "gold", `${map.id}-center-gold-1`, 900);
  placeResource(map, centerX + 1, centerY, "gold", `${map.id}-center-gold-2`, 900);
  placeResource(map, centerX, centerY - 1, "stone", `${map.id}-center-stone-1`, 900);
  placeResource(map, centerX, centerY + 1, "stone", `${map.id}-center-stone-2`, 900);
}

function clearStarterAreas(map: MapDefinition): void {
  const radius = 10;

  for (const spawn of map.spawnPoints) {
    for (let y = spawn.y - radius; y <= spawn.y + radius; y += 1) {
      for (let x = spawn.x - radius; x <= spawn.x + radius; x += 1) {
        setTile(map, x, y, { terrain: "grass", elevation: 0 });
      }
    }
  }
}

function fillDisc(map: MapDefinition, centerX: number, centerY: number, radius: number, terrain: TerrainType): void {
  const radiusSq = radius * radius;

  for (let y = centerY - radius; y <= centerY + radius; y += 1) {
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;

      if (dx * dx + dy * dy <= radiusSq) {
        setTile(map, x, y, { terrain, elevation: 0 });
      }
    }
  }
}

function carveSpawnLanes(map: MapDefinition): void {
  const anchor = map.spawnPoints[0];

  if (!anchor) {
    return;
  }

  for (const spawn of map.spawnPoints.slice(1)) {
    carveCorridor(map, anchor, spawn, 2);
  }
}

function carveMissionRoute(map: MapDefinition, waypoints: readonly { x: number; y: number }[] | undefined): void {
  if (!waypoints || waypoints.length < 2) {
    return;
  }

  for (let index = 0; index < waypoints.length - 1; index += 1) {
    const from = waypoints[index];
    const to = waypoints[index + 1];

    if (!from || !to) {
      continue;
    }

    carveCorridor(map, from, to, 3);
  }
}

function carveCorridor(map: MapDefinition, from: { x: number; y: number }, to: { x: number; y: number }, radius: number): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const x = Math.round(from.x + dx * t);
    const y = Math.round(from.y + dy * t);

    fillDisc(map, x, y, radius, "grass");
  }
}

function placeResource(
  map: MapDefinition,
  x: number,
  y: number,
  kind: BuiltInResourceDefinitionId,
  id: string,
  amount: number = resourceDefinitions[kind].capacity,
): void {
  const resource: ResourceNode = { id, kind, amount };

  setTile(map, x, y, {
    terrain: "grass",
    elevation: 0,
    resource,
  });
}

function setTile(map: MapDefinition, x: number, y: number, tile: TileCell): void {
  const layer = map.layers[0];

  if (!layer || x < 0 || x >= map.width || y < 0 || y >= map.height) {
    return;
  }

  layer.tiles[getTileIndex(map.width, x, y)] = tile;
}

function createLcg(seed: number): () => number {
  let state = seed >>> 0 || 0x9e3779b9;

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
