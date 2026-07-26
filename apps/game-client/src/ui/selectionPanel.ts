import Phaser from "phaser";
import { researchDefinitions, unitDefinitions, type BankResourceKind } from "@shared";
import { SIM_TICKS_PER_SECOND } from "@simulation";
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
  drawPanelFrame(scene, container, graphics, bounds, "선택");

  if (selectedEntities.length === 0) {
    container.add(
      scene.add
        .text(x + width / 2, y + height / 2 + 8, "선택된 대상 없음", {
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
  const activityStatus = getActivityStatusLabel(selectedEntity);
  const statusParts = [
    `소유 ${formatPlayerLabel(selectedEntity.playerId)}`,
    `좌표 ${selectedEntity.position.x.toFixed(1)}, ${selectedEntity.position.y.toFixed(1)}`,
    `속도 ${selectedEntity.movementSpeed.toFixed(1)}`,
    activityStatus,
  ];

  if (selectedEntity.carriedResource) {
    statusParts.push(`운반 ${Math.floor(selectedEntity.carriedResource.amount)} ${getBankResourceLabel(selectedEntity.carriedResource.kind)}`);
  }

  if (selectedEntity.rallyPoint) {
    const rallyTarget = `${selectedEntity.rallyPoint.target.x}, ${selectedEntity.rallyPoint.target.y}`;
    const rallyLabel = selectedEntity.rallyPoint.resourceId
      ? "채집 집결"
      : selectedEntity.rallyPoint.mode === "attack-move"
        ? "공격 집결"
        : "집결";

    statusParts.push(`${rallyLabel} ${rallyTarget}`);
  }

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

  container.add(scene.add.text(textX, portraitY, selectedEntity.label, {
    fontFamily: "Noto Sans KR, Malgun Gothic, Apple SD Gothic Neo, Georgia, serif",
    fontSize: "24px",
    color: "#f4ead1",
  }));
  container.add(scene.add.text(textX, portraitY + 36, statusParts.join("  ·  "), {
    ...HUD_TEXT_STYLE,
    fontSize: "12px",
    color: "#a5beb5",
    wordWrap: { width: healthBarWidth },
  }));

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

  container.add(scene.add.text(textX, portraitY + 98, `체력 ${Math.round(selectedEntity.hp)} / ${selectedEntity.maxHp} · 마나 ${Math.round(selectedEntity.mana)} / ${selectedEntity.maxMana}`, {
    ...HUD_TEXT_STYLE,
    fontSize: "12px",
    color: "#dbe9d3",
  }));

  if (selectedEntity.construction) {
    drawConstructionProgress(scene, container, graphics, selectedEntity, textX, y + height - 32, healthBarWidth);
  } else if (selectedEntity.researchQueue && selectedEntity.researchQueue.length > 0) {
    drawResearchQueue(scene, container, graphics, selectedEntity, textX, y + height - 32, healthBarWidth);
  } else {
    drawProductionQueue(scene, container, graphics, selectedEntity, textX, y + height - 32, healthBarWidth);
  }
}

function getActivityStatusLabel(selectedEntity: SelectedEntityView): string {
  const order = selectedEntity.currentOrder;

  if (!order) {
    return selectedEntity.movementTarget ? "이동 중" : "대기";
  }

  switch (order.type) {
    case "move":
      return `이동 ${formatGridPoint(order.target)}`;
    case "attack-move":
      return `공격 이동 ${formatGridPoint(order.target)}`;
    case "attack-unit":
      return "교전 중";
    case "patrol":
      return `순찰 ${formatGridPoint(order.nextTarget)}`;
    case "hold-position":
      return "위치 사수";
    case "repair":
      return "수리 중";
    case "build":
      return `건설 ${formatGridPoint(order.target)}`;
    case "gather":
      return `채집 ${formatGridPoint(order.target)}`;
  }

  return selectedEntity.movementTarget ? "이동 중" : "대기";
}

function formatGridPoint(point: { x: number; y: number }): string {
  return `${Math.round(point.x)}, ${Math.round(point.y)}`;
}

function drawConstructionProgress(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  graphics: Phaser.GameObjects.Graphics,
  selectedEntity: SelectedEntityView,
  x: number,
  y: number,
  width: number,
): void {
  const construction = selectedEntity.construction;

  if (!construction) {
    return;
  }

  const ratio = Phaser.Math.Clamp((construction.totalTicks - construction.remainingTicks) / construction.totalTicks, 0, 1);
  const seconds = Math.ceil(construction.remainingTicks / SIM_TICKS_PER_SECOND);

  graphics.fillStyle(0x071012, 1);
  graphics.fillRoundedRect(x, y + 18, width, 9, 5);
  graphics.fillStyle(0x9fbf7a, 0.95);
  graphics.fillRoundedRect(x + 2, y + 20, Math.max(5, (width - 4) * ratio), 5, 3);
  graphics.lineStyle(1, 0x29474c, 1);
  graphics.strokeRoundedRect(x, y + 18, width, 9, 5);

  container.add(scene.add.text(x, y, `건설 중 ${selectedEntity.label} · ${seconds}초`, {
    ...HUD_TEXT_STYLE,
    fontSize: "12px",
    color: "#dbe9d3",
  }));
}

function drawResearchQueue(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  graphics: Phaser.GameObjects.Graphics,
  selectedEntity: SelectedEntityView,
  x: number,
  y: number,
  width: number,
): void {
  const queueItem = selectedEntity.researchQueue?.[0];

  if (!queueItem) {
    return;
  }

  const ratio = Phaser.Math.Clamp((queueItem.totalTicks - queueItem.remainingTicks) / queueItem.totalTicks, 0, 1);
  const seconds = Math.ceil(queueItem.remainingTicks / SIM_TICKS_PER_SECOND);
  const researchName = researchDefinitions[queueItem.research].displayName;

  graphics.fillStyle(0x071012, 1);
  graphics.fillRoundedRect(x, y + 18, width, 9, 5);
  graphics.fillStyle(0x8fb4d8, 0.95);
  graphics.fillRoundedRect(x + 2, y + 20, Math.max(5, (width - 4) * ratio), 5, 3);
  graphics.lineStyle(1, 0x29474c, 1);
  graphics.strokeRoundedRect(x, y + 18, width, 9, 5);

  container.add(scene.add.text(x, y, `연구 중 ${researchName} · ${seconds}초`, {
    ...HUD_TEXT_STYLE,
    fontSize: "12px",
    color: "#dbe9d3",
  }));
}

function drawProductionQueue(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  graphics: Phaser.GameObjects.Graphics,
  selectedEntity: SelectedEntityView,
  x: number,
  y: number,
  width: number,
): void {
  const queueItem = selectedEntity.productionQueue?.[0];

  if (!queueItem) {
    return;
  }

  const ratio = Phaser.Math.Clamp((queueItem.totalTicks - queueItem.remainingTicks) / queueItem.totalTicks, 0, 1);
  const seconds = Math.ceil(queueItem.remainingTicks / SIM_TICKS_PER_SECOND);
  const unitName = unitDefinitions[queueItem.unit].displayName;
  const queueCount = selectedEntity.productionQueue?.length ?? 0;

  graphics.fillStyle(0x071012, 1);
  graphics.fillRoundedRect(x, y + 18, width, 9, 5);
  graphics.fillStyle(0xd0b46a, 0.95);
  graphics.fillRoundedRect(x + 2, y + 20, Math.max(5, (width - 4) * ratio), 5, 3);
  graphics.lineStyle(1, 0x29474c, 1);
  graphics.strokeRoundedRect(x, y + 18, width, 9, 5);

  container.add(scene.add.text(x, y, `훈련 중 ${unitName} · ${seconds}초 · 대기 ${queueCount}`, {
    ...HUD_TEXT_STYLE,
    fontSize: "12px",
    color: "#f1dfaa",
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
  const fighterCount = selectedEntities.filter((selection) => unitDefinitions[selection.kind].category === "infantry").length;
  const buildingCount = selectedEntities.filter((selection) => unitDefinitions[selection.kind].category === "building").length;
  const activitySummary = getGroupActivitySummary(selectedEntities);
  const totalHp = selectedEntities.reduce((sum, selection) => sum + selection.hp, 0);
  const totalMaxHp = selectedEntities.reduce((sum, selection) => sum + selection.maxHp, 0);
  const totalMana = selectedEntities.reduce((sum, selection) => sum + selection.mana, 0);
  const totalMaxMana = selectedEntities.reduce((sum, selection) => sum + selection.maxMana, 0);
  const chipSize = Phaser.Math.Clamp((width - 54) / 8, 30, 44);
  const chipY = y + 108;

  container.add(scene.add.text(x + 22, y + 54, `${selectedEntities.length}개 선택`, {
    fontFamily: "Noto Sans KR, Malgun Gothic, Apple SD Gothic Neo, Georgia, serif",
    fontSize: "24px",
    color: "#f4ead1",
  }));
  container.add(scene.add.text(x + 24, y + 88, `농민 ${villagerCount}  ·  건물 ${buildingCount}`, {
    ...HUD_TEXT_STYLE,
    color: "#a5beb5",
  }));
  container.add(scene.add.text(x + 24, y + height - 48, `전투 ${fighterCount}  ·  ${activitySummary}`, {
    ...HUD_TEXT_STYLE,
    fontSize: "12px",
    color: "#a5beb5",
    wordWrap: { width: width - 48 },
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

  container.add(scene.add.text(x + 24, y + height - 28, `총 체력 ${Math.round(totalHp)} / ${totalMaxHp} · 마나 ${Math.round(totalMana)} / ${totalMaxMana}`, {
    ...HUD_TEXT_STYLE,
    fontSize: "12px",
    color: "#dbe9d3",
  }));
}

function getGroupActivitySummary(selectedEntities: SelectedEntitiesView): string {
  const summary = selectedEntities.reduce(
    (counts, selection) => {
      switch (getGroupActivityKind(selection)) {
        case "moving":
          counts.moving += 1;
          break;
        case "attacking":
          counts.attacking += 1;
          break;
        case "gathering":
          counts.gathering += 1;
          break;
        case "working":
          counts.working += 1;
          break;
        case "idle":
          counts.idle += 1;
          break;
      }

      return counts;
    },
    { moving: 0, attacking: 0, gathering: 0, working: 0, idle: 0 },
  );

  return [
    summary.moving > 0 ? `이동 ${summary.moving}` : null,
    summary.attacking > 0 ? `전투/경계 ${summary.attacking}` : null,
    summary.gathering > 0 ? `채집 ${summary.gathering}` : null,
    summary.working > 0 ? `작업 ${summary.working}` : null,
    summary.idle > 0 ? `대기 ${summary.idle}` : null,
  ].filter((part): part is string => part !== null).join("  ·  ") || "대기 없음";
}

function getGroupActivityKind(selection: SelectedEntityView): "moving" | "attacking" | "gathering" | "working" | "idle" {
  switch (selection.currentOrder?.type) {
    case "attack-unit":
    case "attack-move":
    case "patrol":
    case "hold-position":
      return "attacking";
    case "gather":
      return "gathering";
    case "build":
    case "repair":
      return "working";
    case "move":
      return "moving";
  }

  if (
    selection.construction ||
    (selection.productionQueue?.length ?? 0) > 0 ||
    (selection.researchQueue?.length ?? 0) > 0
  ) {
    return "working";
  }

  return selection.movementTarget ? "moving" : "idle";
}

function getPortraitGlyph(selection: SelectedEntityView): string {
  return unitDefinitions[selection.kind].portraitGlyph;
}

function formatPlayerLabel(playerId: string): string {
  if (playerId === "local-player") {
    return "아군";
  }

  if (playerId.startsWith("cpu-")) {
    return `CPU ${playerId.slice(4)}`;
  }

  return playerId;
}

function getBankResourceLabel(kind: BankResourceKind): string {
  switch (kind) {
    case "food":
      return "식량";
    case "wood":
      return "목재";
    case "gold":
      return "금";
    case "stone":
      return "석재";
  }
}
