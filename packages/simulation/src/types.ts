import type {
  BuildingDefinitionId,
  CommandEnvelope,
  FactionId,
  GridPoint,
  MapDefinition,
  ResourceAmountSet,
  ScenarioObjectiveDefinition,
  UnitDefinitionId,
} from "../../shared/src/index.js";

export type ResourceBank = ResourceAmountSet;

export interface AttributePool {
  current: number;
  max: number;
}

export type UnitOrderState =
  | { type: "move"; target: GridPoint }
  | { type: "attack-move"; target: GridPoint }
  | { type: "build"; building: BuildingDefinitionId; target: GridPoint }
  | { type: "gather"; resourceId: string; target: GridPoint };

export interface UnitState {
  id: string;
  playerId: string;
  kind: UnitDefinitionId;
  position: GridPoint;
  movementSpeed: number;
  movementTarget?: GridPoint;
  movementPath?: GridPoint[];
  currentOrder?: UnitOrderState;
  health: AttributePool;
  mana: AttributePool;
}

export interface PlayerState {
  id: string;
  faction: FactionId;
}

export type ObjectiveStatus = "pending" | "completed" | "failed";
export type ScenarioStatus = "running" | "victory" | "defeat";

export interface ObjectiveRuntimeState {
  id: string;
  label: string;
  description: string;
  type: ScenarioObjectiveDefinition["type"];
  required: boolean;
  status: ObjectiveStatus;
  completedAtTick?: number;
  failedAtTick?: number;
}

export interface ScenarioRuntimeEvent {
  id: string;
  type: "objective-completed" | "objective-failed" | "scenario-victory" | "scenario-defeat";
  tick: number;
  objectiveId?: string;
}

export interface ScenarioRuntimeState {
  id: string;
  status: ScenarioStatus;
  objectives: Record<string, ObjectiveRuntimeState>;
  events: ScenarioRuntimeEvent[];
  endedAtTick?: number;
}

export interface WorldState {
  tick: number;
  map: MapDefinition;
  scenario: ScenarioRuntimeState;
  players: Record<string, PlayerState>;
  units: Record<string, UnitState>;
  playerResources: Record<string, ResourceBank>;
  lastAcceptedCommand: CommandEnvelope | null;
}

export type WorldSnapshot = Omit<WorldState, "map">;
