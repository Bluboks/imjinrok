import type { BuildingDefinitionId, ResearchDefinitionId, UnitDefinitionId } from "./content.js";

export interface GridPoint {
  x: number;
  y: number;
}

export interface MoveCommand {
  type: "move";
  unitId: string;
  target: GridPoint;
}

export interface AttackMoveCommand {
  type: "attack-move";
  unitId: string;
  target: GridPoint;
}

export interface AttackUnitCommand {
  type: "attack-unit";
  unitId: string;
  targetUnitId: string;
}

export interface PatrolCommand {
  type: "patrol";
  unitId: string;
  target: GridPoint;
}

export interface HoldPositionCommand {
  type: "hold-position";
  unitId: string;
}

export interface TownBellCommand {
  type: "town-bell";
  buildingUnitId: string;
}

export interface RepairCommand {
  type: "repair";
  workerUnitId: string;
  targetUnitId: string;
}

export interface BuildCommand {
  type: "build";
  builderUnitId: string;
  building: BuildingDefinitionId;
  target: GridPoint;
}

export interface GatherCommand {
  type: "gather";
  unitId: string;
  resourceId: string;
}

export interface TrainUnitCommand {
  type: "train-unit";
  buildingUnitId: string;
  unit: UnitDefinitionId;
}

export interface ResearchCommand {
  type: "research";
  buildingUnitId: string;
  research: ResearchDefinitionId;
}

export interface CancelProductionCommand {
  type: "cancel-production";
  buildingUnitId: string;
  queueItemId?: string;
}

export interface CancelConstructionCommand {
  type: "cancel-construction";
  unitId: string;
}

/**
 * Product command boundary for the source-proven demolition progression.
 * The original action-13 producer eligibility remains unresolved, so this is
 * deliberately not named as an exact source command producer.
 */
export interface DemolishBuildingCommand {
  type: "demolish-building";
  unitId: string;
}

export interface SetRallyPointCommand {
  type: "set-rally-point";
  buildingUnitId: string;
  target: GridPoint;
  resourceId?: string;
  mode?: "move" | "attack-move";
}

export interface StopCommand {
  type: "stop";
  unitId: string;
}

/** Player-global automation; intentionally independent of unit selection. */
export interface SetMagicAutoUseCommand {
  type: "set-magic-auto-use";
  enabled: boolean;
}

export type CheatCodeId =
  | "grant-resources"
  | "fast-production"
  | "force-rain"
  | "invincible";

export interface CheatCommand {
  type: "cheat";
  code: CheatCodeId;
}

export type UnitCommand =
  | MoveCommand
  | AttackMoveCommand
  | AttackUnitCommand
  | PatrolCommand
  | HoldPositionCommand
  | TownBellCommand
  | RepairCommand
  | BuildCommand
  | GatherCommand
  | TrainUnitCommand
  | ResearchCommand
  | CancelProductionCommand
  | CancelConstructionCommand
  | DemolishBuildingCommand
  | SetRallyPointCommand
  | StopCommand
  | SetMagicAutoUseCommand
  | CheatCommand;

export interface CommandEnvelope {
  sessionId: string;
  playerId: string;
  issuedAtTick: number;
  command: UnitCommand;
}
