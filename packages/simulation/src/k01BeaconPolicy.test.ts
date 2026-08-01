import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceK01BeaconPolicy,
  admitK01NativeSourceEntityRuntime,
  allocateK01SourceEntityRuntime,
  cloneSourceRuntimeProfileEnvelope,
  createK01SourceRuntimeState,
  createInitialWorldState,
  K01_SOURCE_ENTITY_SLOT_MAX,
  toWorldSnapshot,
  type K01SourceRuntimeState,
  advanceWorldTick,
} from "./index.js";
import { createImjinrokMapScaffold, createBlankMap, imjinrokK01Scenario, k01ReinforcementAdapter } from "../../shared/src/index.js";
import { createUnitState } from "./entities.js";
import { appendConstructionCompletedEvent } from "./events.js";

function createK01World() {
  const map = createImjinrokMapScaffold(imjinrokK01Scenario.mapId);
  assert.ok(map);
  return createInitialWorldState(map, ["local-player", "cpu-1"], imjinrokK01Scenario);
}

function appendBeaconCompletion(state: ReturnType<typeof createK01World>, id: string, position: { x: number; y: number }): void {
  const building = createUnitState(id, "local-player", "beacon", position);
  state.units[id] = building;
  appendConstructionCompletedEvent(state, building);
}

test("K01 beacon policy consumes a completion at the accepted update boundary and emits nine native successes", () => {
  const state = createK01World();
  appendBeaconCompletion(state, "local-player-test-beacon", { x: 20, y: 20 });

  const before = state.sourceRuntimeProfile?.state as { acceptedUpdateCount: number; policies: { beacon: { eventCursorSequence: number } } };
  assert.equal(before.acceptedUpdateCount, 0);
  assert.equal(before.policies.beacon.eventCursorSequence, 0);

  const result = advanceK01BeaconPolicy(state);
  assert.equal(result.matchedBeaconCount, 1);
  assert.equal(result.nativeSuccessCount, 9);
  const source = state.sourceRuntimeProfile?.state as K01SourceRuntimeState;
  assert.ok(source);
  assert.equal(source.acceptedUpdateCount, 1);
  assert.equal(source.policies.beacon.eventCursorSequence, 1);
  assert.equal(source.policies.beacon.triggerFlag, 1);
  assert.equal(source.policies.beacon.lastLoaderResult, 1);
  assert.equal(Object.values(state.units).filter((unit) => unit.id.includes("k0120-reinforcement")).length, 9);
  assert.deepEqual(state.units["cpu-1-k0120-reinforcement-0x52"]?.position, { x: 55, y: 51 });
  assert.equal(source.entityRuntime.entities.filter((entity) => entity.originalClass === 52).length, 1);
  assert.equal(source.policies.beacon.trace.some((entry) => entry.type === "reinforcement-success"), true);
});

test("accepted update cadence advances the policy once per world tick", () => {
  const state = createK01World();
  appendBeaconCompletion(state, "local-player-cadence-beacon", { x: 20, y: 20 });
  advanceWorldTick(state);
  const first = (state.sourceRuntimeProfile?.state as K01SourceRuntimeState).acceptedUpdateCount;
  advanceWorldTick(state);
  const second = (state.sourceRuntimeProfile?.state as K01SourceRuntimeState).acceptedUpdateCount;
  assert.equal(first, 1);
  assert.equal(second, 2);
  assert.equal(Object.values(state.units).filter((unit) => unit.id.includes("k0120-reinforcement")).length, 9);
});

test("K01 policy is one-shot, consumes non-beacon events, and does not duplicate after save/load", () => {
  const state = createK01World();
  const house = createUnitState("local-player-house", "local-player", "house", { x: 20, y: 20 });
  state.units[house.id] = house;
  appendConstructionCompletedEvent(state, house);
  appendBeaconCompletion(state, "local-player-test-beacon", { x: 20, y: 20 });

  advanceK01BeaconPolicy(state);
  const firstCount = Object.values(state.units).filter((unit) => unit.id.includes("k0120-reinforcement")).length;
  assert.equal(firstCount, 9);
  const saved = JSON.parse(JSON.stringify(toWorldSnapshot(state))) as typeof state;
  advanceK01BeaconPolicy(saved);
  assert.equal(Object.values(saved.units).filter((unit) => unit.id.includes("k0120-reinforcement")).length, firstCount);
  const savedPolicy = (saved.sourceRuntimeProfile?.state as K01SourceRuntimeState).policies.beacon;
  assert.equal(savedPolicy.eventCursorSequence, 2);
  assert.equal(savedPolicy.triggerFlag, 1);
});

test("K01 source blocker and owner gate skip the scan while loader 0 remains independent of native effects", () => {
  const blocked = createK01World();
  appendBeaconCompletion(blocked, "local-player-blocked-beacon", { x: 20, y: 20 });
  const blockedResult = advanceK01BeaconPolicy(blocked, { blocker: 1 });
  assert.equal(blockedResult.matchedBeaconCount, 0);
  assert.equal(Object.values(blocked.units).filter((unit) => unit.id.includes("k0120-reinforcement")).length, 0);
  assert.equal((blocked.sourceRuntimeProfile?.state as K01SourceRuntimeState).policies.beacon.triggerFlag, 0);

  const wrongOwner = createK01World();
  const wrongOwnerBuilding = createUnitState("cpu-1-wrong-owner-beacon", "cpu-1", "beacon", { x: 20, y: 20 });
  wrongOwner.units[wrongOwnerBuilding.id] = wrongOwnerBuilding;
  appendConstructionCompletedEvent(wrongOwner, wrongOwnerBuilding);
  const wrongResult = advanceK01BeaconPolicy(wrongOwner);
  assert.equal(wrongResult.matchedBeaconCount, 0);

  const busy = createK01World();
  appendBeaconCompletion(busy, "local-player-busy-beacon", { x: 20, y: 20 });
  const busyResult = advanceK01BeaconPolicy(busy, { scriptBusy: true, scriptLoaderResult: 0 });
  assert.equal(busyResult.nativeSuccessCount, 9);
  const busyPolicy = (busy.sourceRuntimeProfile?.state as K01SourceRuntimeState).policies.beacon;
  assert.equal(busyPolicy.lastLoaderResult, null);
  assert.equal(busyPolicy.trace.some((entry: { type: string }) => entry.type === "script-busy"), true);
  assert.equal(busyPolicy.trace.some((entry: { type: string }) => entry.type === "script-load-request"), false);
});

test("two qualifying beacons execute ordered native blocks and later match owns repeated cells", () => {
  const state = createK01World();
  appendBeaconCompletion(state, "local-player-first-beacon", { x: 20, y: 20 });
  appendBeaconCompletion(state, "local-player-second-beacon", { x: 24, y: 20 });
  const replay = JSON.parse(JSON.stringify(toWorldSnapshot(state))) as typeof state;

  const result = advanceK01BeaconPolicy(state);
  const replayResult = advanceK01BeaconPolicy(replay);
  assert.equal(result.matchedBeaconCount, 2);
  assert.equal(result.nativeSuccessCount, 18);
  assert.deepEqual(replayResult, result);
  assert.deepEqual(toWorldSnapshot(replay), toWorldSnapshot(state), "native state/trace replay is deterministic after JSON save/load");
  assert.equal(Object.values(state.units).filter((unit) => unit.id.includes("k0120-reinforcement")).length, 18);
  const source = state.sourceRuntimeProfile?.state as K01SourceRuntimeState;
  const nativeRecords = source.entityRuntime.entities.filter((entity) => entity.sourceRecordIndex >= 0x6000);
  assert.equal(nativeRecords.length, 18);
  const later = nativeRecords.find((entity) => entity.semanticUnitId === "cpu-1-k0120-reinforcement-0x52-match2");
  assert.ok(later);
  assert.equal(source.occupancy.ownerSlots[51 * source.occupancy.width + 55], later.slot);
  assert.deepEqual(
    source.policies.beacon.trace.filter((entry) => entry.type === "reinforcement-success").map((entry) => entry.semanticUnitId),
    [1, 2].flatMap((match) => k01ReinforcementAdapter.map((descriptor) => `cpu-1-${descriptor.idSuffix}${match === 1 ? "" : `-match${match}`}`)),
  );
});

test("native OOB admission retains reuse-age effects without activation residue", () => {
  let state = createK01SourceRuntimeState();
  state = {
    ...state,
    occupancy: { width: 2, height: 2, ownerSlots: Array.from({ length: 4 }, () => 0) },
  };
  const result = admitK01NativeSourceEntityRuntime(state, {
    semanticUnitId: "oob-native",
    sourceRecordIndex: 0x6000,
    originalClass: 12,
    ownerRelation: 1,
    progress: 0x64,
    health: 100,
    position: { x: -1, y: 0 },
    footprint: { width: 1, height: 1, evidence: "static-confirmed" },
    mapWidth: 2,
    mapHeight: 2,
  });
  assert.equal(result.outcome, "out-of-bounds");
  assert.equal(result.slot, K01_SOURCE_ENTITY_SLOT_MAX);
  assert.equal(result.state.entityRuntime.generationCounter, 0);
  assert.equal(result.state.entityRuntime.entities.length, 0);
  assert.equal(result.state.entityRuntime.activeList.length, 0);
  assert.equal(result.state.entityRuntime.activeTable[result.slot], 0);
  assert.equal(result.state.entityRuntime.reuseAges[result.slot], 1);
  assert.deepEqual(
    cloneSourceRuntimeProfileEnvelope({
      profileId: "k01:source-runtime",
      stateVersion: 3,
      state: JSON.parse(JSON.stringify(result.state)),
    }).state,
    result.state,
  );
});

test("native slot exhaustion returns slot 0 and aborts the descriptor sequence", () => {
  let state = createK01SourceRuntimeState();
  state = {
    ...state,
    occupancy: { width: 60, height: 60, ownerSlots: Array.from({ length: 3600 }, () => 0) },
  };
  for (let index = 0; index < K01_SOURCE_ENTITY_SLOT_MAX; index += 1) {
    state = allocateK01SourceEntityRuntime(state, {
      semanticUnitId: `full-native-${index}`,
      sourceRecordIndex: index,
      originalClass: 2,
      ownerRelation: 0,
      progress: 0x64,
      health: 100,
      position: { x: 0, y: 0 },
      footprint: { width: 1, height: 1, evidence: "project-adaptation" },
    }).state;
  }
  const before = JSON.parse(JSON.stringify(state));
  const result = admitK01NativeSourceEntityRuntime(state, {
    semanticUnitId: "slot-exhausted-native",
    sourceRecordIndex: 0x7000,
    originalClass: 12,
    ownerRelation: 1,
    progress: 0x64,
    health: 100,
    position: { x: 0, y: 0 },
    footprint: { width: 1, height: 1, evidence: "static-confirmed" },
    mapWidth: 60,
    mapHeight: 60,
  });
  assert.equal(result.outcome, "slot-exhausted");
  assert.equal(result.slot, 0);
  assert.deepEqual(result.state, before);
});

test("generic worlds never create K01 policy state or reinforcement side effects", () => {
  const generic = createInitialWorldState(createBlankMap({ width: 16, height: 16 }), ["p1"]);
  assert.equal(generic.sourceRuntimeProfile, undefined);
  const initialUnitCount = Object.keys(generic.units).length;
  const result = advanceK01BeaconPolicy(generic);
  assert.equal(result.state, undefined);
  assert.equal(Object.keys(generic.units).length, initialUnitCount);
});
