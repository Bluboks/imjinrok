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
  const state = createResourceState("rice", 3);
  const beforeFood = state.playerResources.p1!.food;

  assert.equal(issueGather(state, "rice-node"), true);
  runTicks(state, 10);

  assert.equal(getTileAt(state.map, RESOURCE_POINT.x, RESOURCE_POINT.y).resource, undefined);
  assert.equal(state.playerResources.p1!.food, beforeFood + 3);
});

test("gathering tree decreases amount and increases wood", () => {
  const state = createResourceState("tree", 5);
  const beforeWood = state.playerResources.p1!.wood;
  state.units["p1-villager-1"]!.position = { x: 6, y: 5 };

  assert.equal(issueGather(state, "tree-node"), true);
  runTicks(state, 2);

  const resource = getTileAt(state.map, RESOURCE_POINT.x, RESOURCE_POINT.y).resource!;
  assert.equal(resource.amount, 3);
  assert.equal(state.playerResources.p1!.wood, beforeWood + 2);
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

function createResourceState(kind: ResourceDefinitionId, amount: number, extra: Partial<ResourceNode> = {}, weather: "clear" | "rain" = "clear") {
  const map = createBlankMap({ width: 12, height: 12 });
  map.environment = { weather };
  placeResource(map, { id: `${kind}-node`, kind, amount, ...extra });
  const state = createInitialWorldState(map, ["p1"]);
  keepOnlyUnit(state, "p1-villager-1");
  state.units["p1-villager-1"]!.position = { x: 4, y: 5 };
  return state;
}

function placeResource(map: MapDefinition, resource: ResourceNode): void {
  map.layers[0]!.tiles[getTileIndex(map.width, RESOURCE_POINT.x, RESOURCE_POINT.y)]!.resource = resource;
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
  for (const unitId of Object.keys(state.units)) {
    if (unitId !== keptUnitId) {
      delete state.units[unitId];
    }
  }
}
