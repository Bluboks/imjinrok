import Phaser from "phaser";
import { unitDefinitions } from "@shared";
import type { SelectedEntitiesView, SelectedEntityView } from "../hud.js";
import { drawPanelFrame, HUD_TEXT_STYLE, type PanelBounds } from "./hudPanel.js";

export function drawSelectionPanel(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  graphics: Phaser.GameObjects.Graphics,
  bounds: PanelBounds,
  selectedEntities: SelectedEntitiesView,
): void {
  const { x, y, width, height } = bounds;
  drawPanelFrame(scene, container, graphics, bounds, "SELECTED ENTITIES");

  if (selectedEntities.length === 0) {
    container.add(
      scene.add
        .text(x + width / 2, y + height / 2 + 8, "No entity selected\nLeft-click or drag-select units", {
          ...HUD_TEXT_STYLE,
          fontSize: "17px",
          color: "#8aa69b",
          align: "center",
          lineSpacing: 6,
        })
        .setOrigin(0.5),
    );
    return;
  }

  if (selectedEntities.length > 1) {
    drawGroupSelectionInfo(scene, container, graphics, bounds, selectedEntities);
    return;
  }

  const selectedEntity = selectedEntities[0];

  if (!selectedEntity) {
    return;
  }

  const portraitSize = Phaser.Math.Clamp(height - 82, 72, 106);
  const portraitX = x + 20;
  const portraitY = y + 50;
  const textX = portraitX + portraitSize + 18;
  const healthRatio = Phaser.Math.Clamp(selectedEntity.hp / selectedEntity.maxHp, 0, 1);
  const manaRatio = selectedEntity.maxMana > 0 ? Phaser.Math.Clamp(selectedEntity.mana / selectedEntity.maxMana, 0, 1) : 0;
  const healthBarWidth = Math.max(120, width - (textX - x) - 24);
  const movementStatus = selectedEntity.movementTarget ? "Moving" : "Idle";

  graphics.fillStyle(0x152a2e, 1);
  graphics.fillRoundedRect(portraitX, portraitY, portraitSize, portraitSize, 10);
  graphics.lineStyle(2, 0xd0b46a, 0.85);
  graphics.strokeRoundedRect(portraitX, portraitY, portraitSize, portraitSize, 10);
  graphics.fillStyle(unitDefinitions[selectedEntity.kind].portraitColor, 0.28);
  graphics.fillCircle(portraitX + portraitSize / 2, portraitY + portraitSize / 2, portraitSize * 0.35);

  container.add(
    scene.add
      .text(portraitX + portraitSize / 2, portraitY + portraitSize / 2, getPortraitGlyph(selectedEntity), {
        fontFamily: "Georgia, Times New Roman, serif",
        fontSize: `${Math.floor(portraitSize * 0.28)}px`,
        color: "#f4ead1",
        fontStyle: "bold",
      })
      .setOrigin(0.5),
  );

  container.add(scene.add.text(textX, portraitY, selectedEntity.label.toUpperCase(), {
    fontFamily: "Georgia, Times New Roman, serif",
    fontSize: "24px",
    color: "#f4ead1",
  }));
  container.add(scene.add.text(textX, portraitY + 36, [
    `Owner: ${selectedEntity.playerId}`,
    `Grid: ${selectedEntity.position.x.toFixed(1)}, ${selectedEntity.position.y.toFixed(1)}`,
    `Speed: ${selectedEntity.movementSpeed.toFixed(1)}`,
    movementStatus,
  ].join("  ·  "), { ...HUD_TEXT_STYLE, color: "#a5beb5" }));

  graphics.fillStyle(0x071012, 1);
  graphics.fillRoundedRect(textX, portraitY + 66, healthBarWidth, 12, 6);
  graphics.fillStyle(healthRatio > 0.35 ? 0x75b46f : 0xd36b52, 1);
  graphics.fillRoundedRect(textX + 2, portraitY + 68, Math.max(8, (healthBarWidth - 4) * healthRatio), 8, 4);
  graphics.lineStyle(1, 0x29474c, 1);
  graphics.strokeRoundedRect(textX, portraitY + 66, healthBarWidth, 12, 6);

  graphics.fillStyle(0x071012, 1);
  graphics.fillRoundedRect(textX, portraitY + 82, healthBarWidth, 10, 5);
  if (selectedEntity.maxMana > 0) {
    graphics.fillStyle(0x4d7fcb, 1);
    graphics.fillRoundedRect(textX + 2, portraitY + 84, Math.max(6, (healthBarWidth - 4) * manaRatio), 6, 3);
  }
  graphics.lineStyle(1, 0x29474c, 1);
  graphics.strokeRoundedRect(textX, portraitY + 82, healthBarWidth, 10, 5);

  container.add(scene.add.text(textX, portraitY + 98, `HP ${Math.round(selectedEntity.hp)} / ${selectedEntity.maxHp} · MP ${Math.round(selectedEntity.mana)} / ${selectedEntity.maxMana}`, {
    ...HUD_TEXT_STYLE,
    fontSize: "12px",
    color: "#dbe9d3",
  }));
}

function drawGroupSelectionInfo(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  graphics: Phaser.GameObjects.Graphics,
  bounds: PanelBounds,
  selectedEntities: SelectedEntitiesView,
): void {
  const { x, y, width, height } = bounds;
  const villagerCount = selectedEntities.filter((selection) => unitDefinitions[selection.kind].category === "worker").length;
  const buildingCount = selectedEntities.filter((selection) => unitDefinitions[selection.kind].category === "building").length;
  const totalHp = selectedEntities.reduce((sum, selection) => sum + selection.hp, 0);
  const totalMaxHp = selectedEntities.reduce((sum, selection) => sum + selection.maxHp, 0);
  const totalMana = selectedEntities.reduce((sum, selection) => sum + selection.mana, 0);
  const totalMaxMana = selectedEntities.reduce((sum, selection) => sum + selection.maxMana, 0);
  const chipSize = Phaser.Math.Clamp((width - 54) / 8, 30, 44);
  const chipY = y + 108;

  container.add(scene.add.text(x + 22, y + 54, `${selectedEntities.length} ENTITIES SELECTED`, {
    fontFamily: "Georgia, Times New Roman, serif",
    fontSize: "24px",
    color: "#f4ead1",
  }));
  container.add(scene.add.text(x + 24, y + 88, `Villagers: ${villagerCount}  ·  Buildings: ${buildingCount}`, {
    ...HUD_TEXT_STYLE,
    color: "#a5beb5",
  }));

  selectedEntities.slice(0, 8).forEach((selection, index) => {
    const chipX = x + 22 + index * (chipSize + 6);

    graphics.fillStyle(0x152a2e, 1);
    graphics.fillRoundedRect(chipX, chipY, chipSize, chipSize, 8);
    graphics.lineStyle(1, unitDefinitions[selection.kind].groupBorderColor, 0.9);
    graphics.strokeRoundedRect(chipX, chipY, chipSize, chipSize, 8);

    container.add(scene.add
      .text(chipX + chipSize / 2, chipY + chipSize / 2, getPortraitGlyph(selection), {
        fontFamily: "Georgia, Times New Roman, serif",
        fontSize: "13px",
        color: "#f4ead1",
        fontStyle: "bold",
      })
      .setOrigin(0.5));
  });

  container.add(scene.add.text(x + 24, y + height - 28, `Combined HP ${Math.round(totalHp)} / ${totalMaxHp} · MP ${Math.round(totalMana)} / ${totalMaxMana} · Right-click field to move villagers`, {
    ...HUD_TEXT_STYLE,
    fontSize: "12px",
    color: "#dbe9d3",
  }));
}

function getPortraitGlyph(selection: SelectedEntityView): string {
  return unitDefinitions[selection.kind].portraitGlyph;
}
