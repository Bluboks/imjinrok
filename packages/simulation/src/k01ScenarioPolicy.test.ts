import assert from "node:assert/strict";
import test from "node:test";
import {
  createBlankMap,
  createImjinrokMapScaffold,
  defaultSkirmishScenario,
  imjinrokK01Scenario,
  unitDefinitions,
  type ScenarioDefinition,
} from "../../shared/src/index.js";
import {
  advanceWorldTick,
  createInitialWorldState,
  evaluateScenarioRuntime,
  toWorldSnapshot,
  type WorldState,
} from "./index.js";
import { createUnitState } from "./entities.js";
import { appendConstructionCompletedEvent } from "./events.js";
import {
  K01_SOURCE_RUNTIME_STATE_VERSION,
  type K01SourceRuntimeState,
} from "./k01SourceRuntimeProfile.js";
import { resolveK01SourceObjectiveCompletion } from "./k01ScenarioPolicy.js";
import { removeUnitFromWorld } from "./units.js";

function createK01World(): WorldState {
  const map = createImjinrokMapScaffold(imjinrokK01Scenario.mapId);
  assert.ok(map);
  return createInitialWorldState(map, ["local-player", "cpu-1"], imjinrokK01Scenario);
}

function appendBeaconCompletion(state: WorldState, id = "local-player-test-beacon"): void {
  const building = createUnitState(id, "local-player", "beacon", { x: 20, y: 20 });
  state.units[id] = building;
  appendConstructionCompletedEvent(state, building);
}

function removeOpeningHostileBuildings(state: WorldState): void {
  for (const unit of Object.values(state.units)) {
    if (unit.playerId === "cpu-1" && unitDefinitions[unit.kind].category === "building") {
      removeUnitFromWorld(state, unit.id);
    }
  }
}

function getK01SourceState(state: WorldState): K01SourceRuntimeState {
  assert.ok(state.sourceRuntimeProfile);
  assert.equal(state.sourceRuntimeProfile.profileId, "k01:source-runtime");
  return state.sourceRuntimeProfile.state as K01SourceRuntimeState;
}

function setBeaconTriggerFlag(state: WorldState, triggerFlag: number): void {
  const envelope = state.sourceRuntimeProfile;
  assert.ok(envelope);
  const source = envelope.state as K01SourceRuntimeState;
  state.sourceRuntimeProfile = {
    ...envelope,
    state: {
      ...source,
      policies: {
        ...source.policies,
        beacon: { ...source.policies.beacon, triggerFlag },
      },
    },
  };
}

function countReinforcements(state: WorldState): number {
  return Object.keys(state.units).filter((unitId) => unitId.includes("k0120-reinforcement")).length;
}

test("K01 source objective remains pending behind the hostile-building blocker", () => {
  const state = createK01World();
  appendBeaconCompletion(state);

  advanceWorldTick(state);

  assert.equal(getK01SourceState(state).policies.beacon.triggerFlag, 0);
  assert.equal(state.scenario.objectives["build-beacon"]?.status, "pending");
  assert.equal(state.scenario.scriptedEvents["k01-reinforcement-wave"]?.status, "pending");
  assert.equal(countReinforcements(state), 0);
  assert.equal(state.scenario.status, "running");

  const blockedSave = JSON.parse(JSON.stringify(toWorldSnapshot(state))) as WorldState;
  advanceWorldTick(blockedSave);
  assert.equal(getK01SourceState(blockedSave).policies.beacon.triggerFlag, 0);
  assert.equal(blockedSave.scenario.objectives["build-beacon"]?.status, "pending");
  assert.equal(countReinforcements(blockedSave), 0);
});

test("K01 source trigger completes the pending objective, consumes the legacy event, and remains one-shot", () => {
  const state = createK01World();
  appendBeaconCompletion(state);

  advanceWorldTick(state);
  removeOpeningHostileBuildings(state);
  advanceWorldTick(state);

  assert.equal(getK01SourceState(state).policies.beacon.triggerFlag, 1);
  assert.equal(state.scenario.objectives["build-beacon"]?.status, "completed");
  assert.equal(state.scenario.scriptedEvents["k01-reinforcement-wave"]?.status, "executed");
  assert.equal(countReinforcements(state), 9);
  assert.equal(state.scenario.status, "running");

  const declaredK0120Dialogue = imjinrokK01Scenario.missionDialogues?.find(
    (dialogue) => dialogue.trigger.type === "objective-status" && dialogue.trigger.objectiveId === "build-beacon",
  );
  assert.ok(declaredK0120Dialogue);
  if (declaredK0120Dialogue.trigger.type !== "objective-status") {
    throw new Error("K01 reinforcement dialogue must use an objective-status trigger");
  }
  assert.equal(
    state.scenario.objectives[declaredK0120Dialogue.trigger.objectiveId]?.status,
    declaredK0120Dialogue.trigger.status,
  );

  const saved = JSON.parse(JSON.stringify(toWorldSnapshot(state))) as WorldState;
  advanceWorldTick(saved);

  assert.equal(countReinforcements(saved), 9);
  assert.equal(saved.scenario.scriptedEvents["k01-reinforcement-wave"]?.status, "executed");
  assert.equal(saved.scenario.status, "running");
  assert.equal(getK01SourceState(saved).policies.beacon.triggerFlag, 1);
});

test("removing a blocked beacon before the gate opens leaves the source objective pending", () => {
  const state = createK01World();
  appendBeaconCompletion(state);

  advanceWorldTick(state);
  assert.equal(getK01SourceState(state).policies.beacon.triggerFlag, 0);
  assert.equal(removeUnitFromWorld(state, "local-player-test-beacon"), true);
  removeOpeningHostileBuildings(state);
  advanceWorldTick(state);

  assert.equal(getK01SourceState(state).policies.beacon.triggerFlag, 0);
  assert.equal(state.scenario.objectives["build-beacon"]?.status, "pending");
  assert.equal(state.scenario.scriptedEvents["k01-reinforcement-wave"]?.status, "pending");
  assert.equal(countReinforcements(state), 0);
});

test("source objective projection accepts only trigger flag one and does not mutate state", () => {
  for (const [triggerFlag, expected] of [[0, false], [1, true], [2, false], [0xffff, false]] as const) {
    const state = createK01World();
    setBeaconTriggerFlag(state, triggerFlag);
    const before = structuredClone(state.sourceRuntimeProfile);

    assert.equal(resolveK01SourceObjectiveCompletion(state, "build-beacon"), expected);
    assert.deepEqual(state.sourceRuntimeProfile, before);
  }
});

test("source objective projection validates the current K01 envelope only for its owned objective", () => {
  const malformedVersion = createK01World();
  assert.ok(malformedVersion.sourceRuntimeProfile);
  malformedVersion.sourceRuntimeProfile = {
    ...malformedVersion.sourceRuntimeProfile,
    stateVersion: K01_SOURCE_RUNTIME_STATE_VERSION - 1,
  };
  assert.throws(
    () => resolveK01SourceObjectiveCompletion(malformedVersion, "build-beacon"),
    /requires state version 3/,
  );

  const malformedState = createK01World();
  setBeaconTriggerFlag(malformedState, 0x1_0000);
  assert.throws(
    () => resolveK01SourceObjectiveCompletion(malformedState, "build-beacon"),
    /trigger flag/,
  );

  assert.equal(resolveK01SourceObjectiveCompletion(malformedVersion, "unrelated-objective"), undefined);
  const generic = createInitialWorldState(createBlankMap(), ["p1"]);
  assert.equal(resolveK01SourceObjectiveCompletion(generic, "build-beacon"), undefined);
});

test("source objective completion still honors prerequisites and does not rewrite completed saves", () => {
  const state = createK01World();
  appendBeaconCompletion(state);
  const objective = state.scenario.objectives["build-beacon"];
  assert.ok(objective);
  objective.completionRequiresObjectiveIds = ["unmet-prerequisite"];

  removeOpeningHostileBuildings(state);
  advanceWorldTick(state);

  assert.equal(getK01SourceState(state).policies.beacon.triggerFlag, 1);
  assert.equal(objective.status, "pending");

  objective.status = "completed";
  objective.completedAtTick = state.tick;
  setBeaconTriggerFlag(state, 0);
  state.scenario.scriptedEvents["k01-reinforcement-wave"]!.status = "pending";
  const inconsistentSave = JSON.parse(JSON.stringify(toWorldSnapshot(state))) as WorldState;
  evaluateScenarioRuntime(inconsistentSave);

  assert.equal(inconsistentSave.scenario.objectives["build-beacon"]?.status, "completed");
  assert.equal(inconsistentSave.scenario.scriptedEvents["k01-reinforcement-wave"]?.status, "pending");
});

test("source-less build-building objectives retain generic completion", () => {
  const scenario: ScenarioDefinition = {
    ...defaultSkirmishScenario,
    id: "source-less-build-beacon",
    startingUnits: [],
    playerStarts: {
      p1: { startingUnits: [] },
    },
    objectives: [
      {
        id: "build-beacon",
        label: "Build beacon",
        description: "Construct a beacon.",
        type: "build-building",
        playerId: "p1",
        targetKind: "beacon",
        count: 1,
        required: true,
      },
    ],
  };
  const state = createInitialWorldState(createBlankMap(), ["p1"], scenario);
  state.units["p1-beacon"] = createUnitState("p1-beacon", "p1", "beacon", { x: 4, y: 4 });

  assert.equal(resolveK01SourceObjectiveCompletion(state, "build-beacon"), undefined);
  evaluateScenarioRuntime(state);
  assert.equal(state.scenario.objectives["build-beacon"]?.status, "completed");
  assert.equal(state.scenario.status, "victory");
});
