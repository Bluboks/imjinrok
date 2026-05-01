import Phaser from "phaser";
import { cartToIso } from "@simulation";
import { getTileAt, terrainDefinitions, type MapDefinition } from "@shared";

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
        const iso = cartToIso({ x, y }, this.mapDefinition.tileWidth, this.mapDefinition.tileHeight);
        const worldX = originX + iso.x;
        const worldY = originY + iso.y;
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
      }
    }

    this.mapDefinition.spawnPoints.forEach((spawnPoint) => {
      const iso = cartToIso(spawnPoint, this.mapDefinition.tileWidth, this.mapDefinition.tileHeight);
      graphics.fillStyle(0xf3dd8f, 1);
      graphics.fillCircle(originX + iso.x, originY + iso.y - halfHeight, 6);
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
