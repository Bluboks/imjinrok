import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createBlankMap,
  createContentRegistry,
  createMapDefinitionFromId,
  createRandomSkirmishMap,
  defaultMap,
  defaultSkirmishScenario,
  getScenarioLaunchPlayerIds,
  getScenarioLaunchPlayerTeams,
  getTileIndex,
  imjinrokCampaignScenarios,
  researchDefinitions,
  unitDefinitions,
  validateContentRegistry,
  type BuildingDefinitionId,
  type CommandEnvelope,
  type GridPoint,
  type ScenarioDefinition,
} from "../../shared/src/index.js";
import {
  advanceWorldTick,
  areTilesVisible,
  completeScenarioRuntime,
  createPlayerVisibility,
  createInitialWorldState,
  findPathForUnit,
  getFootprintTiles,
  getBuildTimeTicks,
  getPlayerPopulationState,
  getTileVisibility,
  issueCommand,
  isTilePassableForUnit,
  iterateUnitsOrdered,
  SIM_TICK_SECONDS,
  TileVisibility,
  updatePlayerVisibility,
  updatePlayerVisibilityWithChanges,
  validateBuildingPlacement,
} from "./index.js";
import { createUnitState } from "./entities.js";

const simulationSrcDirectory = dirname(fileURLToPath(import.meta.url));

test("core content registry validates", () => {
  const result = validateContentRegistry(createContentRegistry());

  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
});

test("commands reject units owned by another player", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const envelope: CommandEnvelope = {
    sessionId: "test-session",
    playerId: "p2",
    issuedAtTick: state.tick,
    command: {
      type: "move",
      unitId: "p1-villager-1",
      target: { x: 10, y: 10 },
    },
  };

  const result = issueCommand(state, envelope);

  assert.equal(result.ok, false);
});

test("move and stop commands update waypoint movement state", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const moveResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "move",
      unitId: "p1-villager-1",
      target: { x: 10, y: 10 },
    },
  });

  assert.equal(moveResult.ok, true);
  assert.equal(state.units["p1-villager-1"]?.currentOrder?.type, "move");
  assert.ok((state.units["p1-villager-1"]?.movementPath?.length ?? 0) > 0);

  const stopResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "stop",
      unitId: "p1-villager-1",
    },
  });

  assert.equal(stopResult.ok, true);
  assert.equal(state.units["p1-villager-1"]?.movementTarget, undefined);
  assert.equal(state.units["p1-villager-1"]?.movementPath, undefined);
  assert.equal(state.units["p1-villager-1"]?.currentOrder, undefined);
});

test("cheat command grants food and wood to the issuing player", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const beforeP1 = { ...state.playerResources.p1! };
  const beforeP2 = { ...state.playerResources.p2! };

  const result = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: { type: "cheat", code: "grant-resources" },
  });

  assert.equal(result.ok, true);
  assert.equal(state.playerResources.p1!.food, beforeP1.food + 10_000);
  assert.equal(state.playerResources.p1!.wood, beforeP1.wood + 10_000);
  assert.equal(state.playerResources.p1!.gold, beforeP1.gold);
  assert.equal(state.playerResources.p1!.stone, beforeP1.stone);
  assert.deepEqual(state.playerResources.p2, beforeP2);
});

test("rain cheat overrides map weather across ticks", () => {
  const state = createInitialWorldState(createBlankMap({ id: "clear-cheat-map" }), ["p1", "p2"]);

  const result = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: { type: "cheat", code: "force-rain" },
  });

  assert.equal(result.ok, true);
  assert.equal(state.environment.weather, "rain");

  advanceWorldTick(state);

  assert.equal(state.environment.weather, "rain");
  assert.equal(state.environment.weatherOverride, "rain");
});

test("fast-production cheat accelerates player work queues and construction", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const townCenter = state.units["p1-town-center"]!;
  const worker = state.units["p1-villager-1"]!;
  const building = createUnitState("p1-cheat-house", "p1", "house", {
    x: Math.round(worker.position.x) + 1,
    y: Math.round(worker.position.y),
  });

  townCenter.productionQueue = [{ id: "test-train", unit: "villager", remainingTicks: 10, totalTicks: 10 }];
  building.construction = { remainingTicks: 10, totalTicks: 10, builderUnitId: worker.id };
  state.units[building.id] = building;
  worker.currentOrder = {
    type: "build",
    building: "house",
    target: { ...building.position },
    buildingUnitId: building.id,
  };

  const result = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: { type: "cheat", code: "fast-production" },
  });

  assert.equal(result.ok, true);
  advanceWorldTick(state);

  assert.equal(townCenter.productionQueue?.[0]?.remainingTicks, 6);
  assert.equal(building.construction?.remainingTicks, 6);
});

test("invincible cheat prevents combat damage to the issuing player's units", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const attacker = state.units["p1-villager-1"]!;
  const target = state.units["p2-villager-1"]!;

  attacker.position = { x: 20, y: 20 };
  attacker.currentOrder = { type: "attack-move", target: { x: 21, y: 20 } };
  target.position = { x: 21, y: 20 };
  target.health.current = 3;

  const result = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p2",
    issuedAtTick: state.tick,
    command: { type: "cheat", code: "invincible" },
  });

  assert.equal(result.ok, true);
  advanceWorldTick(state);

  assert.equal(state.units[target.id], target);
  assert.equal(target.health.current, 3);
  const incomingEvent = state.combatEvents.find((event) =>
    event.sourceUnitId === attacker.id && event.targetUnitId === target.id
  );
  assert.equal(incomingEvent?.damage, 0);
  assert.equal(incomingEvent?.killed, false);
});

test("move orders complete when the unit reaches its final waypoint", () => {
  const state = createInitialWorldState(createBlankMap({ width: 30, height: 30 }), ["p1", "p2"], {
    ...defaultSkirmishScenario,
    id: "move-order-complete",
    objectives: [],
  });
  const unit = createUnitState("p1-swordsman-test", "p1", "swordsman", { x: 5, y: 5 });
  const distantEnemy = createUnitState("p2-villager-test", "p2", "villager", { x: 25, y: 25 });

  state.units = {
    [unit.id]: unit,
    [distantEnemy.id]: distantEnemy,
  };

  const moveResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "move",
      unitId: unit.id,
      target: { x: 7, y: 5 },
    },
  });

  assert.equal(moveResult.ok, true);
  advanceTicks(state, 12);

  assert.deepEqual(unit.position, { x: 7, y: 5 });
  assert.equal(unit.movementTarget, undefined);
  assert.equal(unit.movementPath, undefined);
  assert.equal(unit.currentOrder, undefined);
});

test("completed move orders restore idle aggro acquisition", () => {
  const state = createInitialWorldState(createBlankMap({ width: 30, height: 30 }), ["p1", "p2"], {
    ...defaultSkirmishScenario,
    id: "move-order-idle-aggro",
    objectives: [],
  });
  const unit = createUnitState("p1-swordsman-test", "p1", "swordsman", { x: 5, y: 5 });
  const target = createUnitState("p2-villager-test", "p2", "villager", { x: 11, y: 5 });

  state.units = {
    [unit.id]: unit,
    [target.id]: target,
  };

  const moveResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "move",
      unitId: unit.id,
      target: { x: 7, y: 5 },
    },
  });

  assert.equal(moveResult.ok, true);
  advanceTicks(state, 12);

  assert.equal(unit.currentOrder?.type, "attack-unit");
  assert.equal(unit.currentOrder?.targetUnitId, target.id);
  assert.ok(unit.movementTarget || target.health.current < target.health.max);
});

test("move orders do not acquire opportunistic combat before reaching the destination", () => {
  const state = createInitialWorldState(createBlankMap({ width: 30, height: 30 }), ["p1", "p2"], {
    ...defaultSkirmishScenario,
    id: "move-order-no-travel-aggro",
    objectives: [],
  });
  const unit = createUnitState("p1-swordsman-test", "p1", "swordsman", { x: 5, y: 5 });
  const target = createUnitState("p2-villager-test", "p2", "villager", { x: 6, y: 5 });

  state.units = {
    [unit.id]: unit,
    [target.id]: target,
  };

  const moveResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "move",
      unitId: unit.id,
      target: { x: 20, y: 5 },
    },
  });

  assert.equal(moveResult.ok, true);
  advanceTicks(state, 10);

  assert.deepEqual(unit.currentOrder, { type: "move", target: { x: 20, y: 5 } });
  assert.equal(target.health.current, target.health.max);
});

test("completed legacy move orders without movement targets are cleared on tick", () => {
  const state = createInitialWorldState(createBlankMap({ width: 30, height: 30 }), ["p1", "p2"], {
    ...defaultSkirmishScenario,
    id: "legacy-move-order-complete",
    objectives: [],
  });
  const unit = createUnitState("p1-swordsman-test", "p1", "swordsman", { x: 7, y: 5 });
  const distantEnemy = createUnitState("p2-villager-test", "p2", "villager", { x: 25, y: 25 });

  unit.currentOrder = { type: "move", target: { x: 7, y: 5 } };
  state.units = {
    [unit.id]: unit,
    [distantEnemy.id]: distantEnemy,
  };

  advanceWorldTick(state);

  assert.equal(unit.currentOrder, undefined);
});

test("building placement rejects occupied footprints and accepts clear grass", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);

  assert.equal(validateBuildingPlacement(state, "house", { x: 3, y: 3 }).ok, false);
  assert.equal(validateBuildingPlacement(state, "house", { x: 12, y: 12 }).ok, true);
});

test("build command creates a building and spends resources", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const result = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "build",
      builderUnitId: "p1-villager-1",
      building: "house",
      target: { x: 12, y: 12 },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(state.units["p1-house-1"]?.kind, "house");
  assert.equal(state.units["p1-house-1"]?.construction?.remainingTicks, getBuildTimeTicks("house"));
  assert.equal(state.units["p1-villager-1"]?.currentOrder?.type, "build");
  assert.equal(state.playerResources.p1?.wood, 170);
});

test("cancel-construction removes an unfinished building and refunds remaining cost", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const builder = state.units["p1-villager-1"]!;
  const buildResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "build",
      builderUnitId: builder.id,
      building: "house",
      target: { x: 12, y: 12 },
    },
  });

  assert.equal(buildResult.ok, true);
  const building = state.units["p1-house-1"]!;
  assert.equal(state.playerResources.p1?.wood, 170);

  const cancelResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "cancel-construction",
      unitId: building.id,
    },
  });

  assert.equal(cancelResult.ok, true);
  assert.equal(state.units[building.id], undefined);
  assert.equal(builder.currentOrder, undefined);
  assert.equal(state.playerResources.p1?.wood, 200);
});

test("cancel-construction prorates refunds after construction progresses", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const buildResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "build",
      builderUnitId: "p1-villager-1",
      building: "house",
      target: { x: 12, y: 12 },
    },
  });

  assert.equal(buildResult.ok, true);
  const building = state.units["p1-house-1"]!;
  building.construction!.remainingTicks = Math.floor(building.construction!.totalTicks / 2);

  const cancelResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "cancel-construction",
      unitId: building.id,
    },
  });

  assert.equal(cancelResult.ok, true);
  assert.equal(state.playerResources.p1?.wood, 185);
});

test("build command can create a replacement town center", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const target = findValidBuildTarget(state, "town-center");

  assert.ok(target);

  const result = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "build",
      builderUnitId: "p1-villager-1",
      building: "town-center",
      target,
    },
  });

  const townCenter = Object.values(state.units).find((unit) =>
    unit.playerId === "p1" &&
    unit.kind === "town-center" &&
    unit.id !== "p1-town-center",
  );

  assert.equal(result.ok, true);
  assert.equal(townCenter?.construction?.remainingTicks, getBuildTimeTicks("town-center"));
  assert.equal(state.playerResources.p1?.wood, 50);
  assert.equal(state.playerResources.p1?.stone, 50);
});

test("repair command restores a damaged completed building", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const worker = state.units["p1-villager-1"]!;
  const building = state.units["p1-town-center"]!;

  worker.position = { x: 6, y: 3 };
  building.health.current = building.health.max - 4;

  const result = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "repair",
      workerUnitId: worker.id,
      targetUnitId: building.id,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(worker.currentOrder?.type, "repair");

  advanceWorldTick(state);

  assert.equal(building.health.current, building.health.max);
  assert.equal(worker.currentOrder, undefined);
});

test("repair command lets extra workers assist active construction", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const builder = state.units["p1-villager-1"]!;
  const assistant = state.units["p1-villager-2"]!;
  const target = { x: 12, y: 12 };

  builder.position = { x: 11, y: 11 };
  assistant.position = { x: 11, y: 12 };

  const buildResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "build",
      builderUnitId: builder.id,
      building: "house",
      target,
    },
  });

  assert.equal(buildResult.ok, true);
  const building = state.units["p1-house-1"]!;

  for (let tick = 0; tick < 20 && builder.movementTarget; tick += 1) {
    advanceWorldTick(state);
  }

  assert.equal(builder.movementTarget, undefined);
  assistant.position = { x: 11, y: 12 };
  const initialRemainingTicks = building.construction!.remainingTicks;

  const assistResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "repair",
      workerUnitId: assistant.id,
      targetUnitId: building.id,
    },
  });

  assert.equal(assistResult.ok, true);
  assert.equal(assistant.currentOrder?.type, "repair");

  advanceWorldTick(state);

  assert.equal(building.construction?.remainingTicks, initialRemainingTicks - 2);
});

test("construction progress preserves combat damage taken while building", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"], {
    ...defaultSkirmishScenario,
    id: "construction-damage-preservation",
    objectives: [],
  });
  const builder = state.units["p1-villager-1"]!;

  builder.position = { x: 12, y: 11 };

  const buildResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "build",
      builderUnitId: builder.id,
      building: "house",
      target: { x: 12, y: 12 },
    },
  });

  assert.equal(buildResult.ok, true);
  const building = state.units["p1-house-1"]!;
  const initialConstructionHealth = building.health.current;

  building.health.current -= 20;
  const damagedHealth = building.health.current;

  advanceWorldTick(state);

  assert.ok(building.health.current > damagedHealth);
  assert.ok(building.health.current < initialConstructionHealth);

  advanceTicks(state, getBuildTimeTicks("house") + 10);

  assert.equal(building.construction, undefined);
  assert.ok(building.health.current < building.health.max);
});

test("repair command rejects invalid repair targets", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const worker = state.units["p1-villager-1"]!;
  const fullBuilding = state.units["p1-town-center"]!;
  const enemyBuilding = state.units["p2-town-center"]!;
  const friendlyUnit = state.units["p1-swordsman-1"]!;

  assert.equal(issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "repair",
      workerUnitId: worker.id,
      targetUnitId: fullBuilding.id,
    },
  }).ok, false);

  enemyBuilding.health.current -= 10;
  const enemyResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "repair",
      workerUnitId: worker.id,
      targetUnitId: enemyBuilding.id,
    },
  });

  assert.equal(enemyResult.ok, false);
  if (!enemyResult.ok) {
    assert.equal(enemyResult.reason, "cannot repair enemy unit");
  }

  friendlyUnit.health.current -= 10;
  const unitResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "repair",
      workerUnitId: worker.id,
      targetUnitId: friendlyUnit.id,
    },
  });

  assert.equal(unitResult.ok, false);
  if (!unitResult.ok) {
    assert.equal(unitResult.reason, "repair target is not a building");
  }
});

test("train-unit command creates a worker and spends resources", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const result = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "train-unit",
      buildingUnitId: "p1-town-center",
      unit: "villager",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(state.units["p1-villager-4"], undefined);
  assert.equal(state.units["p1-town-center"]?.productionQueue?.[0]?.unit, "villager");
  assert.equal(state.playerResources.p1?.food, 150);

  advanceTicks(state, unitDefinitions.villager.trainTimeTicks);

  assert.equal(state.units["p1-villager-4"]?.kind, "villager");
  assert.equal(state.units["p1-town-center"]?.productionQueue, undefined);
});

test("cancel-production removes queued units and refunds their cost", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const initialFood = state.playerResources.p1!.food;

  for (let index = 0; index < 2; index += 1) {
    const trainResult = issueCommand(state, {
      sessionId: "test-session",
      playerId: "p1",
      issuedAtTick: state.tick,
      command: {
        type: "train-unit",
        buildingUnitId: "p1-town-center",
        unit: "villager",
      },
    });

    assert.equal(trainResult.ok, true);
  }

  const queue = state.units["p1-town-center"]!.productionQueue!;
  assert.equal(queue.length, 2);
  assert.equal(state.playerResources.p1!.food, initialFood - 100);

  const cancelResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "cancel-production",
      buildingUnitId: "p1-town-center",
      queueItemId: queue[1]!.id,
    },
  });

  assert.equal(cancelResult.ok, true);
  assert.equal(state.units["p1-town-center"]?.productionQueue?.length, 1);
  assert.equal(state.units["p1-town-center"]?.productionQueue?.[0]?.unit, "villager");
  assert.equal(state.playerResources.p1!.food, initialFood - 50);
});

test("rally point command sends newly trained units toward the target", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const rallyResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "set-rally-point",
      buildingUnitId: "p1-town-center",
      target: { x: 12, y: 12 },
    },
  });

  assert.equal(rallyResult.ok, true);
  assert.deepEqual(state.units["p1-town-center"]?.rallyPoint?.target, { x: 12, y: 12 });

  const trainResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "train-unit",
      buildingUnitId: "p1-town-center",
      unit: "villager",
    },
  });

  assert.equal(trainResult.ok, true);
  advanceTicks(state, unitDefinitions.villager.trainTimeTicks);

  assert.equal(state.units["p1-villager-4"]?.currentOrder?.type, "move");
  assert.deepEqual(state.units["p1-villager-4"]?.currentOrder?.target, { x: 12, y: 12 });
  assert.ok(state.units["p1-villager-4"]?.movementTarget);
});

test("attack-move rally point sends newly trained combat units aggressively", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const barracks = state.units["p1-barracks"]!;
  const target = {
    x: Math.round(barracks.position.x) + 4,
    y: Math.round(barracks.position.y),
  };
  const rallyResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "set-rally-point",
      buildingUnitId: barracks.id,
      target,
      mode: "attack-move",
    },
  });

  assert.equal(rallyResult.ok, true);
  assert.equal(barracks.rallyPoint?.mode, "attack-move");

  const trainResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "train-unit",
      buildingUnitId: barracks.id,
      unit: "swordsman",
    },
  });

  assert.equal(trainResult.ok, true);
  advanceTicks(state, unitDefinitions.swordsman.trainTimeTicks);

  assert.equal(state.units["p1-swordsman-3"]?.currentOrder?.type, "attack-move");
  assert.deepEqual(state.units["p1-swordsman-3"]?.currentOrder?.target, target);
  assert.ok(state.units["p1-swordsman-3"]?.movementTarget);
});

test("resource rally point command sends newly trained workers to gather", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const rallyResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "set-rally-point",
      buildingUnitId: "p1-town-center",
      target: { x: 9, y: 3 },
      resourceId: "demo-rice-9-3",
    },
  });

  assert.equal(rallyResult.ok, true);
  assert.equal(state.units["p1-town-center"]?.rallyPoint?.resourceKind, "food");

  const trainResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "train-unit",
      buildingUnitId: "p1-town-center",
      unit: "villager",
    },
  });

  assert.equal(trainResult.ok, true);
  advanceTicks(state, unitDefinitions.villager.trainTimeTicks);

  assert.equal(state.units["p1-villager-4"]?.currentOrder?.type, "gather");
  assert.equal(state.units["p1-villager-4"]?.currentOrder?.resourceId, "demo-rice-9-3");
  assert.ok(state.units["p1-villager-4"]?.movementTarget);
});

test("resource rally retargets newly trained workers when the original resource is gone", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const rallyResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "set-rally-point",
      buildingUnitId: "p1-town-center",
      target: { x: 9, y: 3 },
      resourceId: "demo-rice-9-3",
    },
  });

  assert.equal(rallyResult.ok, true);
  removeResourceById(state, "demo-rice-9-3");

  const trainResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "train-unit",
      buildingUnitId: "p1-town-center",
      unit: "villager",
    },
  });

  assert.equal(trainResult.ok, true);
  advanceTicks(state, unitDefinitions.villager.trainTimeTicks);

  assert.equal(state.units["p1-villager-4"]?.currentOrder?.type, "gather");
  assert.notEqual(state.units["p1-villager-4"]?.currentOrder?.resourceId, "demo-rice-9-3");
  assert.ok(state.units["p1-villager-4"]?.movementTarget);
});

test("resource rally does not retarget newly trained workers to distant resources", () => {
  const map = createBlankMap({ width: 32, height: 32 });
  map.layers[0]!.tiles[getTileIndex(map.width, 9, 3)]!.resource = { id: "near-rice", kind: "rice", amount: 20 };
  map.layers[0]!.tiles[getTileIndex(map.width, 27, 27)]!.resource = { id: "far-rice", kind: "rice", amount: 20 };
  const state = createInitialWorldState(map, ["p1", "p2"]);
  const rallyResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "set-rally-point",
      buildingUnitId: "p1-town-center",
      target: { x: 9, y: 3 },
      resourceId: "near-rice",
    },
  });

  assert.equal(rallyResult.ok, true);
  removeResourceById(state, "near-rice");

  const trainResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "train-unit",
      buildingUnitId: "p1-town-center",
      unit: "villager",
    },
  });

  assert.equal(trainResult.ok, true);
  advanceTicks(state, unitDefinitions.villager.trainTimeTicks);

  const trainedWorker = state.units["p1-villager-4"];

  assert.notEqual(trainedWorker?.currentOrder?.type === "gather" ? trainedWorker.currentOrder.resourceId : null, "far-rice");
  assert.equal(trainedWorker?.currentOrder?.type, "move");
  assert.deepEqual(trainedWorker?.currentOrder?.target, { x: 9, y: 3 });
});

test("town-bell command recalls nearby workers to the selected town center", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const nearbyWorker = state.units["p1-villager-1"]!;
  const farWorker = createUnitState("p1-far-villager", "p1", "villager", { x: 42, y: 42 });
  const nearbyInfantry = state.units["p1-swordsman-1"]!;

  nearbyWorker.currentOrder = { type: "gather", resourceId: "demo-rice-9-3", target: { x: 9, y: 3 } };
  state.units[farWorker.id] = farWorker;

  const result = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "town-bell",
      buildingUnitId: "p1-town-center",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(nearbyWorker.currentOrder?.type, "move");
  assert.ok(nearbyWorker.movementTarget);
  assert.equal(farWorker.currentOrder, undefined);
  assert.equal(nearbyInfantry.currentOrder, undefined);
});

test("town-bell recalled workers deposit carried resources at the town center", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const worker = state.units["p1-villager-1"]!;
  const beforeFood = state.playerResources.p1!.food;

  worker.currentOrder = { type: "gather", resourceId: "demo-rice-9-3", target: { x: 9, y: 3 } };
  worker.carriedResource = { kind: "food", amount: 7 };

  const result = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "town-bell",
      buildingUnitId: "p1-town-center",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(worker.currentOrder?.type, "move");

  advanceTicks(state, 200);

  assert.equal(worker.carriedResource, undefined);
  assert.equal(state.playerResources.p1!.food, beforeFood + 7);
});

test("research command completes loom and applies it to current and future villagers", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const villager = state.units["p1-villager-1"]!;
  const initialFood = state.playerResources.p1!.food;
  const initialGold = state.playerResources.p1!.gold;

  const researchResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "research",
      buildingUnitId: "p1-town-center",
      research: "loom",
    },
  });

  assert.equal(researchResult.ok, true);
  assert.equal(state.units["p1-town-center"]?.researchQueue?.[0]?.research, "loom");
  assert.equal(state.playerResources.p1!.food, initialFood - researchDefinitions.loom.cost.food!);
  assert.equal(state.playerResources.p1!.gold, initialGold - researchDefinitions.loom.cost.gold!);

  const trainWhileResearching = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "train-unit",
      buildingUnitId: "p1-town-center",
      unit: "villager",
    },
  });

  assert.equal(trainWhileResearching.ok, false);
  advanceTicks(state, researchDefinitions.loom.researchTimeTicks);

  assert.equal(state.playerResearch.p1?.completed.loom, true);
  assert.equal(state.units["p1-town-center"]?.researchQueue, undefined);
  assert.equal(villager.health.max, 40);
  assert.equal(villager.health.current, 40);

  const duplicateResearch = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "research",
      buildingUnitId: "p1-town-center",
      research: "loom",
    },
  });

  assert.equal(duplicateResearch.ok, false);

  const trainResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "train-unit",
      buildingUnitId: "p1-town-center",
      unit: "villager",
    },
  });

  assert.equal(trainResult.ok, true);
  advanceTicks(state, unitDefinitions.villager.trainTimeTicks);

  assert.equal(state.units["p1-villager-4"]?.health.max, 40);
  assert.equal(state.units["p1-villager-4"]?.health.current, 40);
});

test("barracks can train archer units from the expanded infantry roster", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const initialFood = state.playerResources.p1!.food;
  const initialWood = state.playerResources.p1!.wood;
  const initialArchers = Object.values(state.units).filter((unit) => unit.playerId === "p1" && unit.kind === "archer").length;

  const trainResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "train-unit",
      buildingUnitId: "p1-barracks",
      unit: "archer",
    },
  });

  assert.equal(trainResult.ok, true);
  assert.equal(state.units["p1-barracks"]?.productionQueue?.[0]?.unit, "archer");
  assert.equal(state.playerResources.p1!.food, initialFood - unitDefinitions.archer.cost.food!);
  assert.equal(state.playerResources.p1!.wood, initialWood - unitDefinitions.archer.cost.wood!);

  advanceTicks(state, unitDefinitions.archer.trainTimeTicks);

  const archers = Object.values(state.units).filter((unit) => unit.playerId === "p1" && unit.kind === "archer");
  assert.equal(archers.length, initialArchers + 1);
  assert.equal(archers.at(-1)?.health.max, unitDefinitions.archer.baseAttributes.health);
});

test("cancel-production cancels active research and refunds its cost", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const initialFood = state.playerResources.p1!.food;
  const initialGold = state.playerResources.p1!.gold;

  const researchResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "research",
      buildingUnitId: "p1-town-center",
      research: "loom",
    },
  });

  assert.equal(researchResult.ok, true);
  const queueItem = state.units["p1-town-center"]!.researchQueue![0]!;

  const cancelResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "cancel-production",
      buildingUnitId: "p1-town-center",
      queueItemId: queueItem.id,
    },
  });

  assert.equal(cancelResult.ok, true);
  assert.equal(state.units["p1-town-center"]?.researchQueue, undefined);
  assert.equal(state.playerResources.p1!.food, initialFood);
  assert.equal(state.playerResources.p1!.gold, initialGold);

  advanceTicks(state, researchDefinitions.loom.researchTimeTicks);

  assert.equal(state.playerResearch.p1?.completed.loom, undefined);
});

test("train-unit command creates infantry from barracks and spends resources", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const result = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "train-unit",
      buildingUnitId: "p1-barracks",
      unit: "swordsman",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(state.units["p1-swordsman-3"], undefined);
  assert.equal(state.units["p1-barracks"]?.productionQueue?.[0]?.unit, "swordsman");
  assert.equal(state.playerResources.p1?.food, 140);
  assert.equal(state.playerResources.p1?.gold, 80);

  advanceTicks(state, unitDefinitions.swordsman.trainTimeTicks);

  assert.equal(state.units["p1-swordsman-3"]?.kind, "swordsman");
  assert.equal(state.units["p1-barracks"]?.productionQueue, undefined);
});

test("population cap includes queued units and houses increase available room", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);

  state.playerResources.p1!.food = 1_000;
  state.playerResources.p1!.wood = 1_000;

  assert.deepEqual(getPlayerPopulationState(state, "p1"), {
    used: 6,
    pending: 0,
    provided: 10,
    cap: 10,
    limit: 50,
    available: 4,
  });

  for (let index = 0; index < 3; index += 1) {
    const unitId = `p1-extra-swordsman-${index + 1}`;
    state.units[unitId] = createUnitState(unitId, "p1", "swordsman", { x: 16 + index, y: 16 });
  }

  const fillResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "train-unit",
      buildingUnitId: "p1-town-center",
      unit: "villager",
    },
  });

  assert.equal(fillResult.ok, true);
  assert.equal(getPlayerPopulationState(state, "p1").available, 0);

  const blockedResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "train-unit",
      buildingUnitId: "p1-town-center",
      unit: "villager",
    },
  });

  assert.equal(blockedResult.ok, false);
  if (!blockedResult.ok) {
    assert.equal(blockedResult.reason, "population cap reached");
  }

  const buildResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "build",
      builderUnitId: "p1-villager-1",
      building: "house",
      target: { x: 12, y: 12 },
    },
  });

  assert.equal(buildResult.ok, true);
  assert.equal(getPlayerPopulationState(state, "p1").cap, 10);
  advanceTicks(state, getBuildTimeTicks("house") + 120);
  assert.equal(getPlayerPopulationState(state, "p1").cap, 15);

  const unblockedResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "train-unit",
      buildingUnitId: "p1-town-center",
      unit: "villager",
    },
  });

  assert.equal(unblockedResult.ok, true);
});

test("production waits if population cap falls before the queued unit completes", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);

  state.playerResources.p1!.food = 1_000;
  state.units["p1-extra-house"] = createUnitState("p1-extra-house", "p1", "house", { x: 24, y: 24 });

  for (let index = 0; index < 8; index += 1) {
    const unitId = `p1-extra-swordsman-${index + 1}`;
    state.units[unitId] = createUnitState(unitId, "p1", "swordsman", { x: 16 + index, y: 16 });
  }

  assert.equal(getPlayerPopulationState(state, "p1").cap, 15);
  assert.equal(getPlayerPopulationState(state, "p1").available, 1);

  const trainResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "train-unit",
      buildingUnitId: "p1-town-center",
      unit: "villager",
    },
  });

  assert.equal(trainResult.ok, true);
  delete state.units["p1-extra-house"];

  advanceTicks(state, unitDefinitions.villager.trainTimeTicks + 5);

  assert.equal(state.units["p1-villager-4"], undefined);
  assert.equal(state.units["p1-town-center"]?.productionQueue?.[0]?.remainingTicks, 1);

  state.units["p1-replacement-house"] = createUnitState("p1-replacement-house", "p1", "house", { x: 24, y: 24 });
  advanceWorldTick(state);

  assert.equal(state.units["p1-villager-4"]?.kind, "villager");
  assert.equal(state.units["p1-town-center"]?.productionQueue, undefined);
});

test("train-unit command rejects infantry at the town center", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const result = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "train-unit",
      buildingUnitId: "p1-town-center",
      unit: "swordsman",
    },
  });

  assert.equal(result.ok, false);
});

test("defeat-opponents objective completes when only one player has units", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);

  for (const unit of Object.values(state.units)) {
    if (unit.playerId === "p2") {
      delete state.units[unit.id];
    }
  }

  advanceWorldTick(state);

  assert.equal(state.scenario.objectives["defeat-opponents"]?.status, "completed");
  assert.equal(state.scenario.status, "victory");
});

test("defeat-opponents objective waits for every CPU opponent in a four-player skirmish", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2", "p3", "p4"]);

  for (const unit of Object.values(state.units)) {
    if (unit.playerId === "p2") {
      delete state.units[unit.id];
    }
  }

  advanceWorldTick(state);
  assert.equal(state.scenario.objectives["defeat-opponents"]?.status, "pending");
  assert.equal(state.scenario.status, "running");

  for (const unit of Object.values(state.units)) {
    if (unit.playerId === "p3" || unit.playerId === "p4") {
      delete state.units[unit.id];
    }
  }

  advanceWorldTick(state);

  assert.equal(state.scenario.objectives["defeat-opponents"]?.status, "completed");
  assert.equal(state.scenario.status, "victory");
});

test("team skirmish treats allied CPU players as friendly", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2", "p3", "p4"], undefined, {
    p1: "local",
    p2: "cpu",
    p3: "cpu",
    p4: "cpu",
  });

  state.units["p2-swordsman-1"]!.position = { x: 70, y: 70 };
  state.units["p1-villager-1"]!.position = { x: 71, y: 70 };

  const friendlyAttack = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p2",
    issuedAtTick: state.tick,
    command: {
      type: "attack-unit",
      unitId: "p2-swordsman-1",
      targetUnitId: "p3-villager-1",
    },
  });

  assert.equal(friendlyAttack.ok, false);

  const enemyAttack = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p2",
    issuedAtTick: state.tick,
    command: {
      type: "attack-unit",
      unitId: "p2-swordsman-1",
      targetUnitId: "p1-villager-1",
    },
  });

  assert.equal(enemyAttack.ok, true);
});

test("defeat-opponents objective completes when an enemy team has no units", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2", "p3", "p4"], undefined, {
    p1: "local",
    p2: "cpu",
    p3: "cpu",
    p4: "cpu",
  });

  for (const unit of Object.values(state.units)) {
    if (unit.playerId === "p2") {
      delete state.units[unit.id];
    }
  }

  advanceWorldTick(state);
  assert.equal(state.scenario.objectives["defeat-opponents"]?.status, "pending");
  assert.equal(state.scenario.status, "running");

  for (const unit of Object.values(state.units)) {
    if (unit.playerId === "p3" || unit.playerId === "p4") {
      delete state.units[unit.id];
    }
  }

  advanceWorldTick(state);

  assert.equal(state.scenario.objectives["defeat-opponents"]?.status, "completed");
  assert.equal(state.scenario.status, "victory");
});

test("default skirmish scenario assigns combat-ready starts for third and fourth players", () => {
  const state = createInitialWorldState(defaultMap, ["local-player", "cpu-1", "cpu-2", "cpu-3"]);

  for (const playerId of ["cpu-2", "cpu-3"]) {
    const units = Object.values(state.units).filter((unit) => unit.playerId === playerId);

    assert.ok(units.some((unit) => unit.kind === "town-center"), playerId);
    assert.ok(units.some((unit) => unit.kind === "barracks"), playerId);
    assert.equal(units.filter((unit) => unit.kind === "villager").length, 3, playerId);
    assert.equal(units.filter((unit) => unit.kind === "swordsman").length, 3, playerId);
  }
});

test("default skirmish starting units avoid blocked resources and footprint overlaps", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2", "p3", "p4"]);

  assertValidStartingPlacements(state);
});

test("built-in campaign and original skirmish maps start without placement collisions", () => {
  const cases = [
    {
      label: "original 4p skirmish",
      mapId: "imjinrok-cpu-4p-128",
      scenario: defaultSkirmishScenario,
      players: ["p1", "p2", "p3", "p4"],
    },
    ...imjinrokCampaignScenarios.map((scenario) => ({
      label: scenario.id,
      mapId: scenario.mapId,
      scenario,
      players: getScenarioLaunchPlayerIds(scenario),
    })),
  ];

  for (const scenarioCase of cases) {
    const map = createMapDefinitionFromId(scenarioCase.mapId);

    assert.ok(map, `${scenarioCase.label} map should load`);
    assertValidStartingPlacements(
      createInitialWorldState(map, scenarioCase.players, scenarioCase.scenario, getScenarioLaunchPlayerTeams(scenarioCase.scenario)),
      scenarioCase.label,
    );
  }
});

test("built-in campaign objective routes are reachable on imported map scaffolds", () => {
  for (const scenario of imjinrokCampaignScenarios) {
    const map = createMapDefinitionFromId(scenario.mapId);

    assert.ok(map, `${scenario.id} map should load`);

    const state = createInitialWorldState(map, getScenarioLaunchPlayerIds(scenario), scenario, getScenarioLaunchPlayerTeams(scenario));

    for (const objective of Object.values(state.scenario.objectives)) {
      if (objective.type === "move-unit-to-area" && objective.area && objective.targetKind) {
        const unit = Object.values(state.units).find((candidate) =>
          candidate.playerId === (objective.playerId ?? "local-player") &&
          candidate.kind === objective.targetKind,
        );
        const target = {
          x: objective.area.x + Math.floor(objective.area.width / 2),
          y: objective.area.y + Math.floor(objective.area.height / 2),
        };

        assert.ok(unit, `${scenario.id} missing objective unit ${objective.targetKind}`);
        assert.notEqual(findPathForUnit(state, unit, target), null, `${scenario.id} ${unit.id} cannot reach objective area`);
      }

      if (objective.type === "defeat-opponents") {
        const attacker = Object.values(state.units).find((candidate) =>
          candidate.playerId === "local-player" &&
          unitDefinitions[candidate.kind].combat !== undefined &&
          candidate.movementSpeed > 0,
        );
        const enemyTarget = Object.values(state.units).find((candidate) => candidate.playerId === "cpu-1");

        assert.ok(attacker, `${scenario.id} missing local attacker`);
        assert.ok(enemyTarget, `${scenario.id} missing enemy objective target`);
        assert.notEqual(findPathForUnit(state, attacker, enemyTarget.position), null, `${scenario.id} local forces cannot reach enemy target`);
      }
    }
  }
});

test("imjinrok K01 adapted reinforcement event uses the configured requested positions when open", () => {
  const scenario = imjinrokCampaignScenarios.find((candidate) => candidate.id === "imjinrok-k01-opening");
  assert.ok(scenario, "K01 scenario should be registered");

  const map = createMapDefinitionFromId(scenario.mapId);
  assert.ok(map, "K01 map should load");

  const state = createInitialWorldState(map, getScenarioLaunchPlayerIds(scenario), scenario, getScenarioLaunchPlayerTeams(scenario));

  advanceTicks(state, 600);

  assert.equal(state.scenario.objectives["build-beacon"]?.status, "pending");
  assert.equal(state.scenario.objectives["defeat-forward-japanese"], undefined);
  assert.equal(state.scenario.objectives["withdraw-after-reinforcements"]?.visibleAfterObjectiveId, "build-beacon");
  assert.equal(state.scenario.scriptedEvents["k01-reinforcement-wave"]?.status, "pending");
  assert.equal(state.units["cpu-1-k0120-reinforcement-0x52"], undefined);
  assert.equal(state.scenario.status, "running");

  state.units["local-player-test-beacon"] = createUnitState(
    "local-player-test-beacon",
    "local-player",
    "beacon",
    { x: 12, y: 12 },
  );

  advanceWorldTick(state);

  assert.equal(state.scenario.objectives["build-beacon"]?.status, "completed");
  assert.equal(state.scenario.scriptedEvents["k01-reinforcement-wave"]?.status, "executed");
  assert.equal(state.scenario.scriptedEvents["k01-reinforcement-wave"]?.executedAtTick, state.tick);
  assert.equal(state.scenario.objectives["withdraw-after-reinforcements"]?.status, "completed");
  // These final positions equal the requests only because this fixture leaves each requested tile open.
  // Generic clamping/open-point search may relocate or skip them in other world states.
  assert.deepEqual(state.units["cpu-1-k0120-reinforcement-0x0d-1"]?.position, { x: 53, y: 51 });
  assert.equal(state.units["cpu-1-k0120-reinforcement-0x0d-1"]?.kind, "japanese-samurai");
  assert.equal(state.units["cpu-1-k0120-reinforcement-0x52"]?.kind, "japanese-konishi");
  assert.deepEqual(state.units["cpu-1-k0120-reinforcement-0x52"]?.position, { x: 55, y: 51 });
  assert.equal(state.units["cpu-1-k0120-reinforcement-0x0d-2"]?.kind, "japanese-samurai");
  assert.deepEqual(state.units["cpu-1-k0120-reinforcement-0x0d-2"]?.position, { x: 57, y: 51 });
  assert.equal(state.units["cpu-1-k0120-reinforcement-0x0e-1"]?.kind, "japanese-turtle-tank");
  assert.equal(state.units["cpu-1-k0120-reinforcement-0x0e-2"]?.kind, "japanese-turtle-tank");
  assert.equal(state.units["cpu-1-k0120-reinforcement-0x0e-3"]?.kind, "japanese-turtle-tank");
  assert.deepEqual(state.units["cpu-1-k0120-reinforcement-0x0e-2"]?.position, { x: 55, y: 53 });
  assert.equal(state.units["cpu-1-k0120-reinforcement-0x0c-1"]?.kind, "japanese-gunner");
  assert.equal(state.units["cpu-1-k0120-reinforcement-0x0c-2"]?.kind, "japanese-gunner");
  assert.equal(state.units["cpu-1-k0120-reinforcement-0x0c-3"]?.kind, "japanese-gunner");
  assert.equal(
    Object.values(state.units).filter((unit) => unit.playerId === "cpu-1" && unit.id.includes("k0120-reinforcement")).length,
    9,
  );
  assert.equal(
    Object.values(state.units).some((unit) => unit.playerId === "cpu-1" && unit.id.startsWith("cpu-1-source-")),
    true,
  );
  assert.equal(state.scenario.status, "running");
  assert.equal(state.scenario.endedAtTick, undefined);
  assert.deepEqual(
    state.scenario.events.slice(-2).map((event) => event.type),
    ["scripted-event", "objective-completed"],
  );

  assert.equal(completeScenarioRuntime(state, "victory"), true);
  assert.equal(state.scenario.status, "victory");
  assert.equal(state.scenario.endedAtTick, state.tick);
  assert.deepEqual(
    state.scenario.events.slice(-1).map((event) => event.type),
    ["scenario-victory"],
  );
});

test("imjinrok K02 evacuation completes at Pyongyang without requiring the Gwon Yul encounter", () => {
  const scenario = imjinrokCampaignScenarios.find((candidate) => candidate.id === "imjinrok-k02-advance");
  assert.ok(scenario, "K02 scenario should be registered");

  const map = createMapDefinitionFromId(scenario.mapId);
  assert.ok(map, "K02 map should load");

  const state = createInitialWorldState(map, getScenarioLaunchPlayerIds(scenario), scenario, getScenarioLaunchPlayerTeams(scenario));
  const objective = state.scenario.objectives["evacuate-royal-cart"];

  assert.ok(objective?.area, "K02 evacuation objective should define an area");
  assert.equal(state.scenario.objectives["rendezvous-with-gwon-yul"], undefined);
  assert.equal(objective.completionRequiresObjectiveIds, undefined);
  assert.deepEqual(objective.routeWaypoints, [
    { x: 6, y: 71 },
    { x: 33, y: 28 },
    { x: 76, y: 3 },
  ]);
  assert.deepEqual(objective.routeWaypointLabels, ["한성 출발", "권율 합류", "평양성 도착"]);
  const cart = Object.values(state.units).find((unit) => unit.playerId === "local-player" && unit.kind === "royal-cart");

  assert.ok(cart, "K0220 should create the royal cart at initial world creation");
  assert.deepEqual(cart.position, { x: 6, y: 71 });
  assert.equal(state.scenario.scriptedEvents["k02-royal-cart-spawn"]?.status, "executed");
  assert.equal(state.scenario.scriptedEvents["k02-royal-cart-spawn"]?.executedAtTick, 0);

  cart.position = {
    x: objective.area.x + Math.floor(objective.area.width / 2),
    y: objective.area.y + Math.floor(objective.area.height / 2),
  };

  advanceWorldTick(state);

  assert.equal(state.scenario.objectives["evacuate-royal-cart"]?.status, "completed");
  assert.equal(state.scenario.status, "running");
  assert.equal(state.scenario.endedAtTick, undefined);

  assert.equal(completeScenarioRuntime(state, "victory"), true);
  assert.equal(state.scenario.status, "victory");
});

test("imjinrok K02 Hanseong occupation spawns pursuers after the royal cart leaves the capital", () => {
  const scenario = imjinrokCampaignScenarios.find((candidate) => candidate.id === "imjinrok-k02-advance");
  assert.ok(scenario, "K02 scenario should be registered");

  const map = createMapDefinitionFromId(scenario.mapId);
  assert.ok(map, "K02 map should load");

  const state = createInitialWorldState(map, getScenarioLaunchPlayerIds(scenario), scenario, getScenarioLaunchPlayerTeams(scenario));
  const event = state.scenario.scriptedEvents["k02-hanseong-occupation-pursuit"];
  const initialOccupationUnits = Object.values(state.units).filter(
    (unit) => unit.playerId === "cpu-1" && unit.id.includes("k0225-occupation"),
  );

  assert.ok(event, "K02 should define the K0225 occupation event");
  assert.equal(event.trigger.type, "unit-in-area");
  assert.equal(initialOccupationUnits.length, 0);
  assert.equal(Object.values(state.units).filter((unit) => unit.playerId === "cpu-1").length, 10);

  const cart = Object.values(state.units).find((unit) => unit.playerId === "local-player" && unit.kind === "royal-cart");

  assert.ok(cart, "K0220 should create the royal cart before K0225 can fire");
  assert.equal(
    Object.values(state.units).filter((unit) => unit.playerId === "cpu-1" && unit.id.includes("k0225-occupation")).length,
    0,
  );

  if (event.trigger.type !== "unit-in-area") {
    throw new Error("K02 occupation trigger should be unit-in-area");
  }

  cart.position = {
    x: event.trigger.area.x,
    y: cart.position.y,
  };

  advanceWorldTick(state);

  const pursuer = state.units["cpu-1-k0225-occupation-0x52"];
  const lastPursuer = state.units["cpu-1-k0225-occupation-0x0c-19"];
  const occupationUnits = Object.values(state.units).filter((unit) => unit.playerId === "cpu-1" && unit.id.includes("k0225-occupation"));

  assert.equal(state.scenario.scriptedEvents["k02-hanseong-occupation-pursuit"]?.status, "executed");
  assert.equal(pursuer?.kind, "japanese-gunner");
  assert.ok((pursuer?.position.x ?? 1) >= 0 && (pursuer?.position.x ?? 1) <= 0.5);
  assert.ok((pursuer?.position.y ?? 0) >= 64.5 && (pursuer?.position.y ?? 0) <= 65);
  assert.ok((lastPursuer?.position.x ?? 1) >= 0 && (lastPursuer?.position.x ?? 1) <= 0.5);
  assert.ok((lastPursuer?.position.y ?? 0) >= 70.5 && (lastPursuer?.position.y ?? 0) <= 71);
  assert.equal(pursuer?.currentOrder?.type, "move");
  assert.deepEqual(pursuer?.currentOrder?.target, { x: 67, y: 59 });
  assert.ok((pursuer?.movementPath?.length ?? 0) > 0);
  assert.equal(occupationUnits.length, 20);
  assert.equal(occupationUnits.filter((unit) => unit.kind === "japanese-gunner").length, 1);
  assert.equal(occupationUnits.filter((unit) => unit.kind === "japanese-swordsman").length, 19);
  assert.equal(state.scenario.status, "running");

  pursuer.health.current = 9_999;
  pursuer.health.max = 9_999;
  let followUpTicks = 0;
  for (; followUpTicks < 1_000 && pursuer.currentOrder?.type !== "attack-unit"; followUpTicks += 1) {
    advanceWorldTick(state);
  }

  assert.ok(followUpTicks > 20, "K0225 pursuers should not target the royal cart immediately after spawning");
  assert.ok(followUpTicks <= 250, "K0225 pursuers should use the source 100-tick location check before exhausting the partial path");
  assert.deepEqual(pursuer.currentOrder, { type: "attack-unit", targetUnitId: "local-player-royal-cart" });
});

test("imjinrok K02 occupation pursuers reissue the source lower-left rally every 100 ticks", () => {
  const scenario = imjinrokCampaignScenarios.find((candidate) => candidate.id === "imjinrok-k02-advance");
  assert.ok(scenario, "K02 scenario should be registered");

  const map = createMapDefinitionFromId(scenario.mapId);
  assert.ok(map, "K02 map should load");

  const state = createInitialWorldState(map, getScenarioLaunchPlayerIds(scenario), scenario, getScenarioLaunchPlayerTeams(scenario));
  const event = state.scenario.scriptedEvents["k02-hanseong-occupation-pursuit"];
  const cart = Object.values(state.units).find((unit) => unit.playerId === "local-player" && unit.kind === "royal-cart");

  assert.ok(event, "K02 should define the K0225 occupation event");
  assert.ok(cart, "K0220 should create the royal cart before K0225 can fire");

  if (event.trigger.type !== "unit-in-area") {
    throw new Error("K02 occupation trigger should be unit-in-area");
  }

  cart.position = {
    x: event.trigger.area.x,
    y: cart.position.y,
  };

  advanceWorldTick(state);

  const pursuer = state.units["cpu-1-k0225-occupation-0x52"];

  assert.ok(pursuer, "K0225 should spawn the source lead pursuer");
  assert.deepEqual(pursuer.scriptedBehavior, {
    type: "conditional-attack-target",
    moveTarget: { x: 67, y: 59 },
    allowPartialPath: true,
    whileInsideArea: { x: 0, y: 59, width: 63, height: 21 },
    attackTarget: { playerId: "local-player", targetKind: "royal-cart" },
    checkIntervalTicks: 100,
  });

  pursuer.position = { x: 1, y: 79 };
  delete pursuer.currentOrder;
  delete pursuer.movementPath;
  delete pursuer.movementTarget;

  while (state.tick < 100) {
    advanceWorldTick(state);
  }

  assert.equal(pursuer.currentOrder?.type, "move");
  assert.deepEqual(pursuer.currentOrder?.target, { x: 67, y: 59 });
  assert.ok((pursuer.movementPath?.length ?? 0) > 0);
  assert.equal(state.scenario.status, "running");
});

test("imjinrok K02 starts the source midcourse rain effect once the royal cart reaches x45", () => {
  const scenario = imjinrokCampaignScenarios.find((candidate) => candidate.id === "imjinrok-k02-advance");
  assert.ok(scenario, "K02 scenario should be registered");

  const map = createMapDefinitionFromId(scenario.mapId);
  assert.ok(map, "K02 map should load");

  const state = createInitialWorldState(map, getScenarioLaunchPlayerIds(scenario), scenario, getScenarioLaunchPlayerTeams(scenario));
  const event = state.scenario.scriptedEvents["k02-midcourse-rain"];
  const cart = Object.values(state.units).find((unit) => unit.playerId === "local-player" && unit.kind === "royal-cart");

  assert.ok(event, "K02 should define the midcourse rain event");
  assert.ok(cart, "K0220 should create the royal cart before the rain event can fire");
  assert.equal(state.environment.weather, "clear");
  assert.equal(event.status, "pending");

  cart.position = { x: 45, y: cart.position.y };
  advanceWorldTick(state);

  assert.equal(state.scenario.scriptedEvents["k02-midcourse-rain"]?.status, "executed");
  assert.equal(state.scenario.scriptedEvents["k02-midcourse-rain"]?.executedAtTick, state.tick);
  assert.equal(state.environment.weather, "rain");
  assert.equal(state.environment.weatherOverride, "rain");
  assert.equal(state.environment.weatherOverrideUntilTick, state.tick + 800);
});

test("imjinrok K02 Gwon Yul encounter uses the preplaced source ally group and does not spawn units", () => {
  const scenario = imjinrokCampaignScenarios.find((candidate) => candidate.id === "imjinrok-k02-advance");
  assert.ok(scenario, "K02 scenario should be registered");

  const dialogue = scenario.missionDialogues?.find((candidate) => candidate.sourceScript === "script/K0227");
  const scriptedEvent = scenario.scriptedEvents?.find((candidate) => candidate.sourceScript === "script/K0227");
  const map = createMapDefinitionFromId(scenario.mapId);
  assert.ok(map, "K02 map should load");

  const state = createInitialWorldState(map, getScenarioLaunchPlayerIds(scenario), scenario, getScenarioLaunchPlayerTeams(scenario));

  assert.equal(scriptedEvent, undefined);
  assert.equal(dialogue?.trigger.type, "unit-in-area");
  assert.deepEqual(dialogue?.trigger, {
    type: "unit-in-area",
    playerId: "local-player",
    targetKind: "royal-cart",
    area: { x: 31, y: 26, width: 5, height: 5 },
  });
  assert.equal(Object.values(state.units).some((unit) => unit.playerId === "local-player" && unit.kind === "gwon-yul"), false);

  const initialAllyUnits = Object.values(state.units).filter((unit) => unit.playerId === "ally-1");
  const initialAllyGwon = initialAllyUnits.filter((unit) => unit.kind === "gwon-yul");
  const cart = Object.values(state.units).find((unit) => unit.playerId === "local-player" && unit.kind === "royal-cart");

  assert.equal(initialAllyUnits.length, 4);
  assert.equal(initialAllyGwon.length, 1);
  assert.deepEqual(initialAllyGwon[0]?.position, { x: 32, y: 27 });
  assert.ok(cart, "K0220 should create the royal cart before K0227 can fire");

  if (dialogue?.trigger.type !== "unit-in-area") {
    throw new Error("K02 dialogue trigger should be unit-in-area");
  }

  cart.position = {
    x: dialogue.trigger.area.x + Math.floor(dialogue.trigger.area.width / 2),
    y: dialogue.trigger.area.y + Math.floor(dialogue.trigger.area.height / 2),
  };

  advanceWorldTick(state);

  assert.equal(Object.values(state.units).some((unit) => unit.playerId === "local-player" && unit.kind === "gwon-yul"), false);
  assert.equal(Object.values(state.units).filter((unit) => unit.playerId === "ally-1").length, initialAllyUnits.length);
  assert.equal(state.scenario.scriptedEvents["k02-gwon-yul-rendezvous"], undefined);
  assert.equal(state.scenario.objectives["rendezvous-with-gwon-yul"], undefined);
  assert.equal(state.scenario.status, "running");
});

test("random skirmish maps start without placement collisions across representative seeds", () => {
  for (const seed of [1, 7, 12345, 54321, 987654321]) {
    const map = createRandomSkirmishMap(seed, 96);
    const state = createInitialWorldState(map, ["p1", "p2", "p3", "p4"], defaultSkirmishScenario);

    assertValidStartingPlacements(state, `random skirmish seed ${seed}`);
  }
});

test("build-building objective completes after the requested building is constructed", () => {
  const scenario: ScenarioDefinition = {
    ...defaultSkirmishScenario,
    id: "build-beacon-objective",
    objectives: [
      {
        id: "build-beacon",
        label: "Build Beacon",
        description: "Construct a signal beacon.",
        type: "build-building",
        playerId: "p1",
        targetKind: "beacon",
        count: 1,
        required: true,
      },
    ],
  };
  const state = createInitialWorldState(defaultMap, ["p1", "p2"], scenario);
  const result = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "build",
      builderUnitId: "p1-villager-1",
      building: "beacon",
      target: { x: 12, y: 12 },
    },
  });

  assert.equal(result.ok, true);
  advanceWorldTick(state);

  assert.equal(state.units["p1-beacon-1"]?.construction !== undefined, true);
  assert.equal(state.scenario.objectives["build-beacon"]?.status, "pending");
  advanceTicks(state, getBuildTimeTicks("beacon") + 120);

  assert.equal(state.units["p1-beacon-1"]?.construction, undefined);
  assert.equal(state.scenario.objectives["build-beacon"]?.status, "completed");
  assert.equal(state.scenario.status, "victory");
});

test("move-unit-to-area objective completes when the target unit reaches the area", () => {
  const scenario: ScenarioDefinition = {
    ...defaultSkirmishScenario,
    id: "evacuate-royal-cart-objective",
    startingUnits: [{ kind: "royal-cart", idSuffix: "royal-cart", offset: { x: 0, y: 0 } }],
    playerStarts: undefined,
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
  const state = createInitialWorldState(defaultMap, ["p1"], scenario);

  state.units["p1-royal-cart"]!.position = { x: 11, y: 11 };
  advanceWorldTick(state);

  assert.equal(state.scenario.objectives["evacuate-royal-cart"]?.status, "completed");
  assert.equal(state.scenario.status, "victory");
});

test("move-unit-to-area objective fails when the target unit is lost", () => {
  const scenario: ScenarioDefinition = {
    ...defaultSkirmishScenario,
    id: "lost-royal-cart-objective",
    startingUnits: [],
    playerStarts: {
      p1: {
        startingUnits: [
          { kind: "royal-cart", idSuffix: "royal-cart", offset: { x: 0, y: 0 } },
          { kind: "villager", idSuffix: "villager-1", offset: { x: 3, y: 0 } },
        ],
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
  const state = createInitialWorldState(defaultMap, ["p1", "p2"], scenario);

  delete state.units["p1-royal-cart"];
  advanceWorldTick(state);

  assert.equal(state.scenario.objectives["evacuate-royal-cart"]?.status, "failed");
  assert.equal(state.scenario.status, "defeat");
});

test("protect-units objective ends in defeat when a protected unit is lost without blocking victory conditions", () => {
  const scenario: ScenarioDefinition = {
    ...defaultSkirmishScenario,
    id: "protect-hero-objective",
    startingUnits: [],
    playerStarts: {
      p1: {
        startingUnits: [
          { kind: "ryu-seong-ryong", idSuffix: "ryu-seong-ryong", offset: { x: 0, y: 0 } },
          { kind: "swordsman", idSuffix: "swordsman-1", offset: { x: 1, y: 0 } },
        ],
      },
      p2: {
        startingUnits: [{ kind: "swordsman", idSuffix: "swordsman-1", offset: { x: 0, y: 0 } }],
      },
    },
    objectives: [
      {
        id: "defeat-enemy",
        label: "Defeat Enemy",
        description: "Defeat the enemy.",
        type: "defeat-opponents",
        required: true,
      },
      {
        id: "protect-ryu",
        label: "Protect Ryu",
        description: "Do not lose Ryu Seong-ryong.",
        type: "protect-units",
        playerId: "p1",
        targetKind: "ryu-seong-ryong",
        count: 1,
        required: false,
        defeatOnFailure: true,
      },
    ],
  };
  const state = createInitialWorldState(defaultMap, ["p1", "p2"], scenario);

  delete state.units["p1-ryu-seong-ryong"];
  advanceWorldTick(state);

  assert.equal(state.scenario.objectives["protect-ryu"]?.status, "failed");
  assert.equal(state.scenario.objectives["defeat-enemy"]?.status, "pending");
  assert.equal(state.scenario.status, "defeat");
});

test("protect-units objective can delay defeat after a protected unit is lost", () => {
  const defeatDelayTicks = 3;
  const scenario: ScenarioDefinition = {
    ...defaultSkirmishScenario,
    id: "protect-hero-delayed-defeat-objective",
    startingUnits: [],
    playerStarts: {
      p1: {
        startingUnits: [
          { kind: "ryu-seong-ryong", idSuffix: "ryu-seong-ryong", offset: { x: 0, y: 0 } },
          { kind: "swordsman", idSuffix: "swordsman-1", offset: { x: 1, y: 0 } },
        ],
      },
      p2: {
        startingUnits: [{ kind: "swordsman", idSuffix: "swordsman-1", offset: { x: 0, y: 0 } }],
      },
    },
    objectives: [
      {
        id: "defeat-enemy",
        label: "Defeat Enemy",
        description: "Defeat the enemy.",
        type: "defeat-opponents",
        required: true,
      },
      {
        id: "protect-ryu",
        label: "Protect Ryu",
        description: "Do not lose Ryu Seong-ryong.",
        type: "protect-units",
        playerId: "p1",
        targetKind: "ryu-seong-ryong",
        count: 1,
        required: false,
        defeatOnFailure: true,
        defeatDelayTicks,
      },
    ],
  };
  const state = createInitialWorldState(defaultMap, ["p1", "p2"], scenario);

  delete state.units["p1-ryu-seong-ryong"];
  advanceWorldTick(state);

  const failedAtTick = state.scenario.objectives["protect-ryu"]?.failedAtTick;

  assert.equal(state.scenario.objectives["protect-ryu"]?.status, "failed");
  assert.equal(state.scenario.status, "running");

  advanceTicks(state, defeatDelayTicks);

  assert.equal(state.tick - (failedAtTick ?? 0), defeatDelayTicks);
  assert.equal(state.scenario.status, "running");

  advanceWorldTick(state);

  assert.equal(state.tick - (failedAtTick ?? 0), defeatDelayTicks + 1);
  assert.equal(state.scenario.status, "defeat");
});

test("protect-units objective completes on victory while protected units survive", () => {
  const scenario: ScenarioDefinition = {
    ...defaultSkirmishScenario,
    id: "protect-hero-does-not-block-victory",
    startingUnits: [],
    playerStarts: {
      p1: {
        startingUnits: [
          { kind: "ryu-seong-ryong", idSuffix: "ryu-seong-ryong", offset: { x: 0, y: 0 } },
          { kind: "swordsman", idSuffix: "swordsman-1", offset: { x: 1, y: 0 } },
        ],
      },
      p2: {
        startingUnits: [{ kind: "swordsman", idSuffix: "swordsman-1", offset: { x: 0, y: 0 } }],
      },
    },
    objectives: [
      {
        id: "defeat-enemy",
        label: "Defeat Enemy",
        description: "Defeat the enemy.",
        type: "defeat-opponents",
        required: true,
      },
      {
        id: "protect-ryu",
        label: "Protect Ryu",
        description: "Do not lose Ryu Seong-ryong.",
        type: "protect-units",
        playerId: "p1",
        targetKind: "ryu-seong-ryong",
        count: 1,
        required: false,
        defeatOnFailure: true,
      },
    ],
  };
  const state = createInitialWorldState(defaultMap, ["p1", "p2"], scenario);

  delete state.units["p2-swordsman-1"];
  advanceWorldTick(state);

  assert.equal(state.scenario.objectives["protect-ryu"]?.status, "completed");
  assert.equal(state.scenario.objectives["defeat-enemy"]?.status, "completed");
  assert.equal(state.scenario.status, "victory");
  assert.deepEqual(
    state.scenario.events.map((event) => `${event.type}:${event.objectiveId ?? ""}`),
    [
      "objective-completed:defeat-enemy",
      "objective-completed:protect-ryu",
      "scenario-victory:",
    ],
  );
});

test("survive objective completes after the requested duration", () => {
  const scenario: ScenarioDefinition = {
    ...defaultSkirmishScenario,
    id: "survive-three-ticks-objective",
    objectives: [
      {
        id: "hold-line",
        label: "Hold the Line",
        description: "Survive until reinforcements arrive.",
        type: "survive",
        durationTicks: 3,
        required: true,
      },
    ],
  };
  const state = createInitialWorldState(defaultMap, ["p1", "p2"], scenario);

  advanceTicks(state, 2);
  assert.equal(state.scenario.objectives["hold-line"]?.status, "pending");
  assert.equal(state.scenario.status, "running");

  advanceWorldTick(state);
  assert.equal(state.scenario.objectives["hold-line"]?.status, "completed");
  assert.equal(state.scenario.status, "victory");
});

test("collect-resources objective completes when the player bank reaches all requirements", () => {
  const scenario: ScenarioDefinition = {
    ...defaultSkirmishScenario,
    id: "collect-food-and-wood-objective",
    objectives: [
      {
        id: "stockpile-supplies",
        label: "Stockpile Supplies",
        description: "Gather enough supplies for the next march.",
        type: "collect-resources",
        playerId: "p1",
        resources: { food: 260, wood: 200 },
        required: true,
      },
    ],
  };
  const state = createInitialWorldState(defaultMap, ["p1", "p2"], scenario);

  advanceWorldTick(state);
  assert.equal(state.scenario.objectives["stockpile-supplies"]?.status, "pending");
  assert.equal(state.scenario.status, "running");

  state.playerResources.p1!.food = 260;
  advanceWorldTick(state);

  assert.equal(state.scenario.objectives["stockpile-supplies"]?.status, "completed");
  assert.equal(state.scenario.status, "victory");
});

test("scenario ends in defeat when the primary player has no units", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);

  for (const unit of Object.values(state.units)) {
    if (unit.playerId === "p1") {
      delete state.units[unit.id];
    }
  }

  advanceWorldTick(state);

  assert.equal(state.scenario.status, "defeat");
});

test("scenario ends in defeat when every side has been eliminated", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);

  for (const unit of Object.values(state.units)) {
    delete state.units[unit.id];
  }

  advanceWorldTick(state);

  assert.equal(state.scenario.status, "defeat");
});

test("single-player scenario ends in defeat when the primary player has no units", () => {
  const state = createInitialWorldState(defaultMap, ["p1"]);

  for (const unit of Object.values(state.units)) {
    delete state.units[unit.id];
  }

  advanceWorldTick(state);

  assert.equal(state.scenario.status, "defeat");
});

test("world ticks stop advancing after a scenario has ended", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);

  for (const unit of Object.values(state.units)) {
    if (unit.playerId === "p2") {
      delete state.units[unit.id];
    }
  }

  advanceWorldTick(state);
  const endedAtTick = state.tick;

  advanceWorldTick(state);

  assert.equal(state.scenario.status, "victory");
  assert.equal(state.tick, endedAtTick);
});

test("commands are rejected after a scenario has ended", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);

  for (const unit of Object.values(state.units)) {
    if (unit.playerId === "p2") {
      delete state.units[unit.id];
    }
  }

  advanceWorldTick(state);
  assert.equal(state.scenario.status, "victory");

  const unit = state.units["p1-villager-1"]!;
  const result = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "move",
      unitId: unit.id,
      target: { x: 10, y: 10 },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "scenario has ended");
  assert.equal(unit.currentOrder, undefined);
  assert.equal(state.lastAcceptedCommand, null);
});

test("scripted spawn event fires once and assigns a unit order", () => {
  const scenario: ScenarioDefinition = {
    ...defaultSkirmishScenario,
    id: "scripted-reinforcement-event",
    startingUnits: [],
    playerStarts: {
      p1: {
        startingUnits: [{ kind: "villager", idSuffix: "villager-1", offset: { x: 0, y: 0 } }],
      },
      p2: {
        startingUnits: [],
      },
    },
    objectives: [],
    scriptedEvents: [
      {
        id: "enemy-wave",
        sourceScript: "script/test",
        trigger: { type: "tick", tick: 2 },
        actions: [
          {
            type: "spawn-units",
            playerId: "p2",
            origin: { x: 20, y: 20 },
            units: [
              { kind: "swordsman", idSuffix: "wave-swordsman-1", offset: { x: 0, y: 0 } },
              { kind: "swordsman", idSuffix: "wave-swordsman-2", offset: { x: 1, y: 0 } },
            ],
            order: { type: "attack-move", target: { x: 3, y: 3 } },
          },
        ],
      },
    ],
  };
  const state = createInitialWorldState(defaultMap, ["p1", "p2"], scenario);

  advanceWorldTick(state);
  assert.equal(state.units["p2-wave-swordsman-1"], undefined);

  advanceWorldTick(state);
  assert.equal(state.scenario.scriptedEvents["enemy-wave"]?.status, "executed");
  assert.equal(state.scenario.scriptedEvents["enemy-wave"]?.executedAtTick, 2);
  assert.equal(state.units["p2-wave-swordsman-1"]?.kind, "swordsman");
  assert.equal(state.units["p2-wave-swordsman-1"]?.currentOrder?.type, "attack-move");
  assert.equal(state.scenario.events.at(-1)?.type, "scripted-event");
  assert.equal(state.scenario.events.at(-1)?.scriptedEventId, "enemy-wave");

  advanceWorldTick(state);
  assert.deepEqual(
    Object.values(state.units).filter((unit) => unit.playerId === "p2").map((unit) => unit.id).sort(),
    ["p2-wave-swordsman-1", "p2-wave-swordsman-2"],
  );
});

test("tick-zero scripted events run during initial world creation without firing area triggers", () => {
  const scenario: ScenarioDefinition = {
    ...defaultSkirmishScenario,
    id: "initial-tick-scripted-event",
    startingResources: { food: 0, wood: 0, gold: 0, stone: 0 },
    startingUnits: [],
    playerStarts: {
      p1: { startingUnits: [{ kind: "villager", idSuffix: "villager-1", offset: { x: 0, y: 0 } }] },
      p2: { startingUnits: [] },
    },
    objectives: [],
    scriptedEvents: [
      {
        id: "opening-supplies",
        trigger: { type: "tick", tick: 0 },
        actions: [
          {
            type: "grant-resources",
            playerId: "p1",
            resources: { gold: 25 },
          },
        ],
      },
      {
        id: "area-supplies",
        trigger: {
          type: "unit-in-area",
          playerId: "p1",
          targetKind: "villager",
          area: { x: 0, y: 0, width: 20, height: 20 },
        },
        actions: [
          {
            type: "grant-resources",
            playerId: "p1",
            resources: { wood: 25 },
          },
        ],
      },
    ],
  };
  const state = createInitialWorldState(defaultMap, ["p1", "p2"], scenario);

  assert.equal(state.scenario.scriptedEvents["opening-supplies"]?.status, "executed");
  assert.equal(state.scenario.scriptedEvents["opening-supplies"]?.executedAtTick, 0);
  assert.equal(state.scenario.scriptedEvents["area-supplies"]?.status, "pending");
  assert.deepEqual(state.playerResources.p1, { food: 0, wood: 0, gold: 25, stone: 0 });

  advanceWorldTick(state);

  assert.equal(state.scenario.scriptedEvents["area-supplies"]?.status, "executed");
  assert.deepEqual(state.playerResources.p1, { food: 0, wood: 25, gold: 25, stone: 0 });
});

test("scripted weather events can expire after their source duration", () => {
  const scenario: ScenarioDefinition = {
    ...defaultSkirmishScenario,
    id: "scripted-weather-window",
    startingResources: { food: 0, wood: 0, gold: 0, stone: 0 },
    startingUnits: [],
    playerStarts: {
      p1: { startingUnits: [{ kind: "villager", idSuffix: "villager-1", offset: { x: 0, y: 0 } }] },
      p2: { startingUnits: [] },
    },
    objectives: [],
    scriptedEvents: [
      {
        id: "rain-window",
        trigger: { type: "tick", tick: 1 },
        actions: [
          {
            type: "set-weather",
            weather: "rain",
            durationTicks: 3,
          },
        ],
      },
    ],
  };
  const state = createInitialWorldState(defaultMap, ["p1", "p2"], scenario);

  assert.equal(state.environment.weather, "clear");

  advanceWorldTick(state);

  assert.equal(state.tick, 1);
  assert.equal(state.scenario.scriptedEvents["rain-window"]?.status, "executed");
  assert.equal(state.environment.weather, "rain");
  assert.equal(state.environment.weatherOverrideUntilTick, 4);

  advanceWorldTick(state);
  advanceWorldTick(state);

  assert.equal(state.tick, 3);
  assert.equal(state.environment.weather, "rain");

  advanceWorldTick(state);

  assert.equal(state.tick, 4);
  assert.equal(state.environment.weather, "clear");
  assert.equal(state.environment.weatherOverride, undefined);
  assert.equal(state.environment.weatherOverrideUntilTick, undefined);
});

test("scripted spawn skips unreachable movement orders", () => {
  const map = createBlankMap({ width: 16, height: 10 });

  for (let y = 0; y < map.height; y += 1) {
    map.layers[0]!.tiles[getTileIndex(map.width, 8, y)] = {
      terrain: "water",
      elevation: 0,
    };
  }

  const scenario: ScenarioDefinition = {
    ...defaultSkirmishScenario,
    id: "scripted-unreachable-order",
    mapId: map.id,
    startingUnits: [],
    playerStarts: {
      p1: {
        startingUnits: [{ kind: "villager", idSuffix: "villager-1", offset: { x: 0, y: 0 } }],
      },
      p2: {
        startingUnits: [],
      },
    },
    objectives: [],
    scriptedEvents: [
      {
        id: "blocked-wave",
        trigger: { type: "tick", tick: 1 },
        actions: [
          {
            type: "spawn-units",
            playerId: "p2",
            origin: { x: 12, y: 4 },
            units: [{ kind: "swordsman", idSuffix: "blocked-swordsman", offset: { x: 0, y: 0 } }],
            order: { type: "attack-move", target: { x: 3, y: 4 } },
          },
        ],
      },
    ],
  };
  const state = createInitialWorldState(map, ["p1", "p2"], scenario);

  advanceWorldTick(state);

  const spawnedUnit = state.units["p2-blocked-swordsman"];

  assert.equal(state.scenario.scriptedEvents["blocked-wave"]?.status, "executed");
  assert.equal(spawnedUnit?.kind, "swordsman");
  assert.equal(spawnedUnit?.currentOrder, undefined);
  assert.equal(spawnedUnit?.movementTarget, undefined);
});

test("scripted spawn can use partial paths for source rally points", () => {
  const map = createBlankMap({ width: 16, height: 10 });

  for (let y = 0; y < map.height; y += 1) {
    map.layers[0]!.tiles[getTileIndex(map.width, 8, y)] = {
      terrain: "water",
      elevation: 0,
    };
  }

  const scenario: ScenarioDefinition = {
    ...defaultSkirmishScenario,
    id: "scripted-partial-rally",
    mapId: map.id,
    startingUnits: [],
    playerStarts: {
      p1: {
        startingUnits: [{ kind: "villager", idSuffix: "villager-1", offset: { x: 0, y: 0 } }],
      },
      p2: {
        startingUnits: [],
      },
    },
    objectives: [],
    scriptedEvents: [
      {
        id: "partial-rally-wave",
        trigger: { type: "tick", tick: 1 },
        actions: [
          {
            type: "spawn-units",
            playerId: "p2",
            origin: { x: 4, y: 5 },
            units: [{ kind: "swordsman", idSuffix: "partial-swordsman", offset: { x: 0, y: 0 } }],
            order: { type: "move", target: { x: 12, y: 5 }, allowPartialPath: true },
          },
        ],
      },
    ],
  };
  const state = createInitialWorldState(map, ["p1", "p2"], scenario);

  advanceWorldTick(state);

  const spawnedUnit = state.units["p2-partial-swordsman"];

  assert.equal(state.scenario.scriptedEvents["partial-rally-wave"]?.status, "executed");
  assert.deepEqual(spawnedUnit?.currentOrder, { type: "move", target: { x: 12, y: 5 } });
  assert.ok((spawnedUnit?.movementPath?.length ?? 0) > 0);
  assert.ok((spawnedUnit?.movementPath?.at(-1)?.x ?? 8) < 8);
});

test("scripted building spawn searches for a footprint-clear placement", () => {
  const map = createBlankMap({ width: 24, height: 24 });
  const scenario: ScenarioDefinition = {
    ...defaultSkirmishScenario,
    id: "scripted-building-spawn-clear-footprint",
    mapId: map.id,
    startingUnits: [],
    playerStarts: {
      p1: {
        startingUnits: [{ kind: "town-center", idSuffix: "town-center", offset: { x: 0, y: 0 } }],
      },
      p2: {
        startingUnits: [],
      },
    },
    objectives: [],
    scriptedEvents: [
      {
        id: "forward-base",
        trigger: { type: "tick", tick: 1 },
        actions: [
          {
            type: "spawn-units",
            playerId: "p2",
            origin: { x: 3, y: 3 },
            units: [{ kind: "town-center", idSuffix: "forward-town-center", offset: { x: 0, y: 0 } }],
          },
        ],
      },
    ],
  };
  const state = createInitialWorldState(map, ["p1", "p2"], scenario);
  const existingTownCenter = state.units["p1-town-center"]!;

  advanceWorldTick(state);

  const spawnedTownCenter = state.units["p2-forward-town-center"];

  assert.equal(spawnedTownCenter?.kind, "town-center");
  assert.notDeepEqual(spawnedTownCenter?.position, existingTownCenter.position);
  assertValidStartingPlacements(state, "scripted building spawn");
});

test("scripted resource grant can satisfy a collection objective on the same tick", () => {
  const scenario: ScenarioDefinition = {
    ...defaultSkirmishScenario,
    id: "scripted-resource-grant-event",
    objectives: [
      {
        id: "stockpile-gold",
        label: "Stockpile Gold",
        description: "Receive enough gold for reinforcements.",
        type: "collect-resources",
        playerId: "p1",
        resources: { gold: 150 },
        required: true,
      },
    ],
    scriptedEvents: [
      {
        id: "gold-arrives",
        trigger: { type: "tick", tick: 2 },
        actions: [
          {
            type: "grant-resources",
            playerId: "p1",
            resources: { gold: 50 },
          },
        ],
      },
    ],
  };
  const state = createInitialWorldState(defaultMap, ["p1", "p2"], scenario);

  assert.equal(state.playerResources.p1!.gold, 100);
  advanceWorldTick(state);
  assert.equal(state.scenario.objectives["stockpile-gold"]?.status, "pending");

  advanceWorldTick(state);

  assert.equal(state.playerResources.p1!.gold, 150);
  assert.equal(state.scenario.scriptedEvents["gold-arrives"]?.status, "executed");
  assert.equal(state.scenario.objectives["stockpile-gold"]?.status, "completed");
  assert.equal(state.scenario.status, "victory");
});

test("objective-status scripted events fire on the same tick the objective is completed", () => {
  const scenario: ScenarioDefinition = {
    ...defaultSkirmishScenario,
    id: "same-tick-objective-status-event",
    startingUnits: [],
    playerStarts: {
      p1: {
        startingUnits: [
          { kind: "beacon", idSuffix: "beacon", offset: { x: 0, y: 0 } },
        ],
      },
      p2: {
        startingUnits: [],
      },
    },
    objectives: [
      {
        id: "build-beacon",
        label: "Build Beacon",
        description: "Complete a beacon.",
        type: "build-building",
        playerId: "p1",
        targetKind: "beacon",
        required: true,
      },
      {
        id: "await-retreat",
        label: "Await Retreat",
        description: "Wait for the scripted retreat order.",
        type: "custom",
        required: true,
        visibleAfterObjectiveId: "build-beacon",
      },
    ],
    scriptedEvents: [
      {
        id: "retreat-order",
        trigger: { type: "objective-status", objectiveId: "build-beacon", status: "completed" },
        actions: [
          {
            type: "complete-objective",
            objectiveId: "await-retreat",
          },
        ],
      },
    ],
  };
  const state = createInitialWorldState(defaultMap, ["p1", "p2"], scenario);

  advanceWorldTick(state);

  assert.equal(state.scenario.objectives["build-beacon"]?.completedAtTick, 1);
  assert.equal(state.scenario.scriptedEvents["retreat-order"]?.status, "executed");
  assert.equal(state.scenario.scriptedEvents["retreat-order"]?.executedAtTick, 1);
  assert.equal(state.scenario.objectives["await-retreat"]?.completedAtTick, 1);
  assert.equal(state.scenario.status, "victory");
  assert.equal(state.scenario.endedAtTick, 1);
});

test("scripted completion mode waits for an explicit scenario result", () => {
  const scenario: ScenarioDefinition = {
    ...defaultSkirmishScenario,
    id: "scripted-completion-mode",
    completionMode: "scripted",
    startingUnits: [],
    playerStarts: {
      p1: {
        startingUnits: [
          { kind: "beacon", idSuffix: "beacon", offset: { x: 0, y: 0 } },
        ],
      },
      p2: {
        startingUnits: [],
      },
    },
    objectives: [
      {
        id: "build-beacon",
        label: "Build Beacon",
        description: "Complete a beacon.",
        type: "build-building",
        playerId: "p1",
        targetKind: "beacon",
        required: true,
      },
    ],
  };
  const state = createInitialWorldState(defaultMap, ["p1", "p2"], scenario);

  advanceWorldTick(state);

  assert.equal(state.scenario.objectives["build-beacon"]?.status, "completed");
  assert.equal(state.scenario.status, "running");
  assert.equal(state.scenario.endedAtTick, undefined);

  assert.equal(completeScenarioRuntime(state, "victory"), true);
  assert.equal(state.scenario.status, "victory");
  assert.equal(state.scenario.endedAtTick, 1);
});

test("scripted complete-scenario action can finish a custom objective mission", () => {
  const scenario: ScenarioDefinition = {
    ...defaultSkirmishScenario,
    id: "scripted-complete-scenario-event",
    objectives: [
      {
        id: "await-retreat",
        label: "Await Retreat",
        description: "Wait for the scripted retreat order.",
        type: "custom",
        required: true,
      },
    ],
    scriptedEvents: [
      {
        id: "retreat-order",
        trigger: { type: "tick", tick: 2 },
        actions: [
          {
            type: "complete-objective",
            objectiveId: "await-retreat",
          },
          {
            type: "complete-scenario",
            status: "victory",
          },
        ],
      },
    ],
  };
  const state = createInitialWorldState(defaultMap, ["p1", "p2"], scenario);

  advanceWorldTick(state);
  assert.equal(state.scenario.objectives["await-retreat"]?.status, "pending");
  assert.equal(state.scenario.status, "running");

  advanceWorldTick(state);

  assert.equal(state.scenario.scriptedEvents["retreat-order"]?.status, "executed");
  assert.equal(state.scenario.scriptedEvents["retreat-order"]?.executedAtTick, 2);
  assert.equal(state.scenario.objectives["await-retreat"]?.status, "completed");
  assert.equal(state.scenario.status, "victory");
  assert.equal(state.scenario.endedAtTick, 2);
  assert.deepEqual(
    state.scenario.events.map((event) => event.type),
    ["scripted-event", "objective-completed", "scenario-victory"],
  );
});

test("scenario-status scripted event fires on the victory tick", () => {
  const scenario: ScenarioDefinition = {
    ...defaultSkirmishScenario,
    id: "scripted-victory-status-event",
    objectives: [
      {
        id: "hold-for-arrival",
        label: "Hold for Arrival",
        description: "Survive until reinforcements arrive.",
        type: "survive",
        durationTicks: 1,
        required: true,
      },
    ],
    scriptedEvents: [
      {
        id: "victory-supplies",
        trigger: { type: "scenario-status", status: "victory" },
        actions: [
          {
            type: "grant-resources",
            playerId: "p1",
            resources: { wood: 25 },
          },
        ],
      },
    ],
  };
  const state = createInitialWorldState(defaultMap, ["p1", "p2"], scenario);
  const beforeWood = state.playerResources.p1!.wood;

  advanceWorldTick(state);

  assert.equal(state.scenario.status, "victory");
  assert.equal(state.scenario.scriptedEvents["victory-supplies"]?.status, "executed");
  assert.equal(state.scenario.scriptedEvents["victory-supplies"]?.executedAtTick, 1);
  assert.equal(state.playerResources.p1!.wood, beforeWood + 25);
  assert.deepEqual(
    state.scenario.events.map((event) => event.type),
    ["objective-completed", "scenario-victory", "scripted-event"],
  );
});

test("scenario-status scripted event fires on the defeat tick", () => {
  const scenario: ScenarioDefinition = {
    ...defaultSkirmishScenario,
    id: "scripted-defeat-status-event",
    objectives: [],
    playerStarts: {
      p1: { startingUnits: [] },
      p2: {
        startingUnits: [
          { kind: "villager", idSuffix: "villager-1", offset: { x: 0, y: 0 } },
        ],
      },
    },
    scriptedEvents: [
      {
        id: "defeat-spoils",
        trigger: { type: "scenario-status", status: "defeat" },
        actions: [
          {
            type: "grant-resources",
            playerId: "p2",
            resources: { gold: 40 },
          },
        ],
      },
    ],
  };
  const state = createInitialWorldState(defaultMap, ["p1", "p2"], scenario);
  const beforeGold = state.playerResources.p2!.gold;

  advanceWorldTick(state);

  assert.equal(state.scenario.status, "defeat");
  assert.equal(state.scenario.scriptedEvents["defeat-spoils"]?.status, "executed");
  assert.equal(state.scenario.scriptedEvents["defeat-spoils"]?.executedAtTick, 1);
  assert.equal(state.playerResources.p2!.gold, beforeGold + 40);
  assert.deepEqual(
    state.scenario.events.map((event) => event.type),
    ["scenario-defeat", "scripted-event"],
  );
});

test("forced scenario defeat uses the normal scenario-status event path", () => {
  const scenario: ScenarioDefinition = {
    ...defaultSkirmishScenario,
    id: "forced-defeat-status-event",
    scriptedEvents: [
      {
        id: "surrender-spoils",
        trigger: { type: "scenario-status", status: "defeat" },
        actions: [
          {
            type: "grant-resources",
            playerId: "p2",
            resources: { gold: 40 },
          },
        ],
      },
    ],
  };
  const state = createInitialWorldState(defaultMap, ["p1", "p2"], scenario);
  const beforeGold = state.playerResources.p2!.gold;

  assert.equal(completeScenarioRuntime(state, "defeat"), true);
  assert.equal(state.scenario.status, "defeat");
  assert.equal(state.scenario.endedAtTick, 0);
  assert.equal(state.scenario.scriptedEvents["surrender-spoils"]?.status, "executed");
  assert.equal(state.scenario.scriptedEvents["surrender-spoils"]?.executedAtTick, 0);
  assert.equal(state.playerResources.p2!.gold, beforeGold + 40);
  assert.deepEqual(
    state.scenario.events.map((event) => event.type),
    ["scenario-defeat", "scripted-event"],
  );
  assert.equal(completeScenarioRuntime(state, "defeat"), false);
});

test("attack-move combat removes enemy units in range", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const attacker = state.units["p1-villager-1"]!;
  const target = state.units["p2-villager-1"]!;

  attacker.position = { x: 20, y: 20 };
  attacker.currentOrder = { type: "attack-move", target: { x: 21, y: 20 } };
  target.position = { x: 21, y: 20 };
  target.health.current = 3;

  advanceWorldTick(state);

  assert.equal(state.units[target.id], undefined);
  assert.deepEqual(state.combatEvents.at(-1), {
    id: `${state.tick}:${attacker.id}:${target.id}`,
    tick: state.tick,
    sourceUnitId: attacker.id,
    targetUnitId: target.id,
    sourcePlayerId: attacker.playerId,
    targetPlayerId: target.playerId,
    sourceKind: attacker.kind,
    targetKind: target.kind,
    sourcePosition: { x: 20, y: 20 },
    targetPosition: { x: 21, y: 20 },
    damage: 3,
    killed: true,
  });
});

test("attack-move chases enemies inside aggro range", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const attacker = state.units["p1-villager-1"]!;
  const target = state.units["p2-villager-1"]!;

  attacker.position = { x: 20, y: 20 };
  attacker.currentOrder = { type: "attack-move", target: { x: 40, y: 20 } };
  target.position = { x: 24, y: 20 };

  advanceWorldTick(state);

  assert.ok(attacker.movementTarget);

  for (let tick = 0; tick < 30; tick += 1) {
    advanceWorldTick(state);
  }

  assert.ok(attacker.position.x > 20);
  assert.ok(target.health.current < target.health.max);
});

test("attack-move does not chase enemies outside reduced night sight", () => {
  const map = createBlankMap({ width: 40, height: 40 });
  map.environment = {
    dayNight: {
      cycleTicks: 20,
      nightStartTick: 0,
      dayStartTick: 10,
      nightSightMultiplier: 0.5,
    },
  };
  const state = createInitialWorldState(map, ["p1", "p2"], {
    ...defaultSkirmishScenario,
    id: "night-attack-move-sight",
    objectives: [],
  });
  const attacker = createUnitState("p1-swordsman-test", "p1", "swordsman", { x: 10, y: 10 });
  const target = createUnitState("p2-villager-test", "p2", "villager", { x: 15, y: 10 });

  attacker.currentOrder = { type: "attack-move", target: { x: 30, y: 10 } };
  state.units = {
    [attacker.id]: attacker,
    [target.id]: target,
  };

  advanceWorldTick(state);

  assert.equal(state.environment.dayPhase, "night");
  assert.equal(attacker.currentOrder?.type, "attack-move");
  assert.equal(target.health.current, target.health.max);
});

test("idle combat units acquire and chase enemies inside aggro range", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const attacker = state.units["p1-swordsman-1"]!;
  const target = state.units["p2-villager-1"]!;

  attacker.position = { x: 20, y: 20 };
  target.position = { x: 25, y: 20 };

  advanceWorldTick(state);

  assert.equal(attacker.currentOrder?.type, "attack-unit");
  assert.equal(attacker.currentOrder?.targetUnitId, target.id);
  assert.ok(attacker.movementTarget);

  for (let tick = 0; tick < 40; tick += 1) {
    advanceWorldTick(state);
  }

  assert.ok(attacker.position.x > 20);
  assert.ok(target.health.current < target.health.max);
});

test("melee units damage large buildings from the footprint edge", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const attacker = state.units["p1-swordsman-1"]!;
  const target = state.units["p2-town-center"]!;

  attacker.position = { x: 100, y: 102 };
  target.position = { x: 100, y: 100 };

  const result = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "attack-unit",
      unitId: attacker.id,
      targetUnitId: target.id,
    },
  });

  assert.equal(result.ok, true);
  advanceWorldTick(state);

  assert.equal(attacker.movementTarget, undefined);
  assert.equal(target.health.current, target.health.max - unitDefinitions.swordsman.combat.damage);
  assert.equal(state.combatEvents.at(-1)?.targetUnitId, target.id);
});

test("melee attack-move can damage buildings from diagonal footprint edges", () => {
  const state = createInitialWorldState(createBlankMap({ width: 24, height: 24 }), ["p1", "p2"], {
    ...defaultSkirmishScenario,
    id: "diagonal-footprint-melee",
    objectives: [],
  });
  const attacker = createUnitState("p1-swordsman-test", "p1", "swordsman", { x: 16, y: 9 });
  const barracks = createUnitState("p2-barracks-test", "p2", "barracks", { x: 14, y: 7 });

  attacker.currentOrder = { type: "attack-move", target: { ...barracks.position } };
  state.units = {
    [attacker.id]: attacker,
    [barracks.id]: barracks,
  };

  advanceWorldTick(state);

  assert.equal(attacker.movementTarget, undefined);
  assert.equal(barracks.health.current, barracks.health.max - unitDefinitions.swordsman.combat.damage);
  assert.equal(state.combatEvents.at(-1)?.targetUnitId, barracks.id);
});

test("attack-move resumes its destination when no enemy is in aggro range", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const attacker = state.units["p1-villager-1"]!;

  for (const unit of Object.values(state.units)) {
    if (unit.playerId === "p2") {
      delete state.units[unit.id];
    }
  }

  attacker.position = { x: 20, y: 20 };
  attacker.currentOrder = { type: "attack-move", target: { x: 25, y: 20 } };

  advanceWorldTick(state);

  assert.ok(attacker.movementTarget);
  assert.equal(attacker.currentOrder.target.x, 25);
});

test("attack-move orders complete when the final waypoint is reached", () => {
  const state = createInitialWorldState(createBlankMap({ width: 30, height: 30 }), ["p1", "p2"], {
    ...defaultSkirmishScenario,
    id: "attack-move-order-complete",
    objectives: [],
  });
  const attacker = createUnitState("p1-swordsman-test", "p1", "swordsman", { x: 5, y: 5 });
  const distantEnemy = createUnitState("p2-villager-test", "p2", "villager", { x: 25, y: 25 });

  state.units = {
    [attacker.id]: attacker,
    [distantEnemy.id]: distantEnemy,
  };

  const result = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "attack-move",
      unitId: attacker.id,
      target: { x: 7, y: 5 },
    },
  });

  assert.equal(result.ok, true);
  advanceTicks(state, 12);

  assert.deepEqual(attacker.position, { x: 7, y: 5 });
  assert.equal(attacker.movementTarget, undefined);
  assert.equal(attacker.movementPath, undefined);
  assert.equal(attacker.currentOrder, undefined);
});

test("attack-move ignores unreachable enemies and continues toward its destination", () => {
  const map = createBlankMap({ width: 20, height: 12 });

  for (let y = 0; y < map.height; y += 1) {
    map.layers[0]!.tiles[getTileIndex(map.width, 8, y)] = {
      terrain: "water",
      elevation: 0,
    };
  }

  const state = createInitialWorldState(map, ["p1", "p2"]);
  const attacker = createUnitState("p1-attacker", "p1", "swordsman", { x: 4, y: 6 });
  const target = createUnitState("p2-target", "p2", "swordsman", { x: 10, y: 6 });

  state.units = {
    [attacker.id]: attacker,
    [target.id]: target,
  };
  attacker.currentOrder = { type: "attack-move", target: { x: 5, y: 6 } };

  advanceWorldTick(state);

  assert.deepEqual(attacker.currentOrder, { type: "attack-move", target: { x: 5, y: 6 } });
  assert.deepEqual(attacker.movementTarget, { x: 5, y: 6 });
  assert.equal(target.health.current, target.health.max);
});

test("attack-unit command chases the chosen target beyond aggro range", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const attacker = state.units["p1-swordsman-1"]!;
  const target = state.units["p2-villager-1"]!;

  attacker.position = { x: 10, y: 10 };
  target.position = { x: 35, y: 10 };
  target.health.max = 200;
  target.health.current = 200;

  const result = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "attack-unit",
      unitId: attacker.id,
      targetUnitId: target.id,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(attacker.currentOrder?.type, "attack-unit");

  for (let tick = 0; tick < 220; tick += 1) {
    if (tick === 20) {
      target.position = { x: 38, y: 10 };
    }

    advanceWorldTick(state);
  }

  assert.ok(attacker.position.x > 30);
  assert.equal(attacker.currentOrder?.type, "attack-unit");
  assert.ok(target.health.current < target.health.max);
});

test("attack-unit command rejects unreachable targets outside combat range", () => {
  const map = createBlankMap({ width: 20, height: 12 });
  const state = createInitialWorldState(map, ["p1", "p2"]);
  const attacker = createUnitState("p1-attacker", "p1", "swordsman", { x: 4, y: 6 });
  const target = createUnitState("p2-target", "p2", "swordsman", { x: 16, y: 6 });

  for (let y = 0; y < map.height; y += 1) {
    map.layers[0]!.tiles[getTileIndex(map.width, 10, y)] = {
      terrain: "water",
      elevation: 0,
    };
  }

  state.map = structuredClone(map);
  state.units = {
    [attacker.id]: attacker,
    [target.id]: target,
  };

  const result = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "attack-unit",
      unitId: attacker.id,
      targetUnitId: target.id,
    },
  });

  assert.deepEqual(result, { ok: false, reason: "no path to target" });
  assert.equal(attacker.currentOrder, undefined);
});

test("attack-unit order clears if the target becomes unreachable before contact", () => {
  const map = createBlankMap({ width: 20, height: 12 });
  const state = createInitialWorldState(map, ["p1", "p2"]);
  const attacker = createUnitState("p1-attacker", "p1", "swordsman", { x: 4, y: 6 });
  const target = createUnitState("p2-target", "p2", "swordsman", { x: 16, y: 6 });

  state.units = {
    [attacker.id]: attacker,
    [target.id]: target,
  };

  const result = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "attack-unit",
      unitId: attacker.id,
      targetUnitId: target.id,
    },
  });

  assert.equal(result.ok, true);

  for (let y = 0; y < state.map.height; y += 1) {
    state.map.layers[0]!.tiles[getTileIndex(state.map.width, 10, y)] = {
      terrain: "water",
      elevation: 0,
    };
  }

  advanceWorldTick(state);

  assert.equal(attacker.currentOrder, undefined);
  assert.equal(attacker.movementTarget, undefined);
  assert.equal(target.health.current, target.health.max);
});

test("attack-unit command clears after the chosen target dies", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const attacker = state.units["p1-swordsman-1"]!;
  const target = state.units["p2-villager-1"]!;

  attacker.position = { x: 70, y: 70 };
  target.position = { x: 71, y: 70 };
  target.health.current = 9;

  const result = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "attack-unit",
      unitId: attacker.id,
      targetUnitId: target.id,
    },
  });

  assert.equal(result.ok, true);
  advanceWorldTick(state);

  assert.equal(state.units[target.id], undefined);
  assert.equal(attacker.currentOrder, undefined);
});

test("unit removal clears other orders targeting the removed unit immediately", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const observer = createUnitState("p1-a-observer", "p1", "swordsman", { x: 69, y: 70 });
  const attacker = createUnitState("p1-swordsman-killer", "p1", "swordsman", { x: 70, y: 70 });
  const target = createUnitState("p2-villager-target", "p2", "villager", { x: 71, y: 70 });

  observer.currentOrder = { type: "attack-unit", targetUnitId: target.id };
  observer.attackCooldownTicks = 10;
  target.health.current = 9;
  state.units = {
    [observer.id]: observer,
    [attacker.id]: attacker,
    [target.id]: target,
  };

  advanceWorldTick(state);

  assert.equal(state.units[target.id], undefined);
  assert.equal(attacker.currentOrder, undefined);
  assert.equal(observer.currentOrder, undefined);
  assert.equal(observer.movementTarget, undefined);
});

test("patrol command attacks enemies and resumes the patrol route", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const attacker = state.units["p1-swordsman-1"]!;
  const target = state.units["p2-villager-1"]!;

  attacker.position = { x: 70, y: 70 };
  target.position = { x: 71, y: 70 };
  target.health.current = 9;

  const result = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "patrol",
      unitId: attacker.id,
      target: { x: 74, y: 70 },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(attacker.currentOrder?.type, "patrol");

  advanceWorldTick(state);

  assert.equal(state.units[target.id], undefined);
  assert.equal(attacker.currentOrder?.type, "patrol");

  for (let tick = 0; tick < 12; tick += 1) {
    advanceWorldTick(state);
  }

  assert.ok(attacker.position.x > 70.5);
  assert.equal(attacker.currentOrder?.type, "patrol");
});

test("patrol command loops between its origin and target", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const patrolUnit = state.units["p1-swordsman-1"]!;

  patrolUnit.position = { x: 70, y: 70 };

  const result = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "patrol",
      unitId: patrolUnit.id,
      target: { x: 72, y: 70 },
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(patrolUnit.currentOrder, {
    type: "patrol",
    origin: { x: 70, y: 70 },
    target: { x: 72, y: 70 },
    nextTarget: { x: 72, y: 70 },
  });

  for (let tick = 0; tick < 16; tick += 1) {
    advanceWorldTick(state);
  }

  assert.equal(patrolUnit.currentOrder?.type, "patrol");
  if (patrolUnit.currentOrder?.type === "patrol") {
    assert.deepEqual(patrolUnit.currentOrder.nextTarget, { x: 70, y: 70 });
  }
});

test("hold-position command clears movement and prevents aggro chase", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const attacker = state.units["p1-swordsman-1"]!;
  const target = state.units["p2-villager-1"]!;

  attacker.position = { x: 20, y: 20 };
  target.position = { x: 24, y: 20 };
  target.currentOrder = { type: "hold-position", anchor: { ...target.position } };

  const moveResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "attack-move",
      unitId: attacker.id,
      target: { x: 40, y: 20 },
    },
  });

  assert.equal(moveResult.ok, true);

  const holdResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "hold-position",
      unitId: attacker.id,
    },
  });

  assert.equal(holdResult.ok, true);
  assert.equal(attacker.currentOrder?.type, "hold-position");
  assert.equal(attacker.movementTarget, undefined);

  for (let tick = 0; tick < 40; tick += 1) {
    advanceWorldTick(state);
  }

  assert.deepEqual(attacker.position, { x: 20, y: 20 });
  assert.equal(target.health.current, target.health.max);
});

test("beacon automatically attacks enemies within defensive range", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const beacon = createUnitState("p1-beacon-test", "p1", "beacon", { x: 20, y: 20 });
  const target = createUnitState("p2-villager-test", "p2", "villager", { x: 25, y: 20 });

  state.units = {
    [beacon.id]: beacon,
    [target.id]: target,
  };

  advanceWorldTick(state);

  assert.equal(beacon.currentOrder, undefined);
  assert.equal(beacon.movementTarget, undefined);
  assert.equal(target.health.current, target.health.max - unitDefinitions.beacon.combat.damage);
  assert.deepEqual(state.combatEvents.at(-1), {
    id: `${state.tick}:${beacon.id}:${target.id}`,
    tick: state.tick,
    sourceUnitId: beacon.id,
    targetUnitId: target.id,
    sourcePlayerId: beacon.playerId,
    targetPlayerId: target.playerId,
    sourceKind: beacon.kind,
    targetKind: target.kind,
    sourcePosition: { x: 20, y: 20 },
    targetPosition: { x: 25, y: 20 },
    damage: unitDefinitions.beacon.combat.damage,
    killed: false,
  });
});

test("rain reduces beacon fire combat damage", () => {
  const map = createBlankMap({ width: 30, height: 30 });
  map.environment = {
    weather: "rain",
    rain: { fireDamageMultiplier: 0.5 },
  };
  const state = createInitialWorldState(map, ["p1", "p2"]);
  const beacon = createUnitState("p1-beacon-test", "p1", "beacon", { x: 20, y: 20 });
  const target = createUnitState("p2-villager-test", "p2", "villager", { x: 25, y: 20 });

  state.units = {
    [beacon.id]: beacon,
    [target.id]: target,
  };

  advanceWorldTick(state);

  assert.equal(target.health.current, target.health.max - unitDefinitions.beacon.combat.damage * 0.5);
  assert.equal(state.combatEvents.at(-1)?.damage, unitDefinitions.beacon.combat.damage * 0.5);
});

test("rain does not reduce physical combat damage", () => {
  const map = createBlankMap({ width: 30, height: 30 });
  map.environment = {
    weather: "rain",
    rain: { fireDamageMultiplier: 0.5 },
  };
  const state = createInitialWorldState(map, ["p1", "p2"]);
  const attacker = createUnitState("p1-swordsman-test", "p1", "swordsman", { x: 20, y: 20 });
  const target = createUnitState("p2-villager-test", "p2", "villager", { x: 21, y: 20 });

  state.units = {
    [attacker.id]: attacker,
    [target.id]: target,
  };

  advanceWorldTick(state);

  const attackerEvent = state.combatEvents.find((event) => event.sourceUnitId === attacker.id && event.targetUnitId === target.id);

  assert.equal(target.health.current, target.health.max - unitDefinitions.swordsman.combat.damage);
  assert.equal(attackerEvent?.damage, unitDefinitions.swordsman.combat.damage);
});

test("defensive buildings do not attack while under construction", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const beacon = createUnitState("p1-beacon-test", "p1", "beacon", { x: 20, y: 20 });
  const target = createUnitState("p2-villager-test", "p2", "villager", { x: 25, y: 20 });

  beacon.construction = {
    remainingTicks: getBuildTimeTicks("beacon"),
    totalTicks: getBuildTimeTicks("beacon"),
  };
  state.units = {
    [beacon.id]: beacon,
    [target.id]: target,
  };

  advanceWorldTick(state);

  assert.equal(target.health.current, target.health.max);
  assert.equal(state.combatEvents.length, 0);

  delete beacon.construction;
  advanceWorldTick(state);

  assert.equal(target.health.current, target.health.max - unitDefinitions.beacon.combat.damage);
  assert.equal(state.combatEvents.at(-1)?.sourceUnitId, beacon.id);
});

test("simulation source does not use nondeterministic APIs", () => {
  const bannedPatterns = [
    { label: "Math.random", pattern: /\bMath\.random\s*\(/ },
    { label: "Date.now", pattern: /\bDate\.now\s*\(/ },
    { label: "performance.now", pattern: /\bperformance\.now\s*\(/ },
    { label: "crypto.randomUUID", pattern: /\bcrypto\.randomUUID\s*\(/ },
    { label: "new Date", pattern: /\bnew\s+Date\s*\(/ },
  ];
  const violations: string[] = [];

  for (const filePath of collectSourceFiles(simulationSrcDirectory)) {
    const source = readFileSync(filePath, "utf8");

    for (const banned of bannedPatterns) {
      if (banned.pattern.test(source)) {
        violations.push(`${filePath}: banned ${banned.label}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("unit iteration is canonical by unit id", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const units = Object.values(state.units);

  state.units = {};
  for (const unit of units.reverse()) {
    state.units[unit.id] = unit;
  }

  assert.deepEqual(
    iterateUnitsOrdered(state).map((unit) => unit.id),
    Object.keys(state.units).sort(),
  );
});

test("new player visibility starts unexplored", () => {
  const visibility = createPlayerVisibility(defaultMap);

  assert.equal(visibility.width, defaultMap.width);
  assert.equal(visibility.height, defaultMap.height);
  assert.equal(visibility.tiles.length, defaultMap.width * defaultMap.height);
  assert.equal(visibility.tiles.every((tile) => tile === TileVisibility.Unexplored), true);
});

test("starting player sees own spawn area and unit tile after visibility update", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const visibility = updatePlayerVisibility(createPlayerVisibility(defaultMap), state, "p1");

  assert.equal(getTileVisibility(visibility, { x: 3, y: 3 }), TileVisibility.Visible);
  assert.equal(getTileVisibility(visibility, state.units["p1-villager-1"]!.position), TileVisibility.Visible);
});

test("initial visibility update marks dirty chunks", () => {
  const chunkSize = 16;
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const chunksPerRow = Math.ceil(defaultMap.width / chunkSize);
  const chunksPerColumn = Math.ceil(defaultMap.height / chunkSize);
  const dirtyChunks = new Uint8Array(chunksPerRow * chunksPerColumn);

  const update = updatePlayerVisibilityWithChanges(createPlayerVisibility(defaultMap), state, "p1", {
    dirtyChunks,
    chunkSize,
  });

  assert.ok(update.dirtyChunkCount > 0);
  assert.equal(dirtyChunks.some((chunk) => chunk === 1), true);
});

test("unchanged visibility update leaves dirty chunk mask clear", () => {
  const chunkSize = 16;
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const chunksPerRow = Math.ceil(defaultMap.width / chunkSize);
  const chunksPerColumn = Math.ceil(defaultMap.height / chunkSize);
  const dirtyChunks = new Uint8Array(chunksPerRow * chunksPerColumn);
  const firstUpdate = updatePlayerVisibilityWithChanges(createPlayerVisibility(defaultMap), state, "p1", {
    dirtyChunks,
    chunkSize,
  });

  const secondUpdate = updatePlayerVisibilityWithChanges(firstUpdate.visibility, state, "p1", {
    dirtyChunks,
    chunkSize,
  });

  assert.equal(secondUpdate.dirtyChunkCount, 0);
  assert.equal(dirtyChunks.every((chunk) => chunk === 0), true);
});

test("small unit movement dirties only nearby visibility chunks and preserves wrapper behavior", () => {
  const chunkSize = 16;
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const chunksPerRow = Math.ceil(defaultMap.width / chunkSize);
  const chunksPerColumn = Math.ceil(defaultMap.height / chunkSize);
  const dirtyChunks = new Uint8Array(chunksPerRow * chunksPerColumn);

  for (const unitId of Object.keys(state.units)) {
    if (unitId !== "p1-villager-1") {
      delete state.units[unitId];
    }
  }

  state.units["p1-villager-1"]!.position = { x: 30, y: 30 };
  const previous = updatePlayerVisibility(createPlayerVisibility(defaultMap), state, "p1");
  state.units["p1-villager-1"]!.position = { x: 31, y: 30 };

  const update = updatePlayerVisibilityWithChanges(previous, state, "p1", {
    dirtyChunks,
    chunkSize,
  });
  const wrapperVisibility = updatePlayerVisibility(previous, state, "p1");

  assert.ok(update.dirtyChunkCount > 0);
  assert.ok(update.dirtyChunkCount <= 6);
  assert.deepEqual(wrapperVisibility.tiles, update.visibility.tiles);
});

test("previously visible tile becomes explored after units move away", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const watchedTile = { x: 3, y: 3 };
  let visibility = updatePlayerVisibility(createPlayerVisibility(defaultMap), state, "p1");

  assert.equal(getTileVisibility(visibility, watchedTile), TileVisibility.Visible);

  for (const unit of Object.values(state.units)) {
    if (unit.playerId === "p1") {
      unit.position = { x: 100, y: 100 };
    }
  }

  visibility = updatePlayerVisibility(visibility, state, "p1");

  assert.equal(getTileVisibility(visibility, watchedTile), TileVisibility.Explored);
});

test("enemy unit tile is visible only within local player visibility", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const enemyPosition = state.units["p2-villager-1"]!.position;
  let visibility = updatePlayerVisibility(createPlayerVisibility(defaultMap), state, "p1");

  assert.equal(getTileVisibility(visibility, enemyPosition), TileVisibility.Unexplored);

  state.units["p1-villager-1"]!.position = { x: enemyPosition.x - 1, y: enemyPosition.y };
  visibility = updatePlayerVisibility(visibility, state, "p1");

  assert.equal(getTileVisibility(visibility, enemyPosition), TileVisibility.Visible);
});

test("tile group visibility requires every footprint tile to be visible", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const worker = state.units["p1-villager-1"]!;
  const visibility = updatePlayerVisibility(createPlayerVisibility(defaultMap), state, "p1");
  const visiblePoint = { x: Math.round(worker.position.x), y: Math.round(worker.position.y) };
  const hiddenPoint = { x: defaultMap.width - 1, y: defaultMap.height - 1 };

  assert.equal(areTilesVisible(visibility, [visiblePoint]), true);
  assert.equal(areTilesVisible(visibility, [visiblePoint, hiddenPoint]), false);
});

test("visibility uses the rounded tile for moving units", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);

  for (const unitId of Object.keys(state.units)) {
    if (unitId !== "p1-villager-1") {
      delete state.units[unitId];
    }
  }

  state.units["p1-villager-1"]!.position = { x: 30.4, y: 31.6 };
  const visibility = updatePlayerVisibility(createPlayerVisibility(defaultMap), state, "p1");

  assert.equal(getTileVisibility(visibility, { x: 30, y: 32 }), TileVisibility.Visible);
});

test("overlapping vision remains visible when one unit moves away", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const watchedTile = { x: 30, y: 30 };

  for (const unitId of Object.keys(state.units)) {
    if (!["p1-villager-1", "p1-villager-2"].includes(unitId)) {
      delete state.units[unitId];
    }
  }

  state.units["p1-villager-1"]!.position = watchedTile;
  state.units["p1-villager-2"]!.position = { x: watchedTile.x + 1, y: watchedTile.y };

  let visibility = updatePlayerVisibility(createPlayerVisibility(defaultMap), state, "p1");
  assert.equal(getTileVisibility(visibility, watchedTile), TileVisibility.Visible);

  state.units["p1-villager-1"]!.position = { x: 100, y: 100 };
  visibility = updatePlayerVisibility(visibility, state, "p1");

  assert.equal(getTileVisibility(visibility, watchedTile), TileVisibility.Visible);
});

test("same command sequence produces identical fixed-tick results", () => {
  const run = () => {
    const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
    const command: CommandEnvelope = {
      sessionId: "test-session",
      playerId: "p1",
      issuedAtTick: state.tick,
      command: {
        type: "move",
        unitId: "p1-villager-1",
        target: { x: 10, y: 10 },
      },
    };

    assert.equal(issueCommand(state, command).ok, true);

    for (let index = 0; index < 20; index += 1) {
      advanceWorldTick(state);
    }

    const unit = state.units["p1-villager-1"];

    assert.ok(unit);

    return {
      tick: state.tick,
      position: unit.position,
      movementTarget: unit.movementTarget,
      pathLength: unit.movementPath?.length ?? 0,
    };
  };

  assert.deepEqual(run(), run());
});

test("fixed tick advancement is independent of outer update cadence", () => {
  const runTicks = (cadenceMilliseconds: readonly number[]) => {
    const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
    let accumulatedMilliseconds = 0;
    const tickMilliseconds = SIM_TICK_SECONDS * 1000;

    assert.equal(issueCommand(state, {
      sessionId: "test-session",
      playerId: "p1",
      issuedAtTick: state.tick,
      command: {
        type: "move",
        unitId: "p1-villager-1",
        target: { x: 10, y: 10 },
      },
    }).ok, true);

    for (const elapsedMilliseconds of cadenceMilliseconds) {
      accumulatedMilliseconds += elapsedMilliseconds;

      while (accumulatedMilliseconds >= tickMilliseconds) {
        advanceWorldTick(state);
        accumulatedMilliseconds -= tickMilliseconds;
      }
    }

    return state.units["p1-villager-1"]?.position;
  };

  assert.deepEqual(runTicks([100, 100, 100, 100]), runTicks([16, 34, 50, 175, 125]));
});

function assertValidStartingPlacements(
  state: ReturnType<typeof createInitialWorldState>,
  label = state.scenario.id,
): void {
  const occupiedTiles = new Map<string, string>();

  for (const unit of iterateUnitsOrdered(state)) {
    const definition = unitDefinitions[unit.kind];

    if (definition.category === "building") {
      delete state.units[unit.id];
      const placement = validateBuildingPlacement(state, unit.kind as BuildingDefinitionId, unit.position);
      state.units[unit.id] = unit;

      assert.equal(placement.ok, true, `${label}: ${unit.id} starts on invalid building placement`);
    } else {
      for (const tile of getFootprintTiles(unit.position, definition.footprint)) {
        assert.equal(isTilePassableForUnit(state, unit, tile), true, `${label}: ${unit.id} starts on an impassable tile`);
      }
    }

    for (const tile of getFootprintTiles(unit.position, definition.footprint)) {
      const key = `${tile.x},${tile.y}`;
      const occupiedBy = occupiedTiles.get(key);

      assert.equal(occupiedBy, undefined, `${label}: ${unit.id} overlaps ${occupiedBy} at ${key}`);
      occupiedTiles.set(key, unit.id);
    }
  }
}

function advanceTicks(state: ReturnType<typeof createInitialWorldState>, ticks: number): void {
  for (let tick = 0; tick < ticks; tick += 1) {
    advanceWorldTick(state);
  }
}

function removeResourceById(state: ReturnType<typeof createInitialWorldState>, resourceId: string): void {
  for (const layer of state.map.layers) {
    for (const tile of layer.tiles) {
      if (tile.resource?.id === resourceId) {
        delete tile.resource;
        return;
      }
    }
  }
}

function findValidBuildTarget(
  state: ReturnType<typeof createInitialWorldState>,
  building: BuildingDefinitionId,
): GridPoint | null {
  for (let y = 0; y < state.map.height; y += 1) {
    for (let x = 0; x < state.map.width; x += 1) {
      const target = { x, y };

      if (validateBuildingPlacement(state, building, target).ok) {
        return target;
      }
    }
  }

  return null;
}

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectSourceFiles(filePath);
    }

    if (!entry.isFile() || !filePath.endsWith(".ts") || filePath.endsWith(".test.ts") || filePath.endsWith(".spec.ts")) {
      return [];
    }

    return [filePath];
  });
}
