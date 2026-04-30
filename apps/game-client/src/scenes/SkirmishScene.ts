import Phaser from "phaser";
import { defaultMap, getTileAt, type GridPoint, type MapDefinition, type TerrainType } from "@shared";
import {
  advanceWorldTick,
  applyCommand,
  cartToIso,
  createInitialWorldState,
  isoToCart,
  type UnitState,
  type WorldState,
} from "@simulation";
import {
  SELECTED_ENTITY_CHANGED_EVENT,
  SELECTED_ENTITY_REGISTRY_KEY,
  VIRTUAL_CURSOR_CHANGED_EVENT,
  VIRTUAL_CURSOR_REGISTRY_KEY,
  toSelectedEntityView,
} from "../hud.js";
import type { GameLaunchContext } from "../session.js";

const DRAG_THRESHOLD_SQ = 36;
const EDGE_PAN_SIZE = 28;
const EDGE_PAN_SPEED = 520;

export class SkirmishScene extends Phaser.Scene {
  private map: MapDefinition = defaultMap;
  private worldState: WorldState = createInitialWorldState(defaultMap, ["local-player", "cpu-1"]);
  private lastTickAt = 0;
  private mapOrigin = new Phaser.Math.Vector2(0, 0);
  private terrainGraphics?: Phaser.GameObjects.Graphics;
  private unitGraphics?: Phaser.GameObjects.Graphics;
  private selectionGraphics?: Phaser.GameObjects.Graphics;
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
    this.map = defaultMap;
    this.worldState = createInitialWorldState(this.map, players);
    this.mapOrigin.set(this.scale.width / 2, 160);
    this.virtualCursorScreen.set(this.scale.width / 2, this.scale.height / 2);

    this.cameras.main.setBackgroundColor("#143137");
    this.cameras.main.centerOn(this.mapOrigin.x, this.mapOrigin.y + (this.map.height * this.map.tileHeight) / 2);
    this.clampCameraToWorld();

    this.terrainGraphics = this.add.graphics();
    this.unitGraphics = this.add.graphics();
    this.selectionGraphics = this.add.graphics().setScrollFactor(0).setDepth(900);

    this.setupCameraControls();
    this.setupMouseControls();
    this.setupPointerLockLifecycle();
    this.redrawTerrain();
    this.redrawUnits();
    this.publishVirtualCursor();
    this.selectInitialUnit(players[0] ?? "local-player");
  }

  override update(time: number, delta: number): void {
    this.handleEdgePan(delta);

    if (time - this.lastTickAt < 100) {
      return;
    }

    advanceWorldTick(this.worldState);
    this.lastTickAt = time;
    this.redrawUnits();
  }

  private setupCameraControls(): void {
    this.input.mouse?.disableContextMenu();

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
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
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
  }

  private handleShutdown(): void {
    this.input.manager.events.off(Phaser.Input.Events.POINTERLOCK_CHANGE, this.handlePointerLockChanged, this);
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
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

  private handleEdgePan(delta: number): void {
    const panDirection = this.getEdgePanDirection(this.virtualCursorScreen);

    if (panDirection.lengthSq() === 0) {
      return;
    }

    panDirection.normalize();

    const distance = (EDGE_PAN_SPEED * delta) / 1000 / this.cameras.main.zoom;

    this.cameras.main.scrollX += panDirection.x * distance;
    this.cameras.main.scrollY += panDirection.y * distance;
    this.clampCameraToWorld();
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
    this.selectionGraphics?.clear();
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
      return;
    }

    this.isDragSelecting = true;
    this.drawDragSelectionBox();
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
    this.selectionGraphics?.clear();
  }

  private cancelDragSelection(): void {
    this.dragStartScreen = null;
    this.dragCurrentScreen = null;
    this.isDragSelecting = false;
    this.selectionGraphics?.clear();
  }

  private drawDragSelectionBox(): void {
    if (!this.selectionGraphics || !this.dragStartScreen || !this.dragCurrentScreen) {
      return;
    }

    const rectangle = this.getScreenRectangle(this.dragStartScreen, this.dragCurrentScreen);

    this.selectionGraphics.clear();
    this.selectionGraphics.fillStyle(0xd0b46a, 0.12);
    this.selectionGraphics.fillRect(rectangle.x, rectangle.y, rectangle.width, rectangle.height);
    this.selectionGraphics.lineStyle(1, 0xf4df8e, 0.95);
    this.selectionGraphics.strokeRect(rectangle.x, rectangle.y, rectangle.width, rectangle.height);
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
      const unitScreenPosition = this.getUnitScreenPosition(unit);

      return Phaser.Geom.Rectangle.Contains(rectangle, unitScreenPosition.x, unitScreenPosition.y);
    });

    this.selectUnits(selectedUnits);
  }

  private issueDefaultActionAtScreenPoint(point: Phaser.Math.Vector2): void {
    const commandableUnits = this.getSelectedUnits().filter((unit) => unit.kind === "villager");

    if (commandableUnits.length === 0) {
      return;
    }

    const target = this.getGridPointFromScreenPoint(point);

    commandableUnits.forEach((unit, index) => {
      const targetWithOffset = this.getFormationTarget(target, index);

      applyCommand(this.worldState, {
        sessionId: this.launchContext?.session?.id ?? "offline-skirmish",
        playerId: unit.playerId,
        issuedAtTick: this.worldState.tick,
        command: {
          type: "move",
          unitId: unit.id,
          target: targetWithOffset,
        },
      });
    });

    this.emitSelectionChanged();
    this.redrawUnits();
    this.showMoveTargetMarker(target);
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

    return new Phaser.Math.Vector2(
      camera.scrollX + (point.x - camera.x) / camera.zoom,
      camera.scrollY + (point.y - camera.y) / camera.zoom,
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
    const camera = this.cameras.main;
    const worldPosition = this.getUnitWorldPosition(unit);

    return new Phaser.Math.Vector2(
      camera.x + (worldPosition.x - camera.scrollX) * camera.zoom,
      camera.y + (worldPosition.y - camera.scrollY) * camera.zoom,
    );
  }

  private getHudTop(): number {
    const hudHeight = Phaser.Math.Clamp(this.scale.height * 0.26, 178, 220);

    return this.scale.height - hudHeight;
  }

  private clampCameraToWorld(): void {
    const bounds = this.getWorldFieldBounds();
    const camera = this.cameras.main;
    const halfViewWidth = this.scale.width / 2 / camera.zoom;
    const halfViewHeight = this.scale.height / 2 / camera.zoom;
    const centerX = camera.scrollX + halfViewWidth;
    const centerY = camera.scrollY + halfViewHeight;
    const clampedCenterX = Phaser.Math.Clamp(centerX, bounds.left, bounds.right);
    const clampedCenterY = Phaser.Math.Clamp(centerY, bounds.top, bounds.bottom);

    camera.scrollX = clampedCenterX - halfViewWidth;
    camera.scrollY = clampedCenterY - halfViewHeight;
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
    const units = Object.values(this.worldState.units);
    const preferredUnit =
      units.find((unit) => unit.playerId === playerId && unit.kind === "town-center") ?? units[0];

    if (preferredUnit) {
      this.selectUnits([preferredUnit]);
    }
  }

  private selectUnits(units: UnitState[]): void {
    this.selectedUnitIds.clear();

    for (const unit of units) {
      this.selectedUnitIds.add(unit.id);
    }

    this.emitSelectionChanged();
    this.redrawUnits();
  }

  private clearSelection(): void {
    this.selectedUnitIds.clear();
    this.emitSelectionChanged();
    this.redrawUnits();
  }

  private emitSelectionChanged(): void {
    const selection = this.getSelectedUnits().map((unit) => toSelectedEntityView(unit));

    this.registry.set(SELECTED_ENTITY_REGISTRY_KEY, selection);
    this.game.events.emit(SELECTED_ENTITY_CHANGED_EVENT, selection);
  }

  private getSelectedUnits(): UnitState[] {
    return Object.values(this.worldState.units).filter((unit) => this.selectedUnitIds.has(unit.id));
  }

  private findUnitAtWorldPoint(worldX: number, worldY: number): UnitState | null {
    let selectedUnit: UnitState | null = null;
    let selectedDistanceSq = Number.POSITIVE_INFINITY;

    for (const unit of Object.values(this.worldState.units)) {
      const unitPosition = this.getUnitWorldPosition(unit);
      const radius = unit.kind === "town-center" ? 24 : 16;
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

  private redrawTerrain(): void {
    if (!this.terrainGraphics) {
      return;
    }

    this.terrainGraphics.clear();

    const halfWidth = this.map.tileWidth / 2;
    const halfHeight = this.map.tileHeight / 2;

    for (let y = 0; y < this.map.height; y += 1) {
      for (let x = 0; x < this.map.width; x += 1) {
        const tile = getTileAt(this.map, x, y);
        const iso = cartToIso({ x, y }, this.map.tileWidth, this.map.tileHeight);
        const worldX = this.mapOrigin.x + iso.x;
        const worldY = this.mapOrigin.y + iso.y;
        const points = [
          new Phaser.Geom.Point(worldX, worldY - halfHeight),
          new Phaser.Geom.Point(worldX + halfWidth, worldY),
          new Phaser.Geom.Point(worldX, worldY + halfHeight),
          new Phaser.Geom.Point(worldX - halfWidth, worldY),
        ];

        this.terrainGraphics.fillStyle(this.getTerrainColor(tile.terrain), 1);
        this.terrainGraphics.fillPoints(points, true);
        this.terrainGraphics.lineStyle(1, 0x203037, 0.6);
        this.terrainGraphics.strokePoints(points, true);
      }
    }
  }

  private redrawUnits(): void {
    if (!this.unitGraphics) {
      return;
    }

    const unitGraphics = this.unitGraphics;

    unitGraphics.clear();

    Object.values(this.worldState.units).forEach((unit) => {
      const unitPosition = this.getUnitWorldPosition(unit);
      const worldX = unitPosition.x;
      const worldY = unitPosition.y;
      const color = unit.playerId === "local-player" ? 0xe8d77d : 0xd36454;
      const radius = unit.kind === "town-center" ? 12 : 6;

      if (this.selectedUnitIds.has(unit.id)) {
        unitGraphics.lineStyle(2, 0xf3dd8f, 1);
        unitGraphics.strokeEllipse(worldX, worldY + radius * 0.4, radius * 3.2, radius * 1.8);
      }

      unitGraphics.fillStyle(color, 1);
      unitGraphics.fillCircle(worldX, worldY, radius);
      unitGraphics.lineStyle(2, 0x102125, 0.9);
      unitGraphics.strokeCircle(worldX, worldY, radius);
    });
  }

  private getTerrainColor(terrain: TerrainType): number {
    switch (terrain) {
      case "forest":
        return 0x3f6f48;
      case "water":
        return 0x346c88;
      case "cliff":
        return 0x837362;
      case "grass":
        return 0x7aa35a;
    }
  }
}
