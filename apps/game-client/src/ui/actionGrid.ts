import Phaser from "phaser";
import { actionDefinitions, unitCanPerformAction, unitDefinitions, type ActionDefinitionId } from "@shared";
import type { SelectedEntitiesView } from "../hud.js";
import { drawPanelFrame, HUD_TEXT_STYLE, type PanelBounds } from "./hudPanel.js";

interface HudActionSlot {
  actionId?: ActionDefinitionId;
  icon: string;
  hotkey: string;
  label: string;
  enabled: boolean;
}

export type HudActionHandler = (actionId: ActionDefinitionId) => void;

export function drawActionGrid(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  graphics: Phaser.GameObjects.Graphics,
  bounds: PanelBounds,
  selectedEntities: SelectedEntitiesView,
  onAction?: HudActionHandler,
): void {
  const { x, y, width, height } = bounds;
  drawPanelFrame(scene, container, graphics, bounds, "ACTIONS");

  const columns = 4;
  const rows = 3;
  const gap = 8;
  const gridX = x + 14;
  const gridY = y + 46;
  const slotWidth = (width - 28 - gap * (columns - 1)) / columns;
  const slotHeight = (height - 60 - gap * (rows - 1)) / rows;
  const actions = getActionSlots(selectedEntities);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      const action = actions[index];

      if (!action) {
        continue;
      }

      const slotX = gridX + column * (slotWidth + gap);
      const slotY = gridY + row * (slotHeight + gap);
      const fillColor = action.enabled ? 0x1a3034 : 0x0c1618;
      const strokeColor = action.enabled ? 0xb89e5e : 0x31474b;

      graphics.fillStyle(fillColor, action.enabled ? 0.98 : 0.62);
      graphics.fillRoundedRect(slotX, slotY, slotWidth, slotHeight, 9);
      graphics.lineStyle(1, strokeColor, action.enabled ? 0.9 : 0.45);
      graphics.strokeRoundedRect(slotX, slotY, slotWidth, slotHeight, 9);

      if (!action.enabled) {
        graphics.lineStyle(1, 0x23373b, 0.65);
        graphics.lineBetween(slotX + 8, slotY + slotHeight - 8, slotX + slotWidth - 8, slotY + 8);
        continue;
      }

      if (action.actionId && onAction) {
        const hitZone = scene.add
          .zone(slotX, slotY, slotWidth, slotHeight)
          .setOrigin(0, 0)
          .setInteractive({ useHandCursor: true })
          .on("pointerup", () => onAction(action.actionId as ActionDefinitionId));

        container.add(hitZone);
      }

      container.add(scene.add
        .text(slotX + slotWidth / 2, slotY + 10, action.icon, {
          fontFamily: "Georgia, Times New Roman, serif",
          fontSize: "20px",
          color: "#f1dfaa",
          fontStyle: "bold",
        })
        .setOrigin(0.5, 0));
      container.add(scene.add
        .text(slotX + slotWidth / 2, slotY + slotHeight - 24, action.label, {
          ...HUD_TEXT_STYLE,
          fontSize: "10px",
          color: "#cfe0d4",
          align: "center",
          wordWrap: { width: slotWidth - 10 },
        })
        .setOrigin(0.5, 0));
      container.add(scene.add.text(slotX + 7, slotY + 5, action.hotkey, {
        ...HUD_TEXT_STYLE,
        fontSize: "10px",
        color: "#7f9b91",
      }));
    }
  }
}

function getActionSlots(selectedEntities: SelectedEntitiesView): HudActionSlot[] {
  const emptySlot = (): HudActionSlot => ({ icon: "", hotkey: "", label: "", enabled: false });
  const slots = Array.from({ length: 12 }, emptySlot);

  if (selectedEntities.length === 0) {
    return slots;
  }

  const actionIds = getSelectionActionIds(selectedEntities);
  const actions = actionIds.map((actionId) => toHudActionSlot(actionId));

  actions.forEach((action, index) => {
    slots[index] = action;
  });

  return slots;
}

function getSelectionActionIds(selectedEntities: SelectedEntitiesView): readonly ActionDefinitionId[] {
  const workerSelection = selectedEntities.find((selection) => unitCanPerformAction(selection.kind, "move"));
  const actionSource = workerSelection ?? selectedEntities[0];

  return actionSource ? unitDefinitions[actionSource.kind].actionIds : [];
}

function toHudActionSlot(actionId: ActionDefinitionId): HudActionSlot {
  const action = actionDefinitions[actionId];

  return {
    actionId,
    icon: action.icon,
    hotkey: action.hotkey,
    label: action.label,
    enabled: true,
  };
}
