import assert from "node:assert/strict";
import test from "node:test";
import { createBlankMap, getTileIndex, type GridPoint, type ScenarioDefinition } from "../../shared/src/index.js";
import {
  CORE_A_STAR_PATHFINDER_ID,
  PathfinderRegistry,
  createInitialWorldState,
  findPathForUnit,
  registerPathfinder,
  toWorldSnapshot,
  type Pathfinder,
  type WorldState,
} from "./index.js";

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

function createPathfindingState(): WorldState {
  const state = createInitialWorldState(createBlankMap({ width: 10, height: 10 }), ["p1"]);
  for (const unitId of Object.keys(state.units)) {
    if (unitId !== "p1-villager-1") {
      delete state.units[unitId];
    }
  }
  return state;
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
