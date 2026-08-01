import {
  unitDefinitions,
  type GridPoint,
  type UnitDefinitionId,
} from "../../shared/src/index.js";
import type { UnitState, WorldState } from "./types.js";

/**
 * Semantic events are a bounded, serializable lifecycle log.  The retention
 * matches the existing combat and projectile lifecycle logs; consumers must
 * observe events at the authoritative tick boundary rather than treat this
 * history as an unbounded replay journal.
 */
export const SIMULATION_EVENT_RETENTION_TICKS = 8;
export const CONSTRUCTION_COMPLETED_EVENT_TYPE = "construction-completed" as const;

const BUILDING_KIND_IDS: readonly UnitDefinitionId[] = Object.entries(unitDefinitions)
  .filter(([, definition]) => definition.category === "building")
  .map(([kind]) => kind as UnitDefinitionId);

export interface ConstructionCompletedEvent {
  readonly id: string;
  readonly sequence: number;
  readonly type: typeof CONSTRUCTION_COMPLETED_EVENT_TYPE;
  readonly tick: number;
  readonly buildingId: string;
  readonly ownerId: string;
  readonly kind: UnitDefinitionId;
  readonly position: GridPoint;
}

export type SimulationEvent = ConstructionCompletedEvent;

export interface NormalizedSimulationEventState {
  readonly simulationEvents: SimulationEvent[];
  readonly nextSimulationEventSequence: number;
}

/**
 * Save/load boundary for the event SSOT.  An absent field is the recognized
 * legacy snapshot shape; a present malformed field fails closed instead of
 * being silently replaced with an empty history.
 */
export function normalizeSimulationEventState(value: {
  readonly simulationEvents?: unknown;
  readonly nextSimulationEventSequence?: unknown;
}): NormalizedSimulationEventState | null {
  const eventsAbsent = value.simulationEvents === undefined;
  const sequenceAbsent = value.nextSimulationEventSequence === undefined;

  if (eventsAbsent !== sequenceAbsent) {
    return null;
  }

  const simulationEvents = value.simulationEvents === undefined
    ? []
    : parseSerializedSimulationEventLog(value.simulationEvents);

  if (simulationEvents === null) {
    return null;
  }

  const nextSimulationEventSequence = resolveSimulationEventSequence(value.nextSimulationEventSequence, simulationEvents);
  if (nextSimulationEventSequence === null) {
    return null;
  }

  return { simulationEvents, nextSimulationEventSequence };
}

export function appendConstructionCompletedEvent(state: WorldState, building: UnitState): void {
  const sequence = state.nextSimulationEventSequence;

  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new RangeError("simulation event sequence is exhausted");
  }

  if (unitDefinitions[building.kind].category !== "building") {
    throw new TypeError(`construction completion event requires a building, received '${building.kind}'`);
  }

  if (building.construction) {
    throw new Error(`construction completion event requires completed building '${building.id}'`);
  }

  const event: ConstructionCompletedEvent = {
    id: `${CONSTRUCTION_COMPLETED_EVENT_TYPE}:${sequence}`,
    sequence,
    type: CONSTRUCTION_COMPLETED_EVENT_TYPE,
    tick: state.tick,
    buildingId: building.id,
    ownerId: building.playerId,
    kind: building.kind,
    position: { x: building.position.x, y: building.position.y },
  };

  if (sequence === Number.MAX_SAFE_INTEGER) {
    throw new RangeError("simulation event sequence is exhausted");
  }

  state.simulationEvents.push(event);
  state.nextSimulationEventSequence = sequence + 1;
}

export function pruneSimulationEvents(state: WorldState): void {
  state.simulationEvents = state.simulationEvents.filter(
    (event) => state.tick - event.tick <= SIMULATION_EVENT_RETENTION_TICKS,
  );
}

/**
 * The transition owner calls this after work reaches zero.  Deleting the
 * construction marker before appending makes the event observe the completed
 * state, and the shared helper is used by both build and assisted-repair work
 * so a building cannot emit twice when multiple workers cross the boundary.
 */
export function completeConstructionTransition(state: WorldState, building: UnitState): boolean {
  if (!building.construction || building.construction.remainingTicks > 0) {
    return false;
  }

  delete building.construction;
  appendConstructionCompletedEvent(state, building);
  return true;
}

export function parseSerializedSimulationEventLog(value: unknown): SimulationEvent[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const events: SimulationEvent[] = [];
  let previousSequence = 0;
  let previousTick = 0;

  for (const candidate of value) {
    const event = parseSerializedSimulationEvent(candidate);

    if (!event || event.sequence <= previousSequence || event.tick < previousTick) {
      return null;
    }

    previousSequence = event.sequence;
    previousTick = event.tick;
    events.push(event);
  }

  return events;
}

export function resolveSimulationEventSequence(
  value: unknown,
  events: readonly SimulationEvent[],
): number | null {
  if (value === undefined) {
    return getNextSimulationEventSequence(events);
  }

  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    return null;
  }

  const lastSequence = events.at(-1)?.sequence ?? 0;
  return value > lastSequence ? value : null;
}

function parseSerializedSimulationEvent(value: unknown): SimulationEvent | null {
  if (!isRecord(value) || !hasExactKeys(value, ["id", "sequence", "type", "tick", "buildingId", "ownerId", "kind", "position"])) {
    return null;
  }

  const { id, sequence, type, tick, buildingId, ownerId, kind, position } = value;

  if (
    typeof id !== "string" ||
    typeof sequence !== "number" ||
    !Number.isSafeInteger(sequence) ||
    sequence < 1 ||
    id !== `${CONSTRUCTION_COMPLETED_EVENT_TYPE}:${sequence}` ||
    type !== CONSTRUCTION_COMPLETED_EVENT_TYPE ||
    typeof tick !== "number" ||
    !Number.isSafeInteger(tick) ||
    tick < 0 ||
    typeof buildingId !== "string" ||
    buildingId.length === 0 ||
    typeof ownerId !== "string" ||
    ownerId.length === 0 ||
    !isBuildingDefinitionId(kind) ||
    !isGridPoint(position)
  ) {
    return null;
  }

  return {
    id,
    sequence,
    type: CONSTRUCTION_COMPLETED_EVENT_TYPE,
    tick,
    buildingId,
    ownerId,
    kind,
    position: { x: position.x, y: position.y },
  };
}

function getNextSimulationEventSequence(events: readonly SimulationEvent[]): number | null {
  const lastSequence = events.at(-1)?.sequence ?? 0;

  if (!Number.isSafeInteger(lastSequence) || lastSequence < 0 || lastSequence === Number.MAX_SAFE_INTEGER) {
    return null;
  }

  return lastSequence + 1;
}

function isBuildingDefinitionId(value: unknown): value is UnitDefinitionId {
  return typeof value === "string" && BUILDING_KIND_IDS.some((kind) => kind === value);
}

function isGridPoint(value: unknown): value is GridPoint {
  return isRecord(value) && typeof value.x === "number" && Number.isFinite(value.x) && typeof value.y === "number" && Number.isFinite(value.y);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...keys].sort();
  return actualKeys.length === expectedKeys.length && actualKeys.every((key, index) => key === expectedKeys[index]);
}
