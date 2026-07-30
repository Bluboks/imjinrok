import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseMapHeader, summarizeRecordClusters } from "../../../tools/imjinrok/map-codec.mjs";
import {
  createImjinrokMapScaffold,
  createMapDefinitionFromId,
  createRandomSkirmishMap,
  getImjinrokMapMetadata,
  getRandomSkirmishMapSeed,
  getTileAt,
  terrainDefinitions,
  type GridPoint,
  type MapDefinition,
} from "./index.js";

const sharedSrcDirectory = dirname(fileURLToPath(import.meta.url));
const originalImjinrokDirectory = resolve(sharedSrcDirectory, "../../../original/imjinrok2");

test("imported K01 and K02 map metadata matches source map records", () => {
  for (const mapId of ["imjinrok-k01", "imjinrok-k02"] as const) {
    const metadata = getImjinrokMapMetadata(mapId);

    assert.ok(metadata, `${mapId} should have original map metadata`);
    assert.ok(metadata.sourceSpawns, `${mapId} should retain source spawn metadata`);
    assert.ok(metadata.sourceRecordProbe, `${mapId} should retain source record probe metadata`);

    const buffer = readFileSync(resolve(originalImjinrokDirectory, metadata.sourcePath));
    const header = parseMapHeader(buffer, metadata.sourcePath);
    const clusters = summarizeRecordClusters(buffer, header, {
      x: 0,
      y: 0,
      width: header.width,
      height: header.height,
      maxSignatureSamples: 1,
      maxRecordSamples: 1,
    });

    assert.equal(header.width, metadata.width, `${mapId} source width drifted`);
    assert.equal(header.height, metadata.height, `${mapId} source height drifted`);
    assert.equal(header.themeId, metadata.themeId, `${mapId} source theme drifted`);
    assert.deepEqual(header.view, metadata.view, `${mapId} source initial view drifted`);
    assert.deepEqual(
      header.spawnPoints.map((spawn) => ({ x: spawn.x, y: spawn.y })),
      metadata.sourceSpawns,
      `${mapId} source spawns drifted`,
    );
    assert.equal(clusters.layoutAssumption, metadata.sourceRecordProbe.layoutAssumption);
    assert.equal(clusters.nonZeroRecords, metadata.sourceRecordProbe.nonZeroRecords, `${mapId} non-zero records drifted`);
    assert.deepEqual(
      clusters.nonZeroBoundingBox,
      metadata.sourceRecordProbe.nonZeroBoundingBox,
      `${mapId} non-zero bounds drifted`,
    );
    assert.equal(clusters.clusterCount, metadata.sourceRecordProbe.clusterCount, `${mapId} cluster count drifted`);
    assert.deepEqual(
      clusters.clusters.slice(0, metadata.sourceRecordProbe.largestClusters.length).map(toSourceRecordClusterProbe),
      metadata.sourceRecordProbe.largestClusters,
      `${mapId} largest record clusters drifted`,
    );
  }
});

test("imported K01 scaffold exposes source dimensions and playable spawns", () => {
  const metadata = getImjinrokMapMetadata("imjinrok-k01");
  const map = createImjinrokMapScaffold("imjinrok-k01");

  assert.deepEqual(metadata?.sourceSpawns, [{ x: 6, y: 6 }]);
  assert.equal(metadata?.sourceRecordProbe?.nonZeroRecords, 253);
  assert.deepEqual(metadata?.sourceRecordProbe?.nonZeroBoundingBox, { minX: 0, minY: 23, maxX: 59, maxY: 56 });
  assert.deepEqual(metadata?.sourceRecordProbe?.largestClusters[0], {
    count: 14,
    boundingBox: { minX: 10, minY: 39, maxX: 19, maxY: 41 },
    topSignature: "02020202020202020202020202020202",
  });
  assert.ok(map);
  assert.equal(map.id, "imjinrok-k01");
  assert.equal(map.pathfindingProfileId, "imjinrok:source-greedy-local-adapter");
  assert.equal(map.width, 60);
  assert.equal(map.height, 60);
  assert.deepEqual(map.sourceInitialView, { x: 13, y: 8 });
  assert.deepEqual(
    map.spawnPoints.map((spawn) => ({ x: spawn.x, y: spawn.y, faction: spawn.faction })),
    [
      { x: 6, y: 6, faction: "blue" },
      { x: 52, y: 52, faction: "red" },
    ],
  );
  assert.deepEqual(collectGeneratedScaffoldResourceIds(map), []);
});

test("imported K01 scaffold applies source-derived terrain while preserving starter areas", () => {
  const map = createImjinrokMapScaffold("imjinrok-k01");

  assert.ok(map);
  assert.equal(getTileAt(map, 45, 40).terrain, "shallowWater");
  assert.equal(getTileAt(map, 57, 32).terrain, "forest");
  assert.equal(getTileAt(map, 6, 6).terrain, "grass");
  assert.equal(getTileAt(map, 52, 52).terrain, "grass");
});

test("imported K02 scaffold exposes source dimensions and terrain mask", () => {
  const metadata = getImjinrokMapMetadata("imjinrok-k02");
  const map = createImjinrokMapScaffold("imjinrok-k02");

  assert.deepEqual(metadata?.sourceSpawns, [{ x: 4, y: 70 }]);
  assert.equal(metadata?.sourceRecordProbe?.nonZeroRecords, 892);
  assert.deepEqual(metadata?.sourceRecordProbe?.nonZeroBoundingBox, { minX: 0, minY: 23, maxX: 79, maxY: 79 });
  assert.deepEqual(metadata?.sourceRecordProbe?.largestClusters[0], {
    count: 73,
    boundingBox: { minX: 17, minY: 23, maxX: 77, maxY: 29 },
    topSignature: "80008000800080008000800080008000",
  });
  assert.ok(map);
  assert.equal(map.id, "imjinrok-k02");
  assert.equal(map.width, 80);
  assert.equal(map.height, 80);
  assert.deepEqual(map.sourceInitialView, { x: 59, y: 47 });
  assert.deepEqual(
    map.spawnPoints.map((spawn) => ({ x: spawn.x, y: spawn.y, faction: spawn.faction })),
    [
      { x: 4, y: 70, faction: "blue" },
      { x: 72, y: 8, faction: "red" },
      { x: 32, y: 27, faction: "green" },
    ],
  );
  assert.equal(getTileAt(map, 10, 30).terrain, "forest");
  assert.equal(getTileAt(map, 40, 40).terrain, "water");
  assert.equal(getTileAt(map, 4, 70).terrain, "grass");
  assert.equal(getTileAt(map, 72, 8).terrain, "grass");
  assert.equal(getTileAt(map, 33, 28).terrain, "grass");
  assert.equal(hasPassablePath(map, { x: 6, y: 71 }, { x: 33, y: 28 }), true);
  assert.equal(hasPassablePath(map, { x: 33, y: 28 }, { x: 76, y: 3 }), true);
  assert.deepEqual(collectGeneratedScaffoldResourceIds(map), []);
});

test("imported original CPU scaffold exposes four-player starts and starter resources", () => {
  const map = createImjinrokMapScaffold("imjinrok-cpu-4p-128");

  assert.ok(map);
  assert.equal(map.id, "imjinrok-cpu-4p-128");
  assert.equal(map.width, 128);
  assert.equal(map.height, 128);
  assert.deepEqual(
    map.spawnPoints.map((spawn) => ({ x: spawn.x, y: spawn.y, faction: spawn.faction })),
    [
      { x: 12, y: 12, faction: "blue" },
      { x: 115, y: 115, faction: "red" },
      { x: 115, y: 12, faction: "green" },
      { x: 12, y: 115, faction: "yellow" },
    ],
  );
  assert.equal(getTileAt(map, 17, 12).resource?.kind, "rice");
  assert.equal(getTileAt(map, 107, 108).resource?.kind, "gold");
});

test("imported playable scaffolds keep spawn points mutually reachable", () => {
  for (const mapId of ["imjinrok-k01", "imjinrok-k02", "imjinrok-cpu-4p-128"]) {
    const map = createImjinrokMapScaffold(mapId);

    assert.ok(map, `${mapId} should load`);

    const origin = map.spawnPoints[0];
    assert.ok(origin, `${mapId} should have an origin spawn`);

    for (const spawn of map.spawnPoints.slice(1)) {
      assert.equal(hasPassablePath(map, origin, spawn), true, `${mapId} blocked ${origin.id} -> ${spawn.id}`);
    }
  }
});

test("random skirmish maps are deterministic by seed", () => {
  const first = createRandomSkirmishMap(12345, 64);
  const second = createRandomSkirmishMap(12345, 64);

  assert.deepEqual(first, second);
  assert.equal(first.width, 64);
  assert.equal(first.spawnPoints.length, 4);
});

test("map id resolver rebuilds imported and random map definitions", () => {
  const imported = createMapDefinitionFromId("imjinrok-k01");
  const random = createRandomSkirmishMap(12345, 64);
  const resolvedRandom = createMapDefinitionFromId(random.id, { randomSize: 64 });

  assert.equal(imported?.id, "imjinrok-k01");
  assert.deepEqual(resolvedRandom, random);
  assert.equal(createMapDefinitionFromId("unknown-map"), null);
});

test("random map seed parser accepts generated ids and rejects invalid ids", () => {
  assert.equal(getRandomSkirmishMapSeed(createRandomSkirmishMap(987654321, 96).id), 987654321);
  assert.equal(getRandomSkirmishMapSeed("imjinrok-k01"), null);
  assert.equal(getRandomSkirmishMapSeed("random-"), null);
  assert.equal(getRandomSkirmishMapSeed("random-not_a_seed"), null);
});

test("random skirmish maps keep all spawn points mutually reachable", () => {
  for (const seed of [1, 12345, 54321, 987654321]) {
    const map = createRandomSkirmishMap(seed, 96);
    const origin = map.spawnPoints[0];

    assert.ok(origin);

    for (const spawn of map.spawnPoints.slice(1)) {
      assert.equal(hasPassablePath(map, origin, spawn), true, `seed ${seed} blocked ${origin.id} -> ${spawn.id}`);
    }
  }
});

function hasPassablePath(map: MapDefinition, from: GridPoint, to: GridPoint): boolean {
  const start = { x: Math.round(from.x), y: Math.round(from.y) };
  const target = { x: Math.round(to.x), y: Math.round(to.y) };
  const queue = [start];
  const visited = new Set([toKey(start)]);

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      break;
    }

    if (current.x === target.x && current.y === target.y) {
      return true;
    }

    for (const neighbor of getNeighbors(current)) {
      const key = toKey(neighbor);

      if (visited.has(key) || !isPassable(map, neighbor)) {
        continue;
      }

      visited.add(key);
      queue.push(neighbor);
    }
  }

  return false;
}

function getNeighbors(point: GridPoint): GridPoint[] {
  return [
    { x: point.x + 1, y: point.y },
    { x: point.x - 1, y: point.y },
    { x: point.x, y: point.y + 1 },
    { x: point.x, y: point.y - 1 },
  ];
}

function isPassable(map: MapDefinition, point: GridPoint): boolean {
  if (point.x < 0 || point.y < 0 || point.x >= map.width || point.y >= map.height) {
    return false;
  }

  return !terrainDefinitions[getTileAt(map, point.x, point.y).terrain].blocksMovement;
}

function toKey(point: GridPoint): string {
  return `${point.x},${point.y}`;
}

function collectGeneratedScaffoldResourceIds(map: MapDefinition): string[] {
  return map.layers
    .flatMap((layer) => layer.tiles)
    .flatMap((tile) => tile.resource?.id ?? [])
    .filter((id) => id.startsWith(`${map.id}-spawn-`) || id.startsWith(`${map.id}-center-`))
    .sort();
}

function toSourceRecordClusterProbe(cluster: {
  count: number;
  boundingBox: { minX: number; minY: number; maxX: number; maxY: number };
  topSignatures: readonly { hex: string }[];
}) {
  return {
    count: cluster.count,
    boundingBox: cluster.boundingBox,
    topSignature: cluster.topSignatures[0]?.hex ?? "",
  };
}
