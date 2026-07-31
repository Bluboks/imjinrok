export const ORIGINAL_BRIEFING_METADATA_BASE_WIDTH = 640;
export const ORIGINAL_BRIEFING_METADATA_BASE_HEIGHT = 480;

export interface OriginalBriefingMetadataSourceRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface OriginalBriefingMetadataRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Source clear/draw rectangle for the TITLE overlay. */
export const ORIGINAL_BRIEFING_TITLE_SOURCE_RECT = {
  left: 188,
  top: 65,
  right: 466,
  bottom: 95,
} as const satisfies OriginalBriefingMetadataSourceRect;

/** Source clear/draw rectangle for the OBJECTIVE overlay. */
export const ORIGINAL_BRIEFING_OBJECTIVE_SOURCE_RECT = {
  left: 188,
  top: 290,
  right: 466,
  bottom: 376,
} as const satisfies OriginalBriefingMetadataSourceRect;

export const ORIGINAL_BRIEFING_OBJECTIVE_FIRST_STRING_CENTER_Y = 311;
export const ORIGINAL_BRIEFING_OBJECTIVE_SECOND_STRING_CENTER_Y = 354;

export interface ResolvedOriginalBriefingMetadataLayout {
  scale: number;
  offsetX: number;
  offsetY: number;
  title: {
    rect: OriginalBriefingMetadataRect;
    x: number;
    centerY: number;
  };
  objective: {
    rect: OriginalBriefingMetadataRect;
    x: number;
    firstStringCenterY: number;
    secondStringCenterY: number;
    maxWidth: number;
  };
}

/**
 * Projects the source briefing metadata overlays through a uniform 640×480
 * canvas transform, preserving the original letterboxing policy.
 */
export function resolveOriginalBriefingMetadataLayout(
  viewportWidth: number,
  viewportHeight: number,
): ResolvedOriginalBriefingMetadataLayout {
  assertPositiveFinite("viewportWidth", viewportWidth);
  assertPositiveFinite("viewportHeight", viewportHeight);

  const scale = Math.min(
    viewportWidth / ORIGINAL_BRIEFING_METADATA_BASE_WIDTH,
    viewportHeight / ORIGINAL_BRIEFING_METADATA_BASE_HEIGHT,
  );
  const offsetX = (viewportWidth - ORIGINAL_BRIEFING_METADATA_BASE_WIDTH * scale) / 2;
  const offsetY = (viewportHeight - ORIGINAL_BRIEFING_METADATA_BASE_HEIGHT * scale) / 2;
  const titleRect = resolveRect(ORIGINAL_BRIEFING_TITLE_SOURCE_RECT, scale, offsetX, offsetY);
  const objectiveRect = resolveRect(ORIGINAL_BRIEFING_OBJECTIVE_SOURCE_RECT, scale, offsetX, offsetY);

  return {
    scale,
    offsetX,
    offsetY,
    title: {
      rect: titleRect,
      x: titleRect.x,
      centerY: titleRect.y + titleRect.height / 2,
    },
    objective: {
      rect: objectiveRect,
      x: objectiveRect.x,
      firstStringCenterY: offsetY + ORIGINAL_BRIEFING_OBJECTIVE_FIRST_STRING_CENTER_Y * scale,
      secondStringCenterY: offsetY + ORIGINAL_BRIEFING_OBJECTIVE_SECOND_STRING_CENTER_Y * scale,
      maxWidth: objectiveRect.width,
    },
  };
}

function resolveRect(
  sourceRect: OriginalBriefingMetadataSourceRect,
  scale: number,
  offsetX: number,
  offsetY: number,
): OriginalBriefingMetadataRect {
  return {
    x: offsetX + sourceRect.left * scale,
    y: offsetY + sourceRect.top * scale,
    width: (sourceRect.right - sourceRect.left) * scale,
    height: (sourceRect.bottom - sourceRect.top) * scale,
  };
}

function assertPositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be positive and finite; got ${value}`);
  }
}
