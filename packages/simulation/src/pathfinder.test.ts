import assert from "node:assert/strict";
import test from "node:test";
import { createBlankMap, createImjinrokMapScaffold, getTileIndex, type GridPoint, type ScenarioDefinition } from "../../shared/src/index.js";
import {
  CORE_A_STAR_PATHFINDER_ID,
  SOURCE_GREEDY_ACCEPTED_NODE_LIMIT,
  SOURCE_GREEDY_CANDIDATE_OFFSETS,
  SOURCE_GREEDY_LOCAL_ADAPTER_PATHFINDER_ID,
  PathfinderRegistry,
  createInitialWorldState,
  coreStrictFootprintReservationPolicy,
  findNavigationRouteForUnit,
  findPathForUnit,
  issueCommand,
  registerMovementCollisionPolicy,
  registerPathfinder,
  runSourceGreedyLocalSearch,
  toWorldSnapshot,
  type MovementCollisionPolicy,
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

test("K01 metadata selects the source-greedy local adapter and retains it in snapshots", () => {
  const map = createImjinrokMapScaffold("imjinrok-k01");
  assert.ok(map);

  const state = createInitialWorldState(map, ["p1"]);

  assert.equal(state.pathfindingProfileId, SOURCE_GREEDY_LOCAL_ADAPTER_PATHFINDER_ID);
  assert.equal(toWorldSnapshot(state).pathfindingProfileId, SOURCE_GREEDY_LOCAL_ADAPTER_PATHFINDER_ID);
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

test("mobile blocked goals expose terminal intent without encoding the current tile in an ordinary path", () => {
  for (const profileId of [CORE_A_STAR_PATHFINDER_ID, SOURCE_GREEDY_LOCAL_ADAPTER_PATHFINDER_ID]) {
    const map = createBlankMap({ width: 8, height: 8 });
    map.pathfindingProfileId = profileId;
    const state = createInitialWorldState(map, ["p1", "p2"]);
    state.units = {};
    const attacker = createUnitState("p1-attacker", "p1", "swordsman", { x: 2, y: 2 });
    const target = createUnitState("p2-target", "p2", "villager", { x: 3, y: 2 });
    state.units[attacker.id] = attacker;
    state.units[target.id] = target;

    assert.deepEqual(findPathForUnit(state, attacker, target.position), []);
    assert.deepEqual(findNavigationRouteForUnit(state, attacker, target.position), {
      path: [],
      requestedGoal: target.position,
      resolvedGoal: attacker.position,
      terminalReason: "mobile-obstruction",
    });
    assert.deepEqual(findPathForUnit(state, attacker, attacker.position), []);
    assert.deepEqual(findNavigationRouteForUnit(state, attacker, attacker.position), {
      path: [],
      requestedGoal: attacker.position,
      resolvedGoal: attacker.position,
      terminalReason: "already-at-goal",
    });
  }
});

test("a connected mobile blocker between the mover and target does not make the mover terminal", () => {
  for (const profileId of [CORE_A_STAR_PATHFINDER_ID, SOURCE_GREEDY_LOCAL_ADAPTER_PATHFINDER_ID]) {
    const map = createBlankMap({ width: 16, height: 10 });
    map.pathfindingProfileId = profileId;
    const state = createInitialWorldState(map, ["p1", "p2"]);
    state.units = {};
    const mover = createUnitState("p1-mover", "p1", "swordsman", { x: 8, y: 4 });
    const blocker = createUnitState("p1-blocker", "p1", "swordsman", { x: 9, y: 4 });
    const target = createUnitState("p2-target", "p2", "villager", { x: 10, y: 4 });
    state.units[mover.id] = mover;
    state.units[blocker.id] = blocker;
    state.units[target.id] = target;

    const route = findNavigationRouteForUnit(state, mover, target.position);

    assert.ok(route);
    assert.notDeepEqual(route.path, []);
    assert.equal(route.terminalReason, "mobile-obstruction");
    assert.deepEqual(route.requestedGoal, target.position);
  }
});

test("custom policy preserves exact 2x2 and 3x3 mobile groups at center and map edges", () => {
  registerMovementCollisionPolicy(multiTileMobilePolicy, { replace: true });

  for (const size of [2, 3] as const) {
    for (const origin of [{ x: 5, y: 5 }, { x: 0, y: 0 }] as const) {
      const map = createBlankMap({ width: 12, height: 12 });
      map.pathfindingProfileId = CORE_A_STAR_PATHFINDER_ID;
      map.movementCollisionProfileId = MULTI_TILE_MOBILE_POLICY_ID;
      const state = createInitialWorldState(map, ["p1", "p2"]);
      state.units = {};
      const mover = createUnitState("mover", "p1", "swordsman", { x: 8, y: 5 });
      const blocker = createUnitState(`mobile-target-${size}x${size}`, "p2", "villager", origin);
      state.units[mover.id] = mover;
      state.units[blocker.id] = blocker;
      const group = getMultiTileGroup(blocker, state.map.width, state.map.height);
      const boundary = [...new Set(group.tiles.flatMap((tile) => [
        { x: tile.x + 1, y: tile.y },
        { x: tile.x - 1, y: tile.y },
        { x: tile.x, y: tile.y + 1 },
        { x: tile.x, y: tile.y - 1 },
        { x: tile.x + 1, y: tile.y + 1 },
        { x: tile.x - 1, y: tile.y - 1 },
        { x: tile.x + 1, y: tile.y - 1 },
        { x: tile.x - 1, y: tile.y + 1 },
      ].filter((point) => point.x >= 0 && point.x < map.width && point.y >= 0 && point.y < map.height && !group.tiles.some((groupTile) => groupTile.x === point.x && groupTile.y === point.y)).map(toTileKey)))].map(fromTileKey);

      for (const point of boundary) {
        mover.position = point;
        const route = findNavigationRouteForUnit(state, mover, origin);
        assert.ok(route, `${size}x${size} boundary ${toTileKey(point)}`);
        assert.equal(route.terminalReason, "mobile-obstruction", toTileKey(point));
        assert.deepEqual(route.requestedGoal, origin);
      }
    }
  }
});

test("custom mobile groups route from farther away to their exact boundary without flooding touching blockers", () => {
  registerMovementCollisionPolicy(multiTileMobilePolicy, { replace: true });
  const map = createBlankMap({ width: 16, height: 12 });
  map.pathfindingProfileId = SOURCE_GREEDY_LOCAL_ADAPTER_PATHFINDER_ID;
  map.movementCollisionProfileId = MULTI_TILE_MOBILE_POLICY_ID;
  const state = createInitialWorldState(map, ["p1", "p2"]);
  state.units = {};
  const mover = createUnitState("mover", "p1", "swordsman", { x: 1, y: 5 });
  const blocker = createUnitState("mobile-target-3x3", "p2", "villager", { x: 6, y: 5 });
  const touching = createUnitState("mobile-touching", "p2", "villager", { x: 8, y: 5 });
  state.units[mover.id] = mover;
  state.units[blocker.id] = blocker;
  state.units[touching.id] = touching;

  const route = findNavigationRouteForUnit(state, mover, blocker.position);

  assert.ok(route);
  assert.ok(route.path.length > 0);
  assert.equal(route.terminalReason, "mobile-obstruction");
  assert.deepEqual(route.resolvedGoal, route.path.at(-1));
  assert.equal(route.path.some((point) => getMultiTileGroup(touching, map.width, map.height).tiles.some((tile) => tile.x === point.x && tile.y === point.y)), false);
});

test("both pathfinders reject non-monotonic and inconsistent blocker-group views before mutation", () => {
  const modes = [
    {
      name: "non-monotonic aggregate",
      error: /non-monotonic blocking view/,
      requested: { x: 4, y: 4 },
      makePolicy: createConsistencyPolicy("non-monotonic", "non-monotonic"),
    },
    {
      name: "classification mismatch",
      error: /invalid blocking group/,
      requested: { x: 4, y: 4 },
      makePolicy: createConsistencyPolicy("classification-mismatch", "classification-mismatch"),
    },
    {
      name: "group tile absent from aggregate",
      error: /absent from its applicable aggregate/,
      requested: { x: 4, y: 4 },
      makePolicy: createConsistencyPolicy("missing-tile", "missing-tile"),
    },
    {
      name: "touching tile changes group identity",
      error: /inconsistent blocker group identity/,
      requested: { x: 4, y: 4 },
      makePolicy: createConsistencyPolicy("touching-identity", "touching-identity"),
    },
  ] as const;

  for (const profile of modes) {
    registerMovementCollisionPolicy(profile.makePolicy, { replace: true });

    for (const pathfindingProfileId of [CORE_A_STAR_PATHFINDER_ID, SOURCE_GREEDY_LOCAL_ADAPTER_PATHFINDER_ID]) {
      const map = createBlankMap({ width: 12, height: 12 });
      map.pathfindingProfileId = pathfindingProfileId;
      map.movementCollisionProfileId = profile.makePolicy.id;
      const state = createInitialWorldState(map, ["p1"]);
      state.units = {};
      const mover = createUnitState(`mover-${profile.name}-${pathfindingProfileId}`, "p1", "swordsman", { x: 2, y: 4 });
      state.units[mover.id] = mover;

      assert.throws(
        () => findNavigationRouteForUnit(state, mover, profile.requested),
        profile.error,
        `${profile.name}:${pathfindingProfileId}`,
      );
      assert.equal(mover.currentOrder, undefined);
      assert.equal(mover.navigation, undefined);
      assert.equal(mover.movementPath, undefined);
      assert.equal(mover.movementTarget, undefined);

      assert.throws(() => issueCommand(state, {
        sessionId: "test-session",
        playerId: "p1",
        issuedAtTick: state.tick,
        command: { type: "move", unitId: mover.id, target: profile.requested },
      }), profile.error);
      assert.equal(mover.currentOrder, undefined);
      assert.equal(mover.navigation, undefined);
      assert.equal(mover.movementPath, undefined);
      assert.equal(mover.movementTarget, undefined);
    }
  }
});

test("mobile occupancy does not override terrain, resource, or static collision denial", () => {
  for (const profileId of [CORE_A_STAR_PATHFINDER_ID, SOURCE_GREEDY_LOCAL_ADAPTER_PATHFINDER_ID]) {
    for (const denial of ["terrain", "resource", "static"] as const) {
      const map = createBlankMap({ width: 12, height: 10 });
      map.pathfindingProfileId = profileId;
      const state = createInitialWorldState(map, ["p1", "p2"]);
      state.units = {};
      const mover = createUnitState("p1-mover", "p1", "swordsman", { x: 2, y: 4 });
      const target = { x: 3, y: 4 };
      state.units[mover.id] = mover;

      if (denial === "terrain") {
        state.map.layers[0]!.tiles[getTileIndex(map.width, target.x, target.y)]!.terrain = "forest";
      } else if (denial === "resource") {
        state.map.layers[0]!.tiles[getTileIndex(map.width, target.x, target.y)]!.resource = {
          id: "blocked-tree",
          kind: "tree",
          amount: 100,
        };
      } else {
        const building = createUnitState("p1-building", "p1", "town-center", target);
        state.units[building.id] = building;
      }

      const withoutMobile = findNavigationRouteForUnit(state, mover, target);
      state.units["p2-mobile"] = createUnitState("p2-mobile", "p2", "villager", target);
      const withMobile = findNavigationRouteForUnit(state, mover, target);

      assert.deepEqual(withMobile?.path, withoutMobile?.path, denial);
      assert.notEqual(withMobile?.terminalReason, "mobile-obstruction", denial);
    }
  }
});

test("the selected collision policy owns custom denial precedence over mobile occupancy", () => {
  const profileId = "test:custom-static-denial";
  registerMovementCollisionPolicy({
    ...coreStrictFootprintReservationPolicy,
    id: profileId,
    getEntityBlockingTiles(state, excludedUnitId, includeMobile = true) {
      const blocked = coreStrictFootprintReservationPolicy.getEntityBlockingTiles(state, excludedUnitId, includeMobile);
      blocked.add("3,4");
      return blocked;
    },
    getBlockingGroupAtTile(state, excludedUnitId, tile, includeMobile = true) {
      if (tile.x === 3 && tile.y === 4) {
        return { id: "custom-static", classification: "static", tiles: [{ x: 3, y: 4 }] };
      }

      return coreStrictFootprintReservationPolicy.getBlockingGroupAtTile(state, excludedUnitId, tile, includeMobile);
    },
  });

  const map = createBlankMap({ width: 12, height: 10 });
  map.movementCollisionProfileId = profileId;
  map.pathfindingProfileId = CORE_A_STAR_PATHFINDER_ID;
  const state = createInitialWorldState(map, ["p1", "p2"]);
  state.units = {};
  const mover = createUnitState("p1-mover", "p1", "swordsman", { x: 2, y: 4 });
  state.units[mover.id] = mover;

  const withoutMobile = findNavigationRouteForUnit(state, mover, { x: 3, y: 4 });
  state.units["p2-mobile"] = createUnitState("p2-mobile", "p2", "villager", { x: 3, y: 4 });
  const withMobile = findNavigationRouteForUnit(state, mover, { x: 3, y: 4 });

  assert.deepEqual(withMobile?.path, withoutMobile?.path);
  assert.notEqual(withMobile?.terminalReason, "mobile-obstruction");
});

test("source-greedy local adapter preserves the recovered candidate order and strict-score local boundary", () => {
  assert.equal(SOURCE_GREEDY_ACCEPTED_NODE_LIMIT, 6_000);
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
    const result = runSourceGreedyLocalSearch(state, unit, unit.position, target, new Set([key(target)]), new Set(), SOURCE_GREEDY_ACCEPTED_NODE_LIMIT);
    assert.equal(result.frontierCapacity, capacity);
  }

  const capped = runSourceGreedyLocalSearch(state, unit, unit.position, { x: 0, y: 1 }, new Set(["0,1"]), new Set(), SOURCE_GREEDY_ACCEPTED_NODE_LIMIT);
  assert.equal(capped.reachedGoal, false);
  assert.equal(capped.frontierCapacity, 80);
  assert.equal(capped.maximumFrontierSize, 80);
  assert.ok(capped.acceptedNodes <= SOURCE_GREEDY_ACCEPTED_NODE_LIMIT);

  const acceptedBudget = runSourceGreedyLocalSearch(state, unit, unit.position, { x: 0, y: 1 }, new Set(["0,1"]), new Set(), 3);
  assert.equal(acceptedBudget.acceptedNodes, 3);

  const insertedGoal = runSourceGreedyLocalSearch(state, unit, unit.position, { x: 31, y: 31 }, new Set(["31,31"]), new Set(), SOURCE_GREEDY_ACCEPTED_NODE_LIMIT);
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

test("source-greedy local adapter stops on an accepted no-progress trace instead of cycling", () => {
  const state = createSourceGreedyState({ width: 8, height: 8 });
  const unit = state.units["p1-villager-1"]!;
  unit.position = { x: 4, y: 2 };

  for (let y = 3; y <= 5; y += 1) {
    for (let x = 3; x <= 5; x += 1) {
      if (x !== 4 || y !== 4) {
        state.map.layers[0]!.tiles[getTileIndex(state.map.width, x, y)]!.terrain = "forest";
      }
    }
  }

  const local = runSourceGreedyLocalSearch(
    state,
    unit,
    unit.position,
    { x: 4, y: 4 },
    new Set(["4,4"]),
    new Set(),
    SOURCE_GREEDY_ACCEPTED_NODE_LIMIT,
  );

  assert.ok(local.acceptedNodes > 0);
  assert.deepEqual(local.insertionParentTrace, [{ x: 4, y: 2 }]);
  assert.equal(findPathForUnit(state, unit, { x: 4, y: 4 }, { allowPartial: true }), null);
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

const MULTI_TILE_MOBILE_POLICY_ID = "test:multi-tile-mobile";

type ConsistencyPolicyMode = "non-monotonic" | "classification-mismatch" | "missing-tile" | "touching-identity";

function createConsistencyPolicy(name: string, mode: ConsistencyPolicyMode): MovementCollisionPolicy {
  const requested = { x: 4, y: 4 };
  const touching = { x: 5, y: 4 };
  const requestedKey = toTileKey(requested);
  const touchingKey = toTileKey(touching);

  return {
    ...coreStrictFootprintReservationPolicy,
    id: `test:group-consistency-${name}`,
    getEntityBlockingTiles(_state, _excludedUnitId, includeMobile = true) {
      if (mode === "non-monotonic") {
        return includeMobile ? new Set() : new Set([requestedKey]);
      }

      if (mode === "missing-tile") {
        return new Set([requestedKey]);
      }

      return new Set([requestedKey, touchingKey]);
    },
    getBlockingGroupAtTile(_state, _excludedUnitId, tile) {
      const key = toTileKey(tile);

      if (mode === "classification-mismatch") {
        return { id: "mismatch", classification: "mobile", tiles: [{ ...requested }] };
      }

      if (mode === "missing-tile") {
        return { id: "missing", classification: "static", tiles: [{ ...requested }, { x: 5, y: 5 }] };
      }

      if (mode === "touching-identity" && key === touchingKey) {
        return { id: "other-group", classification: "static", tiles: [{ ...touching }] };
      }

      return {
        id: mode === "touching-identity" ? "requested-group" : mode,
        classification: "static",
        tiles: mode === "touching-identity" ? [{ ...requested }, { ...touching }] : [{ ...requested }],
      };
    },
  };
}

const multiTileMobilePolicy: MovementCollisionPolicy = {
  ...coreStrictFootprintReservationPolicy,
  id: MULTI_TILE_MOBILE_POLICY_ID,
  getEntityBlockingTiles(state, excludedUnitId, includeMobile = true) {
    const blocked = coreStrictFootprintReservationPolicy.getEntityBlockingTiles(state, excludedUnitId, includeMobile);

    if (includeMobile) {
      for (const unit of Object.values(state.units)) {
        if (unit.id !== excludedUnitId && unit.id.startsWith("mobile-target-")) {
          for (const tile of getMultiTileGroup(unit, state.map.width, state.map.height).tiles) {
            blocked.add(toTileKey(tile));
          }
        }
      }
    }

    return blocked;
  },
  getBlockingGroupAtTile(state, excludedUnitId, tile, includeMobile = true) {
    if (includeMobile) {
      for (const unit of Object.values(state.units)) {
        const group = getMultiTileGroup(unit, state.map.width, state.map.height);
        if (unit.id !== excludedUnitId && unit.id.startsWith("mobile-target-") && group.tiles.some((groupTile) => groupTile.x === tile.x && groupTile.y === tile.y)) {
          return { id: unit.id, classification: "mobile", tiles: group.tiles };
        }
      }
    }

    return coreStrictFootprintReservationPolicy.getBlockingGroupAtTile(state, excludedUnitId, tile, includeMobile);
  },
};

function getMultiTileGroup(unit: { id: string; position: GridPoint }, width: number, height: number): { id: string; tiles: GridPoint[] } {
  const size = unit.id.includes("3x3") ? 3 : 2;
  const tiles: GridPoint[] = [];

  for (let y = unit.position.y; y < unit.position.y + size; y += 1) {
    for (let x = unit.position.x; x < unit.position.x + size; x += 1) {
      if (x >= 0 && x < width && y >= 0 && y < height) {
        tiles.push({ x, y });
      }
    }
  }

  return { id: unit.id, tiles };
}

function fromTileKey(tileKey: string): GridPoint {
  const [x, y] = tileKey.split(",").map(Number);
  return { x, y };
}

function toTileKey(point: GridPoint): string {
  return `${point.x},${point.y}`;
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
