export const MISSION_BRIEFING_INTRO_HOLD_MS = 520;
export const MISSION_BRIEFING_INTRO_FADE_MS = 420;

export type MissionBriefingIntroStage = "holding" | "fading" | "ready";
export type MissionBriefingClickAction = "complete-intro" | "reveal-line" | "advance-line" | "hold-line";
export type MissionDialogueClickAction = "advance-line" | "finish-dialogue";

export interface PresentationPauseOwnership {
  ownsPlaybackPause: boolean;
}

export interface MissionBriefingIntroFrameAlphas {
  base: number;
  completed: number;
}

export interface MissionBriefingReplayState {
  introStartedAt: number;
  introCompleted: false;
  lineIndex: 0;
  lineRevealAt: null;
  nextLineAt: null;
  lineScheduled: false;
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

export function getMissionBriefingIntroStage(
  startedAt: number,
  time: number,
  completed: boolean,
): MissionBriefingIntroStage {
  if (completed) {
    return "ready";
  }

  const elapsedMs = Math.max(0, time - startedAt);

  if (elapsedMs < MISSION_BRIEFING_INTRO_HOLD_MS) {
    return "holding";
  }

  if (elapsedMs < MISSION_BRIEFING_INTRO_HOLD_MS + MISSION_BRIEFING_INTRO_FADE_MS) {
    return "fading";
  }

  return "ready";
}

export function getMissionBriefingIntroFadeAlpha(
  startedAt: number,
  time: number,
  completed: boolean,
): number {
  const stage = getMissionBriefingIntroStage(startedAt, time, completed);

  if (stage === "holding") {
    return 0;
  }
  if (stage === "ready") {
    return 1;
  }

  const fadeElapsedMs = Math.max(0, time - startedAt - MISSION_BRIEFING_INTRO_HOLD_MS);
  const progress = Math.min(1, fadeElapsedMs / MISSION_BRIEFING_INTRO_FADE_MS);

  return 1 - (1 - progress) * (1 - progress);
}

export function getMissionBriefingIntroFrameAlphas(
  startedAt: number,
  time: number,
  completed: boolean,
): MissionBriefingIntroFrameAlphas {
  return {
    base: 1,
    completed: getMissionBriefingIntroFadeAlpha(startedAt, time, completed),
  };
}

export function createMissionBriefingReplayState(time: number): MissionBriefingReplayState {
  return {
    introStartedAt: time,
    introCompleted: false,
    lineIndex: 0,
    lineRevealAt: null,
    nextLineAt: null,
    lineScheduled: false,
  };
}

export function getMissionBriefingClickAction(
  introReady: boolean,
  lineRevealPending: boolean,
  isLastLine: boolean,
): MissionBriefingClickAction {
  if (!introReady) {
    return "complete-intro";
  }
  if (lineRevealPending) {
    return "reveal-line";
  }

  return isLastLine ? "hold-line" : "advance-line";
}

export function getMissionDialogueClickAction(
  lineIndex: number,
  lineCount: number,
): MissionDialogueClickAction {
  return lineIndex + 1 >= lineCount ? "finish-dialogue" : "advance-line";
}
