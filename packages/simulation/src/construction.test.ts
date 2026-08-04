import assert from "node:assert/strict";
import test from "node:test";
import { createBlankMap } from "../../shared/src/index.js";
import { advanceWorldTick, completeConstructionTransition, createInitialWorldState } from "./index.js";
import { updateConstructionHealth } from "./construction.js";
import { createUnitState } from "./entities.js";

function createFastConstruction(kind: "house" | "beacon") {
  const state = createInitialWorldState(createBlankMap({ width: 16, height: 16 }), ["p1"]);
  const worker = createUnitState("p1-worker", "p1", "villager", { x: 4, y: 5 });
  const building = createUnitState(`p1-${kind}`, "p1", kind, { x: 5, y: 5 });
  building.construction = { remainingTicks: 7, totalTicks: 7, builderUnitId: worker.id };
  updateConstructionHealth(building);
  worker.currentOrder = {
    type: "build",
    building: kind,
    target: { ...building.position },
    buildingUnitId: building.id,
  };
  state.units = { [building.id]: building, [worker.id]: worker };
  state.playerCheats.p1 = { fastProduction: true };
  return { state, building };
}

test("fast completion atomically reaches full health for unrelated building kinds", () => {
  for (const kind of ["house", "beacon"] as const) {
    const { state, building } = createFastConstruction(kind);

    advanceWorldTick(state);
    assert.equal(building.construction?.remainingTicks, 3);
    assert.ok(building.health.current < building.health.max);

    advanceWorldTick(state);
    assert.equal(building.construction, undefined);
    assert.equal(building.health.current, building.health.max);
    assert.deepEqual(state.simulationEvents.map((event) => event.kind), [kind]);
  }
});

test("completion preserves a one-health construction deficit", () => {
  const { state, building } = createFastConstruction("house");

  advanceWorldTick(state);
  building.health.current -= 1;
  advanceWorldTick(state);

  assert.equal(building.construction, undefined);
  assert.equal(building.health.current, building.health.max - 1);
});

test("completion preserves the strict completed-building damage boundary", () => {
  const state = createInitialWorldState(createBlankMap({ width: 16, height: 16 }), ["p1"]);
  const building = createUnitState("p1-house", "p1", "house", { x: 5, y: 5 });
  const threshold = Math.trunc(building.health.max * 50 / 100);
  building.construction = { remainingTicks: 0, totalTicks: 7 };
  state.units[building.id] = building;

  building.health.current = threshold;
  assert.equal(completeConstructionTransition(state, building), true);
  assert.equal(building.health.current, threshold);
  assert.equal(building.health.current * 100 < building.health.max * 50, false);

  const damaged = createUnitState("p1-beacon", "p1", "beacon", { x: 8, y: 5 });
  damaged.construction = { remainingTicks: 0, totalTicks: 7 };
  const damagedThreshold = Math.trunc(damaged.health.max * 50 / 100);
  damaged.health.current = Math.max(1, damagedThreshold - 1);
  state.units[damaged.id] = damaged;
  assert.equal(completeConstructionTransition(state, damaged), true);
  assert.equal(damaged.health.current, damagedThreshold - 1);
  assert.equal(damaged.health.current * 100 < damaged.health.max * 50, true);
});
