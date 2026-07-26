import test from "node:test";
import assert from "node:assert/strict";
import { defaultMap, defaultSkirmishScenario, imjinrokK02Scenario, type ScenarioDefinition } from "@shared";
import { createInitialWorldState, type WorldSnapshot } from "@simulation";
import {
  createCampaignMissionLaunchContext,
  createFreshLaunchContext,
  inferQuickSaveAiPlayerIds,
  normalizeOptionalMissionDialogueState,
  normalizeSavedWorldSnapshot,
  normalizeSerializedControlGroups,
  normalizeSerializedKnownResources,
  type GameLaunchContext,
} from "./session.js";
import { createSessionTransport, LocalSessionTransport } from "./net/SessionTransport.js";

test("control group quick-save data is normalized", () => {
  assert.deepEqual(
    normalizeSerializedControlGroups({
      0: ["p1-villager-1"],
      1: ["p1-swordsman-1", "p1-swordsman-1", "p1-swordsman-2"],
    }),
    {
      0: ["p1-villager-1"],
      1: ["p1-swordsman-1", "p1-swordsman-2"],
    },
  );
});

test("invalid control group quick-save data is rejected", () => {
  assert.equal(normalizeSerializedControlGroups({ 10: ["p1-villager-1"] }), null);
  assert.equal(normalizeSerializedControlGroups({ 1: "p1-villager-1" }), null);
  assert.equal(normalizeSerializedControlGroups({ 1: ["p1-villager-1", 7] }), null);
  assert.equal(normalizeSerializedControlGroups(["p1-villager-1"]), null);
});

test("known resource quick-save data is normalized", () => {
  assert.deepEqual(
    normalizeSerializedKnownResources([
      {
        point: { x: 4.4, y: 5.6 },
        resource: { id: "rice-a", kind: "rice", amount: 12, state: "active" },
      },
      {
        point: { x: 4, y: 6 },
        resource: { id: "rice-duplicate", kind: "rice", amount: 8 },
      },
      {
        point: { x: 7, y: 9 },
        resource: { id: "bamboo-a", kind: "bamboo", amount: -3, regrowTicks: -10 },
      },
    ]),
    [
      {
        point: { x: 4, y: 6 },
        resource: { id: "rice-a", kind: "rice", amount: 12, state: "active" },
      },
      {
        point: { x: 7, y: 9 },
        resource: { id: "bamboo-a", kind: "bamboo", amount: 0, regrowTicks: 0 },
      },
    ],
  );
});

test("invalid known resource quick-save data is rejected", () => {
  assert.equal(normalizeSerializedKnownResources({}), null);
  assert.equal(normalizeSerializedKnownResources([{ point: { x: 1, y: 2 }, resource: { id: "bad", amount: 5 } }]), null);
  assert.equal(normalizeSerializedKnownResources([{ point: { x: Number.NaN, y: 2 }, resource: { id: "rice", kind: "rice", amount: 5 } }]), null);
});

test("legacy world snapshots are normalized with missing runtime collections", () => {
  const legacySnapshot = createInitialWorldState(defaultMap, ["p1", "p2"]) as Partial<WorldSnapshot>;

  delete (legacySnapshot.scenario as Partial<WorldSnapshot["scenario"]>).scriptedEvents;
  delete (legacySnapshot.scenario as Partial<WorldSnapshot["scenario"]>).events;
  delete legacySnapshot.environment;
  delete legacySnapshot.playerResearch;
  delete legacySnapshot.playerCheats;
  delete legacySnapshot.combatEvents;
  delete legacySnapshot.lastAcceptedCommand;

  const normalized = normalizeSavedWorldSnapshot(legacySnapshot);

  assert.ok(normalized);
  assert.deepEqual(normalized.scenario.scriptedEvents, {});
  assert.deepEqual(normalized.scenario.events, []);
  assert.deepEqual(normalized.environment, {
    weather: "clear",
    timeOfDay01: 0,
    dayPhase: "day",
  });
  assert.deepEqual(normalized.playerResearch, {});
  assert.deepEqual(normalized.playerCheats, {});
  assert.deepEqual(normalized.combatEvents, []);
  assert.equal(normalized.lastAcceptedCommand, null);
});

test("quick-load world snapshots preserve timed weather overrides", () => {
  const snapshot = createInitialWorldState(defaultMap, ["p1", "p2"]) as WorldSnapshot;
  snapshot.tick = 42;
  snapshot.environment = {
    weather: "rain",
    weatherOverride: "rain",
    weatherOverrideUntilTick: 842.8,
    timeOfDay01: 0.375,
    dayPhase: "night",
  };

  const normalized = normalizeSavedWorldSnapshot(snapshot);

  assert.ok(normalized);
  assert.deepEqual(normalized.environment, {
    weather: "rain",
    weatherOverride: "rain",
    weatherOverrideUntilTick: 842,
    timeOfDay01: 0.375,
    dayPhase: "night",
  });
});

test("fresh launch contexts strip save-only resume state", () => {
  const snapshot = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const context: GameLaunchContext = {
    entryMode: "singleplayer",
    connectionMode: "local",
    scenarioType: "skirmish",
    session: null,
    serverOnline: false,
    mapId: defaultMap.id,
    mapDefinition: defaultMap,
    scenario: defaultSkirmishScenario,
    playerIds: ["p1", "p2"],
    playerTeams: { p1: "local", p2: "cpu" },
    aiPlayerIds: ["p2"],
    aiDifficulty: "hard",
    resumeSnapshot: snapshot,
    resumePlayerVisibility: {
      width: defaultMap.width,
      height: defaultMap.height,
      tiles: Array.from({ length: defaultMap.width * defaultMap.height }, () => 0),
    },
    resumeControlGroups: {
      1: ["p1-villager-1"],
    },
    resumeKnownResources: [
      {
        point: { x: 3, y: 4 },
        resource: { id: "rice-a", kind: "rice", amount: 12 },
      },
    ],
    resumeMissionDialogue: {
      dialogueId: "opening",
      lineIndex: 1,
    },
    triggeredMissionDialogueIds: ["opening"],
  };

  const freshContext = createFreshLaunchContext(context);

  assert.equal(freshContext.resumeSnapshot, undefined);
  assert.equal(freshContext.resumePlayerVisibility, undefined);
  assert.equal(freshContext.resumeControlGroups, undefined);
  assert.equal(freshContext.resumeKnownResources, undefined);
  assert.equal(freshContext.resumeMissionDialogue, undefined);
  assert.equal(freshContext.triggeredMissionDialogueIds, undefined);
  assert.deepEqual(freshContext.playerIds, ["p1", "p2"]);
  assert.deepEqual(freshContext.aiPlayerIds, ["p2"]);
  assert.equal(freshContext.aiDifficulty, "hard");
  assert.equal(context.resumeSnapshot, snapshot);
});

test("campaign mission launch context preserves scenario-specific players and teams", () => {
  const context = createCampaignMissionLaunchContext(imjinrokK02Scenario, {
    ...defaultMap,
    id: imjinrokK02Scenario.mapId,
  });

  assert.deepEqual(context.playerIds, ["local-player", "cpu-1", "ally-1"]);
  assert.deepEqual(context.playerTeams, {
    "local-player": "local",
    "cpu-1": "cpu",
    "ally-1": "local",
  });
});

test("mission dialogue quick-save state is normalized", () => {
  assert.deepEqual(
    normalizeOptionalMissionDialogueState({ dialogueId: " k02-arrived-pyongyang ", lineIndex: 2 }),
    { dialogueId: "k02-arrived-pyongyang", lineIndex: 2 },
  );
  assert.equal(normalizeOptionalMissionDialogueState(undefined), undefined);
  assert.equal(normalizeOptionalMissionDialogueState({ dialogueId: "", lineIndex: 0 }), null);
  assert.equal(normalizeOptionalMissionDialogueState({ dialogueId: "opening", lineIndex: -1 }), null);
  assert.equal(normalizeOptionalMissionDialogueState({ dialogueId: "opening", lineIndex: 1.5 }), null);
  assert.equal(normalizeOptionalMissionDialogueState({ dialogueId: 3, lineIndex: 0 }), null);
});

test("quick-save AI players are inferred from legacy team snapshots", () => {
  const snapshot = createInitialWorldState(defaultMap, ["local-player", "cpu-1", "cpu-2", "ally-1"], defaultSkirmishScenario, {
    "local-player": "local",
    "cpu-1": "cpu",
    "cpu-2": "cpu",
    "ally-1": "local",
  });

  assert.deepEqual(inferQuickSaveAiPlayerIds(snapshot, undefined), ["cpu-1", "cpu-2"]);
});

test("quick-save AI players preserve explicit saved lists after normalization", () => {
  const snapshot = createInitialWorldState(defaultMap, ["local-player", "cpu-1", "cpu-2"], defaultSkirmishScenario, {
    "local-player": "local",
    "cpu-1": "cpu",
    "cpu-2": "cpu",
  });

  assert.deepEqual(
    inferQuickSaveAiPlayerIds(snapshot, ["cpu-2", "local-player", "missing", "cpu-2"]),
    ["cpu-2"],
  );
  assert.deepEqual(inferQuickSaveAiPlayerIds(snapshot, []), []);
});

test("local campaign sessions ignore generic skirmish AI controllers", () => {
  const transport = createSessionTransport(
    createAiLaunchContext("campaign"),
    defaultMap,
    ["p1", "p2"],
    {} as never,
  );

  transport.update(1500, 1500);

  const cpuUnits = Object.values(transport.getSnapshot().units).filter((unit) => unit.playerId === "p2");

  assert.equal(transport.getSnapshot().tick, 35);
  assert.equal(cpuUnits.length, 9);
  assert.equal(cpuUnits.some((unit) => unit.currentOrder !== undefined), false);
});

test("local skirmish sessions keep generic skirmish AI controllers", () => {
  const transport = createSessionTransport(
    createAiLaunchContext("skirmish"),
    defaultMap,
    ["p1", "p2"],
    {} as never,
  );

  transport.update(1500, 1500);

  const cpuUnits = Object.values(transport.getSnapshot().units).filter((unit) => unit.playerId === "p2");

  assert.equal(transport.getSnapshot().tick, 35);
  assert.equal(cpuUnits.length > 9, true);
  assert.equal(cpuUnits.some((unit) => unit.currentOrder !== undefined), true);
});

test("local session transport can force defeat for surrender", () => {
  const transport = new LocalSessionTransport(
    createInitialWorldState(defaultMap, ["p1", "p2"], defaultSkirmishScenario, { p1: "local", p2: "cpu" }),
  );

  assert.equal(transport.forceScenarioResult("defeat"), true);
  assert.equal(transport.getSnapshot().scenario.status, "defeat");
  assert.equal(transport.getSnapshot().scenario.endedAtTick, 0);
  assert.deepEqual(
    transport.getSnapshot().scenario.events.map((event) => event.type),
    ["scenario-defeat"],
  );
  assert.equal(transport.getPlaybackState().paused, true);
  assert.equal(transport.forceScenarioResult("defeat"), false);
});

test("local session transport hydrates current scenario objective metadata on quick-load", () => {
  const scenario: ScenarioDefinition = {
    ...defaultSkirmishScenario,
    id: "transport-route-hydration",
    objectives: [
      {
        id: "evacuate-royal-cart",
        label: "Evacuate Royal Cart",
        description: "Move through the campaign route.",
        type: "move-unit-to-area",
        playerId: "p1",
        targetKind: "royal-cart",
        count: 1,
        area: { x: 10, y: 10, width: 3, height: 3 },
        routeWaypoints: [
          { x: 1, y: 1 },
          { x: 5, y: 5 },
          { x: 10, y: 10 },
        ],
        routeWaypointLabels: ["Start", "Rendezvous", "Arrival"],
        completionRequiresObjectiveIds: ["rendezvous-with-gwon-yul"],
        required: true,
      },
    ],
  };
  const state = createInitialWorldState(defaultMap, ["p1", "p2"], scenario, { p1: "local", p2: "cpu" });
  const legacySnapshot = structuredClone(state) as WorldSnapshot;

  delete legacySnapshot.scenario.objectives["evacuate-royal-cart"]?.routeWaypoints;
  delete legacySnapshot.scenario.objectives["evacuate-royal-cart"]?.routeWaypointLabels;
  delete legacySnapshot.scenario.objectives["evacuate-royal-cart"]?.completionRequiresObjectiveIds;

  const transport = new LocalSessionTransport(state);

  assert.equal(transport.replaceSnapshot(legacySnapshot, scenario), true);
  assert.deepEqual(transport.getSnapshot().scenario.objectives["evacuate-royal-cart"]?.routeWaypoints, [
    { x: 1, y: 1 },
    { x: 5, y: 5 },
    { x: 10, y: 10 },
  ]);
  assert.deepEqual(transport.getSnapshot().scenario.objectives["evacuate-royal-cart"]?.routeWaypointLabels, [
    "Start",
    "Rendezvous",
    "Arrival",
  ]);
  assert.deepEqual(transport.getSnapshot().scenario.objectives["evacuate-royal-cart"]?.completionRequiresObjectiveIds, [
    "rendezvous-with-gwon-yul",
  ]);
});

test("local session transport hydrates current source map metadata on quick-load", () => {
  const map = {
    ...defaultMap,
    id: "transport-source-view-map",
    sourceInitialView: { x: 13, y: 8 },
    layers: structuredClone(defaultMap.layers),
    spawnPoints: structuredClone(defaultMap.spawnPoints),
    tags: [...defaultMap.tags],
  };
  const state = createInitialWorldState(map, ["p1", "p2"], defaultSkirmishScenario, { p1: "local", p2: "cpu" });
  const legacySnapshot = structuredClone(state) as WorldSnapshot;

  delete legacySnapshot.map.sourceInitialView;

  const transport = new LocalSessionTransport(state);

  assert.equal(transport.replaceSnapshot(legacySnapshot, defaultSkirmishScenario), true);
  assert.deepEqual(transport.getSnapshot().map.sourceInitialView, { x: 13, y: 8 });
});

test("local session transport preserves timed weather overrides on quick-load", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"], defaultSkirmishScenario, { p1: "local", p2: "cpu" });
  const snapshot = structuredClone(state) as WorldSnapshot;
  snapshot.environment = {
    weather: "rain",
    weatherOverride: "rain",
    weatherOverrideUntilTick: 120.9,
    timeOfDay01: 0.25,
    dayPhase: "night",
  };

  const transport = new LocalSessionTransport(state);

  assert.equal(transport.replaceSnapshot(snapshot, defaultSkirmishScenario), true);
  assert.deepEqual(transport.getSnapshot().environment, {
    weather: "rain",
    weatherOverride: "rain",
    weatherOverrideUntilTick: 120,
    timeOfDay01: 0.25,
    dayPhase: "night",
  });
});

test("local session transport stops advancing after natural defeat", () => {
  const scenario: ScenarioDefinition = {
    ...defaultSkirmishScenario,
    id: "transport-natural-defeat",
    startingUnits: [],
    playerStarts: {
      p1: {
        startingUnits: [{ kind: "royal-cart", idSuffix: "royal-cart", offset: { x: 0, y: 0 } }],
      },
      p2: {
        startingUnits: [{ kind: "villager", idSuffix: "villager-1", offset: { x: 0, y: 0 } }],
      },
    },
    objectives: [
      {
        id: "evacuate-royal-cart",
        label: "Evacuate Royal Cart",
        description: "Move the royal cart to the target area.",
        type: "move-unit-to-area",
        playerId: "p1",
        targetKind: "royal-cart",
        count: 1,
        area: { x: 10, y: 10, width: 3, height: 3 },
        required: true,
      },
    ],
  };
  const state = createInitialWorldState(defaultMap, ["p1", "p2"], scenario, { p1: "local", p2: "cpu" });
  const transport = new LocalSessionTransport(state);

  delete state.units["p1-royal-cart"];
  transport.update(1000, 1000);

  const defeatedAtTick = transport.getSnapshot().tick;

  assert.equal(transport.getSnapshot().scenario.status, "defeat");
  assert.equal(transport.getPlaybackState().paused, true);
  assert.equal(transport.getPlaybackState().controllable, false);

  transport.update(6000, 5000);

  assert.equal(transport.getSnapshot().tick, defeatedAtTick);
  assert.equal(transport.getSnapshot().scenario.endedAtTick, defeatedAtTick);
});

function createAiLaunchContext(scenarioType: GameLaunchContext["scenarioType"]): GameLaunchContext {
  return {
    entryMode: "singleplayer",
    connectionMode: "local",
    scenarioType,
    session: null,
    serverOnline: false,
    mapId: defaultMap.id,
    mapDefinition: defaultMap,
    scenario: defaultSkirmishScenario,
    playerIds: ["p1", "p2"],
    playerTeams: { p1: "local", p2: "cpu" },
    aiPlayerIds: ["p2"],
    aiDifficulty: "hard",
  };
}
