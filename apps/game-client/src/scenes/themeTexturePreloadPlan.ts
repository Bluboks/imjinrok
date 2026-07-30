import { getThemeAssetUrl, getThemeFrameRefs, type EntityVisual, type ThemeDefinition, type ThemeFrameRef } from "@shared";

export interface ThemeTextureLoadRequest extends ThemeFrameRef {
  readonly url: string;
}

export interface GameplayThemeTextureLoadPlan {
  readonly critical: readonly ThemeTextureLoadRequest[];
  readonly deferred: readonly ThemeTextureLoadRequest[];
}

export const GAMEPLAY_THEME_DEFERRED_BATCH_SIZE = 32;

/**
 * Stateful scheduling is intentionally separated from Phaser so failures and
 * scene shutdown can be tested without a running renderer.
 */
export class ThemeTextureDeferredBatchQueue {
  private readonly attemptedTextureKeys = new Set<string>();
  private activeBatch: readonly ThemeTextureLoadRequest[] = [];
  private cancelled = false;

  constructor(
    private readonly requests: readonly ThemeTextureLoadRequest[],
    private readonly batchSize = GAMEPLAY_THEME_DEFERRED_BATCH_SIZE,
  ) {
    if (!Number.isInteger(batchSize) || batchSize < 1) {
      throw new Error("Theme texture deferred batch size must be a positive integer.");
    }
  }

  takeNextBatch(textureExists: (textureKey: string) => boolean): readonly ThemeTextureLoadRequest[] {
    if (this.cancelled || this.activeBatch.length > 0) {
      return [];
    }

    const batch: ThemeTextureLoadRequest[] = [];
    for (const request of this.requests) {
      if (this.attemptedTextureKeys.has(request.frame.textureKey) || textureExists(request.frame.textureKey)) {
        continue;
      }

      this.attemptedTextureKeys.add(request.frame.textureKey);
      batch.push(request);
      if (batch.length === this.batchSize) {
        break;
      }
    }
    this.activeBatch = batch;

    return batch;
  }

  completeActiveBatch(textureExists: (textureKey: string) => boolean): readonly ThemeTextureLoadRequest[] {
    const loaded = this.activeBatch.filter((request) => textureExists(request.frame.textureKey));
    this.activeBatch = [];

    return this.cancelled ? [] : loaded;
  }

  /** Allows a later scene lifetime or explicit caller action to retry failures. */
  retryMissing(textureExists: (textureKey: string) => boolean): void {
    if (this.cancelled || this.activeBatch.length > 0) {
      return;
    }

    for (const request of this.requests) {
      if (!textureExists(request.frame.textureKey)) {
        this.attemptedTextureKeys.delete(request.frame.textureKey);
      }
    }
  }

  cancel(): void {
    this.cancelled = true;
    this.activeBatch = [];
  }
}

/**
 * Produces the texture requests that must complete before gameplay renders.
 * Re-evaluating the plan after a load failure deliberately retains failed keys
 * so the create-time fallback can retry them.
 */
export function getMissingThemeTextureLoadRequests(
  theme: ThemeDefinition,
  frameRefs: readonly ThemeFrameRef[],
  textureExists: (textureKey: string) => boolean,
): ThemeTextureLoadRequest[] {
  const requests: ThemeTextureLoadRequest[] = [];
  const queuedTextureKeys = new Set<string>();

  for (const { visual, frame } of frameRefs) {
    if (queuedTextureKeys.has(frame.textureKey) || textureExists(frame.textureKey)) {
      continue;
    }

    queuedTextureKeys.add(frame.textureKey);
    requests.push({
      visual,
      frame,
      url: getThemeAssetUrl(theme, visual, frame),
    });
  }

  return requests;
}

/**
 * The critical tier is a product loading policy, not an original-game claim.
 * Terrain receives one representative from every declared slot so a theme can
 * draw the battlefield immediately; entity bindings receive one initial state
 * frame each. All remaining frames are loaded after scene creation.
 */
export function getGameplayThemeTextureLoadPlan(
  theme: ThemeDefinition,
  textureExists: (textureKey: string) => boolean,
): GameplayThemeTextureLoadPlan {
  const criticalTextureKeys = getGameplayCriticalThemeTextureKeys(theme);
  const missing = getMissingThemeTextureLoadRequests(theme, getThemeFrameRefs(theme), textureExists);

  return {
    critical: missing.filter((request) => criticalTextureKeys.has(request.frame.textureKey)),
    deferred: missing.filter((request) => !criticalTextureKeys.has(request.frame.textureKey)),
  };
}

export function getGameplayEntityRepresentativeFrame(visual: EntityVisual): ThemeFrameRef["frame"] | null {
  for (const state of Object.values(visual.states)) {
    for (const clip of Object.values(state.clips)) {
      const frame = clip?.frames[0];
      if (frame) {
        return frame;
      }
    }
  }

  return null;
}

function getGameplayCriticalThemeTextureKeys(theme: ThemeDefinition): ReadonlySet<string> {
  const textureKeys = new Set<string>();
  const terrainVisualIds = new Set<string>();
  for (const binding of Object.values(theme.terrainBindings)) {
    if (!binding) {
      continue;
    }
    terrainVisualIds.add(binding.flat);
    if (binding.elevated) {
      terrainVisualIds.add(binding.elevated);
    }
  }
  const entityVisualIds = new Set(Object.values(theme.entityBindings));

  for (const visualId of terrainVisualIds) {
    const visual = theme.visuals[visualId];

    if (visual?.kind !== "terrain") {
      continue;
    }

    for (const frames of Object.values(visual.slots) as Array<readonly ThemeFrameRef["frame"][] | undefined>) {
      const frame = frames?.[0];
      if (frame) {
        textureKeys.add(frame.textureKey);
      }
    }
  }

  for (const visualId of entityVisualIds) {
    const visual = theme.visuals[visualId];
    if (visual?.kind !== "entity") {
      continue;
    }

    const frame = getGameplayEntityRepresentativeFrame(visual);
    if (frame) {
      textureKeys.add(frame.textureKey);
    }
  }

  return textureKeys;
}
