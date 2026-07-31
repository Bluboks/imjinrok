import { unitDefinitions, type ActionDefinitionId, type DayPhase, type FactionId, type GridPoint, type MapDefinition, type ResearchDefinitionId, type ResourceAmountSet, type UnitDefinitionId, type WeatherKind } from "@shared";
import type { CarriedResourceState, ConstructionState, DemolitionState, PlayerPopulationState, PlayerVisibilityState, ProductionQueueItemState, RallyPointState, ResearchQueueItemState, UnitOrderState, UnitState } from "@simulation";
import type { UiDomainAction } from "./ui/objectiveModalActions.js";
import type { GameSpeedPreset } from "./gameplayPreferences.js";

export const SELECTED_ENTITY_CHANGED_EVENT = "selected-entity:changed";
export const SELECTED_ENTITY_REGISTRY_KEY = "selected-entity";
export const DRAG_SELECTION_CHANGED_EVENT = "drag-selection:changed";
export const VIRTUAL_CURSOR_CHANGED_EVENT = "virtual-cursor:changed";
export const VIRTUAL_CURSOR_REGISTRY_KEY = "virtual-cursor";
export const ACTION_TRIGGERED_EVENT = "action:triggered";
export const UI_DOMAIN_ACTION_REQUESTED_EVENT = "ui-domain-action:requested";
export const MINIMAP_NAVIGATE_EVENT = "minimap:navigate";
export const MINIMAP_ZOOM_REQUESTED_EVENT = "minimap:zoom-requested";
export const MINIMAP_MAP_CHANGED_EVENT = "minimap:map-changed";
export const MINIMAP_MAP_REGISTRY_KEY = "minimap-map";
export const MINIMAP_VIEWPORT_CHANGED_EVENT = "minimap:viewport-changed";
export const MINIMAP_VIEWPORT_REGISTRY_KEY = "minimap-viewport";
export const MINIMAP_ENTITIES_CHANGED_EVENT = "minimap:entities-changed";
export const MINIMAP_ENTITIES_REGISTRY_KEY = "minimap-entities";
export const MINIMAP_RESOURCES_CHANGED_EVENT = "minimap:resources-changed";
export const MINIMAP_RESOURCES_REGISTRY_KEY = "minimap-resources";
export const MINIMAP_VISIBILITY_CHANGED_EVENT = "minimap:visibility-changed";
export const MINIMAP_VISIBILITY_REGISTRY_KEY = "minimap-visibility";
export const MINIMAP_AVAILABILITY_CHANGED_EVENT = "minimap:availability-changed";
export const MINIMAP_AVAILABILITY_REGISTRY_KEY = "minimap-availability";
export const MINIMAP_ALERT_EVENT = "minimap:alert";
export const PLAYER_ECONOMY_CHANGED_EVENT = "player-economy:changed";
export const PLAYER_ECONOMY_REGISTRY_KEY = "player-economy";
export const BATTLEFIELD_SUMMARY_CHANGED_EVENT = "battlefield-summary:changed";
export const BATTLEFIELD_SUMMARY_REGISTRY_KEY = "battlefield-summary";
export const BATTLEFIELD_SUMMARY_ACTION_EVENT = "battlefield-summary:action";
export const GAME_PLAYBACK_CHANGED_EVENT = "game-playback:changed";
export const GAME_PLAYBACK_REGISTRY_KEY = "game-playback";
export const GAME_PLAYBACK_CONTROL_EVENT = "game-playback:control";
export const MAGIC_AUTO_USE_CHANGED_EVENT = "magic-auto-use:changed";
export const MAGIC_AUTO_USE_REGISTRY_KEY = "magic-auto-use";
export const MAGIC_AUTO_USE_REQUESTED_EVENT = "magic-auto-use:requested";

export interface SelectedEntityView {
  id: string;
  playerId: string;
  label: string;
  kind: UnitDefinitionId;
  position: GridPoint;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  movementSpeed: number;
  movementTarget?: GridPoint;
  currentOrder?: UnitOrderView;
  productionQueue?: ProductionQueueItemView[];
  researchQueue?: ResearchQueueItemView[];
  construction?: ConstructionView;
  demolition?: DemolitionView;
  carriedResource?: CarriedResourceView;
  rallyPoint?: RallyPointView;
  portrait?: SelectedEntityPortraitView;
}

/** Serializable theme-selected image data for a selection-panel entity. */
export interface SelectedEntityPortraitView {
  textureKey: string;
  frameName?: string;
  mirrorX: boolean;
}

export interface ProductionQueueItemView {
  id: string;
  unit: ProductionQueueItemState["unit"];
  remainingTicks: number;
  totalTicks: number;
}

export interface ResearchQueueItemView {
  id: string;
  research: ResearchQueueItemState["research"];
  remainingTicks: number;
  totalTicks: number;
}

export interface CarriedResourceView {
  kind: CarriedResourceState["kind"];
  amount: number;
}

export interface ConstructionView {
  remainingTicks: ConstructionState["remainingTicks"];
  totalTicks: ConstructionState["totalTicks"];
}

export interface DemolitionView {
  progress: DemolitionState["progress"];
  phase: DemolitionState["phase"];
}

export interface RallyPointView {
  target: RallyPointState["target"];
  mode?: RallyPointState["mode"];
  resourceId?: string;
}

export type UnitOrderView = UnitOrderState;

export interface PlayerEconomyView {
  playerId: string;
  resources: ResourceAmountSet;
  population: PlayerPopulationState;
  research: {
    completed: ResearchDefinitionId[];
    pending: ResearchDefinitionId[];
  };
}

export interface BattlefieldSideSummaryView {
  units: number;
  workers: number;
  idleWorkers: number;
  fighters: number;
  buildings: number;
}

export interface BattlefieldEnvironmentView {
  weather: WeatherKind;
  dayPhase: DayPhase;
  timeOfDay01: number;
}

export interface BattlefieldSummaryView {
  playerId: string;
  local: BattlefieldSideSummaryView;
  visibleEnemy: BattlefieldSideSummaryView;
  environment: BattlefieldEnvironmentView;
}

export interface BattlefieldSummaryActionView {
  type: "select-idle-worker";
}

export interface GamePlaybackView {
  paused: boolean;
  speed: number;
  speedPreset?: GameSpeedPreset;
  controllable: boolean;
  audioMuted: boolean;
}

export interface GamePlaybackControlView {
  type: "toggle-audio" | "toggle-pause" | "speed-down" | "speed-up";
}

/** Serializable player-global automation state carried through the HUD bridge. */
export interface MagicAutoUseView {
  playerId: string;
  enabled: boolean;
}

/** Typed UI-to-game command request; it deliberately has no selected-unit id. */
export interface MagicAutoUseRequestedView {
  enabled: boolean;
  source: "button";
}

/** Missing legacy snapshot state is the source-aligned disabled product default. */
export function createMagicAutoUseView(playerId: string, enabled: boolean | undefined): MagicAutoUseView {
  return { playerId, enabled: enabled === true };
}

export type ActionTriggerSource = "button" | "hotkey";

export type SelectedEntitiesView = SelectedEntityView[];

export interface VirtualCursorView {
  x: number;
  y: number;
  locked: boolean;
}

export interface ActionTriggeredView {
  actionId: ActionDefinitionId;
  selectedEntityIds: string[];
  source: ActionTriggerSource;
}

export type UiDomainActionRequestedView = UiDomainAction<string, object>;

export interface DragSelectionView {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MinimapPoint {
  x: number;
  y: number;
}

export interface MinimapBounds extends MinimapPoint {
  width: number;
  height: number;
}

export interface MinimapEntityView {
  id: string;
  playerId: string;
  faction: FactionId;
  kind: UnitDefinitionId;
  position: GridPoint;
  selected: boolean;
}

export interface MinimapResourceView {
  id: string;
  kind: string;
  position: GridPoint;
  visible: boolean;
}

export interface MinimapMapView {
  map: MapDefinition;
  worldBounds: MinimapBounds;
}

export interface MinimapViewportView {
  viewportWorldCorners: MinimapPoint[];
  worldBounds: MinimapBounds;
  zoom: number;
}

/** Typed UI request; the game scene remains the sole camera owner. */
export interface MinimapZoomRequestedView {
  direction: -1 | 1;
  source: "rail-button";
}

export interface MinimapEntitiesView {
  entities: MinimapEntityView[];
}

export interface MinimapResourcesView {
  resources: MinimapResourceView[];
}

export type MinimapVisibilityView = PlayerVisibilityState;

/** UI-facing presentation/input state, evaluated from the selected map policy. */
export interface MinimapAvailabilityView {
  enabled: boolean;
}

export function createMinimapAvailabilityView(enabled: boolean): MinimapAvailabilityView {
  return { enabled };
}

export interface MinimapAlertView {
  id: string;
  kind: "under-attack";
  severity: "normal" | "critical";
  position: GridPoint;
}

function getUnitLabel(kind: UnitDefinitionId): string {
  return unitDefinitions[kind].displayName;
}

export function toSelectedEntityView(unit: UnitState, portrait?: SelectedEntityPortraitView): SelectedEntityView {
  const view: SelectedEntityView = {
    id: unit.id,
    playerId: unit.playerId,
    label: getUnitLabel(unit.kind),
    kind: unit.kind,
    position: { ...unit.position },
    hp: unit.health.current,
    maxHp: unit.health.max,
    mana: unit.mana.current,
    maxMana: unit.mana.max,
    movementSpeed: unit.movementSpeed,
    ...(portrait
      ? {
        portrait: {
          textureKey: portrait.textureKey,
          ...(portrait.frameName === undefined ? {} : { frameName: portrait.frameName }),
          mirrorX: portrait.mirrorX,
        },
      }
      : {}),
  };

  if (unit.movementTarget) {
    view.movementTarget = { ...unit.movementTarget };
  }

  if (unit.currentOrder) {
    view.currentOrder = structuredClone(unit.currentOrder);
  }

  if (unit.productionQueue && unit.productionQueue.length > 0) {
    view.productionQueue = unit.productionQueue.map((item) => ({ ...item }));
  }

  if (unit.researchQueue && unit.researchQueue.length > 0) {
    view.researchQueue = unit.researchQueue.map((item) => ({ ...item }));
  }

  if (unit.construction) {
    view.construction = {
      remainingTicks: unit.construction.remainingTicks,
      totalTicks: unit.construction.totalTicks,
    };
  }

  if (unit.demolition) {
    view.demolition = {
      progress: unit.demolition.progress,
      phase: unit.demolition.phase,
    };
  }

  if (unit.carriedResource && unit.carriedResource.amount > 0) {
    view.carriedResource = { ...unit.carriedResource };
  }

  if (unit.rallyPoint) {
    view.rallyPoint = {
      target: { ...unit.rallyPoint.target },
      ...(unit.rallyPoint.mode ? { mode: unit.rallyPoint.mode } : {}),
      ...(unit.rallyPoint.resourceId ? { resourceId: unit.rallyPoint.resourceId } : {}),
    };
  }

  return view;
}

export function toSelectedEntitiesView(units: UnitState[]): SelectedEntitiesView {
  return units.map((unit) => toSelectedEntityView(unit));
}
