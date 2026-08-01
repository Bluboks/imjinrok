import test from "node:test";
import assert from "node:assert/strict";
import { createBlankMap, createRandomSkirmishMap, defaultMap, getTileAt, getTileIndex, resourceDefinitions, researchDefinitions, unitDefinitions, type BankResourceKind, type MapDefinition, type ResourceDefinition } from "../../shared/src/index.js";
import { createInitialWorldState } from "./world.js";
import { SkirmishAiController } from "./skirmishAi.js";
import { createUnitState } from "./entities.js";
import { advanceWorldTick } from "./tick.js";
import { coreStrictFootprintReservationPolicy, registerMovementCollisionPolicy, type MovementCollisionPolicy } from "./movementCollisionPolicy.js";
import { CORE_UNCAPPED_CAPACITY_POLICY_ID } from "./capacity.js";

const BUILTIN_RESOURCE_DEFINITIONS = resourceDefinitions as Readonly<Record<string, ResourceDefinition>>;

const MULTI_TILE_AI_POLICY_ID = "test:multi-tile-ai";

const multiTileAiPolicy: MovementCollisionPolicy = {
  ...coreStrictFootprintReservationPolicy,
  id: MULTI_TILE_AI_POLICY_ID,
  getEntityBlockingTiles(state, excludedUnitId, includeMobile = true) {
    const blocked = coreStrictFootprintReservationPolicy.getEntityBlockingTiles(state, excludedUnitId, includeMobile);
    const target = state.units["multi-ai-target-3x3"];

    if (includeMobile && target && target.id !== excludedUnitId) {
      for (const tile of getAiTargetTiles(target)) {
        blocked.add(`${tile.x},${tile.y}`);
      }
    }

    return blocked;
  },
  getBlockingGroupAtTile(state, excludedUnitId, tile, includeMobile = true) {
    const target = state.units["multi-ai-target-3x3"];
    const tiles = target ? getAiTargetTiles(target) : [];

    if (includeMobile && target && target.id !== excludedUnitId && tiles.some((candidate) => candidate.x === tile.x && candidate.y === tile.y)) {
      return { id: target.id, classification: "mobile", tiles };
    }

    return coreStrictFootprintReservationPolicy.getBlockingGroupAtTile(state, excludedUnitId, tile, includeMobile);
  },
};

function getAiTargetTiles(target: { position: { x: number; y: number } }): { x: number; y: number }[] {
  const tiles: { x: number; y: number }[] = [];

  for (let y = target.position.y - 1; y <= target.position.y + 1; y += 1) {
    for (let x = target.position.x - 1; x <= target.position.x + 1; x += 1) {
      tiles.push({ x, y });
    }
  }

  return tiles;
}

function createBlockedRiceAiFixture() {
  const map = createBlankMap({ width: 20, height: 20 });
  const state = createInitialWorldState(map, ["p1", "p2"]);
  const townCenter = createUnitState("p2-town-center-test", "p2", "town-center", { x: 2, y: 12 });
  const barracks = createUnitState("p2-barracks-test", "p2", "barracks", { x: 5, y: 12 });
  const worker = createUnitState("p2-villager-test", "p2", "villager", { x: 4, y: 4 });
  const blockedRing = [
    { x: 5, y: 3 },
    { x: 6, y: 3 },
    { x: 7, y: 3 },
    { x: 5, y: 4 },
    { x: 7, y: 4 },
    { x: 5, y: 5 },
    { x: 6, y: 5 },
    { x: 7, y: 5 },
  ];

  map.layers[0]!.tiles[getTileIndex(map.width, 6, 4)] = {
    terrain: "grass",
    elevation: 0,
    resource: { id: "blocked-rice", kind: "rice", amount: 100 },
  };
  map.layers[0]!.tiles[getTileIndex(map.width, 11, 4)] = {
    terrain: "grass",
    elevation: 0,
    resource: { id: "reachable-rice", kind: "rice", amount: 100 },
  };

  for (const tile of blockedRing) {
    map.layers[0]!.tiles[getTileIndex(map.width, tile.x, tile.y)] = {
      terrain: "water",
      elevation: 0,
    };
  }

  state.map = structuredClone(map);
  state.units = {
    [townCenter.id]: townCenter,
    [barracks.id]: barracks,
    [worker.id]: worker,
  };

  return { map, state, worker };
}

test("skirmish AI queues economy production and sends workers to resources", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const ai = new SkirmishAiController(["p2"], { tuning: { maxDefensiveBeacons: 0 } });

  state.tick = 45;
  ai.update(state);

  const townCenter = state.units["p2-town-center"];

  assert.equal(townCenter?.productionQueue?.[0]?.unit, "villager");
  assert.ok(townCenter?.rallyPoint?.resourceId);
  assert.equal(state.units["p2-villager-1"]?.currentOrder?.type, "gather");
});

test("skirmish AI mixes archers into barracks production", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const ai = new SkirmishAiController(["p2"], { tuning: { maxDefensiveBeacons: 0 } });
  const barracks = state.units["p2-barracks"];

  state.tick = 45;
  ai.update(state);

  assert.equal(barracks?.productionQueue?.[0]?.unit, "archer");
});

test("skirmish AI balances workers across food wood and gold for military production", () => {
  const map = createRandomSkirmishMap(7, 96);
  const state = createInitialWorldState(map, ["p1", "p2"]);
  const ai = new SkirmishAiController(["p2"], { tuning: { maxDefensiveBeacons: 0 } });
  const spawn = map.spawnPoints[1]!;

  state.units["p2-house-test"] = createUnitState("p2-house-test", "p2", "house", { x: spawn.x - 2, y: spawn.y - 2 });
  for (let index = 0; index < 5; index += 1) {
    const unitId = `p2-extra-villager-${index + 1}`;
    state.units[unitId] = createUnitState(unitId, "p2", "villager", { x: spawn.x - 4 + index, y: spawn.y - 4 });
  }

  state.tick = 45;
  ai.update(state);

  const gatheredResources = Object.values(state.units)
    .filter((unit) => unit.playerId === "p2" && unit.kind === "villager")
    .map((unit) => unit.currentOrder?.type === "gather" ? getResourceYield(map, unit.currentOrder.resourceId) : null)
    .filter((resource): resource is BankResourceKind => resource !== null);

  assert.ok(gatheredResources.includes("food"));
  assert.ok(gatheredResources.includes("wood"));
  assert.ok(gatheredResources.includes("gold"));
});

test("skirmish AI assigns a worker to stone when defensive reserves are low", () => {
  const map = createRandomSkirmishMap(7, 96);
  const state = createInitialWorldState(map, ["p1", "p2"]);
  const ai = new SkirmishAiController(["p2"]);
  const spawn = map.spawnPoints[1]!;

  state.playerResources.p2!.stone = 0;
  state.units["p2-house-test"] = createUnitState("p2-house-test", "p2", "house", { x: spawn.x - 2, y: spawn.y - 2 });
  for (let index = 0; index < 5; index += 1) {
    const unitId = `p2-extra-villager-${index + 1}`;
    state.units[unitId] = createUnitState(unitId, "p2", "villager", { x: spawn.x - 4 + index, y: spawn.y - 4 });
  }

  state.tick = 45;
  ai.update(state);

  const gatheredResources = Object.values(state.units)
    .filter((unit) => unit.playerId === "p2" && unit.kind === "villager")
    .map((unit) => unit.currentOrder?.type === "gather" ? getResourceYield(map, unit.currentOrder.resourceId) : null)
    .filter((resource): resource is BankResourceKind => resource !== null);

  assert.ok(gatheredResources.includes("stone"));
});

test("skirmish AI skips unreachable resource targets when assigning workers", () => {
  const { state, worker } = createBlockedRiceAiFixture();
  const ai = new SkirmishAiController(["p2"], { tuning: { maxDefensiveBeacons: 0 } });

  state.tick = 45;

  ai.update(state);

  assert.equal(worker.currentOrder?.type, "gather");
  assert.equal(worker.currentOrder?.resourceId, "reachable-rice");
});

test("skirmish AI sets production gather rally to a reachable resource", () => {
  const { state } = createBlockedRiceAiFixture();
  const ai = new SkirmishAiController(["p2"], { tuning: { maxDefensiveBeacons: 0 } });

  state.tick = 45;

  ai.update(state);

  assert.equal(state.units["p2-town-center-test"]?.rallyPoint?.resourceId, "reachable-rice");
});

test("skirmish AI reassigns workers from stale unreachable gather targets", () => {
  const { state, worker } = createBlockedRiceAiFixture();
  const ai = new SkirmishAiController(["p2"], { tuning: { maxDefensiveBeacons: 0 } });

  worker.currentOrder = { type: "gather", resourceId: "blocked-rice", target: { x: 6, y: 4 } };
  state.tick = 45;

  ai.update(state);

  assert.equal(worker.currentOrder?.type, "gather");
  assert.equal(worker.currentOrder?.resourceId, "reachable-rice");
});

test("skirmish AI difficulty changes the order cadence", () => {
  const normalState = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const hardState = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const normalAi = new SkirmishAiController(["p2"]);
  const hardAi = new SkirmishAiController(["p2"], { difficulty: "hard" });

  normalState.tick = 30;
  hardState.tick = 30;
  normalAi.update(normalState);
  hardAi.update(hardState);

  assert.equal(normalState.units["p2-town-center"]?.productionQueue, undefined);
  assert.equal(hardState.units["p2-town-center"]?.productionQueue?.[0]?.unit, "villager");
});

test("skirmish AI sets barracks rally points to attack-move", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const ai = new SkirmishAiController(["p2"], { tuning: { maxDefensiveBeacons: 0 } });

  state.tick = 45;
  ai.update(state);

  assert.equal(state.units["p2-barracks"]?.rallyPoint?.mode, "attack-move");
});

test("skirmish AI upgrades nearby barracks move rallies to attack-move", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const ai = new SkirmishAiController(["p2"], { tuning: { maxDefensiveBeacons: 0 } });
  const barracks = state.units["p2-barracks"]!;
  const enemy = state.units["p1-town-center"]!;

  barracks.rallyPoint = {
    target: {
      x: Math.round(enemy.position.x),
      y: Math.round(enemy.position.y),
    },
  };
  state.tick = 45;
  ai.update(state);

  assert.equal(barracks.rallyPoint?.mode, "attack-move");
});

test("skirmish AI researches loom after its worker economy is established", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const ai = new SkirmishAiController(["p2"]);
  const townCenter = state.units["p2-town-center"]!;
  const initialFood = state.playerResources.p2!.food;
  const initialGold = state.playerResources.p2!.gold;

  for (let index = 0; index < 5; index += 1) {
    const unitId = `p2-extra-villager-${index + 1}`;
    state.units[unitId] = createUnitState(unitId, "p2", "villager", { x: 43 + index, y: 43 });
  }

  state.tick = 45;
  ai.update(state);

  assert.equal(townCenter.researchQueue?.[0]?.research, "loom");
  assert.equal(state.playerResources.p2!.food, initialFood - researchDefinitions.loom.cost.food!);
  assert.equal(state.playerResources.p2!.gold, initialGold - researchDefinitions.loom.cost.gold!);

  for (let tick = 0; tick < researchDefinitions.loom.researchTimeTicks; tick += 1) {
    advanceWorldTick(state);
  }

  assert.equal(state.playerResearch.p2?.completed.loom, true);
  assert.equal(state.units["p2-villager-1"]?.health.max, 40);
});

test("skirmish AI rebuilds missing barracks near its town center", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const ai = new SkirmishAiController(["p2"]);
  const initialWood = state.playerResources.p2!.wood;

  for (const unit of Object.values(state.units)) {
    if (unit.playerId === "p2" && (unit.kind === "barracks" || unit.kind === "swordsman")) {
      delete state.units[unit.id];
    }
  }

  state.tick = 45;
  ai.update(state);

  const barracks = Object.values(state.units).find((unit) => unit.playerId === "p2" && unit.kind === "barracks");
  const builder = Object.values(state.units).find((unit) => unit.playerId === "p2" && unit.currentOrder?.type === "build");

  assert.equal(barracks?.kind, "barracks");
  assert.equal(builder?.currentOrder?.type, "build");
  assert.equal(state.playerResources.p2!.wood, initialWood - 175);
});

test("skirmish AI chooses a reachable build site when nearer valid placements are cut off", () => {
  const map = createBlankMap({ width: 16, height: 16 });
  const state = createInitialWorldState(map, ["p1", "p2"]);
  const ai = new SkirmishAiController(["p2"]);
  const townCenter = createUnitState("p2-town-center-test", "p2", "town-center", { x: 2, y: 8 });
  const worker = createUnitState("p2-villager-test", "p2", "villager", { x: 10, y: 8 });

  for (let y = 0; y < map.height; y += 1) {
    map.layers[0]!.tiles[getTileIndex(map.width, 5, y)] = {
      terrain: "water",
      elevation: 0,
    };
  }

  state.map = structuredClone(map);
  state.units = {
    [townCenter.id]: townCenter,
    [worker.id]: worker,
  };
  state.playerResources.p2!.wood = 1000;
  state.tick = 45;

  ai.update(state);

  const barracks = Object.values(state.units).find((unit) => unit.playerId === "p2" && unit.kind === "barracks");

  assert.ok(barracks);
  assert.equal(barracks.kind, "barracks");
  assert.ok(barracks.position.x > 5);
  assert.equal(worker.currentOrder?.type, "build");
  assert.equal(worker.currentOrder?.type === "build" ? worker.currentOrder.buildingUnitId : undefined, barracks.id);
});

test("skirmish AI rebuilds a missing town center when workers survive", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const ai = new SkirmishAiController(["p2"]);

  delete state.units["p2-town-center"];

  state.tick = 45;
  ai.update(state);

  const townCenter = Object.values(state.units).find((unit) => unit.playerId === "p2" && unit.kind === "town-center");

  assert.equal(townCenter?.kind, "town-center");
  assert.ok(townCenter?.construction);
});

test("skirmish AI builds houses before continuing at the population cap", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const ai = new SkirmishAiController(["p2"]);
  const initialWood = state.playerResources.p2!.wood;

  for (let index = 0; index < 4; index += 1) {
    const unitId = `p2-extra-swordsman-${index + 1}`;
    state.units[unitId] = createUnitState(unitId, "p2", "swordsman", { x: 45 + index, y: 45 });
  }

  state.tick = 45;
  ai.update(state);

  const house = Object.values(state.units).find((unit) => unit.playerId === "p2" && unit.kind === "house");

  assert.equal(house?.kind, "house");
  assert.equal(state.playerResources.p2!.wood, initialWood - 30);
});

test("skirmish AI builds defensive beacons after its worker economy is established", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const ai = new SkirmishAiController(["p2"]);
  const initialWood = state.playerResources.p2!.wood;
  const initialStone = state.playerResources.p2!.stone;

  state.units["p2-house-test"] = createUnitState("p2-house-test", "p2", "house", { x: 250, y: 250 });
  for (let index = 0; index < 5; index += 1) {
    const unitId = `p2-extra-villager-${index + 1}`;
    state.units[unitId] = createUnitState(unitId, "p2", "villager", { x: 248 + index, y: 248 });
  }

  state.tick = 45;
  ai.update(state);

  const beacon = Object.values(state.units).find((unit) => unit.playerId === "p2" && unit.kind === "beacon");
  const builder = Object.values(state.units).find((unit) => unit.playerId === "p2" && unit.currentOrder?.type === "build");

  assert.equal(beacon?.kind, "beacon");
  assert.ok(beacon?.construction);
  assert.equal(builder?.currentOrder?.type, "build");
  assert.equal(state.playerResources.p2!.wood, initialWood - 80 - unitDefinitions.archer.cost.wood!);
  assert.equal(state.playerResources.p2!.stone, initialStone - 20);
});

test("skirmish AI assigns workers to repair damaged buildings", () => {
  const map = createBlankMap({ width: 30, height: 30 });
  map.layers[0]!.tiles[getTileIndex(map.width, 18, 10)] = {
    terrain: "grass",
    elevation: 0,
    resource: { id: "test-wood", kind: "wood", amount: 100 },
  };
  const state = createInitialWorldState(map, ["p1", "p2"]);
  const ai = new SkirmishAiController(["p2"]);
  const townCenter = createUnitState("p2-town-center-test", "p2", "town-center", { x: 10, y: 10 });
  const barracks = createUnitState("p2-barracks-test", "p2", "barracks", { x: 9, y: 12 });
  const worker = createUnitState("p2-villager-test", "p2", "villager", { x: 12, y: 10 });

  townCenter.health.current = townCenter.health.max - 20;
  state.units = {
    [townCenter.id]: townCenter,
    [barracks.id]: barracks,
    [worker.id]: worker,
  };
  state.tick = 45;

  ai.update(state);

  assert.equal(worker.currentOrder?.type, "repair");
  assert.equal(worker.currentOrder?.targetUnitId, townCenter.id);
});

test("skirmish AI does not duplicate workers already repairing a damaged building", () => {
  const map = createBlankMap({ width: 30, height: 30 });
  map.layers[0]!.tiles[getTileIndex(map.width, 18, 10)] = {
    terrain: "grass",
    elevation: 0,
    resource: { id: "test-wood", kind: "wood", amount: 100 },
  };
  const state = createInitialWorldState(map, ["p1", "p2"]);
  const ai = new SkirmishAiController(["p2"]);
  const townCenter = createUnitState("p2-town-center-test", "p2", "town-center", { x: 10, y: 10 });
  const barracks = createUnitState("p2-barracks-test", "p2", "barracks", { x: 9, y: 12 });
  const repairingWorker = createUnitState("p2-villager-repairing", "p2", "villager", { x: 12, y: 10 });
  const idleWorker = createUnitState("p2-villager-idle", "p2", "villager", { x: 13, y: 10 });

  townCenter.health.current = townCenter.health.max - 20;
  repairingWorker.currentOrder = { type: "repair", targetUnitId: townCenter.id };
  state.units = {
    [townCenter.id]: townCenter,
    [barracks.id]: barracks,
    [repairingWorker.id]: repairingWorker,
    [idleWorker.id]: idleWorker,
  };
  state.tick = 45;

  ai.update(state);

  assert.equal(repairingWorker.currentOrder?.type, "repair");
  assert.notEqual(idleWorker.currentOrder?.type, "repair");
});

test("skirmish AI caps military production queue while rallying barracks toward enemies", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const ai = new SkirmishAiController(["p2"]);
  const barracks = state.units["p2-barracks"]!;

  state.tick = 45;
  ai.update(state);
  state.tick = 90;
  ai.update(state);
  state.tick = 135;
  ai.update(state);

  assert.equal(barracks.rallyPoint?.resourceId, undefined);
  assert.ok(barracks.rallyPoint);
  assert.equal(barracks.productionQueue?.length, 2);
  assert.equal(barracks.productionQueue?.filter((item) => item.unit === "archer").length, 1);
  assert.equal(barracks.productionQueue?.filter((item) => item.unit === "swordsman").length, 1);
});

test("normal and hard AI charge one preferred military unit per update", () => {
  for (const difficulty of ["normal", "hard"] as const) {
    const state = createInitialWorldState(createBlankMap({ width: 20, height: 20 }), ["p1", "p2"]);
    state.capacityPolicyId = CORE_UNCAPPED_CAPACITY_POLICY_ID;
    const barracks = createUnitState(`p2-one-train-${difficulty}`, "p2", "barracks", { x: 4, y: 4 });
    state.units = { [barracks.id]: barracks };
    state.playerResources.p2 = { food: 1000, wood: 1000, gold: 1000, stone: 1000 };
    const before = { ...state.playerResources.p2 };
    state.tick = difficulty === "hard" ? 30 : 45;

    new SkirmishAiController(["p2"], { difficulty }).update(state);

    assert.equal(barracks.productionQueue?.length, 1, difficulty);
    assert.equal(barracks.productionQueue?.[0]?.unit, "swordsman", difficulty);
    assert.equal(state.playerResources.p2.food, before.food - unitDefinitions.swordsman.cost.food!, difficulty);
    assert.equal(state.playerResources.p2.gold, before.gold - unitDefinitions.swordsman.cost.gold!, difficulty);
    assert.equal(state.playerResources.p2.wood, before.wood, difficulty);
  }
});

test("AI fallback trains only after the preferred military command actually fails", () => {
  const state = createInitialWorldState(createBlankMap({ width: 20, height: 20 }), ["p1", "p2"]);
  state.capacityPolicyId = CORE_UNCAPPED_CAPACITY_POLICY_ID;
  const barracks = createUnitState("p2-fallback-barracks", "p2", "barracks", { x: 4, y: 4 });
  state.units = { [barracks.id]: barracks };
  state.playerResources.p2 = { food: 50, wood: 100, gold: 100, stone: 100 };
  state.tick = 45;

  new SkirmishAiController(["p2"]).update(state);

  assert.equal(barracks.productionQueue?.length, 1);
  assert.equal(barracks.productionQueue?.[0]?.unit, "archer");
  assert.equal(state.playerResources.p2.food, 5);
  assert.equal(state.playerResources.p2.wood, 65);
  assert.equal(state.playerResources.p2.gold, 100);
});

test("skirmish AI sets barracks rally toward a reachable enemy when the nearest enemy is blocked", () => {
  const map = createBlankMap({ width: 24, height: 16 });
  const state = createInitialWorldState(map, ["p1", "p2"]);
  const ai = new SkirmishAiController(["p2"]);
  const townCenter = createUnitState("p2-town-center-test", "p2", "town-center", { x: 2, y: 10 });
  const barracks = createUnitState("p2-barracks-test", "p2", "barracks", { x: 4, y: 10 });
  const unreachableEnemy = createUnitState("p1-villager-unreachable", "p1", "villager", { x: 8, y: 10 });
  const reachableEnemy = createUnitState("p1-villager-reachable", "p1", "villager", { x: 16, y: 10 });
  const blockedRing = [
    { x: 7, y: 9 },
    { x: 8, y: 9 },
    { x: 9, y: 9 },
    { x: 7, y: 10 },
    { x: 9, y: 10 },
    { x: 7, y: 11 },
    { x: 8, y: 11 },
    { x: 9, y: 11 },
  ];

  for (const tile of blockedRing) {
    state.map.layers[0]!.tiles[getTileIndex(state.map.width, tile.x, tile.y)] = {
      terrain: "water",
      elevation: 0,
    };
  }

  state.units = {
    [townCenter.id]: townCenter,
    [barracks.id]: barracks,
    [unreachableEnemy.id]: unreachableEnemy,
    [reachableEnemy.id]: reachableEnemy,
  };
  state.tick = 45;

  ai.update(state);

  assert.deepEqual(barracks.rallyPoint?.target, reachableEnemy.position);
});

test("hard skirmish AI maintains a deeper military production queue", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const ai = new SkirmishAiController(["p2"], { difficulty: "hard" });
  const barracks = state.units["p2-barracks"]!;

  state.units["p2-house-test"] = createUnitState("p2-house-test", "p2", "house", { x: 42, y: 42 });
  state.playerResources.p2!.food = 1000;
  state.playerResources.p2!.gold = 1000;
  state.tick = 30;
  ai.update(state);
  state.tick = 60;
  ai.update(state);
  state.tick = 90;
  ai.update(state);

  assert.equal(barracks.productionQueue?.length, 3);
  assert.equal(barracks.productionQueue?.filter((item) => item.unit === "archer").length, 1);
  assert.equal(barracks.productionQueue?.filter((item) => item.unit === "swordsman").length, 2);
});

test("skirmish AI sends completed fighters toward enemy bases on attack intervals", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const ai = new SkirmishAiController(["p2"]);
  const fighter = state.units["p2-swordsman-1"]!;
  const enemy = state.units["p1-villager-1"]!;

  for (const unit of Object.values(state.units)) {
    if (unit.playerId === "p1" && unit.id !== enemy.id) {
      delete state.units[unit.id];
    }
  }

  fighter.position = { x: 70, y: 70 };
  enemy.position = { x: 72, y: 70 };
  state.tick = 540;

  ai.update(state);

  assert.equal(fighter.currentOrder?.type, "attack-move");
  assert.deepEqual(fighter.currentOrder?.target, enemy.position);
  assert.ok(fighter.movementTarget);
});

test("skirmish AI sends idle fighters in attack waves", () => {
  const map = createBlankMap({ width: 40, height: 40 });
  const state = createInitialWorldState(map, ["p1", "p2"]);
  const ai = new SkirmishAiController(["p2"]);
  const fighters = [
    createUnitState("p2-swordsman-wave-1", "p2", "swordsman", { x: 5, y: 5 }),
    createUnitState("p2-swordsman-wave-2", "p2", "swordsman", { x: 6, y: 5 }),
    createUnitState("p2-swordsman-wave-3", "p2", "swordsman", { x: 7, y: 5 }),
    createUnitState("p2-swordsman-wave-4", "p2", "swordsman", { x: 8, y: 5 }),
  ];
  const enemy = createUnitState("p1-villager-target", "p1", "villager", { x: 30, y: 30 });

  state.units = {
    [enemy.id]: enemy,
    ...Object.fromEntries(fighters.map((fighter) => [fighter.id, fighter])),
  };
  state.tick = 540;

  ai.update(state);

  assert.equal(fighters.filter((fighter) => fighter.currentOrder?.type === "attack-move").length, 3);
  assert.deepEqual(fighters[0]?.currentOrder?.type === "attack-move" ? fighters[0].currentOrder.target : null, enemy.position);
  assert.deepEqual(fighters[1]?.currentOrder?.type === "attack-move" ? fighters[1].currentOrder.target : null, enemy.position);
  assert.deepEqual(fighters[2]?.currentOrder?.type === "attack-move" ? fighters[2].currentOrder.target : null, enemy.position);
  assert.equal(fighters[3]?.currentOrder, undefined);
});

test("skirmish AI dispatches idle fighters to defend threats near its base", () => {
  const map = createBlankMap({ width: 30, height: 30 });
  const state = createInitialWorldState(map, ["p1", "p2"]);
  const ai = new SkirmishAiController(["p2"]);
  const townCenter = createUnitState("p2-town-center-test", "p2", "town-center", { x: 10, y: 10 });
  const fighter = createUnitState("p2-swordsman-test", "p2", "swordsman", { x: 12, y: 10 });
  const enemy = createUnitState("p1-swordsman-threat", "p1", "swordsman", { x: 11, y: 10 });

  state.units = {
    [townCenter.id]: townCenter,
    [fighter.id]: fighter,
    [enemy.id]: enemy,
  };
  state.tick = 45;

  ai.update(state);

  assert.equal(fighter.currentOrder?.type, "attack-move");
  assert.deepEqual(fighter.currentOrder?.target, enemy.position);
});

test("skirmish AI routes past a connected allied mobile blocker with the normal defense cap", () => {
  const run = (insertionOrder: readonly ("townCenter" | "mover" | "blocker" | "enemy")[]) => {
    const state = createInitialWorldState(createBlankMap({ width: 20, height: 12 }), ["p1", "p2", "p3"], undefined, {
      p2: "defenders",
      p3: "defenders",
    });
    const units = {
      townCenter: createUnitState("p2-defense-town-center", "p2", "town-center", { x: 4, y: 4 }),
      mover: createUnitState("p2-defense-mover", "p2", "swordsman", { x: 8, y: 4 }),
      blocker: createUnitState("p3-defense-blocker", "p3", "swordsman", { x: 9, y: 4 }),
      enemy: createUnitState("p1-defense-threat", "p1", "swordsman", { x: 10, y: 4 }),
    };
    state.units = Object.fromEntries(insertionOrder.map((key) => [units[key].id, units[key]]));
    const ai = new SkirmishAiController(["p2"], { tuning: { maxDefensiveBeacons: 0, maxBaseDefenders: 1 } });
    state.tick = 45;
    ai.update(state);

    assert.equal(units.mover.currentOrder?.type, "attack-move");
    assert.deepEqual(units.mover.currentOrder?.type === "attack-move" ? units.mover.currentOrder.target : undefined, units.enemy.position);
    assert.ok((units.mover.movementPath?.length ?? 0) > 0);

    for (let tick = 0; tick < 8; tick += 1) {
      advanceWorldTick(state);
    }

    return {
      position: { ...units.mover.position },
      target: units.mover.currentOrder?.type === "attack-move" ? { ...units.mover.currentOrder.target } : undefined,
    };
  };

  const canonical = run(["townCenter", "mover", "blocker", "enemy"]);
  const reversed = run(["enemy", "blocker", "mover", "townCenter"]);

  assert.ok(canonical.position.y > 4 || canonical.position.x > 8);
  assert.deepEqual(reversed, canonical);
});

test("skirmish AI defends a multi-tile mobile target deterministically across insertion order and ticks", () => {
  registerMovementCollisionPolicy(multiTileAiPolicy, { replace: true });

  const run = (insertionOrder: readonly ("townCenter" | "mover" | "ally" | "target")[]) => {
    const map = createBlankMap({ width: 24, height: 16 });
    map.movementCollisionProfileId = MULTI_TILE_AI_POLICY_ID;
    const state = createInitialWorldState(map, ["p1", "p2", "p3"], undefined, {
      p2: "defenders",
      p3: "defenders",
    });
    const units = {
      townCenter: createUnitState("p2-multi-ai-town-center", "p2", "town-center", { x: 3, y: 4 }),
      mover: createUnitState("p2-multi-ai-mover", "p2", "swordsman", { x: 8, y: 4 }),
      ally: createUnitState("p3-multi-ai-ally", "p3", "swordsman", { x: 9, y: 4 }),
      target: createUnitState("multi-ai-target-3x3", "p1", "swordsman", { x: 12, y: 4 }),
    };
    state.units = Object.fromEntries(insertionOrder.map((key) => [units[key].id, units[key]]));
    const ai = new SkirmishAiController(["p2"], { tuning: { maxDefensiveBeacons: 0, maxBaseDefenders: 1 } });
    state.tick = 45;
    ai.update(state);

    assert.equal(units.mover.currentOrder?.type, "attack-move");
    assert.deepEqual(units.mover.currentOrder?.type === "attack-move" ? units.mover.currentOrder.target : undefined, units.target.position);
    assert.ok((units.mover.movementPath?.length ?? 0) > 0);

    for (let tick = 0; tick < 8; tick += 1) {
      advanceWorldTick(state);
    }

    return {
      position: { ...units.mover.position },
      order: units.mover.currentOrder,
      navigation: units.mover.navigation,
      targetHealth: units.target.health.current,
    };
  };

  const canonical = run(["townCenter", "mover", "ally", "target"]);
  const reversed = run(["target", "ally", "mover", "townCenter"]);

  assert.ok(canonical.position.x > 8 || canonical.position.y !== 4);
  assert.ok(canonical.targetHealth < unitDefinitions.swordsman.baseAttributes.health || canonical.order?.type === "attack-unit");
  assert.deepEqual(reversed, canonical);
});

test("skirmish AI redirects attacking fighters to defend threats near its base", () => {
  const map = createBlankMap({ width: 40, height: 40 });
  const state = createInitialWorldState(map, ["p1", "p2"]);
  const ai = new SkirmishAiController(["p2"]);
  const townCenter = createUnitState("p2-town-center-test", "p2", "town-center", { x: 10, y: 10 });
  const fighter = createUnitState("p2-swordsman-test", "p2", "swordsman", { x: 18, y: 10 });
  const enemy = createUnitState("p1-swordsman-threat", "p1", "swordsman", { x: 11, y: 10 });

  fighter.currentOrder = { type: "attack-move", target: { x: 35, y: 35 } };
  fighter.movementTarget = { x: 19, y: 11 };
  state.units = {
    [townCenter.id]: townCenter,
    [fighter.id]: fighter,
    [enemy.id]: enemy,
  };
  state.tick = 45;

  ai.update(state);

  if (fighter.currentOrder?.type !== "attack-move") {
    assert.fail(`expected attack-move order, received ${fighter.currentOrder?.type ?? "none"}`);
  }

  assert.notDeepEqual(fighter.currentOrder.target, { x: 35, y: 35 });
  assert.ok(getSquaredDistance(fighter.currentOrder.target, enemy.position) <= 4);
});

test("skirmish AI recalls nearby workers with town bell during a base threat", () => {
  const map = createBlankMap({ width: 30, height: 30 });
  map.layers[0]!.tiles[getTileIndex(map.width, 18, 10)] = {
    terrain: "grass",
    elevation: 0,
    resource: { id: "test-wood", kind: "wood", amount: 100 },
  };
  const state = createInitialWorldState(map, ["p1", "p2"]);
  const ai = new SkirmishAiController(["p2"]);
  const townCenter = createUnitState("p2-town-center-test", "p2", "town-center", { x: 10, y: 10 });
  const barracks = createUnitState("p2-barracks-test", "p2", "barracks", { x: 8, y: 12 });
  const worker = createUnitState("p2-villager-test", "p2", "villager", { x: 12, y: 10 });
  const farWorker = createUnitState("p2-villager-far", "p2", "villager", { x: 29, y: 29 });
  const enemy = createUnitState("p1-swordsman-threat", "p1", "swordsman", { x: 11, y: 10 });

  worker.currentOrder = { type: "gather", resourceId: "test-wood", target: { x: 18, y: 10 } };
  farWorker.currentOrder = { type: "gather", resourceId: "test-wood", target: { x: 18, y: 10 } };
  state.units = {
    [townCenter.id]: townCenter,
    [barracks.id]: barracks,
    [worker.id]: worker,
    [farWorker.id]: farWorker,
    [enemy.id]: enemy,
  };
  state.tick = 45;

  ai.update(state);

  assert.equal(worker.currentOrder?.type, "move");
  assert.ok(worker.currentOrder?.target && getSquaredDistance(worker.currentOrder.target, townCenter.position) <= 8);
  assert.equal(farWorker.currentOrder?.type, "gather");
});

test("skirmish AI limits the number of base defenders it redirects", () => {
  const map = createBlankMap({ width: 30, height: 30 });
  const state = createInitialWorldState(map, ["p1", "p2"]);
  const ai = new SkirmishAiController(["p2"], { tuning: { maxBaseDefenders: 1 } });
  const townCenter = createUnitState("p2-town-center-test", "p2", "town-center", { x: 10, y: 10 });
  const firstFighter = createUnitState("p2-swordsman-1-test", "p2", "swordsman", { x: 12, y: 10 });
  const secondFighter = createUnitState("p2-swordsman-2-test", "p2", "swordsman", { x: 15, y: 10 });
  const enemy = createUnitState("p1-swordsman-threat", "p1", "swordsman", { x: 11, y: 10 });

  state.units = {
    [townCenter.id]: townCenter,
    [enemy.id]: enemy,
    [secondFighter.id]: secondFighter,
    [firstFighter.id]: firstFighter,
  };
  state.tick = 45;

  ai.update(state);

  assert.equal(firstFighter.currentOrder?.type, "attack-move");
  assert.deepEqual(firstFighter.currentOrder?.type === "attack-move" ? firstFighter.currentOrder.target : undefined, enemy.position);
  assert.equal(firstFighter.navigation?.terminalReason, "blocked-goal");
  assert.equal(firstFighter.movementPath?.length ?? 0, 0);
  assert.equal(secondFighter.currentOrder?.type, "attack-move");
  assert.deepEqual(secondFighter.currentOrder?.type === "attack-move" ? secondFighter.currentOrder.target : undefined, enemy.position);
  assert.ok((secondFighter.movementPath?.length ?? 0) > 0 || secondFighter.navigation?.terminalReason === "mobile-obstruction");
});

test("skirmish AI leaves fighters idle when a base threat is unreachable", () => {
  const map = createBlankMap({ width: 30, height: 30 });
  const state = createInitialWorldState(map, ["p1", "p2"]);
  const ai = new SkirmishAiController(["p2"]);
  const townCenter = createUnitState("p2-town-center-test", "p2", "town-center", { x: 5, y: 5 });
  const fighter = createUnitState("p2-swordsman-test", "p2", "swordsman", { x: 12, y: 5 });
  const enemy = createUnitState("p1-swordsman-threat", "p1", "swordsman", { x: 8, y: 5 });

  for (let y = 0; y < state.map.height; y += 1) {
    state.map.layers[0]!.tiles[getTileIndex(state.map.width, 10, y)] = { terrain: "water", elevation: 0 };
  }

  state.units = {
    [enemy.id]: enemy,
    [fighter.id]: fighter,
    [townCenter.id]: townCenter,
  };
  state.tick = 45;

  ai.update(state);

  assert.equal(fighter.currentOrder, undefined);
  assert.equal(fighter.movementTarget, undefined);
});

test("skirmish AI can redeploy fighters after a completed base defense order", () => {
  const map = createBlankMap({ width: 40, height: 40 });
  const state = createInitialWorldState(map, ["p1", "p2"]);
  const ai = new SkirmishAiController(["p2"]);
  const townCenter = createUnitState("p2-town-center-test", "p2", "town-center", { x: 10, y: 10 });
  const fighter = createUnitState("p2-swordsman-test", "p2", "swordsman", { x: 15, y: 10 });
  const enemy = createUnitState("p1-villager-target", "p1", "villager", { x: 28, y: 10 });

  fighter.currentOrder = { type: "attack-move", target: { x: 15, y: 10 } };
  state.units = {
    [townCenter.id]: townCenter,
    [fighter.id]: fighter,
    [enemy.id]: enemy,
  };
  state.tick = 540;

  ai.update(state);

  assert.equal(fighter.currentOrder?.type, "attack-move");
  assert.deepEqual(fighter.currentOrder?.target, enemy.position);
});

test("skirmish AI ignores allied players when picking attack targets", () => {
  const map = createBlankMap({ width: 20, height: 20 });
  const state = createInitialWorldState(map, ["p1", "p2", "p3"], undefined, {
    p1: "local",
    p2: "cpu",
    p3: "cpu",
  });
  const ai = new SkirmishAiController(["p2"]);
  const fighter = createUnitState("p2-swordsman-test", "p2", "swordsman", { x: 4, y: 4 });
  const ally = createUnitState("p3-villager-ally", "p3", "villager", { x: 5, y: 4 });
  const enemy = createUnitState("p1-villager-enemy", "p1", "villager", { x: 8, y: 4 });

  state.units = {
    [fighter.id]: fighter,
    [ally.id]: ally,
    [enemy.id]: enemy,
  };
  state.tick = 540;

  ai.update(state);

  assert.equal(fighter.currentOrder?.type, "attack-move");
  assert.deepEqual(fighter.currentOrder?.target, enemy.position);
});

test("skirmish AI skips unreachable attack targets and picks a reachable enemy", () => {
  const map = createBlankMap({ width: 20, height: 20 });
  const state = createInitialWorldState(map, ["p1", "p2"]);
  const ai = new SkirmishAiController(["p2"]);
  const fighter = createUnitState("p2-swordsman-test", "p2", "swordsman", { x: 4, y: 4 });
  const unreachableEnemy = createUnitState("p1-villager-unreachable", "p1", "villager", { x: 6, y: 4 });
  const reachableEnemy = createUnitState("p1-villager-reachable", "p1", "villager", { x: 8, y: 4 });
  const blockedRing = [
    { x: 5, y: 3 },
    { x: 6, y: 3 },
    { x: 7, y: 3 },
    { x: 5, y: 4 },
    { x: 7, y: 4 },
    { x: 5, y: 5 },
    { x: 6, y: 5 },
    { x: 7, y: 5 },
  ];

  for (const tile of blockedRing) {
    state.map.layers[0]!.tiles[getTileIndex(state.map.width, tile.x, tile.y)] = {
      terrain: "water",
      elevation: 0,
    };
  }

  state.units = {
    [fighter.id]: fighter,
    [unreachableEnemy.id]: unreachableEnemy,
    [reachableEnemy.id]: reachableEnemy,
  };
  state.tick = 540;

  ai.update(state);

  assert.equal(fighter.currentOrder?.type, "attack-move");
  assert.deepEqual(fighter.currentOrder?.target, reachableEnemy.position);
});

test("current-visibility skirmish AI selects a hidden enemy only after daylight", () => {
  const map = createSightLimitedMap();
  const state = createInitialWorldState(map, ["p1", "p2"]);
  const fighter = createUnitState("p2-swordsman-test", "p2", "swordsman", { x: 30, y: 30 });
  const enemy = createUnitState("p1-villager-target", "p1", "villager", { x: 36, y: 30 });
  const ai = new SkirmishAiController(["p2"], { perceptionPolicyId: "core:current-visibility" });

  state.units = { [fighter.id]: fighter, [enemy.id]: enemy };
  state.tick = 540;

  ai.update(state);
  assert.equal(fighter.currentOrder, undefined);

  state.environment.dayPhase = "day";
  ai.update(state);

  assert.equal(fighter.currentOrder?.type, "attack-move");
  assert.deepEqual(fighter.currentOrder?.type === "attack-move" ? fighter.currentOrder.target : undefined, enemy.position);
});

test("current-visibility skirmish AI does not defend or harass enemies outside night sight", () => {
  const defenseMap = createSightLimitedMap();
  const defenseState = createInitialWorldState(defenseMap, ["p1", "p2"]);
  const townCenter = createUnitState("p2-town-center-test", "p2", "town-center", { x: 30, y: 30 });
  const defender = createUnitState("p2-swordsman-test", "p2", "swordsman", { x: 25, y: 30 });
  const threat = createUnitState("p1-swordsman-threat", "p1", "swordsman", { x: 38, y: 30 });
  const fairAi = new SkirmishAiController(["p2"], {
    perceptionPolicyId: "core:current-visibility",
    tuning: { maxDefensiveBeacons: 0 },
  });

  defenseState.units = {
    [townCenter.id]: townCenter,
    [defender.id]: defender,
    [threat.id]: threat,
  };
  defenseState.tick = 45;
  fairAi.update(defenseState);
  assert.equal(defender.currentOrder, undefined);

  defenseState.environment.dayPhase = "day";
  fairAi.update(defenseState);
  assert.deepEqual(defender.currentOrder?.type === "attack-move" ? defender.currentOrder.target : undefined, threat.position);

  const harassmentMap = createSightLimitedMap();
  const harassmentState = createInitialWorldState(harassmentMap, ["p1", "p2"]);
  const harassmentTownCenter = createUnitState("p2-town-center-harass", "p2", "town-center", { x: 2, y: 2 });
  const barracks = createUnitState("p2-barracks-harass", "p2", "barracks", { x: 5, y: 2 });
  const harasser = createUnitState("p2-villager-harass", "p2", "villager", { x: 30, y: 30 });
  const target = createUnitState("p1-villager-harass", "p1", "villager", { x: 36, y: 30 });
  const harassAi = new SkirmishAiController(["p2"], {
    perceptionPolicyId: "core:current-visibility",
    tuning: {
      attackStartTicks: 1,
      attackIntervalTicks: 45,
      workerHarasserCount: 1,
      maxDefensiveBeacons: 0,
    },
  });

  harassmentState.units = {
    [harassmentTownCenter.id]: harassmentTownCenter,
    [barracks.id]: barracks,
    [harasser.id]: harasser,
    [target.id]: target,
  };
  harassmentState.tick = 45;
  harassAi.update(harassmentState);
  assert.equal(harasser.currentOrder, undefined);

  harassmentState.environment.dayPhase = "day";
  harassAi.update(harassmentState);
  assert.deepEqual(harasser.currentOrder?.type === "attack-move" ? harasser.currentOrder.target : undefined, target.position);
});

test("default omniscient skirmish AI retains legacy hidden-target selection", () => {
  const map = createSightLimitedMap();
  const state = createInitialWorldState(map, ["p1", "p2"]);
  const fighter = createUnitState("p2-swordsman-test", "p2", "swordsman", { x: 30, y: 30 });
  const enemy = createUnitState("p1-villager-target", "p1", "villager", { x: 36, y: 30 });
  const ai = new SkirmishAiController(["p2"]);

  state.units = { [fighter.id]: fighter, [enemy.id]: enemy };
  state.tick = 540;
  ai.update(state);

  assert.deepEqual(fighter.currentOrder?.type === "attack-move" ? fighter.currentOrder.target : undefined, enemy.position);
});

function getResourceYield(map: MapDefinition, resourceId: string): BankResourceKind | null {
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const resource = getTileAt(map, x, y).resource;

      if (resource?.id === resourceId) {
        return BUILTIN_RESOURCE_DEFINITIONS[resource.kind]?.yieldResource ?? null;
      }
    }
  }

  return null;
}

function createSightLimitedMap(): MapDefinition {
  const map = createBlankMap({ width: 64, height: 64 });
  map.environment = {
    dayNight: {
      cycleTicks: 10,
      nightStartTick: 0,
      dayStartTick: 6,
      nightSightMultiplier: 0.5,
    },
  };
  return map;
}

function getSquaredDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;

  return dx * dx + dy * dy;
}
