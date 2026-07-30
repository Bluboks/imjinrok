import type {
  BuildingDefinitionId,
  BankResourceKind,
  CommandEnvelope,
  FactionId,
  GridPoint,
  MapDefinition,
  ResourceAmountSet,
  ScenarioAreaDefinition,
  ScenarioDefinition,
  ScenarioObjectiveDefinition,
  ScenarioScriptedEventActionDefinition,
  ScenarioTriggerDefinition,
  ResearchDefinitionId,
  UnitDefinitionId,
} from "../../shared/src/index.js";
import type { EnvironmentState } from "./environment.js";
import type { SourceOrientationState } from "./orientation.js";
import type { ProjectileImpactLogEntry, ProjectileSystemState } from "./projectiles.js";

export type ResourceBank = ResourceAmountSet;

export interface AttributePool {
  current: number;
  max: number;
}

export interface UnitTargetSelectorState {
  playerId?: string;
  targetKind: UnitDefinitionId;
}

export interface UnitScriptedBehaviorState {
  type: "conditional-attack-target";
  moveTarget: GridPoint;
  allowPartialPath?: boolean;
  whileInsideArea: ScenarioAreaDefinition;
  attackTarget: UnitTargetSelectorState;
  checkIntervalTicks?: number;
}

export type UnitOrderState =
  | {
      type: "move";
      target: GridPoint;
      followUpAttackTarget?: UnitTargetSelectorState;
      followUpWhenOutsideArea?: ScenarioAreaDefinition;
      followUpCheckIntervalTicks?: number;
    }
  | { type: "attack-move"; target: GridPoint }
  | { type: "attack-unit"; targetUnitId: string }
  | { type: "patrol"; origin: GridPoint; target: GridPoint; nextTarget: GridPoint }
  | { type: "hold-position"; anchor: GridPoint }
  | { type: "repair"; targetUnitId: string }
  | { type: "build"; building: BuildingDefinitionId; target: GridPoint; buildingUnitId?: string }
  | { type: "gather"; resourceId: string; target: GridPoint };

export interface ProductionQueueItemState {
  id: string;
  unit: UnitDefinitionId;
  remainingTicks: number;
  totalTicks: number;
}

export interface ResearchQueueItemState {
  id: string;
  research: ResearchDefinitionId;
  remainingTicks: number;
  totalTicks: number;
}

export interface CarriedResourceState {
  kind: BankResourceKind;
  amount: number;
}

export interface ConstructionState {
  remainingTicks: number;
  totalTicks: number;
  builderUnitId?: string;
}

export interface RallyPointState {
  target: GridPoint;
  mode?: "move" | "attack-move";
  resourceId?: string;
  resourceKind?: BankResourceKind;
}

export interface CombatEventState {
  id: string;
  tick: number;
  sourceUnitId: string;
  targetUnitId: string;
  sourcePlayerId: string;
  targetPlayerId: string;
  sourceKind: UnitDefinitionId;
  targetKind: UnitDefinitionId;
  sourcePosition: GridPoint;
  targetPosition: GridPoint;
  damage: number;
  killed: boolean;
}

export interface UnitState {
  id: string;
  playerId: string;
  kind: UnitDefinitionId;
  /** Ground-contact world position; rendering pivots and bounds never alter this SSOT. */
  position: GridPoint;
  movementSpeed: number;
  movementTarget?: GridPoint;
  movementPath?: GridPoint[];
  currentOrder?: UnitOrderState;
  attackCooldownTicks?: number;
  construction?: ConstructionState;
  productionQueue?: ProductionQueueItemState[];
  researchQueue?: ResearchQueueItemState[];
  scriptedBehavior?: UnitScriptedBehaviorState;
  carriedResource?: CarriedResourceState;
  rallyPoint?: RallyPointState;
  /** Optional to preserve old snapshots and all units without a registered source orientation profile. */
  sourceOrientation?: SourceOrientationState;
  /** Optional mod/legacy override; unknown ids keep the built-in idle behavior. */
  idleCombatPolicyId?: string;
  /** Optional mod/legacy override; unknown ids safely disable auto abilities. */
  autoAbilityProfileId?: string;
  /**
   * Optional product/mod attack-delivery override. The id is resolved only at
   * the simulation execution boundary against its caller-owned registry.
   */
  projectileProfileId?: string;
  health: AttributePool;
  mana: AttributePool;
}

export type PlayerTeamId = string;

export interface PlayerState {
  id: string;
  faction: FactionId;
  teamId?: PlayerTeamId;
  /** Source-aligned reset default is disabled; optional preserves old snapshots. */
  magicAutoUseEnabled?: boolean;
}

export interface PlayerResearchState {
  completed: Partial<Record<ResearchDefinitionId, boolean>>;
}

export interface PlayerCheatState {
  fastProduction?: boolean;
  invincible?: boolean;
}

export type ObjectiveStatus = "pending" | "completed" | "failed";
export type ScenarioStatus = "running" | "victory" | "defeat";

export interface ObjectiveRuntimeState {
  id: string;
  label: string;
  description: string;
  type: ScenarioObjectiveDefinition["type"];
  required: boolean;
  visibleAfterObjectiveId?: string;
  completionRequiresObjectiveIds?: string[];
  defeatOnFailure?: boolean;
  defeatDelayTicks?: number;
  playerId?: string;
  targetKind?: UnitDefinitionId;
  count?: number;
  area?: ScenarioAreaDefinition;
  routeWaypoints?: GridPoint[];
  routeWaypointLabels?: string[];
  durationTicks?: number;
  resources?: Partial<ResourceAmountSet>;
  status: ObjectiveStatus;
  completedAtTick?: number;
  failedAtTick?: number;
}

export interface ScenarioRuntimeEvent {
  id: string;
  type: "objective-completed" | "objective-failed" | "scripted-event" | "scenario-victory" | "scenario-defeat";
  tick: number;
  objectiveId?: string;
  scriptedEventId?: string;
}

export type ScriptedEventStatus = "pending" | "executed";

export interface ScriptedEventRuntimeState {
  id: string;
  sourceScript?: string;
  trigger: ScenarioTriggerDefinition;
  actions: ScenarioScriptedEventActionDefinition[];
  status: ScriptedEventStatus;
  executedAtTick?: number;
}

export interface ScenarioRuntimeState {
  id: string;
  completionMode: NonNullable<ScenarioDefinition["completionMode"]>;
  status: ScenarioStatus;
  objectives: Record<string, ObjectiveRuntimeState>;
  scriptedEvents: Record<string, ScriptedEventRuntimeState>;
  events: ScenarioRuntimeEvent[];
  endedAtTick?: number;
}

export interface WorldState {
  tick: number;
  map: MapDefinition;
  /** Stable profile id selected from scenario, map, or the built-in default. */
  pathfindingProfileId: string;
  /**
   * Stable map-selected movement-admission profile. Optional only so legacy
   * snapshots retain the established strict footprint behavior.
   */
  movementCollisionProfileId?: string;
  environment: EnvironmentState;
  scenario: ScenarioRuntimeState;
  players: Record<string, PlayerState>;
  units: Record<string, UnitState>;
  playerResources: Record<string, ResourceBank>;
  playerResearch: Record<string, PlayerResearchState>;
  playerCheats: Record<string, PlayerCheatState>;
  combatEvents: CombatEventState[];
  /** Product projectile lifecycle state; policy executables remain outside snapshots. */
  projectileSystem: ProjectileSystemState;
  /** Bounded deterministic lifecycle events for consumers such as damage and presentation. */
  projectileImpactEvents: ProjectileImpactLogEntry[];
  lastAcceptedCommand: CommandEnvelope | null;
}

export type WorldSnapshot = WorldState;
