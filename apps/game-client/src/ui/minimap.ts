import Phaser from "phaser";
import { factionDefinitions, getTileAt, resourceDefinitions, terrainDefinitions, unitDefinitions, type MapDefinition, type ResourceDefinition } from "@shared";
import { TileVisibility } from "@simulation";
import type { MinimapEntityView, MinimapPoint, MinimapViewportView, MinimapVisibilityView } from "../hud.js";

const RESOURCE_DEFINITIONS = resourceDefinitions as Readonly<Record<string, ResourceDefinition>>;

export interface MinimapGeometry {
  centerX: number;
  centerY: number;
  topY: number;
  leftX: number;
  diamondWidth: number;
  diamondHeight: number;
}

export interface MinimapFogTexture {
  image: Phaser.GameObjects.Image;
  update(visibility: MinimapVisibilityView | null): void;
  destroy(): void;
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

  const resourceRadius = Math.max(1.25, Math.min(3, tileHalfWidth * 2));
  for (const layer of mapDefinition.layers) {
    for (let tileIndex = 0; tileIndex < layer.tiles.length; tileIndex += 1) {
      const resource = layer.tiles[tileIndex]?.resource;

      if (!resource) {
        continue;
      }

      const definition = RESOURCE_DEFINITIONS[resource.kind];

      if (!definition) {
        continue;
      }

      const point = gridToMinimap(
        {
          x: tileIndex % mapDefinition.width,
          y: Math.floor(tileIndex / mapDefinition.width),
        },
        geometry,
        mapDefinition,
      );

      graphics
        .fillStyle(definition.placeholderVisual.minimapColor, 0.95)
        .fillCircle(point.x, point.y, resourceRadius)
        .lineStyle(1, definition.placeholderVisual.outlineColor, 0.8)
        .strokeCircle(point.x, point.y, resourceRadius);
    }
  }
}

export function createMinimapFogTexture(
  scene: Phaser.Scene,
  textureKey: string,
  mapDefinition: Pick<MapDefinition, "width" | "height">,
  geometry: MinimapGeometry,
): MinimapFogTexture {
  if (scene.textures.exists(textureKey)) {
    scene.textures.remove(textureKey);
  }

  const canvasWidth = Math.max(1, Math.ceil(geometry.diamondWidth));
  const canvasHeight = Math.max(1, Math.ceil(geometry.diamondHeight));
  const texture = scene.textures.createCanvas(textureKey, canvasWidth, canvasHeight);

  if (!texture) {
    throw new Error(`Failed to create minimap fog texture: ${textureKey}`);
  }

  const canvasTexture = texture;
  const image = scene.add
    .image(geometry.leftX, geometry.topY, textureKey)
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(1003)
    .setDisplaySize(geometry.diamondWidth, geometry.diamondHeight);
  const imageData = canvasTexture.context.createImageData(canvasWidth, canvasHeight);
  const data = imageData.data;
  const tileHalfWidth = geometry.diamondWidth / (mapDefinition.width + mapDefinition.height);
  const tileHalfHeight = geometry.diamondHeight / (mapDefinition.width + mapDefinition.height);
  const halfDiamondWidth = geometry.diamondWidth / 2;
  const halfDiamondHeight = geometry.diamondHeight / 2;

  canvasTexture.setFilter(Phaser.Textures.FilterMode.NEAREST);

  for (let index = 0; index < data.length; index += 4) {
    data[index] = 0x02;
    data[index + 1] = 0x07;
    data[index + 2] = 0x08;
  }

  function update(visibility: MinimapVisibilityView | null): void {
    for (let py = 0; py < canvasHeight; py += 1) {
      const localY = py + 0.5;
      const ny = (localY - halfDiamondHeight) / halfDiamondHeight;

      for (let px = 0; px < canvasWidth; px += 1) {
        const alphaIndex = (py * canvasWidth + px) * 4 + 3;

        if (!visibility) {
          data[alphaIndex] = 0;
          continue;
        }

        const localX = px + 0.5 - halfDiamondWidth;
        const nx = localX / halfDiamondWidth;

        if (Math.abs(nx) + Math.abs(ny) > 1) {
          data[alphaIndex] = 0;
          continue;
        }

        const sum = localY / tileHalfHeight;
        const diff = localX / tileHalfWidth;
        const gx = Math.floor((sum + diff) * 0.5);
        const gy = Math.floor((sum - diff) * 0.5);

        if (gx < 0 || gy < 0 || gx >= mapDefinition.width || gy >= mapDefinition.height || gx >= visibility.width || gy >= visibility.height) {
          data[alphaIndex] = 0;
          continue;
        }

        const tileVisibility = visibility.tiles[gy * visibility.width + gx] ?? TileVisibility.Unexplored;
        data[alphaIndex] = tileVisibility === TileVisibility.Visible ? 0 : tileVisibility === TileVisibility.Explored ? 115 : 217;
      }
    }

    canvasTexture.context.putImageData(imageData, 0, 0);
    canvasTexture.refresh();
  }

  return {
    image,
    update,
    destroy() {
      image.destroy();
      if (scene.textures.exists(textureKey)) {
        scene.textures.remove(textureKey);
      }
    },
  };
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
