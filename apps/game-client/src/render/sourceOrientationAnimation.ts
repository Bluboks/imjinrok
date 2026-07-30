import type { AnimationClip, EntityVisual, Facing } from "@shared";
import type { SourceOrientationState } from "@simulation";

export interface EntityAnimationClipResolution {
  clip: AnimationClip;
  clipKey: string;
  source: "source-orientation" | "directional";
}

/** Shape consumed by the Skirmish entity animation tracker. */
export interface EntityAnimationSelectionResolution {
  key: string;
  clip: AnimationClip;
}

export type SourceOrientationAnimationState = Pick<
  SourceOrientationState,
  "profileId" | "movementRaw16" | "attackGrid8"
>;

/**
 * Resolves an entity clip without reducing a source 16-ring movement direction
 * to a generic 8-way Facing. Themes opt in per state/profile/raw value; every
 * unsupported case uses the ordinary directional presentation.
 */
export function resolveEntityAnimationClip(
  visual: Pick<EntityVisual, "id" | "states">,
  stateKey: string,
  fallbackFacing: Facing,
  sourceOrientation?: SourceOrientationAnimationState,
): EntityAnimationClipResolution | null {
  const state = visual.states[stateKey];

  if (!state) {
    return null;
  }

  if (sourceOrientation && (stateKey === "move" || stateKey === "walk")) {
    const rawClip = state.sourceOrientationClips?.[sourceOrientation.profileId]?.[sourceOrientation.movementRaw16];

    if (rawClip) {
      return {
        clip: rawClip,
        clipKey: `${visual.id}:${stateKey}:source:${sourceOrientation.profileId}:${sourceOrientation.movementRaw16}`,
        source: "source-orientation",
      };
    }
  }

  const directionalFacing = sourceOrientation?.attackGrid8 ?? fallbackFacing;
  const directionalClip = state.clips[directionalFacing] ?? state.clips.default;

  if (directionalClip) {
    return {
      clip: directionalClip,
      clipKey: `${visual.id}:${stateKey}:${state.clips[directionalFacing] ? directionalFacing : "default"}`,
      source: "directional",
    };
  }

  for (const [clipKey, clip] of Object.entries(state.clips)) {
    if (clip) {
      return {
        clip,
        clipKey: `${visual.id}:${stateKey}:${clipKey}`,
        source: "directional",
      };
    }
  }

  return null;
}

/**
 * Presentation bridge for non-construction entity states. Keeping the scene's
 * tracker key with the resolved clip makes raw-direction changes restart the
 * animation just like ordinary facing changes.
 */
export function resolveEntityAnimationSelection(
  visual: Pick<EntityVisual, "id" | "states">,
  stateKey: string,
  fallbackFacing: Facing,
  sourceOrientation?: SourceOrientationAnimationState,
): EntityAnimationSelectionResolution | null {
  const resolved = resolveEntityAnimationClip(visual, stateKey, fallbackFacing, sourceOrientation);

  return resolved ? { key: resolved.clipKey, clip: resolved.clip } : null;
}
