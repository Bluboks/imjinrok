import assert from "node:assert/strict";
import test from "node:test";
import {
  K01_SOURCE_RUNTIME_LEGACY_STATE_VERSION,
  K01_SOURCE_RUNTIME_ENTITY_STATE_VERSION,
  K01_SOURCE_RUNTIME_PROFILE_ID,
  K01_SOURCE_RUNTIME_STATE_VERSION,
  K01_SOURCE_RUNTIME_LEGACY_FOOTPRINT_STATE_VERSION,
  K01_SOURCE_RUNTIME_LEGACY_RESULT_STATE_VERSION,
  cloneSourceRuntimeProfileEnvelope,
  createInitialWorldState,
  createK01SourceRuntimeState,
  createSourceRuntimeProfileEnvelope,
  allocateK01SourceEntityRuntime,
  migrateK01SourceRuntimeStateV1,
  migrateK01SourceRuntimeStateV2,
  migrateK01SourceRuntimeStateV3,
  parseSourceRuntimeProfileEnvelope,
  releaseK01SourceEntityRuntime,
  toWorldSnapshot,
  updateK01SourceRuntimeState,
  type K01SourceRuntimeState,
} from "./index.js";
import { createBlankMap, createImjinrokMapScaffold, defaultSkirmishScenario, imjinrokK01Scenario } from "../../shared/src/index.js";

test("generic fresh worlds omit the source runtime envelope and preserve the legacy JSON shape", () => {
  const state = createInitialWorldState(createBlankMap(), ["p1"]);
  const snapshot = toWorldSnapshot(state);

  assert.equal(Object.hasOwn(snapshot, "sourceRuntimeProfile"), false);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);
  assert.deepEqual(toWorldSnapshot(state), snapshot);
  assert.equal(JSON.stringify(snapshot).includes("source-runtime"), false);
});

test("K01 scenario seeds the canonical profile deterministically and keeps source fields in general runtime layers", () => {
  const map = createImjinrokMapScaffold(imjinrokK01Scenario.mapId);
  assert.ok(map);
  const first = createInitialWorldState(map, ["local-player", "cpu-1"], imjinrokK01Scenario);
  const second = createInitialWorldState(map, ["local-player", "cpu-1"], imjinrokK01Scenario);
  const profile = first.sourceRuntimeProfile;
  assert.ok(profile);
  assert.equal(profile.stateVersion, K01_SOURCE_RUNTIME_STATE_VERSION);
  const sourceState = profile.state as K01SourceRuntimeState;
  assert.equal(sourceState.entityRuntime.entities.length, 36);
  assert.equal(sourceState.entityRuntime.activeList.length, 36);
  assert.equal(sourceState.entityRuntime.activeList[0], 1199);
  assert.equal(sourceState.entityRuntime.entities.find((entity) => entity.sourceRecordIndex === 0)?.sourceRecordIndex, 0);
  assert.equal(sourceState.entityRuntime.entities.every((entity) => entity.active), true);
  assert.equal(sourceState.occupancy.width, 60);
  assert.equal(sourceState.occupancy.height, 60);
  assert.deepEqual(toWorldSnapshot(first), toWorldSnapshot(second));
  assert.equal(JSON.stringify(profile).includes("createInitialState"), false);
  assert.equal(defaultSkirmishScenario.sourceRuntimeProfileId, undefined);
});

test("K01 state updates are pure, clone-safe, and preserve strict v2 layers", () => {
  const initial = createK01SourceRuntimeState();
  const next = updateK01SourceRuntimeState(initial, { acceptedUpdateCount: 17 });

  assert.equal(initial.acceptedUpdateCount, 0);
  assert.equal(next.acceptedUpdateCount, 17);
  assert.deepEqual(next.entityRuntime, initial.entityRuntime);
  assert.deepEqual(next.occupancy, initial.occupancy);

  const envelope = createSourceRuntimeProfileEnvelope(K01_SOURCE_RUNTIME_PROFILE_ID);
  const modified = cloneSourceRuntimeProfileEnvelope({ ...envelope, state: next });
  const parsed = cloneSourceRuntimeProfileEnvelope(JSON.parse(JSON.stringify(modified)));
  assert.deepEqual(parsed, modified);
  (parsed.state as K01SourceRuntimeState).entityRuntime.activeTable[1] = 1;
  assert.equal((modified.state as K01SourceRuntimeState).entityRuntime.activeTable[1], 0);
});

test("K01 source envelope rejects malformed v2 values and keeps generic profile boundaries closed", () => {
  const envelope = createSourceRuntimeProfileEnvelope(K01_SOURCE_RUNTIME_PROFILE_ID);
  const invalidValues: readonly [string, unknown][] = [
    ["null", null],
    ["array", []],
    ["wrong profile id type", { ...envelope, profileId: 3 }],
    ["unknown profile id", { ...envelope, profileId: "missing:source-runtime" }],
    ["unsupported version", { ...envelope, stateVersion: K01_SOURCE_RUNTIME_STATE_VERSION + 1 }],
    ["missing state field", { profileId: envelope.profileId, stateVersion: envelope.stateVersion }],
    ["extra envelope field", { ...envelope, executable: () => true }],
    ["state array", { ...envelope, state: [] }],
    ["missing entity runtime", { ...envelope, state: { acceptedUpdateCount: 0, occupancy: { width: 0, height: 0, ownerSlots: [] } } }],
    ["active table wrong width", { ...envelope, state: { acceptedUpdateCount: 0, entityRuntime: { generationCounter: 0, activeTable: [], activeList: [], reuseAges: Array(1200).fill(0), entities: [] }, occupancy: { width: 0, height: 0, ownerSlots: [] } } }],
  ];

  for (const [label, value] of invalidValues) {
    assert.throws(() => cloneSourceRuntimeProfileEnvelope(value), label);
    assert.equal(parseSourceRuntimeProfileEnvelope(value), null, `${label} nullable parser`);
  }
});

test("v1 migration is explicit, accepts only empty legacy state, and rejects non-empty records", () => {
  const migrated = cloneSourceRuntimeProfileEnvelope({
    profileId: K01_SOURCE_RUNTIME_PROFILE_ID,
    stateVersion: K01_SOURCE_RUNTIME_LEGACY_STATE_VERSION,
    state: { acceptedUpdateCount: 9, entities: [] },
  });
  assert.equal(migrated.stateVersion, K01_SOURCE_RUNTIME_STATE_VERSION);
  assert.equal((migrated.state as K01SourceRuntimeState).acceptedUpdateCount, 9);
  assert.equal((migrated.state as K01SourceRuntimeState).entityRuntime.entities.length, 0);
  assert.throws(
    () => migrateK01SourceRuntimeStateV1({ acceptedUpdateCount: 0, entities: [{ slot: 1, generation: 0, active: true, health: 1 }] }),
    /rejected non-empty entities/,
  );
  assert.equal(
    parseSourceRuntimeProfileEnvelope({
      profileId: K01_SOURCE_RUNTIME_PROFILE_ID,
      stateVersion: K01_SOURCE_RUNTIME_LEGACY_STATE_VERSION,
      state: { acceptedUpdateCount: 0, entities: [{ slot: 1, generation: 0, active: true, health: 1 }] },
    }),
    null,
  );
});

test("A02 v2 migration adds only the strict T01 policy namespace", () => {
  const envelope = createSourceRuntimeProfileEnvelope(K01_SOURCE_RUNTIME_PROFILE_ID);
  const v2State = { ...envelope.state } as Record<string, unknown>;
  delete v2State.policies;
  const migrated = cloneSourceRuntimeProfileEnvelope({
    profileId: K01_SOURCE_RUNTIME_PROFILE_ID,
    stateVersion: K01_SOURCE_RUNTIME_ENTITY_STATE_VERSION,
    state: v2State,
  });
  assert.equal(migrated.stateVersion, K01_SOURCE_RUNTIME_STATE_VERSION);
  assert.equal((migrated.state as K01SourceRuntimeState).policies.beacon.eventCursorSequence, 0);
  assert.equal(migrateK01SourceRuntimeStateV2(v2State).entityRuntime.entities.length, 0);
});

test("v2 envelope migration also applies the legacy beacon footprint conversion", () => {
  const base = createK01SourceRuntimeState();
  const allocated = allocateK01SourceEntityRuntime({
    ...base,
    occupancy: { width: 4, height: 4, ownerSlots: Array.from({ length: 16 }, () => 0) },
  }, {
    semanticUnitId: "v2-legacy-beacon",
    sourceRecordIndex: 0x5200,
    originalClass: 52,
    ownerRelation: 0,
    progress: 0x64,
    health: 760,
    position: { x: 2, y: 2 },
    footprint: { width: 1, height: 1, evidence: "project-adaptation" },
  });
  const migrated = cloneSourceRuntimeProfileEnvelope({
    profileId: K01_SOURCE_RUNTIME_PROFILE_ID,
    stateVersion: K01_SOURCE_RUNTIME_ENTITY_STATE_VERSION,
    state: {
      acceptedUpdateCount: allocated.state.acceptedUpdateCount,
      entityRuntime: allocated.state.entityRuntime,
      occupancy: allocated.state.occupancy,
    },
  });
  assert.deepEqual(
    migrated.state.entityRuntime.entities[0]?.footprint,
    { width: 3, height: 3, evidence: "static-confirmed" },
  );
});

test("v3 migration expands legacy active beacons without rebuilding owner history", () => {
  const base = createK01SourceRuntimeState();
  const allocated = allocateK01SourceEntityRuntime({
    ...base,
    occupancy: { width: 8, height: 8, ownerSlots: Array.from({ length: 64 }, () => 0) },
  }, {
    semanticUnitId: "legacy-beacon",
    sourceRecordIndex: 0x5201,
    originalClass: 52,
    ownerRelation: 0,
    progress: 0x64,
    health: 760,
    position: { x: 3, y: 3 },
    footprint: { width: 1, height: 1, evidence: "project-adaptation" },
  });
  const ownerSlots = [...allocated.state.occupancy.ownerSlots];
  ownerSlots[3 * 8 + 3] = allocated.handle.slot;
  ownerSlots[2 * 8 + 3] = 777;
  ownerSlots[5 * 8 + 5] = allocated.handle.slot;
  const legacyState = {
    ...allocated.state,
    acceptedUpdateCount: 19,
    occupancy: { ...allocated.state.occupancy, ownerSlots },
  };
  const inputBeforeMigration = structuredClone(legacyState);

  const migrated = migrateK01SourceRuntimeStateV3(legacyState);
  assert.deepEqual(legacyState, inputBeforeMigration, "migration does not mutate the v3 save object");
  const record = migrated.entityRuntime.entities.find((entity) => entity.semanticUnitId === "legacy-beacon");
  assert.deepEqual(record?.footprint, { width: 3, height: 3, evidence: "static-confirmed" });
  assert.equal(migrated.acceptedUpdateCount, 19);
  assert.deepEqual(migrated.entityRuntime.activeList, legacyState.entityRuntime.activeList);
  assert.deepEqual(migrated.entityRuntime.activeTable, legacyState.entityRuntime.activeTable);
  assert.deepEqual(migrated.entityRuntime.reuseAges, legacyState.entityRuntime.reuseAges);
  assert.equal(migrated.occupancy.ownerSlots[2 * 8 + 3], 777, "foreign history is preserved");
  assert.equal(migrated.occupancy.ownerSlots[5 * 8 + 5], allocated.handle.slot, "same-slot stale history is preserved");
  for (let y = 2; y <= 4; y += 1) {
    for (let x = 2; x <= 4; x += 1) {
      const owner = migrated.occupancy.ownerSlots[y * 8 + x];
      assert.equal(owner === allocated.handle.slot || (x === 3 && y === 2 && owner === 777), true);
    }
  }

  const released = releaseK01SourceEntityRuntime(migrated, allocated.handle);
  for (let y = 2; y <= 4; y += 1) {
    for (let x = 2; x <= 4; x += 1) {
      const owner = released.occupancy.ownerSlots[y * 8 + x];
      assert.equal(owner === 0 || (x === 3 && y === 2 && owner === 777), true);
    }
  }
  assert.equal(released.occupancy.ownerSlots[5 * 8 + 5], allocated.handle.slot, "release does not erase preserved stale history outside the converted footprint");

  const envelope = cloneSourceRuntimeProfileEnvelope({
    profileId: K01_SOURCE_RUNTIME_PROFILE_ID,
    stateVersion: K01_SOURCE_RUNTIME_LEGACY_FOOTPRINT_STATE_VERSION,
    state: JSON.parse(JSON.stringify(legacyState)),
  });
  assert.equal(envelope.stateVersion, K01_SOURCE_RUNTIME_STATE_VERSION);
  assert.deepEqual(
    cloneSourceRuntimeProfileEnvelope(JSON.parse(JSON.stringify(envelope))),
    envelope,
    "the converted v4 envelope is idempotent after JSON save/load",
  );
});

test("v3 migration converts inactive beacons without creating new owner claims", () => {
  const base = createK01SourceRuntimeState();
  const allocated = allocateK01SourceEntityRuntime({
    ...base,
    occupancy: { width: 8, height: 8, ownerSlots: Array.from({ length: 64 }, () => 0) },
  }, {
    semanticUnitId: "released-legacy-beacon",
    sourceRecordIndex: 0x5202,
    originalClass: 52,
    ownerRelation: 0,
    progress: 0x64,
    health: 760,
    position: { x: 3, y: 3 },
    footprint: { width: 1, height: 1, evidence: "project-adaptation" },
  });
  const released = {
    ...allocated.state,
    occupancy: {
      ...allocated.state.occupancy,
      ownerSlots: allocated.state.occupancy.ownerSlots.map((owner, index) => index === 5 * 8 + 5 ? allocated.handle.slot : owner),
    },
  };
  const state = {
    ...released,
    entityRuntime: {
      ...released.entityRuntime,
      activeList: [],
      activeTable: released.entityRuntime.activeTable.map((value, index) => index === allocated.handle.slot ? 0 : value),
      entities: released.entityRuntime.entities.map((entity) => ({ ...entity, active: false })),
    },
  };

  const migrated = migrateK01SourceRuntimeStateV3(state);
  const record = migrated.entityRuntime.entities.find((entity) => entity.semanticUnitId === "released-legacy-beacon");
  assert.deepEqual(record?.footprint, { width: 3, height: 3, evidence: "static-confirmed" });
  assert.equal(migrated.occupancy.ownerSlots.filter((owner) => owner === allocated.handle.slot).length, 1);
});

test("v3 migration keeps proven and nonlegacy class-52 records unchanged", () => {
  const base = createK01SourceRuntimeState();
  const state = {
    ...base,
    occupancy: { width: 8, height: 8, ownerSlots: Array.from({ length: 64 }, () => 0) },
  };
  const admitted = allocateK01SourceEntityRuntime(state, {
    semanticUnitId: "current-beacon",
    sourceRecordIndex: 0x5203,
    originalClass: 52,
    ownerRelation: 0,
    progress: 0x64,
    health: 760,
    position: { x: 3, y: 3 },
    footprint: { width: 3, height: 3, evidence: "static-confirmed" },
  }).state;
  const migrated = migrateK01SourceRuntimeStateV3(admitted);
  assert.deepEqual(migrated, admitted);
});

test("v3 migration fills overlapping legacy beacons in source-slot order and skips map-edge cells", () => {
  const base = createK01SourceRuntimeState();
  let state = {
    ...base,
    occupancy: { width: 4, height: 4, ownerSlots: Array.from({ length: 16 }, () => 0) },
  };
  const first = allocateK01SourceEntityRuntime(state, {
    semanticUnitId: "legacy-beacon-a",
    sourceRecordIndex: 0x5204,
    originalClass: 52,
    ownerRelation: 0,
    progress: 0x64,
    health: 760,
    position: { x: 0, y: 0 },
    footprint: { width: 1, height: 1, evidence: "project-adaptation" },
  });
  state = first.state;
  const second = allocateK01SourceEntityRuntime(state, {
    semanticUnitId: "legacy-beacon-b",
    sourceRecordIndex: 0x5205,
    originalClass: 52,
    ownerRelation: 0,
    progress: 0x64,
    health: 760,
    position: { x: 1, y: 1 },
    footprint: { width: 1, height: 1, evidence: "project-adaptation" },
  });
  state = second.state;
  const migrated = migrateK01SourceRuntimeStateV3(state);
  const lowestSlot = Math.min(first.handle.slot, second.handle.slot);
  assert.equal(migrated.occupancy.ownerSlots[0], lowestSlot, "lowest slot claims the shared empty cell first");
  assert.equal(migrated.occupancy.ownerSlots[1 * 4 + 1], lowestSlot);
  assert.equal(migrated.entityRuntime.entities.every((entity) => entity.footprint.width === 3 && entity.footprint.height === 3), true);
});

test("v3 migration rejects an active legacy beacon when the occupancy map is missing", () => {
  const envelope = createSourceRuntimeProfileEnvelope(K01_SOURCE_RUNTIME_PROFILE_ID);
  const state = envelope.state as K01SourceRuntimeState;
  const active = {
    ...state,
    entityRuntime: {
      ...state.entityRuntime,
      activeList: [1],
      activeTable: state.entityRuntime.activeTable.map((value, index) => index === 1 ? 1 : value),
      entities: [{
        slot: 1,
        generation: 1,
        semanticUnitId: "missing-map-beacon",
        sourceRecordIndex: 0x5206,
        originalClass: 52,
        ownerRelation: 0,
        progress: 0x64,
        active: true,
        health: 760,
        position: { x: 0, y: 0 },
        footprint: { width: 1, height: 1, evidence: "project-adaptation" as const },
      }],
    },
  };
  assert.throws(
    () => migrateK01SourceRuntimeStateV3(active),
    /occupancy dimensions are empty/,
  );
});

test("v3 and v4 migrations accept actual pre-result policy shapes and mark clock conversion pending", () => {
  const envelope = createSourceRuntimeProfileEnvelope(K01_SOURCE_RUNTIME_PROFILE_ID);
  const legacyState = structuredClone(envelope.state) as { policies: Record<string, unknown> };
  delete legacyState.policies.result;

  const v3 = cloneSourceRuntimeProfileEnvelope({
    profileId: K01_SOURCE_RUNTIME_PROFILE_ID,
    stateVersion: K01_SOURCE_RUNTIME_LEGACY_FOOTPRINT_STATE_VERSION,
    state: legacyState,
  });
  const v4 = cloneSourceRuntimeProfileEnvelope({
    profileId: K01_SOURCE_RUNTIME_PROFILE_ID,
    stateVersion: K01_SOURCE_RUNTIME_LEGACY_RESULT_STATE_VERSION,
    state: legacyState,
  });

  assert.equal((v3.state as K01SourceRuntimeState).policies.result.legacyMigrationPending, true);
  assert.equal((v4.state as K01SourceRuntimeState).policies.result.legacyMigrationPending, true);
  assert.equal(Object.hasOwn((v3.state as K01SourceRuntimeState).policies, "result"), true);
  assert.equal(Object.hasOwn((v4.state as K01SourceRuntimeState).policies, "result"), true);
});

test("source profile envelope round-trips JSON without executable policy state", () => {
  const envelope = createSourceRuntimeProfileEnvelope(K01_SOURCE_RUNTIME_PROFILE_ID);
  const restored = cloneSourceRuntimeProfileEnvelope(JSON.parse(JSON.stringify(envelope)));
  assert.deepEqual(restored, envelope);
  assert.equal(JSON.stringify(restored).includes("createInitialState"), false);
  assert.equal(JSON.stringify(restored).includes("validateState"), false);
});
