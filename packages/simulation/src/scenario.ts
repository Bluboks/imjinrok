import {
  unitDefinitions,
  type BuildingDefinitionId,
  type GridPoint,
  type ResourceAmountSet,
  type ScenarioDefinition,
  type ScenarioScriptedEventActionDefinition,
  type ScenarioUnitOrderDefinition,
} from "../../shared/src/index.js";
import { isUnitUnderConstruction } from "./construction.js";
import { arePlayersAllied, arePlayersEnemies } from "./diplomacy.js";
import { createUnitState } from "./entities.js";
import { applyNavigationRoute, findNavigationRouteForUnit } from "./navigation.js";
import { getFootprintTiles, validateBuildingPlacement } from "./placement.js";
import { applyCompletedResearchToUnit } from "./research.js";
import { resolveK01SourceObjectiveCompletion } from "./k01ScenarioPolicy.js";
import { isTilePassableForUnit } from "./terrain.js";
import type {
  ObjectiveRuntimeState,
  ScenarioRuntimeEvent,
  ScenarioRuntimeState,
  ScriptedEventRuntimeState,
  UnitState,
  WorldState,
} from "./types.js";
import { iterateUnitsOrdered } from "./units.js";

export function createScenarioRuntimeState(scenario: ScenarioDefinition): ScenarioRuntimeState {
  const objectives: Record<string, ObjectiveRuntimeState> = {};
  const scriptedEvents: Record<string, ScriptedEventRuntimeState> = {};

  for (const objective of scenario.objectives) {
    const runtimeObjective: ObjectiveRuntimeState = {
      id: objective.id,
      label: objective.label,
      description: objective.description,
      type: objective.type,
      required: objective.required,
      status: "pending",
    };

    if (objective.defeatOnFailure !== undefined) {
      runtimeObjective.defeatOnFailure = objective.defeatOnFailure;
    }

    if (objective.defeatDelayTicks !== undefined) {
      runtimeObjective.defeatDelayTicks = objective.defeatDelayTicks;
    }

    if (objective.visibleAfterObjectiveId !== undefined) {
      runtimeObjective.visibleAfterObjectiveId = objective.visibleAfterObjectiveId;
    }

    if (objective.completionRequiresObjectiveIds !== undefined) {
      runtimeObjective.completionRequiresObjectiveIds = [...objective.completionRequiresObjectiveIds];
    }

    if (objective.playerId !== undefined) {
      runtimeObjective.playerId = objective.playerId;
    }

    if (objective.targetKind !== undefined) {
      runtimeObjective.targetKind = objective.targetKind;
    }

    if (objective.count !== undefined) {
      runtimeObjective.count = objective.count;
    }

    if (objective.area !== undefined) {
      runtimeObjective.area = { ...objective.area };
    }

    if (objective.routeWaypoints !== undefined) {
      runtimeObjective.routeWaypoints = objective.routeWaypoints.map((point) => ({ ...point }));
    }

    if (objective.routeWaypointLabels !== undefined) {
      runtimeObjective.routeWaypointLabels = [...objective.routeWaypointLabels];
    }

    if (objective.durationTicks !== undefined) {
      runtimeObjective.durationTicks = objective.durationTicks;
    }

    if (objective.resources !== undefined) {
      runtimeObjective.resources = cloneResourceRequirements(objective.resources);
    }

    objectives[objective.id] = runtimeObjective;
  }

  for (const event of scenario.scriptedEvents ?? []) {
    const runtimeEvent: ScriptedEventRuntimeState = {
      id: event.id,
      trigger: { ...event.trigger },
      actions: event.actions.map(cloneScriptedEventAction),
      status: "pending",
    };

    if (event.sourceScript !== undefined) {
      runtimeEvent.sourceScript = event.sourceScript;
    }

    scriptedEvents[event.id] = runtimeEvent;
  }

  return {
    id: scenario.id,
    completionMode: scenario.completionMode ?? "objectives",
    status: "running",
    objectives,
    scriptedEvents,
    events: [],
  };
}

interface ApplyScenarioScriptedEventsOptions {
  allowEndedStatusTriggers?: boolean;
  tickTriggersOnly?: boolean;
}

export function applyScenarioScriptedEvents(state: WorldState, options: ApplyScenarioScriptedEventsOptions = {}): void {
  if (state.scenario.status !== "running" && !options.allowEndedStatusTriggers) {
    return;
  }

  const scriptedEvents = Object.values(state.scenario.scriptedEvents).sort((a, b) => a.id.localeCompare(b.id));

  for (const scriptedEvent of scriptedEvents) {
    if (state.scenario.status !== "running" && scriptedEvent.trigger.type !== "scenario-status") {
      continue;
    }

    if (options.tickTriggersOnly && scriptedEvent.trigger.type !== "tick") {
      continue;
    }

    // K01's source-profile policy is the sole authority for K0120 native
    // reinforcement. Keep the legacy scenario event observable as consumed,
    // but do not execute its generic spawn/objective actions on that profile.
    if (
      state.sourceRuntimeProfile?.profileId === "k01:source-runtime" &&
      scriptedEvent.id === "k01-reinforcement-wave"
    ) {
      if (scriptedEvent.status === "pending" && isScenarioTriggerMet(state, scriptedEvent.trigger)) {
        scriptedEvent.status = "executed";
        scriptedEvent.executedAtTick = state.tick;
        state.scenario.events.push(createScenarioEvent(state, "scripted-event", undefined, scriptedEvent.id));
      }
      continue;
    }

    if (scriptedEvent.status !== "pending" || !isScenarioTriggerMet(state, scriptedEvent.trigger)) {
      continue;
    }

    scriptedEvent.status = "executed";
    scriptedEvent.executedAtTick = state.tick;
    state.scenario.events.push(createScenarioEvent(state, "scripted-event", undefined, scriptedEvent.id));

    for (const action of scriptedEvent.actions) {
      applyScriptedEventAction(state, action);
    }
  }
}

function cloneScriptedEventAction(action: ScenarioScriptedEventActionDefinition): ScenarioScriptedEventActionDefinition {
  switch (action.type) {
    case "spawn-units":
      return {
        type: "spawn-units",
        playerId: action.playerId,
        origin: { ...action.origin },
        units: action.units.map((unit) => ({
          kind: unit.kind,
          idSuffix: unit.idSuffix,
          offset: { ...unit.offset },
        })),
        ...(action.placementPolicy
          ? { placementPolicy: action.placementPolicy }
          : {}),
        ...(action.order
          ? { order: cloneScenarioUnitOrder(action.order) }
          : {}),
      };
    case "spawn-scanned-units":
      return {
        type: "spawn-scanned-units",
        playerId: action.playerId,
        scan: {
          origin: { ...action.scan.origin },
          width: action.scan.width,
          height: action.scan.height,
          ...(action.scan.xStep !== undefined ? { xStep: action.scan.xStep } : {}),
          ...(action.scan.yStep !== undefined ? { yStep: action.scan.yStep } : {}),
        },
        maxCount: action.maxCount,
        firstUnit: { ...action.firstUnit },
        repeatedUnit: { ...action.repeatedUnit },
        ...(action.order
          ? { order: cloneScenarioUnitOrder(action.order) }
          : {}),
      };
    case "set-weather":
      return {
        type: "set-weather",
        weather: action.weather,
        ...(action.durationTicks !== undefined ? { durationTicks: action.durationTicks } : {}),
      };
    case "grant-resources":
      return {
        type: "grant-resources",
        playerId: action.playerId,
        resources: cloneResourceRequirements(action.resources),
      };
    case "complete-objective":
      return {
        type: "complete-objective",
        objectiveId: action.objectiveId,
      };
    case "complete-scenario":
      return {
        type: "complete-scenario",
        status: action.status,
      };
  }
}

function cloneScenarioUnitOrder(order: ScenarioUnitOrderDefinition): ScenarioUnitOrderDefinition {
  return {
    type: order.type,
    target: { ...order.target },
    ...(order.allowPartialPath ? { allowPartialPath: true } : {}),
    ...(order.repeatMoveWhileInsideArea ? { repeatMoveWhileInsideArea: true } : {}),
    ...(order.followUpWhenOutsideArea ? { followUpWhenOutsideArea: { ...order.followUpWhenOutsideArea } } : {}),
    ...(order.followUpCheckIntervalTicks !== undefined ? { followUpCheckIntervalTicks: order.followUpCheckIntervalTicks } : {}),
    ...(order.followUpAttackTarget
      ? {
          followUpAttackTarget: {
            ...(order.followUpAttackTarget.playerId ? { playerId: order.followUpAttackTarget.playerId } : {}),
            targetKind: order.followUpAttackTarget.targetKind,
          },
        }
      : {}),
  };
}

function cloneResourceRequirements(resources: Partial<ResourceAmountSet>): Partial<ResourceAmountSet> {
  return { ...resources };
}

function isScenarioTriggerMet(state: WorldState, trigger: ScriptedEventRuntimeState["trigger"]): boolean {
  switch (trigger.type) {
    case "tick":
      return state.tick >= trigger.tick;
    case "objective-status":
      return state.scenario.objectives[trigger.objectiveId]?.status === trigger.status;
    case "scenario-status":
      return state.scenario.status === trigger.status;
    case "unit-in-area":
      return countMatchingUnitsForTrigger(state, trigger) >= Math.max(1, trigger.count ?? 1);
  }
}

function applyScriptedEventAction(state: WorldState, action: ScenarioScriptedEventActionDefinition): void {
  switch (action.type) {
    case "spawn-units":
      applySpawnUnitsAction(state, action);
      return;
    case "spawn-scanned-units":
      applySpawnScannedUnitsAction(state, action);
      return;
    case "set-weather":
      applySetWeatherAction(state, action);
      return;
    case "grant-resources":
      applyGrantResourcesAction(state, action);
      return;
    case "complete-objective":
      applyCompleteObjectiveAction(state, action);
      return;
    case "complete-scenario":
      applyCompleteScenarioAction(state, action);
      return;
  }
}

function applyCompleteObjectiveAction(
  state: WorldState,
  action: Extract<ScenarioScriptedEventActionDefinition, { type: "complete-objective" }>,
): void {
  const objective = state.scenario.objectives[action.objectiveId];

  if (!objective || objective.status !== "pending" || !areObjectiveCompletionRequirementsMet(state, objective)) {
    return;
  }

  completeObjective(state, objective);
}

function applyCompleteScenarioAction(
  state: WorldState,
  action: Extract<ScenarioScriptedEventActionDefinition, { type: "complete-scenario" }>,
): void {
  if (state.scenario.status !== "running") {
    return;
  }

  completeScenario(state, action.status);
}

function applySetWeatherAction(
  state: WorldState,
  action: Extract<ScenarioScriptedEventActionDefinition, { type: "set-weather" }>,
): void {
  const hasPersistentMatchingOverride =
    state.environment.weatherOverride === action.weather &&
    state.environment.weatherOverrideUntilTick === undefined;

  state.environment.weatherOverride = action.weather;
  state.environment.weather = action.weather;

  if (action.durationTicks === undefined) {
    delete state.environment.weatherOverrideUntilTick;
    return;
  }

  if (hasPersistentMatchingOverride) {
    return;
  }

  const durationTicks = Math.max(0, Math.floor(action.durationTicks));
  state.environment.weatherOverrideUntilTick = state.tick + durationTicks;
}

function applyGrantResourcesAction(
  state: WorldState,
  action: Extract<ScenarioScriptedEventActionDefinition, { type: "grant-resources" }>,
): void {
  const bank = state.playerResources[action.playerId];

  if (!bank) {
    return;
  }

  for (const [resourceKind, amount] of Object.entries(action.resources)) {
    if (amount === undefined) {
      continue;
    }

    bank[resourceKind as keyof ResourceAmountSet] = Math.max(0, bank[resourceKind as keyof ResourceAmountSet] + amount);
  }
}

function applySpawnUnitsAction(
  state: WorldState,
  action: Extract<ScenarioScriptedEventActionDefinition, { type: "spawn-units" }>,
): void {
  if (!state.players[action.playerId]) {
    return;
  }

  for (const unitDefinition of action.units) {
    const requestedPosition = {
      x: action.origin.x + unitDefinition.offset.x,
      y: action.origin.y + unitDefinition.offset.y,
    };
    const unitId = createScriptedUnitId(state, action.playerId, unitDefinition.idSuffix);
    const position = resolveScriptedSpawnPosition(
      state,
      action,
      unitId,
      unitDefinition.kind,
      requestedPosition,
    );
    if (!position) {
      continue;
    }
    const unit = createUnitState(unitId, action.playerId, unitDefinition.kind, position);

    applyCompletedResearchToUnit(state, unit);
    state.units[unitId] = unit;
    if (action.order) {
      applyScriptedUnitOrder(state, unit, action.order);
    }
  }
}

function resolveScriptedSpawnPosition(
  state: WorldState,
  action: Extract<ScenarioScriptedEventActionDefinition, { type: "spawn-units" }>,
  unitId: string,
  kind: UnitState["kind"],
  requestedPosition: GridPoint,
): GridPoint | null {
  if (action.placementPolicy === "requested-position-exact") {
    return isPointInsideMap(state, requestedPosition) ? requestedPosition : null;
  }

  const clampedPosition = clampMapPoint(state, requestedPosition);
  const probe = createUnitState(unitId, action.playerId, kind, clampedPosition);
  return findOpenSpawnPoint(state, probe, clampedPosition);
}

function applyScriptedUnitOrder(
  state: WorldState,
  unit: UnitState,
  order: ScenarioUnitOrderDefinition | undefined,
): void {
  if (!order || unit.movementSpeed <= 0) {
    return;
  }

  const target = clampMapPoint(state, order.target);
  const route = findNavigationRouteForUnit(state, unit, target, { allowPartial: order.allowPartialPath === true });

  if (!route) {
    return;
  }

  applyNavigationRoute(unit, route);
  unit.currentOrder = {
    type: order.type,
    target,
    ...(order.type === "move" && order.followUpAttackTarget
      ? {
          followUpAttackTarget: {
            ...(order.followUpAttackTarget.playerId ? { playerId: order.followUpAttackTarget.playerId } : {}),
            targetKind: order.followUpAttackTarget.targetKind,
          },
          ...(order.followUpWhenOutsideArea ? { followUpWhenOutsideArea: { ...order.followUpWhenOutsideArea } } : {}),
          ...(order.followUpCheckIntervalTicks !== undefined ? { followUpCheckIntervalTicks: order.followUpCheckIntervalTicks } : {}),
        }
      : {}),
  };
  if (
    order.type === "move" &&
    order.repeatMoveWhileInsideArea &&
    order.followUpAttackTarget &&
    order.followUpWhenOutsideArea
  ) {
    unit.scriptedBehavior = {
      type: "conditional-attack-target",
      moveTarget: target,
      ...(order.allowPartialPath ? { allowPartialPath: true } : {}),
      whileInsideArea: { ...order.followUpWhenOutsideArea },
      attackTarget: {
        ...(order.followUpAttackTarget.playerId ? { playerId: order.followUpAttackTarget.playerId } : {}),
        targetKind: order.followUpAttackTarget.targetKind,
      },
      ...(order.followUpCheckIntervalTicks !== undefined ? { checkIntervalTicks: order.followUpCheckIntervalTicks } : {}),
    };
  }
}

function applySpawnScannedUnitsAction(
  state: WorldState,
  action: Extract<ScenarioScriptedEventActionDefinition, { type: "spawn-scanned-units" }>,
): void {
  if (!state.players[action.playerId] || action.maxCount <= 0) {
    return;
  }

  const xStep = normalizeScanStep(action.scan.xStep);
  const yStep = normalizeScanStep(action.scan.yStep);
  let spawnedCount = 0;
  let repeatedIndex = action.repeatedUnit.firstIndex ?? 1;

  for (let yOffset = 0; yOffset < action.scan.height; yOffset += yStep) {
    for (let xOffset = 0; xOffset < action.scan.width; xOffset += xStep) {
      if (spawnedCount >= action.maxCount) {
        return;
      }

      const position = {
        x: action.scan.origin.x + xOffset,
        y: action.scan.origin.y + yOffset,
      };

      if (!isPointInsideMap(state, position)) {
        continue;
      }

      const unitDefinition =
        spawnedCount === 0
          ? action.firstUnit
          : {
              kind: action.repeatedUnit.kind,
              idSuffix: `${action.repeatedUnit.idSuffixPrefix}-${repeatedIndex}`,
            };
      const unitId = createScriptedUnitId(state, action.playerId, unitDefinition.idSuffix);
      const probe = createUnitState(unitId, action.playerId, unitDefinition.kind, position);

      if (!isSpawnPointValid(state, probe, position, getOccupiedTiles(state))) {
        continue;
      }

      const unit = createUnitState(unitId, action.playerId, unitDefinition.kind, position);

      applyCompletedResearchToUnit(state, unit);
      state.units[unitId] = unit;
      applyScriptedUnitOrder(state, unit, action.order);
      spawnedCount += 1;

      if (spawnedCount > 1) {
        repeatedIndex += 1;
      }
    }
  }
}

function normalizeScanStep(step: number | undefined): number {
  return Number.isInteger(step) && step !== undefined && step > 0 ? step : 1;
}

function findOpenSpawnPoint(state: WorldState, unit: UnitState, requestedPosition: GridPoint): GridPoint | null {
  const occupied = getOccupiedTiles(state);

  for (let distance = 0; distance <= 4; distance += 1) {
    for (let y = requestedPosition.y - distance; y <= requestedPosition.y + distance; y += 1) {
      for (let x = requestedPosition.x - distance; x <= requestedPosition.x + distance; x += 1) {
        if (Math.max(Math.abs(x - requestedPosition.x), Math.abs(y - requestedPosition.y)) !== distance) {
          continue;
        }

        const candidate = clampMapPoint(state, { x, y });

        if (isSpawnPointValid(state, unit, candidate, occupied)) {
          return candidate;
        }
      }
    }
  }

  return null;
}

function isSpawnPointValid(
  state: WorldState,
  unit: UnitState,
  point: GridPoint,
  occupied: ReadonlySet<string>,
): boolean {
  const definition = unitDefinitions[unit.kind];

  if (definition.category === "building") {
    return validateBuildingPlacement(state, unit.kind as BuildingDefinitionId, point).ok;
  }

  return getFootprintTiles(point, definition.footprint).every((tile) =>
    isTilePassableForUnit(state, unit, tile) && !occupied.has(toTileKey(tile)),
  );
}

function getOccupiedTiles(state: WorldState): Set<string> {
  const occupied = new Set<string>();

  for (const unit of iterateUnitsOrdered(state)) {
    const footprint = unitDefinitions[unit.kind].footprint;

    if (!footprint.blocksMovement) {
      continue;
    }

    for (const tile of getFootprintTiles(unit.position, footprint)) {
      occupied.add(toTileKey(tile));
    }
  }

  return occupied;
}

function createScriptedUnitId(state: WorldState, playerId: string, idSuffix: string): string {
  const baseId = `${playerId}-${idSuffix}`;
  let unitId = baseId;
  let duplicateIndex = 2;

  while (state.units[unitId]) {
    unitId = `${baseId}-${duplicateIndex}`;
    duplicateIndex += 1;
  }

  return unitId;
}

function clampMapPoint(state: WorldState, point: GridPoint): GridPoint {
  return {
    x: Math.max(0, Math.min(state.map.width - 1, Math.round(point.x))),
    y: Math.max(0, Math.min(state.map.height - 1, Math.round(point.y))),
  };
}

function isPointInsideMap(state: WorldState, point: GridPoint): boolean {
  return point.x >= 0 && point.x < state.map.width && point.y >= 0 && point.y < state.map.height;
}

function toTileKey(point: GridPoint): string {
  return `${point.x},${point.y}`;
}

export function evaluateScenarioRuntime(state: WorldState): void {
  if (state.scenario.status !== "running") {
    return;
  }

  if (isPrimaryPlayerDefeated(state)) {
    completeScenario(state, "defeat");
    return;
  }

  for (const objective of Object.values(state.scenario.objectives)) {
    if (objective.status === "failed") {
      if ((objective.required || objective.defeatOnFailure) && isObjectiveFailureDefeatReady(state, objective)) {
        completeScenario(state, "defeat");
        return;
      }

      continue;
    }

    if (objective.status !== "pending") {
      continue;
    }

    if (isObjectiveFailed(state, objective)) {
      failObjective(state, objective);

      if (objective.required || objective.defeatOnFailure) {
        if (isObjectiveFailureDefeatReady(state, objective)) {
          completeScenario(state, "defeat");
          return;
        }
      }

      continue;
    }

    if (isObjectiveComplete(state, objective)) {
      completeObjective(state, objective);
    }
  }

  const requiredObjectives = Object.values(state.scenario.objectives).filter((objective) => objective.required);

  if (
    state.scenario.completionMode === "objectives" &&
    requiredObjectives.length > 0 &&
    requiredObjectives.every((objective) => objective.status === "completed" || isObjectiveSatisfiedAtVictory(state, objective))
  ) {
    completePendingVictoryObjectives(state);
    completeScenario(state, "victory");
  }
}

export function completeScenarioRuntime(state: WorldState, status: "victory" | "defeat"): boolean {
  if (state.scenario.status !== "running") {
    return false;
  }

  completeScenario(state, status);
  return true;
}

function isObjectiveComplete(state: WorldState, objective: ObjectiveRuntimeState): boolean {
  if (!areObjectiveCompletionRequirementsMet(state, objective)) {
    return false;
  }

  const sourceCompletion = resolveK01SourceObjectiveCompletion(state, objective.id);
  if (sourceCompletion !== undefined) {
    return sourceCompletion;
  }

  switch (objective.type) {
    case "survive":
      return isSurvivalDurationMet(state, objective);
    case "defeat-opponents":
      return areOpponentsDefeated(state);
    case "collect-resources":
      return hasRequiredResources(state, objective);
    case "build-building":
      return countMatchingUnits(state, objective) >= getRequiredCount(objective);
    case "move-unit-to-area":
      return countMatchingUnitsInArea(state, objective) >= getRequiredCount(objective);
    case "protect-units":
    case "custom":
      return false;
  }
}

function isObjectiveFailed(state: WorldState, objective: ObjectiveRuntimeState): boolean {
  switch (objective.type) {
    case "move-unit-to-area":
    case "protect-units":
      return countMatchingUnits(state, objective) < getRequiredCount(objective);
    case "survive":
    case "defeat-opponents":
    case "collect-resources":
    case "build-building":
    case "custom":
      return false;
  }
}

function isObjectiveFailureDefeatReady(state: WorldState, objective: ObjectiveRuntimeState): boolean {
  const delayTicks = Math.max(0, Math.floor(objective.defeatDelayTicks ?? 0));

  if (delayTicks <= 0) {
    return true;
  }

  if (objective.failedAtTick === undefined) {
    return false;
  }

  return state.tick - objective.failedAtTick > delayTicks;
}

function isObjectiveSatisfiedAtVictory(state: WorldState, objective: ObjectiveRuntimeState): boolean {
  if (!areObjectiveCompletionRequirementsMet(state, objective)) {
    return false;
  }

  switch (objective.type) {
    case "protect-units":
      return countMatchingUnits(state, objective) >= getRequiredCount(objective);
    case "survive":
    case "defeat-opponents":
    case "collect-resources":
    case "build-building":
    case "move-unit-to-area":
    case "custom":
      return false;
  }
}

function areObjectiveCompletionRequirementsMet(state: WorldState, objective: ObjectiveRuntimeState): boolean {
  return (objective.completionRequiresObjectiveIds ?? []).every(
    (requiredObjectiveId) => state.scenario.objectives[requiredObjectiveId]?.status === "completed",
  );
}

function completePendingVictoryObjectives(state: WorldState): void {
  for (const objective of Object.values(state.scenario.objectives)) {
    if (objective.status === "pending" && isObjectiveSatisfiedAtVictory(state, objective)) {
      completeObjective(state, objective);
    }
  }
}

function areOpponentsDefeated(state: WorldState): boolean {
  const playerIds = Object.keys(state.players);
  const primaryPlayerId = playerIds[0];

  if (!primaryPlayerId || playerIds.length <= 1) {
    return false;
  }

  const units = iterateUnitsOrdered(state);
  const primaryTeamHasUnits = units.some((unit) => arePlayersAllied(state, primaryPlayerId, unit.playerId));
  const enemyPlayers = playerIds.filter((playerId) => arePlayersEnemies(state, primaryPlayerId, playerId));

  return primaryTeamHasUnits && enemyPlayers.length > 0 && enemyPlayers.every((playerId) => !units.some((unit) => unit.playerId === playerId));
}

function isSurvivalDurationMet(state: WorldState, objective: ObjectiveRuntimeState): boolean {
  return objective.durationTicks !== undefined && state.tick >= Math.max(1, objective.durationTicks);
}

function hasRequiredResources(state: WorldState, objective: ObjectiveRuntimeState): boolean {
  const playerId = objective.playerId ?? getPrimaryPlayerId(state);

  if (!playerId || !objective.resources) {
    return false;
  }

  const bank = state.playerResources[playerId];
  if (!bank) {
    return false;
  }

  return Object.entries(objective.resources).every(([resourceKind, requiredAmount]) => {
    if (requiredAmount === undefined) {
      return true;
    }

    const currentAmount = bank[resourceKind as keyof ResourceAmountSet] ?? 0;
    return currentAmount >= Math.max(0, requiredAmount);
  });
}

function countMatchingUnits(state: WorldState, objective: ObjectiveRuntimeState): number {
  const playerId = objective.playerId ?? getPrimaryPlayerId(state);

  if (!playerId || !objective.targetKind) {
    return 0;
  }

  return iterateUnitsOrdered(state).filter((unit) =>
    unit.playerId === playerId &&
    unit.kind === objective.targetKind &&
    !isUnitUnderConstruction(unit),
  ).length;
}

function countMatchingUnitsInArea(state: WorldState, objective: ObjectiveRuntimeState): number {
  const area = objective.area;
  const playerId = objective.playerId ?? getPrimaryPlayerId(state);

  if (!area || !playerId || !objective.targetKind) {
    return 0;
  }

  return iterateUnitsOrdered(state).filter((unit) =>
    unit.playerId === playerId &&
    unit.kind === objective.targetKind &&
    !isUnitUnderConstruction(unit) &&
    isPointInArea(unit.position, area),
  ).length;
}

function countMatchingUnitsForTrigger(
  state: WorldState,
  trigger: Extract<ScriptedEventRuntimeState["trigger"], { type: "unit-in-area" }>,
): number {
  const playerId = trigger.playerId ?? getPrimaryPlayerId(state);

  if (!playerId) {
    return 0;
  }

  return iterateUnitsOrdered(state).filter((unit) =>
    unit.playerId === playerId &&
    unit.kind === trigger.targetKind &&
    !isUnitUnderConstruction(unit) &&
    isPointInArea(unit.position, trigger.area),
  ).length;
}

function isPointInArea(point: GridPoint, area: { x: number; y: number; width: number; height: number }): boolean {
  return point.x >= area.x && point.x < area.x + area.width && point.y >= area.y && point.y < area.y + area.height;
}

function getRequiredCount(objective: ObjectiveRuntimeState): number {
  return Math.max(1, objective.count ?? 1);
}

function getPrimaryPlayerId(state: WorldState): string | undefined {
  return Object.keys(state.players)[0];
}

function isPrimaryPlayerDefeated(state: WorldState): boolean {
  const playerIds = Object.keys(state.players);
  const primaryPlayerId = playerIds[0];

  if (!primaryPlayerId) {
    return false;
  }

  const units = iterateUnitsOrdered(state);
  const primaryTeamHasUnits = units.some((unit) => arePlayersAllied(state, primaryPlayerId, unit.playerId));

  return !primaryTeamHasUnits;
}

function failObjective(state: WorldState, objective: ObjectiveRuntimeState): void {
  objective.status = "failed";
  objective.failedAtTick = state.tick;
  state.scenario.events.push(createScenarioEvent(state, "objective-failed", objective.id));
}

function completeObjective(state: WorldState, objective: ObjectiveRuntimeState): void {
  objective.status = "completed";
  objective.completedAtTick = state.tick;
  state.scenario.events.push(createScenarioEvent(state, "objective-completed", objective.id));
}

function completeScenario(state: WorldState, status: "victory" | "defeat"): void {
  state.scenario.status = status;
  state.scenario.endedAtTick = state.tick;
  state.scenario.events.push(createScenarioEvent(state, status === "victory" ? "scenario-victory" : "scenario-defeat"));
  applyScenarioScriptedEvents(state, { allowEndedStatusTriggers: true });
}

function createScenarioEvent(
  state: WorldState,
  type: ScenarioRuntimeEvent["type"],
  objectiveId?: string,
  scriptedEventId?: string,
): ScenarioRuntimeEvent {
  const event: ScenarioRuntimeEvent = {
    id: `${state.scenario.id}-${state.tick}-${state.scenario.events.length}`,
    type,
    tick: state.tick,
  };

  if (objectiveId) {
    event.objectiveId = objectiveId;
  }

  if (scriptedEventId) {
    event.scriptedEventId = scriptedEventId;
  }

  return event;
}
