import type { AuraIndicatorPresentation } from "./auraIndicatorPresentation.js";

export interface AuraIndicatorHandle {
  destroy(): void;
}

/**
 * Keeps optional project/mod indicators out of the regular unit renderable
 * lifetime. A handle exists only while the authoritative snapshot requests a
 * presentable indicator.
 */
export function reconcileAuraIndicator<T extends AuraIndicatorHandle>(
  current: T | undefined,
  presentation: AuraIndicatorPresentation | null,
  create: () => T,
  redraw: (indicator: T, presentation: AuraIndicatorPresentation) => void,
): T | undefined {
  if (!presentation) {
    current?.destroy();
    return undefined;
  }

  const indicator = current ?? create();
  redraw(indicator, presentation);
  return indicator;
}
