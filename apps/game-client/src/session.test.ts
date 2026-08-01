import test from "node:test";
import assert from "node:assert/strict";
import { createBlankMap, defaultMap, defaultSkirmishScenario, imjinrokK01Scenario, imjinrokK02Scenario, type ScenarioDefinition } from "@shared";
import {
  createInitialWorldState,
  K01_SOURCE_RUNTIME_PROFILE_ID,
  PRODUCT_IMMEDIATE_PROJECTILE_PROFILE,
  PRODUCT_PROJECTILE_REGISTRY,
  spawnProjectile,
  type K01SourceRuntimeState,
  type ProjectileRegistry,
  type WorldSnapshot,
} from "@simulation";
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
import { NetworkClient } from "./net/NetworkClient.js";
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
  delete legacySnapshot.projectileSystem;
  delete legacySnapshot.projectileImpactEvents;
  delete legacySnapshot.simulationEvents;
  delete legacySnapshot.nextSimulationEventSequence;
  delete legacySnapshot.lastAcceptedCommand;

  const normalized = normalizeSavedWorldSnapshot(legacySnapshot);

  assert.ok(normalized);
  assert.deepEqual(normalized.scenario.scriptedEvents, {});
  assert.deepEqual(normalized.scenario.events, []);
  assert.deepEqual(normalized.simulationEvents, []);
  assert.equal(normalized.nextSimulationEventSequence, 1);
  assert.deepEqual(normalized.environment, {
    weather: "clear",
    timeOfDay01: 0,
    dayPhase: "day",
  });
  assert.deepEqual(normalized.playerResearch, {});
  assert.deepEqual(normalized.playerCheats, {});
  assert.deepEqual(normalized.combatEvents, []);
  assert.deepEqual(normalized.projectileSystem, { nextProjectileSequence: 1, projectiles: [] });
  assert.deepEqual(normalized.projectileImpactEvents, []);
  assert.equal(normalized.lastAcceptedCommand, null);
});

test("malformed present projectile lifecycle save data is rejected while unknown mod profiles remain serializable", () => {
  const malformed = createInitialWorldState(defaultMap, ["p1", "p2"]);
  malformed.projectileSystem = {
    nextProjectileSequence: 2,
    projectiles: [{
      id: "projectile-000000000001",
      profileId: "mod:projectile",
      payload: {},
      start: { x: 0, y: 0 },
      destination: { x: 1, y: 1 },
      position: { x: 0, y: 0 },
      motion: { policyId: "mod:motion", data: {} },
    }],
  };
  malformed.projectileImpactEvents = [{
    tick: 2,
    projectileId: "projectile-000000000001",
    profileId: "mod:projectile",
    eventId: "mod:impact",
    payload: { amount: 3 },
    position: { x: 1, y: 1 },
  }];

  assert.ok(normalizeSavedWorldSnapshot(malformed));

  const invalid = structuredClone(malformed) as WorldSnapshot;
  invalid.projectileSystem = { nextProjectileSequence: 2, projectiles: [{ id: "not-canonical" }] } as WorldSnapshot["projectileSystem"];
  assert.equal(normalizeSavedWorldSnapshot(invalid), null);

  invalid.projectileSystem = malformed.projectileSystem;
  invalid.projectileImpactEvents = [{ ...malformed.projectileImpactEvents[0]!, payload: { constructor: "unsafe" } }];
  assert.equal(normalizeSavedWorldSnapshot(invalid), null);
});

test("K01 quick-save and local SessionTransport preserve the opaque profile envelope with independent clones", () => {
  const map = createBlankMap({ id: imjinrokK01Scenario.mapId });
  const snapshot = createInitialWorldState(map, ["local-player"], imjinrokK01Scenario);
  const profile = snapshot.sourceRuntimeProfile;

  assert.equal(profile?.profileId, K01_SOURCE_RUNTIME_PROFILE_ID);
  assert.ok(profile);
  const originalState = profile.state as K01SourceRuntimeState;
  const editedEntities = originalState.entityRuntime.entities.map((entity, index) => index === 0 ? { ...entity, health: 480 } : entity);
  Object.assign(profile, {
    state: {
      ...originalState,
      acceptedUpdateCount: 9,
      entityRuntime: { ...originalState.entityRuntime, entities: editedEntities },
    },
  });

  const normalized = normalizeSavedWorldSnapshot(JSON.parse(JSON.stringify(snapshot)));
  assert.ok(normalized);
  assert.deepEqual(normalized.sourceRuntimeProfile, snapshot.sourceRuntimeProfile);

  const normalizedState = normalized.sourceRuntimeProfile?.state as K01SourceRuntimeState;
  const normalizedEntities = normalizedState.entityRuntime.entities.map((entity, index) => index === 0 ? { ...entity, health: 1 } : entity);
  normalizedState.entityRuntime.entities = normalizedEntities;
  assert.equal((snapshot.sourceRuntimeProfile?.state as K01SourceRuntimeState).entityRuntime.entities[0]?.health, 480);

  const transport = new LocalSessionTransport(snapshot);
  assert.deepEqual(transport.getSnapshot().sourceRuntimeProfile, snapshot.sourceRuntimeProfile);

  const malformed = structuredClone(snapshot) as WorldSnapshot;
  malformed.sourceRuntimeProfile = {
    profileId: "missing:source-runtime",
    stateVersion: 1,
    state: { acceptedUpdateCount: 0, entities: [] },
  };
  assert.equal(normalizeSavedWorldSnapshot(malformed), null);
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

test("quick-load normalization retains a valid selected palette identity", () => {
  const snapshot = createInitialWorldState(defaultMap, ["p1", "p2"]);
  snapshot.environment = {
    weather: "clear",
    timeOfDay01: 0.5,
    dayPhase: "night",
    lightLevel01: 0.25,
    visualPaletteId: "night3",
  };

  const normalized = normalizeSavedWorldSnapshot(snapshot);

  assert.deepEqual(normalized?.environment, snapshot.environment);
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

test("local skirmish sessions use current visibility for strategic AI targets", () => {
  const map = createBlankMap({ id: "local-skirmish-night-visibility", width: 64, height: 64 });
  map.environment = {
    dayNight: {
      cycleTicks: 1000,
      nightStartTick: 0,
      dayStartTick: 999,
      nightSightMultiplier: 0.5,
    },
  };
  const snapshot = createInitialWorldState(map, ["p1", "p2"], defaultSkirmishScenario, { p1: "local", p2: "cpu" });
  const fighter = snapshot.units["p2-swordsman-1"]!;
  const enemy = snapshot.units["p1-villager-1"]!;

  snapshot.units = {
    [fighter.id]: fighter,
    [enemy.id]: enemy,
  };
  fighter.position = { x: 30, y: 30 };
  enemy.position = { x: 36, y: 30 };
  snapshot.tick = 539;

  const transport = createSessionTransport(
    {
      ...createAiLaunchContext("skirmish"),
      mapId: map.id,
      mapDefinition: map,
      resumeSnapshot: snapshot,
    },
    map,
    ["p1", "p2"],
    {} as never,
  );

  transport.update(50, 50);

  assert.equal(transport.getSnapshot().tick, 540);
  assert.equal(transport.getSnapshot().units[fighter.id]?.currentOrder, undefined);
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

test("local session transport defaults legacy missing projectile lifecycle state", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const legacySnapshot = structuredClone(state) as Partial<WorldSnapshot>;
  delete legacySnapshot.projectileSystem;
  delete legacySnapshot.projectileImpactEvents;

  const transport = new LocalSessionTransport(state);
  assert.equal(transport.replaceSnapshot(legacySnapshot as WorldSnapshot, defaultSkirmishScenario), true);
  assert.deepEqual(transport.getSnapshot().projectileSystem, { nextProjectileSequence: 1, projectiles: [] });
  assert.deepEqual(transport.getSnapshot().projectileImpactEvents, []);
});

test("local transport factory advances with its caller-owned projectile registry without serializing it", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  state.projectileSystem = spawnProjectile(state.projectileSystem, PRODUCT_PROJECTILE_REGISTRY, {
    profileId: PRODUCT_IMMEDIATE_PROJECTILE_PROFILE.id,
    start: { x: 1, y: 1 },
    destination: { x: 2, y: 2 },
    targetId: "p2-target",
  }).state;
  const { registry, profileReads } = createSpyProjectileRegistry();
  const context = createAiLaunchContext("campaign");
  context.resumeSnapshot = structuredClone(state);

  const transport = createSessionTransport(context, defaultMap, ["p1", "p2"], {} as NetworkClient, {
    projectileRegistry: registry,
  });
  transport.update(50, 50);

  assert.equal(transport.isRemote, false);
  assert.ok(profileReads.count > 0);
  assert.equal(transport.getSnapshot().projectileImpactEvents.length, 1);
  assert.equal(JSON.stringify(transport.getSnapshot()).includes("getProfile"), false);
});

test("local transport preserves the product projectile registry default", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  state.projectileSystem = spawnProjectile(state.projectileSystem, PRODUCT_PROJECTILE_REGISTRY, {
    profileId: PRODUCT_IMMEDIATE_PROJECTILE_PROFILE.id,
    start: { x: 1, y: 1 },
    destination: { x: 2, y: 2 },
    targetId: "p2-target",
  }).state;
  const transport = new LocalSessionTransport(state);

  transport.update(50, 50);

  assert.equal(transport.getSnapshot().projectileImpactEvents[0]?.profileId, PRODUCT_IMMEDIATE_PROJECTILE_PROFILE.id);
});

test("remote transport retains unknown projectile data without executing a caller-owned registry", async () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  state.projectileSystem = {
    nextProjectileSequence: 2,
    projectiles: [{
      id: "projectile-000000000001",
      profileId: "mod:unavailable-profile",
      payload: {},
      start: { x: 0, y: 0 },
      destination: { x: 1, y: 1 },
      position: { x: 0, y: 0 },
      motion: { policyId: "mod:unavailable-motion", data: {} },
    }],
  };
  const { registry, profileReads } = createSpyProjectileRegistry();
  const context: GameLaunchContext = {
    ...createAiLaunchContext("skirmish"),
    connectionMode: "hosted",
    session: {
      id: "remote-projectile-session",
      entryMode: "custom-lobby",
      connectionMode: "hosted",
      scenarioType: "skirmish",
      mapId: defaultMap.id,
      playerIds: ["p1", "p2"],
      tickRate: 24,
    },
    resumeSnapshot: structuredClone(state),
  };
  const transport = createSessionTransport(
    context,
    defaultMap,
    ["p1", "p2"],
    new SnapshotNetworkClient(structuredClone(state)),
    { projectileRegistry: registry },
  );

  transport.update(200);
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.equal(transport.isRemote, true);
  assert.equal(profileReads.count, 0);
  assert.equal(transport.getSnapshot().projectileSystem.projectiles[0]?.profileId, "mod:unavailable-profile");
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

function createSpyProjectileRegistry(): { registry: ProjectileRegistry; profileReads: { count: number } } {
  const profileReads = { count: 0 };

  return {
    registry: {
      getProfile(id) {
        profileReads.count += 1;
        return PRODUCT_PROJECTILE_REGISTRY.getProfile(id);
      },
      getMotionPolicy: (id) => PRODUCT_PROJECTILE_REGISTRY.getMotionPolicy(id),
      getCollisionPolicy: (id) => PRODUCT_PROJECTILE_REGISTRY.getCollisionPolicy(id),
      getImpactPolicy: (id) => PRODUCT_PROJECTILE_REGISTRY.getImpactPolicy(id),
    },
    profileReads,
  };
}

class SnapshotNetworkClient extends NetworkClient {
  constructor(private readonly snapshot: WorldSnapshot) {
    super("http://example.invalid");
  }

  override async getSessionSnapshot(_sessionId: string): Promise<WorldSnapshot> {
    return this.snapshot;
  }
}
