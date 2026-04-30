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

export interface BuildCommand {
  type: "build";
  builderUnitId: string;
  building: "town-center" | "house" | "barracks";
  target: GridPoint;
}

export interface GatherCommand {
  type: "gather";
  unitId: string;
  resourceId: string;
}

export interface StopCommand {
  type: "stop";
  unitId: string;
}

export type UnitCommand =
  | MoveCommand
  | AttackMoveCommand
  | BuildCommand
  | GatherCommand
  | StopCommand;

export interface CommandEnvelope {
  sessionId: string;
  playerId: string;
  issuedAtTick: number;
  command: UnitCommand;
}
