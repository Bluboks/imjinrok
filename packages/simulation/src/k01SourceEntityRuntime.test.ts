import assert from "node:assert/strict";
import test from "node:test";
import {
  K01_SOURCE_ENTITY_SLOT_MAX,
  K01_SOURCE_ENTITY_SLOT_MIN,
  K01_SOURCE_GENERATION_MAX,
  admitCompletedK01ConstructionRuntime,
  admitK01SourceEntityRuntime,
  allocateK01SourceEntityRuntime,
  clearK01SourceOccupancy,
  cloneSourceRuntimeProfileEnvelope,
  createK01SourceRuntimeState,
  getK01SourceEntityHandleBySemanticUnitIdRuntime,
  releaseK01SourceEntityRuntime,
  validateK01SourceEntityHandleRuntime,
  writeK01SourceOccupancy,
  type K01SourceEntityAdmissionRequest,
  type K01SourceRuntimeState,
} from "./index.js";
import { createBlankMap, createImjinrokMapScaffold, imjinrokK01Scenario } from "../../shared/src/index.js";
import { createInitialWorldState, toWorldSnapshot } from "./index.js";

function request(index: number, position = { x: 3, y: 3 }): K01SourceEntityAdmissionRequest {
  return {
    semanticUnitId: `unit-${index}`,
    sourceRecordIndex: index,
    originalClass: index === 52 ? 52 : 2,
    ownerRelation: 0,
    progress: 0x64,
    health: 100,
    position,
    footprint: { width: 1, height: 1, evidence: "project-adaptation" },
  };
}

function runtimeState(): K01SourceRuntimeState {
  const state = createK01SourceRuntimeState();
  return {
    ...state,
    occupancy: { width: 8, height: 8, ownerSlots: Array.from({ length: 64 }, () => 0) },
  };
}

function assertCurrentMappingsUnique(state: K01SourceRuntimeState): void {
  const entities = state.entityRuntime.entities;
  const active = entities.filter((entity) => entity.active);
  assert.equal(new Set(entities.map((entity) => entity.slot)).size, entities.length, "one record per source slot");
  assert.equal(new Set(active.map((entity) => entity.semanticUnitId)).size, active.length, "active semantic mappings are unique");
  assert.equal(new Set(active.map((entity) => entity.sourceRecordIndex)).size, active.length, "active source mappings are unique");
}

test("allocator preserves source slot range, later tie-break, generation WORD wrap, and stale handles", () => {
  let state = runtimeState();
  const first = allocateK01SourceEntityRuntime(state, request(1));
  state = first.state;
  const second = allocateK01SourceEntityRuntime(state, request(2, { x: 4, y: 3 }));
  state = second.state;
  assert.deepEqual(state.entityRuntime.activeList, [K01_SOURCE_ENTITY_SLOT_MAX, K01_SOURCE_ENTITY_SLOT_MAX - 1]);
  assert.equal(first.handle.slot, K01_SOURCE_ENTITY_SLOT_MAX);
  assert.equal(first.handle.generation, 1);
  assert.equal(second.handle.generation, 2);
  assert.equal(validateK01SourceEntityHandleRuntime(state, first.handle).semanticUnitId, "unit-1");

  state = releaseK01SourceEntityRuntime(state, first.handle);
  assert.deepEqual(state.entityRuntime.activeList, [second.handle.slot], "release uses active-list swap-last");
  assert.throws(() => validateK01SourceEntityHandleRuntime(state, first.handle), /stale or inactive/);

  const wrapState: K01SourceRuntimeState = {
    ...runtimeState(),
    entityRuntime: {
      ...runtimeState().entityRuntime,
      generationCounter: K01_SOURCE_GENERATION_MAX,
    },
  };
  const wrapped = allocateK01SourceEntityRuntime(wrapState, request(3));
  assert.equal(wrapped.handle.generation, 0);
  assert.equal(wrapped.handle.slot >= K01_SOURCE_ENTITY_SLOT_MIN, true);
});

test("allocator rejects slot 0/full capacity and preserves signed reuse-age ordering", () => {
  let state = runtimeState();
  for (let index = 0; index < K01_SOURCE_ENTITY_SLOT_MAX; index += 1) {
    state = allocateK01SourceEntityRuntime(state, request(index)).state;
  }
  assert.equal(state.entityRuntime.activeList.length, K01_SOURCE_ENTITY_SLOT_MAX);
  assert.throws(() => allocateK01SourceEntityRuntime(state, request(5000)), /slot 0 is failure/);

  const tie = runtimeState();
  const first = allocateK01SourceEntityRuntime(tie, request(1));
  assert.equal(first.state.entityRuntime.reuseAges[K01_SOURCE_ENTITY_SLOT_MAX], 1);
  assert.equal(first.state.entityRuntime.reuseAges[K01_SOURCE_ENTITY_SLOT_MAX - 1], 1);
  const ageWrap: K01SourceRuntimeState = {
    ...runtimeState(),
    entityRuntime: {
      ...runtimeState().entityRuntime,
      reuseAges: runtimeState().entityRuntime.reuseAges.map((age, index) => index === K01_SOURCE_ENTITY_SLOT_MAX ? 0x7fff : age),
    },
  };
  const wrappedAge = allocateK01SourceEntityRuntime(ageWrap, request(2));
  assert.equal(wrappedAge.state.entityRuntime.reuseAges[K01_SOURCE_ENTITY_SLOT_MAX], -0x8000);
});

test("released source slots replace retired records on reuse and survive save/load", () => {
  let state: K01SourceRuntimeState = {
    ...runtimeState(),
    entityRuntime: {
      ...runtimeState().entityRuntime,
      generationCounter: K01_SOURCE_GENERATION_MAX,
    },
  };
  const initialHandles = [];
  for (let index = 0; index < K01_SOURCE_ENTITY_SLOT_MAX; index += 1) {
    const allocated = allocateK01SourceEntityRuntime(state, request(index));
    initialHandles.push(allocated.handle);
    state = allocated.state;
  }
  const retired = initialHandles[0]!;
  assert.equal(retired.slot, K01_SOURCE_ENTITY_SLOT_MAX);
  assert.equal(retired.generation, 0, "generation WORD wraps on first allocation");
  state = releaseK01SourceEntityRuntime(state, retired);
  assert.equal(state.entityRuntime.entities.length, K01_SOURCE_ENTITY_SLOT_MAX);

  const reused = allocateK01SourceEntityRuntime(state, {
    ...request(0xbeef, { x: 4, y: 4 }),
    semanticUnitId: "reused-source",
    sourceRecordIndex: 0xbeef,
  });
  state = reused.state;
  assert.equal(reused.handle.slot, retired.slot);
  assert.notEqual(reused.handle.generation, retired.generation);
  assert.equal(state.entityRuntime.entities.length, K01_SOURCE_ENTITY_SLOT_MAX, "reuse replaces, never appends");
  assert.equal(state.entityRuntime.entities.filter((entity) => entity.slot === retired.slot).length, 1);
  assert.equal(getK01SourceEntityHandleBySemanticUnitIdRuntime(state, "unit-0"), undefined);
  assert.deepEqual(getK01SourceEntityHandleBySemanticUnitIdRuntime(state, "reused-source"), reused.handle);
  assert.throws(() => validateK01SourceEntityHandleRuntime(state, retired), /stale or inactive/);
  assert.equal(validateK01SourceEntityHandleRuntime(state, reused.handle).semanticUnitId, "reused-source");

  const occupied = writeK01SourceOccupancy(state, reused.handle);
  assert.equal(occupied.occupancy.ownerSlots[4 * 8 + 4], reused.handle.slot);
  const cleared = clearK01SourceOccupancy(occupied, reused.handle);
  assert.equal(cleared.occupancy.ownerSlots[4 * 8 + 4], 0);

  const roundTripped = cloneSourceRuntimeProfileEnvelope({
    profileId: "k01:source-runtime",
    stateVersion: 3,
    state: JSON.parse(JSON.stringify(cleared)),
  });
  assert.equal(roundTripped.state.entityRuntime.entities.length, K01_SOURCE_ENTITY_SLOT_MAX);
  assert.equal(roundTripped.state.entityRuntime.entities.filter((entity) => entity.slot === retired.slot).length, 1);
  assert.deepEqual(
    roundTripped.state.entityRuntime.entities.find((entity) => entity.slot === retired.slot)?.semanticUnitId,
    "reused-source",
  );
});

test("ordinary mostly-free reuse permits the same retired semantic and source mapping", () => {
  const originalRequest = request(101);
  let state = runtimeState();
  const original = allocateK01SourceEntityRuntime(state, originalRequest);
  state = releaseK01SourceEntityRuntime(original.state, original.handle);

  const reused = allocateK01SourceEntityRuntime(state, originalRequest);
  state = reused.state;
  assert.equal(original.handle.slot, K01_SOURCE_ENTITY_SLOT_MAX);
  assert.equal(reused.handle.slot, K01_SOURCE_ENTITY_SLOT_MAX - 1, "reuse-age winner is a different free slot");
  assert.notEqual(reused.handle.slot, original.handle.slot);
  assert.throws(() => validateK01SourceEntityHandleRuntime(state, original.handle), /stale or inactive/);
  assert.deepEqual(getK01SourceEntityHandleBySemanticUnitIdRuntime(state, originalRequest.semanticUnitId), reused.handle);
  assertCurrentMappingsUnique(state);
  const roundTripped = cloneSourceRuntimeProfileEnvelope({
    profileId: "k01:source-runtime",
    stateVersion: 3,
    state: JSON.parse(JSON.stringify(state)),
  });
  assertCurrentMappingsUnique(roundTripped.state);
  assert.deepEqual(roundTripped.state, state);
});

test("ordinary reuse permits the same semantic mapping with a new source index", () => {
  const originalRequest = request(102);
  let state = runtimeState();
  const original = allocateK01SourceEntityRuntime(state, originalRequest);
  state = releaseK01SourceEntityRuntime(original.state, original.handle);

  const reused = allocateK01SourceEntityRuntime(state, {
    ...originalRequest,
    sourceRecordIndex: originalRequest.sourceRecordIndex + 1,
  });
  state = reused.state;
  assert.equal(state.entityRuntime.entities.filter((entity) => entity.active && entity.semanticUnitId === originalRequest.semanticUnitId).length, 1);
  assert.equal(state.entityRuntime.entities.filter((entity) => entity.active && entity.sourceRecordIndex === originalRequest.sourceRecordIndex + 1).length, 1);
  assertCurrentMappingsUnique(state);
});

test("ordinary reuse permits a new semantic mapping with the same retired source index", () => {
  const originalRequest = request(103);
  let state = runtimeState();
  const original = allocateK01SourceEntityRuntime(state, originalRequest);
  state = releaseK01SourceEntityRuntime(original.state, original.handle);

  const reused = allocateK01SourceEntityRuntime(state, {
    ...originalRequest,
    semanticUnitId: "replacement-semantic",
  });
  state = reused.state;
  assert.equal(state.entityRuntime.entities.filter((entity) => entity.active && entity.semanticUnitId === "replacement-semantic").length, 1);
  assert.equal(state.entityRuntime.entities.filter((entity) => entity.active && entity.sourceRecordIndex === originalRequest.sourceRecordIndex).length, 1);
  assertCurrentMappingsUnique(state);
});

test("active semantic and source mappings still reject explicit duplicates", () => {
  const originalRequest = request(104);
  let state = runtimeState();
  const original = allocateK01SourceEntityRuntime(state, originalRequest);
  state = original.state;
  assert.throws(
    () => allocateK01SourceEntityRuntime(state, { ...originalRequest, sourceRecordIndex: originalRequest.sourceRecordIndex + 1 }),
    /semantic mapping already exists/,
  );
  assert.throws(
    () => allocateK01SourceEntityRuntime(state, { ...originalRequest, semanticUnitId: "different-active-semantic" }),
    /source record mapping already exists/,
  );
  assert.equal(state.entityRuntime.entities.filter((entity) => entity.active).length, 1);
  assertCurrentMappingsUnique(state);
});

test("occupancy stores slot WORD only, validates footprint bounds/collision, and clears safely", () => {
  let state = runtimeState();
  const first = admitK01SourceEntityRuntime(state, request(1, { x: 3, y: 3 }));
  state = first.state;
  const centerIndex = 3 * 8 + 3;
  assert.equal(state.occupancy.ownerSlots[centerIndex], first.handle.slot);
  assert.deepEqual(Object.keys(state.occupancy), ["width", "height", "ownerSlots"]);
  assert.throws(() => admitK01SourceEntityRuntime(state, request(2, { x: 3, y: 3 })), /occupancy collision/);
  assert.throws(
    () => admitK01SourceEntityRuntime(state, { ...request(2, { x: 0, y: 0 }), footprint: { width: 3, height: 3, evidence: "static-confirmed" } }),
    /outside map/,
  );
  const cleared = clearK01SourceOccupancy(state, first.handle);
  assert.equal(cleared.occupancy.ownerSlots[centerIndex], 0);
  const rewritten = writeK01SourceOccupancy(cleared, first.handle);
  assert.equal(rewritten.occupancy.ownerSlots[centerIndex], first.handle.slot);
});

test("completed class52 construction admission is explicit, observable, and not a trigger consumer", () => {
  let state = runtimeState();
  const requestBase = {
    semanticUnitId: "local-player-beacon-1",
    sourceRecordIndex: 0x5201,
    originalClass: 52,
    ownerRelation: 0,
    health: 760,
    position: { x: 4, y: 4 },
    footprint: { width: 1, height: 1, evidence: "project-adaptation" as const },
    timingClassification: "intentional-adaptation" as const,
  };
  const admitted = admitCompletedK01ConstructionRuntime(state, requestBase);
  state = admitted.state;
  const beacon = validateK01SourceEntityHandleRuntime(state, admitted.handle);
  assert.equal(beacon.originalClass, 52);
  assert.equal(beacon.progress, 0x64);
  assert.equal(getK01SourceEntityHandleBySemanticUnitIdRuntime(state, "local-player-beacon-1")?.slot, admitted.handle.slot);
  assert.throws(() => admitCompletedK01ConstructionRuntime(state, { ...requestBase, semanticUnitId: "second", sourceRecordIndex: 0x5202 }), /occupancy collision/);
  assert.throws(() => admitCompletedK01ConstructionRuntime(state, { ...requestBase, semanticUnitId: "oob", sourceRecordIndex: 0x5203, position: { x: 0, y: 0 }, footprint: { width: 3, height: 3, evidence: "static-confirmed" } }), /outside map/);
  assert.throws(() => admitCompletedK01ConstructionRuntime(state, { ...requestBase, semanticUnitId: "wrong-class", sourceRecordIndex: 0x5204, originalClass: 51 }), /expected class 52/);
});

test("canonical K01 opening seeds 36 stable source records and preserves source/adapted footprints", () => {
  const map = createImjinrokMapScaffold(imjinrokK01Scenario.mapId);
  assert.ok(map);
  const state = createInitialWorldState(map, ["local-player", "cpu-1"], imjinrokK01Scenario);
  const source = state.sourceRuntimeProfile?.state as K01SourceRuntimeState | undefined;
  assert.ok(source);
  assert.equal(source.entityRuntime.entities.length, 36);
  assert.equal(source.entityRuntime.entities.every((entity) => entity.progress === 0x64), true);
  assert.deepEqual(
    [...source.entityRuntime.entities.map((entity) => entity.sourceRecordIndex)].sort((left, right) => left - right),
    Array.from({ length: 36 }, (_, index) => index),
  );
  const townCenter = source.entityRuntime.entities.find((entity) => entity.semanticUnitId === "local-player-source-0x31-5-4");
  const villager = source.entityRuntime.entities.find((entity) => entity.semanticUnitId === "local-player-source-0x07-7-6");
  assert.equal(townCenter?.footprint.evidence, "static-confirmed");
  assert.deepEqual(townCenter?.footprint, { width: 3, height: 3, evidence: "static-confirmed" });
  assert.deepEqual(villager?.footprint, { width: 1, height: 1, evidence: "project-adaptation" });
  assert.equal(new Set(source.entityRuntime.entities.map((entity) => entity.semanticUnitId)).size, 36);
  assert.deepEqual(toWorldSnapshot(state), JSON.parse(JSON.stringify(toWorldSnapshot(state))));
});

test("generic scenarios remain outside the K01 source runtime boundary", () => {
  const state = createInitialWorldState(createBlankMap(), ["p1"]);
  assert.equal(state.sourceRuntimeProfile, undefined);
});
