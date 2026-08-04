import type { AnimationClip } from "@shared";

/**
 * World-tick adapter for source-global clips.  `worldTick` is the simulation's
 * authoritative clock; no real-time/FPS equivalence is implied here.
 */
export function selectSourceGlobalFrameIndex(clip: AnimationClip, worldTick: number): number | null {
  const divisor = clip.sourceGlobalTickDivisor;
  if (divisor === undefined) return null;
  if (!Number.isInteger(divisor) || divisor <= 0) {
    throw new RangeError(`Source-global tick divisor must be a positive integer; received ${String(divisor)}`);
  }
  if (!Number.isInteger(worldTick) || worldTick < 0) {
    throw new RangeError(`World tick must be a non-negative integer; received ${String(worldTick)}`);
  }
  if (clip.frames.length === 0) return null;
  return Math.floor(worldTick / divisor) % clip.frames.length;
}
