import Phaser from "phaser";
import type { FrameRef, VisualBase } from "@shared";
import { getAssetScale, getGroundContactPlacement, REFERENCE_PX_PER_WU } from "./visualScale.js";

export interface StaticVisualPosition {
  x: number;
  y: number;
}

export interface PlaceStaticVisualOptions {
  depth: number;
  depthBias?: number;
  liftSteps?: number;
  pxPerWu?: number;
}

export function placeStaticVisual(
  scene: Phaser.Scene,
  visual: VisualBase,
  frame: FrameRef,
  position: StaticVisualPosition,
  options: PlaceStaticVisualOptions,
): Phaser.GameObjects.Image {
  const image = frame.frameName
    ? scene.add.image(position.x, position.y, frame.textureKey, frame.frameName)
    : scene.add.image(position.x, position.y, frame.textureKey);
  const pxPerWu = options.pxPerWu ?? REFERENCE_PX_PER_WU;
  const assetScale = getAssetScale(visual, pxPerWu);
  const placement = getGroundContactPlacement(
    visual,
    frame,
    position,
    options.liftSteps ?? 1,
    pxPerWu,
  );

  applyTextureFilter(scene, visual, frame);

  image
    .setOrigin(placement.origin.x, placement.origin.y)
    .setScale(assetScale)
    .setPosition(placement.position.x, placement.position.y)
    .setDepth(options.depth + (options.depthBias ?? 0));

  return image;
}

function applyTextureFilter(scene: Phaser.Scene, visual: VisualBase, frame: FrameRef): void {
  const texture = scene.textures.get(frame.textureKey);
  const filterMode = visual.render.filtering === "linear"
    ? Phaser.Textures.FilterMode.LINEAR
    : Phaser.Textures.FilterMode.NEAREST;

  texture.setFilter(filterMode);
}
