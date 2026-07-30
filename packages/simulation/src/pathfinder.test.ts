import assert from "node:assert/strict";
import test from "node:test";
import { createBlankMap, getTileIndex, type GridPoint, type ScenarioDefinition } from "../../shared/src/index.js";
import {
  CORE_A_STAR_PATHFINDER_ID,
  SOURCE_GREEDY_CANDIDATE_OFFSETS,
  SOURCE_GREEDY_LOCAL_ADAPTER_PATHFINDER_ID,
  PathfinderRegistry,
  createInitialWorldState,
  findPathForUnit,
  registerPathfinder,
  runSourceGreedyLocalSearch,
  toWorldSnapshot,
  type Pathfinder,
  type WorldState,
} from "./index.js";
import { createUnitState } from "./entities.js";

test("core:a-star remains the default provider and returns the established direct-route vector", () => {
  const state = createPathfindingState();
  const unit = state.units["p1-villager-1"]!;
  unit.position = { x: 1, y: 1 };

  assert.equal(state.pathfindingProfileId, CORE_A_STAR_PATHFINDER_ID);
  assert.deepEqual(findPathForUnit(state, unit, { x: 4, y: 1 }), [
    { x: 2, y: 1 },
    { x: 3, y: 1 },
    { x: 4, y: 1 },
  ]);
});

test("map and scenario profile selection retain the selected id in snapshots", () => {
  registerPathfinder(createFixedPathfinder("test:map-profile", [{ x: 6, y: 2 }]));
  registerPathfinder(createFixedPathfinder("test:scenario-profile", [{ x: 7, y: 2 }]));

  const map = createBlankMap({ width: 10, height: 10 });
  map.pathfindingProfileId = "test:map-profile";
  const mapState = createInitialWorldState(map, ["p1"]);
  const mapUnit = mapState.units["p1-villager-1"]!;

  assert.equal(mapState.pathfindingProfileId, "test:map-profile");
  assert.deepEqual(findPathForUnit(mapState, mapUnit, { x: 8, y: 2 }), [{ x: 6, y: 2 }]);
  assert.equal(toWorldSnapshot(mapState).pathfindingProfileId, "test:map-profile");

  const scenario: ScenarioDefinition = {
    ...createScenario("scenario-profile"),
    pathfindingProfileId: "test:scenario-profile",
  };
  const scenarioState = createInitialWorldState(map, ["p1"], scenario);
  const scenarioUnit = scenarioState.units["p1-villager-1"]!;

  assert.equal(scenarioState.pathfindingProfileId, "test:scenario-profile");
  assert.deepEqual(findPathForUnit(scenarioState, scenarioUnit, { x: 8, y: 2 }), [{ x: 7, y: 2 }]);
});

test("custom providers plug in by stable id, while duplicate and unknown ids fail loudly", () => {
  const registry = new PathfinderRegistry();
  const provider = createFixedPathfinder("test:registry", [{ x: 2, y: 2 }]);

  registry.register(provider);
  assert.deepEqual(registry.ids(), ["test:registry"]);
  assert.throws(() => registry.register(provider), /already registered/);
  assert.throws(() => registry.require("missing:registry"), /Unknown pathfinding profile/);
  assert.throws(() => registry.register(createFixedPathfinder("", [])), /must not be empty/);

  const replacement = createFixedPathfinder("test:registry", [{ x: 3, y: 3 }]);
  registry.register(replacement, { replace: true });
  assert.equal(registry.require("test:registry"), replacement);

  const unknownMap = createBlankMap();
  unknownMap.pathfindingProfileId = "missing:runtime";
  assert.throws(() => createInitialWorldState(unknownMap, ["p1"]), /Unknown pathfinding profile 'missing:runtime'/);
});

test("core:a-star produces the same path for repeated equal-cost route choices", () => {
  const map = createBlankMap({ width: 8, height: 7 });
  const blockedIndex = getTileIndex(map.width, 3, 3);
  const blockedTile = map.layers[0]?.tiles[blockedIndex];
  assert.ok(blockedTile);
  blockedTile.terrain = "forest";

  const state = createInitialWorldState(map, ["p1"]);
  const unit = state.units["p1-villager-1"]!;
  unit.position = { x: 1, y: 3 };
  const target = { x: 5, y: 3 };
  const paths = Array.from({ length: 5 }, () => findPathForUnit(state, unit, target));
  const firstPath = paths[0];

  assert.ok(firstPath);
  for (const path of paths.slice(1)) {
    assert.deepEqual(path, firstPath);
  }
});

test("source-greedy local adapter preserves the recovered candidate order and strict-score local boundary", () => {
  assert.deepEqual(SOURCE_GREEDY_CANDIDATE_OFFSETS, [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
    { x: 0, y: -1 },
  ]);

  const state = createSourceGreedyState({ width: 80, height: 80 });
  const unit = state.units["p1-villager-1"]!;
  unit.position = { x: 30, y: 30 };

  const capacities = [
    { target: { x: 30, y: 30 }, capacity: 26 },
    { target: { x: 33, y: 30 }, capacity: 40 },
    { target: { x: 35, y: 30 }, capacity: 80 },
  ];

  for (const { target, capacity } of capacities) {
    const result = runSourceGreedyLocalSearch(state, unit, unit.position, target, new Set([key(target)]), new Set(), 6_000);
    assert.equal(result.frontierCapacity, capacity);
  }

  const capped = runSourceGreedyLocalSearch(state, unit, unit.position, { x: 0, y: 1 }, new Set(["0,1"]), new Set(), 6_000);
  assert.equal(capped.reachedGoal, false);
  assert.equal(capped.frontierCapacity, 80);
  assert.equal(capped.maximumFrontierSize, 80);

  const acceptedBudget = runSourceGreedyLocalSearch(state, unit, unit.position, { x: 0, y: 1 }, new Set(["0,1"]), new Set(), 3);
  assert.equal(acceptedBudget.acceptedNodes, 3);

  const insertedGoal = runSourceGreedyLocalSearch(state, unit, unit.position, { x: 31, y: 31 }, new Set(["31,31"]), new Set(), 6_000);
  assert.equal(insertedGoal.reachedGoal, true);
  assert.equal(insertedGoal.acceptedNodes, 6);
  assert.deepEqual(insertedGoal.insertionParentTrace, [{ x: 30, y: 30 }, { x: 31, y: 31 }]);

  const tieMap = createBlankMap({ width: 8, height: 8 });
  const blockedGoal = tieMap.layers[0]?.tiles[getTileIndex(tieMap.width, 3, 3)];
  assert.ok(blockedGoal);
  blockedGoal.terrain = "forest";
  const tieState = createInitialWorldState(tieMap, ["p1"]);
  keepOnlyVillager(tieState);
  const tieUnit = tieState.units["p1-villager-1"]!;
  tieUnit.position = { x: 2, y: 2 };
  const fallback = runSourceGreedyLocalSearch(tieState, tieUnit, tieUnit.position, { x: 3, y: 3 }, new Set(["3,3"]), new Set(), 6_000);

  assert.equal(fallback.reachedGoal, false);
  assert.deepEqual(fallback.insertionParentTrace, [{ x: 2, y: 2 }, { x: 3, y: 2 }]);
});

test("source-greedy local adapter chains bounded traces deterministically without diagonal corner rejection", () => {
  const state = createSourceGreedyState({ width: 70, height: 70 });
  const unit = state.units["p1-villager-1"]!;
  unit.position = { x: 2, y: 2 };
  const target = { x: 60, y: 2 };
  const paths = Array.from({ length: 3 }, () => findPathForUnit(state, unit, target));

  assert.deepEqual(paths[0], paths[1]);
  assert.deepEqual(paths[1], paths[2]);
  assert.equal(paths[0]?.[0]?.x, 3);
  assert.deepEqual(paths[0]?.at(-1), target);
  assert.equal(paths[0]?.length, 58);

  const diagonalMap = createBlankMap({ width: 6, height: 6 });
  diagonalMap.pathfindingProfileId = SOURCE_GREEDY_LOCAL_ADAPTER_PATHFINDER_ID;
  const east = diagonalMap.layers[0]?.tiles[getTileIndex(diagonalMap.width, 2, 1)];
  const south = diagonalMap.layers[0]?.tiles[getTileIndex(diagonalMap.width, 1, 2)];
  assert.ok(east);
  assert.ok(south);
  east.terrain = "forest";
  south.terrain = "forest";
  const diagonalState = createInitialWorldState(diagonalMap, ["p1"]);
  keepOnlyVillager(diagonalState);
  const diagonalUnit = diagonalState.units["p1-villager-1"]!;
  diagonalUnit.position = { x: 1, y: 1 };

  assert.deepEqual(findPathForUnit(diagonalState, diagonalUnit, { x: 2, y: 2 }), [{ x: 2, y: 2 }]);
});

test("source-greedy local adapter honors product mobile collisions and partial-path contract", () => {
  const state = createSourceGreedyState({ width: 10, height: 8 });
  const mover = state.units["p1-villager-1"]!;
  mover.position = { x: 1, y: 3 };
  state.units.blocker = createUnitState("blocker", "p1", mover.kind, { x: 2, y: 3 });

  const collisionPath = findPathForUnit(state, mover, { x: 4, y: 3 });
  assert.ok(collisionPath);
  assert.equal(collisionPath.some((point) => point.x === 2 && point.y === 3), false);

  const blocked = createSourceGreedyState({ width: 7, height: 7 });
  const blockedMover = blocked.units["p1-villager-1"]!;
  blockedMover.position = { x: 1, y: 1 };
  const targetTile = blocked.map.layers[0]?.tiles[getTileIndex(blocked.map.width, 5, 5)];
  assert.ok(targetTile);
  targetTile.terrain = "forest";

  const resolvedPath = findPathForUnit(blocked, blockedMover, { x: 5, y: 5 });
  assert.ok(resolvedPath);
  assert.notDeepEqual(resolvedPath.at(-1), { x: 5, y: 5 });

  for (let y = 4; y <= 6; y += 1) {
    for (let x = 4; x <= 6; x += 1) {
      if (x === 5 && y === 5) {
        continue;
      }
      blocked.map.layers[0]!.tiles[getTileIndex(blocked.map.width, x, y)]!.terrain = "forest";
    }
  }
  blocked.map.layers[0]!.tiles[getTileIndex(blocked.map.width, 5, 5)]!.terrain = "grass";
  assert.equal(findPathForUnit(blocked, blockedMover, { x: 5, y: 5 }), null);
  const partial = findPathForUnit(blocked, blockedMover, { x: 5, y: 5 }, { allowPartial: true });
  assert.ok(partial);
  assert.notDeepEqual(partial.at(-1), { x: 5, y: 5 });
});

function createPathfindingState(): WorldState {
  const state = createInitialWorldState(createBlankMap({ width: 10, height: 10 }), ["p1"]);
  for (const unitId of Object.keys(state.units)) {
    if (unitId !== "p1-villager-1") {
      delete state.units[unitId];
    }
  }
  return state;
}

function createSourceGreedyState(size: { width: number; height: number }): WorldState {
  const map = createBlankMap(size);
  map.pathfindingProfileId = SOURCE_GREEDY_LOCAL_ADAPTER_PATHFINDER_ID;
  const state = createInitialWorldState(map, ["p1"]);
  keepOnlyVillager(state);
  return state;
}

function keepOnlyVillager(state: WorldState): void {
  for (const unitId of Object.keys(state.units)) {
    if (unitId !== "p1-villager-1") {
      delete state.units[unitId];
    }
  }
}

function key(point: GridPoint): string {
  return `${point.x},${point.y}`;
}

function createFixedPathfinder(id: string, path: readonly GridPoint[]): Pathfinder {
  return {
    id,
    findPath: () => path.map((point) => ({ ...point })),
  };
}

function createScenario(id: string): ScenarioDefinition {
  return {
    id,
    name: id,
    description: "Pathfinder selection test scenario.",
    scenarioType: "skirmish",
    mapId: "test-map",
    startingResources: { food: 0, wood: 0, gold: 0, stone: 0 },
    startingUnits: [],
    objectives: [],
    tags: [],
  };
}
