import type { AnimationClip, EntityVisual, Facing } from "@shared";
import type { SourceOrientationState } from "@simulation";
import { resolveEntityAnimationSelection } from "./sourceOrientationAnimation.js";

export interface EntityTerminalPresentation {
  readonly clip: AnimationClip;
  readonly key: string;
  readonly lifetimeMs: number;
}

export interface EntityTerminalPlayback {
  readonly elapsedMs: number;
  readonly frameElapsedMs: number;
  readonly frameIndex: number;
}

/**
 * Classifies existing client renderables using the current authoritative unit
 * registry. This deliberately does not compare snapshot object identities:
 * local sessions mutate one world object in place. A vanished id becomes a
 * terminal candidate, while an existing-but-hidden id is destroyed normally.
 */
export function reconcileEntityRenderableIds(
  renderedIds: Iterable<string>,
  authoritativeEntityIds: ReadonlySet<string>,
  visibleEntityIds: ReadonlySet<string>,
): {
  readonly retain: readonly string[];
  readonly destroy: readonly string[];
  readonly terminal: readonly string[];
} {
  const retain: string[] = [];
  const destroy: string[] = [];
  const terminal: string[] = [];

  for (const entityId of [...renderedIds].sort()) {
    if (!authoritativeEntityIds.has(entityId)) {
      terminal.push(entityId);
    } else if (!visibleEntityIds.has(entityId)) {
      destroy.push(entityId);
    } else {
      retain.push(entityId);
    }
  }

  return { retain, destroy, terminal };
}

/**
 * Resolves explicit terminal metadata only. A visual without an opt-in, an
 * empty clip, a looping clip, or provisional metadata without a usable FPS is
 * intentionally unsupported rather than borrowing another visible frame.
 */
export function resolveEntityTerminalPresentation(
  visual: Pick<EntityVisual, "states" | "terminalPresentation" | "id">,
  facing: Facing,
  sourceOrientation?: Pick<SourceOrientationState, "profileId" | "movementRaw16" | "attackGrid8">,
): EntityTerminalPresentation | null {
  const stateKey = visual.terminalPresentation?.state;

  if (!stateKey) {
    return null;
  }

  const selection = resolveEntityAnimationSelection(visual, stateKey, facing, sourceOrientation);

  if (!selection || selection.clip.loop !== false || selection.clip.frames.length === 0 || !Number.isFinite(selection.clip.fps) || selection.clip.fps <= 0) {
    return null;
  }

  return {
    clip: selection.clip,
    key: selection.key,
    lifetimeMs: (selection.clip.frames.length * 1000) / selection.clip.fps,
  };
}

export function createEntityTerminalPlayback(): EntityTerminalPlayback {
  return { elapsedMs: 0, frameElapsedMs: 0, frameIndex: 0 };
}

/**
 * Advances a one-shot terminal clip without mutating its source snapshot. The
 * final frame is held until the clip-derived lifetime ends.
 */
export function advanceEntityTerminalPlayback(
  playback: EntityTerminalPlayback,
  presentation: EntityTerminalPresentation,
  deltaMs: number,
): EntityTerminalPlayback | null {
  if (deltaMs <= 0) {
    return playback;
  }

  const elapsedMs = playback.elapsedMs + deltaMs;
  if (elapsedMs >= presentation.lifetimeMs) {
    return null;
  }

  const frameDurationMs = 1000 / presentation.clip.fps;
  let frameElapsedMs = playback.frameElapsedMs + deltaMs;
  let frameIndex = playback.frameIndex;

  while (frameElapsedMs >= frameDurationMs && frameIndex < presentation.clip.frames.length - 1) {
    frameElapsedMs -= frameDurationMs;
    frameIndex += 1;
  }

  return { elapsedMs, frameElapsedMs, frameIndex };
}
