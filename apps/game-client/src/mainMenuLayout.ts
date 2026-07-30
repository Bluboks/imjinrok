/**
 * Main-menu source sprites are authored for this fixed canvas.  The screen
 * controls below are intentionally project adaptations: the original pointer
 * rectangles have not yet been statically recovered.
 */
export const MAIN_MENU_SOURCE_WIDTH = 640;
export const MAIN_MENU_SOURCE_HEIGHT = 480;

export interface MainMenuSourcePoint {
  x: number;
  y: number;
}

export interface MainMenuSourceRect extends MainMenuSourcePoint {
  width: number;
  height: number;
}

export interface MainMenuCanvasLayout {
  scale: number;
  offsetX: number;
  offsetY: number;
  canvas: MainMenuSourceRect;
}

/**
 * Project adaptation hit areas, expressed in the unscaled 640×480 source
 * coordinate system.  They are deliberately not labelled as original UI
 * geometry until the executable input path is recovered.
 */
export const MAIN_MENU_PROJECT_ADAPTATION_HIT_RECTS = {
  main: {
    scenario: { x: 464, y: 30, width: 146, height: 98 },
    load: { x: 464, y: 138, width: 146, height: 98 },
    random: { x: 464, y: 352, width: 146, height: 96 },
    preferences: { x: 464, y: 246, width: 146, height: 98 },
  },
  country: {
    korea: { x: 58, y: 120, width: 150, height: 42 },
    japan: { x: 58, y: 172, width: 150, height: 42 },
    china: { x: 58, y: 224, width: 150, height: 42 },
    back: { x: 58, y: 300, width: 150, height: 34 },
  },
  stage: {
    border: { x: 285, y: 65, width: 320, height: 350 },
    firstSlotY: 116,
    slotHeight: 31,
    slot: { x: 305, y: 116, width: 278, height: 29 },
    back: { x: 305, y: 380, width: 278, height: 30 },
  },
  panel: {
    firstRowY: 118,
    rowHeight: 44,
    row: { x: 461, y: 118, width: 154, height: 38 },
    back: { x: 461, y: 390, width: 154, height: 38 },
  },
} as const satisfies Readonly<
  Record<string, Readonly<Record<string, MainMenuSourceRect | number>>>
>;

export function resolveMainMenuCanvasLayout(
  viewportWidth: number,
  viewportHeight: number,
): MainMenuCanvasLayout {
  assertPositiveFinite("viewportWidth", viewportWidth);
  assertPositiveFinite("viewportHeight", viewportHeight);

  const scale = Math.min(
    viewportWidth / MAIN_MENU_SOURCE_WIDTH,
    viewportHeight / MAIN_MENU_SOURCE_HEIGHT,
  );
  const canvasWidth = MAIN_MENU_SOURCE_WIDTH * scale;
  const canvasHeight = MAIN_MENU_SOURCE_HEIGHT * scale;

  return {
    scale,
    offsetX: (viewportWidth - canvasWidth) / 2,
    offsetY: (viewportHeight - canvasHeight) / 2,
    canvas: {
      x: (viewportWidth - canvasWidth) / 2,
      y: (viewportHeight - canvasHeight) / 2,
      width: canvasWidth,
      height: canvasHeight,
    },
  };
}

export function projectMainMenuSourceRect(
  layout: MainMenuCanvasLayout,
  sourceRect: MainMenuSourceRect,
): MainMenuSourceRect {
  return {
    x: layout.offsetX + sourceRect.x * layout.scale,
    y: layout.offsetY + sourceRect.y * layout.scale,
    width: sourceRect.width * layout.scale,
    height: sourceRect.height * layout.scale,
  };
}

export function getMainMenuSourcePoint(
  layout: MainMenuCanvasLayout,
  viewportPoint: MainMenuSourcePoint,
): MainMenuSourcePoint | null {
  const { canvas } = layout;
  if (
    viewportPoint.x < canvas.x ||
    viewportPoint.x > canvas.x + canvas.width ||
    viewportPoint.y < canvas.y ||
    viewportPoint.y > canvas.y + canvas.height
  ) {
    return null;
  }

  return {
    x: (viewportPoint.x - layout.offsetX) / layout.scale,
    y: (viewportPoint.y - layout.offsetY) / layout.scale,
  };
}

export function isMainMenuSourcePointInRect(
  point: MainMenuSourcePoint,
  rect: MainMenuSourceRect,
): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function assertPositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be positive and finite; got ${value}`);
  }
}
