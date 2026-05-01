import Phaser from "phaser";
import { defaultMap } from "@shared";
import {
  DRAG_SELECTION_CHANGED_EVENT,
  MINIMAP_NAVIGATE_EVENT,
  MINIMAP_ENTITIES_CHANGED_EVENT,
  MINIMAP_ENTITIES_REGISTRY_KEY,
  MINIMAP_MAP_CHANGED_EVENT,
  MINIMAP_MAP_REGISTRY_KEY,
  MINIMAP_VIEWPORT_CHANGED_EVENT,
  MINIMAP_VIEWPORT_REGISTRY_KEY,
  SELECTED_ENTITY_CHANGED_EVENT,
  SELECTED_ENTITY_REGISTRY_KEY,
  VIRTUAL_CURSOR_CHANGED_EVENT,
  VIRTUAL_CURSOR_REGISTRY_KEY,
  type DragSelectionView,
  type MinimapMapView,
  type MinimapViewportView,
  type MinimapEntitiesView,
  type SelectedEntitiesView,
  type SelectedEntityView,
  type VirtualCursorView,
} from "../hud.js";
import type { GameLaunchContext } from "../session.js";
import {
  createMinimapGeometry,
  drawMinimapEntityMarker,
  drawMinimapTerrainCache,
  getMinimapDiamondPoints,
  getMinimapWorldPoint,
  gridToMinimap,
  worldToMinimap,
  type MinimapGeometry,
} from "../ui/minimap.js";
import { drawActionGrid } from "../ui/actionGrid.js";
import { drawPanelFrame, HUD_TEXT_STYLE, type PanelBounds } from "../ui/hudPanel.js";
import { drawSelectionPanel } from "../ui/selectionPanel.js";

const VIRTUAL_CURSOR_SIZE = 15;

export class UIScene extends Phaser.Scene {
  private hudContainer: Phaser.GameObjects.Container | null = null;
  private selectionPanelContainer: Phaser.GameObjects.Container | null = null;
  private actionGridContainer: Phaser.GameObjects.Container | null = null;
  private selectionPanelBounds: PanelBounds | null = null;
  private actionGridBounds: PanelBounds | null = null;
  private cursorGraphics: Phaser.GameObjects.Graphics | null = null;
  private dragSelectionGraphics: Phaser.GameObjects.Graphics | null = null;
  private launchContext: GameLaunchContext | null = null;
  private selectedEntities: SelectedEntitiesView = [];
  private virtualCursor: VirtualCursorView = { x: 0, y: 0, locked: false };
  private minimapMap: MinimapMapView | null = null;
  private minimapViewport: MinimapViewportView | null = null;
  private minimapEntities: MinimapEntitiesView = { entities: [] };
  private minimapGeometry: MinimapGeometry | null = null;
  private minimapTerrainGraphics: Phaser.GameObjects.RenderTexture | null = null;
  private minimapEntityGraphics: Phaser.GameObjects.Graphics | null = null;
  private minimapViewportGraphics: Phaser.GameObjects.Graphics | null = null;
  private minimapBorderGraphics: Phaser.GameObjects.Graphics | null = null;
  private minimapZoomText: Phaser.GameObjects.Text | null = null;
  private isMinimapNavigating = false;

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
    this.minimapMap = (this.registry.get(MINIMAP_MAP_REGISTRY_KEY) as MinimapMapView | null | undefined) ?? null;
    this.minimapViewport = (this.registry.get(MINIMAP_VIEWPORT_REGISTRY_KEY) as MinimapViewportView | null | undefined) ?? null;
    this.minimapEntities =
      (this.registry.get(MINIMAP_ENTITIES_REGISTRY_KEY) as MinimapEntitiesView | null | undefined) ?? this.minimapEntities;

    this.drawHud();
    this.dragSelectionGraphics = this.add.graphics().setScrollFactor(0).setDepth(1500);
    this.cursorGraphics = this.add.graphics().setScrollFactor(0).setDepth(2000);
    this.drawVirtualCursor();
    this.game.events.on(SELECTED_ENTITY_CHANGED_EVENT, this.handleSelectionChanged, this);
    this.game.events.on(DRAG_SELECTION_CHANGED_EVENT, this.handleDragSelectionChanged, this);
    this.game.events.on(VIRTUAL_CURSOR_CHANGED_EVENT, this.handleVirtualCursorChanged, this);
    this.game.events.on(MINIMAP_MAP_CHANGED_EVENT, this.handleMinimapMapChanged, this);
    this.game.events.on(MINIMAP_VIEWPORT_CHANGED_EVENT, this.handleMinimapViewportChanged, this);
    this.game.events.on(MINIMAP_ENTITIES_CHANGED_EVENT, this.handleMinimapEntitiesChanged, this);
    this.input.on("pointerdown", this.handlePointerDown, this);
    this.input.on("pointermove", this.handlePointerMove, this);
    this.input.on("pointerup", this.handlePointerUp, this);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
  }

  private handleSelectionChanged(selection: SelectedEntitiesView | SelectedEntityView | null): void {
    this.selectedEntities = this.normalizeSelection(selection);

    if (!this.redrawSelectionPanel() || !this.redrawActionGrid()) {
      this.drawHud();
    }
  }

  private handleResize(): void {
    this.drawHud();
    this.drawVirtualCursor();
  }

  private handleVirtualCursorChanged(cursor: VirtualCursorView): void {
    this.virtualCursor = cursor;
    this.drawVirtualCursor();

    if (this.isMinimapNavigating && cursor.locked) {
      this.emitMinimapNavigationAt(new Phaser.Math.Vector2(cursor.x, cursor.y), true);
    }
  }

  private handleDragSelectionChanged(selection: DragSelectionView | null): void {
    this.drawDragSelection(selection);
  }

  private handleMinimapMapChanged(view: MinimapMapView): void {
    this.minimapMap = view;
    this.drawHud();
  }

  private handleMinimapViewportChanged(view: MinimapViewportView): void {
    this.minimapViewport = view;
    this.drawMinimapViewportOverlay();
  }

  private handleMinimapEntitiesChanged(view: MinimapEntitiesView): void {
    this.minimapEntities = view;
    this.drawMinimapEntitiesOverlay();
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.isLeftButtonEvent(pointer)) {
      return;
    }

    const point = this.getPointerScreenPoint(pointer);

    this.isMinimapNavigating = this.emitMinimapNavigationAt(point);
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.isMinimapNavigating || this.virtualCursor.locked) {
      return;
    }

    this.emitMinimapNavigationAt(this.getPointerScreenPoint(pointer), true);
  }

  private handlePointerUp(): void {
    this.isMinimapNavigating = false;
  }

  private getPointerScreenPoint(pointer: Phaser.Input.Pointer): Phaser.Math.Vector2 {
    return this.virtualCursor.locked
      ? new Phaser.Math.Vector2(this.virtualCursor.x, this.virtualCursor.y)
      : new Phaser.Math.Vector2(pointer.x, pointer.y);
  }

  private emitMinimapNavigationAt(point: Phaser.Math.Vector2, clampToMinimap = false): boolean {
    const bounds = this.minimapViewport?.worldBounds ?? this.minimapMap?.worldBounds;
    const target = this.minimapGeometry && bounds ? getMinimapWorldPoint(point, this.minimapGeometry, bounds, clampToMinimap) : null;

    if (!target) {
      return false;
    }

    this.game.events.emit(MINIMAP_NAVIGATE_EVENT, target);
    return true;
  }

  private isLeftButtonEvent(pointer: Phaser.Input.Pointer): boolean {
    return pointer.button === 0 || pointer.leftButtonDown() || pointer.leftButtonReleased();
  }

  private handleShutdown(): void {
    this.game.events.off(SELECTED_ENTITY_CHANGED_EVENT, this.handleSelectionChanged, this);
    this.game.events.off(DRAG_SELECTION_CHANGED_EVENT, this.handleDragSelectionChanged, this);
    this.game.events.off(VIRTUAL_CURSOR_CHANGED_EVENT, this.handleVirtualCursorChanged, this);
    this.game.events.off(MINIMAP_MAP_CHANGED_EVENT, this.handleMinimapMapChanged, this);
    this.game.events.off(MINIMAP_VIEWPORT_CHANGED_EVENT, this.handleMinimapViewportChanged, this);
    this.game.events.off(MINIMAP_ENTITIES_CHANGED_EVENT, this.handleMinimapEntitiesChanged, this);
    this.input.off("pointerdown", this.handlePointerDown, this);
    this.input.off("pointermove", this.handlePointerMove, this);
    this.input.off("pointerup", this.handlePointerUp, this);
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.hudContainer?.destroy(true);
    this.hudContainer = null;
    this.selectionPanelContainer = null;
    this.actionGridContainer = null;
    this.selectionPanelBounds = null;
    this.actionGridBounds = null;
    this.cursorGraphics?.destroy();
    this.cursorGraphics = null;
    this.dragSelectionGraphics?.destroy();
    this.dragSelectionGraphics = null;
  }

  private drawDragSelection(selection: DragSelectionView | null): void {
    if (!this.dragSelectionGraphics) {
      return;
    }

    this.dragSelectionGraphics.clear();

    if (!selection || selection.width < 1 || selection.height < 1) {
      return;
    }

    this.dragSelectionGraphics.fillStyle(0xd0b46a, 0.12);
    this.dragSelectionGraphics.fillRect(selection.x, selection.y, selection.width, selection.height);
    this.dragSelectionGraphics.lineStyle(1, 0xf4df8e, 0.95);
    this.dragSelectionGraphics.strokeRect(selection.x, selection.y, selection.width, selection.height);
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
    this.selectionPanelContainer = null;
    this.actionGridContainer = null;
    this.selectionPanelBounds = null;
    this.actionGridBounds = null;
    this.minimapTerrainGraphics = null;
    this.minimapEntityGraphics = null;
    this.minimapViewportGraphics = null;
    this.minimapBorderGraphics = null;
    this.minimapZoomText = null;
    this.minimapGeometry = null;

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
    this.selectionPanelBounds = { x: infoX, y: hudTop + 24, width: infoWidth, height: hudHeight - 42 };
    this.actionGridBounds = { x: actionsX, y: hudTop + 24, width: actionsWidth, height: hudHeight - 42 };
    this.redrawSelectionPanel();
    this.redrawActionGrid();
    this.drawSessionStrip(container, hudTop);
  }

  private redrawSelectionPanel(): boolean {
    if (!this.hudContainer || !this.selectionPanelBounds) {
      return false;
    }

    this.selectionPanelContainer?.destroy(true);

    const panelContainer = this.add.container(0, 0).setScrollFactor(0);
    const graphics = this.add.graphics().setScrollFactor(0);
    this.selectionPanelContainer = panelContainer;
    this.hudContainer.add(panelContainer);
    panelContainer.add(graphics);
    drawSelectionPanel(this, panelContainer, graphics, this.selectionPanelBounds, this.selectedEntities);

    return true;
  }

  private redrawActionGrid(): boolean {
    if (!this.hudContainer || !this.actionGridBounds) {
      return false;
    }

    this.actionGridContainer?.destroy(true);

    const panelContainer = this.add.container(0, 0).setScrollFactor(0);
    const graphics = this.add.graphics().setScrollFactor(0);
    this.actionGridContainer = panelContainer;
    this.hudContainer.add(panelContainer);
    panelContainer.add(graphics);
    drawActionGrid(this, panelContainer, graphics, this.actionGridBounds, this.selectedEntities);

    return true;
  }

  private getHudHeight(): number {
    return Phaser.Math.Clamp(this.scale.height * 0.26, 178, 220);
  }

  private drawMiniMap(
    container: Phaser.GameObjects.Container,
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    drawPanelFrame(this, container, graphics, { x, y, width, height }, "MINIMAP");

    this.minimapTerrainGraphics?.destroy();
    this.minimapEntityGraphics?.destroy();
    this.minimapViewportGraphics?.destroy();
    this.minimapBorderGraphics?.destroy();
    this.minimapZoomText?.destroy();
    const mapDefinition = this.minimapMap?.map ?? defaultMap;
    const geometry = createMinimapGeometry(x, y, width, height);
    this.minimapGeometry = geometry;
    this.minimapTerrainGraphics = this.add
      .renderTexture(0, 0, this.scale.width, this.scale.height)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1002);
    this.minimapEntityGraphics = this.add.graphics().setScrollFactor(0).setDepth(1003);
    this.minimapViewportGraphics = this.add.graphics().setScrollFactor(0).setDepth(1004);
    this.minimapBorderGraphics = this.add.graphics().setScrollFactor(0).setDepth(1005);
    container.add([this.minimapTerrainGraphics, this.minimapEntityGraphics, this.minimapViewportGraphics, this.minimapBorderGraphics]);
    this.minimapZoomText = this.add.text(x + 18, y + height - 24, "", { ...HUD_TEXT_STYLE, fontSize: "11px", color: "#7f9b91" });
    container.add(this.minimapZoomText);

    if (this.perfEnabled()) console.time("minimap terrain cache");
    const terrainGraphics = this.add.graphics();
    drawMinimapTerrainCache(terrainGraphics, mapDefinition, geometry);
    this.minimapTerrainGraphics.draw(terrainGraphics, 0, 0);
    terrainGraphics.destroy();
    if (this.perfEnabled()) console.timeEnd("minimap terrain cache");
    this.drawMinimapEntitiesOverlay();
    this.drawMinimapViewportOverlay();
    this.minimapBorderGraphics.lineStyle(2, 0xd0b46a, 0.85);
    this.minimapBorderGraphics.strokePoints(getMinimapDiamondPoints(geometry), true);

  }

  private drawMinimapViewportOverlay(): void {
    const geometry = this.minimapGeometry;
    const viewport = this.minimapViewport;

    if (!this.minimapViewportGraphics || !geometry || !viewport) return;

    const graphics = this.minimapViewportGraphics;
    graphics.clear();
    const points = viewport.viewportWorldCorners.map((corner) => worldToMinimap(corner, geometry, viewport.worldBounds));
    graphics.fillStyle(0xf4df8e, 0.13);
    graphics.fillPoints(points, true);
    graphics.lineStyle(2, 0xf4df8e, 0.9);
    graphics.strokePoints(points, true);
    this.minimapZoomText?.setText(`view ${viewport.zoom.toFixed(2)}x`);
  }

  private drawMinimapEntitiesOverlay(): void {
    const geometry = this.minimapGeometry;

    if (!this.minimapEntityGraphics || !geometry) return;

    const graphics = this.minimapEntityGraphics;
    const mapDefinition = this.minimapMap?.map ?? defaultMap;
    graphics.clear();
    this.minimapEntities.entities.forEach((entity) => {
      const marker = gridToMinimap(entity.position, geometry, mapDefinition);
      drawMinimapEntityMarker(graphics, entity, marker);
    });
  }

  private perfEnabled(): boolean {
    return new URLSearchParams(globalThis.location?.search ?? "").get("perf") === "1";
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
        .text(this.scale.width / 2, hudTop + 4, `${context.entryMode.toUpperCase()}  ·  ${context.connectionMode.toUpperCase()}  ·  ${context.scenarioType.toUpperCase()}  ·  ${status}  ·  ${session}`, {
          ...HUD_TEXT_STYLE,
          fontSize: "11px",
          color: context.serverOnline ? "#8bd59b" : "#b5a06b",
        })
        .setOrigin(0.5, 0),
    );
  }

  private normalizeSelection(
    selection: SelectedEntitiesView | SelectedEntityView | null | undefined,
  ): SelectedEntitiesView {
    if (!selection) {
      return [];
    }

    return Array.isArray(selection) ? selection : [selection];
  }

}
