export interface SelectionPortraitFit {
  width: number;
  height: number;
}

/** Returns a proportional fit for an image inside a square selection portrait frame. */
export function getSelectionPortraitFit(
  sourceWidth: number,
  sourceHeight: number,
  availableSize: number,
): SelectionPortraitFit | null {
  if (
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight) ||
    !Number.isFinite(availableSize) ||
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    availableSize <= 0
  ) {
    return null;
  }

  const scale = Math.min(availableSize / sourceWidth, availableSize / sourceHeight);

  return {
    width: sourceWidth * scale,
    height: sourceHeight * scale,
  };
}
