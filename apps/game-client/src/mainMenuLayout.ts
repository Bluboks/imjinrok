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
 * Project adaptation hit areas are expressed in the profile's logical
 * coordinate system. They are deliberately not labelled as original UI
 * geometry until the executable input path is recovered.
 */
export interface MainMenuProjectAdaptationHitRects {
  main: {
    scenario: MainMenuSourceRect;
    load: MainMenuSourceRect;
    random: MainMenuSourceRect;
    preferences: MainMenuSourceRect;
  };
  country: {
    back: MainMenuSourceRect;
  };
  stage: {
    border: MainMenuSourceRect;
    firstSlotY: number;
    slotHeight: number;
    slot: MainMenuSourceRect;
    back: MainMenuSourceRect;
  };
  panel: {
    firstRowY: number;
    rowHeight: number;
    row: MainMenuSourceRect;
    back: MainMenuSourceRect;
  };
}

export interface MainMenuPresentationGeometry {
  logicalWidth: number;
  logicalHeight: number;
  projectAdaptationHitRects: MainMenuProjectAdaptationHitRects;
}

/**
 * Original Imjinrok source-art profile. Future remastered presentation may
 * replace its logical canvas, assets, and geometry independently of engine
 * viewport policy.
 */
export const IMJINROK_CLASSIC_MAIN_MENU_GEOMETRY = {
  logicalWidth: 640,
  logicalHeight: 480,
  projectAdaptationHitRects: {
    main: {
      scenario: { x: 464, y: 30, width: 146, height: 98 },
      load: { x: 464, y: 138, width: 146, height: 98 },
      random: { x: 464, y: 352, width: 146, height: 96 },
      preferences: { x: 464, y: 246, width: 146, height: 98 },
    },
    country: {
      back: { x: 18, y: 430, width: 118, height: 32 },
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
  },
} as const satisfies MainMenuPresentationGeometry;

export function resolveMainMenuCanvasLayout(
  viewportWidth: number,
  viewportHeight: number,
  presentation: Pick<
    MainMenuPresentationGeometry,
    "logicalWidth" | "logicalHeight"
  >,
): MainMenuCanvasLayout {
  assertPositiveFinite("viewportWidth", viewportWidth);
  assertPositiveFinite("viewportHeight", viewportHeight);
  assertPositiveFinite("presentation.logicalWidth", presentation.logicalWidth);
  assertPositiveFinite(
    "presentation.logicalHeight",
    presentation.logicalHeight,
  );

  const scale = Math.min(
    viewportWidth / presentation.logicalWidth,
    viewportHeight / presentation.logicalHeight,
  );
  const canvasWidth = presentation.logicalWidth * scale;
  const canvasHeight = presentation.logicalHeight * scale;

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
