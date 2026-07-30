import assert from "node:assert/strict";
import test from "node:test";

import { createBlankMap } from "../../shared/src/index.js";
import { extractK01TurtleTankRuntimeClock } from "../../../tools/imjinrok/extract-k01-turtle-tank-runtime-clock.mjs";
import { createUnitState } from "./entities.js";
import {
  advanceSourceOrientation,
  createSourceOrientationState,
  K01_TURTLE_TANK_ORIENTATION_PROFILE,
  registerSourceOrientationProfile,
} from "./orientation.js";
import { advanceWorldTick } from "./tick.js";
import { createInitialWorldState, toWorldSnapshot } from "./world.js";

const TURTLE_RING = [1, 1000, 5, 1001, 4, 1002, 20, 1003, 16, 1004, 80, 1005, 64, 1006, 65, 1007];

test("K01 turtle profile consumes every source-confirmed raw16 entry", () => {
  const report = extractK01TurtleTankRuntimeClock();

  assert.deepEqual(K01_TURTLE_TANK_ORIENTATION_PROFILE.ring, TURTLE_RING);
  assert.equal(report.class14Binding.cadenceDefault, K01_TURTLE_TANK_ORIENTATION_PROFILE.defaultCadenceLimit);

  for (let index = 0; index < TURTLE_RING.length; index += 1) {
    const state = createSourceOrientationState(K01_TURTLE_TANK_ORIENTATION_PROFILE);
    state.movementRaw16 = TURTLE_RING[index]!;
    state.cadenceLimit = 1;
    const expected = TURTLE_RING[(index + 1) % TURTLE_RING.length]!;
    const next = advanceSourceOrientation(state, K01_TURTLE_TANK_ORIENTATION_PROFILE, expected);

    assert.equal(next.movementRaw16, expected, `ring adjacency ${state.movementRaw16} -> ${expected}`);
    assert.equal(next.cadenceCounter, 0);
    assert.equal(next.turnPending, 1);
    assert.equal(next.dirty, 1);
  }
});

test("source orientation preserves shortest path, backward tie, equality, and byte/dword boundaries", () => {
  const start = createSourceOrientationState(K01_TURTLE_TANK_ORIENTATION_PROFILE);
  start.cadenceLimit = 1;

  assert.equal(
    advanceSourceOrientation(start, K01_TURTLE_TANK_ORIENTATION_PROFILE, 4).movementRaw16,
    1000,
    "multi-step forward advances only one raw16 entry",
  );

  const backward = createSourceOrientationState(K01_TURTLE_TANK_ORIENTATION_PROFILE);
  backward.movementRaw16 = 4;
  backward.attackGrid8 = "w";
  backward.cadenceLimit = 1;
  assert.equal(
    advanceSourceOrientation(backward, K01_TURTLE_TANK_ORIENTATION_PROFILE, 1).movementRaw16,
    1001,
    "multi-step backward advances only one raw16 entry",
  );

  const tie = createSourceOrientationState(K01_TURTLE_TANK_ORIENTATION_PROFILE);
  tie.cadenceLimit = 1;
  assert.equal(advanceSourceOrientation(tie, K01_TURTLE_TANK_ORIENTATION_PROFILE, 16).movementRaw16, 1007);

  const equality = createSourceOrientationState(K01_TURTLE_TANK_ORIENTATION_PROFILE);
  equality.cadenceCounter = 1;
  equality.turnPending = 1;
  equality.dirty = 1;
  const equalResult = advanceSourceOrientation(equality, K01_TURTLE_TANK_ORIENTATION_PROFILE, 1);
  assert.deepEqual(
    { cadenceCounter: equalResult.cadenceCounter, turnPending: equalResult.turnPending, dirty: equalResult.dirty },
    { cadenceCounter: 1, turnPending: 0, dirty: 1 },
  );

  const wrapped = createSourceOrientationState(K01_TURTLE_TANK_ORIENTATION_PROFILE);
  wrapped.originalAcceptedUpdate = 0xffffffff;
  wrapped.cadenceCounter = 0xff;
  const wrapResult = advanceSourceOrientation(wrapped, K01_TURTLE_TANK_ORIENTATION_PROFILE, 5);
  assert.deepEqual(
    { originalAcceptedUpdate: wrapResult.originalAcceptedUpdate, cadenceCounter: wrapResult.cadenceCounter, movementRaw16: wrapResult.movementRaw16 },
    { originalAcceptedUpdate: 0, cadenceCounter: 0, movementRaw16: 1 },
  );
});

test("intermediate movement raw16 leaves attack on its last grid direction until a grid landing", () => {
  const state = createSourceOrientationState(K01_TURTLE_TANK_ORIENTATION_PROFILE);
  state.cadenceLimit = 1;

  const intermediate = advanceSourceOrientation(state, K01_TURTLE_TANK_ORIENTATION_PROFILE, 5);
  assert.deepEqual(
    { movementRaw16: intermediate.movementRaw16, attackGrid8: intermediate.attackGrid8 },
    { movementRaw16: 1000, attackGrid8: "s" },
  );

  const grid = advanceSourceOrientation(intermediate, K01_TURTLE_TANK_ORIENTATION_PROFILE, 5);
  assert.deepEqual(
    { movementRaw16: grid.movementRaw16, attackGrid8: grid.attackGrid8 },
    { movementRaw16: 5, attackGrid8: "sw" },
  );
});

test("orientation profiles are data-driven and mod bindings can be removed", () => {
  const unregister = registerSourceOrientationProfile("villager", {
    id: "mod-tank-four-way",
    ring: [10, 11, 12, 13],
    gridFacingByRaw: { 10: "s", 11: "w", 12: "n", 13: "e" },
    defaultCadenceLimit: 1,
    defaultInitialRaw16: 10,
  });

  try {
    const unit = createUnitState("mod-tank", "p1", "villager", { x: 1, y: 1 });
    assert.equal(unit.sourceOrientation?.profileId, "mod-tank-four-way");
  } finally {
    unregister();
  }

  assert.equal(createUnitState("mod-tank-after-removal", "p1", "villager", { x: 1, y: 1 }).sourceOrientation, undefined);
});

test("K01 turtle project adapter is explicit, snapshot-safe, and leaves other units unchanged", () => {
  const state = createInitialWorldState(createBlankMap({ width: 12, height: 12 }), ["p1", "p2"]);
  state.units = {};
  const turtle = createUnitState("p1-turtle", "p1", "japanese-turtle-tank", { x: 4, y: 4 });
  const villager = createUnitState("p1-villager", "p1", "villager", { x: 2, y: 2 });
  const enemy = createUnitState("p2-villager", "p2", "villager", { x: 10, y: 10 });
  turtle.movementTarget = { x: 5, y: 4 };
  state.units[turtle.id] = turtle;
  state.units[villager.id] = villager;
  state.units[enemy.id] = enemy;

  advanceWorldTick(state);
  advanceWorldTick(state);

  assert.deepEqual(
    { movementRaw16: turtle.sourceOrientation?.movementRaw16, attackGrid8: turtle.sourceOrientation?.attackGrid8 },
    { movementRaw16: 1007, attackGrid8: "s" },
  );
  assert.equal(villager.sourceOrientation, undefined);

  const snapshot = toWorldSnapshot(state);
  assert.deepEqual(snapshot.units[turtle.id]?.sourceOrientation, turtle.sourceOrientation);
  assert.notEqual(snapshot.units[turtle.id]?.sourceOrientation, turtle.sourceOrientation);
  assert.equal(snapshot.units[villager.id]?.sourceOrientation, undefined);

  delete turtle.sourceOrientation;
  turtle.movementTarget = { x: 4, y: 5 };
  advanceWorldTick(state);
  assert.equal(turtle.sourceOrientation?.profileId, K01_TURTLE_TANK_ORIENTATION_PROFILE.id, "old turtle snapshots initialize lazily");
});

test("K01 turtle adapter also accepts the current project attack target", () => {
  const state = createInitialWorldState(createBlankMap({ width: 16, height: 16 }), ["p1", "p2"]);
  state.units = {};
  const turtle = createUnitState("p1-turtle", "p1", "japanese-turtle-tank", { x: 4, y: 4 });
  const target = createUnitState("p2-target", "p2", "villager", { x: 10, y: 4 });
  turtle.currentOrder = { type: "attack-unit", targetUnitId: target.id };
  state.units[turtle.id] = turtle;
  state.units[target.id] = target;

  advanceWorldTick(state);
  advanceWorldTick(state);

  assert.equal(turtle.sourceOrientation?.movementRaw16, 1007);
  assert.equal(turtle.sourceOrientation?.attackGrid8, "s");
});
