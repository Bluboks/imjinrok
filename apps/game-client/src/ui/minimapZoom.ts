export const MINIMAP_ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export const MINIMAP_ZOOM_MIN = MINIMAP_ZOOM_PRESETS[0];
export const MINIMAP_ZOOM_MAX = MINIMAP_ZOOM_PRESETS[6];

export type MinimapZoomDirection = -1 | 1;

export interface MinimapZoomRailBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MinimapZoomRailLayout {
  increase: MinimapZoomRailBounds;
  decrease: MinimapZoomRailBounds;
}

/**
 * Resolves the next preset strictly beyond the current value so wheel-created
 * continuous zoom values remain predictable when a rail control is pressed.
 */
export function resolveAdjacentMinimapZoomPreset(
  zoom: number,
  direction: MinimapZoomDirection,
): number | null {
  if (!Number.isFinite(zoom)) {
    throw new RangeError(`minimap zoom must be finite; got ${String(zoom)}`);
  }

  return direction > 0
    ? MINIMAP_ZOOM_PRESETS.find((preset) => preset > zoom) ?? null
    : [...MINIMAP_ZOOM_PRESETS].reverse().find((preset) => preset < zoom) ?? null;
}

export function formatMinimapZoomPercent(zoom: number): string {
  if (!Number.isFinite(zoom)) {
    throw new RangeError(`minimap zoom must be finite; got ${String(zoom)}`);
  }

  return `${Math.round(zoom * 100)}%`;
}

/** Keeps the controls tied to the minimap panel instead of any fixed screen coordinate. */
export function resolveMinimapZoomRailLayout(bounds: MinimapZoomRailBounds): MinimapZoomRailLayout {
  assertPositiveBounds(bounds);

  const buttonSize = Math.min(26, Math.max(18, Math.floor(Math.min(bounds.width * 0.13, bounds.height * 0.21))));
  const x = bounds.x + 8;

  return {
    increase: { x, y: bounds.y + 40, width: buttonSize, height: buttonSize },
    decrease: { x, y: bounds.y + bounds.height - buttonSize - 8, width: buttonSize, height: buttonSize },
  };
}

function assertPositiveBounds(bounds: MinimapZoomRailBounds): void {
  for (const [name, value] of Object.entries(bounds)) {
    if (!Number.isFinite(value)) {
      throw new RangeError(`minimap zoom rail bounds.${name} must be finite; got ${String(value)}`);
    }
  }

  if (bounds.width <= 0 || bounds.height <= 0) {
    throw new RangeError(`minimap zoom rail bounds must be positive; got ${JSON.stringify(bounds)}`);
  }
}
