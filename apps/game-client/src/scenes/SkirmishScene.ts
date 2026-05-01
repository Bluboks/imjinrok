import Phaser from "phaser";
import { defaultMap, factionDefinitions, getTileAt, terrainDefinitions, terrainTypes, unitCanPerformAction, unitDefinitions, type CommandEnvelope, type FactionId, type GridPoint, type MapDefinition, type TerrainType } from "@shared";
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
import type { GameLaunchContext } from "../session.js";

const DRAG_THRESHOLD_SQ = 36;
const EDGE_PAN_SIZE = 28;
const EDGE_PAN_SPEED = 520;
const TERRAIN_CHUNK_SIZE = 16;
const VIEWPORT_EVENT_INTERVAL_MS = 1000 / 30;
const SCREEN_OVERLAY_DEPTH = 1_000_000;
const FOG_UNEXPLORED_ALPHA = 0.9;
const FOG_EXPLORED_ALPHA = 0.48;

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

export class SkirmishScene extends Phaser.Scene {
  private map: MapDefinition = defaultMap;
  private worldState: WorldState = createInitialWorldState(defaultMap, ["local-player", "cpu-1"]);
  private sessionTransport: SessionTransport | null = null;
  private lastSyncedTick = Number.NEGATIVE_INFINITY;
  private mapOrigin = new Phaser.Math.Vector2(0, 0);
  private readonly terrainChunks: Phaser.GameObjects.RenderTexture[] = [];
  private readonly fogChunks: (Phaser.GameObjects.RenderTexture | null)[] = [];
  private readonly unitRenderables = new Map<string, UnitRenderable>();
  private readonly terrainTextureKeys = new Map<TerrainType, string>();
  private readonly fogTextureKeys = new Map<TileVisibility, string>();
  private localPlayerId = "local-player";
  private playerVisibility: PlayerVisibilityState = createPlayerVisibility(defaultMap);
  private fogChunkDirtyMask = new Uint8Array(0);
  private fogChunksPerRow = 0;
  private fogChunksPerColumn = 0;
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
    this.configureFogChunkGrid();
    this.mapOrigin.set(this.scale.width / 2, 160);
    this.virtualCursorScreen.set(this.scale.width / 2, this.scale.height / 2);
    this.refreshLocalVisibility();

    this.cameras.main.setBackgroundColor("#143137");
    this.cameras.main.centerOn(this.mapOrigin.x, this.mapOrigin.y + (this.map.height * this.map.tileHeight) / 2);
    this.clampCameraToWorld();

    this.setupPerfOverlay();

    this.setupCameraControls();
    this.setupMouseControls();
    this.setupPointerLockLifecycle();
    this.redrawTerrain();
    this.redrawAllFogOverlay();
    this.syncUnitRenderables();
    this.publishVirtualCursor();
    this.selectInitialUnit(this.localPlayerId);
    this.publishMinimapMap();
    this.publishMinimapEntities();
    this.publishMinimapViewport(true);
  }

  override update(time: number, delta: number): void {
    this.handleCameraPan(delta);
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
    this.disposeFogOverlay();
    this.fogChunkDirtyMask = new Uint8Array(0);
    this.fogChunksPerRow = 0;
    this.fogChunksPerColumn = 0;
    this.unitRenderables.forEach((renderable) => renderable.container.destroy(true));
    this.unitRenderables.clear();
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

    const halfWidth = this.map.tileWidth / 2;
    const halfHeight = this.map.tileHeight / 2;
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
        renderTexture.draw(textureKey, worldX - bounds.minX - halfWidth - 1, worldY - bounds.minY - halfHeight - 1);
        hasFog = true;
        tileDrawCount += 1;
      }
    }

    renderTexture.setVisible(hasFog);
    return tileDrawCount;
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
    const minY = Math.min(...corners.map((corner) => corner.top)) - 2;
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
      depth: minY + 1,
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
            const iso = cartToIso({ x, y }, this.map.tileWidth, this.map.tileHeight);
            const worldX = this.mapOrigin.x + iso.x;
            const worldY = this.mapOrigin.y + iso.y;
            renderTexture.draw(this.terrainTextureKeys.get(tile.terrain)!, worldX - minX - halfWidth - 1, worldY - minY - halfHeight - 1);
          }
        }

        this.terrainChunks.push(renderTexture);
      }
    }
    if (this.perfEnabled) console.timeEnd("terrain chunk bake");
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
