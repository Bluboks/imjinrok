export const ORIGINAL_GAMEPLAY_COMMAND_GRID_BASE_WIDTH = 640;
export const ORIGINAL_GAMEPLAY_COMMAND_GRID_BASE_HEIGHT = 480;
export const ORIGINAL_GAMEPLAY_COMMAND_GRID_SLOT_COUNT = 9;
export const ORIGINAL_GAMEPLAY_COMMAND_GRID_SCENARIO_ID = "imjinrok-k01-opening";

export interface OriginalGameplayCommandGridRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ResolvedOriginalGameplayCommandGridLayout {
  scale: number;
  offsetX: number;
  offsetY: number;
  slots: readonly OriginalGameplayCommandGridRect[];
}

const COMMAND_GRID_COLUMNS = 3;
const COMMAND_GRID_ORIGIN_X = 525;
const COMMAND_GRID_ORIGIN_Y = 363;
const COMMAND_GRID_CELL_WIDTH = 34;
const COMMAND_GRID_CELL_HEIGHT = 34;
const COMMAND_GRID_GAP = 2;

export function resolveOriginalGameplayCommandGridLayout(
  viewportWidth: number,
  viewportHeight: number,
): ResolvedOriginalGameplayCommandGridLayout {
  assertPositiveFinite(viewportWidth, "viewportWidth");
  assertPositiveFinite(viewportHeight, "viewportHeight");

  const scale = Math.min(
    viewportWidth / ORIGINAL_GAMEPLAY_COMMAND_GRID_BASE_WIDTH,
    viewportHeight / ORIGINAL_GAMEPLAY_COMMAND_GRID_BASE_HEIGHT,
  );
  const offsetX = (viewportWidth - ORIGINAL_GAMEPLAY_COMMAND_GRID_BASE_WIDTH * scale) / 2;
  const offsetY = (viewportHeight - ORIGINAL_GAMEPLAY_COMMAND_GRID_BASE_HEIGHT * scale) / 2;

  return {
    scale,
    offsetX,
    offsetY,
    slots: Array.from({ length: ORIGINAL_GAMEPLAY_COMMAND_GRID_SLOT_COUNT }, (_, index) => {
      const column = index % COMMAND_GRID_COLUMNS;
      const row = Math.floor(index / COMMAND_GRID_COLUMNS);
      return {
        x: offsetX + (COMMAND_GRID_ORIGIN_X + column * (COMMAND_GRID_CELL_WIDTH + COMMAND_GRID_GAP)) * scale,
        y: offsetY + (COMMAND_GRID_ORIGIN_Y + row * (COMMAND_GRID_CELL_HEIGHT + COMMAND_GRID_GAP)) * scale,
        width: COMMAND_GRID_CELL_WIDTH * scale,
        height: COMMAND_GRID_CELL_HEIGHT * scale,
      };
    }),
  };
}

/** Product-only scenario gate; action labels and commands remain project adaptations. */
export function resolveOriginalGameplayCommandGridLayoutForScenario(
  scenarioId: string | undefined,
  viewportWidth: number,
  viewportHeight: number,
): ResolvedOriginalGameplayCommandGridLayout | undefined {
  return scenarioId === ORIGINAL_GAMEPLAY_COMMAND_GRID_SCENARIO_ID
    ? resolveOriginalGameplayCommandGridLayout(viewportWidth, viewportHeight)
    : undefined;
}

export function findResolvedOriginalGameplayCommandGridSlot(
  layout: ResolvedOriginalGameplayCommandGridLayout,
  pointerX: number,
  pointerY: number,
): number | null {
  assertFiniteCoordinate(pointerX, "pointerX");
  assertFiniteCoordinate(pointerY, "pointerY");

  const index = layout.slots.findIndex((slot) => (
    pointerX > slot.x &&
    pointerX < slot.x + slot.width &&
    pointerY > slot.y &&
    pointerY < slot.y + slot.height
  ));
  return index >= 0 ? index : null;
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be positive and finite; got ${String(value)}`);
  }
}

function assertFiniteCoordinate(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite; got ${String(value)}`);
  }
}
