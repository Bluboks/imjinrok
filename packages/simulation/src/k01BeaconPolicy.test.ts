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
import { createImjinrokMapScaffold, createBlankMap, imjinrokK01Scenario, k01ReinforcementAdapter, unitDefinitions } from "../../shared/src/index.js";
import { createUnitState } from "./entities.js";
import { appendConstructionCompletedEvent } from "./events.js";
import { removeUnitFromWorld } from "./units.js";

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

function removeOpeningHostileBuildings(state: ReturnType<typeof createK01World>): void {
  for (const unit of Object.values(state.units)) {
    if (unit.playerId === "cpu-1" && unitDefinitions[unit.kind].category === "building") {
      removeUnitFromWorld(state, unit.id);
    }
  }
}

function moveOpeningMobileUnitsAway(state: ReturnType<typeof createK01World>): void {
  for (const [index, unit] of Object.values(state.units).entries()) {
    if (unit.movementSpeed > 0) {
      unit.position = { x: 25 + index, y: 25 };
    }
  }
}

test("K01 beacon policy consumes a completion at the accepted update boundary and emits nine native successes", () => {
  const state = createK01World();
  appendBeaconCompletion(state, "local-player-test-beacon", { x: 20, y: 20 });
  removeOpeningHostileBuildings(state);

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

test("completed beacon uses the proven class-52 3x3 source footprint and release clears all owner cells", () => {
  const state = createK01World();
  const beaconId = "local-player-footprint-beacon";
  const center = { x: 20, y: 20 };
  appendBeaconCompletion(state, beaconId, center);
  removeOpeningHostileBuildings(state);

  assert.equal(advanceK01BeaconPolicy(state).matchedBeaconCount, 1);
  const source = state.sourceRuntimeProfile?.state as K01SourceRuntimeState;
  const record = source.entityRuntime.entities.find((entity) => entity.semanticUnitId === beaconId && entity.active);
  assert.ok(record);
  assert.deepEqual(record.footprint, { width: 3, height: 3, evidence: "static-confirmed" });
  for (let y = center.y - 1; y <= center.y + 1; y += 1) {
    for (let x = center.x - 1; x <= center.x + 1; x += 1) {
      assert.equal(source.occupancy.ownerSlots[y * source.occupancy.width + x], record.slot);
    }
  }

  assert.equal(removeUnitFromWorld(state, beaconId), true);
  const afterRelease = state.sourceRuntimeProfile?.state as K01SourceRuntimeState;
  for (let y = center.y - 1; y <= center.y + 1; y += 1) {
    for (let x = center.x - 1; x <= center.x + 1; x += 1) {
      assert.equal(afterRelease.occupancy.ownerSlots[y * afterRelease.occupancy.width + x], 0);
    }
  }
});

test("completed beacon clears stale source owners only when semantic occupancy moved away", () => {
  const state = createK01World();
  const source = state.sourceRuntimeProfile?.state as K01SourceRuntimeState;
  moveOpeningMobileUnitsAway(state);
  removeOpeningHostileBuildings(state);
  const before = JSON.parse(JSON.stringify(source.occupancy.ownerSlots)) as number[];

  appendBeaconCompletion(state, "local-player-stale-owner-bridge-beacon", { x: 8, y: 5 });
  const result = advanceK01BeaconPolicy(state);
  assert.equal(result.matchedBeaconCount, 1);
  assert.equal(result.nativeSuccessCount, 9);
  const after = state.sourceRuntimeProfile?.state as K01SourceRuntimeState;
  const beacon = after.entityRuntime.entities.find((record) => record.semanticUnitId === "local-player-stale-owner-bridge-beacon" && record.active);
  assert.ok(beacon);
  assert.equal(before[6 * source.occupancy.width + 7], 1191);
  assert.equal(before[6 * source.occupancy.width + 8], 1190);
  for (let y = 4; y <= 6; y += 1) {
    for (let x = 7; x <= 9; x += 1) {
      assert.equal(after.occupancy.ownerSlots[y * after.occupancy.width + x], beacon.slot);
    }
  }
});

test("completed beacon preserves current and unknown source owners on failed 3x3 admission", () => {
  const currentOccupant = createK01World();
  removeOpeningHostileBuildings(currentOccupant);
  const staleOwner = currentOccupant.units["local-player-source-0x07-7-6"];
  const replacementOwner = currentOccupant.units["local-player-source-0x07-8-6"];
  assert.ok(staleOwner);
  assert.ok(replacementOwner);
  staleOwner.position = { x: 25, y: 25 };
  replacementOwner.position = { x: 7, y: 6 };
  appendBeaconCompletion(currentOccupant, "local-player-current-owner-beacon", { x: 8, y: 5 });
  const currentBefore = currentOccupant.sourceRuntimeProfile?.state as K01SourceRuntimeState;
  const currentEntityRuntime = JSON.parse(JSON.stringify(currentBefore.entityRuntime));
  const currentOccupancy = JSON.parse(JSON.stringify(currentBefore.occupancy));
  const currentResult = advanceK01BeaconPolicy(currentOccupant);
  assert.equal(currentResult.matchedBeaconCount, 0);
  assert.equal(currentResult.nativeSuccessCount, 0);
  const currentAfter = currentOccupant.sourceRuntimeProfile?.state as K01SourceRuntimeState;
  assert.deepEqual(currentAfter.entityRuntime, currentEntityRuntime);
  assert.deepEqual(currentAfter.occupancy, currentOccupancy);

  const unknownOwner = createK01World();
  removeOpeningHostileBuildings(unknownOwner);
  moveOpeningMobileUnitsAway(unknownOwner);
  const unknownBefore = unknownOwner.sourceRuntimeProfile?.state as K01SourceRuntimeState;
  unknownOwner.sourceRuntimeProfile = {
    ...unknownOwner.sourceRuntimeProfile!,
    state: {
      ...unknownBefore,
      occupancy: {
        ...unknownBefore.occupancy,
        ownerSlots: unknownBefore.occupancy.ownerSlots.map((owner, index) =>
          index === 6 * unknownBefore.occupancy.width + 7 ? 777 : owner),
      },
    },
  };
  const unknownEntityRuntime = JSON.parse(JSON.stringify(unknownBefore.entityRuntime));
  const unknownOccupancy = JSON.parse(JSON.stringify((unknownOwner.sourceRuntimeProfile?.state as K01SourceRuntimeState).occupancy));
  appendBeaconCompletion(unknownOwner, "local-player-unknown-owner-beacon", { x: 8, y: 6 });
  const unknownResult = advanceK01BeaconPolicy(unknownOwner);
  assert.equal(unknownResult.matchedBeaconCount, 0);
  assert.equal(unknownResult.nativeSuccessCount, 0);
  const unknownAfter = unknownOwner.sourceRuntimeProfile?.state as K01SourceRuntimeState;
  assert.deepEqual(unknownAfter.entityRuntime, unknownEntityRuntime);
  assert.deepEqual(unknownAfter.occupancy, unknownOccupancy);
});

test("accepted update cadence advances the policy once per world tick", () => {
  const state = createK01World();
  appendBeaconCompletion(state, "local-player-cadence-beacon", { x: 20, y: 20 });
  removeOpeningHostileBuildings(state);
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
  const house = createUnitState("local-player-house", "local-player", "house", { x: 16, y: 20 });
  state.units[house.id] = house;
  appendConstructionCompletedEvent(state, house);
  appendBeaconCompletion(state, "local-player-test-beacon", { x: 20, y: 20 });
  removeOpeningHostileBuildings(state);

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
  removeOpeningHostileBuildings(wrongOwner);
  const wrongOwnerBuilding = createUnitState("cpu-1-wrong-owner-beacon", "cpu-1", "beacon", { x: 20, y: 20 });
  wrongOwner.units[wrongOwnerBuilding.id] = wrongOwnerBuilding;
  appendConstructionCompletedEvent(wrongOwner, wrongOwnerBuilding);
  const wrongResult = advanceK01BeaconPolicy(wrongOwner);
  assert.equal(wrongResult.matchedBeaconCount, 0);

  const busy = createK01World();
  appendBeaconCompletion(busy, "local-player-busy-beacon", { x: 20, y: 20 });
  removeOpeningHostileBuildings(busy);
  const busyResult = advanceK01BeaconPolicy(busy, { scriptBusy: true, scriptLoaderResult: 0 });
  assert.equal(busyResult.nativeSuccessCount, 9);
  const busyPolicy = (busy.sourceRuntimeProfile?.state as K01SourceRuntimeState).policies.beacon;
  assert.equal(busyPolicy.lastLoaderResult, null);
  assert.equal(busyPolicy.trace.some((entry: { type: string }) => entry.type === "script-busy"), true);
  assert.equal(busyPolicy.trace.some((entry: { type: string }) => entry.type === "script-load-request"), false);
});

test("explicit blocker overrides remain deterministic for focused source tests", () => {
  const first = createK01World();
  const second = createK01World();
  appendBeaconCompletion(first, "local-player-override-beacon", { x: 20, y: 20 });
  appendBeaconCompletion(second, "local-player-override-beacon", { x: 20, y: 20 });

  const firstResult = advanceK01BeaconPolicy(first, { blocker: 1 });
  const secondResult = advanceK01BeaconPolicy(second, { blocker: 1 });
  assert.deepEqual(secondResult, firstResult);
  assert.equal(firstResult.matchedBeaconCount, 0);
  assert.equal(secondResult.nativeSuccessCount, 0);
});

test("default K01 blocker holds the beacon gate for opening hostile buildings, then unblocks after removal", () => {
  const state = createK01World();
  appendBeaconCompletion(state, "local-player-opening-gate-beacon", { x: 20, y: 20 });

  const blocked = advanceK01BeaconPolicy(state);
  assert.equal(blocked.matchedBeaconCount, 0);
  assert.equal(blocked.nativeSuccessCount, 0);
  assert.equal(Object.values(state.units).filter((unit) => unit.id.includes("k0120-reinforcement")).length, 0);
  assert.equal((state.sourceRuntimeProfile?.state as K01SourceRuntimeState).policies.beacon.triggerFlag, 0);
  assert.equal(
    (state.sourceRuntimeProfile?.state as K01SourceRuntimeState).policies.beacon.trace.some(
      (entry) => entry.type === "scan-skipped-blocker",
    ),
    true,
  );

  removeOpeningHostileBuildings(state);
  const unblocked = advanceK01BeaconPolicy(state);
  assert.equal(unblocked.matchedBeaconCount, 1);
  assert.equal(unblocked.nativeSuccessCount, 9);
  assert.equal((state.sourceRuntimeProfile?.state as K01SourceRuntimeState).policies.beacon.triggerFlag, 1);
});

test("removing a beacon after a blocked scan prevents its retired source record from opening the gate", () => {
  const state = createK01World();
  appendBeaconCompletion(state, "local-player-removed-while-blocked", { x: 20, y: 20 });

  const blocked = advanceK01BeaconPolicy(state);
  assert.equal(blocked.matchedBeaconCount, 0);
  assert.equal(blocked.nativeSuccessCount, 0);
  assert.equal(removeUnitFromWorld(state, "local-player-removed-while-blocked"), true);
  removeOpeningHostileBuildings(state);

  const unblocked = advanceK01BeaconPolicy(state);
  assert.equal(unblocked.matchedBeaconCount, 0);
  assert.equal(unblocked.nativeSuccessCount, 0);
  assert.equal(Object.values(state.units).filter((unit) => unit.id.includes("k0120-reinforcement")).length, 0);
  assert.equal((state.sourceRuntimeProfile?.state as K01SourceRuntimeState).policies.beacon.triggerFlag, 0);
});

test("a replacement beacon at the same position admits and triggers exactly one native wave after JSON restore", () => {
  const state = createK01World();
  appendBeaconCompletion(state, "local-player-old-beacon", { x: 20, y: 20 });
  assert.equal(advanceK01BeaconPolicy(state).matchedBeaconCount, 0, "opening buildings keep the first beacon blocked");
  assert.equal(removeUnitFromWorld(state, "local-player-old-beacon"), true);
  removeOpeningHostileBuildings(state);

  const restored = JSON.parse(JSON.stringify(toWorldSnapshot(state))) as ReturnType<typeof createK01World>;
  appendBeaconCompletion(restored, "local-player-rebuilt-beacon", { x: 20, y: 20 });
  const first = advanceK01BeaconPolicy(restored);
  assert.equal(first.matchedBeaconCount, 1);
  assert.equal(first.nativeSuccessCount, 9);
  assert.equal(Object.values(restored.units).filter((unit) => unit.id.includes("k0120-reinforcement")).length, 9);

  const source = restored.sourceRuntimeProfile?.state as K01SourceRuntimeState;
  assert.equal(source.entityRuntime.entities.filter((record) => record.semanticUnitId === "local-player-old-beacon" && record.active).length, 0);
  assert.equal(source.entityRuntime.entities.filter((record) => record.semanticUnitId === "local-player-rebuilt-beacon" && record.active).length, 1);

  const afterWave = advanceK01BeaconPolicy(restored);
  assert.equal(afterWave.matchedBeaconCount, 0);
  assert.equal(afterWave.nativeSuccessCount, 0);
  assert.equal(Object.values(restored.units).filter((unit) => unit.id.includes("k0120-reinforcement")).length, 9);
  const roundTripped = JSON.parse(JSON.stringify(toWorldSnapshot(restored))) as ReturnType<typeof createK01World>;
  const afterRestore = advanceK01BeaconPolicy(roundTripped);
  assert.equal(afterRestore.matchedBeaconCount, 0);
  assert.equal(afterRestore.nativeSuccessCount, 0);
  assert.equal(Object.values(roundTripped.units).filter((unit) => unit.id.includes("k0120-reinforcement")).length, 9);
});

test("ordinary hostile soldiers with non-qualifying flags do not block an otherwise clear K01 gate", () => {
  const state = createK01World();
  appendBeaconCompletion(state, "local-player-soldier-only-beacon", { x: 20, y: 20 });
  removeOpeningHostileBuildings(state);

  const hostileSoldierRecords = (state.sourceRuntimeProfile?.state as K01SourceRuntimeState).entityRuntime.entities.filter(
    (record) => record.ownerRelation === 1 && record.semanticUnitId in state.units,
  );
  assert.ok(hostileSoldierRecords.length > 0);
  assert.equal(hostileSoldierRecords.every((record) => unitDefinitions[state.units[record.semanticUnitId]!.kind].category !== "building"), true);

  const result = advanceK01BeaconPolicy(state);
  assert.equal(result.matchedBeaconCount, 1);
  assert.equal(result.nativeSuccessCount, 9);
});

test("destroyed semantic buildings stop blocking even when the seeded source health is stale", () => {
  const state = createK01World();
  appendBeaconCompletion(state, "local-player-destroyed-building-beacon", { x: 20, y: 20 });
  for (const unit of Object.values(state.units)) {
    if (unit.playerId === "cpu-1" && unitDefinitions[unit.kind].category === "building") {
      unit.health.current = 0;
    }
  }

  const result = advanceK01BeaconPolicy(state);
  assert.equal(result.matchedBeaconCount, 1);
  assert.equal(result.nativeSuccessCount, 9);
});

test("a source-dead but semantically live qualifying building fails the blocker gate closed", () => {
  const state = createK01World();
  const source = state.sourceRuntimeProfile?.state as K01SourceRuntimeState;
  const target = source.entityRuntime.entities.find(
    (record) => record.ownerRelation === 1 && state.units[record.semanticUnitId] !== undefined && unitDefinitions[state.units[record.semanticUnitId]!.kind].category === "building",
  );
  assert.ok(target);
  for (const unit of Object.values(state.units)) {
    if (unit.playerId === "cpu-1" && unitDefinitions[unit.kind].category === "building" && unit.id !== target.semanticUnitId) {
      delete state.units[unit.id];
    }
  }
  state.sourceRuntimeProfile = {
    ...state.sourceRuntimeProfile!,
    state: {
      ...source,
      entityRuntime: {
        ...source.entityRuntime,
        entities: source.entityRuntime.entities.map((record) => record.slot === target.slot ? { ...record, health: 0 } : record),
      },
    },
  };
  appendBeaconCompletion(state, "local-player-source-dead-live-beacon", { x: 20, y: 20 });

  const result = advanceK01BeaconPolicy(state);
  assert.equal(result.matchedBeaconCount, 0);
  assert.equal(result.nativeSuccessCount, 0);
});

test("team-equivalent qualifying entities do not block the K01 gate", () => {
  const state = createK01World();
  state.players["local-player"]!.teamId = "shared-k01-team";
  state.players["cpu-1"]!.teamId = "shared-k01-team";
  appendBeaconCompletion(state, "local-player-allied-building-beacon", { x: 20, y: 20 });

  const result = advanceK01BeaconPolicy(state);
  assert.equal(result.matchedBeaconCount, 1);
  assert.equal(result.nativeSuccessCount, 9);
});

test("missing class or relation mapping fails the derived blocker gate closed", () => {
  const unknownClass = createK01World();
  removeOpeningHostileBuildings(unknownClass);
  const unknownClassUnit = createUnitState("cpu-1-unknown-class", "cpu-1", "house", { x: 40, y: 40 });
  unknownClass.units[unknownClassUnit.id] = unknownClassUnit;
  const unknownClassSource = unknownClass.sourceRuntimeProfile?.state as K01SourceRuntimeState;
  unknownClass.sourceRuntimeProfile = {
    ...unknownClass.sourceRuntimeProfile!,
    state: allocateK01SourceEntityRuntime(unknownClassSource, {
      semanticUnitId: unknownClassUnit.id,
      sourceRecordIndex: 0x7000,
      originalClass: 0xff,
      ownerRelation: 1,
      progress: 0x64,
      health: unknownClassUnit.health.current,
      position: unknownClassUnit.position,
      footprint: { width: 1, height: 1, evidence: "project-adaptation" },
    }).state,
  };
  appendBeaconCompletion(unknownClass, "local-player-unknown-class-beacon", { x: 20, y: 20 });
  const unknownClassResult = advanceK01BeaconPolicy(unknownClass);
  assert.equal(unknownClassResult.matchedBeaconCount, 0);
  assert.equal(unknownClassResult.nativeSuccessCount, 0);

  const unknownRelation = createK01World();
  removeOpeningHostileBuildings(unknownRelation);
  const unknownRelationUnit = createUnitState("cpu-1-unknown-relation", "cpu-1", "house", { x: 40, y: 40 });
  unknownRelation.units[unknownRelationUnit.id] = unknownRelationUnit;
  const unknownRelationSource = unknownRelation.sourceRuntimeProfile?.state as K01SourceRuntimeState;
  unknownRelation.sourceRuntimeProfile = {
    ...unknownRelation.sourceRuntimeProfile!,
    state: allocateK01SourceEntityRuntime(unknownRelationSource, {
      semanticUnitId: unknownRelationUnit.id,
      sourceRecordIndex: 0x7001,
      originalClass: 49,
      ownerRelation: 99,
      progress: 0x64,
      health: unknownRelationUnit.health.current,
      position: unknownRelationUnit.position,
      footprint: { width: 1, height: 1, evidence: "project-adaptation" },
    }).state,
  };
  appendBeaconCompletion(unknownRelation, "local-player-unknown-relation-beacon", { x: 20, y: 20 });
  const unknownRelationResult = advanceK01BeaconPolicy(unknownRelation);
  assert.equal(unknownRelationResult.matchedBeaconCount, 0);
  assert.equal(unknownRelationResult.nativeSuccessCount, 0);
});

test("two qualifying beacons execute ordered native blocks and later match owns repeated cells", () => {
  const state = createK01World();
  appendBeaconCompletion(state, "local-player-first-beacon", { x: 20, y: 20 });
  appendBeaconCompletion(state, "local-player-second-beacon", { x: 24, y: 20 });
  removeOpeningHostileBuildings(state);
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
