import test from "node:test";
import assert from "node:assert/strict";
import { createBlankMap, getTileAt, getTileIndex, type GridPoint, type MapDefinition, type TerrainType } from "../../shared/src/index.js";
import { advanceWorldTick, createInitialWorldState, findPathForUnit, isTerrainWalkable, isTileFlooded, isTilePassableForUnit } from "./index.js";

test("shallowWater is passable in clear weather for current mobile units", () => {
  const map = createBlankMap({ width: 10, height: 10 });
  setTerrain(map, 4, 4, "shallowWater");
  const state = createInitialWorldState(map, ["p1"]);
  const unit = state.units["p1-villager-1"]!;

  assert.equal(isTerrainWalkable(map, { x: 4, y: 4 }), true);
  assert.equal(isTileFlooded(state, { x: 4, y: 4 }), false);
  assert.equal(isTilePassableForUnit(state, unit, { x: 4, y: 4 }), true);
});

test("rain floods shallowWater without mutating map terrain", () => {
  const map = createBlankMap({ width: 10, height: 10 });
  map.environment = { weather: "rain" };
  setTerrain(map, 4, 4, "shallowWater");
  const state = createInitialWorldState(map, ["p1"]);
  const unit = state.units["p1-villager-1"]!;

  assert.equal(isTileFlooded(state, { x: 4, y: 4 }), true);
  assert.equal(isTilePassableForUnit(state, unit, { x: 4, y: 4 }), false);
  assert.equal(getTileAt(map, 4, 4).terrain, "shallowWater");
});

test("pathfinding crosses shallowWater barrier in clear weather but not rain", () => {
  const clearMap = createBarrierMap("shallowWater");
  const clearState = createInitialWorldState(clearMap, ["p1"]);
  keepOnlyUnit(clearState, "p1-villager-1");
  const clearUnit = clearState.units["p1-villager-1"]!;
  clearUnit.position = { x: 2, y: 5 };

  const clearPath = findPathForUnit(clearState, clearUnit, { x: 8, y: 5 });
  assert.ok(clearPath && clearPath.length > 0);

  const rainMap = createBarrierMap("shallowWater");
  rainMap.environment = { weather: "rain" };
  const rainState = createInitialWorldState(rainMap, ["p1"]);
  keepOnlyUnit(rainState, "p1-villager-1");
  const rainUnit = rainState.units["p1-villager-1"]!;
  rainUnit.position = { x: 2, y: 5 };

  assert.equal(findPathForUnit(rainState, rainUnit, { x: 8, y: 5 }), null);
});

test("pathfinding picks a reachable fallback when a blocked target borders an unreachable candidate first", () => {
  const map = createBarrierMap("water");
  const state = createInitialWorldState(map, ["p1"]);
  keepOnlyUnit(state, "p1-villager-1");
  const unit = state.units["p1-villager-1"]!;

  unit.position = { x: 2, y: 5 };

  const path = findPathForUnit(state, unit, { x: 5, y: 5 });

  assert.ok(path);
  assert.deepEqual(path.at(-1), { x: 4, y: 5 });
});

test("mobile units standing on flooded shallowWater drown on tick", () => {
  const map = createBlankMap({ width: 10, height: 10 });
  map.environment = { weather: "rain" };
  setTerrain(map, 4, 4, "shallowWater");
  const state = createInitialWorldState(map, ["p1"]);
  keepOnlyUnit(state, "p1-villager-1");
  state.units["p1-villager-1"]!.position = { x: 4, y: 4 };

  advanceWorldTick(state);

  assert.equal(state.units["p1-villager-1"], undefined);
});

test("static deep water remains blocked in clear and rain", () => {
  const clearMap = createBlankMap({ width: 10, height: 10 });
  setTerrain(clearMap, 4, 4, "water");
  const clearState = createInitialWorldState(clearMap, ["p1"]);
  const clearUnit = clearState.units["p1-villager-1"]!;

  assert.equal(isTerrainWalkable(clearMap, { x: 4, y: 4 }), false);
  assert.equal(isTilePassableForUnit(clearState, clearUnit, { x: 4, y: 4 }), false);

  const rainMap = createBlankMap({ width: 10, height: 10 });
  rainMap.environment = { weather: "rain" };
  setTerrain(rainMap, 4, 4, "water");
  const rainState = createInitialWorldState(rainMap, ["p1"]);
  const rainUnit = rainState.units["p1-villager-1"]!;

  assert.equal(isTileFlooded(rainState, { x: 4, y: 4 }), false);
  assert.equal(isTilePassableForUnit(rainState, rainUnit, { x: 4, y: 4 }), false);
});

test("elevation remains a map visual/topology contract and does not silently change terrain passability", () => {
  const map = createBlankMap({ width: 10, height: 10 });
  const elevated = map.layers[0]?.tiles[getTileIndex(map.width, 4, 4)];
  assert.ok(elevated);
  elevated.elevation = 3;
  const state = createInitialWorldState(map, ["p1"]);
  const unit = state.units["p1-villager-1"]!;

  assert.equal(isTerrainWalkable(map, { x: 4, y: 4 }), true);
  assert.equal(isTilePassableForUnit(state, unit, { x: 4, y: 4 }), true);

  setTerrain(map, 4, 4, "cliff");
  const cliff = map.layers[0]?.tiles[getTileIndex(map.width, 4, 4)];
  assert.ok(cliff);
  cliff.elevation = 3;
  assert.equal(isTerrainWalkable(map, { x: 4, y: 4 }), false);
});

function createBarrierMap(terrain: TerrainType): MapDefinition {
  const map = createBlankMap({ width: 10, height: 10 });

  for (let y = 0; y < map.height; y += 1) {
    setTerrain(map, 5, y, terrain);
  }

  return map;
}

function setTerrain(map: MapDefinition, x: number, y: number, terrain: TerrainType): void {
  const layer = map.layers[0];
  if (!layer) {
    return;
  }

  layer.tiles[getTileIndex(map.width, x, y)] = {
    terrain,
    elevation: 0,
  };
}

function keepOnlyUnit(state: ReturnType<typeof createInitialWorldState>, keptUnitId: string): void {
  for (const unitId of Object.keys(state.units)) {
    if (unitId !== keptUnitId) {
      delete state.units[unitId];
    }
  }
}
