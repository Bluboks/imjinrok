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
