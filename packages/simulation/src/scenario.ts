import type { ScenarioDefinition } from "../../shared/src/index.js";
import type { ObjectiveRuntimeState, ScenarioRuntimeEvent, ScenarioRuntimeState, WorldState } from "./types.js";

export function createScenarioRuntimeState(scenario: ScenarioDefinition): ScenarioRuntimeState {
  const objectives: Record<string, ObjectiveRuntimeState> = {};

  for (const objective of scenario.objectives) {
    objectives[objective.id] = {
      id: objective.id,
      label: objective.label,
      description: objective.description,
      type: objective.type,
      required: objective.required,
      status: "pending",
    };
  }

  return {
    id: scenario.id,
    status: "running",
    objectives,
    events: [],
  };
}

export function evaluateScenarioRuntime(state: WorldState): void {
  if (state.scenario.status !== "running") {
    return;
  }

  for (const objective of Object.values(state.scenario.objectives)) {
    if (objective.status !== "pending") {
      continue;
    }

    if (isObjectiveComplete(state, objective)) {
      completeObjective(state, objective);
    }
  }

  const requiredObjectives = Object.values(state.scenario.objectives).filter((objective) => objective.required);

  if (requiredObjectives.length > 0 && requiredObjectives.every((objective) => objective.status === "completed")) {
    completeScenario(state, "victory");
  }
}

function isObjectiveComplete(state: WorldState, objective: ObjectiveRuntimeState): boolean {
  switch (objective.type) {
    case "defeat-opponents":
      return areOpponentsDefeated(state);
    case "survive":
    case "collect-resources":
    case "custom":
      return false;
  }
}

function areOpponentsDefeated(state: WorldState): boolean {
  const playerIds = Object.keys(state.players);

  if (playerIds.length <= 1) {
    return false;
  }

  const playersWithUnits = new Set(Object.values(state.units).map((unit) => unit.playerId));

  return playerIds.filter((playerId) => playersWithUnits.has(playerId)).length <= 1;
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
}

function createScenarioEvent(
  state: WorldState,
  type: ScenarioRuntimeEvent["type"],
  objectiveId?: string,
): ScenarioRuntimeEvent {
  const event: ScenarioRuntimeEvent = {
    id: `${state.scenario.id}-${state.tick}-${state.scenario.events.length}`,
    type,
    tick: state.tick,
  };

  if (objectiveId) {
    event.objectiveId = objectiveId;
  }

  return event;
}
