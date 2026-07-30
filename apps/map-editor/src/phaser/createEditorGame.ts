import Phaser from "phaser";
import { cartToIso } from "@simulation";
import {
  getTileAt,
  resourceDefinitions,
  sampleMapSurfaceElevation,
  terrainDefinitions,
  type GridPoint,
  type MapDefinition,
  type ResourceDefinition,
} from "@shared";

const RESOURCE_DEFINITIONS = resourceDefinitions as Readonly<Record<string, ResourceDefinition>>;

function resolveEditorPreviewGroundContact(
  map: MapDefinition,
  mapOrigin: GridPoint,
  point: GridPoint,
): GridPoint {
  const iso = cartToIso(point, map.tileWidth, map.tileHeight);
  const surface = sampleMapSurfaceElevation(map, point);

  return {
    x: mapOrigin.x + iso.x,
    y: mapOrigin.y + iso.y - surface.liftPixels,
  };
}

class EditorPreviewScene extends Phaser.Scene {
  constructor(private readonly mapDefinition: MapDefinition) {
    super("editor-preview");
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#112528");

    const graphics = this.add.graphics();
    const originX = this.scale.width / 2;
    const originY = 120;
    const halfWidth = this.mapDefinition.tileWidth / 2;
    const halfHeight = this.mapDefinition.tileHeight / 2;

    for (let y = 0; y < this.mapDefinition.height; y += 1) {
      for (let x = 0; x < this.mapDefinition.width; x += 1) {
        const tile = getTileAt(this.mapDefinition, x, y);
        const groundContact = resolveEditorPreviewGroundContact(this.mapDefinition, { x: originX, y: originY }, { x, y });
        const worldX = groundContact.x;
        const worldY = groundContact.y;
        const points = [
          new Phaser.Geom.Point(worldX, worldY - halfHeight),
          new Phaser.Geom.Point(worldX + halfWidth, worldY),
          new Phaser.Geom.Point(worldX, worldY + halfHeight),
          new Phaser.Geom.Point(worldX - halfWidth, worldY),
        ];

        graphics.fillStyle(terrainDefinitions[tile.terrain].editorColor, 1);
        graphics.fillPoints(points, true);
        graphics.lineStyle(1, 0x264147, 0.5);
        graphics.strokePoints(points, true);

        if (tile.resource) {
          const resourceDefinition = RESOURCE_DEFINITIONS[tile.resource.kind];

          if (resourceDefinition) {
            graphics
              .fillStyle(resourceDefinition.placeholderVisual.worldColor, 0.95)
              .fillCircle(worldX, worldY - halfHeight * 0.45, 6)
              .lineStyle(2, resourceDefinition.placeholderVisual.outlineColor, 0.9)
              .strokeCircle(worldX, worldY - halfHeight * 0.45, 6);
          }
        }
      }
    }

    this.mapDefinition.spawnPoints.forEach((spawnPoint) => {
      const groundContact = resolveEditorPreviewGroundContact(this.mapDefinition, { x: originX, y: originY }, spawnPoint);
      graphics.fillStyle(0xf3dd8f, 1);
      graphics.fillCircle(groundContact.x, groundContact.y - halfHeight, 6);
    });
  }
}

export function createEditorGame(parent: HTMLDivElement, mapDefinition: MapDefinition): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: parent.clientWidth || 900,
    height: parent.clientHeight || 640,
    backgroundColor: "#112528",
    scene: [new EditorPreviewScene(mapDefinition)],
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  });
}
