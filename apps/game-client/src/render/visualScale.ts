import type { FrameRef, PivotSpec, VisualBase, VisualSize } from "@shared";

/**
 * MVP reference: current 64x32 tile art is 2x1 world units, so 1 wu = 32 px.
 * The gameplay model still uses the existing pixel-based iso path; this value is
 * the bridge for source-pixel asset normalization.
 */
export const REFERENCE_PX_PER_WU = 32;

export const RENDER_DEPTH_BIAS = {
  terrain: 0,
  elevation: 0.5,
  entity: 20,
  effect: 40,
  ui: 1_000_000,
} as const;

export function getAssetScale(visual: VisualBase, pxPerWu = REFERENCE_PX_PER_WU): number {
  return pxPerWu / visual.render.srcPxPerWu;
}

export function getFrameSize(visual: VisualBase, frame: FrameRef): VisualSize {
  return frame.size ?? visual.defaults.size;
}

export function getFramePivot(visual: VisualBase, frame: FrameRef): PivotSpec {
  return frame.pivot ?? visual.defaults.pivot;
}

export function getFrameOrigin(visual: VisualBase, frame: FrameRef): { x: number; y: number } {
  const size = getFrameSize(visual, frame);
  const pivot = getFramePivot(visual, frame);

  return {
    x: pivot.anchor.x / size.w,
    y: pivot.anchor.y / size.h,
  };
}

export interface GroundContactPlacement {
  readonly origin: { x: number; y: number };
  readonly position: { x: number; y: number };
  readonly scale: number;
}

/**
 * Converts a simulation ground-contact point into render placement. The point is
 * deliberately independent from frame dimensions and source pivot values; those
 * affect only Phaser's origin. Lift is an explicit visual/elevation adjustment.
 * This is a mod-friendly project rendering adapter, not an original pivot claim.
 */
export function getGroundContactPlacement(
  visual: VisualBase,
  frame: FrameRef,
  groundContact: { x: number; y: number },
  liftSteps = 1,
  pxPerWu = REFERENCE_PX_PER_WU,
): GroundContactPlacement {
  const assetScale = getAssetScale(visual, pxPerWu);
  const pivot = getFramePivot(visual, frame);

  return {
    origin: getFrameOrigin(visual, frame),
    scale: assetScale,
    position: {
      x: groundContact.x,
      y: groundContact.y - (pivot.liftPx ?? 0) * assetScale * liftSteps,
    },
  };
}
