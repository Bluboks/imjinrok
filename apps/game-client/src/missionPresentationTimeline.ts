export const MISSION_BRIEFING_PORTRAIT_PROGRESS_STEP_PERCENT = 5;
export const MISSION_BRIEFING_PORTRAIT_STEP_COUNT = 100 / MISSION_BRIEFING_PORTRAIT_PROGRESS_STEP_PERCENT;
// The source dispatcher advances portrait progress by five percentage points on
// each visit. Its wall-clock scheduler is not statically recovered; this is the
// project's fixed 24 Hz presentation calibration, not a parity timing claim.
export const MISSION_BRIEFING_PORTRAIT_STEP_MS = 1_000 / 24;

export type MissionBriefingIntroStage = "playing" | "ready";
export type MissionBriefingClickAction = "complete-intro" | "reveal-line" | "advance-line" | "dismiss-line" | "no-op";
export type MissionDialogueClickAction = "advance-line" | "finish-dialogue";

export interface MissionDialoguePointerAdvance {
  action: MissionDialogueClickAction;
  consumesWorldInput: true;
}

export interface PresentationPauseOwnership {
  ownsPlaybackPause: boolean;
}

export interface MissionBriefingReplayState {
  introStartedAt: number;
  introCompleted: false;
  lineIndex: 0;
  lineRevealAt: null;
  nextLineAt: null;
  lineScheduled: false;
  dismissed: false;
}

interface TimedTitleFrame {
  durationMs: number;
}

export function beginPresentationPause(playbackWasPaused: boolean): PresentationPauseOwnership {
  return { ownsPlaybackPause: !playbackWasPaused };
}

export function shouldResumePresentationPlayback(ownership: PresentationPauseOwnership | null): boolean {
  return ownership?.ownsPlaybackPause === true;
}

export function isPresentationExternallyPaused(
  playbackPaused: boolean,
  ownsPlaybackPause: boolean,
  pauseMenuOpen: boolean,
): boolean {
  return pauseMenuOpen || (playbackPaused && !ownsPlaybackPause);
}

export function getMissionBriefingTitleSequenceDurationMs(
  frames: readonly TimedTitleFrame[] | undefined,
): number {
  return (frames ?? []).reduce((durationMs, frame) => durationMs + normalizeFrameDuration(frame.durationMs), 0);
}

export function getMissionBriefingIntroStage(
  frames: readonly TimedTitleFrame[] | undefined,
  startedAt: number,
  time: number,
  completed: boolean,
): MissionBriefingIntroStage {
  if (completed || getMissionBriefingTitleSequenceDurationMs(frames) === 0) {
    return "ready";
  }

  return Math.max(0, time - startedAt) >= getMissionBriefingTitleSequenceDurationMs(frames) ? "ready" : "playing";
}

/** Returns the source title frame visible at `time`, or -1 when no sequence exists. */
export function getMissionBriefingTitleFrameIndex(
  frames: readonly TimedTitleFrame[] | undefined,
  startedAt: number,
  time: number,
  completed: boolean,
): number {
  const sequence = frames ?? [];
  if (sequence.length === 0) {
    return -1;
  }
  if (completed) {
    return sequence.length - 1;
  }

  const elapsedMs = Math.max(0, time - startedAt);
  let boundaryMs = 0;
  for (const [index, frame] of sequence.entries()) {
    boundaryMs += normalizeFrameDuration(frame.durationMs);
    if (elapsedMs < boundaryMs) {
      return index;
    }
  }
  return sequence.length - 1;
}

/** Quantized 0..1 portrait scale matching the source's 5% progress increments. */
export function getMissionBriefingPortraitScale(
  startedAt: number,
  time: number,
): number {
  const elapsedMs = Math.max(0, time - startedAt);
  const progressSteps = Math.min(MISSION_BRIEFING_PORTRAIT_STEP_COUNT, Math.floor(elapsedMs / MISSION_BRIEFING_PORTRAIT_STEP_MS));

  return progressSteps * MISSION_BRIEFING_PORTRAIT_PROGRESS_STEP_PERCENT / 100;
}

export function createMissionBriefingReplayState(time: number): MissionBriefingReplayState {
  return {
    introStartedAt: time,
    introCompleted: false,
    lineIndex: 0,
    lineRevealAt: null,
    nextLineAt: null,
    lineScheduled: false,
    dismissed: false,
  };
}

export function getMissionBriefingClickAction(
  introReady: boolean,
  lineRevealPending: boolean,
  isLastLine: boolean,
  dismissed = false,
): MissionBriefingClickAction {
  if (dismissed) {
    return "no-op";
  }
  if (!introReady) {
    return "complete-intro";
  }
  if (lineRevealPending) {
    return "reveal-line";
  }

  return isLastLine ? "dismiss-line" : "advance-line";
}

export function getMissionDialogueClickAction(
  lineIndex: number,
  lineCount: number,
): MissionDialogueClickAction {
  return lineIndex + 1 >= lineCount ? "finish-dialogue" : "advance-line";
}

export function getMissionDialoguePointerAdvance(
  lineIndex: number,
  lineCount: number,
): MissionDialoguePointerAdvance {
  return {
    action: getMissionDialogueClickAction(lineIndex, lineCount),
    consumesWorldInput: true,
  };
}

function normalizeFrameDuration(durationMs: number): number {
  return Number.isFinite(durationMs) && durationMs > 0 ? Math.floor(durationMs) : 0;
}
