const MIN_DEVICE_PIXEL_RATIO = 1;
const MAX_DEVICE_PIXEL_RATIO = 2;
const MAX_TEXT_RESOLUTION = 4;

/**
 * The locally bundled Korean UI face, followed by platform fallbacks for the
 * first paint while the WOFF2 is still loading.
 */
export const PRE_GAME_KOREAN_FONT_FAMILY =
  '"Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';

export interface PreGameTypographyDocument {
  readonly fonts?: {
    readonly ready: Promise<unknown>;
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function resolveBrowserDevicePixelRatio(): number | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.devicePixelRatio;
}

function resolveBrowserDocument(): PreGameTypographyDocument | undefined {
  if (typeof document === "undefined") {
    return undefined;
  }

  return document;
}

/**
 * Avoid unbounded text-canvas allocations on unusually dense displays while
 * preserving enough density for standard 2x displays.
 */
export function normalizePreGameDevicePixelRatio(devicePixelRatio?: number): number {
  const candidate = devicePixelRatio ?? resolveBrowserDevicePixelRatio();

  if (candidate === undefined || !Number.isFinite(candidate)) {
    return MIN_DEVICE_PIXEL_RATIO;
  }

  return clamp(candidate, MIN_DEVICE_PIXEL_RATIO, MAX_DEVICE_PIXEL_RATIO);
}

/**
 * Phaser Text is rasterized before its parent container scales it. Increase
 * its texture resolution by both display density and the presentation scale
 * so classic 640x480 source layouts keep dynamic text crisp at fractional
 * viewport sizes.
 */
export function resolvePreGameTextResolution(
  devicePixelRatio?: number,
  presentationScale = 1,
): number {
  const normalizedScale = Number.isFinite(presentationScale)
    ? clamp(presentationScale, 1, MAX_TEXT_RESOLUTION)
    : 1;

  return Math.min(
    normalizePreGameDevicePixelRatio(devicePixelRatio) * normalizedScale,
    MAX_TEXT_RESOLUTION,
  );
}

/**
 * Requests a one-time redraw after browser fonts settle. The returned cleanup
 * prevents a stopped Phaser scene from redrawing during a later font load.
 */
export function whenPreGameTypographyReady(
  requestRedraw: () => void,
  documentReference = resolveBrowserDocument(),
): () => void {
  let active = true;
  const fontSet = documentReference?.fonts;

  if (fontSet) {
    void fontSet.ready.then(
      () => {
        if (active) {
          requestRedraw();
        }
      },
      (error: unknown) => {
        console.warn("Pre-game Korean font readiness failed; retaining the system fallback.", error);
      },
    );
  }

  return () => {
    active = false;
  };
}
