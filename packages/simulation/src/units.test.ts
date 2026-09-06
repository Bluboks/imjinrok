import assert from "node:assert/strict";
import test from "node:test";
import {
  admitK01NativeSourceEntityRuntime,
  createInitialWorldState,
  createSourceRuntimeProfileEnvelope,
  registerSourceRuntimeProfile,
  toWorldSnapshot,
  validateK01SourceEntityHandleRuntime,
  type K01SourceRuntimeState,
  type SourceRuntimeProfile,
  type WorldState,
} from "./index.js";
import { createBlankMap, createImjinrokMapScaffold, imjinrokK01Scenario } from "../../shared/src/index.js";
import { createUnitState } from "./entities.js";
import { removeUnitFromWorld } from "./units.js";

function createK01World(): WorldState {
  const map = createImjinrokMapScaffold(imjinrokK01Scenario.mapId);
  assert.ok(map);
  return createInitialWorldState(map, ["local-player", "cpu-1"], imjinrokK01Scenario);
}

function createGenericWorld(): WorldState {
  return createInitialWorldState(createBlankMap({ width: 8, height: 8 }), ["p1"]);
}

interface TestProfileState extends Record<string, unknown> {
  removedUnitIds: string[];
}

function validateTestProfileState(value: unknown): asserts value is TestProfileState {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("test source state must be an object");
  }
  const state = value as { removedUnitIds?: unknown };
  if (!Array.isArray(state.removedUnitIds) || state.removedUnitIds.some((unitId) => typeof unitId !== "string")) {
    throw new TypeError("test source state removedUnitIds must be string[]");
  }
}

function createTestProfile(
  id: string,
  removeSemanticUnit?: SourceRuntimeProfile["removeSemanticUnit"],
): SourceRuntimeProfile {
  const profile: SourceRuntimeProfile = {
    id,
    stateVersion: 1,
    createInitialState: () => ({ removedUnitIds: [] }),
    validateState: validateTestProfileState,
    cloneState(value) {
      validateTestProfileState(value);
      return {
        ...value,
        removedUnitIds: [...value.removedUnitIds],
      };
    },
    ...(removeSemanticUnit === undefined ? {} : { removeSemanticUnit }),
  };
  return profile;
}

function attachUnit(state: WorldState, unitId: string, playerId = "p1"): void {
  state.units[unitId] = createUnitState(unitId, playerId, "villager", { x: 2, y: 2 });
}

test("removing a mapped K01 unit releases its source slot and preserves a later native owner", () => {
  const state = createK01World();
  const first = createUnitState("source-first", "local-player", "villager", { x: 59, y: 59 });
  const second = createUnitState("source-second", "local-player", "villager", { x: 59, y: 59 });
  state.units[first.id] = first;
  state.units[second.id] = second;

  const source = state.sourceRuntimeProfile!.state as K01SourceRuntimeState;
  const firstAdmission = admitK01NativeSourceEntityRuntime(source, {
    semanticUnitId: first.id,
    sourceRecordIndex: 0x7000,
    originalClass: 12,
    ownerRelation: 0,
    progress: 0x64,
    health: first.health.current,
    position: first.position,
    footprint: { width: 1, height: 1, evidence: "static-confirmed" },
    mapWidth: state.map.width,
    mapHeight: state.map.height,
  });
  assert.equal(firstAdmission.outcome, "success");
  assert.ok(firstAdmission.outcome === "success");
  const secondAdmission = admitK01NativeSourceEntityRuntime(firstAdmission.state, {
    semanticUnitId: second.id,
    sourceRecordIndex: 0x7001,
    originalClass: 13,
    ownerRelation: 0,
    progress: 0x64,
    health: second.health.current,
    position: second.position,
    footprint: { width: 1, height: 1, evidence: "static-confirmed" },
    mapWidth: state.map.width,
    mapHeight: state.map.height,
  });
  assert.equal(secondAdmission.outcome, "success");
  assert.ok(secondAdmission.outcome === "success");
  state.sourceRuntimeProfile = { ...state.sourceRuntimeProfile!, state: secondAdmission.state };

  assert.equal(removeUnitFromWorld(state, first.id), true);
  const after = state.sourceRuntimeProfile!.state as K01SourceRuntimeState;
  assert.equal(after.entityRuntime.activeTable[firstAdmission.handle.slot], 0);
  assert.equal(after.entityRuntime.activeList.includes(firstAdmission.handle.slot), false);
  assert.equal(after.occupancy.ownerSlots[59 * after.occupancy.width + 59], secondAdmission.handle.slot);
  assert.equal(after.entityRuntime.entities.find((record) => record.slot === firstAdmission.handle.slot)?.active, false);
  assert.throws(() => validateK01SourceEntityHandleRuntime(after, firstAdmission.handle), /stale or inactive/);
  assert.equal(state.units[first.id], undefined);
  assert.ok(state.units[second.id]);
});

test("mapped zero-health removal succeeds once, while unmapped project units leave source state unchanged", () => {
  const state = createK01World();
  const dead = createUnitState("mapped-zero-health", "local-player", "villager", { x: 58, y: 59 });
  dead.health.current = 0;
  state.units[dead.id] = dead;
  const source = state.sourceRuntimeProfile!.state as K01SourceRuntimeState;
  const admitted = admitK01NativeSourceEntityRuntime(source, {
    semanticUnitId: dead.id,
    sourceRecordIndex: 0x7002,
    originalClass: 12,
    ownerRelation: 0,
    progress: 0x64,
    health: 0,
    position: dead.position,
    footprint: { width: 1, height: 1, evidence: "static-confirmed" },
    mapWidth: state.map.width,
    mapHeight: state.map.height,
  });
  assert.equal(admitted.outcome, "success");
  assert.ok(admitted.outcome === "success");
  state.sourceRuntimeProfile = { ...state.sourceRuntimeProfile!, state: admitted.state };

  assert.equal(removeUnitFromWorld(state, dead.id), true);
  assert.equal(removeUnitFromWorld(state, dead.id), false);
  const sourceAfterMappedRemoval = structuredClone(state.sourceRuntimeProfile);

  const unmapped = createUnitState("unmapped-project-unit", "local-player", "villager", { x: 2, y: 2 });
  state.units[unmapped.id] = unmapped;
  assert.equal(removeUnitFromWorld(state, unmapped.id), true);
  assert.deepEqual(state.sourceRuntimeProfile, sourceAfterMappedRemoval);
});

test("profile removal hooks are isolated and commit only valid return state", () => {
  const profileId = "test:source-removal-hook";
  const unregister = registerSourceRuntimeProfile(
    createTestProfile(profileId, (state, unitId) => ({
      ...state,
      removedUnitIds: [...(state.removedUnitIds as string[]), unitId],
    })),
  );
  try {
    const state = createGenericWorld();
    state.sourceRuntimeProfile = createSourceRuntimeProfileEnvelope(profileId);
    attachUnit(state, "hook-target");
    const removed = removeUnitFromWorld(state, "hook-target");
    assert.equal(removed, true);
    assert.deepEqual((state.sourceRuntimeProfile?.state as TestProfileState).removedUnitIds, ["hook-target"]);
  } finally {
    unregister();
  }
});

test("profile removal throw and invalid envelope/state output preserve unit, references, and source state", () => {
  const throwingId = "test:source-removal-throw";
  const unregisterThrowing = registerSourceRuntimeProfile(
    createTestProfile(throwingId, (state) => {
      validateTestProfileState(state);
      state.removedUnitIds.push("mutated-isolated-clone");
      throw new Error("source removal failed");
    }),
  );
  try {
    const state = createGenericWorld();
    state.sourceRuntimeProfile = createSourceRuntimeProfileEnvelope(throwingId);
    attachUnit(state, "hook-target");
    const worker = createUnitState("reference-worker", "p1", "villager", { x: 3, y: 2 });
    worker.currentOrder = { type: "attack-unit", targetUnitId: "hook-target" };
    state.units[worker.id] = worker;
    const before = structuredClone({ unit: state.units["hook-target"], worker: state.units[worker.id], source: state.sourceRuntimeProfile });
    assert.throws(() => removeUnitFromWorld(state, "hook-target"), /source removal failed/);
    assert.deepEqual(
      { unit: state.units["hook-target"], worker: state.units[worker.id], source: state.sourceRuntimeProfile },
      before,
    );
  } finally {
    unregisterThrowing();
  }

  const invalidOutputId = "test:source-removal-invalid-output";
  const unregisterInvalid = registerSourceRuntimeProfile(
    createTestProfile(invalidOutputId, (state) => ({ ...state, invalid: Number.NaN })),
  );
  try {
    const state = createGenericWorld();
    state.sourceRuntimeProfile = createSourceRuntimeProfileEnvelope(invalidOutputId);
    attachUnit(state, "invalid-output-target");
    const before = structuredClone(state.sourceRuntimeProfile);
    assert.throws(() => removeUnitFromWorld(state, "invalid-output-target"), /non-finite number/);
    assert.ok(state.units["invalid-output-target"]);
    assert.deepEqual(state.sourceRuntimeProfile, before);
  } finally {
    unregisterInvalid();
  }
});

test("unknown or malformed source envelopes fail before semantic removal", () => {
  for (const envelope of [
    { profileId: "missing:source-profile", stateVersion: 1, state: {} },
    { profileId: "k01:source-runtime", stateVersion: 3, state: {} },
  ]) {
    const state = createK01World();
    attachUnit(state, "bad-envelope-target", "local-player");
    const beforeUnit = structuredClone(state.units["bad-envelope-target"]);
    state.sourceRuntimeProfile = envelope;
    assert.throws(() => removeUnitFromWorld(state, "bad-envelope-target"));
    assert.deepEqual(state.units["bad-envelope-target"], beforeUnit);
    assert.deepEqual(state.sourceRuntimeProfile, envelope);
  }
});

test("registry rejects a non-function semantic removal hook", () => {
  const invalidProfile = createTestProfile("test:invalid-source-removal-hook");
  Reflect.set(invalidProfile, "removeSemanticUnit", "invalid");
  assert.throws(
    () => registerSourceRuntimeProfile(invalidProfile),
    /removeSemanticUnit must be a function/,
  );
});

test("profiles without a removal hook preserve their state semantics", () => {
  const profileId = "test:source-removal-no-hook";
  const unregister = registerSourceRuntimeProfile(createTestProfile(profileId));
  try {
    const state = createGenericWorld();
    state.sourceRuntimeProfile = createSourceRuntimeProfileEnvelope(profileId);
    attachUnit(state, "no-hook-target");
    const before = structuredClone(state.sourceRuntimeProfile);
    assert.equal(removeUnitFromWorld(state, "no-hook-target"), true);
    assert.deepEqual(state.sourceRuntimeProfile, before);
  } finally {
    unregister();
  }
});

test("JSON roundtrip retains retired source state without a ghost unit", () => {
  const state = createK01World();
  const unit = createUnitState("roundtrip-source", "local-player", "villager", { x: 57, y: 59 });
  state.units[unit.id] = unit;
  const source = state.sourceRuntimeProfile!.state as K01SourceRuntimeState;
  const admitted = admitK01NativeSourceEntityRuntime(source, {
    semanticUnitId: unit.id,
    sourceRecordIndex: 0x7003,
    originalClass: 12,
    ownerRelation: 0,
    progress: 0x64,
    health: unit.health.current,
    position: unit.position,
    footprint: { width: 1, height: 1, evidence: "static-confirmed" },
    mapWidth: state.map.width,
    mapHeight: state.map.height,
  });
  assert.equal(admitted.outcome, "success");
  assert.ok(admitted.outcome === "success");
  state.sourceRuntimeProfile = { ...state.sourceRuntimeProfile!, state: admitted.state };
  assert.equal(removeUnitFromWorld(state, unit.id), true);

  const restored = JSON.parse(JSON.stringify(toWorldSnapshot(state))) as WorldState;
  assert.equal(restored.units[unit.id], undefined);
  const retired = (restored.sourceRuntimeProfile!.state as K01SourceRuntimeState).entityRuntime.entities.find(
    (record) => record.semanticUnitId === unit.id,
  );
  assert.ok(retired);
  assert.equal(retired.active, false);
  assert.equal(
    (restored.sourceRuntimeProfile!.state as K01SourceRuntimeState).entityRuntime.activeList.includes(retired.slot),
    false,
  );
});
