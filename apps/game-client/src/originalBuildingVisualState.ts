import type { AnimationClip } from "@shared";

interface HealthValue {
  current: number;
  max: number;
}

export function selectConstructionFrameIndex(progress: number, clip: AnimationClip): number {
  const frameCount = clip.frames.length;
  const thresholds = clip.progressFrameThresholds;
  if (thresholds) {
    validateProgressFrameThresholds(thresholds, frameCount);
  }
  if (frameCount <= 1) {
    return 0;
  }

  const clampedProgress = Math.max(0, Math.min(1, progress));
  if (!thresholds) {
    return Math.min(frameCount - 1, Math.floor(clampedProgress * frameCount));
  }
  const integerPercent = Math.floor(clampedProgress * 100);
  let frameIndex = 0;
  for (let index = 1; index < thresholds.length; index += 1) {
    const threshold = thresholds[index];
    if (threshold === undefined) {
      break;
    }
    if (integerPercent < threshold) {
      break;
    }
    frameIndex = index;
  }

  return frameIndex;
}

export function isBelowOriginalBuildingDamageThreshold(health: HealthValue): boolean {
  if (health.max <= 0) return false;
  const threshold = Math.trunc(health.max * 50 / 100);
  return health.current < threshold;
}

function validateProgressFrameThresholds(thresholds: readonly number[], frameCount: number): void {
  if (thresholds.length !== frameCount) {
    throw new RangeError(
      `Construction clip has ${frameCount} frames but ${thresholds.length} progress thresholds`,
    );
  }
  if (thresholds[0] !== 0) {
    throw new RangeError(`Construction progress threshold at index 0 must be 0, got ${String(thresholds[0])}`);
  }

  let previousThreshold = -1;
  for (let index = 0; index < thresholds.length; index += 1) {
    const threshold = thresholds[index];
    if (
      threshold === undefined ||
      !Number.isInteger(threshold) ||
      threshold < 0 ||
      threshold > 100 ||
      threshold <= previousThreshold
    ) {
      throw new RangeError(
        `Construction progress threshold ${String(threshold)} at index ${index} is not a strictly increasing integer percentage`,
      );
    }
    previousThreshold = threshold;
  }
}
