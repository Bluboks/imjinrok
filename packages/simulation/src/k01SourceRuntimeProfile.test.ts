import assert from "node:assert/strict";
import test from "node:test";
import {
  K01_SOURCE_RUNTIME_LEGACY_STATE_VERSION,
  K01_SOURCE_RUNTIME_ENTITY_STATE_VERSION,
  K01_SOURCE_RUNTIME_PROFILE_ID,
  K01_SOURCE_RUNTIME_STATE_VERSION,
  cloneSourceRuntimeProfileEnvelope,
  createInitialWorldState,
  createK01SourceRuntimeState,
  createSourceRuntimeProfileEnvelope,
  migrateK01SourceRuntimeStateV1,
  migrateK01SourceRuntimeStateV2,
  parseSourceRuntimeProfileEnvelope,
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
    ["unsupported version", { ...envelope, stateVersion: 4 }],
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

test("source profile envelope round-trips JSON without executable policy state", () => {
  const envelope = createSourceRuntimeProfileEnvelope(K01_SOURCE_RUNTIME_PROFILE_ID);
  const restored = cloneSourceRuntimeProfileEnvelope(JSON.parse(JSON.stringify(envelope)));
  assert.deepEqual(restored, envelope);
  assert.equal(JSON.stringify(restored).includes("createInitialState"), false);
  assert.equal(JSON.stringify(restored).includes("validateState"), false);
});
