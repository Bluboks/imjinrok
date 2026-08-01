import assert from "node:assert/strict";
import test from "node:test";
import {
  createBlankMap,
  createImjinrokMapScaffold,
  imjinrokK01Scenario,
  type WorldState,
} from "../../shared/src/index.js";
import {
  advanceWorldTick,
  completeConstructionTransition,
  createInitialWorldState,
  normalizeSimulationEventState,
  parseSerializedSimulationEventLog,
  toWorldSnapshot,
} from "./index.js";
import { createUnitState } from "./entities.js";
import { removeUnitFromWorld } from "./units.js";

function createConstructionState(
  buildingId = "p1-building",
  remainingTicks = 1,
  kind: "house" | "beacon" = "house",
): WorldState {
  const state = createInitialWorldState(createBlankMap({ width: 16, height: 16 }), ["p1"]);
  const worker = createUnitState("p1-worker", "p1", "villager", { x: 4, y: 5 });
  const building = createUnitState(buildingId, "p1", kind, { x: 5, y: 5 });
  building.construction = { remainingTicks, totalTicks: Math.max(1, remainingTicks), builderUnitId: worker.id };
  worker.currentOrder = {
    type: "build",
    building: kind,
    target: { ...building.position },
    buildingUnitId: building.id,
  };
  state.units = { [worker.id]: worker, [building.id]: building };
  return state;
}

test("construction completion emits one stable semantic event after authoritative state transition", () => {
  const state = createConstructionState("p1-house", 1, "house");

  advanceWorldTick(state);

  assert.equal(state.units["p1-house"]?.construction, undefined);
  assert.deepEqual(state.simulationEvents, [{
    id: "construction-completed:1",
    sequence: 1,
    type: "construction-completed",
    tick: 1,
    buildingId: "p1-house",
    ownerId: "p1",
    kind: "house",
    position: { x: 5, y: 5 },
  }]);
  assert.equal(state.nextSimulationEventSequence, 2);

  advanceWorldTick(state);
  assert.equal(state.simulationEvents.length, 1, "already-complete buildings do not re-emit");
});

test("assisted repair completion shares the same exactly-once transition", () => {
  const state = createConstructionState("p1-beacon", 1, "beacon");
  const worker = state.units["p1-worker"]!;
  worker.currentOrder = { type: "repair", targetUnitId: "p1-beacon" };
  delete worker.movementTarget;

  advanceWorldTick(state);
  advanceWorldTick(state);

  assert.equal(state.simulationEvents.length, 1);
  assert.equal(state.simulationEvents[0]?.kind, "beacon");
});

test("fast production and sorted unit iteration make same-tick ordering deterministic", () => {
  const state = createConstructionState("p1-zeta", 4);
  const second = createUnitState("p1-alpha", "p1", "house", { x: 8, y: 5 });
  second.construction = { remainingTicks: 4, totalTicks: 4 };
  const secondWorker = createUnitState("p1-worker-alpha", "p1", "villager", { x: 7, y: 5 });
  secondWorker.currentOrder = {
    type: "build",
    building: "house",
    target: { ...second.position },
    buildingUnitId: second.id,
  };
  state.units[second.id] = second;
  state.units[secondWorker.id] = secondWorker;
  state.playerCheats.p1 = { fastProduction: true };

  advanceWorldTick(state);

  assert.deepEqual(state.simulationEvents.map((event) => [event.sequence, event.buildingId]), [
    [1, "p1-zeta"],
    [2, "p1-alpha"],
  ]);
});

test("cancelled or destroyed construction never emits a completion event", () => {
  const cancelled = createConstructionState("p1-cancelled", 1);
  removeUnitFromWorld(cancelled, "p1-cancelled");
  advanceWorldTick(cancelled);
  assert.deepEqual(cancelled.simulationEvents, []);

  const destroyed = createConstructionState("p1-destroyed", 1);
  destroyed.units["p1-destroyed"]!.health.current = 0;
  removeUnitFromWorld(destroyed, "p1-destroyed");
  advanceWorldTick(destroyed);
  assert.deepEqual(destroyed.simulationEvents, []);
});

test("construction events do not represent repair, research, or completed-at-start paths", () => {
  const state = createInitialWorldState(createBlankMap({ width: 16, height: 16 }), ["p1"]);
  const building = createUnitState("p1-building", "p1", "house", { x: 5, y: 5 });
  const worker = createUnitState("p1-worker", "p1", "villager", { x: 4, y: 5 });
  building.health.current = building.health.max - 1;
  worker.currentOrder = { type: "repair", targetUnitId: building.id };
  const researchBuilding = createUnitState("p1-research", "p1", "town-center", { x: 8, y: 8 });
  researchBuilding.researchQueue = [{ id: "research", research: "loom", remainingTicks: 1, totalTicks: 1 }];
  state.units = { [worker.id]: worker, [building.id]: building, [researchBuilding.id]: researchBuilding };

  advanceWorldTick(state);
  assert.deepEqual(state.simulationEvents, []);
});

test("payload points are immutable snapshots and save/load preserves exactly-once behavior", () => {
  const beforeCompletion = createConstructionState("p1-before", 1);
  const beforeSave = JSON.parse(JSON.stringify(toWorldSnapshot(beforeCompletion))) as WorldState;
  advanceWorldTick(beforeSave);
  assert.equal(beforeSave.simulationEvents.length, 1);

  const afterCompletion = createConstructionState("p1-after", 1);
  advanceWorldTick(afterCompletion);
  const saved = toWorldSnapshot(afterCompletion);
  const loaded = JSON.parse(JSON.stringify(saved)) as WorldState;
  loaded.units["p1-after"]!.position.x = 99;
  assert.equal(loaded.simulationEvents[0]?.position.x, 5);
  advanceWorldTick(loaded);
  assert.equal(loaded.simulationEvents.length, 1, "save after completion does not re-emit");

  const snapshot = toWorldSnapshot(afterCompletion);
  snapshot.simulationEvents[0]!.position.x = 77;
  assert.equal(afterCompletion.simulationEvents[0]?.position.x, 5, "snapshot event is a clone");
});

test("simulation event log validates stable schema and follows existing transient retention", () => {
  const state = createConstructionState("p1-retained", 1);
  advanceWorldTick(state);
  assert.deepEqual(parseSerializedSimulationEventLog(JSON.parse(JSON.stringify(state.simulationEvents))), state.simulationEvents);
  assert.equal(parseSerializedSimulationEventLog([{ ...state.simulationEvents[0], sequence: 2 }]), null);

  for (let index = 0; index < 8; index += 1) {
    advanceWorldTick(state);
  }
  assert.equal(state.simulationEvents.length, 1);
  advanceWorldTick(state);
  assert.equal(state.simulationEvents.length, 0);
});

test("snapshot normalization migrates only absent legacy fields and rejects present malformed state", () => {
  assert.deepEqual(normalizeSimulationEventState({}), { simulationEvents: [], nextSimulationEventSequence: 1 });

  const state = createConstructionState("p1-normalized", 1);
  advanceWorldTick(state);
  const event = state.simulationEvents[0]!;
  assert.equal(normalizeSimulationEventState({ simulationEvents: [event], nextSimulationEventSequence: 2 })?.nextSimulationEventSequence, 2);
  assert.equal(normalizeSimulationEventState({ simulationEvents: [event], nextSimulationEventSequence: 1 }), null);
  assert.equal(normalizeSimulationEventState({ simulationEvents: [event] }), null);
  assert.equal(normalizeSimulationEventState({ nextSimulationEventSequence: 2 }), null);
  assert.equal(normalizeSimulationEventState({ simulationEvents: [{ ...event, position: { x: Number.NaN, y: 5 } }] }), null);
  assert.equal(normalizeSimulationEventState({ simulationEvents: [event, event], nextSimulationEventSequence: 3 }), null);
});

test("generic and K01-profile worlds emit the same semantic payload", () => {
  const generic = createConstructionState("p1-generic", 1);
  const k01Map = createImjinrokMapScaffold(imjinrokK01Scenario.mapId);
  assert.ok(k01Map);
  const k01 = createInitialWorldState(k01Map, ["local-player", "cpu-1"], imjinrokK01Scenario);
  assert.equal(k01.sourceRuntimeProfile?.profileId, "k01:source-runtime");
  const building = createUnitState("p1-k01", "p1", "beacon", { x: 5, y: 5 });
  const worker = createUnitState("p1-worker", "p1", "villager", { x: 4, y: 5 });
  building.construction = { remainingTicks: 1, totalTicks: 1 };
  worker.currentOrder = { type: "build", building: "beacon", target: { x: 5, y: 5 }, buildingUnitId: building.id };
  k01.units = { [worker.id]: worker, [building.id]: building };

  advanceWorldTick(generic);
  advanceWorldTick(k01);
  assert.deepEqual(k01.simulationEvents[0], {
    ...generic.simulationEvents[0],
    buildingId: "p1-k01",
    kind: "beacon",
  });
});

test("completion transition snapshots only stable building identity", () => {
  const state = createInitialWorldState(createBlankMap(), ["p1"]);
  const building = createUnitState("p1-house", "p1", "house", { x: 2, y: 3 });
  building.construction = { remainingTicks: 0, totalTicks: 1 };
  assert.equal(completeConstructionTransition(state, building), true);
  building.position.x = 100;
  assert.equal(state.simulationEvents[0]?.position.x, 2);
});
