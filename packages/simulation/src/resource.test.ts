import test from "node:test";
import assert from "node:assert/strict";
import { createBlankMap, defaultMap, getTileAt, getTileIndex, type MapDefinition, type ResourceDefinitionId, type ResourceNode } from "../../shared/src/index.js";
import {
  advanceWorldTick,
  createInitialWorldState,
  getResourceNodeState,
  isResourceHarvestable,
  isTilePassableForUnit,
  issueCommand,
  toWorldSnapshot,
  validateBuildingPlacement,
} from "./index.js";
import { createUnitState } from "./entities.js";

test("resource occupancy affects terrain passability and building placement", () => {
  const cases = [
    { kind: "rice", activePassable: true, activeBuildable: false, depletedRemoved: true, depletedPassable: true, depletedBuildable: true },
    { kind: "potato", activePassable: true, activeBuildable: false, depletedRemoved: false, depletedPassable: true, depletedBuildable: false },
    { kind: "tree", activePassable: false, activeBuildable: false, depletedRemoved: true, depletedPassable: true, depletedBuildable: true },
    { kind: "bamboo", activePassable: false, activeBuildable: false, depletedRemoved: false, depletedPassable: true, depletedBuildable: false },
  ] as const;

  for (const resourceCase of cases) {
    const state = createResourceState(resourceCase.kind, 1);
    const unit = state.units["p1-villager-1"]!;
    unit.position = { x: 1, y: 1 };

    assert.equal(isTilePassableForUnit(state, unit, RESOURCE_POINT), resourceCase.activePassable, resourceCase.kind);
    assert.equal(validateBuildingPlacement(state, "house", RESOURCE_POINT).ok, resourceCase.activeBuildable, resourceCase.kind);

    drainResource(state, `${resourceCase.kind}-node`);
    unit.position = { x: 1, y: 1 };

    assert.equal(getTileAt(state.map, RESOURCE_POINT.x, RESOURCE_POINT.y).resource === undefined, resourceCase.depletedRemoved, resourceCase.kind);
    assert.equal(isTilePassableForUnit(state, unit, RESOURCE_POINT), resourceCase.depletedPassable, resourceCase.kind);
    assert.equal(validateBuildingPlacement(state, "house", RESOURCE_POINT).ok, resourceCase.depletedBuildable, resourceCase.kind);
  }
});

test("rain ticks regrow potato and bamboo depleted nodes", () => {
  for (const kind of ["potato", "bamboo"] as const) {
    const state = createResourceState(kind, 0, { state: "depleted", regrowTicks: 599 }, "rain");
    const unit = state.units["p1-villager-1"]!;
    unit.position = { x: 1, y: 1 };

    assert.equal(getResourceNodeState(getTileAt(state.map, RESOURCE_POINT.x, RESOURCE_POINT.y).resource!), "depleted");

    advanceWorldTick(state);

    const resource = getTileAt(state.map, RESOURCE_POINT.x, RESOURCE_POINT.y).resource!;
    assert.equal(getResourceNodeState(resource), "active");
    assert.equal(resource.amount, 100);
    assert.equal(isTilePassableForUnit(state, unit, RESOURCE_POINT), kind === "potato");
  }
});

test("gathering rice removes depleted tile resource and increases food", () => {
  const state = createResourceState("rice", 3, {}, "clear", true);
  const beforeFood = state.playerResources.p1!.food;

  assert.equal(issueGather(state, "rice-node"), true);
  runTicks(state, 80);

  assert.equal(getTileAt(state.map, RESOURCE_POINT.x, RESOURCE_POINT.y).resource, undefined);
  assert.equal(state.playerResources.p1!.food, beforeFood + 3);
  assert.equal(state.units["p1-villager-1"]!.carriedResource, undefined);
});

test("workers retarget to a nearby same-bank resource after depleting and dropping off", () => {
  const map = createBlankMap({ width: 12, height: 12 });
  placeResourceAt(map, RESOURCE_POINT, { id: "rice-node", kind: "rice", amount: 2 });
  placeResourceAt(map, { x: 8, y: 5 }, { id: "rice-node-2", kind: "rice", amount: 20 });
  const state = createInitialWorldState(map, ["p1"]);
  keepUnits(state, ["p1-villager-1", "p1-town-center"]);
  state.units["p1-town-center"]!.position = { x: 2, y: 2 };
  state.units["p1-villager-1"]!.position = { x: 6, y: 5 };

  assert.equal(issueGather(state, "rice-node"), true);
  runTicks(state, 80);

  const worker = state.units["p1-villager-1"]!;

  assert.equal(getTileAt(state.map, RESOURCE_POINT.x, RESOURCE_POINT.y).resource, undefined);
  assert.equal(worker.currentOrder?.type, "gather");
  assert.equal(worker.currentOrder?.resourceId, "rice-node-2");
  assert.ok(worker.movementTarget || worker.carriedResource);
});

test("workers do not retarget to distant same-bank resources after depletion", () => {
  const map = createBlankMap({ width: 32, height: 32 });
  placeResourceAt(map, RESOURCE_POINT, { id: "rice-node", kind: "rice", amount: 2 });
  placeResourceAt(map, { x: 26, y: 26 }, { id: "distant-rice-node", kind: "rice", amount: 20 });
  const state = createInitialWorldState(map, ["p1"]);
  keepUnits(state, ["p1-villager-1", "p1-town-center"]);
  state.units["p1-town-center"]!.position = { x: 2, y: 2 };
  state.units["p1-villager-1"]!.position = { x: 6, y: 5 };

  assert.equal(issueGather(state, "rice-node"), true);
  runTicks(state, 120);

  const worker = state.units["p1-villager-1"]!;

  assert.equal(getTileAt(state.map, RESOURCE_POINT.x, RESOURCE_POINT.y).resource, undefined);
  assert.equal(worker.currentOrder, undefined);
  assert.equal(getTileAt(state.map, 26, 26).resource?.id, "distant-rice-node");
});

test("workers skip unreachable same-bank resources when retargeting after depletion", () => {
  const map = createBlankMap({ width: 12, height: 12 });
  placeResourceAt(map, RESOURCE_POINT, { id: "rice-node", kind: "rice", amount: 2 });
  placeResourceAt(map, { x: 7, y: 3 }, { id: "blocked-rice-node", kind: "rice", amount: 20 });
  placeResourceAt(map, { x: 2, y: 8 }, { id: "reachable-rice-node", kind: "rice", amount: 20 });
  surroundTileWithWater(map, { x: 7, y: 3 });
  const state = createInitialWorldState(map, ["p1"]);
  keepUnits(state, ["p1-villager-1", "p1-town-center"]);
  state.units["p1-town-center"]!.position = { x: 2, y: 2 };
  state.units["p1-villager-1"]!.position = { x: 6, y: 5 };

  assert.equal(issueGather(state, "rice-node"), true);
  runTicks(state, 100);

  const worker = state.units["p1-villager-1"]!;

  assert.equal(getTileAt(state.map, RESOURCE_POINT.x, RESOURCE_POINT.y).resource, undefined);
  assert.equal(worker.currentOrder?.type, "gather");
  assert.equal(worker.currentOrder?.resourceId, "reachable-rice-node");
  assert.ok(worker.movementTarget || worker.carriedResource);
});

test("gathering tree decreases amount, fills cargo, and deposits at a dropoff", () => {
  const state = createResourceState("tree", 5, {}, "clear", true);
  const beforeWood = state.playerResources.p1!.wood;
  state.units["p1-villager-1"]!.position = { x: 6, y: 5 };

  assert.equal(issueGather(state, "tree-node"), true);
  runTicks(state, 2);

  const resource = getTileAt(state.map, RESOURCE_POINT.x, RESOURCE_POINT.y).resource!;
  assert.equal(resource.amount, 3);
  assert.deepEqual(state.units["p1-villager-1"]!.carriedResource, { kind: "wood", amount: 2 });
  assert.equal(state.playerResources.p1!.wood, beforeWood);

  runTicks(state, 80);

  assert.equal(getTileAt(state.map, RESOURCE_POINT.x, RESOURCE_POINT.y).resource, undefined);
  assert.equal(state.units["p1-villager-1"]!.carriedResource, undefined);
  assert.equal(state.playerResources.p1!.wood, beforeWood + 5);
});

test("workers skip unreachable dropoffs when returning carried resources", () => {
  const map = createBlankMap({ width: 16, height: 12 });

  for (let y = 0; y < map.height; y += 1) {
    map.layers[0]!.tiles[getTileIndex(map.width, 6, y)] = {
      terrain: "water",
      elevation: 0,
    };
  }

  const state = createInitialWorldState(map, ["p1"]);
  keepUnits(state, ["p1-villager-1", "p1-town-center"]);
  const worker = state.units["p1-villager-1"]!;
  const reachableDropoff = state.units["p1-town-center"]!;
  const blockedDropoff = createUnitState("p1-blocked-town-center", "p1", "town-center", { x: 8, y: 8 });
  const beforeFood = state.playerResources.p1!.food;

  worker.position = { x: 4, y: 8 };
  worker.currentOrder = { type: "gather", resourceId: "missing-rice-node", target: { x: 4, y: 8 } };
  worker.carriedResource = { kind: "food", amount: 5 };
  reachableDropoff.position = { x: 2, y: 2 };
  state.units[blockedDropoff.id] = blockedDropoff;

  runTicks(state, 80);

  assert.equal(worker.carriedResource, undefined);
  assert.equal(state.playerResources.p1!.food, beforeFood + 5);
  assert.notDeepEqual(worker.position, { x: 8, y: 8 });
});

test("workers keep gather orders and reroute when the next waypoint becomes blocked", () => {
  const map = createBlankMap({ width: 12, height: 12 });
  placeResourceAt(map, { x: 8, y: 5 }, { id: "rice-node", kind: "rice", amount: 20 });
  const state = createInitialWorldState(map, ["p1"]);
  keepOnlyUnit(state, "p1-villager-1");
  const worker = state.units["p1-villager-1"]!;
  worker.position = { x: 2, y: 5 };

  assert.equal(issueGather(state, "rice-node"), true);
  assert.ok(worker.movementTarget);
  const blockedWaypoint = { x: Math.round(worker.movementTarget.x), y: Math.round(worker.movementTarget.y) };
  state.map.layers[0]!.tiles[getTileIndex(state.map.width, blockedWaypoint.x, blockedWaypoint.y)] = {
    terrain: "water",
    elevation: 0,
  };

  advanceWorldTick(state);

  const order = worker.currentOrder;
  assert.equal(order?.type, "gather");
  if (order?.type !== "gather") {
    assert.fail("expected worker to keep gather order");
  }
  assert.equal(order.resourceId, "rice-node");
  assert.ok(worker.movementTarget);
  assert.notDeepEqual(
    { x: Math.round(worker.movementTarget.x), y: Math.round(worker.movementTarget.y) },
    blockedWaypoint,
  );
});

test("workers keep carried resources and resume dropoff after a dropoff is rebuilt", () => {
  const map = createBlankMap({ width: 12, height: 12 });
  placeResourceAt(map, RESOURCE_POINT, { id: "rice-node", kind: "rice", amount: 10 });
  const state = createInitialWorldState(map, ["p1"]);
  keepUnits(state, ["p1-villager-1", "p1-town-center"]);
  const worker = state.units["p1-villager-1"]!;
  const beforeFood = state.playerResources.p1!.food;

  state.units["p1-town-center"]!.position = { x: 2, y: 2 };
  worker.position = { ...RESOURCE_POINT };

  assert.equal(issueGather(state, "rice-node"), true);
  runTicks(state, 2);
  assert.deepEqual(worker.carriedResource, { kind: "food", amount: 2 });

  delete state.units["p1-town-center"];
  runTicks(state, 30);

  assert.equal(worker.currentOrder?.type, "gather");
  assert.deepEqual(worker.carriedResource, { kind: "food", amount: 10 });
  assert.equal(state.playerResources.p1!.food, beforeFood);

  state.units["p1-rebuilt-town-center"] = createUnitState("p1-rebuilt-town-center", "p1", "town-center", { x: 2, y: 2 });
  runTicks(state, 80);

  assert.equal(worker.carriedResource, undefined);
  assert.equal(state.playerResources.p1!.food, beforeFood + 10);
});

test("legacy resource nodes without explicit state derive active and depleted state from amount", () => {
  const activeLegacy = { id: "legacy-active", kind: "rice", amount: 1 } satisfies ResourceNode;
  const depletedLegacy = { id: "legacy-depleted", kind: "rice", amount: 0 } satisfies ResourceNode;

  assert.equal(getResourceNodeState(activeLegacy), "active");
  assert.equal(isResourceHarvestable(activeLegacy), true);
  assert.equal(getResourceNodeState(depletedLegacy), "depleted");
  assert.equal(isResourceHarvestable(depletedLegacy), false);
});

test("gathering resources in world state does not mutate the source map", () => {
  const map = createBlankMap({ width: 12, height: 12 });
  placeResource(map, { id: "rice-node", kind: "rice", amount: 2 });
  const state = createInitialWorldState(map, ["p1"]);
  keepOnlyUnit(state, "p1-villager-1");
  state.units["p1-villager-1"]!.position = { x: 4, y: 5 };

  assert.equal(issueGather(state, "rice-node"), true);
  runTicks(state, 10);

  assert.equal(getTileAt(state.map, RESOURCE_POINT.x, RESOURCE_POINT.y).resource, undefined);
  assert.deepEqual(getTileAt(map, RESOURCE_POINT.x, RESOURCE_POINT.y).resource, { id: "rice-node", kind: "rice", amount: 2 });
});

test("world snapshots include cloned map resource changes", () => {
  const state = createResourceState("rice", 2);

  assert.equal(issueGather(state, "rice-node"), true);
  runTicks(state, 10);

  const snapshot = toWorldSnapshot(state);
  const stateResource = getTileAt(state.map, RESOURCE_POINT.x, RESOURCE_POINT.y).resource;
  const snapshotResource = getTileAt(snapshot.map, RESOURCE_POINT.x, RESOURCE_POINT.y).resource;

  assert.deepEqual(snapshotResource, stateResource);
  assert.equal(snapshotResource, undefined);
  assert.notEqual(snapshot.map, state.map);
});

test("default demo map includes placeholder resource nodes", () => {
  const resourceKinds = new Set<string>();
  const resourceIds = new Set<string>();

  for (const layer of defaultMap.layers) {
    for (const tile of layer.tiles) {
      if (!tile.resource) {
        continue;
      }

      resourceKinds.add(tile.resource.kind);
      assert.equal(resourceIds.has(tile.resource.id), false, `duplicate resource id ${tile.resource.id}`);
      resourceIds.add(tile.resource.id);
    }
  }

  assert.deepEqual([...resourceKinds].sort(), ["bamboo", "potato", "rice", "tree"]);
  assert.equal(resourceIds.size, 36);
});

const RESOURCE_POINT = { x: 5, y: 5 } as const;

function createResourceState(
  kind: ResourceDefinitionId,
  amount: number,
  extra: Partial<ResourceNode> = {},
  weather: "clear" | "rain" = "clear",
  keepDropoff = false,
) {
  const map = createBlankMap({ width: 12, height: 12 });
  map.environment = { weather };
  placeResource(map, { id: `${kind}-node`, kind, amount, ...extra });
  const state = createInitialWorldState(map, ["p1"]);
  if (keepDropoff) {
    keepUnits(state, ["p1-villager-1", "p1-town-center"]);
    state.units["p1-town-center"]!.position = { x: 2, y: 2 };
  } else {
    keepOnlyUnit(state, "p1-villager-1");
  }
  state.units["p1-villager-1"]!.position = { x: 6, y: 5 };
  return state;
}

function placeResource(map: MapDefinition, resource: ResourceNode): void {
  placeResourceAt(map, RESOURCE_POINT, resource);
}

function placeResourceAt(map: MapDefinition, point: { x: number; y: number }, resource: ResourceNode): void {
  map.layers[0]!.tiles[getTileIndex(map.width, point.x, point.y)]!.resource = resource;
}

function surroundTileWithWater(map: MapDefinition, point: { x: number; y: number }): void {
  for (let y = point.y - 1; y <= point.y + 1; y += 1) {
    for (let x = point.x - 1; x <= point.x + 1; x += 1) {
      if (x === point.x && y === point.y) {
        continue;
      }

      const tile = map.layers[0]?.tiles[getTileIndex(map.width, x, y)];

      if (tile) {
        tile.terrain = "water";
      }
    }
  }
}

function drainResource(state: ReturnType<typeof createInitialWorldState>, resourceId: string): void {
  state.units["p1-villager-1"]!.position = { x: 6, y: 5 };
  assert.equal(issueGather(state, resourceId), true);
  runTicks(state, 20);
}

function issueGather(state: ReturnType<typeof createInitialWorldState>, resourceId: string): boolean {
  return issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: { type: "gather", unitId: "p1-villager-1", resourceId },
  }).ok;
}

function runTicks(state: ReturnType<typeof createInitialWorldState>, count: number): void {
  for (let tick = 0; tick < count; tick += 1) {
    advanceWorldTick(state);
  }
}

function keepOnlyUnit(state: ReturnType<typeof createInitialWorldState>, keptUnitId: string): void {
  keepUnits(state, [keptUnitId]);
}

function keepUnits(state: ReturnType<typeof createInitialWorldState>, keptUnitIds: readonly string[]): void {
  const keptUnitIdSet = new Set(keptUnitIds);

  for (const unitId of Object.keys(state.units)) {
    if (!keptUnitIdSet.has(unitId)) {
      delete state.units[unitId];
    }
  }
}
