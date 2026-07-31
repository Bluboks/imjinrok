import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createBlankMap, type CommandEnvelope } from "../../shared/src/index.js";
import {
  advanceOriginalDemolitionTick,
  advanceWorldTick,
  calculateProjectDemolitionRefund,
  createInitialWorldState,
  getOriginalDemolitionPhase,
  issueCommand,
  replayOriginalDemolitionDecrement,
  toWorldSnapshot,
} from "./index.js";
import { createUnitState } from "./entities.js";

interface DemolitionEvidenceFixture {
  phaseBoundaries: readonly [number, number][];
  vectors: {
    decrementTwo: { input: { progress: number; maximumHealth: number; currentHealth: number; delta: number }; output: { completed: boolean; progress: number; currentHealth: number } };
    decrementOne: { input: { progress: number; maximumHealth: number; currentHealth: number; delta: number }; output: { completed: boolean; progress: number; currentHealth: number } };
    underflow: { input: { progress: number; maximumHealth: number; currentHealth: number; delta: number }; output: { completed: boolean; progress: number; currentHealth: number } };
    nonShipCompletion: { input: { grainCost: number; woodCost: number }; output: { grain: number; wood: number; pendingWarExpenseDelta: number; transformation: null } };
  };
}

const fixture = JSON.parse(
  readFileSync(new URL("../../../analysis/fixtures/building-demolition-evidence.json", import.meta.url), "utf8"),
) as DemolitionEvidenceFixture;

function createDemolitionWorld() {
  const state = createInitialWorldState(createBlankMap({ width: 16, height: 16 }), ["p1", "p2"]);
  const building = createUnitState("p1-barracks", "p1", "barracks", { x: 6, y: 6 });
  const enemy = createUnitState("p2-observer", "p2", "villager", { x: 12, y: 12 });
  state.units = { [building.id]: building, [enemy.id]: enemy };
  return { state, building };
}

function demolishEnvelope(unitId: string, playerId = "p1"): CommandEnvelope {
  return {
    sessionId: "demolition-test",
    playerId,
    issuedAtTick: 0,
    command: { type: "demolish-building", unitId },
  };
}

test("demolition phase and helper replay remain pinned to the integrated static evidence fixture", () => {
  for (const [progress, phase] of fixture.phaseBoundaries) {
    assert.equal(getOriginalDemolitionPhase(progress), phase);
  }

  for (const vector of [fixture.vectors.decrementTwo, fixture.vectors.decrementOne, fixture.vectors.underflow]) {
    const result = replayOriginalDemolitionDecrement(
      vector.input.progress,
      { current: vector.input.currentHealth, max: vector.input.maximumHealth },
      vector.input.delta,
    );
    assert.deepEqual(
      { completed: result.completed, progress: result.progress, currentHealth: result.health.current },
      vector.output,
    );
  }
});

test("demolition tick keeps the equal-delta zero boundary alive until the next tick", () => {
  const first = advanceOriginalDemolitionTick(
    { progress: 2, phase: 1 },
    { current: 1_000, max: 1_000 },
  );
  assert.deepEqual(first, {
    demolition: { progress: 0, phase: 0 },
    health: { current: 1, max: 1_000 },
    completed: false,
  });

  const second = advanceOriginalDemolitionTick(first.demolition, first.health);
  assert.equal(second.completed, true);
  assert.equal(second.health.current, 1);
});

test("generic demolition refund is isolated as a project adaptation", () => {
  assert.deepEqual(
    calculateProjectDemolitionRefund({ food: fixture.vectors.nonShipCompletion.input.grainCost, wood: fixture.vectors.nonShipCompletion.input.woodCost }),
    { food: fixture.vectors.nonShipCompletion.input.grainCost, wood: fixture.vectors.nonShipCompletion.input.woodCost },
  );
  assert.equal(fixture.vectors.nonShipCompletion.output.pendingWarExpenseDelta, 0);
  assert.equal(fixture.vectors.nonShipCompletion.output.transformation, null);
});

test("demolition command rejects non-buildings, enemy buildings, busy buildings, and repeats", () => {
  const { state, building } = createDemolitionWorld();
  const worker = createUnitState("p1-worker", "p1", "villager", { x: 2, y: 2 });
  const enemyBuilding = createUnitState("p2-barracks", "p2", "barracks", { x: 10, y: 10 });
  state.units[worker.id] = worker;
  state.units[enemyBuilding.id] = enemyBuilding;

  assert.deepEqual(issueCommand(state, demolishEnvelope(worker.id)), { ok: false, reason: "unit is not a building" });
  assert.deepEqual(issueCommand(state, demolishEnvelope(enemyBuilding.id)), { ok: false, reason: "unit is not owned by player" });

  building.health.current = 0;
  assert.deepEqual(issueCommand(state, demolishEnvelope(building.id)), { ok: false, reason: "building is destroyed" });
  building.health.current = building.health.max;

  building.construction = { remainingTicks: 1, totalTicks: 10 };
  assert.deepEqual(issueCommand(state, demolishEnvelope(building.id)), { ok: false, reason: "unit is under construction" });
  delete building.construction;

  building.productionQueue = [{ id: "train-1", unit: "villager", remainingTicks: 10, totalTicks: 10 }];
  assert.deepEqual(issueCommand(state, demolishEnvelope(building.id)), { ok: false, reason: "building is busy" });
  delete building.productionQueue;

  assert.equal(issueCommand(state, demolishEnvelope(building.id)).ok, true);
  assert.deepEqual(issueCommand(state, demolishEnvelope(building.id)), { ok: false, reason: "building is already being demolished" });
  assert.deepEqual(
    issueCommand(state, {
      ...demolishEnvelope(building.id),
      command: { type: "train-unit", buildingUnitId: building.id, unit: "swordsman" },
    }),
    { ok: false, reason: "building is being demolished" },
  );
});

test("demolition ticks remove the building only after the source zero boundary and refund its generic cost", () => {
  const { state, building } = createDemolitionWorld();
  const beforeWood = state.playerResources.p1!.wood;

  assert.equal(issueCommand(state, demolishEnvelope(building.id)).ok, true);
  building.demolition = { progress: 2, phase: 1 };
  advanceWorldTick(state);

  assert.equal(state.units[building.id]?.demolition?.progress, 0);
  assert.equal(state.units[building.id]?.health.current, 1);
  assert.equal(state.playerResources.p1!.wood, beforeWood);

  advanceWorldTick(state);
  assert.equal(state.units[building.id], undefined);
  assert.equal(state.playerResources.p1!.wood, beforeWood + 175);
});

test("demolition state is preserved by a JSON snapshot roundtrip", () => {
  const { state, building } = createDemolitionWorld();
  assert.equal(issueCommand(state, demolishEnvelope(building.id)).ok, true);

  const snapshot = JSON.parse(JSON.stringify(toWorldSnapshot(state)));
  assert.deepEqual(snapshot.units[building.id].demolition, { progress: 100, phase: 7 });
});
