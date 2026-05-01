import Phaser from "phaser";
import type { FrameRef, VisualBase } from "@shared";
import { getAssetScale, getFrameOrigin, getFramePivot, REFERENCE_PX_PER_WU } from "./visualScale.js";

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
  const origin = getFrameOrigin(visual, frame);
  const pivot = getFramePivot(visual, frame);
  const liftPx = (pivot.liftPx ?? 0) * assetScale * (options.liftSteps ?? 1);

  applyTextureFilter(scene, visual, frame);

  image
    .setOrigin(origin.x, origin.y)
    .setScale(assetScale)
    .setPosition(position.x, position.y - liftPx)
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
