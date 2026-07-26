import type { OriginalSpeechSlot, ScenarioBriefingLineDefinition } from "@shared";

export const ORIGINAL_SPEECH_BASE_WIDTH = 640;
export const ORIGINAL_SPEECH_BASE_HEIGHT = 480;

export interface OriginalSpeechRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ResolvedOriginalSpeechLayout {
  scale: number;
  offsetX: number;
  offsetY: number;
  portrait: OriginalSpeechRect;
  text: {
    x: number;
    centerY: number;
    maxWidth: number;
  };
}

const PORTRAIT_RECTS: Readonly<Record<OriginalSpeechSlot, Readonly<OriginalSpeechRect>>> = {
  0: { x: 26, y: 49, width: 130, height: 120 },
  1: { x: 490, y: 49, width: 130, height: 120 },
  2: { x: 26, y: 210, width: 130, height: 120 },
  3: { x: 490, y: 210, width: 130, height: 120 },
};

export function resolveOriginalSpeechLayout(
  viewportWidth: number,
  viewportHeight: number,
  slot: OriginalSpeechSlot,
): ResolvedOriginalSpeechLayout {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    throw new RangeError(`viewportWidth must be positive and finite; got ${viewportWidth}`);
  }
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    throw new RangeError(`viewportHeight must be positive and finite; got ${viewportHeight}`);
  }

  const sourcePortrait = PORTRAIT_RECTS[slot];
  if (!sourcePortrait) {
    throw new RangeError(`Unsupported original SPEECH slot ${slot}; expected 0, 1, 2, or 3`);
  }

  const scale = Math.min(
    viewportWidth / ORIGINAL_SPEECH_BASE_WIDTH,
    viewportHeight / ORIGINAL_SPEECH_BASE_HEIGHT,
  );
  const offsetX = (viewportWidth - ORIGINAL_SPEECH_BASE_WIDTH * scale) / 2;
  const offsetY = (viewportHeight - ORIGINAL_SPEECH_BASE_HEIGHT * scale) / 2;

  return {
    scale,
    offsetX,
    offsetY,
    portrait: {
      x: offsetX + sourcePortrait.x * scale,
      y: offsetY + sourcePortrait.y * scale,
      width: sourcePortrait.width * scale,
      height: sourcePortrait.height * scale,
    },
    text: {
      x: offsetX + 188 * scale,
      centerY: offsetY + 190 * scale,
      maxWidth: 278 * scale,
    },
  };
}

export function getOriginalSpeechSlot(
  line: Pick<ScenarioBriefingLineDefinition, "speechSlot">,
): OriginalSpeechSlot {
  return line.speechSlot;
}
