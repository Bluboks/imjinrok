import assert from "node:assert/strict";
import test from "node:test";
import {
  cloneSourceRuntimeProfileEnvelope,
  createInitialWorldState,
  createK01SourceRuntimeState,
  createSourceRuntimeProfileEnvelope,
  K01_SOURCE_RUNTIME_PROFILE_ID,
  K01_SOURCE_RUNTIME_STATE_VERSION,
  parseSourceRuntimeProfileEnvelope,
  toWorldSnapshot,
  updateK01SourceRuntimeState,
  type K01SourceEntityState,
  type K01SourceRuntimeState,
} from "./index.js";
import { createBlankMap, defaultSkirmishScenario, imjinrokK01Scenario } from "../../shared/src/index.js";

test("generic fresh worlds omit the source runtime envelope and preserve the legacy JSON shape", () => {
  const state = createInitialWorldState(createBlankMap(), ["p1"]);
  const snapshot = toWorldSnapshot(state);

  assert.equal(Object.hasOwn(snapshot, "sourceRuntimeProfile"), false);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);
  assert.deepEqual(toWorldSnapshot(state), snapshot);
  assert.equal(JSON.stringify(snapshot).includes("source-runtime"), false);
});

test("K01 scenario opt-in creates the canonical profile and deterministic initial state", () => {
  const first = createInitialWorldState(createBlankMap({ id: imjinrokK01Scenario.mapId }), ["local-player"], imjinrokK01Scenario);
  const second = createInitialWorldState(createBlankMap({ id: imjinrokK01Scenario.mapId }), ["local-player"], imjinrokK01Scenario);

  assert.deepEqual(first.sourceRuntimeProfile, {
    profileId: K01_SOURCE_RUNTIME_PROFILE_ID,
    stateVersion: K01_SOURCE_RUNTIME_STATE_VERSION,
    state: {
      acceptedUpdateCount: 0,
      entities: [],
    },
  });
  assert.deepEqual(toWorldSnapshot(first).sourceRuntimeProfile, first.sourceRuntimeProfile);
  assert.equal(JSON.stringify(first.sourceRuntimeProfile).includes("createInitialState"), false);
  assert.deepEqual(first.sourceRuntimeProfile, second.sourceRuntimeProfile);
  assert.equal(defaultSkirmishScenario.sourceRuntimeProfileId, undefined);
});

test("K01 state updates are pure, clone-safe, and canonicalize insertion order", () => {
  const initial = createK01SourceRuntimeState();
  const entities: K01SourceEntityState[] = [
    { slot: 12, generation: 4, active: true, health: 320 },
    { slot: 3, generation: 0, active: false, health: 0 },
  ];
  const next = updateK01SourceRuntimeState(initial, {
    acceptedUpdateCount: 17,
    entities,
  });

  assert.deepEqual(initial, { acceptedUpdateCount: 0, entities: [] });
  assert.deepEqual(next, {
    acceptedUpdateCount: 17,
    entities: [entities[1], entities[0]],
  });

  entities[0].health = 1;
  assert.equal(next.entities[1]?.health, 320);

  const envelope = createSourceRuntimeProfileEnvelope(K01_SOURCE_RUNTIME_PROFILE_ID);
  const modified = cloneSourceRuntimeProfileEnvelope({
    ...envelope,
    state: next,
  });
  const parsed = cloneSourceRuntimeProfileEnvelope(JSON.parse(JSON.stringify(modified)));
  assert.deepEqual(parsed, modified);
  (parsed.state.entities as K01SourceEntityState[])[0]!.health = 99;
  assert.equal((modified.state.entities as K01SourceEntityState[])[0]!.health, 0);
});

test("K01 source envelope boundaries reject unknown ids, unsupported versions, malformed fields, and unsafe ranges", () => {
  const envelope = createSourceRuntimeProfileEnvelope(K01_SOURCE_RUNTIME_PROFILE_ID);
  const invalidValues: readonly [string, unknown][] = [
    ["null", null],
    ["array", []],
    ["wrong profile id type", { ...envelope, profileId: 3 }],
    ["unknown profile id", { ...envelope, profileId: "missing:source-runtime" }],
    ["unsupported version", { ...envelope, stateVersion: 2 }],
    ["missing state field", { profileId: envelope.profileId, stateVersion: envelope.stateVersion }],
    ["extra envelope field", { ...envelope, executable: () => true }],
    ["state array", { ...envelope, state: [] }],
    ["NaN count", { ...envelope, state: { acceptedUpdateCount: Number.NaN, entities: [] } }],
    ["infinite count", { ...envelope, state: { acceptedUpdateCount: Number.POSITIVE_INFINITY, entities: [] } }],
    ["missing state field", { ...envelope, state: { entities: [] } }],
    ["extra state field", { ...envelope, state: { acceptedUpdateCount: 0, entities: [], clock: 1 } }],
    ["slot out of range", { ...envelope, state: { acceptedUpdateCount: 0, entities: [{ slot: 0, generation: 0, active: true, health: 1 }] } }],
    ["generation out of range", { ...envelope, state: { acceptedUpdateCount: 0, entities: [{ slot: 1, generation: 65536, active: true, health: 1 }] } }],
    ["health out of range", { ...envelope, state: { acceptedUpdateCount: 0, entities: [{ slot: 1, generation: 0, active: true, health: 32768 }] } }],
    ["duplicate slots", { ...envelope, state: { acceptedUpdateCount: 0, entities: [{ slot: 1, generation: 0, active: true, health: 1 }, { slot: 1, generation: 1, active: false, health: 0 }] } }],
  ];

  for (const [label, value] of invalidValues) {
    assert.throws(() => cloneSourceRuntimeProfileEnvelope(value), label);
    assert.equal(parseSourceRuntimeProfileEnvelope(value), null, `${label} nullable parser`);
  }
});

test("source registry executable behavior is absent from JSON and unknown profile creation fails closed", () => {
  assert.throws(
    () => createSourceRuntimeProfileEnvelope("missing:source-runtime"),
    /Unknown source runtime profile 'missing:source-runtime'/,
  );

  const envelope = createSourceRuntimeProfileEnvelope(K01_SOURCE_RUNTIME_PROFILE_ID);
  const json = JSON.stringify(envelope);
  assert.equal(json.includes("createInitialState"), false);
  assert.equal(json.includes("validateState"), false);
  assert.equal(json.includes("cloneState"), false);
});

test("legacy snapshots remain accepted without inventing a schema version", () => {
  const legacy = toWorldSnapshot(createInitialWorldState(createBlankMap(), ["p1"]));
  const roundTrip = JSON.parse(JSON.stringify(legacy)) as typeof legacy;
  assert.equal(roundTrip.sourceRuntimeProfile, undefined);
  assert.deepEqual(roundTrip, legacy);
});

test("source profile updates preserve exact field round trips without advancing runtime", () => {
  let state: K01SourceRuntimeState = createK01SourceRuntimeState();
  state = updateK01SourceRuntimeState(state, { acceptedUpdateCount: 0xffffffff });
  state = updateK01SourceRuntimeState(state, {
    entities: [{ slot: 1199, generation: 0xffff, active: false, health: -0x8000 }],
  });

  const envelope = cloneSourceRuntimeProfileEnvelope({
    profileId: K01_SOURCE_RUNTIME_PROFILE_ID,
    stateVersion: K01_SOURCE_RUNTIME_STATE_VERSION,
    state,
  });
  const restored = cloneSourceRuntimeProfileEnvelope(JSON.parse(JSON.stringify(envelope)));
  assert.deepEqual(restored, envelope);
  assert.equal((restored.state as K01SourceRuntimeState).acceptedUpdateCount, 0xffffffff);
  assert.deepEqual((restored.state as K01SourceRuntimeState).entities, [
    { slot: 1199, generation: 0xffff, active: false, health: -0x8000 },
  ]);
});
