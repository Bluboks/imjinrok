import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { TextDecoder } from "node:util";
import { fileURLToPath } from "node:url";
import { extractExecutableReferences } from "../../../tools/imjinrok/extract-executable-refs.mjs";
import { K01_PROVEN_OPENING_UNIT_BINDINGS } from "../../../tools/imjinrok/extract-k01-opening-unit-bindings.mjs";
import { extractK01ReinforcementIdentityMap } from "../../../tools/imjinrok/extract-k01-reinforcement-identity-map.mjs";
import { extractMapEntities, parseMapHeader } from "../../../tools/imjinrok/map-codec.mjs";
import {
  getImjinrokMapMetadata,
  getScenarioLaunchPlayerIds,
  getScenarioLaunchPlayerTeams,
  imjinrokCampaignScenarios,
  imjinrokK01Scenario,
  imjinrokK02Scenario,
  imjinrokOriginalMissionResultDelayTicks,
  k01SourceOpeningAdapter,
  k01ReinforcementAdapter,
  k01ReinforcementOwnerAdapter,
} from "./index.js";

const sharedSrcDirectory = dirname(fileURLToPath(import.meta.url));
const originalExecutablePath = resolve(sharedSrcDirectory, "../../../original/imjinrok2/imjinrok2.exe");
const originalStageMapDirectory = resolve(sharedSrcDirectory, "../../../original/imjinrok2/stagemap");
const campaignPortraitFrames = {
  K1: 6,
  K3: 8,
  K10: 15,
  J1: 4,
} as const satisfies Record<string, number>;

test("imjinrok campaign registry exposes missions in playable order", () => {
  assert.deepEqual(
    imjinrokCampaignScenarios.map((scenario) => scenario.id),
    [imjinrokK01Scenario.id, imjinrokK02Scenario.id],
  );
  assert.deepEqual(
    imjinrokCampaignScenarios.map((scenario) => scenario.mapId),
    ["imjinrok-k01", "imjinrok-k02"],
  );
  assert.deepEqual(getScenarioLaunchPlayerIds(imjinrokK01Scenario), ["local-player", "cpu-1"]);
  assert.deepEqual(getScenarioLaunchPlayerTeams(imjinrokK01Scenario), {
    "local-player": "local",
    "cpu-1": "cpu",
  });
  assert.deepEqual(getScenarioLaunchPlayerIds(imjinrokK02Scenario), ["local-player", "cpu-1", "ally-1"]);
  assert.deepEqual(getScenarioLaunchPlayerTeams(imjinrokK02Scenario), {
    "local-player": "local",
    "cpu-1": "cpu",
    "ally-1": "local",
  });
});

test("original executable references K01 and K02 campaign script and map assets", () => {
  const executableReferences = extractExecutableReferences(originalExecutablePath);
  const refsByValue = new Map(executableReferences.references.map((reference) => [normalizeSourceAssetPath(reference.value), reference]));
  const expectedAssetPaths = [
    "script\\k0120",
    "script\\k0115",
    "script\\k0230",
    "script\\k0227",
    "script\\k0225",
    "script\\k0220",
    "script\\k0210",
    "script\\k0110",
    "stagemap\\k01.map",
    "stagemap\\k02.map",
  ];

  for (const assetPath of expectedAssetPaths) {
    const reference = refsByValue.get(normalizeSourceAssetPath(assetPath));

    assert.ok(reference, `missing executable asset reference ${assetPath}`);
    assert.equal(reference.section, ".data");
    assert.equal(reference.categories.includes("k01-k02-mvp"), true);
    assert.match(reference.rawOffset, /^0x[0-9a-f]{8}$/);
    assert.match(reference.va, /^0x[0-9a-f]{8}$/);
  }

  assert.deepEqual(
    executableReferences.campaign.k01K02Refs.map((reference) => normalizeSourceAssetPath(reference.value)),
    expectedAssetPaths.map(normalizeSourceAssetPath),
  );
});

test("imjinrok K01 and K02 retain source battle script beats", () => {
  assert.deepEqual(
    imjinrokK01Scenario.missionDialogues?.map((dialogue) => dialogue.sourceScript),
    ["script/K0115", "script/K0120"],
  );
  assert.deepEqual(
    imjinrokK02Scenario.missionDialogues?.map((dialogue) => dialogue.sourceScript),
    ["script/K0220", "script/K0225", "script/K0227", "script/K0230"],
  );

  const k01OpeningDialogue = imjinrokK01Scenario.missionDialogues?.find((dialogue) => dialogue.sourceScript === "script/K0115");
  const k01ReinforcementDialogue = imjinrokK01Scenario.missionDialogues?.find((dialogue) => dialogue.sourceScript === "script/K0120");
  const k01ReinforcementEvent = imjinrokK01Scenario.scriptedEvents?.find((event) => event.sourceScript === "script/K0120");
  const k01ReinforcementSpawn = k01ReinforcementEvent?.actions.find((action) => action.type === "spawn-units");
  const k01CompleteObjective = k01ReinforcementEvent?.actions.find((action) => action.type === "complete-objective");
  const k01CompleteScenario = k01ReinforcementEvent?.actions.find((action) => action.type === "complete-scenario");
  const k01Objectives = new Map(imjinrokK01Scenario.objectives.map((objective) => [objective.id, objective]));
  const k02LocalStart = imjinrokK02Scenario.playerStarts?.["local-player"]?.startingUnits ?? [];
  const k02OpeningDialogue = imjinrokK02Scenario.missionDialogues?.find((dialogue) => dialogue.sourceScript === "script/K0220");
  const k02RoyalCartSpawnEvent = imjinrokK02Scenario.scriptedEvents?.find((event) => event.id === "k02-royal-cart-spawn");
  const k02RoyalCartSpawn = k02RoyalCartSpawnEvent?.actions.find((action) => action.type === "spawn-units");
  const k02OccupationDialogue = imjinrokK02Scenario.missionDialogues?.find((dialogue) => dialogue.sourceScript === "script/K0225");
  const k02RendezvousDialogue = imjinrokK02Scenario.missionDialogues?.find((dialogue) => dialogue.sourceScript === "script/K0227");
  const k02ArrivalDialogue = imjinrokK02Scenario.missionDialogues?.find((dialogue) => dialogue.sourceScript === "script/K0230");
  const k02OccupationEvent = imjinrokK02Scenario.scriptedEvents?.find((event) => event.sourceScript === "script/K0225");
  const k02OccupationSpawn = k02OccupationEvent?.actions.find((action) => action.type === "spawn-scanned-units");
  const k02WeatherEvent = imjinrokK02Scenario.scriptedEvents?.find((event) => event.id === "k02-midcourse-rain");
  const k02WeatherAction = k02WeatherEvent?.actions.find((action) => action.type === "set-weather");
  const k02Objectives = new Map(imjinrokK02Scenario.objectives.map((objective) => [objective.id, objective]));
  const k02EvacuationObjective = imjinrokK02Scenario.objectives.find((objective) => objective.id === "evacuate-royal-cart");
  const k02MapMetadata = getImjinrokMapMetadata(imjinrokK02Scenario.mapId);

  assert.deepEqual(k01ReinforcementDialogue?.trigger, {
    type: "objective-status",
    objectiveId: "build-beacon",
    status: "completed",
  });
  assert.equal(imjinrokK01Scenario.completionMode, "scripted");
  assert.equal(k01OpeningDialogue?.focusPoint, undefined);
  assert.deepEqual(k01ReinforcementDialogue?.focusPoint, { x: 55, y: 53 });
  assert.equal(k01ReinforcementDialogue?.completeScenarioOnEnd, "victory");
  assert.deepEqual(k01ReinforcementEvent?.trigger, {
    type: "objective-status",
    objectiveId: "build-beacon",
    status: "completed",
  });
  assert.deepEqual(k01ReinforcementSpawn?.origin, { x: 55, y: 53 });
  assert.equal(
    k01ReinforcementSpawn?.placementPolicy,
    "requested-position-exact",
  );
  assert.deepEqual(k01ReinforcementOwnerAdapter, {
    rawOwnerWord: 1,
    projectPlayerId: "cpu-1",
  });
  assert.equal(
    k01ReinforcementSpawn?.playerId,
    k01ReinforcementOwnerAdapter.projectPlayerId,
  );
  assert.deepEqual(countUnitsByKind(k01ReinforcementSpawn?.units ?? []), {
    "japanese-gunner": 3,
    "japanese-konishi": 1,
    "japanese-samurai": 2,
    "japanese-turtle-tank": 3,
  });
  assert.deepEqual(
    k01ReinforcementSpawn?.units.map(({ idSuffix, offset }) => ({ idSuffix, offset })),
    [
      { idSuffix: "k0120-reinforcement-0x0d-1", offset: { x: -2, y: -2 } },
      { idSuffix: "k0120-reinforcement-0x52", offset: { x: 0, y: -2 } },
      { idSuffix: "k0120-reinforcement-0x0d-2", offset: { x: 2, y: -2 } },
      { idSuffix: "k0120-reinforcement-0x0e-1", offset: { x: -2, y: 0 } },
      { idSuffix: "k0120-reinforcement-0x0e-2", offset: { x: 0, y: 0 } },
      { idSuffix: "k0120-reinforcement-0x0e-3", offset: { x: 2, y: 0 } },
      { idSuffix: "k0120-reinforcement-0x0c-1", offset: { x: -2, y: 2 } },
      { idSuffix: "k0120-reinforcement-0x0c-2", offset: { x: 0, y: 2 } },
      { idSuffix: "k0120-reinforcement-0x0c-3", offset: { x: 2, y: 2 } },
    ],
  );
  assert.deepEqual(
    k01ReinforcementAdapter.map(
      ({ originalClass, rawOwnerWord, offset, projectKind, identityMapping }) => ({
        originalClass,
        rawOwnerWord,
        offset,
        projectKind,
        identityMapping,
      }),
    ),
    [
      { originalClass: 13, rawOwnerWord: 1, offset: { x: -2, y: -2 }, projectKind: "japanese-samurai", identityMapping: "exact-static-identity-source" },
      { originalClass: 82, rawOwnerWord: 1, offset: { x: 0, y: -2 }, projectKind: "japanese-konishi", identityMapping: "exact-static-identity-source" },
      { originalClass: 13, rawOwnerWord: 1, offset: { x: 2, y: -2 }, projectKind: "japanese-samurai", identityMapping: "exact-static-identity-source" },
      { originalClass: 14, rawOwnerWord: 1, offset: { x: -2, y: 0 }, projectKind: "japanese-turtle-tank", identityMapping: "exact-static-identity-source" },
      { originalClass: 14, rawOwnerWord: 1, offset: { x: 0, y: 0 }, projectKind: "japanese-turtle-tank", identityMapping: "exact-static-identity-source" },
      { originalClass: 14, rawOwnerWord: 1, offset: { x: 2, y: 0 }, projectKind: "japanese-turtle-tank", identityMapping: "exact-static-identity-source" },
      { originalClass: 12, rawOwnerWord: 1, offset: { x: -2, y: 2 }, projectKind: "japanese-gunner", identityMapping: "exact-static-identity-source" },
      { originalClass: 12, rawOwnerWord: 1, offset: { x: 0, y: 2 }, projectKind: "japanese-gunner", identityMapping: "exact-static-identity-source" },
      { originalClass: 12, rawOwnerWord: 1, offset: { x: 2, y: 2 }, projectKind: "japanese-gunner", identityMapping: "exact-static-identity-source" },
    ],
  );
  assert.equal(
    k01ReinforcementAdapter.filter(
      ({ identityMapping }) =>
        identityMapping === "exact-static-identity-source",
    ).length,
    9,
  );
  assert.equal(
    k01ReinforcementAdapter.filter(
      ({ originalClass, projectKind }) =>
        originalClass === 12 && projectKind === "japanese-gunner",
    ).length,
    3,
  );
  assert.equal(
    k01ReinforcementAdapter.filter(
      ({ identityMapping }) => identityMapping === "proxy",
    ).length,
    0,
  );
  assert.deepEqual(
    k01ReinforcementAdapter.map(({ offset }) => ({
      x: (k01ReinforcementSpawn?.origin.x ?? 0) + offset.x,
      y: (k01ReinforcementSpawn?.origin.y ?? 0) + offset.y,
    })),
    [
      { x: 53, y: 51 },
      { x: 55, y: 51 },
      { x: 57, y: 51 },
      { x: 53, y: 53 },
      { x: 55, y: 53 },
      { x: 57, y: 53 },
      { x: 53, y: 55 },
      { x: 55, y: 55 },
      { x: 57, y: 55 },
    ],
  );
  assert.deepEqual(
    {
      width: getImjinrokMapMetadata("imjinrok-k01")?.width,
      height: getImjinrokMapMetadata("imjinrok-k01")?.height,
      view: getImjinrokMapMetadata("imjinrok-k01")?.view,
      sourceSpawns: getImjinrokMapMetadata("imjinrok-k01")?.sourceSpawns,
    },
    {
      width: 60,
      height: 60,
      view: { x: 13, y: 8 },
      sourceSpawns: [{ x: 6, y: 6 }],
    },
  );
  assert.equal(k01Objectives.has("defeat-forward-japanese"), false);
  assert.equal(k01Objectives.get("protect-ryu-seong-ryong")?.defeatDelayTicks, imjinrokOriginalMissionResultDelayTicks);
  assert.equal(k01Objectives.get("protect-gwon-yul")?.defeatDelayTicks, imjinrokOriginalMissionResultDelayTicks);
  assert.equal(k01Objectives.get("withdraw-after-reinforcements")?.type, "custom");
  assert.equal(k01Objectives.get("withdraw-after-reinforcements")?.required, true);
  assert.equal(k01Objectives.get("withdraw-after-reinforcements")?.visibleAfterObjectiveId, "build-beacon");
  assert.deepEqual(k01CompleteObjective, {
    type: "complete-objective",
    objectiveId: "withdraw-after-reinforcements",
  });
  assert.equal(k01CompleteScenario, undefined);
  assert.deepEqual(k01OpeningDialogue?.trigger, { type: "tick", tick: 3 });
  assert.equal(imjinrokK02Scenario.completionMode, "scripted");
  assert.equal(k02LocalStart.some((unit) => unit.kind === "gwon-yul"), false);
  assert.deepEqual(k02OpeningDialogue?.trigger, { type: "tick", tick: 3 });
  assert.equal(k02OpeningDialogue?.focusPoint, undefined);
  assert.deepEqual(k02RoyalCartSpawnEvent?.trigger, { type: "tick", tick: 0 });
  assert.equal(k02RoyalCartSpawnEvent?.sourceScript, "script/K0220");
  assert.equal(k02RoyalCartSpawn?.placementPolicy, undefined);
  assert.deepEqual(k02RoyalCartSpawn, {
    type: "spawn-units",
    playerId: "local-player",
    origin: { x: 6, y: 71 },
    units: [
      { kind: "royal-cart", idSuffix: "royal-cart", offset: { x: 0, y: 0 } },
    ],
  });
  assert.deepEqual(k02OccupationDialogue?.trigger, {
    type: "unit-in-area",
    playerId: "local-player",
    targetKind: "royal-cart",
    area: { x: 25, y: 0, width: 55, height: 80 },
  });
  assert.deepEqual(k02OccupationDialogue?.focusPoint, { x: 5, y: 70 });
  assert.deepEqual(k02RendezvousDialogue?.trigger, {
    type: "unit-in-area",
    playerId: "local-player",
    targetKind: "royal-cart",
    area: { x: 31, y: 26, width: 5, height: 5 },
  });
  assert.deepEqual(k02RendezvousDialogue?.focusPoint, { x: 33, y: 28 });
  assert.deepEqual(k02ArrivalDialogue?.trigger, {
    type: "objective-status",
    objectiveId: "evacuate-royal-cart",
    status: "completed",
  });
  assert.deepEqual(k02ArrivalDialogue?.focusPoint, { x: 73, y: 5 });
  assert.equal(k02ArrivalDialogue?.completeScenarioOnEnd, "victory");
  assert.deepEqual(k02OccupationEvent?.trigger, k02OccupationDialogue?.trigger);
  assert.equal(k02RendezvousDialogue?.trigger.type, "unit-in-area");
  assert.equal(imjinrokK02Scenario.scriptedEvents?.some((event) => event.sourceScript === "script/K0227"), false);
  assert.deepEqual(k02OccupationSpawn?.scan, { origin: { x: 0, y: 65 }, width: 7, height: 13, yStep: 2 });
  assert.equal(k02OccupationSpawn?.maxCount, 20);
  assert.deepEqual(k02OccupationSpawn?.firstUnit, { kind: "japanese-gunner", idSuffix: "k0225-occupation-0x52" });
  assert.deepEqual(k02OccupationSpawn?.repeatedUnit, { kind: "japanese-swordsman", idSuffixPrefix: "k0225-occupation-0x0c" });
  assert.deepEqual(k02OccupationSpawn?.order, {
    type: "move",
    target: { x: 67, y: 59 },
    allowPartialPath: true,
    repeatMoveWhileInsideArea: true,
    followUpAttackTarget: { playerId: "local-player", targetKind: "royal-cart" },
    followUpWhenOutsideArea: { x: 0, y: 59, width: 63, height: 21 },
    followUpCheckIntervalTicks: 100,
  });
  assert.equal(k02WeatherEvent?.sourceScript, "exe/K02@0x48aad2");
  assert.deepEqual(k02WeatherEvent?.trigger, {
    type: "unit-in-area",
    playerId: "local-player",
    targetKind: "royal-cart",
    area: { x: 45, y: 0, width: 35, height: 80 },
  });
  assert.deepEqual(k02WeatherAction, {
    type: "set-weather",
    weather: "rain",
    durationTicks: 800,
  });
  assert.deepEqual(
    imjinrokK02Scenario.objectives.map((objective) => objective.id),
    ["evacuate-royal-cart", "protect-ryu-seong-ryong"],
  );
  assert.equal(k02Objectives.has("rendezvous-with-gwon-yul"), false);
  assert.deepEqual(k02EvacuationObjective?.area, { x: 73, y: 0, width: 7, height: 6 });
  assert.equal(k02EvacuationObjective?.completionRequiresObjectiveIds, undefined);
  assert.deepEqual(k02EvacuationObjective?.routeWaypoints, [
    { x: 6, y: 71 },
    { x: 33, y: 28 },
    { x: 76, y: 3 },
  ]);
  assert.deepEqual(k02EvacuationObjective?.routeWaypointLabels, ["한성 출발", "권율 합류", "평양성 도착"]);
  assert.deepEqual(k02EvacuationObjective?.routeWaypoints, k02MapMetadata?.missionRouteWaypoints);
});

test("K01 reinforcement adapter matches the focused native evidence report", () => {
  const report = extractK01ReinforcementIdentityMap();

  assert.deepEqual(
    k01ReinforcementAdapter.map(
      ({
        originalClass,
        rawOwnerWord,
        offset,
        projectKind,
        identityMapping,
      }) => ({
        originalClass,
        rawOwnerWord,
        offset,
        projectKind,
        identityMapping,
      }),
    ),
    report.requestedPositions.map(
      ({
        originalClass,
        rawOwnerWord,
        offset,
        projectKind,
        identityMapping,
      }) => ({
        originalClass,
        rawOwnerWord,
        offset,
        projectKind,
        identityMapping,
      }),
    ),
  );
});

test("imjinrok K01 and K02 use source-derived campaign starting resources", () => {
  assert.deepEqual(imjinrokK01Scenario.startingResources, {
    food: 5000,
    wood: 5000,
    gold: 5000,
    stone: 5000,
  });
  assert.deepEqual(imjinrokK02Scenario.startingResources, {
    food: 0,
    wood: 0,
    gold: 0,
    stone: 0,
  });
});

test("imjinrok K01 starts with a source-derived established Joseon base", () => {
  const localStart = imjinrokK01Scenario.playerStarts?.["local-player"]?.startingUnits ?? [];

  assert.deepEqual(countUnitsByKind(localStart), {
    archer: 1,
    barracks: 1,
    "gwon-yul": 1,
    house: 3,
    "korean-monk": 2,
    "ryu-seong-ryong": 1,
    swordsman: 1,
    villager: 2,
  });
  assert.deepEqual(
    localStart.filter((unit) => unit.kind === "town-center" || unit.kind === "barracks" || unit.kind === "house"),
    [
      { kind: "house", idSuffix: "source-0x31-5-4", offset: { x: -1, y: -2 } },
      { kind: "house", idSuffix: "source-0x30-11-5", offset: { x: 5, y: -1 } },
      { kind: "barracks", idSuffix: "source-0x32-13-10", offset: { x: 7, y: 4 } },
      { kind: "house", idSuffix: "source-0x33-5-8", offset: { x: -1, y: 2 } },
    ],
  );
});

test("imjinrok K02 starts with a source-derived Hanseong evacuation base", () => {
  const localStart = imjinrokK02Scenario.playerStarts?.["local-player"]?.startingUnits ?? [];
  const allyStart = imjinrokK02Scenario.playerStarts?.["ally-1"]?.startingUnits ?? [];

  assert.deepEqual(countUnitsByKind(localStart), {
    archer: 2,
    beacon: 1,
    house: 7,
    "ryu-seong-ryong": 1,
    swordsman: 5,
    villager: 1,
  });
  assert.equal(localStart.some((unit) => unit.kind === "gwon-yul"), false);
  assert.equal(localStart.some((unit) => unit.kind === "royal-cart"), false);
  assert.deepEqual(
    localStart.filter((unit) => unit.kind === "ryu-seong-ryong"),
    [
      { kind: "ryu-seong-ryong", idSuffix: "source-0x4e-5-68", offset: { x: 1, y: -2 } },
    ],
  );
  assert.deepEqual(countUnitsByKind(allyStart), {
    archer: 2,
    "gwon-yul": 1,
    swordsman: 1,
  });
  assert.deepEqual(
    allyStart.filter((unit) => unit.kind === "gwon-yul"),
    [
      { kind: "gwon-yul", idSuffix: "source-0x4c-32-27", offset: { x: 0, y: 0 } },
    ],
  );
});

test("imjinrok K01 and K02 avoid skirmish economy starts for scripted Japanese pressure", () => {
  const k01CpuStart = imjinrokK01Scenario.playerStarts?.["cpu-1"];
  const k02CpuStart = imjinrokK02Scenario.playerStarts?.["cpu-1"];
  const k02AllyStart = imjinrokK02Scenario.playerStarts?.["ally-1"];
  const economyKinds = new Set(["barracks", "house", "town-center", "villager"]);

  assert.deepEqual(k01CpuStart?.startingResources, {
    food: 0,
    wood: 0,
    gold: 0,
    stone: 0,
  });
  assert.deepEqual(countUnitsByKind(k01CpuStart?.startingUnits ?? []), {
    "japanese-camp-advanced-tower": 4,
    "japanese-camp-barracks": 2,
    "japanese-camp-firehouse": 1,
    "japanese-camp-house": 2,
    "japanese-camp-tower": 2,
    "japanese-farmer": 3,
    "japanese-gunner": 3,
    "japanese-samurai": 3,
    "japanese-shrine-maiden": 1,
    "japanese-swordsman": 3,
  });
  assert.equal(k01CpuStart?.startingUnits?.length, 24);
  assert.equal(k01CpuStart?.startingUnits?.some((unit) => economyKinds.has(unit.kind)), false);

  assert.deepEqual(k02CpuStart?.startingResources, {
    food: 0,
    wood: 0,
    gold: 0,
    stone: 0,
  });
  assert.deepEqual(countUnitsByKind(k02CpuStart?.startingUnits ?? []), {
    "japanese-swordsman": 10,
  });
  assert.equal(k02CpuStart?.startingUnits?.some((unit) => economyKinds.has(unit.kind)), false);
  assert.equal(k02AllyStart?.startingUnits?.some((unit) => economyKinds.has(unit.kind)), false);
});

test("K01 opening adapter exposes source provenance and upgrades only class 31 identity/source", () => {
  assert.equal(k01SourceOpeningAdapter.length, 36);
  assert.deepEqual(
    k01SourceOpeningAdapter
      .filter(
        ({ rawOwnerWord, originalClass }) =>
          rawOwnerWord === 1 && (originalClass === 12 || originalClass === 13),
      )
      .map(({ originalClass, rawOwnerWord, offset, projectKind, identityMapping }) => ({
        originalClass,
        rawOwnerWord,
        sourcePosition: { x: 52 + offset.x, y: 52 + offset.y },
        projectKind,
        identityMapping,
      })),
    K01_PROVEN_OPENING_UNIT_BINDINGS,
  );
  assert.deepEqual(
    k01SourceOpeningAdapter
      .filter(({ identityMapping }) => identityMapping === "proxy")
      .map(({ originalClass, rawOwnerWord }) => ({ originalClass, rawOwnerWord })),
    [
      { originalClass: 49, rawOwnerWord: 0 },
      { originalClass: 48, rawOwnerWord: 0 },
      { originalClass: 51, rawOwnerWord: 0 },
      { originalClass: 58, rawOwnerWord: 1 },
      { originalClass: 58, rawOwnerWord: 1 },
      { originalClass: 60, rawOwnerWord: 1 },
      { originalClass: 60, rawOwnerWord: 1 },
      { originalClass: 63, rawOwnerWord: 1 },
      { originalClass: 63, rawOwnerWord: 1 },
      { originalClass: 63, rawOwnerWord: 1 },
      { originalClass: 63, rawOwnerWord: 1 },
    ],
  );
  assert.deepEqual(
    k01SourceOpeningAdapter
      .filter(({ rawOwnerWord, originalClass }) => rawOwnerWord === 1 && originalClass === 31)
      .map(({ originalClass, rawOwnerWord, offset, projectKind, identityMapping }) => ({
        originalClass,
        rawOwnerWord,
        sourcePosition: { x: 52 + offset.x, y: 52 + offset.y },
        projectKind,
        identityMapping,
      })),
    [
      { originalClass: 31, rawOwnerWord: 1, sourcePosition: { x: 7, y: 48 }, projectKind: "japanese-farmer", identityMapping: "exact-static-identity-source" },
      { originalClass: 31, rawOwnerWord: 1, sourcePosition: { x: 7, y: 47 }, projectKind: "japanese-farmer", identityMapping: "exact-static-identity-source" },
      { originalClass: 31, rawOwnerWord: 1, sourcePosition: { x: 48, y: 1 }, projectKind: "japanese-farmer", identityMapping: "exact-static-identity-source" },
    ],
  );
  assert.deepEqual(
    k01SourceOpeningAdapter
      .filter(
        ({ rawOwnerWord, originalClass }) =>
          rawOwnerWord === 0 && [2, 4, 7, 11].includes(originalClass),
      )
      .map(({ originalClass, projectKind, identityMapping }) => ({
        originalClass,
        projectKind,
        identityMapping,
      })),
    [
      { originalClass: 2, projectKind: "swordsman", identityMapping: "exact-static-identity-source" },
      { originalClass: 11, projectKind: "korean-monk", identityMapping: "exact-static-identity-source" },
      { originalClass: 4, projectKind: "archer", identityMapping: "exact-static-identity-source" },
      { originalClass: 7, projectKind: "villager", identityMapping: "exact-static-identity-source" },
      { originalClass: 7, projectKind: "villager", identityMapping: "exact-static-identity-source" },
      { originalClass: 11, projectKind: "korean-monk", identityMapping: "exact-static-identity-source" },
    ],
  );
});

test("imjinrok K01 and K02 player starts cover every active source map entity", () => {
  assert.deepEqual(
    collectScenarioStartSourcePlacements(imjinrokK01Scenario, {
      mapFileName: "k01.map",
      ownerPlayers: {
        0: { playerId: "local-player", origin: { x: 6, y: 6 } },
        1: { playerId: "cpu-1", origin: { x: 52, y: 52 } },
      },
    }),
    collectSourceMapEntityPlacements("k01.map", {
      0: { playerId: "local-player", kindByTypeHex: k01JoseonSourceKindByTypeHex },
      1: { playerId: "cpu-1", kindByTypeHex: k01JapaneseSourceKindByTypeHex },
    }),
  );
  assert.deepEqual(
    collectScenarioStartSourcePlacements(imjinrokK02Scenario, {
      mapFileName: "k02.map",
      ownerPlayers: {
        0: { playerId: "local-player", origin: { x: 4, y: 70 } },
        1: { playerId: "cpu-1", origin: { x: 72, y: 8 } },
        6: { playerId: "ally-1", origin: { x: 32, y: 27 } },
      },
    }),
    collectSourceMapEntityPlacements("k02.map", {
      0: { playerId: "local-player", kindByTypeHex: joseonSourceKindByTypeHex },
      1: { playerId: "cpu-1", kindByTypeHex: k02JapaneseSourceKindByTypeHex },
      6: { playerId: "ally-1", kindByTypeHex: joseonSourceKindByTypeHex },
    }),
  );
});

test("imjinrok K01 and K02 briefings cover every source script speech", () => {
  assert.deepEqual(
    imjinrokK01Scenario.briefing?.lines.map(toSourceComparableSpeech),
    readSourceSpeechLines("K0110", { includeSpeechSlot: true, includeDelayBefore: true }),
  );
  assert.deepEqual(
    imjinrokK02Scenario.briefing?.lines.map(toSourceComparableSpeech),
    readSourceSpeechLines("K0210", { includeSpeechSlot: true, includeDelayBefore: true }),
  );
});

test("imjinrok K01 and K02 briefings preserve source title and objective text", () => {
  assert.deepEqual(
    {
      musicSource: imjinrokK01Scenario.briefing?.musicSource,
      noEnd: imjinrokK01Scenario.briefing?.noEnd,
      title: imjinrokK01Scenario.briefing?.title,
      location: imjinrokK01Scenario.briefing?.location,
      battleType: imjinrokK01Scenario.briefing?.battleType,
      cast: imjinrokK01Scenario.briefing?.cast,
      objective: imjinrokK01Scenario.briefing?.objective,
    },
    readSourceBriefingMetadata("K0110"),
  );
  assert.deepEqual(
    {
      musicSource: imjinrokK02Scenario.briefing?.musicSource,
      noEnd: imjinrokK02Scenario.briefing?.noEnd,
      title: imjinrokK02Scenario.briefing?.title,
      location: imjinrokK02Scenario.briefing?.location,
      battleType: imjinrokK02Scenario.briefing?.battleType,
      cast: imjinrokK02Scenario.briefing?.cast,
      objective: imjinrokK02Scenario.briefing?.objective,
    },
    readSourceBriefingMetadata("K0210"),
  );
});

test("imjinrok K01 and K02 briefings preserve source title sequence timing", () => {
  assert.deepEqual(
    imjinrokK01Scenario.briefing?.titleSequence?.map(toSourceComparableTitleFrame),
    readSourceTitleFrames("K0110"),
  );
  assert.deepEqual(
    imjinrokK02Scenario.briefing?.titleSequence?.map(toSourceComparableTitleFrame),
    readSourceTitleFrames("K0210"),
  );
});

test("imjinrok K01 and K02 briefing title frames resolve to converted client assets", () => {
  const framePaths = new Set<string>();

  for (const scenario of [imjinrokK01Scenario, imjinrokK02Scenario]) {
    for (const frame of scenario.briefing?.titleSequence ?? []) {
      const pngPath = resolveBriefingTitleFrameAsset(frame.sourceAsset);

      framePaths.add(pngPath);
      assert.equal(existsSync(pngPath), true, `${scenario.id} missing converted title frame ${frame.sourceAsset}`);
      assert.deepEqual(readPngDimensions(pngPath), { width: 640, height: 480 });
    }
  }

  assert.equal(framePaths.size, 12);
});

test("imjinrok K01 and K02 mission dialogues preserve source numeric speech slots", () => {
  for (const scenario of [imjinrokK01Scenario, imjinrokK02Scenario]) {
    for (const dialogue of scenario.missionDialogues ?? []) {
      assert.deepEqual(
        dialogue.lines.map(toSourceComparableSpeech),
        readSourceSpeechLines(dialogue.sourceScript.replace(/^script\//, ""), { includeSpeechSlot: true }),
        dialogue.sourceScript,
      );
    }
  }
});

test("imjinrok K01 and K02 speech voice ids resolve to converted client audio", () => {
  const voiceIds = collectScenarioVoiceIds([imjinrokK01Scenario, imjinrokK02Scenario]);

  assert.equal(voiceIds.length, 41);

  for (const voiceId of voiceIds) {
    const sourcePath = resolve(sharedSrcDirectory, "../../../original/imjinrok2/script/eft", `${voiceId.toUpperCase()}.YAV`);
    const wavPath = resolve(sharedSrcDirectory, "../../../apps/game-client/public/assets/audio/mission", `${voiceId}.wav`);

    assert.equal(existsSync(sourcePath), true, `missing source voice ${voiceId}`);
    assert.equal(existsSync(wavPath), true, `missing converted voice ${voiceId}`);
    assert.deepEqual(readWavFormat(wavPath), {
      channels: 1,
      sampleRate: 22050,
      bitsPerSample: 8,
    });
  }
});

test("imjinrok K01 and K02 portrait ids resolve to converted client artwork", () => {
  const portraitIds = collectScenarioPortraitIds([imjinrokK01Scenario, imjinrokK02Scenario]);

  assert.deepEqual(portraitIds, ["J1", "K1", "K10", "K3"]);
  assert.equal(existsSync(resolve(sharedSrcDirectory, "../../../original/imjinrok2/yfnt/hero.spr")), true);

  for (const portraitId of portraitIds) {
    const frameIndex = campaignPortraitFrames[portraitId];
    const fileName = `hero_${String(frameIndex).padStart(4, "0")}.png`;
    const pngPath = resolve(
      sharedSrcDirectory,
      "../../../apps/game-client/public/assets/themes/default/ui/mission-portraits",
      fileName,
    );

    assert.equal(existsSync(pngPath), true, `missing converted portrait ${portraitId}`);
    assert.deepEqual(readPngDimensions(pngPath), { width: 130, height: 120 });
  }
});

function readSourceSpeechLines(
  scriptName: string,
  options: { includeSpeechSlot?: boolean; includeDelayBefore?: boolean } = {},
): SourceComparableSpeech[] {
  const scriptPath = resolve(sharedSrcDirectory, "../../../original/imjinrok2/script", scriptName);
  const script = new TextDecoder("windows-949").decode(readFileSync(scriptPath));
  const lines: SourceComparableSpeech[] = [];
  let previousSpeechEnd = 0;

  for (const match of script.matchAll(/\[SPEECH\]\[([^\]]+)\]\[([^\]]+)\]\[([^\]]+)\]\[([^\]]*)\]/g)) {
    const speech: SourceComparableSpeech = {
      portraitId: match[1] ?? "",
      voiceId: match[3] ?? "",
      text: normalizeSpeechText(match[4] ?? ""),
    };
    const speechSlot = toSpeechSlot(match[2] ?? "");

    if (options.includeSpeechSlot && speechSlot !== undefined) {
      speech.speechSlot = speechSlot;
    }

    if (options.includeDelayBefore && match.index !== undefined) {
      const delayBeforeMs = readLastSourceDelayBeforeSpeech(script.slice(previousSpeechEnd, match.index));

      if (delayBeforeMs !== undefined) {
        speech.delayBeforeMs = delayBeforeMs;
      }
    }

    lines.push(speech);
    previousSpeechEnd = (match.index ?? 0) + match[0].length;
  }

  return lines;
}

function readSourceTitleFrames(scriptName: string): SourceComparableTitleFrame[] {
  const scriptPath = resolve(sharedSrcDirectory, "../../../original/imjinrok2/script", scriptName);
  const script = new TextDecoder("windows-949").decode(readFileSync(scriptPath));

  return Array.from(
    script.matchAll(/\[CHANGETITLE\]\[([^\]]+)\]\[SETDELAYTIME\]\[([^\]]+)\]/g),
    (match) => ({
      sourceAsset: normalizeSourceAssetPath(match[1] ?? ""),
      durationMs: Number.parseInt(match[2] ?? "0", 10),
    }),
  );
}

function readSourceBriefingMetadata(scriptName: string): {
  musicSource: string;
  noEnd: boolean;
  title: string;
  location: string;
  battleType: string;
  cast: string[];
  objective: string;
} {
  const scriptPath = resolve(sharedSrcDirectory, "../../../original/imjinrok2/script", scriptName);
  const script = new TextDecoder("windows-949").decode(readFileSync(scriptPath));
  const musicSource = script.match(/\[CHANGEMUSIC\]\[([^\]]*)\]/)?.[1] ?? "";
  const location = script.match(/^장소\s*:\s*(.+)$/m)?.[1] ?? "";
  const battleType = script.match(/^성격\s*:\s*(.+)$/m)?.[1] ?? "";
  const cast = script.match(/^등장인물\s*:\s*(.+)$/m)?.[1] ?? "";
  const title = script.match(/\[TITLE\]\[([^\]]*)\]/)?.[1] ?? "";
  const objective = script.match(/\[OBJECTIVE\]\[([^\]]*)\]/)?.[1] ?? "";

  return {
    musicSource: normalizeSourceAssetPath(musicSource),
    noEnd: /\[NOEND\]/.test(script),
    title: normalizeSpeechText(title),
    location: normalizeSpeechText(location),
    battleType: normalizeSpeechText(battleType),
    cast: cast.split(",").map(normalizeSpeechText).filter(Boolean),
    objective: normalizeSpeechText(objective),
  };
}

interface SourceComparableSpeech {
  portraitId: string;
  voiceId: string;
  text: string;
  speechSlot?: 0 | 1 | 2 | 3;
  delayBeforeMs?: number;
}

interface SourceComparableTitleFrame {
  sourceAsset: string;
  durationMs: number;
}

function toSourceComparableSpeech(line: SourceComparableSpeech): SourceComparableSpeech {
  const speech: SourceComparableSpeech = {
    portraitId: line.portraitId,
    voiceId: line.voiceId,
    text: normalizeSpeechText(line.text),
  };

  if (line.speechSlot !== undefined) {
    speech.speechSlot = line.speechSlot;
  }

  if (line.delayBeforeMs !== undefined) {
    speech.delayBeforeMs = line.delayBeforeMs;
  }

  return speech;
}

function toSourceComparableTitleFrame(frame: SourceComparableTitleFrame): SourceComparableTitleFrame {
  return {
    sourceAsset: normalizeSourceAssetPath(frame.sourceAsset),
    durationMs: frame.durationMs,
  };
}

function collectScenarioVoiceIds(scenarios: readonly typeof imjinrokCampaignScenarios[number][]): string[] {
  const voiceIds = new Set<string>();

  for (const scenario of scenarios) {
    for (const line of scenario.briefing?.lines ?? []) {
      voiceIds.add(normalizeVoiceId(line.voiceId));
    }

    for (const dialogue of scenario.missionDialogues ?? []) {
      for (const line of dialogue.lines) {
        voiceIds.add(normalizeVoiceId(line.voiceId));
      }
    }
  }

  return [...voiceIds].sort();
}

function collectScenarioPortraitIds(scenarios: readonly typeof imjinrokCampaignScenarios[number][]): Array<keyof typeof campaignPortraitFrames> {
  const portraitIds = new Set<string>();

  for (const scenario of scenarios) {
    for (const line of scenario.briefing?.lines ?? []) {
      portraitIds.add(normalizePortraitId(line.portraitId));
    }

    for (const dialogue of scenario.missionDialogues ?? []) {
      for (const line of dialogue.lines) {
        portraitIds.add(normalizePortraitId(line.portraitId));
      }
    }
  }

  return [...portraitIds].sort() as Array<keyof typeof campaignPortraitFrames>;
}

function normalizeSpeechText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function normalizeVoiceId(voiceId: string): string {
  return voiceId.trim().toLowerCase();
}

function normalizePortraitId(portraitId: string): string {
  return portraitId.trim().toUpperCase();
}

function normalizeSourceAssetPath(sourceAsset: string): string {
  return sourceAsset.trim().replaceAll("\\", "/").toLowerCase();
}

function resolveBriefingTitleFrameAsset(sourceAsset: string): string {
  const normalized = normalizeSourceAssetPath(sourceAsset);
  const sourceWithoutExtension = normalized.replace(/\.[^/.]+$/, "");
  const publicAssetPath = sourceWithoutExtension.replace(/^ybriefingfnt\//, "");

  return resolve(
    sharedSrcDirectory,
    "../../../apps/game-client/public/assets/themes/default/ui/briefing",
    `${publicAssetPath}_0000.png`,
  );
}

function readPngDimensions(path: string): { width: number; height: number } {
  const png = readFileSync(path);
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  assert.deepEqual([...png.subarray(0, pngSignature.length)], pngSignature, `${path} should be a PNG`);

  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}

function readWavFormat(path: string): { channels: number; sampleRate: number; bitsPerSample: number } {
  const wav = readFileSync(path);

  assert.equal(wav.subarray(0, 4).toString("ascii"), "RIFF", `${path} should be a RIFF file`);
  assert.equal(wav.subarray(8, 12).toString("ascii"), "WAVE", `${path} should be a WAVE file`);

  return {
    channels: wav.readUInt16LE(22),
    sampleRate: wav.readUInt32LE(24),
    bitsPerSample: wav.readUInt16LE(34),
  };
}

function toSpeechSlot(value: string): SourceComparableSpeech["speechSlot"] {
  switch (value.trim()) {
    case "0":
      return 0;
    case "1":
      return 1;
    case "2":
      return 2;
    case "3":
      return 3;
    default:
      return undefined;
  }
}

function readLastSourceDelayBeforeSpeech(scriptBetweenSpeechLines: string): number | undefined {
  const delays = [...scriptBetweenSpeechLines.matchAll(/\[SETDELAYTIME\]\[([^\]]+)\]/g)];
  const lastDelay = delays.at(-1)?.[1];

  if (lastDelay === undefined) {
    return undefined;
  }

  const delayMs = Number.parseInt(lastDelay, 10);

  return Number.isFinite(delayMs) ? delayMs : undefined;
}

const joseonSourceKindByTypeHex = {
  "0x02": "swordsman",
  "0x04": "archer",
  "0x07": "villager",
  "0x0a": "villager",
  "0x0b": "swordsman",
  "0x2a": "house",
  "0x30": "house",
  "0x31": "house",
  "0x32": "barracks",
  "0x33": "house",
  "0x34": "beacon",
  "0x4c": "gwon-yul",
  "0x4e": "ryu-seong-ryong",
} as const;

const k01JapaneseSourceKindByTypeHex = {
  "0x03": "japanese-swordsman",
  "0x0c": "japanese-gunner",
  "0x0d": "japanese-samurai",
  "0x10": "japanese-shrine-maiden",
  "0x14": "japanese-swordsman",
  "0x1f": "japanese-farmer",
  "0x39": "japanese-camp-house",
  "0x3a": "japanese-camp-barracks",
  "0x3c": "japanese-camp-tower",
  "0x3e": "japanese-camp-firehouse",
  "0x3f": "japanese-camp-advanced-tower",
} as const;

const k01JoseonSourceKindByTypeHex = {
  ...joseonSourceKindByTypeHex,
  "0x0b": "korean-monk",
} as const;

const k02JapaneseSourceKindByTypeHex = {
  ...k01JapaneseSourceKindByTypeHex,
  "0x0c": "japanese-swordsman",
  "0x0d": "japanese-swordsman",
  "0x10": "japanese-gunner",
} as const;

interface SourceOwnerMapping {
  playerId: string;
  kindByTypeHex: Readonly<Record<string, string>>;
}

interface ScenarioOriginMapping {
  playerId: string;
  origin: { x: number; y: number };
}

function collectSourceMapEntityPlacements(
  mapFileName: string,
  ownerMappings: Readonly<Record<number, SourceOwnerMapping>>,
): string[] {
  const mapPath = resolve(originalStageMapDirectory, mapFileName);
  const buffer = readFileSync(mapPath);
  const header = parseMapHeader(buffer, `stagemap/${mapFileName}`);
  const entityProbe = extractMapEntities(buffer, header);

  return entityProbe.entities
    .filter((entity) => entity.active)
    .map((entity) => {
      const mapping = ownerMappings[entity.ownerId];
      const kind = mapping?.kindByTypeHex[entity.typeHex];

      assert.ok(mapping, `${mapFileName} has unmapped source owner ${entity.ownerId}`);
      assert.ok(kind, `${mapFileName} has unmapped source type ${entity.typeHex} for owner ${entity.ownerId}`);

      return toPlacementKey(mapping.playerId, kind, { x: entity.x, y: entity.y });
    })
    .sort();
}

function collectScenarioStartSourcePlacements(
  scenario: typeof imjinrokCampaignScenarios[number],
  options: {
    mapFileName: string;
    ownerPlayers: Readonly<Record<number, ScenarioOriginMapping>>;
  },
): string[] {
  return Object.values(options.ownerPlayers)
    .flatMap(({ playerId, origin }) =>
      (scenario.playerStarts?.[playerId]?.startingUnits ?? []).map((unit) =>
        toPlacementKey(playerId, unit.kind, {
          x: origin.x + unit.offset.x,
          y: origin.y + unit.offset.y,
        }),
      ),
    )
    .sort();
}

function toPlacementKey(playerId: string, kind: string, point: { x: number; y: number }): string {
  return `${playerId}:${kind}:${point.x},${point.y}`;
}

function countUnitsByKind(units: readonly { kind: string }[]): Record<string, number> {
  return Object.fromEntries(
    Object.entries(
      units.reduce<Record<string, number>>((counts, unit) => {
        counts[unit.kind] = (counts[unit.kind] ?? 0) + 1;
        return counts;
      }, {}),
    ).sort(([a], [b]) => a.localeCompare(b)),
  );
}
