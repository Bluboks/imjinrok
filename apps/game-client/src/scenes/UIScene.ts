import Phaser from "phaser";
import { defaultMap, getTileAt, type TerrainType } from "@shared";
import {
  SELECTED_ENTITY_CHANGED_EVENT,
  SELECTED_ENTITY_REGISTRY_KEY,
  VIRTUAL_CURSOR_CHANGED_EVENT,
  VIRTUAL_CURSOR_REGISTRY_KEY,
  type SelectedEntitiesView,
  type SelectedEntityView,
  type VirtualCursorView,
} from "../hud.js";
import type { GameLaunchContext } from "../session.js";

interface HudActionSlot {
  icon: string;
  hotkey: string;
  label: string;
  enabled: boolean;
}

const HUD_TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: "Trebuchet MS, Verdana, sans-serif",
  fontSize: "13px",
  color: "#dce8d0",
};

const VIRTUAL_CURSOR_SIZE = 15;

export class UIScene extends Phaser.Scene {
  private hudContainer: Phaser.GameObjects.Container | null = null;
  private cursorGraphics: Phaser.GameObjects.Graphics | null = null;
  private launchContext: GameLaunchContext | null = null;
  private selectedEntities: SelectedEntitiesView = [];
  private virtualCursor: VirtualCursorView = { x: 0, y: 0, locked: false };

  constructor() {
    super("ui");
  }

  create(data: GameLaunchContext): void {
    this.launchContext = data;
    this.selectedEntities = this.normalizeSelection(
      this.registry.get(SELECTED_ENTITY_REGISTRY_KEY) as SelectedEntitiesView | SelectedEntityView | null | undefined,
    );
    this.virtualCursor =
      (this.registry.get(VIRTUAL_CURSOR_REGISTRY_KEY) as VirtualCursorView | null | undefined) ?? this.virtualCursor;

    this.drawHud();
    this.cursorGraphics = this.add.graphics().setScrollFactor(0).setDepth(2000);
    this.drawVirtualCursor();
    this.game.events.on(SELECTED_ENTITY_CHANGED_EVENT, this.handleSelectionChanged, this);
    this.game.events.on(VIRTUAL_CURSOR_CHANGED_EVENT, this.handleVirtualCursorChanged, this);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
  }

  private handleSelectionChanged(selection: SelectedEntitiesView | SelectedEntityView | null): void {
    this.selectedEntities = this.normalizeSelection(selection);
    this.drawHud();
  }

  private handleResize(): void {
    this.drawHud();
    this.drawVirtualCursor();
  }

  private handleVirtualCursorChanged(cursor: VirtualCursorView): void {
    this.virtualCursor = cursor;
    this.drawVirtualCursor();
  }

  private handleShutdown(): void {
    this.game.events.off(SELECTED_ENTITY_CHANGED_EVENT, this.handleSelectionChanged, this);
    this.game.events.off(VIRTUAL_CURSOR_CHANGED_EVENT, this.handleVirtualCursorChanged, this);
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.hudContainer?.destroy(true);
    this.hudContainer = null;
    this.cursorGraphics?.destroy();
    this.cursorGraphics = null;
  }

  private drawVirtualCursor(): void {
    if (!this.cursorGraphics) {
      return;
    }

    this.cursorGraphics.clear();

    if (!this.virtualCursor.locked) {
      this.cursorGraphics.setVisible(false);
      return;
    }

    this.cursorGraphics.setVisible(true);

    const { x, y } = this.virtualCursor;
    const points = [
      new Phaser.Geom.Point(x, y),
      new Phaser.Geom.Point(x + VIRTUAL_CURSOR_SIZE, y + VIRTUAL_CURSOR_SIZE * 0.45),
      new Phaser.Geom.Point(x + VIRTUAL_CURSOR_SIZE * 0.44, y + VIRTUAL_CURSOR_SIZE),
    ];

    this.cursorGraphics.fillStyle(0xf4df8e, 0.32);
    this.cursorGraphics.fillPoints(points, true);
    this.cursorGraphics.lineStyle(2, 0xf4df8e, 1);
    this.cursorGraphics.strokePoints(points, true);
    this.cursorGraphics.fillStyle(0x0a1719, 1);
    this.cursorGraphics.fillCircle(x, y, 2.5);
  }

  private drawHud(): void {
    this.hudContainer?.destroy(true);

    const width = this.scale.width;
    const height = this.scale.height;
    const hudHeight = this.getHudHeight();
    const hudTop = height - hudHeight;
    const margin = 16;
    const gap = 14;
    const miniMapWidth = Phaser.Math.Clamp(width * 0.22, 190, 280);
    const actionsWidth = Phaser.Math.Clamp(width * 0.28, 292, 360);
    const infoX = margin + miniMapWidth + gap;
    const actionsX = width - margin - actionsWidth;
    const infoWidth = Math.max(220, actionsX - infoX - gap);

    const container = this.add.container(0, 0).setScrollFactor(0).setDepth(1000);
    const graphics = this.add.graphics().setScrollFactor(0);

    this.hudContainer = container;
    container.add(graphics);

    graphics.fillStyle(0x050a0c, 0.94);
    graphics.fillRoundedRect(10, hudTop + 8, width - 20, hudHeight - 16, 18);
    graphics.lineStyle(2, 0x1a3337, 0.95);
    graphics.strokeRoundedRect(10, hudTop + 8, width - 20, hudHeight - 16, 18);
    graphics.lineStyle(1, 0xd0b46a, 0.55);
    graphics.lineBetween(24, hudTop + 18, width - 24, hudTop + 18);

    this.drawMiniMap(container, graphics, margin, hudTop + 24, miniMapWidth, hudHeight - 42);
    this.drawSelectionInfo(container, graphics, infoX, hudTop + 24, infoWidth, hudHeight - 42);
    this.drawActionGrid(container, graphics, actionsX, hudTop + 24, actionsWidth, hudHeight - 42);
    this.drawSessionStrip(container, hudTop);
  }

  private getHudHeight(): number {
    return Phaser.Math.Clamp(this.scale.height * 0.26, 178, 220);
  }

  private drawPanelFrame(
    container: Phaser.GameObjects.Container,
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    title: string,
  ): void {
    graphics.fillStyle(0x0a1719, 0.92);
    graphics.fillRoundedRect(x, y, width, height, 12);
    graphics.lineStyle(1, 0x46646a, 0.9);
    graphics.strokeRoundedRect(x, y, width, height, 12);
    graphics.fillStyle(0x10262a, 0.9);
    graphics.fillRoundedRect(x + 7, y + 7, width - 14, 28, 8);

    container.add(
      this.add.text(x + 18, y + 14, title, {
        ...HUD_TEXT_STYLE,
        fontSize: "12px",
        color: "#d0b46a",
        letterSpacing: 1,
      }),
    );
  }

  private drawMiniMap(
    container: Phaser.GameObjects.Container,
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    this.drawPanelFrame(container, graphics, x, y, width, height, "MINIMAP");

    const diamondWidth = Math.min(width - 36, (height - 54) * 1.55);
    const diamondHeight = Math.min(height - 54, diamondWidth * 0.58);
    const centerX = x + width / 2;
    const centerY = y + 48 + diamondHeight / 2;
    const topY = centerY - diamondHeight / 2;
    const tileHalfWidth = diamondWidth / (defaultMap.width + defaultMap.height);
    const tileHalfHeight = diamondHeight / (defaultMap.width + defaultMap.height);

    graphics.fillStyle(0x071214, 1);
    graphics.fillPoints(
      [
        new Phaser.Geom.Point(centerX, topY),
        new Phaser.Geom.Point(centerX + diamondWidth / 2, centerY),
        new Phaser.Geom.Point(centerX, centerY + diamondHeight / 2),
        new Phaser.Geom.Point(centerX - diamondWidth / 2, centerY),
      ],
      true,
    );

    for (let mapY = 0; mapY < defaultMap.height; mapY += 1) {
      for (let mapX = 0; mapX < defaultMap.width; mapX += 1) {
        const isoX = (mapX - mapY) * tileHalfWidth;
        const isoY = (mapX + mapY) * tileHalfHeight;
        const tileCenterX = centerX + isoX;
        const tileCenterY = topY + isoY;
        const tile = getTileAt(defaultMap, mapX, mapY);

        graphics.fillStyle(this.getMiniMapTerrainColor(tile.terrain), 0.78);
        graphics.fillPoints(
          [
            new Phaser.Geom.Point(tileCenterX, tileCenterY - tileHalfHeight),
            new Phaser.Geom.Point(tileCenterX + tileHalfWidth, tileCenterY),
            new Phaser.Geom.Point(tileCenterX, tileCenterY + tileHalfHeight),
            new Phaser.Geom.Point(tileCenterX - tileHalfWidth, tileCenterY),
          ],
          true,
        );
      }
    }

    graphics.lineStyle(2, 0xd0b46a, 0.85);
    graphics.strokePoints(
      [
        new Phaser.Geom.Point(centerX, topY),
        new Phaser.Geom.Point(centerX + diamondWidth / 2, centerY),
        new Phaser.Geom.Point(centerX, centerY + diamondHeight / 2),
        new Phaser.Geom.Point(centerX - diamondWidth / 2, centerY),
      ],
      true,
    );

    this.selectedEntities.forEach((selection, index) => {
      const isoX = (selection.position.x - selection.position.y) * tileHalfWidth;
      const isoY = (selection.position.x + selection.position.y) * tileHalfHeight;
      const radius = index === 0 ? 4 : 3;

      graphics.fillStyle(selection.kind === "town-center" ? 0xf4df8e : 0x91e0a1, 1);
      graphics.fillCircle(centerX + isoX, topY + isoY, radius);
      graphics.lineStyle(1, 0x071214, 1);
      graphics.strokeCircle(centerX + isoX, topY + isoY, radius + 1);
    });

    container.add(
      this.add.text(x + 18, y + height - 24, "diamond tactical view", {
        ...HUD_TEXT_STYLE,
        fontSize: "11px",
        color: "#7f9b91",
      }),
    );
  }

  private drawSelectionInfo(
    container: Phaser.GameObjects.Container,
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    this.drawPanelFrame(container, graphics, x, y, width, height, "SELECTED ENTITIES");

    if (this.selectedEntities.length === 0) {
      container.add(
        this.add
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

    if (this.selectedEntities.length > 1) {
      this.drawGroupSelectionInfo(container, graphics, x, y, width, height);
      return;
    }

    const selectedEntity = this.getPrimarySelection();

    if (!selectedEntity) {
      return;
    }

    const portraitSize = Phaser.Math.Clamp(height - 82, 72, 106);
    const portraitX = x + 20;
    const portraitY = y + 50;
    const textX = portraitX + portraitSize + 18;
    const healthRatio = Phaser.Math.Clamp(selectedEntity.hp / selectedEntity.maxHp, 0, 1);
    const healthBarWidth = Math.max(120, width - (textX - x) - 24);

    graphics.fillStyle(0x152a2e, 1);
    graphics.fillRoundedRect(portraitX, portraitY, portraitSize, portraitSize, 10);
    graphics.lineStyle(2, 0xd0b46a, 0.85);
    graphics.strokeRoundedRect(portraitX, portraitY, portraitSize, portraitSize, 10);
    graphics.fillStyle(selectedEntity.kind === "town-center" ? 0xc2a95e : 0x77a78a, 0.28);
    graphics.fillCircle(portraitX + portraitSize / 2, portraitY + portraitSize / 2, portraitSize * 0.35);

    container.add(
      this.add
        .text(portraitX + portraitSize / 2, portraitY + portraitSize / 2, this.getPortraitGlyph(selectedEntity), {
          fontFamily: "Georgia, Times New Roman, serif",
          fontSize: `${Math.floor(portraitSize * 0.28)}px`,
          color: "#f4ead1",
          fontStyle: "bold",
        })
        .setOrigin(0.5),
    );

    container.add(
      this.add.text(textX, portraitY, selectedEntity.label.toUpperCase(), {
        fontFamily: "Georgia, Times New Roman, serif",
        fontSize: "24px",
        color: "#f4ead1",
      }),
    );
    container.add(
      this.add.text(
        textX,
        portraitY + 36,
        [`Owner: ${selectedEntity.playerId}`, `Grid: ${selectedEntity.position.x}, ${selectedEntity.position.y}`].join(
          "  ·  ",
        ),
        {
          ...HUD_TEXT_STYLE,
          color: "#a5beb5",
        },
      ),
    );

    graphics.fillStyle(0x071012, 1);
    graphics.fillRoundedRect(textX, portraitY + 66, healthBarWidth, 16, 8);
    graphics.fillStyle(healthRatio > 0.35 ? 0x75b46f : 0xd36b52, 1);
    graphics.fillRoundedRect(textX + 2, portraitY + 68, Math.max(8, (healthBarWidth - 4) * healthRatio), 12, 6);
    graphics.lineStyle(1, 0x29474c, 1);
    graphics.strokeRoundedRect(textX, portraitY + 66, healthBarWidth, 16, 8);

    container.add(
      this.add.text(textX, portraitY + 88, `HP ${selectedEntity.hp} / ${selectedEntity.maxHp}`, {
        ...HUD_TEXT_STYLE,
        fontSize: "12px",
        color: "#dbe9d3",
      }),
    );
  }

  private drawGroupSelectionInfo(
    container: Phaser.GameObjects.Container,
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    const villagerCount = this.selectedEntities.filter((selection) => selection.kind === "villager").length;
    const townCenterCount = this.selectedEntities.filter((selection) => selection.kind === "town-center").length;
    const totalHp = this.selectedEntities.reduce((sum, selection) => sum + selection.hp, 0);
    const totalMaxHp = this.selectedEntities.reduce((sum, selection) => sum + selection.maxHp, 0);
    const chipSize = Phaser.Math.Clamp((width - 54) / 8, 30, 44);
    const chipY = y + 108;

    container.add(
      this.add.text(x + 22, y + 54, `${this.selectedEntities.length} ENTITIES SELECTED`, {
        fontFamily: "Georgia, Times New Roman, serif",
        fontSize: "24px",
        color: "#f4ead1",
      }),
    );
    container.add(
      this.add.text(x + 24, y + 88, `Villagers: ${villagerCount}  ·  Town Centers: ${townCenterCount}`, {
        ...HUD_TEXT_STYLE,
        color: "#a5beb5",
      }),
    );

    this.selectedEntities.slice(0, 8).forEach((selection, index) => {
      const chipX = x + 22 + index * (chipSize + 6);

      graphics.fillStyle(0x152a2e, 1);
      graphics.fillRoundedRect(chipX, chipY, chipSize, chipSize, 8);
      graphics.lineStyle(1, selection.kind === "town-center" ? 0xd0b46a : 0x77a78a, 0.9);
      graphics.strokeRoundedRect(chipX, chipY, chipSize, chipSize, 8);

      container.add(
        this.add
          .text(chipX + chipSize / 2, chipY + chipSize / 2, this.getPortraitGlyph(selection), {
            fontFamily: "Georgia, Times New Roman, serif",
            fontSize: "13px",
            color: "#f4ead1",
            fontStyle: "bold",
          })
          .setOrigin(0.5),
      );
    });

    container.add(
      this.add.text(x + 24, y + height - 28, `Combined HP ${totalHp} / ${totalMaxHp} · Right-click field to move villagers`, {
        ...HUD_TEXT_STYLE,
        fontSize: "12px",
        color: "#dbe9d3",
      }),
    );
  }

  private drawActionGrid(
    container: Phaser.GameObjects.Container,
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    this.drawPanelFrame(container, graphics, x, y, width, height, "ACTIONS");

    const columns = 4;
    const rows = 3;
    const gap = 8;
    const gridX = x + 14;
    const gridY = y + 46;
    const slotWidth = (width - 28 - gap * (columns - 1)) / columns;
    const slotHeight = (height - 60 - gap * (rows - 1)) / rows;
    const actions = this.getActionSlots();

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

        container.add(
          this.add
            .text(slotX + slotWidth / 2, slotY + 10, action.icon, {
              fontFamily: "Georgia, Times New Roman, serif",
              fontSize: "20px",
              color: "#f1dfaa",
              fontStyle: "bold",
            })
            .setOrigin(0.5, 0),
        );
        container.add(
          this.add
            .text(slotX + slotWidth / 2, slotY + slotHeight - 24, action.label, {
              ...HUD_TEXT_STYLE,
              fontSize: "10px",
              color: "#cfe0d4",
              align: "center",
              wordWrap: { width: slotWidth - 10 },
            })
            .setOrigin(0.5, 0),
        );
        container.add(
          this.add.text(slotX + 7, slotY + 5, action.hotkey, {
            ...HUD_TEXT_STYLE,
            fontSize: "10px",
            color: "#7f9b91",
          }),
        );
      }
    }
  }

  private drawSessionStrip(container: Phaser.GameObjects.Container, hudTop: number): void {
    const context = this.launchContext;

    if (!context) {
      return;
    }

    const status = context.serverOnline ? "SERVER LINKED" : "OFFLINE PREVIEW";
    const session = context.session?.id ?? "offline-skirmish";

    container.add(
      this.add
        .text(this.scale.width / 2, hudTop + 4, `${context.mode.toUpperCase()}  ·  ${status}  ·  ${session}`, {
          ...HUD_TEXT_STYLE,
          fontSize: "11px",
          color: context.serverOnline ? "#8bd59b" : "#b5a06b",
        })
        .setOrigin(0.5, 0),
    );
  }

  private getPrimarySelection(): SelectedEntityView | null {
    return this.selectedEntities[0] ?? null;
  }

  private getPortraitGlyph(selection: SelectedEntityView): string {
    return selection.kind === "town-center" ? "TC" : "V";
  }

  private getActionSlots(): HudActionSlot[] {
    const emptySlot = (): HudActionSlot => ({ icon: "", hotkey: "", label: "", enabled: false });
    const slots = Array.from({ length: 12 }, emptySlot);

    if (this.selectedEntities.length === 0) {
      return slots;
    }

    const hasVillager = this.selectedEntities.some((selection) => selection.kind === "villager");
    const actions: HudActionSlot[] = hasVillager
      ? [
          { icon: "M", hotkey: "M", label: "Move", enabled: true },
          { icon: "G", hotkey: "G", label: "Gather", enabled: true },
          { icon: "B", hotkey: "B", label: "Build", enabled: true },
          { icon: "S", hotkey: "S", label: "Stop", enabled: true },
          { icon: "A", hotkey: "A", label: "Attack Move", enabled: true },
          { icon: "P", hotkey: "P", label: "Patrol", enabled: true },
          { icon: "R", hotkey: "R", label: "Repair", enabled: true },
          { icon: "H", hotkey: "H", label: "Hold", enabled: true },
        ]
      : [
          { icon: "V", hotkey: "V", label: "Train Villager", enabled: true },
          { icon: "R", hotkey: "R", label: "Rally Point", enabled: true },
          { icon: "L", hotkey: "L", label: "Research Loom", enabled: true },
          { icon: "S", hotkey: "S", label: "Stop", enabled: true },
          { icon: "B", hotkey: "B", label: "Town Bell", enabled: true },
          { icon: "G", hotkey: "G", label: "Set Gather", enabled: true },
        ];

    actions.forEach((action, index) => {
      slots[index] = action;
    });

    return slots;
  }

  private normalizeSelection(
    selection: SelectedEntitiesView | SelectedEntityView | null | undefined,
  ): SelectedEntitiesView {
    if (!selection) {
      return [];
    }

    return Array.isArray(selection) ? selection : [selection];
  }

  private getMiniMapTerrainColor(terrain: TerrainType): number {
    switch (terrain) {
      case "forest":
        return 0x355f3d;
      case "water":
        return 0x2f6680;
      case "cliff":
        return 0x756858;
      case "grass":
        return 0x6f9b54;
    }
  }
}
