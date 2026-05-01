import type { GridPoint, MapDefinition } from "@shared";
import type { UnitState } from "@simulation";

export const SELECTED_ENTITY_CHANGED_EVENT = "selected-entity:changed";
export const SELECTED_ENTITY_REGISTRY_KEY = "selected-entity";
export const DRAG_SELECTION_CHANGED_EVENT = "drag-selection:changed";
export const VIRTUAL_CURSOR_CHANGED_EVENT = "virtual-cursor:changed";
export const VIRTUAL_CURSOR_REGISTRY_KEY = "virtual-cursor";
export const MINIMAP_STATE_CHANGED_EVENT = "minimap:state-changed";
export const MINIMAP_STATE_REGISTRY_KEY = "minimap-state";
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
  kind: UnitState["kind"];
  position: GridPoint;
  hp: number;
  maxHp: number;
}

export type SelectedEntitiesView = SelectedEntityView[];

export interface VirtualCursorView {
  x: number;
  y: number;
  locked: boolean;
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
  kind: UnitState["kind"];
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

export interface MinimapStateView {
  map: MapDefinition;
  entities: MinimapEntityView[];
  viewportWorldCorners: MinimapPoint[];
  worldBounds: MinimapBounds;
  zoom: number;
}

function getUnitLabel(kind: UnitState["kind"]): string {
  switch (kind) {
    case "town-center":
      return "Town Center";
    case "villager":
      return "Villager";
  }
}

function getUnitMaxHp(kind: UnitState["kind"]): number {
  switch (kind) {
    case "town-center":
      return 2400;
    case "villager":
      return 25;
  }
}

export function toSelectedEntityView(unit: UnitState): SelectedEntityView {
  return {
    id: unit.id,
    playerId: unit.playerId,
    label: getUnitLabel(unit.kind),
    kind: unit.kind,
    position: { ...unit.position },
    hp: unit.hp,
    maxHp: getUnitMaxHp(unit.kind),
  };
}

export function toSelectedEntitiesView(units: UnitState[]): SelectedEntitiesView {
  return units.map((unit) => toSelectedEntityView(unit));
}
