import Phaser from "phaser";
import { defaultMap, getRandomSkirmishMapSeed, type ActionDefinitionId, type GridPoint, type MapDefinition } from "@shared";
import {
  ACTION_TRIGGERED_EVENT,
  BATTLEFIELD_SUMMARY_ACTION_EVENT,
  BATTLEFIELD_SUMMARY_CHANGED_EVENT,
  BATTLEFIELD_SUMMARY_REGISTRY_KEY,
  DRAG_SELECTION_CHANGED_EVENT,
  GAME_PLAYBACK_CHANGED_EVENT,
  GAME_PLAYBACK_CONTROL_EVENT,
  GAME_PLAYBACK_REGISTRY_KEY,
  MINIMAP_ALERT_EVENT,
  MINIMAP_NAVIGATE_EVENT,
  MINIMAP_ENTITIES_CHANGED_EVENT,
  MINIMAP_ENTITIES_REGISTRY_KEY,
  MINIMAP_MAP_CHANGED_EVENT,
  MINIMAP_MAP_REGISTRY_KEY,
  MINIMAP_RESOURCES_CHANGED_EVENT,
  MINIMAP_RESOURCES_REGISTRY_KEY,
  MINIMAP_VISIBILITY_CHANGED_EVENT,
  MINIMAP_VISIBILITY_REGISTRY_KEY,
  MINIMAP_VIEWPORT_CHANGED_EVENT,
  MINIMAP_VIEWPORT_REGISTRY_KEY,
  PLAYER_ECONOMY_CHANGED_EVENT,
  PLAYER_ECONOMY_REGISTRY_KEY,
  SELECTED_ENTITY_CHANGED_EVENT,
  SELECTED_ENTITY_REGISTRY_KEY,
  VIRTUAL_CURSOR_CHANGED_EVENT,
  VIRTUAL_CURSOR_REGISTRY_KEY,
  type BattlefieldSummaryActionView,
  type BattlefieldSummaryView,
  type DragSelectionView,
  type ActionTriggerSource,
  type GamePlaybackControlView,
  type GamePlaybackView,
  type MinimapAlertView,
  type MinimapMapView,
  type MinimapResourcesView,
  type MinimapViewportView,
  type MinimapEntitiesView,
  type MinimapVisibilityView,
  type PlayerEconomyView,
  type SelectedEntitiesView,
  type SelectedEntityView,
  type VirtualCursorView,
} from "../hud.js";
import type { GameLaunchContext } from "../session.js";
import {
  ORIGINAL_OBJECTIVE_PANEL_FRAME_ASSET,
} from "../originalObjectivePanelLayout.js";
import {
  createMinimapGeometry,
  createMinimapFogTexture,
  drawMinimapEntityMarker,
  drawMinimapResourceMarker,
  drawMinimapTerrainCache,
  getMinimapDiamondPoints,
  getMinimapWorldPoint,
  gridToMinimap,
  worldToMinimap,
  type MinimapFogTexture,
  type MinimapGeometry,
} from "../ui/minimap.js";
import { drawActionGrid, getEnabledActionForHotkey } from "../ui/actionGrid.js";
import { ORIGINAL_COMMAND_ICON_ASSETS } from "../ui/sourceFogAndCommandAssets.js";
import { resolveProductActionGridLayoutForScenario } from "../ui/actionGridLayoutPolicy.js";
import { drawPanelFrame, HUD_TEXT_STYLE, type PanelBounds } from "../ui/hudPanel.js";
import {
  emitK01ObjectiveModalActionRequest,
  ObjectiveModalActionBridge,
  ObjectiveModalRequestState,
  resolveK01ObjectiveModalActionCandidate,
} from "../ui/objectiveModalActionBridge.js";
import {
  OBJECTIVE_MODAL_FRAME_TEXTURE_KEY,
  ObjectiveModalPresenterController,
  openK01ObjectiveModalRequest,
} from "../ui/objectiveModalPresenter.js";
import {
  createPhaserObjectiveModalPresenterHost,
} from "../ui/objectiveModalPhaserView.js";
import { drawSelectionPanel } from "../ui/selectionPanel.js";

const VIRTUAL_CURSOR_SIZE = 15;
const MINIMAP_ALERT_DURATION_MS = 3_200;

interface ActiveMinimapAlert extends MinimapAlertView {
  createdAt: number;
  expiresAt: number;
}

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
  private minimapResources: MinimapResourcesView = { resources: [] };
  private minimapVisibility: MinimapVisibilityView | null = null;
  private minimapGeometry: MinimapGeometry | null = null;
  private minimapTerrainGraphics: Phaser.GameObjects.RenderTexture | null = null;
  private minimapFog: MinimapFogTexture | null = null;
  private minimapResourceGraphics: Phaser.GameObjects.Graphics | null = null;
  private minimapObjectiveGraphics: Phaser.GameObjects.Graphics | null = null;
  private minimapEntityGraphics: Phaser.GameObjects.Graphics | null = null;
  private minimapAlertGraphics: Phaser.GameObjects.Graphics | null = null;
  private minimapViewportGraphics: Phaser.GameObjects.Graphics | null = null;
  private minimapBorderGraphics: Phaser.GameObjects.Graphics | null = null;
  private minimapZoomText: Phaser.GameObjects.Text | null = null;
  private economyText: Phaser.GameObjects.Text | null = null;
  private battlefieldSummaryText: Phaser.GameObjects.Text | null = null;
  private playbackControlContainer: Phaser.GameObjects.Container | null = null;
  private playbackAudioText: Phaser.GameObjects.Text | null = null;
  private playbackPauseText: Phaser.GameObjects.Text | null = null;
  private playbackSpeedText: Phaser.GameObjects.Text | null = null;
  private isMinimapNavigating = false;
  private readonly minimapAlerts: ActiveMinimapAlert[] = [];
  private playerEconomy: PlayerEconomyView | null = null;
  private battlefieldSummary: BattlefieldSummaryView | null = null;
  private gamePlayback: GamePlaybackView = { paused: false, speed: 1, controllable: false, audioMuted: false };
  private objectiveModalActionBridge: ObjectiveModalActionBridge | null = null;
  private objectiveModalPresenter: ObjectiveModalPresenterController | null = null;
  private readonly objectiveModalRequestState = new ObjectiveModalRequestState();

  constructor() {
    super("ui");
  }

  preload(): void {
    if (!this.textures.exists(OBJECTIVE_MODAL_FRAME_TEXTURE_KEY)) {
      this.load.image(
        OBJECTIVE_MODAL_FRAME_TEXTURE_KEY,
        ORIGINAL_OBJECTIVE_PANEL_FRAME_ASSET,
      );
    }
    for (const asset of ORIGINAL_COMMAND_ICON_ASSETS) {
      if (!this.textures.exists(asset.textureKey)) {
        this.load.image(asset.textureKey, asset.assetPath);
      }
    }
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
    this.minimapResources =
      (this.registry.get(MINIMAP_RESOURCES_REGISTRY_KEY) as MinimapResourcesView | null | undefined) ?? this.minimapResources;
    this.minimapVisibility =
      (this.registry.get(MINIMAP_VISIBILITY_REGISTRY_KEY) as MinimapVisibilityView | null | undefined) ?? null;
    this.playerEconomy = (this.registry.get(PLAYER_ECONOMY_REGISTRY_KEY) as PlayerEconomyView | null | undefined) ?? null;
    this.battlefieldSummary =
      (this.registry.get(BATTLEFIELD_SUMMARY_REGISTRY_KEY) as BattlefieldSummaryView | null | undefined) ?? null;
    this.gamePlayback =
      (this.registry.get(GAME_PLAYBACK_REGISTRY_KEY) as GamePlaybackView | null | undefined) ?? this.gamePlayback;
    this.objectiveModalRequestState.close();
    this.objectiveModalPresenter?.shutdown();
    this.objectiveModalPresenter = new ObjectiveModalPresenterController(
      createPhaserObjectiveModalPresenterHost(this),
      this.handleObjectiveModalDismissed,
    );
    this.objectiveModalPresenter.start();
    this.objectiveModalActionBridge?.stop();
    this.objectiveModalActionBridge = new ObjectiveModalActionBridge(
      this.game.events,
      this.handleObjectiveModalAction,
    );
    this.objectiveModalActionBridge.start();

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
    this.game.events.on(MINIMAP_RESOURCES_CHANGED_EVENT, this.handleMinimapResourcesChanged, this);
    this.game.events.on(MINIMAP_VISIBILITY_CHANGED_EVENT, this.handleMinimapVisibilityChanged, this);
    this.game.events.on(MINIMAP_ALERT_EVENT, this.handleMinimapAlert, this);
    this.game.events.on(PLAYER_ECONOMY_CHANGED_EVENT, this.handlePlayerEconomyChanged, this);
    this.game.events.on(BATTLEFIELD_SUMMARY_CHANGED_EVENT, this.handleBattlefieldSummaryChanged, this);
    this.game.events.on(GAME_PLAYBACK_CHANGED_EVENT, this.handleGamePlaybackChanged, this);
    this.input.on("pointerdown", this.handlePointerDown, this);
    this.input.on("pointermove", this.handlePointerMove, this);
    this.input.on("pointerup", this.handlePointerUp, this);
    this.input.keyboard?.on("keydown", this.handleKeyDown, this);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
  }

  override update(time: number): void {
    this.updateMinimapAlertOverlay(time);
  }

  private handleSelectionChanged(selection: SelectedEntitiesView | SelectedEntityView | null): void {
    this.selectedEntities = this.normalizeSelection(selection);

    if (!this.redrawSelectionPanel() || !this.redrawActionGrid()) {
      this.drawHud();
    }
  }

  private readonly handleObjectiveModalAction = (
    action: unknown,
  ): void => {
    if (!this.objectiveModalPresenter || !this.launchContext) {
      throw new Error(
        "objective modal action cannot be presented before UIScene lifecycle initialization",
      );
    }

    const opened = openK01ObjectiveModalRequest({
      action,
      source: this.launchContext,
      requestState: this.objectiveModalRequestState,
      presenter: this.objectiveModalPresenter,
    });
    if (opened) {
      this.isMinimapNavigating = false;
    }
  };

  private readonly handleObjectiveModalDismissed = (): void => {
    this.objectiveModalRequestState.close();
  };

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

  private handleMinimapResourcesChanged(view: MinimapResourcesView): void {
    this.minimapResources = view;
    this.drawMinimapResourcesOverlay();
  }

  private handleMinimapVisibilityChanged(view: MinimapVisibilityView): void {
    this.minimapVisibility = view;
    this.updateMinimapFogOverlay();
  }

  private handleMinimapAlert(view: MinimapAlertView): void {
    const now = this.time.now;
    const existingIndex = this.minimapAlerts.findIndex((alert) => alert.id === view.id);
    const alert: ActiveMinimapAlert = {
      ...view,
      position: { ...view.position },
      createdAt: now,
      expiresAt: now + MINIMAP_ALERT_DURATION_MS,
    };

    if (existingIndex >= 0) {
      this.minimapAlerts.splice(existingIndex, 1, alert);
    } else {
      this.minimapAlerts.push(alert);
    }

    while (this.minimapAlerts.length > 12) {
      this.minimapAlerts.shift();
    }

    this.drawMinimapAlertOverlay(now);
  }

  private handlePlayerEconomyChanged(view: PlayerEconomyView): void {
    this.playerEconomy = view;
    this.updateEconomyText();
    this.redrawActionGrid();
  }

  private handleBattlefieldSummaryChanged(view: BattlefieldSummaryView): void {
    this.battlefieldSummary = view;
    this.updateBattlefieldSummaryText();
  }

  private handleGamePlaybackChanged(view: GamePlaybackView): void {
    const controllableChanged = this.gamePlayback.controllable !== view.controllable;
    const objectiveInteractionChanged =
      (this.gamePlayback.controllable && !this.gamePlayback.paused) !==
      (view.controllable && !view.paused);

    this.gamePlayback = view;

    if ((controllableChanged || objectiveInteractionChanged) && this.hudContainer) {
      this.drawHud();
      return;
    }

    this.updatePlaybackControls();
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.isObjectiveModalActive()) {
      return;
    }
    if (!this.isLeftButtonEvent(pointer)) {
      return;
    }

    const point = this.getPointerScreenPoint(pointer);

    this.isMinimapNavigating = this.emitMinimapNavigationAt(point);
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.isObjectiveModalActive()) {
      return;
    }
    if (!this.isMinimapNavigating || this.virtualCursor.locked) {
      return;
    }

    this.emitMinimapNavigationAt(this.getPointerScreenPoint(pointer), true);
  }

  private handlePointerUp(): void {
    if (this.isObjectiveModalActive()) {
      return;
    }
    this.isMinimapNavigating = false;
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (this.isObjectiveModalActive()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }

    const actionId = getEnabledActionForHotkey(event.key, this.selectedEntities, this.playerEconomy);

    if (!actionId) {
      return;
    }

    event.preventDefault();
    this.emitActionTriggered(actionId, "hotkey");
  }

  private getPointerScreenPoint(pointer: Phaser.Input.Pointer): Phaser.Math.Vector2 {
    return this.virtualCursor.locked
      ? new Phaser.Math.Vector2(this.virtualCursor.x, this.virtualCursor.y)
      : new Phaser.Math.Vector2(pointer.x, pointer.y);
  }

  private emitMinimapNavigationAt(point: Phaser.Math.Vector2, clampToMinimap = false): boolean {
    if (this.isObjectiveModalActive()) {
      return false;
    }
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
    this.objectiveModalActionBridge?.stop();
    this.objectiveModalActionBridge = null;
    this.objectiveModalPresenter?.shutdown();
    this.objectiveModalPresenter = null;
    this.objectiveModalRequestState.close();
    this.game.events.off(SELECTED_ENTITY_CHANGED_EVENT, this.handleSelectionChanged, this);
    this.game.events.off(DRAG_SELECTION_CHANGED_EVENT, this.handleDragSelectionChanged, this);
    this.game.events.off(VIRTUAL_CURSOR_CHANGED_EVENT, this.handleVirtualCursorChanged, this);
    this.game.events.off(MINIMAP_MAP_CHANGED_EVENT, this.handleMinimapMapChanged, this);
    this.game.events.off(MINIMAP_VIEWPORT_CHANGED_EVENT, this.handleMinimapViewportChanged, this);
    this.game.events.off(MINIMAP_ENTITIES_CHANGED_EVENT, this.handleMinimapEntitiesChanged, this);
    this.game.events.off(MINIMAP_RESOURCES_CHANGED_EVENT, this.handleMinimapResourcesChanged, this);
    this.game.events.off(MINIMAP_VISIBILITY_CHANGED_EVENT, this.handleMinimapVisibilityChanged, this);
    this.game.events.off(MINIMAP_ALERT_EVENT, this.handleMinimapAlert, this);
    this.game.events.off(PLAYER_ECONOMY_CHANGED_EVENT, this.handlePlayerEconomyChanged, this);
    this.game.events.off(BATTLEFIELD_SUMMARY_CHANGED_EVENT, this.handleBattlefieldSummaryChanged, this);
    this.game.events.off(GAME_PLAYBACK_CHANGED_EVENT, this.handleGamePlaybackChanged, this);
    this.input.off("pointerdown", this.handlePointerDown, this);
    this.input.off("pointermove", this.handlePointerMove, this);
    this.input.off("pointerup", this.handlePointerUp, this);
    this.input.keyboard?.off("keydown", this.handleKeyDown, this);
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.minimapFog?.destroy();
    this.minimapFog = null;
    this.minimapResourceGraphics?.destroy();
    this.minimapResourceGraphics = null;
    this.minimapObjectiveGraphics?.destroy();
    this.minimapObjectiveGraphics = null;
    this.minimapAlertGraphics?.destroy();
    this.minimapAlertGraphics = null;
    this.minimapAlerts.length = 0;
    this.hudContainer?.destroy(true);
    this.hudContainer = null;
    this.selectionPanelContainer = null;
    this.actionGridContainer = null;
    this.selectionPanelBounds = null;
    this.actionGridBounds = null;
    this.playbackControlContainer = null;
    this.playbackAudioText = null;
    this.playbackPauseText = null;
    this.playbackSpeedText = null;
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
    this.minimapFog?.destroy();
    this.minimapFog = null;
    this.hudContainer?.destroy(true);
    this.selectionPanelContainer = null;
    this.actionGridContainer = null;
    this.selectionPanelBounds = null;
    this.actionGridBounds = null;
    this.minimapTerrainGraphics = null;
    this.minimapResourceGraphics = null;
    this.minimapObjectiveGraphics = null;
    this.minimapEntityGraphics = null;
    this.minimapAlertGraphics = null;
    this.minimapViewportGraphics = null;
    this.minimapBorderGraphics = null;
    this.minimapZoomText = null;
    this.economyText = null;
    this.battlefieldSummaryText = null;
    this.playbackControlContainer = null;
    this.playbackAudioText = null;
    this.playbackPauseText = null;
    this.playbackSpeedText = null;
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
    const layout = resolveProductActionGridLayoutForScenario(this.launchContext?.scenario?.id);
    drawActionGrid(
      this,
      panelContainer,
      graphics,
      this.actionGridBounds,
      this.selectedEntities,
      this.playerEconomy,
      (actionId) => {
        this.emitActionTriggered(actionId, "button");
      },
      layout,
    );

    return true;
  }

  private emitActionTriggered(actionId: ActionDefinitionId, source: ActionTriggerSource): void {
    if (this.isObjectiveModalActive()) {
      return;
    }
    this.game.events.emit(ACTION_TRIGGERED_EVENT, {
      actionId,
      selectedEntityIds: this.selectedEntities.map((selection) => selection.id),
      source,
    });
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
    drawPanelFrame(this, container, graphics, { x, y, width, height }, "미니맵");

    this.minimapTerrainGraphics?.destroy();
    this.minimapFog?.destroy();
    this.minimapResourceGraphics?.destroy();
    this.minimapObjectiveGraphics?.destroy();
    this.minimapEntityGraphics?.destroy();
    this.minimapAlertGraphics?.destroy();
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
    this.minimapResourceGraphics = this.add.graphics().setScrollFactor(0).setDepth(1002.5);
    this.minimapFog = createMinimapFogTexture(this, "minimap-fog", mapDefinition, geometry);
    this.minimapObjectiveGraphics = this.add.graphics().setScrollFactor(0).setDepth(1004);
    this.minimapEntityGraphics = this.add.graphics().setScrollFactor(0).setDepth(1005);
    this.minimapAlertGraphics = this.add.graphics().setScrollFactor(0).setDepth(1006);
    this.minimapViewportGraphics = this.add.graphics().setScrollFactor(0).setDepth(1007);
    this.minimapBorderGraphics = this.add.graphics().setScrollFactor(0).setDepth(1008);
    container.add([
      this.minimapTerrainGraphics,
      this.minimapResourceGraphics,
      this.minimapFog.image,
      this.minimapObjectiveGraphics,
      this.minimapEntityGraphics,
      this.minimapAlertGraphics,
      this.minimapViewportGraphics,
      this.minimapBorderGraphics,
    ]);
    this.minimapZoomText = this.add.text(x + 18, y + height - 24, "", { ...HUD_TEXT_STYLE, fontSize: "11px", color: "#7f9b91" });
    container.add(this.minimapZoomText);

    if (this.perfEnabled()) console.time("minimap terrain cache");
    const terrainGraphics = this.add.graphics();
    drawMinimapTerrainCache(terrainGraphics, mapDefinition, geometry);
    this.minimapTerrainGraphics.draw(terrainGraphics, 0, 0);
    terrainGraphics.destroy();
    if (this.perfEnabled()) console.timeEnd("minimap terrain cache");
    this.drawMinimapResourcesOverlay();
    this.updateMinimapFogOverlay();
    this.drawMinimapObjectiveOverlay();
    this.drawMinimapEntitiesOverlay();
    this.drawMinimapAlertOverlay(this.time.now);
    this.drawMinimapViewportOverlay();
    this.minimapBorderGraphics.lineStyle(2, 0xd0b46a, 0.85);
    this.minimapBorderGraphics.strokePoints(getMinimapDiamondPoints(geometry), true);

  }

  private updateMinimapFogOverlay(): void {
    this.minimapFog?.update(this.minimapVisibility);
  }

  private drawMinimapObjectiveOverlay(): void {
    const graphics = this.minimapObjectiveGraphics;
    const geometry = this.minimapGeometry;

    if (!graphics || !geometry) return;

    graphics.clear();

    const mapDefinition = this.minimapMap?.map ?? defaultMap;

    for (const objective of this.launchContext?.scenario?.objectives ?? []) {
      if (!objective.required && !objective.defeatOnFailure) {
        continue;
      }

      if (objective.type !== "move-unit-to-area" || !objective.area) {
        continue;
      }

      this.drawMinimapObjectiveRoute(objective.routeWaypoints, geometry, mapDefinition);

      const area = objective.area;
      const points = [
        gridToMinimap({ x: area.x - 0.5, y: area.y - 0.5 }, geometry, mapDefinition),
        gridToMinimap({ x: area.x + area.width - 0.5, y: area.y - 0.5 }, geometry, mapDefinition),
        gridToMinimap({ x: area.x + area.width - 0.5, y: area.y + area.height - 0.5 }, geometry, mapDefinition),
        gridToMinimap({ x: area.x - 0.5, y: area.y + area.height - 0.5 }, geometry, mapDefinition),
      ];
      const center = gridToMinimap(
        { x: area.x + area.width / 2 - 0.5, y: area.y + area.height / 2 - 0.5 },
        geometry,
        mapDefinition,
      );

      graphics
        .fillStyle(0xf4df8e, 0.18)
        .fillPoints(points, true)
        .lineStyle(2, 0xf4df8e, 0.95)
        .strokePoints(points, true)
        .fillStyle(0x071112, 0.9)
        .fillCircle(center.x, center.y, 4.5)
        .lineStyle(2, 0xf4df8e, 0.95)
        .strokeCircle(center.x, center.y, 7);
    }
  }

  private drawMinimapObjectiveRoute(
    routeWaypoints: readonly GridPoint[] | undefined,
    geometry: MinimapGeometry,
    mapDefinition: Pick<MapDefinition, "width" | "height">,
  ): void {
    const graphics = this.minimapObjectiveGraphics;

    if (!graphics || !routeWaypoints || routeWaypoints.length < 2) {
      return;
    }

    const points = routeWaypoints.map((point) => gridToMinimap(point, geometry, mapDefinition));

    graphics
      .lineStyle(4, 0x071112, 0.74)
      .strokePoints(points, false)
      .lineStyle(2, 0xf4df8e, 0.92)
      .strokePoints(points, false);

    for (const point of points.slice(1, -1)) {
      graphics
        .fillStyle(0x071112, 0.9)
        .fillCircle(point.x, point.y, 3.5)
        .lineStyle(1.5, 0xf4df8e, 0.94)
        .strokeCircle(point.x, point.y, 5.5);
    }
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
    this.minimapZoomText?.setText(`시야 ${viewport.zoom.toFixed(2)}x`);
  }

  private drawMinimapResourcesOverlay(): void {
    const geometry = this.minimapGeometry;

    if (!this.minimapResourceGraphics || !geometry) return;

    const graphics = this.minimapResourceGraphics;
    const mapDefinition = this.minimapMap?.map ?? defaultMap;
    graphics.clear();
    this.minimapResources.resources.forEach((resource) => {
      const marker = gridToMinimap(resource.position, geometry, mapDefinition);
      drawMinimapResourceMarker(graphics, resource, marker);
    });
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

  private updateMinimapAlertOverlay(time: number): void {
    if (this.minimapAlerts.length === 0) {
      return;
    }

    for (let index = this.minimapAlerts.length - 1; index >= 0; index -= 1) {
      const alert = this.minimapAlerts[index];

      if (alert && alert.expiresAt <= time) {
        this.minimapAlerts.splice(index, 1);
      }
    }

    this.drawMinimapAlertOverlay(time);
  }

  private drawMinimapAlertOverlay(time: number): void {
    const graphics = this.minimapAlertGraphics;
    const geometry = this.minimapGeometry;

    if (!graphics || !geometry) return;

    graphics.clear();

    if (this.minimapAlerts.length === 0) {
      return;
    }

    const mapDefinition = this.minimapMap?.map ?? defaultMap;

    for (const alert of this.minimapAlerts) {
      const remaining = Phaser.Math.Clamp((alert.expiresAt - time) / MINIMAP_ALERT_DURATION_MS, 0, 1);

      if (remaining <= 0) {
        continue;
      }

      const age = Phaser.Math.Clamp((time - alert.createdAt) / MINIMAP_ALERT_DURATION_MS, 0, 1);
      const marker = gridToMinimap(alert.position, geometry, mapDefinition);
      const color = alert.severity === "critical" ? 0xfff0b2 : 0xff8c73;
      const radius = (alert.severity === "critical" ? 7 : 5) + age * 14;
      const pulse = 1 + Math.sin(age * Math.PI * 8) * 0.1;
      const alpha = 0.12 + remaining * 0.68;

      graphics
        .lineStyle(2, color, alpha)
        .strokeCircle(marker.x, marker.y, radius * pulse)
        .fillStyle(0xf17c63, 0.12 + remaining * 0.3)
        .fillCircle(marker.x, marker.y, alert.severity === "critical" ? 4.2 : 3.4)
        .lineStyle(1, 0xffddd6, 0.28 + remaining * 0.4)
        .lineBetween(marker.x - 5, marker.y, marker.x + 5, marker.y)
        .lineBetween(marker.x, marker.y - 5, marker.x, marker.y + 5);
    }
  }

  private perfEnabled(): boolean {
    return new URLSearchParams(globalThis.location?.search ?? "").get("perf") === "1";
  }

  private drawSessionStrip(container: Phaser.GameObjects.Container, hudTop: number): void {
    const context = this.launchContext;

    if (!context) {
      return;
    }

    const mode = context.scenarioType === "campaign" ? "캠페인" : "스커미시";
    const map = this.getSessionMapLabel(context);
    const status = context.serverOnline ? "서버 연결" : "로컬 진행";
    const session = context.session?.id ?? "싱글플레이";
    const aiStatus = (context.aiPlayerIds?.length ?? 0) > 0
      ? `CPU ${this.getAiDifficultyLabel(context.aiDifficulty ?? "normal")}`
      : "CPU 없음";
    const sessionLabel = session === "싱글플레이" ? status : `${status} · ${session}`;

    container.add(
      this.add
        .text(this.scale.width / 2, hudTop + 4, `${mode}  ·  ${map}  ·  ${aiStatus}  ·  ${sessionLabel}`, {
          ...HUD_TEXT_STYLE,
          fontSize: "11px",
          color: context.serverOnline ? "#8bd59b" : "#b5a06b",
        })
        .setOrigin(0.5, 0),
    );

    this.economyText = this.add
      .text(28, hudTop + 4, "", {
        ...HUD_TEXT_STYLE,
        fontSize: "11px",
        color: "#dbe9d3",
      })
      .setOrigin(0, 0);
    container.add(this.economyText);
    this.updateEconomyText();
    this.battlefieldSummaryText = this.add
      .text(28, hudTop + 16, "", {
        ...HUD_TEXT_STYLE,
        fontSize: "10px",
        color: "#9ec1b0",
      })
      .setOrigin(0, 0)
      .on("pointerup", this.handleBattlefieldSummaryPointerUp, this);
    container.add(this.battlefieldSummaryText);
    this.updateBattlefieldSummaryText();
    this.drawObjectiveModalRequestControl(container, hudTop);
    this.drawPlaybackControls(container, hudTop);
  }

  private drawObjectiveModalRequestControl(
    container: Phaser.GameObjects.Container,
    hudTop: number,
  ): void {
    if (!this.resolveObjectiveModalActionCandidate()) {
      return;
    }

    const width = 52;
    const height = 20;
    const x = this.scale.width - 236;
    const y = hudTop + 2;
    const graphics = this.add.graphics().setScrollFactor(0);
    graphics
      .fillStyle(0x102428, 0.96)
      .fillRoundedRect(x, y, width, height, 5)
      .lineStyle(1, 0xb89e5e, 0.9)
      .strokeRoundedRect(x, y, width, height, 5);
    container.add(graphics);
    container.add(
      this.add
        .text(x + width / 2, y + 3, "목표", {
          ...HUD_TEXT_STYLE,
          fontSize: "11px",
          color: "#f1dfaa",
        })
        .setOrigin(0.5, 0),
    );
    container.add(
      this.add
        .zone(x, y, width, height)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true })
        .on("pointerup", this.handleObjectiveModalRequest, this),
    );
  }

  private handleObjectiveModalRequest(): void {
    const action = this.resolveObjectiveModalActionCandidate();
    if (action) {
      emitK01ObjectiveModalActionRequest(this.game.events, action);
    }
  }

  private resolveObjectiveModalActionCandidate(): ReturnType<
    typeof resolveK01ObjectiveModalActionCandidate
  > {
    const scenario = this.launchContext?.scenario;
    if (!scenario) {
      return null;
    }

    return resolveK01ObjectiveModalActionCandidate({
      scenarioId: scenario.id,
      interactionEnabled:
        this.gamePlayback.controllable && !this.gamePlayback.paused,
      objectiveIds: scenario.objectives.map((objective) => objective.id),
    });
  }

  private getSessionMapLabel(context: GameLaunchContext): string {
    const mapId = context.mapId ?? context.mapDefinition?.id;

    if (!mapId) {
      return "기본 맵";
    }

    const randomSeed = getRandomSkirmishMapSeed(mapId);

    if (randomSeed !== null) {
      return `랜덤 ${randomSeed.toString(36).toUpperCase()}`;
    }

    return context.mapDefinition?.name ?? mapId;
  }

  private drawPlaybackControls(container: Phaser.GameObjects.Container, hudTop: number): void {
    const controls = this.add.container(0, 0).setScrollFactor(0);
    const graphics = this.add.graphics().setScrollFactor(0);
    const y = hudTop + 2;
    const buttonSize = 20;
    const speedWidth = 44;
    const gap = 6;
    const totalWidth = buttonSize * 4 + speedWidth + gap * 4;
    let x = this.scale.width - 28 - totalWidth;

    this.playbackControlContainer = controls;
    controls.add(graphics);
    container.add(controls);

    this.playbackAudioText = this.drawPlaybackButton(
      controls,
      graphics,
      x,
      y,
      buttonSize,
      this.getPlaybackAudioLabel(),
      "toggle-audio",
      true,
    );
    x += buttonSize + gap;
    this.drawPlaybackButton(controls, graphics, x, y, buttonSize, "-", "speed-down");
    x += buttonSize + gap;
    this.playbackPauseText = this.drawPlaybackButton(controls, graphics, x, y, buttonSize, this.gamePlayback.paused ? ">" : "||", "toggle-pause");
    x += buttonSize + gap;

    graphics
      .fillStyle(0x071112, 0.92)
      .fillRoundedRect(x, y, speedWidth, buttonSize, 5)
      .lineStyle(1, 0x315158, 0.88)
      .strokeRoundedRect(x, y, speedWidth, buttonSize, 5);
    this.playbackSpeedText = this.add
      .text(x + speedWidth / 2, y + 3, this.getPlaybackSpeedLabel(), {
        ...HUD_TEXT_STYLE,
        fontSize: "11px",
        color: "#dbe9d3",
      })
      .setOrigin(0.5, 0);
    controls.add(this.playbackSpeedText);
    x += speedWidth + gap;

    this.drawPlaybackButton(controls, graphics, x, y, buttonSize, "+", "speed-up");
    this.updatePlaybackControls();
  }

  private drawPlaybackButton(
    container: Phaser.GameObjects.Container,
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    size: number,
    label: string,
    controlType: GamePlaybackControlView["type"],
    enabled = this.gamePlayback.controllable,
  ): Phaser.GameObjects.Text {
    graphics
      .fillStyle(enabled ? 0x102428 : 0x071112, enabled ? 0.96 : 0.58)
      .fillRoundedRect(x, y, size, size, 5)
      .lineStyle(1, enabled ? 0xb89e5e : 0x315158, enabled ? 0.9 : 0.45)
      .strokeRoundedRect(x, y, size, size, 5);

    const text = this.add
      .text(x + size / 2, y + 2, label, {
        ...HUD_TEXT_STYLE,
        fontSize: "12px",
        color: enabled ? "#f1dfaa" : "#657b75",
        align: "center",
      })
      .setOrigin(0.5, 0);
    container.add(text);

    if (enabled) {
      container.add(
        this.add
          .zone(x, y, size, size)
          .setOrigin(0, 0)
          .setInteractive({ useHandCursor: true })
          .on("pointerup", () => {
            this.emitPlaybackControl(controlType);
          }),
      );
    }

    return text;
  }

  private updatePlaybackControls(): void {
    this.playbackAudioText?.setText(this.getPlaybackAudioLabel());
    this.playbackPauseText?.setText(this.gamePlayback.paused ? ">" : "||");
    this.playbackSpeedText?.setText(this.getPlaybackSpeedLabel());
  }

  private getPlaybackAudioLabel(): string {
    return this.gamePlayback.audioMuted ? "x" : "♪";
  }

  private getPlaybackSpeedLabel(): string {
    return `${this.gamePlayback.speed.toFixed(this.gamePlayback.speed % 1 === 0 ? 0 : 1)}x`;
  }

  private updateEconomyText(): void {
    if (!this.economyText) {
      return;
    }

    if (!this.playerEconomy) {
      this.economyText.setText("");
      return;
    }

    const { resources, population } = this.playerEconomy;
    this.economyText.setText(
      `식 ${Math.floor(resources.food)}  목 ${Math.floor(resources.wood)}  금 ${Math.floor(resources.gold)}  석 ${Math.floor(resources.stone)}  인 ${population.used + population.pending}/${population.cap}`,
    );
  }

  private updateBattlefieldSummaryText(): void {
    if (!this.battlefieldSummaryText) {
      return;
    }

    if (!this.battlefieldSummary) {
      this.battlefieldSummaryText.setText("");
      this.battlefieldSummaryText.disableInteractive();
      return;
    }

    const { local, visibleEnemy, environment } = this.battlefieldSummary;
    this.battlefieldSummaryText.setText(
      `병 ${local.fighters}  농 ${local.workers}  유휴 ${local.idleWorkers}  건 ${local.buildings}  적 ${visibleEnemy.units}/${visibleEnemy.buildings}  ${this.getEnvironmentLabel(environment)}`,
    );

    if (local.idleWorkers > 0) {
      if (!this.battlefieldSummaryText.input?.enabled) {
        this.battlefieldSummaryText.setInteractive({ useHandCursor: true });
      }
      this.battlefieldSummaryText.setColor("#c9e7b4");
    } else {
      this.battlefieldSummaryText.disableInteractive();
      this.battlefieldSummaryText.setColor("#9ec1b0");
    }
  }

  private handleBattlefieldSummaryPointerUp(): void {
    if (this.isObjectiveModalActive()) {
      return;
    }
    if ((this.battlefieldSummary?.local.idleWorkers ?? 0) <= 0) {
      return;
    }

    this.game.events.emit(BATTLEFIELD_SUMMARY_ACTION_EVENT, {
      type: "select-idle-worker",
    } satisfies BattlefieldSummaryActionView);
  }

  private emitPlaybackControl(controlType: GamePlaybackControlView["type"]): void {
    if (this.isObjectiveModalActive()) {
      return;
    }

    this.game.events.emit(GAME_PLAYBACK_CONTROL_EVENT, {
      type: controlType,
    } satisfies GamePlaybackControlView);
  }

  private isObjectiveModalActive(): boolean {
    return this.objectiveModalPresenter?.active ?? false;
  }

  private getEnvironmentLabel(environment: BattlefieldSummaryView["environment"]): string {
    if (environment.weather === "rain") {
      return environment.dayPhase === "night" ? "비/밤" : "비";
    }

    return environment.dayPhase === "night" ? "밤" : "맑음";
  }

  private getAiDifficultyLabel(difficulty: string): string {
    switch (difficulty) {
      case "easy":
        return "쉬움";
      case "hard":
        return "어려움";
      case "normal":
      default:
        return "보통";
    }
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
