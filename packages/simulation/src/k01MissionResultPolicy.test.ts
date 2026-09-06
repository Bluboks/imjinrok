import assert from "node:assert/strict";
import test from "node:test";
import { createImjinrokMapScaffold, imjinrokK01Scenario } from "../../shared/src/index.js";
import {
  advanceK01MissionResultClockElapsed,
  advanceK01MissionResultPolicy,
  advanceWorldTick,
  completeK01MissionScript,
  createInitialWorldState,
  getK01MissionResultClockSample,
  normalizeK01MissionResultStateForWorld,
  type K01SourceRuntimeState,
  type WorldState,
} from "./index.js";

function createK01World(): WorldState {
  const map = createImjinrokMapScaffold(imjinrokK01Scenario.mapId);
  assert.ok(map);
  return createInitialWorldState(map, ["local-player", "cpu-1"], imjinrokK01Scenario);
}

function updateSource(state: WorldState, update: (source: K01SourceRuntimeState) => K01SourceRuntimeState): void {
  const envelope = state.sourceRuntimeProfile;
  assert.ok(envelope);
  state.sourceRuntimeProfile = { ...envelope, state: update(envelope.state as K01SourceRuntimeState) };
}

test("legacy result normalization backdates the clock and restores pending K0120 presentation", () => {
  const state = createK01World();
  state.tick = 48;
  updateSource(state, (source) => ({
    ...source,
    policies: {
      ...source.policies,
      beacon: { ...source.policies.beacon, triggerFlag: 1, scriptBusy: false, scriptPostState: 0 },
      result: { ...source.policies.result, legacyMigrationPending: true },
    },
  }));

  normalizeK01MissionResultStateForWorld(state);

  const source = state.sourceRuntimeProfile?.state as K01SourceRuntimeState;
  assert.equal(source.policies.result.clockMilliseconds, 2001);
  assert.equal(source.policies.result.submillisecondRemainder, 0);
  assert.equal(source.policies.result.legacyMigrationPending, false);
  assert.equal(source.policies.beacon.scriptBusy, true);
  assert.equal(source.policies.beacon.scriptPostState, 1);
});

test("legacy result normalization preserves terminal status and does not invent dialogue state", () => {
  const state = createK01World();
  state.scenario.status = "victory";
  updateSource(state, (source) => ({
    ...source,
    policies: {
      ...source.policies,
      beacon: { ...source.policies.beacon, triggerFlag: 1, scriptBusy: false, scriptPostState: 0 },
      result: { ...source.policies.result, legacyMigrationPending: true },
    },
  }));

  normalizeK01MissionResultStateForWorld(state);

  const source = state.sourceRuntimeProfile?.state as K01SourceRuntimeState;
  assert.equal(source.policies.beacon.scriptBusy, false);
  assert.equal(source.policies.beacon.scriptPostState, 0);
  assert.equal(state.scenario.status, "victory");
});

test("legacy result normalization backdates only failed protected objectives", () => {
  const state = createK01World();
  state.tick = 48;
  const objective = state.scenario.objectives["protect-ryu-seong-ryong"];
  assert.ok(objective);
  objective.failedAtTick = 24;
  updateSource(state, (source) => ({
    ...source,
    policies: {
      ...source.policies,
      result: { ...source.policies.result, legacyMigrationPending: true },
    },
  }));

  normalizeK01MissionResultStateForWorld(state);

  const source = state.sourceRuntimeProfile?.state as K01SourceRuntimeState;
  assert.equal(source.policies.result.lossTimer, 0);
  objective.status = "failed";
  updateSource(state, (current) => ({
    ...current,
    policies: {
      ...current.policies,
      result: { ...current.policies.result, legacyMigrationPending: true, lossTimer: 0 },
    },
  }));

  normalizeK01MissionResultStateForWorld(state);

  assert.equal((state.sourceRuntimeProfile?.state as K01SourceRuntimeState).policies.result.lossTimer, 1001);
});

test("result clock keeps fractional elapsed time between transport samples", () => {
  const state = createK01World();

  advanceK01MissionResultClockElapsed(state, 0.5);
  advanceK01MissionResultClockElapsed(state, 0.5);

  const source = state.sourceRuntimeProfile?.state as K01SourceRuntimeState;
  assert.equal(source.policies.result.clockMilliseconds, 2);
  assert.equal(source.policies.result.submillisecondRemainder, 0);
});

test("headless 24 Hz adapter retains exact one and two second boundaries", () => {
  const state = createK01World();

  for (let index = 0; index < 24; index += 1) {
    advanceK01MissionResultPolicy(state, { rawGlobalTick: index + 1 });
  }
  assert.deepEqual(getK01MissionResultClockSample(state), { clockMilliseconds: 1001, submillisecondRemainder: 0 });

  for (let index = 24; index < 48; index += 1) {
    advanceK01MissionResultPolicy(state, { rawGlobalTick: index + 1 });
  }
  assert.deepEqual(getK01MissionResultClockSample(state), { clockMilliseconds: 2001, submillisecondRemainder: 0 });
});

test("K0120 completion clears source flags and the next boundary owns victory", () => {
  const state = createK01World();
  updateSource(state, (source) => ({
    ...source,
    policies: {
      ...source.policies,
      beacon: { ...source.policies.beacon, triggerFlag: 1, scriptBusy: true, scriptPostState: 1 },
    },
  }));

  assert.equal(completeK01MissionScript(state, "script/K0120"), true);
  assert.equal(completeK01MissionScript(state, "script/K0120"), false);
  const sourceAfterDialogue = state.sourceRuntimeProfile?.state as K01SourceRuntimeState;
  assert.equal(sourceAfterDialogue.policies.beacon.scriptBusy, false);
  assert.equal(sourceAfterDialogue.policies.beacon.scriptPostState, 0);
  assert.equal(state.scenario.status, "running");

  advanceWorldTick(state, { k01ResultClockMilliseconds: 1, k01ResultClockRemainder: 0 });

  assert.equal(state.scenario.status, "victory");
  assert.equal(state.tick, 0, "terminal result commits before generic world construction/movement");
});

test("matured timer commits before beacon and entity updates", () => {
  const state = createK01World();
  updateSource(state, (source) => ({
    ...source,
    policies: {
      ...source.policies,
      result: { ...source.policies.result, clockMilliseconds: 1, winTimer: 1 },
    },
  }));

  const beforeAcceptedUpdates = (state.sourceRuntimeProfile?.state as K01SourceRuntimeState).acceptedUpdateCount;
  advanceK01MissionResultPolicy(state, {
    k01ResultClockMilliseconds: 2002,
    k01ResultClockRemainder: 0,
    rawGlobalTick: 1,
  });

  assert.equal(state.scenario.status, "victory");
  assert.equal((state.sourceRuntimeProfile?.state as K01SourceRuntimeState).acceptedUpdateCount, beforeAcceptedUpdates);
});

test("terminal worlds are unchanged when the result policy is called", () => {
  const state = createK01World();
  state.scenario.status = "defeat";
  const beforeSource = structuredClone(state.sourceRuntimeProfile);
  const beforeTick = state.tick;

  const result = advanceK01MissionResultPolicy(state, {
    k01ResultClockMilliseconds: 4001,
    k01ResultClockRemainder: 0,
    rawGlobalTick: 17,
  });

  assert.deepEqual(result, { applied: false, result: 0, reason: "scenario-terminal" });
  assert.deepEqual(state.sourceRuntimeProfile, beforeSource);
  assert.equal(state.tick, beforeTick);
  assert.equal(state.scenario.status, "defeat");
});
