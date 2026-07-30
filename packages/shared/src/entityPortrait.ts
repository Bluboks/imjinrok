import type { EntityVisual, EntityVisualState, FrameRef } from "./visuals.js";

/** A representative frame for product selection-panel presentation, not source portrait semantics. */
export interface ResolvedEntityPortraitFrame {
  frame: FrameRef;
  mirrorX: boolean;
}

/**
 * Resolves an entity's selection-panel image from theme metadata.
 *
 * An explicit portrait is authoritative. When a theme does not provide one, this chooses the
 * first usable idle/default frame, then a stable state/clip fallback so every visual remains
 * presentable without assigning an unverified source portrait meaning.
 */
export function resolveEntityPortraitFrame(visual: EntityVisual): ResolvedEntityPortraitFrame | null {
  if (visual.portrait) {
    return { frame: visual.portrait, mirrorX: false };
  }

  const idlePortrait = resolveStatePortrait(visual.states.idle);

  if (idlePortrait) {
    return idlePortrait;
  }

  for (const stateName of Object.keys(visual.states).filter((name) => name !== "idle").sort()) {
    const portrait = resolveStatePortrait(visual.states[stateName]);

    if (portrait) {
      return portrait;
    }
  }

  return null;
}

function resolveStatePortrait(state: EntityVisualState | undefined): ResolvedEntityPortraitFrame | null {
  if (!state) {
    return null;
  }

  const clipNames = Object.keys(state.clips).sort((left, right) => {
    if (left === "default") return -1;
    if (right === "default") return 1;
    return left < right ? -1 : left > right ? 1 : 0;
  });

  for (const clipName of clipNames) {
    const clip = state.clips[clipName as keyof typeof state.clips];
    const frame = clip?.frames[0];

    if (frame) {
      return { frame, mirrorX: clip.mirrorX ?? false };
    }
  }

  return null;
}
