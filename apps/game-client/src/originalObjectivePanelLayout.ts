export const ORIGINAL_OBJECTIVE_PANEL_BASE_WIDTH = 640;
export const ORIGINAL_OBJECTIVE_PANEL_BASE_HEIGHT = 480;
export const ORIGINAL_OBJECTIVE_PANEL_FRAME_ASSET =
  "assets/themes/default/ui/objective-panel/objectiveborder_0000.png";

export interface OriginalObjectivePanelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ResolvedOriginalObjectivePanelLayout {
  scale: number;
  offsetX: number;
  offsetY: number;
  frame: OriginalObjectivePanelRect;
  content: OriginalObjectivePanelRect;
  dismissButton: OriginalObjectivePanelRect;
  text: {
    maxWidth: number;
    firstCenterY: number;
    secondCenterY: number;
  };
}

export interface OriginalObjectivePanelUpdateInput {
  controlEnabled?: number;
  controlActive?: number;
  pointerX: number;
  pointerY: number;
  currentButtonDown: number;
  previousButtonDown: number;
  oneShotDismiss: number;
  surfaceLockSucceeded: boolean;
}

export interface OriginalObjectivePanelUpdateResult {
  dismissed: boolean;
  dismissReason: "pointer-release" | "external-one-shot" | null;
  consumeOneShotDismiss: boolean;
  hitDismissButton: boolean;
  nextPreviousButtonDown: 0 | 1 | null;
  drawEvents: string[];
}

export interface OriginalObjectivePanelOwnerFrame {
  phase: "inactive" | "initialize" | "display" | "dismiss";
  nextState: number;
  events: string[];
  update?: OriginalObjectivePanelUpdateResult;
}

const FRAME_RECT: Readonly<OriginalObjectivePanelRect> = { x: 112, y: 81, width: 416, height: 236 };
const CONTENT_RECT: Readonly<OriginalObjectivePanelRect> = { x: 158, y: 135, width: 320, height: 124 };
const DISMISS_BUTTON_RECT: Readonly<OriginalObjectivePanelRect> = { x: 415, y: 267, width: 80, height: 24 };
const TEXT_EFFECTIVE_MAX_WIDTH = 300;
const FIRST_TEXT_CENTER_Y = 166;
const SECOND_TEXT_CENTER_Y = 228;

export function resolveOriginalObjectivePanelLayout(
  viewportWidth: number,
  viewportHeight: number,
): ResolvedOriginalObjectivePanelLayout {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    throw new RangeError(`viewportWidth must be positive and finite; got ${viewportWidth}`);
  }
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    throw new RangeError(`viewportHeight must be positive and finite; got ${viewportHeight}`);
  }

  const scale = Math.min(
    viewportWidth / ORIGINAL_OBJECTIVE_PANEL_BASE_WIDTH,
    viewportHeight / ORIGINAL_OBJECTIVE_PANEL_BASE_HEIGHT,
  );
  const offsetX = (viewportWidth - ORIGINAL_OBJECTIVE_PANEL_BASE_WIDTH * scale) / 2;
  const offsetY = (viewportHeight - ORIGINAL_OBJECTIVE_PANEL_BASE_HEIGHT * scale) / 2;

  return {
    scale,
    offsetX,
    offsetY,
    frame: scaleRect(FRAME_RECT, scale, offsetX, offsetY),
    content: scaleRect(CONTENT_RECT, scale, offsetX, offsetY),
    dismissButton: scaleRect(DISMISS_BUTTON_RECT, scale, offsetX, offsetY),
    text: {
      maxWidth: TEXT_EFFECTIVE_MAX_WIDTH * scale,
      firstCenterY: offsetY + FIRST_TEXT_CENTER_Y * scale,
      secondCenterY: offsetY + SECOND_TEXT_CENTER_Y * scale,
    },
  };
}

export function isResolvedOriginalObjectiveDismissButtonHit(
  layout: ResolvedOriginalObjectivePanelLayout,
  pointerX: number,
  pointerY: number,
): boolean {
  assertFiniteCoordinate(pointerX, "pointerX");
  assertFiniteCoordinate(pointerY, "pointerY");
  const dismissButton = layout.dismissButton;
  return (
    pointerX > dismissButton.x &&
    pointerX < dismissButton.x + dismissButton.width &&
    pointerY > dismissButton.y &&
    pointerY < dismissButton.y + dismissButton.height
  );
}

export function resolveOriginalObjectivePanelUpdate(
  input: OriginalObjectivePanelUpdateInput,
): OriginalObjectivePanelUpdateResult {
  const controlEnabled = input.controlEnabled ?? 1;
  const controlActive = input.controlActive ?? 1;
  assertSignedWord(input.pointerX, "pointerX");
  assertSignedWord(input.pointerY, "pointerY");
  assertDword(controlEnabled, "controlEnabled");
  assertDword(controlActive, "controlActive");
  assertDword(input.currentButtonDown, "currentButtonDown");
  assertDword(input.previousButtonDown, "previousButtonDown");
  assertDword(input.oneShotDismiss, "oneShotDismiss");
  if (typeof input.surfaceLockSucceeded !== "boolean") {
    throw new TypeError(
      `surfaceLockSucceeded must be boolean; got ${String(input.surfaceLockSucceeded)}`,
    );
  }

  const hitDismissButton = isDismissButtonHit(input.pointerX, input.pointerY);
  if (
    controlEnabled === 1 &&
    controlActive === 1 &&
    hitDismissButton &&
    input.currentButtonDown === 0 &&
    input.previousButtonDown === 1
  ) {
    return dismissedUpdate("pointer-release", false, hitDismissButton);
  }
  if (input.oneShotDismiss === 1) {
    return dismissedUpdate("external-one-shot", true, hitDismissButton);
  }

  const drawEvents = input.surfaceLockSucceeded
    ? [
        "save-dirty-rect",
        "expand-dirty-rect",
        "draw-frame",
        "draw-dismiss-control",
        "unlock",
        "restore-dirty-rect",
      ]
    : [];
  drawEvents.push("present-content-region");
  return {
    dismissed: false,
    dismissReason: null,
    consumeOneShotDismiss: false,
    hitDismissButton,
    nextPreviousButtonDown: input.currentButtonDown === 0 ? 0 : 1,
    drawEvents,
  };
}

export function resolveOriginalObjectivePanelOwnerFrame({
  ownerEnabled,
  state,
  update,
  cleanupSurfaceLockSucceeded,
}: {
  ownerEnabled: number;
  state: number;
  update?: OriginalObjectivePanelUpdateInput;
  cleanupSurfaceLockSucceeded?: boolean;
}): OriginalObjectivePanelOwnerFrame {
  assertDword(ownerEnabled, "ownerEnabled");
  assertSignedWord(state, "state");
  if (ownerEnabled === 0 || (state !== 0x3f0 && state !== 0x3f1)) {
    return { phase: "inactive", nextState: state, events: [] };
  }
  if (state === 0x3f0) {
    return { phase: "initialize", nextState: 0x3f1, events: ["initialize-objective-modal"] };
  }
  if (!update) {
    throw new TypeError("update input is required for objective-modal state 0x3f1");
  }

  const result = resolveOriginalObjectivePanelUpdate(update);
  if (!result.dismissed) {
    return {
      phase: "display",
      nextState: 0x3f1,
      events: result.drawEvents,
      update: result,
    };
  }
  if (typeof cleanupSurfaceLockSucceeded !== "boolean") {
    throw new TypeError(
      `cleanupSurfaceLockSucceeded is required for dismissal cleanup and must be boolean; got ${String(cleanupSurfaceLockSucceeded)}`,
    );
  }
  return {
    phase: "dismiss",
    nextState: 1000,
    events: resolveSuccessfulResourceCleanup(cleanupSurfaceLockSucceeded),
    update: result,
  };
}

export function isOriginalObjectiveDismissButtonHit(pointerX: number, pointerY: number): boolean {
  assertSignedWord(pointerX, "pointerX");
  assertSignedWord(pointerY, "pointerY");
  return isDismissButtonHit(pointerX, pointerY);
}

function isDismissButtonHit(pointerX: number, pointerY: number): boolean {
  return (
    pointerX > DISMISS_BUTTON_RECT.x &&
    pointerX < DISMISS_BUTTON_RECT.x + DISMISS_BUTTON_RECT.width &&
    pointerY > DISMISS_BUTTON_RECT.y &&
    pointerY < DISMISS_BUTTON_RECT.y + DISMISS_BUTTON_RECT.height
  );
}

function scaleRect(
  source: Readonly<OriginalObjectivePanelRect>,
  scale: number,
  offsetX: number,
  offsetY: number,
): OriginalObjectivePanelRect {
  return {
    x: offsetX + source.x * scale,
    y: offsetY + source.y * scale,
    width: source.width * scale,
    height: source.height * scale,
  };
}

function dismissedUpdate(
  dismissReason: "pointer-release" | "external-one-shot",
  consumeOneShotDismiss: boolean,
  hitDismissButton: boolean,
): OriginalObjectivePanelUpdateResult {
  return {
    dismissed: true,
    dismissReason,
    consumeOneShotDismiss,
    hitDismissButton,
    nextPreviousButtonDown: null,
    drawEvents: [],
  };
}

function resolveSuccessfulResourceCleanup(cleanupSurfaceLockSucceeded: boolean): string[] {
  const events = ["release-objective-resource", "attempt-clear-content"];
  if (cleanupSurfaceLockSucceeded) {
    events.push("clear-content-region", "unlock-clear-surface");
  }
  return events;
}

function assertSignedWord(value: number, label: string): void {
  if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) {
    throw new RangeError(
      `${label} must be a signed WORD value (-32768..32767); got ${String(value)}`,
    );
  }
}

function assertDword(value: number, label: string): void {
  if (!Number.isInteger(value) || value < -0x80000000 || value > 0xffffffff) {
    throw new RangeError(`${label} must fit the original 32-bit field; got ${String(value)}`);
  }
}

function assertFiniteCoordinate(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite; got ${String(value)}`);
  }
}
