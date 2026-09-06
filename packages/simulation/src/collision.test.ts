import assert from "node:assert/strict";
import test from "node:test";
import { createBlankMap } from "../../shared/src/index.js";
import { createUnitState } from "./entities.js";
import {
  CORE_A_STAR_PATHFINDER_ID,
  SOURCE_GREEDY_LOCAL_ADAPTER_PATHFINDER_ID,
  coreAStarPathfinder,
  findPathForUnit,
  sourceGreedyLocalAdapterPathfinder,
} from "./navigation.js";
import { issueCommand } from "./commands.js";
import { registerPathfinder } from "./pathfinderRegistry.js";
import { advanceWorldTick } from "./tick.js";
import { createInitialWorldState, toWorldSnapshot } from "./world.js";
import type { UnitState, WorldState } from "./types.js";

test("pathfinding treats every blocking entity footprint as an obstacle", () => {
  const state = createCollisionState();
  const mover = addUnit(state, "mover", { x: 2, y: 3 });
  addUnit(state, "blocker", { x: 3, y: 3 });

  const path = findPathForUnit(state, mover, { x: 5, y: 3 });

  assert.ok(path);
  assert.equal(path.some((point) => point.x === 3 && point.y === 3), false);
});

test("partial paths still route around mobile footprints", () => {
  const state = createCollisionState();
  const mover = addUnit(state, "mover", { x: 2, y: 3 });
  addUnit(state, "blocker", { x: 3, y: 3 });

  const path = findPathForUnit(state, mover, { x: 5, y: 3 }, { allowPartial: true });

  assert.ok(path);
  assert.equal(path.some((point) => point.x === 3 && point.y === 3), false);
});

test("stable unit order reserves a shared empty waypoint before fractional travel can overlap", () => {
  const state = createCollisionState();
  const first = addUnit(state, "a-first", { x: 1, y: 3 });
  const second = addUnit(state, "b-second", { x: 5, y: 3 });
  const sharedTarget = { x: 3, y: 3 };
  orderMove(first, sharedTarget, 4);
  orderMove(second, sharedTarget, 4);

  advanceWorldTick(state);

  assert.deepEqual(second.movementTarget, { x: 4, y: 3 });
  assert.notDeepEqual(second.movementTarget, sharedTarget);
  assertUniqueGroundContactTiles(state);
});

test("head-on swaps are denied while both source footprints remain occupied", () => {
  const state = createCollisionState();
  const first = addUnit(state, "a-first", { x: 2, y: 3 });
  const second = addUnit(state, "b-second", { x: 3, y: 3 });
  orderMove(first, { x: 3, y: 3 }, 100);
  orderMove(second, { x: 2, y: 3 }, 100);

  advanceWorldTick(state);

  assert.equal(first.position.x === 3 && first.position.y === 3, false);
  assert.equal(second.position.x === 2 && second.position.y === 3, false);
  assertUniqueGroundContactTiles(state);
});

test("a fast follower cannot enter a slow leader's rounded footprint before it actually leaves", () => {
  const state = createCollisionState();
  const leader = addUnit(state, "a-leader", { x: 1, y: 3 });
  const follower = addUnit(state, "b-follower", { x: 0, y: 3 });
  orderMove(leader, { x: 2, y: 3 }, 1);
  orderMove(follower, { x: 1, y: 3 }, 100);

  for (let tick = 0; tick < 12; tick += 1) {
    advanceWorldTick(state);
    assertUniqueGroundContactTiles(state);
    assert.equal(Math.round(follower.position.x) === 1 && Math.round(leader.position.x) === 1, false);
  }
});

test("a blocked waypoint remains pending and re-enters after its blocker is removed", () => {
  const state = createCollisionState();
  const mover = addUnit(state, "mover", { x: 1, y: 3 });
  const blocker = addUnit(state, "blocker", { x: 2, y: 3 });
  orderMove(mover, { x: 2, y: 3 }, 100);

  advanceWorldTick(state);

  assert.deepEqual(mover.position, { x: 1, y: 3 });
  assert.deepEqual(mover.movementTarget, { x: 2, y: 3 });
  assert.equal(mover.movementBlocked, true);
  assert.equal(mover.currentOrder?.type, "move");

  delete state.units[blocker.id];
  advanceWorldTick(state);

  assert.deepEqual(mover.position, { x: 2, y: 3 });
  assert.equal(mover.movementBlocked, undefined);
  assertUniqueGroundContactTiles(state);
});

test("empty mobile-obstruction routes wait without repeated searches across both pathfinders and resume after save/load", () => {
  const profiles = [
    [CORE_A_STAR_PATHFINDER_ID, coreAStarPathfinder],
    [SOURCE_GREEDY_LOCAL_ADAPTER_PATHFINDER_ID, sourceGreedyLocalAdapterPathfinder],
  ] as const;

  for (const [profileId, pathfinder] of profiles) {
    const calls = { count: 0 };
    const countingId = `test:blocked-wait-${profileId.replaceAll(/[^a-z0-9]+/gi, "-")}`;
    registerPathfinder({
      id: countingId,
      findPath(state, unit, target, options) {
        calls.count += 1;
        return pathfinder.findPath(state, unit, target, options);
      },
    });

    const state = createCollisionState();
    state.pathfindingProfileId = countingId;
    const mover = addUnit(state, "mover", { x: 2, y: 3 });
    const blocker = addUnit(state, "blocker", { x: 3, y: 3 });
    blocker.playerId = "p2";

    const result = issueCommand(state, {
      sessionId: "test-session",
      playerId: "p1",
      issuedAtTick: state.tick,
      command: { type: "move", unitId: mover.id, target: blocker.position },
    });
    assert.equal(result.ok, true, profileId);
    assert.equal(mover.movementTarget, undefined);
    assert.equal(mover.navigation?.terminalReason, "mobile-obstruction");
    assert.equal(mover.movementBlocked, true);

    const callsAfterCommand = calls.count;
    for (let tick = 0; tick < 40; tick += 1) {
      advanceWorldTick(state);
      assert.equal(mover.movementTarget, undefined, `${profileId}:tick ${tick}`);
      assert.equal(mover.movementBlocked, true, `${profileId}:tick ${tick}`);
    }
    assert.equal(calls.count, callsAfterCommand, `${profileId}:blocked wait must not retry pathfinding`);

    const restored = JSON.parse(JSON.stringify(toWorldSnapshot(state))) as WorldState;
    delete restored.units[blocker.id];
    for (let tick = 0; tick < 40; tick += 1) {
      advanceWorldTick(restored);
      if (restored.units[mover.id]?.position.x === 3 && restored.units[mover.id]?.position.y === 3) {
        break;
      }
    }
    const restoredMover = restored.units[mover.id]!;
    assert.deepEqual(restoredMover.position, { x: 3, y: 3 }, `${profileId}:resumed destination`);
    assert.equal(restoredMover.movementBlocked, undefined, `${profileId}:resumed movement clears blocked state`);
    assert.equal(restoredMover.currentOrder, undefined, `${profileId}:resumed move completes`);
  }
});

test("a mobile wait does not survive when a static entity replaces its requested goal", () => {
  const state = createCollisionState();
  const mover = addUnit(state, "mover", { x: 2, y: 3 });
  const mobileBlocker = addUnit(state, "mobile-blocker", { x: 3, y: 3 });
  mobileBlocker.playerId = "p2";

  assert.equal(issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: { type: "move", unitId: mover.id, target: mobileBlocker.position },
  }).ok, true);
  advanceWorldTick(state);
  assert.equal(mover.navigation?.terminalReason, "mobile-obstruction");
  assert.equal(mover.movementBlocked, true);

  delete state.units[mobileBlocker.id];
  state.units["static-blocker"] = createUnitState("static-blocker", "p2", "house", { x: 3, y: 3 });
  advanceWorldTick(state);

  assert.notEqual(mover.navigation?.terminalReason, "mobile-obstruction");
  assert.equal(mover.movementBlocked, undefined);
});

test("group movement can replan around claimed waypoints without producing duplicate occupancy", () => {
  const state = createCollisionState();
  const units = [
    addUnit(state, "a", { x: 1, y: 2 }),
    addUnit(state, "b", { x: 1, y: 3 }),
    addUnit(state, "c", { x: 1, y: 4 }),
  ];

  for (const unit of units) {
    orderMove(unit, { x: 6, y: 3 }, 4);
  }

  for (let tick = 0; tick < 12; tick += 1) {
    advanceWorldTick(state);
    assertUniqueGroundContactTiles(state);
  }
});

function createCollisionState(): WorldState {
  const state = createInitialWorldState(createBlankMap({ width: 9, height: 9 }), ["p1"]);
  state.units = {};
  return state;
}

function addUnit(state: WorldState, id: string, position: { x: number; y: number }): UnitState {
  const unit = createUnitState(id, "p1", "villager", position);
  state.units[id] = unit;
  return unit;
}

function orderMove(unit: UnitState, target: { x: number; y: number }, speed: number): void {
  unit.movementSpeed = speed;
  unit.movementTarget = { ...target };
  unit.movementPath = [{ ...target }];
  unit.currentOrder = { type: "move", target: { ...target } };
}

function assertUniqueGroundContactTiles(state: WorldState): void {
  const tiles = Object.values(state.units).map((unit) => `${Math.round(unit.position.x)},${Math.round(unit.position.y)}`);
  assert.equal(new Set(tiles).size, tiles.length, `duplicate occupied tiles: ${tiles.join(" ")}`);
}
