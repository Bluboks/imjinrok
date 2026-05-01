import { unitDefinitions, type ActionDefinitionId, type FactionId, type GridPoint, type MapDefinition, type UnitDefinitionId } from "@shared";
import type { UnitState } from "@simulation";

export const SELECTED_ENTITY_CHANGED_EVENT = "selected-entity:changed";
export const SELECTED_ENTITY_REGISTRY_KEY = "selected-entity";
export const DRAG_SELECTION_CHANGED_EVENT = "drag-selection:changed";
export const VIRTUAL_CURSOR_CHANGED_EVENT = "virtual-cursor:changed";
export const VIRTUAL_CURSOR_REGISTRY_KEY = "virtual-cursor";
export const ACTION_TRIGGERED_EVENT = "action:triggered";
export const MINIMAP_NAVIGATE_EVENT = "minimap:navigate";
export const MINIMAP_MAP_CHANGED_EVENT = "minimap:map-changed";
export const MINIMAP_MAP_REGISTRY_KEY = "minimap-map";
export const MINIMAP_VIEWPORT_CHANGED_EVENT = "minimap:viewport-changed";
export const MINIMAP_VIEWPORT_REGISTRY_KEY = "minimap-viewport";
export const MINIMAP_ENTITIES_CHANGED_EVENT = "minimap:entities-changed";
export const MINIMAP_ENTITIES_REGISTRY_KEY = "minimap-entities";

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
}

export type SelectedEntitiesView = SelectedEntityView[];

export interface VirtualCursorView {
  x: number;
  y: number;
  locked: boolean;
}

export interface ActionTriggeredView {
  actionId: ActionDefinitionId;
  selectedEntityIds: string[];
}

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

export interface MinimapMapView {
  map: MapDefinition;
  worldBounds: MinimapBounds;
}

export interface MinimapViewportView {
  viewportWorldCorners: MinimapPoint[];
  worldBounds: MinimapBounds;
  zoom: number;
}

export interface MinimapEntitiesView {
  entities: MinimapEntityView[];
}

function getUnitLabel(kind: UnitDefinitionId): string {
  return unitDefinitions[kind].displayName;
}

export function toSelectedEntityView(unit: UnitState): SelectedEntityView {
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
  };

  if (unit.movementTarget) {
    view.movementTarget = { ...unit.movementTarget };
  }

  return view;
}

export function toSelectedEntitiesView(units: UnitState[]): SelectedEntitiesView {
  return units.map((unit) => toSelectedEntityView(unit));
}
