import {
  buildingDefinitionIds,
  unitCanPerformAction,
  type ActionDefinitionId,
  type CommandEnvelope,
  type GridPoint,
  type MapDefinition,
} from "../../shared/src/index.js";
import { findPathForUnit } from "./navigation.js";
import { validateBuildingPlacement } from "./placement.js";
import { findHarvestableResourceTile } from "./resources.js";
import type { UnitState, WorldState } from "./types.js";

export type CommandValidationResult = { ok: true } | { ok: false; reason: string };

export type IssueCommandResult =
  | { ok: true; envelope: CommandEnvelope }
  | { ok: false; reason: string };

export function validateCommand(state: WorldState, envelope: CommandEnvelope): CommandValidationResult {
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
      unit.currentOrder = { type: envelope.command.type, target: { ...(path[path.length - 1] ?? target) } };
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

      unit.movementTarget = target;
      unit.currentOrder = { type: "build", building: envelope.command.building, target: { ...target } };
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

  return { ok: true, unit };
}

function isKnownBuilding(building: string): boolean {
  const knownBuildings: readonly string[] = buildingDefinitionIds;

  return knownBuildings.includes(building);
}

function isFinitePoint(point: GridPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function clampMapPoint(map: MapDefinition, point: GridPoint): GridPoint {
  return {
    x: Math.max(0, Math.min(map.width - 1, point.x)),
    y: Math.max(0, Math.min(map.height - 1, point.y)),
  };
}
