import type { PanelBounds } from "./hudPanel.js";

export const SOURCE_CLOCK_FRAME_COUNT = 16;

/** Source identity only; the runtime selection policy below is a product adapter. */
export const ORIGINAL_SOURCE_CLOCK_FRAME_ASSETS = Object.freeze(
  Array.from({ length: SOURCE_CLOCK_FRAME_COUNT }, (_value, sourceFrameIndex) => ({
    sourceFrameIndex,
    textureKey: `original-source-clock-frame-${String(sourceFrameIndex).padStart(4, "0")}`,
    assetPath: `assets/themes/default/ui/source-clock/clock_${String(sourceFrameIndex).padStart(4, "0")}.png`,
  })),
);

/**
 * Responsive, non-interactive presentation geometry beside the minimap.
 * This is a product layout contract: original clock placement is unresolved.
 */
export interface MinimapHudAncillaryLayout {
  readonly clockBounds: PanelBounds;
  /** Reserved for the minimap's future +/- controls. */
  readonly zoomRailBounds: PanelBounds;
}

/**
 * Allocates the clock in the minimap title rail and leaves the left map rail
 * free for zoom controls. Neither coordinate system nor geometry is a claim
 * about the 640x480 original HUD.
 */
export function resolveMinimapHudAncillaryLayout(minimapBounds: PanelBounds): MinimapHudAncillaryLayout {
  const clockHeight = clamp(Math.min(minimapBounds.width * 0.17, minimapBounds.height - 12), 28, 34);
  const clockWidth = clockHeight * 32 / 36;
  const clockBounds: PanelBounds = {
    x: minimapBounds.x + minimapBounds.width - clockWidth - 9,
    y: minimapBounds.y + 6,
    width: clockWidth,
    height: clockHeight,
  };
  const zoomRailBounds: PanelBounds = {
    x: minimapBounds.x + 8,
    y: minimapBounds.y + 42,
    width: 28,
    height: Math.max(0, minimapBounds.height - 50),
  };

  return { clockBounds, zoomRailBounds };
}

/**
 * Intentional superset adapter: maps normalized simulation day progress onto
 * the nonblank source frame subset. This is not a recovered original mapping.
 */
export function resolveSourceClockFrameIndex(timeOfDay01: number): number {
  const progress = normalizeCycleProgress(timeOfDay01);
  return Math.floor(progress * SOURCE_CLOCK_FRAME_COUNT) % SOURCE_CLOCK_FRAME_COUNT;
}

export function resolveSourceClockFrame(timeOfDay01: number): typeof ORIGINAL_SOURCE_CLOCK_FRAME_ASSETS[number] {
  return ORIGINAL_SOURCE_CLOCK_FRAME_ASSETS[resolveSourceClockFrameIndex(timeOfDay01)]!;
}

export function boundsOverlap(left: PanelBounds, right: PanelBounds): boolean {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

function normalizeCycleProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return ((value % 1) + 1) % 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
