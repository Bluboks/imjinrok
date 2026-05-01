import Phaser from "phaser";
import { factionDefinitions, getTileAt, terrainDefinitions, unitDefinitions, type MapDefinition } from "@shared";
import type { MinimapEntityView, MinimapPoint, MinimapViewportView } from "../hud.js";

export interface MinimapGeometry {
  centerX: number;
  centerY: number;
  topY: number;
  leftX: number;
  diamondWidth: number;
  diamondHeight: number;
}

export function createMinimapGeometry(x: number, y: number, width: number, height: number): MinimapGeometry {
  const diamondWidth = Math.min(width - 36, (height - 54) * 1.55);
  const diamondHeight = Math.min(height - 54, diamondWidth * 0.58);
  const centerX = x + width / 2;
  const centerY = y + 48 + diamondHeight / 2;
  const topY = centerY - diamondHeight / 2;
  const leftX = centerX - diamondWidth / 2;

  return { centerX, centerY, topY, leftX, diamondWidth, diamondHeight };
}

export function getMinimapDiamondPoints(geometry: MinimapGeometry): Phaser.Geom.Point[] {
  return [
    new Phaser.Geom.Point(geometry.centerX, geometry.topY),
    new Phaser.Geom.Point(geometry.centerX + geometry.diamondWidth / 2, geometry.centerY),
    new Phaser.Geom.Point(geometry.centerX, geometry.centerY + geometry.diamondHeight / 2),
    new Phaser.Geom.Point(geometry.centerX - geometry.diamondWidth / 2, geometry.centerY),
  ];
}

export function gridToMinimap(
  position: MinimapPoint,
  geometry: MinimapGeometry,
  mapDefinition: Pick<MapDefinition, "width" | "height">,
): Phaser.Geom.Point {
  const tileHalfWidth = geometry.diamondWidth / (mapDefinition.width + mapDefinition.height);
  const tileHalfHeight = geometry.diamondHeight / (mapDefinition.width + mapDefinition.height);

  return new Phaser.Geom.Point(
    geometry.centerX + (position.x - position.y) * tileHalfWidth,
    geometry.topY + (position.x + position.y) * tileHalfHeight,
  );
}

export function worldToMinimap(
  position: MinimapPoint,
  geometry: MinimapGeometry,
  bounds: MinimapViewportView["worldBounds"],
): Phaser.Geom.Point {
  const normalizedX = bounds.width === 0 ? 0.5 : (position.x - bounds.x) / bounds.width;
  const normalizedY = bounds.height === 0 ? 0.5 : (position.y - bounds.y) / bounds.height;

  return new Phaser.Geom.Point(
    geometry.leftX + normalizedX * geometry.diamondWidth,
    geometry.topY + normalizedY * geometry.diamondHeight,
  );
}

export function getPointInMinimapDiamond(
  point: Phaser.Math.Vector2,
  geometry: MinimapGeometry,
  clampToMinimap: boolean,
): Phaser.Math.Vector2 | null {
  const { centerX, centerY, diamondWidth, diamondHeight } = geometry;
  const halfWidth = diamondWidth / 2;
  const halfHeight = diamondHeight / 2;
  const normalizedX = (point.x - centerX) / halfWidth;
  const normalizedY = (point.y - centerY) / halfHeight;
  const absX = Math.abs(normalizedX);
  const absY = Math.abs(normalizedY);

  if (absX + absY <= 1) {
    return point;
  }

  if (!clampToMinimap) {
    return null;
  }

  const signX = normalizedX < 0 ? -1 : 1;
  const signY = normalizedY < 0 ? -1 : 1;
  let clampedX: number;
  let clampedY: number;

  if (absX - absY >= 1) {
    clampedX = 1;
    clampedY = 0;
  } else if (absY - absX >= 1) {
    clampedX = 0;
    clampedY = 1;
  } else {
    clampedX = (absX - absY + 1) / 2;
    clampedY = (absY - absX + 1) / 2;
  }

  return new Phaser.Math.Vector2(centerX + signX * clampedX * halfWidth, centerY + signY * clampedY * halfHeight);
}

export function getMinimapWorldPoint(
  point: Phaser.Math.Vector2,
  geometry: MinimapGeometry,
  bounds: MinimapViewportView["worldBounds"],
  clampToMinimap = false,
): MinimapPoint | null {
  const clampedPoint = getPointInMinimapDiamond(point, geometry, clampToMinimap);

  if (!clampedPoint) {
    return null;
  }

  const normalizedX = Phaser.Math.Clamp((clampedPoint.x - geometry.leftX) / geometry.diamondWidth, 0, 1);
  const normalizedY = Phaser.Math.Clamp((clampedPoint.y - geometry.topY) / geometry.diamondHeight, 0, 1);

  return {
    x: bounds.x + normalizedX * bounds.width,
    y: bounds.y + normalizedY * bounds.height,
  };
}

export function drawMinimapTerrainCache(
  graphics: Phaser.GameObjects.Graphics,
  mapDefinition: MapDefinition,
  geometry: MinimapGeometry,
): void {
  const tileHalfWidth = geometry.diamondWidth / (mapDefinition.width + mapDefinition.height);
  const tileHalfHeight = geometry.diamondHeight / (mapDefinition.width + mapDefinition.height);
  const terrainSampleStep = Math.max(1, Math.ceil(Math.max(mapDefinition.width, mapDefinition.height) / 96));

  graphics.fillStyle(0x071214, 1);
  graphics.fillPoints(getMinimapDiamondPoints(geometry), true);

  for (let mapY = 0; mapY < mapDefinition.height; mapY += terrainSampleStep) {
    for (let mapX = 0; mapX < mapDefinition.width; mapX += terrainSampleStep) {
      const tileCenter = gridToMinimap(
        {
          x: mapX + (terrainSampleStep - 1) / 2,
          y: mapY + (terrainSampleStep - 1) / 2,
        },
        geometry,
        mapDefinition,
      );
      const tile = getTileAt(mapDefinition, mapX, mapY);
      const sampledHalfWidth = tileHalfWidth * terrainSampleStep;
      const sampledHalfHeight = tileHalfHeight * terrainSampleStep;

      graphics.fillStyle(terrainDefinitions[tile.terrain].minimapColor, 0.78);
      graphics.fillPoints(
        [
          new Phaser.Geom.Point(tileCenter.x, tileCenter.y - sampledHalfHeight),
          new Phaser.Geom.Point(tileCenter.x + sampledHalfWidth, tileCenter.y),
          new Phaser.Geom.Point(tileCenter.x, tileCenter.y + sampledHalfHeight),
          new Phaser.Geom.Point(tileCenter.x - sampledHalfWidth, tileCenter.y),
        ],
        true,
      );
    }
  }
}

export function drawMinimapEntityMarker(
  graphics: Phaser.GameObjects.Graphics,
  entity: MinimapEntityView,
  marker: Phaser.Geom.Point,
): void {
  const unitDefinition = unitDefinitions[entity.kind];
  const radius = entity.selected ? unitDefinition.selectedMinimapRadius : unitDefinition.minimapRadius;

  graphics.fillStyle(factionDefinitions[entity.faction].minimapColor, 1);
  if (unitDefinition.minimapShape === "square") graphics.fillRect(marker.x - radius, marker.y - radius, radius * 2, radius * 2);
  else graphics.fillCircle(marker.x, marker.y, radius);

  graphics.lineStyle(entity.selected ? 2 : 1, entity.selected ? 0xf4df8e : 0x071214, 1);
  if (unitDefinition.minimapShape === "square") graphics.strokeRect(marker.x - radius, marker.y - radius, radius * 2, radius * 2);
  else graphics.strokeCircle(marker.x, marker.y, radius + (entity.selected ? 1.8 : 1));
}
