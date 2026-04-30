import type { GridPoint } from "@shared";
import type { UnitState } from "@simulation";

export const SELECTED_ENTITY_CHANGED_EVENT = "selected-entity:changed";
export const SELECTED_ENTITY_REGISTRY_KEY = "selected-entity";
export const VIRTUAL_CURSOR_CHANGED_EVENT = "virtual-cursor:changed";
export const VIRTUAL_CURSOR_REGISTRY_KEY = "virtual-cursor";

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
