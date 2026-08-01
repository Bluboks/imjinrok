import assert from "node:assert/strict";
import test from "node:test";
import { createBlankMap } from "../../shared/src/index.js";
import {
  CORE_STRICT_FOOTPRINT_RESERVATION_POLICY_ID,
  coreStrictFootprintReservationPolicy,
  MovementCollisionPolicyRegistry,
  createInitialWorldState,
  findNavigationRouteForUnit,
  findPathForUnit,
  registerMovementCollisionPolicy,
  toWorldSnapshot,
  type MovementCollisionPolicy,
  type WorldState,
} from "./index.js";
import { createUnitState } from "./entities.js";
import { advanceWorldTick } from "./tick.js";

const DETERMINISTIC_MOD_POLICY_ID = "test:deterministic-center-deny";
const DENIED_TILE = { x: 3, y: 3 };

test("a map-selected deterministic collision policy controls source-greedy routing and movement admission", () => {
  registerMovementCollisionPolicy(deterministicCenterDenyPolicy);

  const map = createBlankMap({ width: 8, height: 8 });
  map.pathfindingProfileId = "imjinrok:source-greedy-local-adapter";
  map.movementCollisionProfileId = DETERMINISTIC_MOD_POLICY_ID;
  const state = createInitialWorldState(map, ["p1"]);
  state.units = {};
  const mover = addUnit(state, "mover", { x: 1, y: 3 });

  assert.equal(state.movementCollisionProfileId, DETERMINISTIC_MOD_POLICY_ID);
  assert.equal(toWorldSnapshot(state).movementCollisionProfileId, DETERMINISTIC_MOD_POLICY_ID);

  const route = findPathForUnit(state, mover, { x: 5, y: 3 });
  assert.ok(route);
  assert.equal(route.some((point) => point.x === DENIED_TILE.x && point.y === DENIED_TILE.y), false);

  mover.movementSpeed = 100;
  mover.movementTarget = { ...DENIED_TILE };
  mover.movementPath = [{ ...DENIED_TILE }];
  mover.currentOrder = { type: "move", target: { ...DENIED_TILE } };

  advanceWorldTick(state);

  assert.deepEqual(mover.position, { x: 1, y: 3 });
  assert.deepEqual(mover.movementTarget, DENIED_TILE);
});

test("collision policy registry rejects duplicate, blank, and unknown stable ids", () => {
  const registry = new MovementCollisionPolicyRegistry();
  registry.register(deterministicCenterDenyPolicy);

  assert.deepEqual(registry.ids(), [DETERMINISTIC_MOD_POLICY_ID]);
  assert.throws(() => registry.register(deterministicCenterDenyPolicy), /already registered/);
  assert.throws(() => registry.require("missing:collision"), /Unknown movement collision profile/);
  assert.throws(() => registry.register({ ...deterministicCenterDenyPolicy, id: "" }), /must not be empty/);
});

test("legacy snapshots without a collision id retain the strict footprint default", () => {
  const map = createBlankMap({ width: 8, height: 8 });
  const state = createInitialWorldState(map, ["p1"]);
  state.units = {};
  const mover = addUnit(state, "mover", { x: 1, y: 3 });
  const blocker = addUnit(state, "blocker", { x: 2, y: 3 });

  delete state.movementCollisionProfileId;

  assert.equal(state.movementCollisionProfileId, undefined);
  assert.equal(findPathForUnit(state, mover, { x: 4, y: 3 })?.some((point) => point.x === blocker.position.x && point.y === blocker.position.y), false);
  assert.equal(CORE_STRICT_FOOTPRINT_RESERVATION_POLICY_ID, "core:strict-footprint-reservation");
});

test("strict policy exposes deterministic exact groups and honors mobile filtering", () => {
  const state = createInitialWorldState(createBlankMap({ width: 8, height: 8 }), ["p1", "p2"]);
  state.units = {};
  const mover = addUnit(state, "mover", { x: 1, y: 3 });
  const mobile = createUnitState("mobile", "p2", "villager", { x: 3, y: 3 });
  const staticUnit = createUnitState("static", "p2", "house", { x: 5, y: 3 });
  state.units[mobile.id] = mobile;
  state.units[staticUnit.id] = staticUnit;
  const policy = coreStrictFootprintReservationPolicy;

  assert.equal(policy.getBlockingGroupAtTile(state, mover.id, { x: 3, y: 3 }, false), null);
  assert.deepEqual(policy.getBlockingGroupAtTile(state, mover.id, { x: 3, y: 3 }, true), {
    id: mobile.id,
    classification: "mobile",
    tiles: [{ x: 3, y: 3 }],
  });
  assert.equal(policy.getBlockingGroupAtTile(state, mover.id, { x: 5, y: 3 }, false)?.classification, "static");
});

test("malformed or missing blocker groups fail explicitly instead of falling back", () => {
  const profileId = "test:invalid-blocking-group";
  registerMovementCollisionPolicy({
    ...coreStrictFootprintReservationPolicy,
    id: profileId,
    getBlockingGroupAtTile() {
      return { id: "bad", classification: "mobile", tiles: [{ x: 3, y: 3 }, { x: 3, y: 3 }] };
    },
  });
  const map = createBlankMap({ width: 8, height: 8 });
  map.movementCollisionProfileId = profileId;
  const state = createInitialWorldState(map, ["p1", "p2"]);
  state.units = {};
  const mover = addUnit(state, "mover", { x: 1, y: 3 });
  state.units.blocker = createUnitState("blocker", "p2", "villager", { x: 3, y: 3 });

  assert.throws(() => findNavigationRouteForUnit(state, mover, { x: 3, y: 3 }), /duplicate blocking-group tiles/);

  const missingProfileId = "test:missing-blocking-group";
  registerMovementCollisionPolicy({
    ...coreStrictFootprintReservationPolicy,
    id: missingProfileId,
    getBlockingGroupAtTile() {
      return null;
    },
  });
  state.movementCollisionProfileId = missingProfileId;
  assert.throws(() => findNavigationRouteForUnit(state, mover, { x: 3, y: 3 }), /no blocking group/);
});

test("blocking-group validation rejects empty, mixed, and out-of-map group shapes", () => {
  const malformedGroups = [
    { id: "empty", classification: "mobile", tiles: [] },
    { id: "mixed", classification: "static", tiles: [{ x: 3, y: 3 }] },
    { id: "oob", classification: "mobile", tiles: [{ x: -1, y: 3 }] },
  ] as const;

  malformedGroups.forEach((group, index) => {
    const profileId = `test:invalid-blocking-group-${index}`;
    registerMovementCollisionPolicy({
      ...coreStrictFootprintReservationPolicy,
      id: profileId,
      getBlockingGroupAtTile() {
        return group;
      },
    });
    const map = createBlankMap({ width: 8, height: 8 });
    map.movementCollisionProfileId = profileId;
    const state = createInitialWorldState(map, ["p1", "p2"]);
    state.units = {};
    const mover = addUnit(state, "mover", { x: 1, y: 3 });
    state.units.blocker = createUnitState("blocker", "p2", "villager", { x: 3, y: 3 });

    assert.throws(() => findNavigationRouteForUnit(state, mover, { x: 3, y: 3 }), /invalid blocking group|does not contain|non-integer|out-of-map/);
  });
});

const deterministicCenterDenyPolicy: MovementCollisionPolicy = {
  id: DETERMINISTIC_MOD_POLICY_ID,
  getEntityBlockingTiles() {
    return new Set([toTileKey(DENIED_TILE)]);
  },
  getBlockingGroupAtTile(_state, _excludedUnitId, tile) {
    return tile.x === DENIED_TILE.x && tile.y === DENIED_TILE.y
      ? { id: "deterministic-center", classification: "static", tiles: [{ ...DENIED_TILE }] }
      : null;
  },
  canUnitOccupyPosition(_state, _unit, position) {
    return toTileKey(position) !== toTileKey(DENIED_TILE);
  },
  createReservation() {
    return { policyId: DETERMINISTIC_MOD_POLICY_ID };
  },
  reserveUnitPosition(_reservation, _unit, position) {
    return toTileKey(position) !== toTileKey(DENIED_TILE);
  },
};

function addUnit(state: WorldState, id: string, position: { x: number; y: number }) {
  const unit = createUnitState(id, "p1", "villager", position);
  state.units[id] = unit;
  return unit;
}

function toTileKey(point: { x: number; y: number }): string {
  return `${point.x},${point.y}`;
}
