import Phaser from "phaser";
import { actionDefinitions, researchDefinitions, unitCanPerformAction, unitDefinitions, type ActionDefinitionId, type BankResourceKind, type ResearchDefinition, type ResearchDefinitionId, type UnitDefinition, type UnitDefinitionId } from "@shared";
import type { ActionTriggerSource, PlayerEconomyView, SelectedEntitiesView } from "../hud.js";
import {
  findResolvedOriginalGameplayCommandGridSlot,
  type ResolvedOriginalGameplayCommandGridLayout,
} from "../originalGameplayCommandGridLayout.js";
import { drawPanelFrame, HUD_TEXT_STYLE, type PanelBounds } from "./hudPanel.js";

export interface HudActionSlot {
  actionId?: ActionDefinitionId;
  icon: string;
  hotkey: string;
  label: string;
  enabled: boolean;
  disabledReason?: string;
}

export type HudActionHandler = (actionId: ActionDefinitionId, source: ActionTriggerSource) => void;

export interface ActionGridSlotRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const TRAIN_ACTION_UNITS: Partial<Record<ActionDefinitionId, UnitDefinitionId>> = {
  "train-villager": "villager",
  "train-swordsman": "swordsman",
  "train-archer": "archer",
};

const BUILD_ACTION_BUILDINGS: Partial<Record<ActionDefinitionId, UnitDefinitionId>> = {
  build: "house",
  "build-town-center": "town-center",
  "build-barracks": "barracks",
  "build-beacon": "beacon",
};

const RESEARCH_ACTIONS: Partial<Record<ActionDefinitionId, ResearchDefinitionId>> = {
  "research-loom": "loom",
};

const MAX_PRODUCTION_QUEUE_SIZE = 5;

const SUPPORTED_ACTION_IDS = new Set<ActionDefinitionId>([
  "move",
  "gather",
  "build",
  "build-town-center",
  "build-barracks",
  "build-beacon",
  "stop",
  "attack-move",
  "patrol",
  "repair",
  "hold",
  "train-villager",
  "train-swordsman",
  "train-archer",
  "cancel-production",
  "cancel-construction",
  "rally-point",
  "research-loom",
  "set-gather",
  "town-bell",
]);

export function drawActionGrid(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  graphics: Phaser.GameObjects.Graphics,
  bounds: PanelBounds,
  selectedEntities: SelectedEntitiesView,
  playerEconomy: PlayerEconomyView | null,
  onAction?: HudActionHandler,
  originalLayout?: ResolvedOriginalGameplayCommandGridLayout,
): void {
  const { x, y, width, height } = bounds;
  drawPanelFrame(scene, container, graphics, bounds, "명령");

  const actions = getActionSlots(selectedEntities, playerEconomy);
  const slotRects = resolveActionGridSlotRects(bounds, originalLayout);

  for (const [index, slot] of slotRects.entries()) {
    const action = actions[index];

    if (!action) {
      continue;
    }

    const { x: slotX, y: slotY, width: renderedSlotWidth, height: renderedSlotHeight } = slot;
    const fillColor = action.enabled ? 0x1a3034 : 0x0c1618;
    const strokeColor = action.enabled ? 0xb89e5e : 0x31474b;

    graphics.fillStyle(fillColor, action.enabled ? 0.98 : 0.62);
    graphics.fillRoundedRect(slotX, slotY, renderedSlotWidth, renderedSlotHeight, 9);
    graphics.lineStyle(1, strokeColor, action.enabled ? 0.9 : 0.45);
    graphics.strokeRoundedRect(slotX, slotY, renderedSlotWidth, renderedSlotHeight, 9);

    if (!action.enabled) {
      graphics.lineStyle(1, 0x23373b, 0.65);
      graphics.lineBetween(slotX + 8, slotY + renderedSlotHeight - 8, slotX + renderedSlotWidth - 8, slotY + 8);
    }

    if (action.enabled && action.actionId && onAction) {
      const hitZone = scene.add
        .zone(slotX, slotY, renderedSlotWidth, renderedSlotHeight)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });

      if (originalLayout) {
        hitZone.on("pointerup", (pointer: Phaser.Input.Pointer) => {
          if (findResolvedOriginalGameplayCommandGridSlot(originalLayout, pointer.x, pointer.y) === index) {
            onAction(action.actionId as ActionDefinitionId, "button");
          }
        });
      } else {
        hitZone.on("pointerup", () => onAction(action.actionId as ActionDefinitionId, "button"));
      }

      container.add(hitZone);
    }

    container.add(scene.add
      .text(slotX + renderedSlotWidth / 2, slotY + 10, action.icon, {
        fontFamily: "Georgia, Times New Roman, serif",
        fontSize: "20px",
        color: action.enabled ? "#f1dfaa" : "#6d817a",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0));
    container.add(scene.add
      .text(slotX + renderedSlotWidth / 2, slotY + renderedSlotHeight - 24, action.label, {
        ...HUD_TEXT_STYLE,
        fontSize: "10px",
        color: action.enabled ? "#cfe0d4" : "#718980",
        align: "center",
        wordWrap: { width: renderedSlotWidth - 10 },
      })
      .setOrigin(0.5, 0));
    container.add(scene.add.text(slotX + 7, slotY + 5, action.hotkey, {
      ...HUD_TEXT_STYLE,
      fontSize: "10px",
      color: action.enabled ? "#7f9b91" : "#4e6660",
    }));

    if (!action.enabled && action.disabledReason) {
      container.add(scene.add
        .text(slotX + renderedSlotWidth / 2, slotY + renderedSlotHeight - 11, action.disabledReason, {
          ...HUD_TEXT_STYLE,
          fontSize: "9px",
          color: "#8aa69b",
          align: "center",
          wordWrap: { width: renderedSlotWidth - 10 },
        })
        .setOrigin(0.5, 0));
    }
  }
}

export function resolveActionGridSlotRects(
  bounds: PanelBounds,
  originalLayout?: ResolvedOriginalGameplayCommandGridLayout,
): readonly ActionGridSlotRect[] {
  if (originalLayout) {
    return originalLayout.slots.slice(0, 9);
  }

  const columns = 4;
  const rows = 3;
  const gap = 8;
  const gridX = bounds.x + 14;
  const gridY = bounds.y + 46;
  const slotWidth = (bounds.width - 28 - gap * (columns - 1)) / columns;
  const slotHeight = (bounds.height - 60 - gap * (rows - 1)) / rows;

  return Array.from({ length: columns * rows }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      x: gridX + column * (slotWidth + gap),
      y: gridY + row * (slotHeight + gap),
      width: slotWidth,
      height: slotHeight,
    };
  });
}

export function getActionSlots(selectedEntities: SelectedEntitiesView, playerEconomy: PlayerEconomyView | null): HudActionSlot[] {
  const emptySlot = (): HudActionSlot => ({ icon: "", hotkey: "", label: "", enabled: false });
  const slots = Array.from({ length: 12 }, emptySlot);

  if (selectedEntities.length === 0) {
    return slots;
  }

  const actionIds = getSelectionActionIds(selectedEntities);
  const actions = actionIds.map((actionId) => toHudActionSlot(actionId, selectedEntities, playerEconomy));

  actions.forEach((action, index) => {
    slots[index] = action;
  });

  return slots;
}

export function getEnabledActionForHotkey(
  hotkey: string,
  selectedEntities: SelectedEntitiesView,
  playerEconomy: PlayerEconomyView | null,
): ActionDefinitionId | null {
  const normalizedHotkey = hotkey.toUpperCase();
  const slot = getActionSlots(selectedEntities, playerEconomy).find((action) =>
    action.enabled &&
    action.actionId !== undefined &&
    action.hotkey.toUpperCase() === normalizedHotkey,
  );

  return slot?.actionId ?? null;
}

function getSelectionActionIds(selectedEntities: SelectedEntitiesView): readonly ActionDefinitionId[] {
  if (selectedEntities.length > 0 && selectedEntities.every((selection) => selection.construction)) {
    return ["cancel-construction", "stop"];
  }

  const actionSource =
    selectedEntities.find((selection) => unitCanPerformAction(selection.kind, "build")) ??
    selectedEntities.find((selection) => unitCanPerformAction(selection.kind, "gather")) ??
    selectedEntities.find((selection) => unitCanPerformAction(selection.kind, "move")) ??
    selectedEntities.find((selection) => !selection.construction) ??
    selectedEntities[0];

  return actionSource ? unitDefinitions[actionSource.kind].actionIds : [];
}

function toHudActionSlot(
  actionId: ActionDefinitionId,
  selectedEntities: SelectedEntitiesView,
  playerEconomy: PlayerEconomyView | null,
): HudActionSlot {
  const action = actionDefinitions[actionId];

  return {
    actionId,
    icon: action.icon,
    hotkey: action.hotkey,
    label: action.label,
    ...getActionAvailability(actionId, selectedEntities, playerEconomy),
  };
}

function getActionAvailability(
  actionId: ActionDefinitionId,
  selectedEntities: SelectedEntitiesView,
  playerEconomy: PlayerEconomyView | null,
): Pick<HudActionSlot, "enabled" | "disabledReason"> {
  if (!SUPPORTED_ACTION_IDS.has(actionId)) {
    return { enabled: false, disabledReason: "예정" };
  }

  if (actionId === "cancel-production") {
    const hasQueue = selectedEntities.some((selection) => (
      !selection.construction &&
      unitCanPerformAction(selection.kind, "cancel-production") &&
      ((selection.productionQueue?.length ?? 0) > 0 || (selection.researchQueue?.length ?? 0) > 0)
    ));

    return hasQueue ? { enabled: true } : { enabled: false, disabledReason: "없음" };
  }

  if (actionId === "cancel-construction") {
    const hasConstruction = selectedEntities.some((selection) => selection.construction);

    return hasConstruction ? { enabled: true } : { enabled: false, disabledReason: "없음" };
  }

  const trainUnit = TRAIN_ACTION_UNITS[actionId];

  if (trainUnit && playerEconomy) {
    const trainSources = getActiveActionSources(selectedEntities, actionId);

    if (trainSources.length === 0) {
      return getNoActiveSourceAvailability(selectedEntities, actionId);
    }

    const availableSource = trainSources.find((selection) =>
      (selection.researchQueue?.length ?? 0) === 0 &&
      (selection.productionQueue?.length ?? 0) < MAX_PRODUCTION_QUEUE_SIZE,
    );

    if (!availableSource) {
      const allResearching = trainSources.every((selection) => (selection.researchQueue?.length ?? 0) > 0);

      return { enabled: false, disabledReason: allResearching ? "진행중" : "가득참" };
    }

    if (!canAfford(playerEconomy, trainUnit)) {
      return { enabled: false, disabledReason: "자원" };
    }

    if (!canFitPopulation(playerEconomy, trainUnit)) {
      return { enabled: false, disabledReason: "인구" };
    }

    return { enabled: true };
  }

  const research = RESEARCH_ACTIONS[actionId];

  if (research && playerEconomy) {
    const definition = researchDefinitions[research] as ResearchDefinition;
    const researchSources = getActiveActionSources(selectedEntities, actionId)
      .filter((selection) => (definition.sourceBuildings as readonly UnitDefinitionId[]).includes(selection.kind));

    if (researchSources.length === 0) {
      return getNoActiveSourceAvailability(selectedEntities, actionId);
    }

    if (playerEconomy.research.completed.includes(research)) {
      return { enabled: false, disabledReason: "완료" };
    }

    if (playerEconomy.research.pending.includes(research)) {
      return { enabled: false, disabledReason: "진행중" };
    }

    const availableSource = researchSources.find((selection) =>
      (selection.productionQueue?.length ?? 0) === 0 &&
      (selection.researchQueue?.length ?? 0) === 0,
    );

    if (!availableSource) {
      return { enabled: false, disabledReason: "진행중" };
    }

    if (!canAffordResearch(playerEconomy, research)) {
      return { enabled: false, disabledReason: "자원" };
    }

    return { enabled: true };
  }

  const building = BUILD_ACTION_BUILDINGS[actionId];

  if (building) {
    if (getActiveActionSources(selectedEntities, actionId).length === 0) {
      return getNoActiveSourceAvailability(selectedEntities, actionId);
    }

    if (playerEconomy && !canAfford(playerEconomy, building)) {
      return { enabled: false, disabledReason: "자원" };
    }

    return { enabled: true };
  }

  if (getActiveActionSources(selectedEntities, actionId, { includeConstruction: actionId === "stop" }).length === 0) {
    return getNoActiveSourceAvailability(selectedEntities, actionId);
  }

  return { enabled: true };
}

function getActiveActionSources(
  selectedEntities: SelectedEntitiesView,
  actionId: ActionDefinitionId,
  options?: { includeConstruction?: boolean },
): SelectedEntitiesView {
  return selectedEntities.filter((selection) =>
    (options?.includeConstruction || !selection.construction) &&
    unitCanPerformAction(selection.kind, actionId),
  );
}

function getNoActiveSourceAvailability(
  selectedEntities: SelectedEntitiesView,
  actionId: ActionDefinitionId,
): Pick<HudActionSlot, "enabled" | "disabledReason"> {
  const hasConstructingSource = selectedEntities.some((selection) =>
    selection.construction &&
    unitCanPerformAction(selection.kind, actionId),
  );

  return { enabled: false, disabledReason: hasConstructingSource ? "건설중" : "불가" };
}

function canAffordResearch(playerEconomy: PlayerEconomyView, research: ResearchDefinitionId): boolean {
  return Object.entries((researchDefinitions[research] as ResearchDefinition).cost).every(([resource, amount]) => {
    const kind = resource as BankResourceKind;
    return playerEconomy.resources[kind] >= (amount ?? 0);
  });
}

function canAfford(playerEconomy: PlayerEconomyView, unit: UnitDefinitionId): boolean {
  return Object.entries((unitDefinitions[unit] as UnitDefinition).cost ?? {}).every(([resource, amount]) => {
    const kind = resource as BankResourceKind;
    return playerEconomy.resources[kind] >= (amount ?? 0);
  });
}

function canFitPopulation(playerEconomy: PlayerEconomyView, unit: UnitDefinitionId): boolean {
  const populationCost = (unitDefinitions[unit] as UnitDefinition).populationCost ?? 0;

  return populationCost <= 0 || playerEconomy.population.available >= populationCost;
}
