import {
  buildingDefinitionIds,
  getTileAt,
  researchDefinitions,
  terrainDefinitions,
  unitCanPerformAction,
  type ActionDefinitionId,
  type BankResourceKind,
  type BuildingDefinitionId,
  type CheatCodeId,
  type CommandEnvelope,
  type GridPoint,
  type MapDefinition,
  type ResourceAmountSet,
  type UnitDefinitionId,
  type UnitDefinition,
  unitDefinitions,
} from "../../shared/src/index.js";
import { getBuildTimeTicks, isUnitUnderConstruction, updateConstructionHealth } from "./construction.js";
import { createUnitState } from "./entities.js";
import { arePlayersAllied } from "./diplomacy.js";
import { findPathForUnit } from "./navigation.js";
import { getFootprintTiles, validateBuildingPlacement } from "./placement.js";
import { canQueuePopulation } from "./population.js";
import { isResearchCompleted, isResearchPending } from "./research.js";
import { findHarvestableResourceTile, findResourceNode, getResourceDefinition } from "./resources.js";
import type { UnitState, WorldState } from "./types.js";
import { iterateUnitsOrdered, removeUnitFromWorld } from "./units.js";

const TRAINING_RULES: Partial<Record<UnitDefinitionId, { actionId: ActionDefinitionId; buildings: readonly UnitDefinitionId[] }>> = {
  villager: { actionId: "train-villager", buildings: ["town-center"] },
  swordsman: { actionId: "train-swordsman", buildings: ["barracks"] },
  archer: { actionId: "train-archer", buildings: ["barracks"] },
};
const MAX_PRODUCTION_QUEUE_SIZE = 5;
const MAX_RESEARCH_QUEUE_SIZE = 1;
const CHEAT_RESOURCE_GRANT_AMOUNT = 10_000;
export const TOWN_BELL_RADIUS = 18;

const SIMULATION_CHEAT_CODES = new Set<CheatCodeId>([
  "grant-resources",
  "fast-production",
  "force-rain",
  "invincible",
]);

export type CommandValidationResult = { ok: true } | { ok: false; reason: string };

export type IssueCommandResult =
  | { ok: true; envelope: CommandEnvelope }
  | { ok: false; reason: string };

export function validateCommand(state: WorldState, envelope: CommandEnvelope): CommandValidationResult {
  if (state.scenario.status !== "running") {
    return { ok: false, reason: "scenario has ended" };
  }

  switch (envelope.command.type) {
    case "move":
    case "attack-move": {
      const actor = validateUnitActor(state, envelope.playerId, envelope.command.unitId, envelope.command.type);

      if (!actor.ok) {
        return actor;
      }

      if (actor.unit.movementSpeed <= 0) {
        return { ok: false, reason: "unit cannot move" };
      }

      if (!isFinitePoint(envelope.command.target)) {
        return { ok: false, reason: "target is invalid" };
      }

      if (!findPathForUnit(state, actor.unit, clampMapPoint(state.map, envelope.command.target))) {
        return { ok: false, reason: "no path to target" };
      }

      return { ok: true };
    }
    case "patrol": {
      const actor = validateUnitActor(state, envelope.playerId, envelope.command.unitId, "patrol");

      if (!actor.ok) {
        return actor;
      }

      if (actor.unit.movementSpeed <= 0) {
        return { ok: false, reason: "unit cannot move" };
      }

      if (!isFinitePoint(envelope.command.target)) {
        return { ok: false, reason: "target is invalid" };
      }

      if (!findPathForUnit(state, actor.unit, clampMapPoint(state.map, envelope.command.target))) {
        return { ok: false, reason: "no path to target" };
      }

      return { ok: true };
    }
    case "attack-unit": {
      const actor = validateUnitActor(state, envelope.playerId, envelope.command.unitId, "attack-move");

      if (!actor.ok) {
        return actor;
      }

      const combat = getCombatDefinition(actor.unit);

      if (!combat) {
        return { ok: false, reason: "unit cannot attack" };
      }

      const target = state.units[envelope.command.targetUnitId];

      if (!target) {
        return { ok: false, reason: "attack target not found" };
      }

      if (arePlayersAllied(state, target.playerId, envelope.playerId)) {
        return { ok: false, reason: "cannot attack friendly unit" };
      }

      if (!canReachCombatTarget(state, actor.unit, target, combat)) {
        return { ok: false, reason: "no path to target" };
      }

      return { ok: true };
    }
    case "hold-position": {
      const actor = validateUnitActor(state, envelope.playerId, envelope.command.unitId, "hold");

      if (!actor.ok) {
        return actor;
      }

      return { ok: true };
    }
    case "town-bell": {
      const actor = validateUnitActor(state, envelope.playerId, envelope.command.buildingUnitId, "town-bell");

      if (!actor.ok) {
        return actor;
      }

      return { ok: true };
    }
    case "repair": {
      const actor = validateUnitActor(state, envelope.playerId, envelope.command.workerUnitId, "repair");

      if (!actor.ok) {
        return actor;
      }

      const target = state.units[envelope.command.targetUnitId];
      const targetValidation = validateRepairTarget(state, envelope.playerId, target);

      if (!targetValidation.ok) {
        return targetValidation;
      }

      if (
        !isWithinFootprintRange(actor.unit.position, targetValidation.unit, 1) &&
        !findBuildWorkPath(state, actor.unit, targetValidation.unit.kind as BuildingDefinitionId, targetValidation.unit.position)
      ) {
        return { ok: false, reason: "no path to repair target" };
      }

      return { ok: true };
    }
    case "stop": {
      const actor = validateUnitActor(state, envelope.playerId, envelope.command.unitId, "stop");

      if (!actor.ok) {
        return actor;
      }

      return { ok: true };
    }
    case "build": {
      const actor = validateUnitActor(state, envelope.playerId, envelope.command.builderUnitId, "build");

      if (!actor.ok) {
        return actor;
      }

      if (!isKnownBuilding(envelope.command.building)) {
        return { ok: false, reason: "building definition not found" };
      }

      if (!isFinitePoint(envelope.command.target)) {
        return { ok: false, reason: "build target is invalid" };
      }

      const placement = validateBuildingPlacement(state, envelope.command.building, envelope.command.target);

      if (!placement.ok) {
        return { ok: false, reason: placement.reason };
      }

      if (!canAfford(state, envelope.playerId, getUnitCost(envelope.command.building))) {
        return { ok: false, reason: "not enough resources" };
      }

      if (!findBuildWorkPath(state, actor.unit, envelope.command.building, envelope.command.target)) {
        return { ok: false, reason: "no path to build site" };
      }

      return { ok: true };
    }
    case "gather": {
      const actor = validateUnitActor(state, envelope.playerId, envelope.command.unitId, "gather");

      if (!actor.ok) {
        return actor;
      }

      const resourceTarget = findHarvestableResourceTile(state.map, envelope.command.resourceId);

      if (!resourceTarget) {
        return { ok: false, reason: "resource node not found" };
      }

      if (!findPathForUnit(state, actor.unit, resourceTarget)) {
        return { ok: false, reason: "no path to resource" };
      }

      return { ok: true };
    }
    case "train-unit": {
      const trainingRule = TRAINING_RULES[envelope.command.unit];

      if (!trainingRule) {
        return { ok: false, reason: "unit cannot be trained" };
      }

      const actor = validateUnitActor(state, envelope.playerId, envelope.command.buildingUnitId, trainingRule.actionId);

      if (!actor.ok) {
        return actor;
      }

      if (!trainingRule.buildings.includes(actor.unit.kind)) {
        return { ok: false, reason: "unit cannot be trained here" };
      }

      if ((actor.unit.productionQueue?.length ?? 0) >= MAX_PRODUCTION_QUEUE_SIZE) {
        return { ok: false, reason: "production queue is full" };
      }

      if ((actor.unit.researchQueue?.length ?? 0) > 0) {
        return { ok: false, reason: "building is researching" };
      }

      const definition = unitDefinitions[envelope.command.unit];
      if (!definition || definition.category === "building") {
        return { ok: false, reason: "trainable unit definition not found" };
      }

      if (!canAfford(state, envelope.playerId, getUnitCost(envelope.command.unit))) {
        return { ok: false, reason: "not enough resources" };
      }

      if (!canQueuePopulation(state, envelope.playerId, envelope.command.unit)) {
        return { ok: false, reason: "population cap reached" };
      }

      if (!findUnitSpawnPoint(state, actor.unit, envelope.command.unit)) {
        return { ok: false, reason: "no room to train unit" };
      }

      return { ok: true };
    }
    case "research": {
      const research = researchDefinitions[envelope.command.research];

      if (!research) {
        return { ok: false, reason: "research definition not found" };
      }

      const actor = validateUnitActor(state, envelope.playerId, envelope.command.buildingUnitId, research.actionId);

      if (!actor.ok) {
        return actor;
      }

      if (!(research.sourceBuildings as readonly UnitDefinitionId[]).includes(actor.unit.kind)) {
        return { ok: false, reason: "research cannot be performed here" };
      }

      if (isResearchCompleted(state, envelope.playerId, envelope.command.research)) {
        return { ok: false, reason: "research already completed" };
      }

      if (isResearchPending(state, envelope.playerId, envelope.command.research)) {
        return { ok: false, reason: "research already in progress" };
      }

      if ((actor.unit.researchQueue?.length ?? 0) >= MAX_RESEARCH_QUEUE_SIZE) {
        return { ok: false, reason: "research queue is full" };
      }

      if ((actor.unit.productionQueue?.length ?? 0) > 0) {
        return { ok: false, reason: "production queue is busy" };
      }

      if (!canAfford(state, envelope.playerId, research.cost)) {
        return { ok: false, reason: "not enough resources" };
      }

      return { ok: true };
    }
    case "cancel-production": {
      const command = envelope.command as Extract<CommandEnvelope["command"], { type: "cancel-production" }>;
      const actor = validateUnitActor(state, envelope.playerId, command.buildingUnitId, "cancel-production");

      if (!actor.ok) {
        return actor;
      }

      const productionQueue = actor.unit.productionQueue;
      const researchQueue = actor.unit.researchQueue;

      if ((!productionQueue || productionQueue.length === 0) && (!researchQueue || researchQueue.length === 0)) {
        return { ok: false, reason: "queue is empty" };
      }

      if (
        command.queueItemId &&
        !productionQueue?.some((item) => item.id === command.queueItemId) &&
        !researchQueue?.some((item) => item.id === command.queueItemId)
      ) {
        return { ok: false, reason: "queue item not found" };
      }

      return { ok: true };
    }
    case "cancel-construction": {
      const command = envelope.command as Extract<CommandEnvelope["command"], { type: "cancel-construction" }>;
      const unit = state.units[command.unitId];

      if (!unit) {
        return { ok: false, reason: "unit not found" };
      }

      if (unit.playerId !== envelope.playerId) {
        return { ok: false, reason: "unit is not owned by player" };
      }

      if (unitDefinitions[unit.kind].category !== "building") {
        return { ok: false, reason: "unit is not a building" };
      }

      if (!isUnitUnderConstruction(unit)) {
        return { ok: false, reason: "unit is not under construction" };
      }

      return { ok: true };
    }
    case "set-rally-point": {
      const actor = validateUnitActor(state, envelope.playerId, envelope.command.buildingUnitId, "rally-point");

      if (!actor.ok) {
        return actor;
      }

      if (!isFinitePoint(envelope.command.target)) {
        return { ok: false, reason: "rally target is invalid" };
      }

      if (envelope.command.mode !== undefined && envelope.command.mode !== "move" && envelope.command.mode !== "attack-move") {
        return { ok: false, reason: "rally target is invalid" };
      }

      if (envelope.command.resourceId && !findHarvestableResourceTile(state.map, envelope.command.resourceId)) {
        return { ok: false, reason: "rally resource node not found" };
      }

      return { ok: true };
    }
    case "cheat": {
      if (!state.players[envelope.playerId] || !state.playerResources[envelope.playerId]) {
        return { ok: false, reason: "player not found" };
      }

      if (!SIMULATION_CHEAT_CODES.has(envelope.command.code)) {
        return { ok: false, reason: "cheat code not supported" };
      }

      return { ok: true };
    }
  }
}

export function issueCommand(state: WorldState, envelope: CommandEnvelope): IssueCommandResult {
  const validation = validateCommand(state, envelope);

  if (!validation.ok) {
    return validation;
  }

  applyCommand(state, envelope);
  return { ok: true, envelope };
}

export function applyCommand(state: WorldState, envelope: CommandEnvelope): void {
  state.lastAcceptedCommand = envelope;

  switch (envelope.command.type) {
    case "move":
    case "attack-move": {
      const unit = state.units[envelope.command.unitId];

      if (!unit) {
        return;
      }

      if (unit.movementSpeed <= 0) {
        return;
      }

      const target = clampMapPoint(state.map, envelope.command.target);
      const path = findPathForUnit(state, unit, target);

      if (!path) {
        return;
      }

      unit.movementPath = path;
      unit.movementTarget = path[0] ?? target;
      // An attack-move's target is its strategic destination. The path may
      // temporarily end beside an occupied mobile footprint, but that routing
      // fallback must not replace the destination used for later re-planning.
      unit.currentOrder = {
        type: envelope.command.type,
        target: envelope.command.type === "attack-move"
          ? { ...target }
          : { ...(path[path.length - 1] ?? target) },
      };
      return;
    }
    case "patrol": {
      const unit = state.units[envelope.command.unitId];

      if (!unit || unit.movementSpeed <= 0) {
        return;
      }

      const target = clampMapPoint(state.map, envelope.command.target);
      const path = findPathForUnit(state, unit, target);

      if (!path) {
        return;
      }

      const patrolTarget = path[path.length - 1] ?? target;

      unit.movementPath = path;
      unit.movementTarget = path[0] ?? patrolTarget;
      unit.currentOrder = {
        type: "patrol",
        origin: clampMapPoint(state.map, { x: Math.round(unit.position.x), y: Math.round(unit.position.y) }),
        target: { ...patrolTarget },
        nextTarget: { ...patrolTarget },
      };
      return;
    }
    case "attack-unit": {
      const unit = state.units[envelope.command.unitId];
      const target = state.units[envelope.command.targetUnitId];
      const combat = unit ? getCombatDefinition(unit) : undefined;

      if (!unit || !target || arePlayersAllied(state, target.playerId, unit.playerId) || !combat || !canReachCombatTarget(state, unit, target, combat)) {
        return;
      }

      delete unit.movementTarget;
      delete unit.movementPath;
      unit.currentOrder = { type: "attack-unit", targetUnitId: target.id };
      return;
    }
    case "hold-position": {
      const unit = state.units[envelope.command.unitId];

      if (unit) {
        delete unit.movementTarget;
        delete unit.movementPath;
        unit.currentOrder = {
          type: "hold-position",
          anchor: clampMapPoint(state.map, { x: Math.round(unit.position.x), y: Math.round(unit.position.y) }),
        };
      }

      return;
    }
    case "town-bell": {
      const building = state.units[envelope.command.buildingUnitId];

      if (!building) {
        return;
      }

      const target = clampMapPoint(state.map, {
        x: Math.round(building.position.x),
        y: Math.round(building.position.y),
      });

      for (const unit of iterateUnitsOrdered(state)) {
        if (
          unit.playerId !== envelope.playerId ||
          unit.id === building.id ||
          unitDefinitions[unit.kind].category !== "worker" ||
          !unitCanPerformAction(unit.kind, "move") ||
          isUnitUnderConstruction(unit) ||
          getDistanceSquared(unit.position, building.position) > TOWN_BELL_RADIUS * TOWN_BELL_RADIUS
        ) {
          continue;
        }

        const path = findBuildWorkPath(state, unit, building.kind as BuildingDefinitionId, building.position) ??
          findPathForUnit(state, unit, target);

        if (!path) {
          continue;
        }

        unit.movementPath = path;
        const nextTarget = path[0];

        if (nextTarget) {
          unit.movementTarget = nextTarget;
        } else {
          delete unit.movementTarget;
        }

        unit.currentOrder = { type: "move", target: { ...(path[path.length - 1] ?? target) } };
      }

      return;
    }
    case "repair": {
      const unit = state.units[envelope.command.workerUnitId];
      const target = state.units[envelope.command.targetUnitId];

      if (!unit || !target || !validateRepairTarget(state, envelope.playerId, target).ok) {
        return;
      }

      const path = isWithinFootprintRange(unit.position, target, 1)
        ? []
        : findBuildWorkPath(state, unit, target.kind as BuildingDefinitionId, target.position);

      if (!path) {
        return;
      }

      unit.movementPath = path;
      const nextTarget = path[0];

      if (nextTarget) {
        unit.movementTarget = nextTarget;
      } else {
        delete unit.movementTarget;
      }

      unit.currentOrder = { type: "repair", targetUnitId: target.id };
      return;
    }
    case "stop": {
      const unit = state.units[envelope.command.unitId];

      if (unit) {
        delete unit.movementTarget;
        delete unit.movementPath;
        delete unit.currentOrder;
      }

      return;
    }
    case "build": {
      const unit = state.units[envelope.command.builderUnitId];

      if (!unit) {
        return;
      }

      const target = clampMapPoint(state.map, envelope.command.target);
      const placement = validateBuildingPlacement(state, envelope.command.building, target);

      if (!placement.ok || !deductResources(state, envelope.playerId, getUnitCost(envelope.command.building))) {
        return;
      }

      const buildPath = findBuildWorkPath(state, unit, envelope.command.building, target);

      if (!buildPath) {
        refundResources(state, envelope.playerId, getUnitCost(envelope.command.building));
        return;
      }

      const buildingId = createUnitId(state, envelope.playerId, envelope.command.building);
      const building = createUnitState(buildingId, envelope.playerId, envelope.command.building, target);
      const totalTicks = getBuildTimeTicks(envelope.command.building);

      building.construction = {
        remainingTicks: totalTicks,
        totalTicks,
        builderUnitId: unit.id,
      };
      updateConstructionHealth(building);
      state.units[buildingId] = building;
      unit.movementPath = buildPath;
      const nextTarget = buildPath[0];
      if (nextTarget) {
        unit.movementTarget = nextTarget;
      } else {
        delete unit.movementTarget;
      }
      unit.currentOrder = {
        type: "build",
        building: envelope.command.building,
        target,
        buildingUnitId: buildingId,
      };
      return;
    }
    case "gather": {
      const unit = state.units[envelope.command.unitId];
      const resourceTarget = findHarvestableResourceTile(state.map, envelope.command.resourceId);

      if (!unit || !resourceTarget) {
        return;
      }

      const path = findPathForUnit(state, unit, resourceTarget);

      if (!path) {
        return;
      }

      unit.movementPath = path;
      const nextTarget = path[0];

      if (nextTarget) {
        unit.movementTarget = nextTarget;
      } else {
        delete unit.movementTarget;
      }

      unit.currentOrder = { type: "gather", resourceId: envelope.command.resourceId, target: { ...resourceTarget } };
      return;
    }
    case "train-unit": {
      const building = state.units[envelope.command.buildingUnitId];

      if (!building || !deductResources(state, envelope.playerId, getUnitCost(envelope.command.unit))) {
        return;
      }

      const totalTicks = getUnitTrainTimeTicks(envelope.command.unit);
      const queue = building.productionQueue ?? [];

      queue.push({
        id: `${building.id}-train-${state.tick}-${queue.length + 1}`,
        unit: envelope.command.unit,
        remainingTicks: totalTicks,
        totalTicks,
      });
      building.productionQueue = queue;
      return;
    }
    case "research": {
      const building = state.units[envelope.command.buildingUnitId];
      const research = researchDefinitions[envelope.command.research];

      if (!building || !research || !deductResources(state, envelope.playerId, research.cost)) {
        return;
      }

      const totalTicks = Math.max(1, research.researchTimeTicks);
      const queue = building.researchQueue ?? [];

      queue.push({
        id: `${building.id}-research-${state.tick}-${research.id}`,
        research: envelope.command.research,
        remainingTicks: totalTicks,
        totalTicks,
      });
      building.researchQueue = queue;
      return;
    }
    case "cancel-production": {
      const command = envelope.command as Extract<CommandEnvelope["command"], { type: "cancel-production" }>;
      const building = state.units[command.buildingUnitId];

      if (!building) {
        return;
      }

      const productionQueue = building.productionQueue;
      const productionQueueIndex = productionQueue
        ? command.queueItemId
          ? productionQueue.findIndex((item) => item.id === command.queueItemId)
          : productionQueue.length - 1
        : -1;

      if (productionQueue && productionQueue.length > 0 && productionQueueIndex >= 0) {
        const [cancelledItem] = productionQueue.splice(productionQueueIndex, 1);

        if (cancelledItem) {
          refundResources(state, envelope.playerId, getUnitCost(cancelledItem.unit));
        }

        if (productionQueue.length === 0) {
          delete building.productionQueue;
        }
        return;
      }

      const researchQueue = building.researchQueue;

      if (!researchQueue || researchQueue.length === 0) {
        return;
      }

      const researchQueueIndex = command.queueItemId
        ? researchQueue.findIndex((item) => item.id === command.queueItemId)
        : researchQueue.length - 1;

      if (researchQueueIndex < 0) {
        return;
      }

      const [cancelledItem] = researchQueue.splice(researchQueueIndex, 1);

      if (cancelledItem) {
        const research = researchDefinitions[cancelledItem.research];

        if (research) {
          refundResources(state, envelope.playerId, research.cost);
        }
      }

      if (researchQueue.length === 0) {
        delete building.researchQueue;
      }
      return;
    }
    case "cancel-construction": {
      const command = envelope.command as Extract<CommandEnvelope["command"], { type: "cancel-construction" }>;
      const building = state.units[command.unitId];

      if (!building?.construction) {
        return;
      }

      refundConstructionResources(state, envelope.playerId, building);
      removeUnitFromWorld(state, building.id);
      return;
    }
    case "set-rally-point": {
      const building = state.units[envelope.command.buildingUnitId];

      if (!building) {
        return;
      }

      const rallyResource = envelope.command.resourceId
        ? findResourceNode(state.map, envelope.command.resourceId)
        : null;
      const rallyResourceKind = rallyResource
        ? getResourceDefinition(rallyResource)?.yieldResource
        : undefined;

      building.rallyPoint = {
        target: clampMapPoint(state.map, envelope.command.target),
        ...(envelope.command.mode ? { mode: envelope.command.mode } : {}),
        ...(envelope.command.resourceId ? { resourceId: envelope.command.resourceId } : {}),
        ...(rallyResourceKind ? { resourceKind: rallyResourceKind } : {}),
      };
      return;
    }
    case "cheat": {
      applyCheatCommand(state, envelope.playerId, envelope.command.code);
      return;
    }
  }
}

function applyCheatCommand(state: WorldState, playerId: string, code: CheatCodeId): void {
  switch (code) {
    case "grant-resources": {
      const bank = state.playerResources[playerId];

      if (!bank) {
        return;
      }

      bank.food += CHEAT_RESOURCE_GRANT_AMOUNT;
      bank.wood += CHEAT_RESOURCE_GRANT_AMOUNT;
      return;
    }
    case "fast-production": {
      state.playerCheats[playerId] ??= {};
      state.playerCheats[playerId].fastProduction = true;
      return;
    }
    case "force-rain": {
      state.environment.weatherOverride = "rain";
      delete state.environment.weatherOverrideUntilTick;
      state.environment.weather = "rain";
      return;
    }
    case "invincible": {
      state.playerCheats[playerId] ??= {};
      state.playerCheats[playerId].invincible = true;
      return;
    }
  }
}

type ActorValidationResult = { ok: true; unit: UnitState } | { ok: false; reason: string };

function validateUnitActor(
  state: WorldState,
  playerId: string,
  unitId: string,
  actionId: ActionDefinitionId,
): ActorValidationResult {
  const unit = state.units[unitId];

  if (!unit) {
    return { ok: false, reason: "unit not found" };
  }

  if (unit.playerId !== playerId) {
    return { ok: false, reason: "unit is not owned by player" };
  }

  if (!unitCanPerformAction(unit.kind, actionId)) {
    return { ok: false, reason: "unit cannot perform action" };
  }

  if (isUnitUnderConstruction(unit) && actionId !== "stop") {
    return { ok: false, reason: "unit is under construction" };
  }

  return { ok: true, unit };
}

type RepairTargetValidationResult = { ok: true; unit: UnitState } | { ok: false; reason: string };

function validateRepairTarget(
  state: WorldState,
  playerId: string,
  target: UnitState | undefined,
): RepairTargetValidationResult {
  if (!target) {
    return { ok: false, reason: "repair target not found" };
  }

  if (target.playerId !== playerId) {
    return { ok: false, reason: "cannot repair enemy unit" };
  }

  if (unitDefinitions[target.kind].category !== "building") {
    return { ok: false, reason: "repair target is not a building" };
  }

  if (!state.units[target.id]) {
    return { ok: false, reason: "repair target not found" };
  }

  if (isUnitUnderConstruction(target)) {
    return { ok: true, unit: target };
  }

  if (target.health.current >= target.health.max) {
    return { ok: false, reason: "repair target is already at full health" };
  }

  return { ok: true, unit: target };
}

function isKnownBuilding(building: string): boolean {
  const knownBuildings: readonly string[] = buildingDefinitionIds;

  return knownBuildings.includes(building);
}

function isFinitePoint(point: GridPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function getCombatDefinition(unit: UnitState): UnitDefinition["combat"] {
  return (unitDefinitions[unit.kind] as UnitDefinition).combat;
}

function canReachCombatTarget(
  state: WorldState,
  unit: UnitState,
  target: UnitState,
  combat: NonNullable<UnitDefinition["combat"]>,
): boolean {
  return isWithinCombatRange(unit, target, combat.range) || findPathForUnit(state, unit, target.position) !== null;
}

function isWithinCombatRange(unit: UnitState, target: UnitState, range: number): boolean {
  const rangeSq = range * range;

  for (const sourceTile of getFootprintTiles(unit.position, unitDefinitions[unit.kind].footprint)) {
    for (const targetTile of getFootprintTiles(target.position, unitDefinitions[target.kind].footprint)) {
      const deltaX = sourceTile.x - targetTile.x;
      const deltaY = sourceTile.y - targetTile.y;

      if (deltaX * deltaX + deltaY * deltaY <= rangeSq) {
        return true;
      }
    }
  }

  return false;
}

function clampMapPoint(map: MapDefinition, point: GridPoint): GridPoint {
  return {
    x: Math.max(0, Math.min(map.width - 1, point.x)),
    y: Math.max(0, Math.min(map.height - 1, point.y)),
  };
}

function canAfford(state: WorldState, playerId: string, cost: UnitDefinition["cost"]): boolean {
  const bank = state.playerResources[playerId];

  if (!bank) {
    return false;
  }

  return Object.entries(cost ?? {}).every(([resource, amount]) => {
    const kind = resource as BankResourceKind;
    return bank[kind] >= (amount ?? 0);
  });
}

function getUnitCost(kind: UnitDefinitionId): UnitDefinition["cost"] {
  return (unitDefinitions[kind] as UnitDefinition).cost;
}

function getUnitTrainTimeTicks(kind: UnitDefinitionId): number {
  return Math.max(1, (unitDefinitions[kind] as UnitDefinition).trainTimeTicks ?? 1);
}

function deductResources(state: WorldState, playerId: string, cost: UnitDefinition["cost"]): boolean {
  if (!canAfford(state, playerId, cost)) {
    return false;
  }

  const bank = state.playerResources[playerId] as ResourceAmountSet;

  for (const [resource, amount] of Object.entries(cost ?? {})) {
    const kind = resource as BankResourceKind;
    bank[kind] -= amount ?? 0;
  }

  return true;
}

function refundResources(state: WorldState, playerId: string, cost: UnitDefinition["cost"]): void {
  const bank = state.playerResources[playerId];

  if (!bank) {
    return;
  }

  for (const [resource, amount] of Object.entries(cost ?? {})) {
    const kind = resource as BankResourceKind;
    bank[kind] += amount ?? 0;
  }
}

function refundConstructionResources(state: WorldState, playerId: string, building: UnitState): void {
  const construction = building.construction;
  const bank = state.playerResources[playerId];

  if (!construction || !bank) {
    return;
  }

  const remainingRatio = Math.max(0, Math.min(1, construction.remainingTicks / Math.max(1, construction.totalTicks)));

  for (const [resource, amount] of Object.entries(getUnitCost(building.kind) ?? {})) {
    const kind = resource as BankResourceKind;
    bank[kind] += Math.ceil((amount ?? 0) * remainingRatio);
  }
}

function isWithinFootprintRange(position: GridPoint, target: UnitState, range: number): boolean {
  const footprint = unitDefinitions[target.kind].footprint;
  const roundedPosition = { x: Math.round(position.x), y: Math.round(position.y) };

  return getFootprintTiles(target.position, footprint).some((tile) =>
    Math.max(Math.abs(roundedPosition.x - tile.x), Math.abs(roundedPosition.y - tile.y)) <= range,
  );
}

function getDistanceSquared(a: GridPoint, b: GridPoint): number {
  const deltaX = a.x - b.x;
  const deltaY = a.y - b.y;

  return deltaX * deltaX + deltaY * deltaY;
}

export function findUnitSpawnPoint(state: WorldState, building: UnitState, unitKind: UnitDefinitionId): GridPoint | null {
  const occupied = getOccupiedTiles(state);
  const footprint = unitDefinitions[building.kind].footprint;
  const radius = Math.max(2, footprint.width, footprint.height);

  for (let distance = 1; distance <= radius + 4; distance += 1) {
    for (let y = Math.round(building.position.y) - distance; y <= Math.round(building.position.y) + distance; y += 1) {
      for (let x = Math.round(building.position.x) - distance; x <= Math.round(building.position.x) + distance; x += 1) {
        if (Math.max(Math.abs(x - Math.round(building.position.x)), Math.abs(y - Math.round(building.position.y))) !== distance) {
          continue;
        }

        const point = { x, y };
        if (isSpawnPointValid(state, point, unitKind, occupied)) {
          return point;
        }
      }
    }
  }

  return null;
}

export function findBuildWorkPath(
  state: WorldState,
  builder: UnitState,
  building: UnitDefinitionId,
  target: GridPoint,
): GridPoint[] | null {
  const definition = unitDefinitions[building];
  const footprintTiles = getFootprintTiles(clampMapPoint(state.map, target), definition.footprint);
  const footprintKeys = new Set(footprintTiles.map(toTileKey));
  const candidates = getBuildWorkCandidates(state.map, footprintTiles, footprintKeys);

  for (const candidate of candidates) {
    const path = findPathForUnit(state, builder, candidate);

    if (path) {
      return path;
    }
  }

  return null;
}

function getBuildWorkCandidates(
  map: MapDefinition,
  footprintTiles: readonly GridPoint[],
  footprintKeys: ReadonlySet<string>,
): GridPoint[] {
  if (footprintTiles.length === 0) {
    return [];
  }

  const minX = Math.min(...footprintTiles.map((tile) => tile.x));
  const maxX = Math.max(...footprintTiles.map((tile) => tile.x));
  const minY = Math.min(...footprintTiles.map((tile) => tile.y));
  const maxY = Math.max(...footprintTiles.map((tile) => tile.y));
  const candidates: GridPoint[] = [];

  for (let y = minY - 1; y <= maxY + 1; y += 1) {
    for (let x = minX - 1; x <= maxX + 1; x += 1) {
      const point = { x, y };

      if (
        x < 0 ||
        x >= map.width ||
        y < 0 ||
        y >= map.height ||
        footprintKeys.has(toTileKey(point)) ||
        terrainDefinitions[getTileAt(map, x, y).terrain].blocksMovement
      ) {
        continue;
      }

      candidates.push(point);
    }
  }

  const center = {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
  };

  return candidates.sort((a, b) => {
    const distanceDelta = getDistanceSq(a, center) - getDistanceSq(b, center);

    if (distanceDelta !== 0) {
      return distanceDelta;
    }

    return a.y - b.y || a.x - b.x;
  });
}

function getDistanceSq(a: GridPoint, b: GridPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;

  return dx * dx + dy * dy;
}

function isSpawnPointValid(
  state: WorldState,
  point: GridPoint,
  unitKind: UnitDefinitionId,
  occupied: ReadonlySet<string>,
): boolean {
  const unit = createUnitState("__probe__", "__probe__", unitKind, point);

  return (
    point.x >= 0 &&
    point.x < state.map.width &&
    point.y >= 0 &&
    point.y < state.map.height &&
    !occupied.has(toTileKey(point)) &&
    findPathForUnit(state, unit, point) !== null
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

export function createUnitId(state: WorldState, playerId: string, kind: UnitDefinitionId): string {
  let suffix = 1;
  let id = `${playerId}-${kind}-${suffix}`;

  while (state.units[id]) {
    suffix += 1;
    id = `${playerId}-${kind}-${suffix}`;
  }

  return id;
}

function toTileKey(point: GridPoint): string {
  return `${point.x},${point.y}`;
}
