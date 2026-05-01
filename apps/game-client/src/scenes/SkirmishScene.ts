import Phaser from "phaser";
import {
  defaultMap,
  defaultTheme,
  ELEVATION_NEIGHBOR_OFFSETS,
  factionDefinitions,
  getThemeAssetUrl,
  getThemeFrameRefs,
  getTerrainVisual,
  getTileAt,
  resolveElevationTerrainSlot,
  terrainDefinitions,
  terrainTypes,
  unitCanPerformAction,
  unitDefinitions,
  type CommandEnvelope,
  type ElevationNeighbor,
  type FactionId,
  type FrameRef,
  type GridPoint,
  type MapDefinition,
  type ThemeDefinition,
  type TerrainKindSlot,
  type TerrainType,
  type TerrainVisual,
  type ThemeFrameRef,
} from "@shared";
import {
  cartToIso,
  createPlayerVisibility,
  createInitialWorldState,
  getTileVisibility,
  isoToCart,
  TileVisibility,
  updatePlayerVisibilityWithChanges,
  type PlayerVisibilityState,
  type UnitState,
  type WorldState,
} from "@simulation";
import {
  ACTION_TRIGGERED_EVENT,
  DRAG_SELECTION_CHANGED_EVENT,
  MINIMAP_NAVIGATE_EVENT,
  MINIMAP_ENTITIES_CHANGED_EVENT,
  MINIMAP_ENTITIES_REGISTRY_KEY,
  MINIMAP_MAP_CHANGED_EVENT,
  MINIMAP_MAP_REGISTRY_KEY,
  MINIMAP_VISIBILITY_CHANGED_EVENT,
  MINIMAP_VISIBILITY_REGISTRY_KEY,
  MINIMAP_VIEWPORT_CHANGED_EVENT,
  MINIMAP_VIEWPORT_REGISTRY_KEY,
  SELECTED_ENTITY_CHANGED_EVENT,
  SELECTED_ENTITY_REGISTRY_KEY,
  VIRTUAL_CURSOR_CHANGED_EVENT,
  VIRTUAL_CURSOR_REGISTRY_KEY,
  type ActionTriggeredView,
  type DragSelectionView,
  type MinimapPoint,
  toSelectedEntityView,
} from "../hud.js";
import { createSessionTransport, type SessionTransport } from "../net/SessionTransport.js";
import { placeStaticVisual } from "../render/placeStaticVisual.js";
import { getAssetScale, getFrameOrigin, getFramePivot, REFERENCE_PX_PER_WU, RENDER_DEPTH_BIAS } from "../render/visualScale.js";
import type { GameLaunchContext } from "../session.js";

const DRAG_THRESHOLD_SQ = 36;
const EDGE_PAN_SIZE = 28;
const EDGE_PAN_SPEED = 520;
const TERRAIN_CHUNK_SIZE = 16;
const VIEWPORT_EVENT_INTERVAL_MS = 1000 / 30;
const SCREEN_OVERLAY_DEPTH = 1_000_000;
const FOG_UNEXPLORED_ALPHA = 0.9;
const FOG_EXPLORED_ALPHA = 0.48;
const TERRAIN_DEBUG_DETAILS_STORAGE_KEY = "isorts.debug.terrainDetails";

interface UnitRenderable {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Graphics;
  selectionRing: Phaser.GameObjects.Graphics;
}

interface FogChunkBounds {
  chunkX: number;
  chunkY: number;
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
  width: number;
  height: number;
  depth: number;
}

interface TerrainDebugAssetInfo {
  label: string;
  visualId: string | null;
  slot: TerrainKindSlot | "base" | null;
  fileName: string | null;
  textureKey: string | null;
  loaded: boolean;
}

interface TerrainDebugTileInfo {
  point: GridPoint;
  terrain: TerrainType;
  elevation: number;
  transitionSlot: TerrainKindSlot | null;
  assets: TerrainDebugAssetInfo[];
}

export class SkirmishScene extends Phaser.Scene {
  private map: MapDefinition = defaultMap;
  private worldState: WorldState = createInitialWorldState(defaultMap, ["local-player", "cpu-1"]);
  private sessionTransport: SessionTransport | null = null;
  private lastSyncedTick = Number.NEGATIVE_INFINITY;
  private mapOrigin = new Phaser.Math.Vector2(0, 0);
  private readonly terrainChunks: Phaser.GameObjects.RenderTexture[] = [];
  private readonly terrainRenderStamps = new Map<string, Phaser.GameObjects.Image>();
  private readonly elevationFogStamps = new Map<string, Phaser.GameObjects.Image>();
  private readonly elevationOverlays: Phaser.GameObjects.Image[] = [];
  private readonly fogChunks: (Phaser.GameObjects.RenderTexture | null)[] = [];
  private readonly unitRenderables = new Map<string, UnitRenderable>();
  private readonly terrainTextureKeys = new Map<TerrainType, string>();
  private readonly fogTextureKeys = new Map<TileVisibility, string>();
  private readonly activeTheme: ThemeDefinition = defaultTheme;
  private localPlayerId = "local-player";
  private playerVisibility: PlayerVisibilityState = createPlayerVisibility(defaultMap);
  private fogChunkDirtyMask = new Uint8Array(0);
  private fogChunksPerRow = 0;
  private fogChunksPerColumn = 0;
  private terrainFogLiftPaddingPx = 0;
  private perfEnabled = false;
  private perfText: Phaser.GameObjects.Text | null = null;
  private rollingFrameMs = 0;
  private lastVisibilityDeltaMs = 0;
  private lastFogRedrawMs = 0;
  private lastFogDirtyChunkCount = 0;
  private lastFogTileDrawCount = 0;
  private lastViewportEmitAt = 0;
  private viewportDirty = false;
  private cursorKeys: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private dragStartScreen: Phaser.Math.Vector2 | null = null;
  private dragCurrentScreen: Phaser.Math.Vector2 | null = null;
  private isDragSelecting = false;
  private isLeftMouseHeld = false;
  private launchContext: GameLaunchContext | null = null;
  private isPointerLocked = false;
  private readonly virtualCursorScreen = new Phaser.Math.Vector2(0, 0);
  private readonly selectedUnitIds = new Set<string>();
  private terrainDebugEnabled = false;
  private terrainDebugPanel: HTMLDivElement | null = null;
  private terrainDebugCheckbox: HTMLInputElement | null = null;
  private terrainDebugTooltip: HTMLDivElement | null = null;
  private terrainDebugHighlight: Phaser.GameObjects.Graphics | null = null;
  private hoveredTerrainDebugTile: GridPoint | null = null;

  constructor() {
    super("skirmish");
  }

  create(data: GameLaunchContext): void {
    const players = data.session?.playerIds.length ? data.session.playerIds : ["local-player", "cpu-1"];

    this.launchContext = data;
    this.localPlayerId = players[0] ?? "local-player";
    this.perfEnabled = new URLSearchParams(globalThis.location?.search ?? "").get("perf") === "1";
    this.map = defaultMap;
    this.sessionTransport = createSessionTransport(data, this.map, players);
    this.worldState = this.sessionTransport.getSnapshot();
    this.lastSyncedTick = this.worldState.tick;
    this.playerVisibility = createPlayerVisibility(this.map);
    this.terrainFogLiftPaddingPx = this.computeTerrainFogLiftPaddingPx();
    this.configureFogChunkGrid();
    this.mapOrigin.set(this.scale.width / 2, 160);
    this.virtualCursorScreen.set(this.scale.width / 2, this.scale.height / 2);
    this.refreshLocalVisibility();

    this.cameras.main.setBackgroundColor("#143137");
    this.cameras.main.centerOn(this.mapOrigin.x, this.mapOrigin.y + (this.map.height * this.map.tileHeight) / 2);
    this.clampCameraToWorld();

    this.setupPerfOverlay();
    this.setupTerrainDebugOverlay();

    this.setupCameraControls();
    this.setupMouseControls();
    this.setupPointerLockLifecycle();
    this.ensureActiveThemeTexturesLoaded(() => {
      this.redrawTerrain();
      this.redrawElevationOverlay();
    });
    this.redrawAllFogOverlay();
    this.syncUnitRenderables();
    this.publishVirtualCursor();
    this.selectInitialUnit(this.localPlayerId);
    this.publishMinimapMap();
    this.publishMinimapVisibility();
    this.publishMinimapEntities();
    this.publishMinimapViewport(true);
  }

  override update(time: number, delta: number): void {
    this.handleCameraPan(delta);
    this.updateTerrainDebugHover();
    this.updatePerfOverlay(delta);
    this.flushViewportIfDirty(time);

    this.sessionTransport?.update(time, delta);
    const nextSnapshot = this.sessionTransport?.getSnapshot() ?? this.worldState;

    if (nextSnapshot === this.worldState && nextSnapshot.tick === this.lastSyncedTick) {
      return;
    }

    this.worldState = nextSnapshot;
    this.lastSyncedTick = nextSnapshot.tick;
    const dirtyFogChunkCount = this.refreshLocalVisibility();
    this.redrawDirtyFogOverlay(dirtyFogChunkCount);
    this.pruneMissingSelections();
    this.syncUnitRenderables();
    this.emitSelectionChanged();
    if (dirtyFogChunkCount > 0) {
      this.publishMinimapVisibility();
    }
    this.publishMinimapEntities();
  }

  private setupCameraControls(): void {
    this.input.mouse?.disableContextMenu();
    this.cursorKeys = this.input.keyboard?.createCursorKeys() ?? null;

    this.input.on(
      "wheel",
      (
        _pointer: Phaser.Input.Pointer,
        _gameObjects: Phaser.GameObjects.GameObject[],
        _deltaX: number,
        deltaY: number,
      ) => {
        const nextZoom = Phaser.Math.Clamp(this.cameras.main.zoom - deltaY * 0.001, 0.55, 1.8);
        this.cameras.main.setZoom(nextZoom);
        this.clampCameraToWorld();
        this.publishMinimapViewport(true);
      },
    );
  }

  private setupMouseControls(): void {
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.syncVirtualCursor(pointer, false);
      this.requestPointerLock();

      if (!this.isLeftButtonEvent(pointer)) {
        return;
      }

      this.isLeftMouseHeld = true;

      if (!this.isScreenPointInWorldField(this.virtualCursorScreen)) {
        return;
      }

      this.beginDragSelection();
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      this.syncVirtualCursor(pointer, true);
      this.updateDragSelection();
    });

    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      this.syncVirtualCursor(pointer, false);

      if (this.isRightButtonEvent(pointer)) {
        if (this.isScreenPointInWorldField(this.virtualCursorScreen)) {
          this.issueDefaultActionAtScreenPoint(this.virtualCursorScreen);
        }

        return;
      }

      if (this.isLeftButtonEvent(pointer) || this.isLeftMouseHeld) {
        this.isLeftMouseHeld = false;
        this.finishDragSelection();
      }
    });
  }

  private isLeftButtonEvent(pointer: Phaser.Input.Pointer): boolean {
    return pointer.button === 0 || pointer.leftButtonDown() || pointer.leftButtonReleased();
  }

  private isRightButtonEvent(pointer: Phaser.Input.Pointer): boolean {
    return pointer.button === 2 || pointer.rightButtonDown() || pointer.rightButtonReleased();
  }

  private setupPointerLockLifecycle(): void {
    this.input.manager.events.on(Phaser.Input.Events.POINTERLOCK_CHANGE, this.handlePointerLockChanged, this);
    this.game.events.on(MINIMAP_NAVIGATE_EVENT, this.handleMinimapNavigate, this);
    this.game.events.on(ACTION_TRIGGERED_EVENT, this.handleActionTriggered, this);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
  }

  private handleMinimapNavigate(target: MinimapPoint): void {
    this.centerCameraOnWorldPoint(target);
    this.publishMinimapViewport(true);
  }

  private handleActionTriggered(action: ActionTriggeredView): void {
    if (action.actionId === "stop") {
      this.issueStopCommands(action.selectedEntityIds);
      return;
    }

    console.info("Action selected", action.actionId);
  }

  private handlePointerLockChanged(_event: Event, locked: boolean): void {
    this.isPointerLocked = locked;
    if (!locked && this.isLeftMouseHeld) {
      this.isLeftMouseHeld = false;
      this.cancelDragSelection();
    }
    this.publishVirtualCursor();
  }

  private handleResize(): void {
    this.clampVirtualCursorToScreen();
    this.clampCameraToWorld();
    this.publishVirtualCursor();
    this.publishMinimapMap();
    this.publishMinimapViewport(true);
  }

  private handleShutdown(): void {
    this.input.manager.events.off(Phaser.Input.Events.POINTERLOCK_CHANGE, this.handlePointerLockChanged, this);
    this.game.events.off(MINIMAP_NAVIGATE_EVENT, this.handleMinimapNavigate, this);
    this.game.events.off(ACTION_TRIGGERED_EVENT, this.handleActionTriggered, this);
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.terrainChunks.forEach((chunk) => chunk.destroy());
    this.terrainChunks.length = 0;
    this.disposeTerrainRenderStamps();
    this.disposeElevationFogStamps();
    this.disposeElevationOverlay();
    this.disposeFogOverlay();
    this.fogChunkDirtyMask = new Uint8Array(0);
    this.fogChunksPerRow = 0;
    this.fogChunksPerColumn = 0;
    this.unitRenderables.forEach((renderable) => renderable.container.destroy(true));
    this.unitRenderables.clear();
    this.disposeTerrainDebugOverlay();
    this.sessionTransport?.dispose();
    this.sessionTransport = null;
    this.perfText?.destroy();
    this.perfText = null;
  }

  private setupPerfOverlay(): void {
    if (!this.perfEnabled) {
      return;
    }

    this.perfText = this.add
      .text(12, 12, "", { fontFamily: "monospace", fontSize: "12px", color: "#9fffa2", backgroundColor: "#0008" })
      .setScrollFactor(0)
      .setDepth(SCREEN_OVERLAY_DEPTH + 10);
  }

  private updatePerfOverlay(delta: number): void {
    if (!this.perfText) {
      return;
    }

    this.rollingFrameMs = this.rollingFrameMs === 0 ? delta : this.rollingFrameMs * 0.92 + delta * 0.08;
    this.perfText.setText(
      `fps ${this.game.loop.actualFps.toFixed(1)} | frame ${this.rollingFrameMs.toFixed(1)}ms | ` +
        `vis ${this.lastVisibilityDeltaMs.toFixed(2)}ms | fog ${this.lastFogRedrawMs.toFixed(2)}ms ` +
        `dirty ${this.lastFogDirtyChunkCount}/${this.fogChunks.length} draws ${this.lastFogTileDrawCount}`,
    );
  }

  private setupTerrainDebugOverlay(): void {
    this.terrainDebugEnabled = this.readTerrainDebugEnabled();
    this.terrainDebugHighlight = this.add.graphics().setDepth(SCREEN_OVERLAY_DEPTH - 50).setVisible(false);

    const panel = document.createElement("div");
    panel.className = "terrain-debug-panel";
    panel.setAttribute("data-debug-panel", "terrain");

    const title = document.createElement("div");
    title.className = "terrain-debug-panel__title";
    title.textContent = "DEBUG TERRAIN";

    const row = document.createElement("label");
    row.className = "terrain-debug-panel__row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = this.terrainDebugEnabled;
    checkbox.addEventListener("change", () => this.setTerrainDebugEnabled(checkbox.checked));

    const label = document.createElement("span");
    label.textContent = "지형 세부사안 tooltip 표시";

    row.append(checkbox, label);
    panel.append(title, row);

    const tooltip = document.createElement("div");
    tooltip.className = "terrain-debug-tooltip";
    tooltip.hidden = true;

    document.body.append(panel, tooltip);

    this.terrainDebugPanel = panel;
    this.terrainDebugCheckbox = checkbox;
    this.terrainDebugTooltip = tooltip;
  }

  private setTerrainDebugEnabled(enabled: boolean): void {
    this.terrainDebugEnabled = enabled;
    this.writeTerrainDebugEnabled(enabled);

    if (this.terrainDebugCheckbox && this.terrainDebugCheckbox.checked !== enabled) {
      this.terrainDebugCheckbox.checked = enabled;
    }

    if (!enabled) {
      this.hideTerrainDebugHover();
      return;
    }

    this.hoveredTerrainDebugTile = null;
    this.updateTerrainDebugHover();
  }

  private disposeTerrainDebugOverlay(): void {
    this.terrainDebugPanel?.remove();
    this.terrainDebugTooltip?.remove();
    this.terrainDebugHighlight?.destroy();
    this.terrainDebugPanel = null;
    this.terrainDebugCheckbox = null;
    this.terrainDebugTooltip = null;
    this.terrainDebugHighlight = null;
    this.hoveredTerrainDebugTile = null;
  }

  private readTerrainDebugEnabled(): boolean {
    try {
      return globalThis.localStorage?.getItem(TERRAIN_DEBUG_DETAILS_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }

  private writeTerrainDebugEnabled(enabled: boolean): void {
    try {
      globalThis.localStorage?.setItem(TERRAIN_DEBUG_DETAILS_STORAGE_KEY, enabled ? "1" : "0");
    } catch {
      // Local storage may be unavailable in privacy-restricted browser modes.
    }
  }

  private requestPointerLock(): void {
    if (!this.input.mouse?.locked) {
      this.input.mouse?.requestPointerLock();
    }
  }

  private syncVirtualCursor(pointer: Phaser.Input.Pointer, useMovement: boolean): void {
    const isLocked = this.isPointerLocked || Boolean(this.input.mouse?.locked) || pointer.locked;

    if (isLocked && useMovement) {
      this.virtualCursorScreen.x += pointer.movementX;
      this.virtualCursorScreen.y += pointer.movementY;
    } else if (!isLocked) {
      this.virtualCursorScreen.set(pointer.x, pointer.y);
    }

    this.clampVirtualCursorToScreen();
    this.publishVirtualCursor();
  }

  private clampVirtualCursorToScreen(): void {
    this.virtualCursorScreen.set(
      Phaser.Math.Clamp(this.virtualCursorScreen.x, 0, this.scale.width),
      Phaser.Math.Clamp(this.virtualCursorScreen.y, 0, this.scale.height),
    );
  }

  private publishVirtualCursor(): void {
    const cursor = {
      x: this.virtualCursorScreen.x,
      y: this.virtualCursorScreen.y,
      locked: this.isPointerLocked,
    };

    this.registry.set(VIRTUAL_CURSOR_REGISTRY_KEY, cursor);
    this.game.events.emit(VIRTUAL_CURSOR_CHANGED_EVENT, cursor);
  }

  private handleCameraPan(delta: number): void {
    const panDirection = this.getEdgePanDirection(this.virtualCursorScreen);
    panDirection.add(this.getKeyboardPanDirection());

    if (panDirection.lengthSq() === 0) {
      return;
    }

    panDirection.normalize();

    const distance = (EDGE_PAN_SPEED * delta) / 1000 / this.cameras.main.zoom;

    this.cameras.main.scrollX += panDirection.x * distance;
    this.cameras.main.scrollY += panDirection.y * distance;
    this.clampCameraToWorld();
    this.viewportDirty = true;
  }

  private getKeyboardPanDirection(): Phaser.Math.Vector2 {
    const direction = new Phaser.Math.Vector2(0, 0);

    if (!this.cursorKeys) {
      return direction;
    }

    if (this.cursorKeys.left.isDown) {
      direction.x -= 1;
    }
    if (this.cursorKeys.right.isDown) {
      direction.x += 1;
    }
    if (this.cursorKeys.up.isDown) {
      direction.y -= 1;
    }
    if (this.cursorKeys.down.isDown) {
      direction.y += 1;
    }

    return direction;
  }

  private getEdgePanDirection(point: Phaser.Math.Vector2): Phaser.Math.Vector2 {
    const direction = new Phaser.Math.Vector2(0, 0);

    if (point.x < 0 || point.x > this.scale.width || point.y < 0 || point.y > this.scale.height) {
      return direction;
    }

    if (point.x <= EDGE_PAN_SIZE) {
      direction.x = -1;
    } else if (point.x >= this.scale.width - EDGE_PAN_SIZE) {
      direction.x = 1;
    }

    if (point.y <= EDGE_PAN_SIZE) {
      direction.y = -1;
    } else if (point.y >= this.scale.height - EDGE_PAN_SIZE) {
      direction.y = 1;
    }

    return direction;
  }

  private beginDragSelection(): void {
    const start = this.getClampedFieldScreenPoint(this.virtualCursorScreen);

    this.dragStartScreen = start;
    this.dragCurrentScreen = start.clone();
    this.isDragSelecting = false;
    this.publishDragSelection(null);
  }

  private updateDragSelection(): void {
    if (!this.dragStartScreen || !this.isLeftMouseHeld) {
      return;
    }

    this.dragCurrentScreen = this.getClampedFieldScreenPoint(this.virtualCursorScreen);

    const dragDistanceSq = Phaser.Math.Distance.Squared(
      this.dragStartScreen.x,
      this.dragStartScreen.y,
      this.dragCurrentScreen.x,
      this.dragCurrentScreen.y,
    );

    if (dragDistanceSq < DRAG_THRESHOLD_SQ) {
      if (this.isDragSelecting) {
        this.isDragSelecting = false;
        this.publishDragSelection(null);
      }
      return;
    }

    this.isDragSelecting = true;
    this.publishDragSelection(this.getScreenRectangle(this.dragStartScreen, this.dragCurrentScreen));
  }

  private finishDragSelection(): void {
    if (!this.dragStartScreen) {
      return;
    }

    if (this.isDragSelecting) {
      this.dragCurrentScreen = this.getClampedFieldScreenPoint(this.virtualCursorScreen);
      this.selectUnitsInDragRectangle();
    } else if (this.isScreenPointInWorldField(this.virtualCursorScreen)) {
      this.selectSingleUnitAtScreenPoint(this.virtualCursorScreen);
    }

    this.dragStartScreen = null;
    this.dragCurrentScreen = null;
    this.isDragSelecting = false;
    this.publishDragSelection(null);
  }

  private cancelDragSelection(): void {
    this.dragStartScreen = null;
    this.dragCurrentScreen = null;
    this.isDragSelecting = false;
    this.publishDragSelection(null);
  }

  private publishDragSelection(rectangle: Phaser.Geom.Rectangle | null): void {
    const selection: DragSelectionView | null = rectangle
      ? { x: rectangle.x, y: rectangle.y, width: rectangle.width, height: rectangle.height }
      : null;

    this.game.events.emit(DRAG_SELECTION_CHANGED_EVENT, selection);
  }

  private selectSingleUnitAtScreenPoint(point: Phaser.Math.Vector2): void {
    const worldPoint = this.screenToWorldPoint(point);
    const unit = this.findUnitAtWorldPoint(worldPoint.x, worldPoint.y);

    if (!unit) {
      this.clearSelection();
      return;
    }

    this.selectUnits([unit]);
  }

  private selectUnitsInDragRectangle(): void {
    if (!this.dragStartScreen || !this.dragCurrentScreen) {
      return;
    }

    const rectangle = this.getScreenRectangle(this.dragStartScreen, this.dragCurrentScreen);
    const selectedUnits = Object.values(this.worldState.units).filter((unit) => {
      if (!this.isUnitSelectable(unit)) {
        return false;
      }

      const unitSelectionBounds = this.getUnitSelectionScreenBounds(unit);

      return Phaser.Geom.Intersects.RectangleToRectangle(rectangle, unitSelectionBounds);
    });

    this.selectUnits(selectedUnits);
  }

  private issueDefaultActionAtScreenPoint(point: Phaser.Math.Vector2): void {
    const commandableUnits = this.getSelectedUnits().filter((unit) => unitCanPerformAction(unit.kind, "move"));

    if (commandableUnits.length === 0) {
      return;
    }

    const target = this.getGridPointFromScreenPoint(point);

    commandableUnits.forEach((unit, index) => {
      const targetWithOffset = this.getFormationTarget(target, index);

      const envelope: CommandEnvelope = {
        sessionId: this.launchContext?.session?.id ?? "offline-skirmish",
        playerId: this.localPlayerId,
        issuedAtTick: this.worldState.tick,
        command: {
          type: "move",
          unitId: unit.id,
          target: targetWithOffset,
        },
      };

      void Promise.resolve(this.sessionTransport?.issueCommand(envelope)).then(() => {
        this.syncWorldFromTransport(true);
      });
    });

    this.emitSelectionChanged();
    this.syncUnitRenderables();
    this.showMoveTargetMarker(target);
    this.publishMinimapEntities();
  }

  private issueStopCommands(unitIds: readonly string[]): void {
    const commandableUnits: UnitState[] = [];

    for (const unitId of unitIds) {
      const unit = this.worldState.units[unitId];

      if (unit && unitCanPerformAction(unit.kind, "stop")) {
        commandableUnits.push(unit);
      }
    }

    if (commandableUnits.length === 0) {
      return;
    }

    const commandPromises = commandableUnits.map((unit) => {
      const envelope: CommandEnvelope = {
        sessionId: this.launchContext?.session?.id ?? "offline-skirmish",
        playerId: this.localPlayerId,
        issuedAtTick: this.worldState.tick,
        command: {
          type: "stop",
          unitId: unit.id,
        },
      };

      return Promise.resolve(this.sessionTransport?.issueCommand(envelope));
    });

    void Promise.all(commandPromises).then(() => {
      this.syncWorldFromTransport(true);
      this.emitSelectionChanged();
      this.syncUnitRenderables();
      this.publishMinimapEntities();
    });
  }

  private publishMinimapMap(): void {
    const bounds = this.getWorldFieldBounds();
    const view = { map: this.map, worldBounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } };

    this.registry.set(MINIMAP_MAP_REGISTRY_KEY, view);
    this.game.events.emit(MINIMAP_MAP_CHANGED_EVENT, view);
  }

  private publishMinimapEntities(): void {
    const view = {
      entities: Object.values(this.worldState.units)
        .filter((unit) => this.isUnitVisibleToLocalPlayer(unit))
        .map((unit) => ({
          id: unit.id,
          playerId: unit.playerId,
          faction: this.getPlayerFaction(unit.playerId),
          kind: unit.kind,
          position: { ...unit.position },
          selected: this.selectedUnitIds.has(unit.id),
        })),
    };

    this.registry.set(MINIMAP_ENTITIES_REGISTRY_KEY, view);
    this.game.events.emit(MINIMAP_ENTITIES_CHANGED_EVENT, view);
  }

  private publishMinimapVisibility(): void {
    this.registry.set(MINIMAP_VISIBILITY_REGISTRY_KEY, this.playerVisibility);
    this.game.events.emit(MINIMAP_VISIBILITY_CHANGED_EVENT, this.playerVisibility);
  }

  private publishMinimapViewport(force = false): void {
    if (!force && this.time.now - this.lastViewportEmitAt < VIEWPORT_EVENT_INTERVAL_MS) {
      this.viewportDirty = true;
      return;
    }

    const camera = this.cameras.main;
    const bounds = this.getWorldFieldBounds();
    const view = {
      viewportWorldCorners: [
        this.screenToWorldPoint(new Phaser.Math.Vector2(0, 0)),
        this.screenToWorldPoint(new Phaser.Math.Vector2(this.scale.width, 0)),
        this.screenToWorldPoint(new Phaser.Math.Vector2(this.scale.width, this.scale.height)),
        this.screenToWorldPoint(new Phaser.Math.Vector2(0, this.scale.height)),
      ].map((point) => ({ x: point.x, y: point.y })),
      worldBounds: {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      },
      zoom: camera.zoom,
    };

    this.lastViewportEmitAt = this.time.now;
    this.viewportDirty = false;
    this.registry.set(MINIMAP_VIEWPORT_REGISTRY_KEY, view);
    this.game.events.emit(MINIMAP_VIEWPORT_CHANGED_EVENT, view);
  }

  private flushViewportIfDirty(time: number): void {
    if (this.viewportDirty && time - this.lastViewportEmitAt >= VIEWPORT_EVENT_INTERVAL_MS) {
      this.publishMinimapViewport(true);
    }
  }

  private getGridPointFromScreenPoint(point: Phaser.Math.Vector2): GridPoint {
    const worldPoint = this.screenToWorldPoint(point);
    const cartPoint = isoToCart(
      {
        x: worldPoint.x - this.mapOrigin.x,
        y: worldPoint.y - this.mapOrigin.y,
      },
      this.map.tileWidth,
      this.map.tileHeight,
    );

    return this.clampGridPoint({
      x: Math.round(cartPoint.x),
      y: Math.round(cartPoint.y),
    });
  }

  private updateTerrainDebugHover(): void {
    if (!this.terrainDebugEnabled || !this.isScreenPointInWorldField(this.virtualCursorScreen) || this.isPointerOverTerrainDebugPanel()) {
      this.hideTerrainDebugHover();
      return;
    }

    const point = this.getGridPointFromScreenPoint(this.virtualCursorScreen);
    const isSameTile = this.hoveredTerrainDebugTile?.x === point.x && this.hoveredTerrainDebugTile.y === point.y;

    if (!isSameTile) {
      this.hoveredTerrainDebugTile = point;
      this.drawTerrainDebugHighlight(point);
      this.renderTerrainDebugTooltip(this.getTerrainDebugTileInfo(point));
    }

    this.positionTerrainDebugTooltip();
  }

  private hideTerrainDebugHover(): void {
    this.hoveredTerrainDebugTile = null;
    this.terrainDebugHighlight?.clear().setVisible(false);

    if (this.terrainDebugTooltip) {
      this.terrainDebugTooltip.hidden = true;
    }
  }

  private isPointerOverTerrainDebugPanel(): boolean {
    if (!this.terrainDebugPanel) {
      return false;
    }

    const hoveredElement = document.elementFromPoint(this.virtualCursorScreen.x, this.virtualCursorScreen.y);

    return hoveredElement ? this.terrainDebugPanel.contains(hoveredElement) : false;
  }

  private drawTerrainDebugHighlight(point: GridPoint): void {
    if (!this.terrainDebugHighlight) {
      return;
    }

    const iso = cartToIso(point, this.map.tileWidth, this.map.tileHeight);
    const worldX = this.mapOrigin.x + iso.x;
    const worldY = this.mapOrigin.y + iso.y;
    const halfWidth = this.map.tileWidth / 2;
    const halfHeight = this.map.tileHeight / 2;
    const diamond = [
      new Phaser.Geom.Point(worldX, worldY - halfHeight),
      new Phaser.Geom.Point(worldX + halfWidth, worldY),
      new Phaser.Geom.Point(worldX, worldY + halfHeight),
      new Phaser.Geom.Point(worldX - halfWidth, worldY),
    ];

    this.terrainDebugHighlight
      .clear()
      .setVisible(true)
      .fillStyle(0x9fffa2, 0.12)
      .fillPoints(diamond, true)
      .lineStyle(2, 0xcfff7a, 0.95)
      .strokePoints(diamond, true);
  }

  private getTerrainDebugTileInfo(point: GridPoint): TerrainDebugTileInfo {
    const tile = getTileAt(this.map, point.x, point.y);
    const neighbors = this.getElevationNeighbors(point.x, point.y);
    const transitionSlot = resolveElevationTerrainSlot(tile.elevation, neighbors);
    const assets: TerrainDebugAssetInfo[] = [];
    const flatVisual = this.getFlatTerrainVisualForTerrain(tile.terrain);
    const flatFrame = flatVisual ? this.pickTerrainFrame(flatVisual, "base", point.x, point.y) : null;

    if (tile.elevation <= 0) {
      assets.push(this.createTerrainDebugAssetInfo("base", flatVisual, "base", flatFrame));
    }

    if (transitionSlot) {
      const visualTerrain = this.resolveElevationVisualTerrain(tile.terrain, tile.elevation, neighbors);
      const terrainVisual = this.getTerrainVisualForTerrain(visualTerrain);
      const frame = terrainVisual ? this.pickTerrainFrame(terrainVisual, transitionSlot, point.x, point.y) : null;

      if (tile.elevation > 0 && transitionSlot !== "plateauTop") {
        const lowerFrame = terrainVisual ? this.pickTerrainFrame(terrainVisual, "plateauTop", point.x, point.y) : null;

        assets.push(this.createTerrainDebugAssetInfo(`lower plateau L${tile.elevation}`, terrainVisual, "plateauTop", lowerFrame));
      }

      assets.push(this.createTerrainDebugAssetInfo(`elevation L${transitionSlot === "plateauTop" ? tile.elevation : tile.elevation + 1}`, terrainVisual, transitionSlot, frame));
    }

    return {
      point,
      terrain: tile.terrain,
      elevation: tile.elevation,
      transitionSlot,
      assets,
    };
  }

  private createTerrainDebugAssetInfo(
    label: string,
    visual: TerrainVisual | null,
    slot: TerrainKindSlot | "base" | null,
    frame: FrameRef | null,
  ): TerrainDebugAssetInfo {
    return {
      label,
      visualId: visual?.id ?? null,
      slot,
      fileName: frame?.fileName ?? null,
      textureKey: frame?.textureKey ?? null,
      loaded: frame ? this.textures.exists(frame.textureKey) : false,
    };
  }

  private renderTerrainDebugTooltip(info: TerrainDebugTileInfo): void {
    if (!this.terrainDebugTooltip) {
      return;
    }

    const title = document.createElement("div");
    title.className = "terrain-debug-tooltip__title";
    title.textContent = `Tile ${info.point.x}, ${info.point.y}`;

    const rows = document.createElement("div");
    rows.className = "terrain-debug-tooltip__rows";
    this.appendTerrainDebugRow(rows, "terrain", info.terrain);
    this.appendTerrainDebugRow(rows, "elevation", String(info.elevation));
    this.appendTerrainDebugRow(rows, "slot", info.transitionSlot ?? "flat");
    this.appendTerrainDebugRow(rows, "theme", this.activeTheme.id);

    const assets = document.createElement("div");
    assets.className = "terrain-debug-tooltip__assets";
    for (const asset of info.assets) {
      const row = document.createElement("div");
      row.className = "terrain-debug-tooltip__asset";

      const label = document.createElement("span");
      label.className = "terrain-debug-tooltip__asset-label";
      label.textContent = asset.label;

      const file = document.createElement("code");
      file.textContent = asset.fileName ?? "no themed asset";

      const meta = document.createElement("span");
      meta.className = asset.loaded ? "terrain-debug-tooltip__asset-meta" : "terrain-debug-tooltip__asset-meta terrain-debug-tooltip__asset-meta--missing";
      meta.textContent = `${asset.visualId ?? "fallback"} / ${asset.slot ?? "—"}${asset.loaded ? "" : " / missing"}`;

      row.append(label, file, meta);
      assets.append(row);
    }

    this.terrainDebugTooltip.replaceChildren(title, rows, assets);
    this.terrainDebugTooltip.hidden = false;
  }

  private appendTerrainDebugRow(parent: HTMLElement, labelText: string, valueText: string): void {
    const row = document.createElement("div");
    row.className = "terrain-debug-tooltip__row";

    const label = document.createElement("span");
    label.textContent = labelText;

    const value = document.createElement("strong");
    value.textContent = valueText;

    row.append(label, value);
    parent.append(row);
  }

  private positionTerrainDebugTooltip(): void {
    if (!this.terrainDebugTooltip || this.terrainDebugTooltip.hidden) {
      return;
    }

    const margin = 14;
    const offset = 18;
    const tooltipWidth = this.terrainDebugTooltip.offsetWidth;
    const tooltipHeight = this.terrainDebugTooltip.offsetHeight;
    const maxLeft = Math.max(margin, globalThis.innerWidth - tooltipWidth - margin);
    const maxTop = Math.max(margin, globalThis.innerHeight - tooltipHeight - margin);
    const left = Phaser.Math.Clamp(this.virtualCursorScreen.x + offset, margin, maxLeft);
    const top = Phaser.Math.Clamp(this.virtualCursorScreen.y + offset, margin, maxTop);

    this.terrainDebugTooltip.style.left = `${left}px`;
    this.terrainDebugTooltip.style.top = `${top}px`;
  }

  private getFormationTarget(origin: GridPoint, index: number): GridPoint {
    const offsets: GridPoint[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 0, y: -1 },
      { x: 1, y: 1 },
      { x: -1, y: 1 },
      { x: 1, y: -1 },
      { x: -1, y: -1 },
      { x: 2, y: 0 },
      { x: 0, y: 2 },
      { x: -2, y: 0 },
    ];
    const offset = offsets[index % offsets.length] ?? { x: 0, y: 0 };

    return this.clampGridPoint({
      x: origin.x + offset.x,
      y: origin.y + offset.y,
    });
  }

  private showMoveTargetMarker(target: GridPoint): void {
    const iso = cartToIso(target, this.map.tileWidth, this.map.tileHeight);
    const worldX = this.mapOrigin.x + iso.x;
    const worldY = this.mapOrigin.y + iso.y;
    const marker = this.add.graphics();
    const halfWidth = this.map.tileWidth / 4;
    const halfHeight = this.map.tileHeight / 4;

    marker.setDepth(worldY + 30);
    marker.lineStyle(2, 0xf4df8e, 0.95);
    marker.strokePoints(
      [
        new Phaser.Geom.Point(worldX, worldY - halfHeight),
        new Phaser.Geom.Point(worldX + halfWidth, worldY),
        new Phaser.Geom.Point(worldX, worldY + halfHeight),
        new Phaser.Geom.Point(worldX - halfWidth, worldY),
      ],
      true,
    );

    this.tweens.add({
      targets: marker,
      alpha: 0,
      duration: 420,
      ease: "Sine.easeOut",
      onComplete: () => marker.destroy(),
    });
  }

  private screenToWorldPoint(point: Phaser.Math.Vector2): Phaser.Math.Vector2 {
    const camera = this.cameras.main;
    const originX = camera.width * camera.originX;
    const originY = camera.height * camera.originY;

    return new Phaser.Math.Vector2(
      camera.scrollX + originX + (point.x - camera.x - originX) / camera.zoom,
      camera.scrollY + originY + (point.y - camera.y - originY) / camera.zoom,
    );
  }

  private worldToScreenPoint(point: Phaser.Math.Vector2): Phaser.Math.Vector2 {
    const camera = this.cameras.main;
    const originX = camera.width * camera.originX;
    const originY = camera.height * camera.originY;

    return new Phaser.Math.Vector2(
      camera.x + originX + (point.x - camera.scrollX - originX) * camera.zoom,
      camera.y + originY + (point.y - camera.scrollY - originY) * camera.zoom,
    );
  }

  private isScreenPointInWorldField(point: Phaser.Math.Vector2): boolean {
    return point.x >= 0 && point.x <= this.scale.width && point.y >= 0 && point.y < this.getHudTop();
  }

  private getClampedFieldScreenPoint(point: Phaser.Math.Vector2): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(
      Phaser.Math.Clamp(point.x, 0, this.scale.width),
      Phaser.Math.Clamp(point.y, 0, this.getHudTop()),
    );
  }

  private getScreenRectangle(start: Phaser.Math.Vector2, end: Phaser.Math.Vector2): Phaser.Geom.Rectangle {
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);

    return new Phaser.Geom.Rectangle(x, y, Math.abs(start.x - end.x), Math.abs(start.y - end.y));
  }

  private getUnitScreenPosition(unit: UnitState): Phaser.Math.Vector2 {
    return this.worldToScreenPoint(this.getUnitWorldPosition(unit));
  }

  private getUnitSelectionScreenBounds(unit: UnitState): Phaser.Geom.Rectangle {
    const position = this.getUnitScreenPosition(unit);
    const radius = unitDefinitions[unit.kind].selectionRadius;
    const zoom = this.cameras.main.zoom;
    const padding = 4;
    const halfWidth = radius * 1.6 * zoom + padding;
    const top = radius * zoom + padding;
    const bottom = radius * 1.3 * zoom + padding;

    return new Phaser.Geom.Rectangle(position.x - halfWidth, position.y - top, halfWidth * 2, top + bottom);
  }

  private getHudTop(): number {
    const hudHeight = Phaser.Math.Clamp(this.scale.height * 0.26, 178, 220);

    return this.scale.height - hudHeight;
  }

  private clampCameraToWorld(): void {
    const bounds = this.getWorldFieldBounds();
    const camera = this.cameras.main;
    const originX = camera.width * camera.originX;
    const originY = camera.height * camera.originY;
    const centerX = camera.scrollX + originX;
    const centerY = camera.scrollY + originY;
    const clampedCenterX = Phaser.Math.Clamp(centerX, bounds.left, bounds.right);
    const clampedCenterY = Phaser.Math.Clamp(centerY, bounds.top, bounds.bottom);

    camera.scrollX = clampedCenterX - originX;
    camera.scrollY = clampedCenterY - originY;
  }

  private centerCameraOnWorldPoint(point: MinimapPoint): void {
    const camera = this.cameras.main;
    const originX = camera.width * camera.originX;
    const originY = camera.height * camera.originY;

    camera.scrollX = point.x - originX;
    camera.scrollY = point.y - originY;
    this.clampCameraToWorld();
  }

  private getWorldFieldBounds(): Phaser.Geom.Rectangle {
    const halfWidth = this.map.tileWidth / 2;
    const halfHeight = this.map.tileHeight / 2;
    const top = new Phaser.Math.Vector2(this.mapOrigin.x, this.mapOrigin.y - halfHeight);
    const rightIso = cartToIso({ x: this.map.width - 1, y: 0 }, this.map.tileWidth, this.map.tileHeight);
    const bottomIso = cartToIso(
      { x: this.map.width - 1, y: this.map.height - 1 },
      this.map.tileWidth,
      this.map.tileHeight,
    );
    const leftIso = cartToIso({ x: 0, y: this.map.height - 1 }, this.map.tileWidth, this.map.tileHeight);
    const corners = [
      top,
      new Phaser.Math.Vector2(this.mapOrigin.x + rightIso.x + halfWidth, this.mapOrigin.y + rightIso.y),
      new Phaser.Math.Vector2(this.mapOrigin.x + bottomIso.x, this.mapOrigin.y + bottomIso.y + halfHeight),
      new Phaser.Math.Vector2(this.mapOrigin.x + leftIso.x - halfWidth, this.mapOrigin.y + leftIso.y),
    ];
    const xs = corners.map((corner) => corner.x);
    const ys = corners.map((corner) => corner.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return new Phaser.Geom.Rectangle(minX, minY, maxX - minX, maxY - minY);
  }

  private clampGridPoint(point: GridPoint): GridPoint {
    return {
      x: Phaser.Math.Clamp(point.x, 0, this.map.width - 1),
      y: Phaser.Math.Clamp(point.y, 0, this.map.height - 1),
    };
  }

  private selectInitialUnit(playerId: string): void {
    const units = Object.values(this.worldState.units).filter((unit) => unit.playerId === playerId);
    const preferredUnit =
      units.find((unit) => unitDefinitions[unit.kind].category === "building") ?? units[0];

    if (preferredUnit) {
      this.selectUnits([preferredUnit]);
    }
  }

  private selectUnits(units: UnitState[]): void {
    this.selectedUnitIds.clear();

    for (const unit of units) {
      if (this.isUnitSelectable(unit)) {
        this.selectedUnitIds.add(unit.id);
      }
    }

    this.emitSelectionChanged();
    this.syncUnitRenderables();
    this.publishMinimapEntities();
  }

  private clearSelection(): void {
    this.selectedUnitIds.clear();
    this.emitSelectionChanged();
    this.syncUnitRenderables();
    this.publishMinimapEntities();
  }

  private emitSelectionChanged(): void {
    const selection = this.getSelectedUnits().map((unit) => toSelectedEntityView(unit));

    this.registry.set(SELECTED_ENTITY_REGISTRY_KEY, selection);
    this.game.events.emit(SELECTED_ENTITY_CHANGED_EVENT, selection);
  }

  private getSelectedUnits(): UnitState[] {
    return Object.values(this.worldState.units).filter((unit) => this.selectedUnitIds.has(unit.id) && this.isUnitSelectable(unit));
  }

  private syncWorldFromTransport(force = false): void {
    const snapshot = this.sessionTransport?.getSnapshot();

    if (!snapshot) {
      return;
    }

    if (!force && snapshot === this.worldState && snapshot.tick === this.lastSyncedTick) {
      return;
    }

    this.worldState = snapshot;
    this.lastSyncedTick = snapshot.tick;
    const dirtyFogChunkCount = this.refreshLocalVisibility();
    this.redrawDirtyFogOverlay(dirtyFogChunkCount);
    this.pruneMissingSelections();
    this.syncUnitRenderables();
    this.emitSelectionChanged();
    if (dirtyFogChunkCount > 0) {
      this.publishMinimapVisibility();
    }
    this.publishMinimapEntities();
  }

  private pruneMissingSelections(): void {
    for (const selectedUnitId of this.selectedUnitIds) {
      const unit = this.worldState.units[selectedUnitId];

      if (!unit || !this.isUnitSelectable(unit)) {
        this.selectedUnitIds.delete(selectedUnitId);
      }
    }
  }

  private findUnitAtWorldPoint(worldX: number, worldY: number): UnitState | null {
    // TODO: Add a grid/chunk spatial index if entity counts grow or profiling shows selection scans matter.
    let selectedUnit: UnitState | null = null;
    let selectedDistanceSq = Number.POSITIVE_INFINITY;

    for (const unit of Object.values(this.worldState.units)) {
      if (!this.isUnitSelectable(unit)) {
        continue;
      }

      const unitPosition = this.getUnitWorldPosition(unit);
      const radius = unitDefinitions[unit.kind].hitRadius;
      const deltaX = worldX - unitPosition.x;
      const deltaY = worldY - unitPosition.y;
      const distanceSq = deltaX * deltaX + deltaY * deltaY;

      if (distanceSq <= radius * radius && distanceSq < selectedDistanceSq) {
        selectedUnit = unit;
        selectedDistanceSq = distanceSq;
      }
    }

    return selectedUnit;
  }

  private getUnitWorldPosition(unit: UnitState): Phaser.Math.Vector2 {
    const iso = cartToIso(unit.position, this.map.tileWidth, this.map.tileHeight);

    return new Phaser.Math.Vector2(this.mapOrigin.x + iso.x, this.mapOrigin.y + iso.y - this.map.tileHeight / 2);
  }

  private refreshLocalVisibility(): number {
    const startedAt = this.perfEnabled ? performance.now() : 0;
    const update = updatePlayerVisibilityWithChanges(this.playerVisibility, this.worldState, this.localPlayerId, {
      dirtyChunks: this.fogChunkDirtyMask,
      chunkSize: TERRAIN_CHUNK_SIZE,
    });

    this.playerVisibility = update.visibility;

    if (this.perfEnabled) {
      this.lastVisibilityDeltaMs = performance.now() - startedAt;
    }

    return update.dirtyChunkCount;
  }

  private isUnitVisibleToLocalPlayer(unit: UnitState): boolean {
    if (unit.playerId === this.localPlayerId) {
      return true;
    }

    return getTileVisibility(this.playerVisibility, unit.position) === TileVisibility.Visible;
  }

  private isUnitSelectable(unit: UnitState): boolean {
    return unit.playerId === this.localPlayerId && this.isUnitVisibleToLocalPlayer(unit);
  }

  private configureFogChunkGrid(): void {
    this.disposeFogOverlay();
    this.fogChunksPerRow = Math.ceil(this.map.width / TERRAIN_CHUNK_SIZE);
    this.fogChunksPerColumn = Math.ceil(this.map.height / TERRAIN_CHUNK_SIZE);
    this.fogChunkDirtyMask = new Uint8Array(this.fogChunksPerRow * this.fogChunksPerColumn);
    this.fogChunks.length = this.fogChunkDirtyMask.length;
    this.fogChunks.fill(null);
  }

  private disposeFogOverlay(): void {
    this.fogChunks.forEach((chunk) => chunk?.destroy());
    this.fogChunks.length = 0;
  }

  private redrawAllFogOverlay(): void {
    const startedAt = this.perfEnabled ? performance.now() : 0;

    if (this.perfEnabled) console.time("fog full bake");
    this.ensureFogTextures();

    let tileDrawCount = 0;

    for (let chunkIndex = 0; chunkIndex < this.fogChunks.length; chunkIndex += 1) {
      tileDrawCount += this.redrawFogChunk(chunkIndex);
    }

    this.lastFogDirtyChunkCount = this.fogChunks.length;
    this.lastFogTileDrawCount = tileDrawCount;
    this.fogChunkDirtyMask.fill(0);

    if (this.perfEnabled) {
      this.lastFogRedrawMs = performance.now() - startedAt;
      console.timeEnd("fog full bake");
    }
  }

  private redrawDirtyFogOverlay(dirtyChunkCount: number): void {
    if (dirtyChunkCount === 0) {
      this.lastFogDirtyChunkCount = 0;
      this.lastFogTileDrawCount = 0;
      this.lastFogRedrawMs = 0;
      return;
    }

    const startedAt = this.perfEnabled ? performance.now() : 0;

    if (this.perfEnabled) console.time("fog dirty bake");
    this.ensureFogTextures();

    let redrawnChunkCount = 0;
    let tileDrawCount = 0;

    for (let chunkIndex = 0; chunkIndex < this.fogChunkDirtyMask.length; chunkIndex += 1) {
      if (this.fogChunkDirtyMask[chunkIndex] !== 1) {
        continue;
      }

      tileDrawCount += this.redrawFogChunk(chunkIndex);
      redrawnChunkCount += 1;
    }

    this.lastFogDirtyChunkCount = redrawnChunkCount;
    this.lastFogTileDrawCount = tileDrawCount;

    if (this.perfEnabled) {
      this.lastFogRedrawMs = performance.now() - startedAt;
      console.timeEnd("fog dirty bake");
    }
  }

  private redrawFogChunk(chunkIndex: number): number {
    const bounds = this.getFogChunkBounds(chunkIndex);
    const renderTexture = this.ensureFogChunkRenderTexture(chunkIndex, bounds);

    let hasFog = false;
    let tileDrawCount = 0;

    renderTexture.clear();

    for (let y = bounds.chunkY; y <= bounds.maxY; y += 1) {
      for (let x = bounds.chunkX; x <= bounds.maxX; x += 1) {
        const visibility = (this.playerVisibility.tiles[y * this.playerVisibility.width + x] ?? TileVisibility.Unexplored) as TileVisibility;

        if (visibility === TileVisibility.Visible) {
          continue;
        }

        const textureKey = this.fogTextureKeys.get(visibility);

        if (!textureKey) {
          continue;
        }

        const iso = cartToIso({ x, y }, this.map.tileWidth, this.map.tileHeight);
        const worldX = this.mapOrigin.x + iso.x;
        const worldY = this.mapOrigin.y + iso.y;
        const tile = getTileAt(this.map, x, y);
        const drewElevationFog = this.drawElevationFogTile(renderTexture, bounds, visibility, x, y, worldX, worldY);

        if (tile.elevation <= 0) {
          this.drawBaseFogTile(renderTexture, bounds, textureKey, visibility, x, y, worldX, worldY);
        } else if (!drewElevationFog) {
          this.drawFallbackFogTile(renderTexture, bounds, textureKey, worldX, worldY);
        }

        hasFog = true;
        tileDrawCount += 1;
      }
    }

    renderTexture.setVisible(hasFog);
    return tileDrawCount;
  }

  private drawBaseFogTile(
    renderTexture: Phaser.GameObjects.RenderTexture,
    bounds: FogChunkBounds,
    fallbackTextureKey: string,
    visibility: TileVisibility,
    x: number,
    y: number,
    worldX: number,
    worldY: number,
  ): void {
    const tile = getTileAt(this.map, x, y);
    const flatVisual = this.getFlatTerrainVisualForTerrain(tile.terrain);
    const flatFrame = flatVisual ? this.pickTerrainFrame(flatVisual, "base", x, y) : null;

    if (flatVisual && flatFrame && this.textures.exists(flatFrame.textureKey)) {
      this.drawVisualFogFrame(renderTexture, bounds, flatVisual, flatFrame, visibility, worldX, worldY, 0);
      return;
    }

    this.drawFallbackFogTile(renderTexture, bounds, fallbackTextureKey, worldX, worldY);
  }

  private drawFallbackFogTile(
    renderTexture: Phaser.GameObjects.RenderTexture,
    bounds: FogChunkBounds,
    textureKey: string,
    worldX: number,
    worldY: number,
  ): void {
    const halfWidth = this.map.tileWidth / 2;
    const halfHeight = this.map.tileHeight / 2;

    renderTexture.draw(textureKey, worldX - bounds.minX - halfWidth - 1, worldY - bounds.minY - halfHeight - 1);
  }

  private drawElevationFogTile(
    renderTexture: Phaser.GameObjects.RenderTexture,
    bounds: FogChunkBounds,
    visibility: TileVisibility,
    x: number,
    y: number,
    worldX: number,
    worldY: number,
  ): boolean {
    const tile = getTileAt(this.map, x, y);
    const neighbors = this.getElevationNeighbors(x, y);
    const slot = resolveElevationTerrainSlot(tile.elevation, neighbors);

    if (!slot) {
      return false;
    }

    const visualTerrain = this.resolveElevationVisualTerrain(tile.terrain, tile.elevation, neighbors);
    const terrainVisual = this.getTerrainVisualForTerrain(visualTerrain);
    const frame = terrainVisual ? this.pickTerrainFrame(terrainVisual, slot, x, y) : null;

    if (!terrainVisual || !frame || !this.textures.exists(frame.textureKey)) {
      return false;
    }

    let drewFog = false;

    if (tile.elevation > 0 && slot !== "plateauTop") {
      const lowerFrame = this.pickTerrainFrame(terrainVisual, "plateauTop", x, y);

      if (lowerFrame && this.textures.exists(lowerFrame.textureKey)) {
        this.drawVisualFogFrame(renderTexture, bounds, terrainVisual, lowerFrame, visibility, worldX, worldY, tile.elevation);
        drewFog = true;
      }
    }

    this.drawVisualFogFrame(
      renderTexture,
      bounds,
      terrainVisual,
      frame,
      visibility,
      worldX,
      worldY,
      slot === "plateauTop" ? tile.elevation : tile.elevation + 1,
    );
    drewFog = true;

    return drewFog;
  }

  private drawVisualFogFrame(
    renderTexture: Phaser.GameObjects.RenderTexture,
    bounds: FogChunkBounds,
    visual: TerrainVisual,
    frame: FrameRef,
    visibility: TileVisibility,
    worldX: number,
    worldY: number,
    liftSteps: number,
  ): void {
    const stamp = this.getElevationFogStamp(visual, frame, visibility);
    const scale = getAssetScale(visual, this.activeTheme.display.defaultPxPerWu ?? REFERENCE_PX_PER_WU);
    const pivot = getFramePivot(visual, frame);
    const liftPx = (pivot.liftPx ?? 0) * scale * liftSteps;

    renderTexture.draw(stamp, worldX - bounds.minX, worldY - bounds.minY - liftPx);
  }

  private ensureFogChunkRenderTexture(chunkIndex: number, bounds: FogChunkBounds): Phaser.GameObjects.RenderTexture {
    const existing = this.fogChunks[chunkIndex];

    if (existing) {
      return existing;
    }

    const renderTexture = this.add
      .renderTexture(bounds.minX, bounds.minY, bounds.width, bounds.height)
      .setOrigin(0, 0)
      .setDepth(bounds.depth);

    this.fogChunks[chunkIndex] = renderTexture;
    return renderTexture;
  }

  private getFogChunkBounds(chunkIndex: number): FogChunkBounds {
    const chunkColumn = chunkIndex % this.fogChunksPerRow;
    const chunkRow = Math.floor(chunkIndex / this.fogChunksPerRow);
    const chunkX = chunkColumn * TERRAIN_CHUNK_SIZE;
    const chunkY = chunkRow * TERRAIN_CHUNK_SIZE;
    const maxX = Math.min(this.map.width - 1, chunkX + TERRAIN_CHUNK_SIZE - 1);
    const maxY = Math.min(this.map.height - 1, chunkY + TERRAIN_CHUNK_SIZE - 1);
    const corners = [
      this.getTileWorldDiamondBounds(chunkX, chunkY),
      this.getTileWorldDiamondBounds(maxX, chunkY),
      this.getTileWorldDiamondBounds(maxX, maxY),
      this.getTileWorldDiamondBounds(chunkX, maxY),
    ];
    const minX = Math.min(...corners.map((corner) => corner.left)) - 2;
    const flatMinY = Math.min(...corners.map((corner) => corner.top)) - 2;
    const minY = flatMinY - this.terrainFogLiftPaddingPx;
    const maxRight = Math.max(...corners.map((corner) => corner.right)) + 2;
    const maxBottom = Math.max(...corners.map((corner) => corner.bottom)) + 2;

    return {
      chunkX,
      chunkY,
      maxX,
      maxY,
      minX,
      minY,
      width: Math.ceil(maxRight - minX),
      height: Math.ceil(maxBottom - minY),
      depth: flatMinY + 1,
    };
  }

  private ensureFogTextures(): void {
    const fogStyles = [
      { visibility: TileVisibility.Unexplored, alpha: FOG_UNEXPLORED_ALPHA },
      { visibility: TileVisibility.Explored, alpha: FOG_EXPLORED_ALPHA },
    ];

    for (const style of fogStyles) {
      const key = `fog-diamond-${style.visibility}`;
      if (this.textures.exists(key)) {
        this.fogTextureKeys.set(style.visibility, key);
        continue;
      }

      const g = this.add.graphics();
      const halfWidth = this.map.tileWidth / 2;
      const halfHeight = this.map.tileHeight / 2;
      g.fillStyle(0x020608, style.alpha);
      g.fillPoints([
        new Phaser.Geom.Point(halfWidth + 1, 1),
        new Phaser.Geom.Point(this.map.tileWidth + 1, halfHeight + 1),
        new Phaser.Geom.Point(halfWidth + 1, this.map.tileHeight + 1),
        new Phaser.Geom.Point(1, halfHeight + 1),
      ], true);
      g.generateTexture(key, this.map.tileWidth + 2, this.map.tileHeight + 2);
      g.destroy();
      this.fogTextureKeys.set(style.visibility, key);
    }
  }

  private redrawTerrain(): void {
    if (this.perfEnabled) console.time("terrain chunk bake");
    this.terrainChunks.forEach((chunk) => chunk.destroy());
    this.terrainChunks.length = 0;
    this.ensureTerrainTextures();

    const halfWidth = this.map.tileWidth / 2;
    const halfHeight = this.map.tileHeight / 2;

    for (let chunkY = 0; chunkY < this.map.height; chunkY += TERRAIN_CHUNK_SIZE) {
      for (let chunkX = 0; chunkX < this.map.width; chunkX += TERRAIN_CHUNK_SIZE) {
        const maxX = Math.min(this.map.width - 1, chunkX + TERRAIN_CHUNK_SIZE - 1);
        const maxY = Math.min(this.map.height - 1, chunkY + TERRAIN_CHUNK_SIZE - 1);
        const corners = [
          this.getTileWorldDiamondBounds(chunkX, chunkY),
          this.getTileWorldDiamondBounds(maxX, chunkY),
          this.getTileWorldDiamondBounds(maxX, maxY),
          this.getTileWorldDiamondBounds(chunkX, maxY),
        ];
        const minX = Math.min(...corners.map((corner) => corner.left)) - 2;
        const minY = Math.min(...corners.map((corner) => corner.top)) - 2;
        const maxRight = Math.max(...corners.map((corner) => corner.right)) + 2;
        const maxBottom = Math.max(...corners.map((corner) => corner.bottom)) + 2;
        const renderTexture = this.add
          .renderTexture(minX, minY, Math.ceil(maxRight - minX), Math.ceil(maxBottom - minY))
          .setOrigin(0, 0)
          .setDepth(minY);

        for (let y = chunkY; y <= maxY; y += 1) {
          for (let x = chunkX; x <= maxX; x += 1) {
            const tile = getTileAt(this.map, x, y);
            if (tile.elevation > 0) {
              continue;
            }

            const iso = cartToIso({ x, y }, this.map.tileWidth, this.map.tileHeight);
            const worldX = this.mapOrigin.x + iso.x;
            const worldY = this.mapOrigin.y + iso.y;
            const flatVisual = this.getFlatTerrainVisualForTerrain(tile.terrain);
            const flatFrame = flatVisual ? this.pickTerrainFrame(flatVisual, "base", x, y) : null;

            if (flatVisual && flatFrame && this.textures.exists(flatFrame.textureKey)) {
              renderTexture.draw(this.getTerrainRenderStamp(flatVisual, flatFrame), worldX - minX, worldY - minY);
            } else {
              renderTexture.draw(this.terrainTextureKeys.get(tile.terrain)!, worldX - minX - halfWidth - 1, worldY - minY - halfHeight - 1);
            }
          }
        }

        this.terrainChunks.push(renderTexture);
      }
    }
    if (this.perfEnabled) console.timeEnd("terrain chunk bake");
  }

  private redrawElevationOverlay(): void {
    this.disposeElevationOverlay();

    for (let y = 0; y < this.map.height; y += 1) {
      for (let x = 0; x < this.map.width; x += 1) {
        const tile = getTileAt(this.map, x, y);
        const neighbors = this.getElevationNeighbors(x, y);
        const slot = resolveElevationTerrainSlot(tile.elevation, neighbors);

        if (!slot) {
          continue;
        }

        const visualTerrain = this.resolveElevationVisualTerrain(tile.terrain, tile.elevation, neighbors);
        const terrainVisual = this.getTerrainVisualForTerrain(visualTerrain);
        const frame = terrainVisual ? this.pickTerrainFrame(terrainVisual, slot, x, y) : null;

        if (!terrainVisual || !frame || !this.textures.exists(frame.textureKey)) {
          continue;
        }

        const iso = cartToIso({ x, y }, this.map.tileWidth, this.map.tileHeight);
        const worldX = this.mapOrigin.x + iso.x;
        const worldY = this.mapOrigin.y + iso.y;
        if (tile.elevation > 0 && slot !== "plateauTop") {
          const lowerFrame = this.pickTerrainFrame(terrainVisual, "plateauTop", x, y);

          if (lowerFrame && this.textures.exists(lowerFrame.textureKey)) {
            const lowerOverlay = placeStaticVisual(
              this,
              terrainVisual,
              lowerFrame,
              { x: worldX, y: worldY },
              {
                depth: this.getTerrainChunkDepthForTile(x, y),
                depthBias: RENDER_DEPTH_BIAS.elevation,
                liftSteps: tile.elevation,
                pxPerWu: this.activeTheme.display.defaultPxPerWu ?? REFERENCE_PX_PER_WU,
              },
            );

            this.elevationOverlays.push(lowerOverlay);
          }
        }

        const overlay = placeStaticVisual(
          this,
          terrainVisual,
          frame,
          { x: worldX, y: worldY },
          {
            depth: this.getTerrainChunkDepthForTile(x, y),
            depthBias: RENDER_DEPTH_BIAS.elevation,
            liftSteps: slot === "plateauTop" ? tile.elevation : tile.elevation + 1,
            pxPerWu: this.activeTheme.display.defaultPxPerWu ?? REFERENCE_PX_PER_WU,
          },
        );

        this.elevationOverlays.push(overlay);
      }
    }
  }

  private disposeElevationOverlay(): void {
    this.elevationOverlays.forEach((overlay) => overlay.destroy());
    this.elevationOverlays.length = 0;
  }

  private getFlatTerrainVisualForTerrain(terrain: TerrainType): TerrainVisual | null {
    const visualId = this.activeTheme.terrainBindings[terrain]?.flat;

    return visualId ? getTerrainVisual(this.activeTheme, visualId) : null;
  }

  private pickTerrainFrame(visual: TerrainVisual, slot: TerrainKindSlot, x: number, y: number): FrameRef | null {
    const frames = visual.slots[slot];

    if (!frames?.length) {
      return null;
    }

    const hash = this.hashTile(x, y, slot);
    return frames[hash % frames.length] ?? frames[0] ?? null;
  }

  private hashTile(x: number, y: number, salt: string): number {
    let hash = Math.imul(x + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(y + 0xc2b2ae35, 0x27d4eb2f);

    for (let index = 0; index < salt.length; index += 1) {
      hash = Math.imul(hash ^ salt.charCodeAt(index), 0x165667b1);
    }

    return hash >>> 0;
  }

  private getTerrainRenderStamp(visual: TerrainVisual, frame: FrameRef): Phaser.GameObjects.Image {
    const stampKey = `${visual.id}:${frame.textureKey}:${frame.frameName ?? ""}`;
    const existingStamp = this.terrainRenderStamps.get(stampKey);

    if (existingStamp) {
      return existingStamp;
    }

    const stamp = frame.frameName
      ? this.make.image({ x: 0, y: 0, key: frame.textureKey, frame: frame.frameName, add: false })
      : this.make.image({ x: 0, y: 0, key: frame.textureKey, add: false });
    const origin = getFrameOrigin(visual, frame);
    const scale = getAssetScale(visual, this.activeTheme.display.defaultPxPerWu ?? REFERENCE_PX_PER_WU);

    this.applyVisualTextureFilter(visual, frame);
    stamp.setOrigin(origin.x, origin.y).setScale(scale);
    this.terrainRenderStamps.set(stampKey, stamp);

    return stamp;
  }

  private getElevationFogStamp(visual: TerrainVisual, frame: FrameRef, visibility: TileVisibility): Phaser.GameObjects.Image {
    const stampKey = `${visibility}:${visual.id}:${frame.textureKey}:${frame.frameName ?? ""}`;
    const existingStamp = this.elevationFogStamps.get(stampKey);

    if (existingStamp) {
      return existingStamp;
    }

    const stamp = frame.frameName
      ? this.make.image({ x: 0, y: 0, key: frame.textureKey, frame: frame.frameName, add: false })
      : this.make.image({ x: 0, y: 0, key: frame.textureKey, add: false });
    const origin = getFrameOrigin(visual, frame);
    const scale = getAssetScale(visual, this.activeTheme.display.defaultPxPerWu ?? REFERENCE_PX_PER_WU);
    const alpha = visibility === TileVisibility.Unexplored ? FOG_UNEXPLORED_ALPHA : FOG_EXPLORED_ALPHA;

    this.applyVisualTextureFilter(visual, frame);
    stamp
      .setOrigin(origin.x, origin.y)
      .setScale(scale)
      .setAlpha(alpha)
      .setTint(0x020608);

    this.elevationFogStamps.set(stampKey, stamp);

    return stamp;
  }

  private disposeTerrainRenderStamps(): void {
    this.terrainRenderStamps.forEach((stamp) => stamp.destroy());
    this.terrainRenderStamps.clear();
  }

  private disposeElevationFogStamps(): void {
    this.elevationFogStamps.forEach((stamp) => stamp.destroy());
    this.elevationFogStamps.clear();
  }

  private applyVisualTextureFilter(visual: TerrainVisual, frame: FrameRef): void {
    const texture = this.textures.get(frame.textureKey);
    const filterMode = visual.render.filtering === "linear"
      ? Phaser.Textures.FilterMode.LINEAR
      : Phaser.Textures.FilterMode.NEAREST;

    texture.setFilter(filterMode);
  }

  private computeTerrainFogLiftPaddingPx(): number {
    const layer = this.map.layers[0];

    if (!layer) {
      return 0;
    }

    const maxElevation = layer.tiles.reduce((max, tile) => Math.max(max, tile.elevation), 0);
    const elevationStepPx = this.map.tileHeight / 2;

    return maxElevation * elevationStepPx + 2;
  }

  private getElevationNeighbors(x: number, y: number): Array<ElevationNeighbor & { terrain: TerrainType }> {
    const neighbors: Array<ElevationNeighbor & { terrain: TerrainType }> = [];

    for (const offset of ELEVATION_NEIGHBOR_OFFSETS) {
      const neighborTile = getTileAt(this.map, x + offset.dx, y + offset.dy);

      neighbors.push({
        dx: offset.dx,
        dy: offset.dy,
        elevation: neighborTile.elevation,
        terrain: neighborTile.terrain,
      });
    }

    return neighbors;
  }

  private resolveElevationVisualTerrain(
    terrain: TerrainType,
    elevation: number,
    neighbors: readonly (ElevationNeighbor & { terrain: TerrainType })[],
  ): TerrainType {
    if (elevation > 0) {
      return terrain;
    }

    let selectedTerrain = terrain;
    let selectedElevation = elevation;

    for (const neighbor of neighbors) {
      if (neighbor.elevation <= selectedElevation) {
        continue;
      }

      selectedTerrain = neighbor.terrain;
      selectedElevation = neighbor.elevation;
    }

    return selectedTerrain;
  }

  private getTerrainVisualForTerrain(terrain: TerrainType): TerrainVisual | null {
    const binding = this.activeTheme.terrainBindings[terrain];
    const visualId = binding?.elevated ?? binding?.flat;

    return visualId ? getTerrainVisual(this.activeTheme, visualId) : null;
  }

  private getTerrainChunkDepthForTile(x: number, y: number): number {
    const chunkX = Math.floor(x / TERRAIN_CHUNK_SIZE) * TERRAIN_CHUNK_SIZE;
    const chunkY = Math.floor(y / TERRAIN_CHUNK_SIZE) * TERRAIN_CHUNK_SIZE;
    const maxX = Math.min(this.map.width - 1, chunkX + TERRAIN_CHUNK_SIZE - 1);
    const maxY = Math.min(this.map.height - 1, chunkY + TERRAIN_CHUNK_SIZE - 1);
    const corners = [
      this.getTileWorldDiamondBounds(chunkX, chunkY),
      this.getTileWorldDiamondBounds(maxX, chunkY),
      this.getTileWorldDiamondBounds(maxX, maxY),
      this.getTileWorldDiamondBounds(chunkX, maxY),
    ];

    return Math.min(...corners.map((corner) => corner.top)) - 2;
  }

  private ensureTerrainTextures(): void {
    terrainTypes.forEach((terrain) => {
      const key = `terrain-diamond-${terrain}`;
      if (this.textures.exists(key)) {
        this.terrainTextureKeys.set(terrain, key);
        return;
      }
      const g = this.add.graphics();
      const halfWidth = this.map.tileWidth / 2;
      const halfHeight = this.map.tileHeight / 2;
      g.fillStyle(this.getTerrainColor(terrain), 1);
      g.fillPoints([
        new Phaser.Geom.Point(halfWidth + 1, 1),
        new Phaser.Geom.Point(this.map.tileWidth + 1, halfHeight + 1),
        new Phaser.Geom.Point(halfWidth + 1, this.map.tileHeight + 1),
        new Phaser.Geom.Point(1, halfHeight + 1),
      ], true);
      g.lineStyle(1, 0x203037, 0.6);
      g.strokePoints([
        new Phaser.Geom.Point(halfWidth + 1, 1),
        new Phaser.Geom.Point(this.map.tileWidth + 1, halfHeight + 1),
        new Phaser.Geom.Point(halfWidth + 1, this.map.tileHeight + 1),
        new Phaser.Geom.Point(1, halfHeight + 1),
      ], true);
      g.generateTexture(key, this.map.tileWidth + 2, this.map.tileHeight + 2);
      g.destroy();
      this.terrainTextureKeys.set(terrain, key);
    });
  }

  private ensureActiveThemeTexturesLoaded(onComplete: () => void): void {
    const missingFrames = getThemeFrameRefs(this.activeTheme).filter(({ frame }) => !this.textures.exists(frame.textureKey));

    if (missingFrames.length === 0) {
      onComplete();
      return;
    }

    console.warn(
      "Missing theme textures detected; retrying load:",
      missingFrames.map(({ frame }) => frame.fileName ?? frame.textureKey),
    );

    const handleLoadError = (file: { key?: string; src?: string }) => {
      console.warn("Theme texture failed to load", { key: file.key, src: file.src });
    };

    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, handleLoadError);
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, handleLoadError);
      onComplete();
    });

    for (const { visual, frame } of missingFrames) {
      this.load.image(frame.textureKey, getThemeAssetUrl(this.activeTheme, visual, frame));
    }

    this.load.start();
  }

  private getTileWorldDiamondBounds(x: number, y: number): Phaser.Geom.Rectangle {
    const iso = cartToIso({ x, y }, this.map.tileWidth, this.map.tileHeight);
    return new Phaser.Geom.Rectangle(
      this.mapOrigin.x + iso.x - this.map.tileWidth / 2,
      this.mapOrigin.y + iso.y - this.map.tileHeight / 2,
      this.map.tileWidth,
      this.map.tileHeight,
    );
  }

  private syncUnitRenderables(): void {
    const liveIds = new Set(Object.values(this.worldState.units).filter((unit) => this.isUnitVisibleToLocalPlayer(unit)).map((unit) => unit.id));
    for (const [id, renderable] of this.unitRenderables) {
      if (!liveIds.has(id)) {
        renderable.container.destroy(true);
        this.unitRenderables.delete(id);
      }
    }

    Object.values(this.worldState.units).filter((unit) => this.isUnitVisibleToLocalPlayer(unit)).forEach((unit) => {
      let renderable = this.unitRenderables.get(unit.id);
      if (!renderable) {
        renderable = this.createUnitRenderable(unit);
        this.unitRenderables.set(unit.id, renderable);
      }
      const unitPosition = this.getUnitWorldPosition(unit);
      renderable.container.setPosition(unitPosition.x, unitPosition.y).setDepth(unitPosition.y + 20);
      renderable.selectionRing.setVisible(this.selectedUnitIds.has(unit.id));
    });
  }

  private createUnitRenderable(unit: UnitState): UnitRenderable {
    const radius = unitDefinitions[unit.kind].renderRadius;
    const color = factionDefinitions[this.getPlayerFaction(unit.playerId)].unitColor;
    const container = this.add.container(0, 0);
    const selectionRing = this.add.graphics();
    const body = this.add.graphics();
    selectionRing.lineStyle(2, 0xf3dd8f, 1);
    selectionRing.strokeEllipse(0, radius * 0.4, radius * 3.2, radius * 1.8);
    body.fillStyle(color, 1);
    body.fillCircle(0, 0, radius);
    body.lineStyle(2, 0x102125, 0.9);
    body.strokeCircle(0, 0, radius);
    container.add([selectionRing, body]);
    return { container, body, selectionRing };
  }

  private getTerrainColor(terrain: TerrainType): number {
    return terrainDefinitions[terrain].worldColor;
  }

  private getPlayerFaction(playerId: string): FactionId {
    return this.worldState.players[playerId]?.faction ?? "blue";
  }
}
