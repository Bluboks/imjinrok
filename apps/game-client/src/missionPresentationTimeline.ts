import type {
  ScenarioBriefingDefinition,
  ScenarioBriefingPresentationTimingPolicy,
} from "@shared";

export const MISSION_BRIEFING_PORTRAIT_PROGRESS_STEP_PERCENT = 5;
export const MISSION_BRIEFING_PORTRAIT_STEP_COUNT = 100 / MISSION_BRIEFING_PORTRAIT_PROGRESS_STEP_PERCENT;
// The source dispatcher advances portrait progress by five percentage points
// on each visit. Its wall-clock scheduler is not statically recovered; this
// is the project's fixed 24 Hz presentation calibration, not a parity claim.
export const MISSION_BRIEFING_PORTRAIT_STEP_MS = 1_000 / 24;

export type MissionBriefingIntroStage = "playing" | "ready";
export type MissionBriefingClickAction = "complete-intro" | "reveal-line" | "advance-line" | "dismiss-line" | "no-op";
export type MissionDialogueClickAction = "advance-line" | "finish-dialogue";

export interface MissionDialoguePointerAdvance {
  action: MissionDialogueClickAction;
  consumesWorldInput: true;
}

export type MissionBriefingRedrawCause = "resize" | "font-ready" | "replay" | "line-advance";
export type MissionBriefingRenderLayer = "speech" | "metadata";

/** Resize/font readiness rebuilds preserve the currently playing voice. */
export function shouldReplayMissionBriefingVoice(cause: MissionBriefingRedrawCause): boolean {
  return cause === "replay" || cause === "line-advance";
}

export function getMissionBriefingRenderLayers(
  hasSpeechContent: boolean,
  introReady: boolean,
): readonly MissionBriefingRenderLayer[] {
  const layers: MissionBriefingRenderLayer[] = [];
  if (hasSpeechContent) {
    layers.push("speech");
  }
  if (introReady) {
    layers.push("metadata");
  }
  return layers;
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

export interface MissionBriefingLineTransitionState {
  lineIndex: number;
  lineVisible: boolean;
  pendingLineIndex: number | null;
  lineRevealAt: number | null;
}

export function createMissionBriefingLineTransitionState(
  lineIndex = 0,
): MissionBriefingLineTransitionState {
  return {
    lineIndex,
    lineVisible: false,
    pendingLineIndex: null,
    lineRevealAt: null,
  };
}

/**
 * Queues a line without replacing the currently visible line while a delay
 * is pending. A zero delay commits the target line immediately.
 */
export function queueMissionBriefingLineTransition(
  state: MissionBriefingLineTransitionState,
  targetLineIndex: number,
  time: number,
  delayMs: number,
): MissionBriefingLineTransitionState {
  const normalizedDelayMs = Number.isFinite(delayMs) && delayMs > 0 ? Math.floor(delayMs) : 0;
  if (normalizedDelayMs > 0) {
    return {
      ...state,
      pendingLineIndex: targetLineIndex,
      lineRevealAt: time + normalizedDelayMs,
    };
  }

  return {
    lineIndex: targetLineIndex,
    lineVisible: true,
    pendingLineIndex: null,
    lineRevealAt: null,
  };
}

export function revealMissionBriefingLineTransition(
  state: MissionBriefingLineTransitionState,
): MissionBriefingLineTransitionState {
  if (state.pendingLineIndex === null) {
    return state;
  }

  return {
    lineIndex: state.pendingLineIndex,
    lineVisible: true,
    pendingLineIndex: null,
    lineRevealAt: null,
  };
}

export function isMissionBriefingLineRevealPending(
  state: MissionBriefingLineTransitionState,
  time: number,
): boolean {
  return state.pendingLineIndex !== null
    && state.lineRevealAt !== null
    && time < state.lineRevealAt;
}

/** A queued line remains click-revealable until the transition is committed. */
export function hasMissionBriefingLineRevealPending(
  state: MissionBriefingLineTransitionState,
): boolean {
  return state.pendingLineIndex !== null && state.lineRevealAt !== null;
}

/** Returns the line whose participants should remain rendered during a delay. */
export function getMissionBriefingParticipantLineIndex(
  state: MissionBriefingLineTransitionState,
  dismissed: boolean,
): number | null {
  return dismissed || state.lineVisible ? state.lineIndex : null;
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
  policy: ScenarioBriefingPresentationTimingPolicy,
): number {
  assertPresentationTimingPolicy(policy);
  return policy.titleFrames.reduce((durationMs, frame) => durationMs + normalizeFrameDuration(frame.durationMs), 0);
}

export function getMissionBriefingIntroStage(
  policy: ScenarioBriefingPresentationTimingPolicy,
  startedAt: number,
  time: number,
  completed: boolean,
): MissionBriefingIntroStage {
  if (completed || getMissionBriefingTitleSequenceDurationMs(policy) === 0) {
    return "ready";
  }

  return Math.max(0, time - startedAt) >= getMissionBriefingTitleSequenceDurationMs(policy) ? "ready" : "playing";
}

/** Returns the calibrated presentation frame visible at `time`, or -1 when no sequence exists. */
export function getMissionBriefingTitleFrameIndex(
  policy: ScenarioBriefingPresentationTimingPolicy,
  startedAt: number,
  time: number,
  completed: boolean,
): number {
  assertPresentationTimingPolicy(policy);
  const sequence = policy.titleFrames;
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
  policy: ScenarioBriefingPresentationTimingPolicy,
  startedAt: number,
  time: number,
): number {
  assertPresentationTimingPolicy(policy);
  const elapsedMs = Math.max(0, time - startedAt);
  const stepDurationMs = policy.portraitIntroductionDurationMs / MISSION_BRIEFING_PORTRAIT_STEP_COUNT;
  const progressSteps = Math.min(MISSION_BRIEFING_PORTRAIT_STEP_COUNT, Math.floor(elapsedMs / stepDurationMs));

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

export function assertPresentationTimingPolicy(
  policy: ScenarioBriefingPresentationTimingPolicy,
): void {
  if (!policy || typeof policy !== "object") {
    throw new TypeError("Mission briefing presentation timing policy is required.");
  }
  if (typeof policy.policyId !== "string" || !policy.policyId.trim()) {
    throw new TypeError("Mission briefing presentation timing policy id must not be empty.");
  }
  if (!policy.policyId.startsWith("web:")) {
    throw new Error(`Mission briefing timing policy '${policy.policyId}' is not a web-calibrated policy.`);
  }
  if (policy.classification !== "intentional-adaptation" || policy.sourceParity !== "not-established") {
    throw new Error(`Mission briefing timing policy '${policy.policyId}' must be an explicit intentional web adaptation.`);
  }
  if (!Array.isArray(policy.titleFrames)) {
    throw new TypeError(`Mission briefing timing policy '${policy.policyId}' title frames are missing.`);
  }
  for (const frame of policy.titleFrames) {
    if (!frame || typeof frame !== "object" || !Number.isFinite(frame.durationMs) || frame.durationMs < 0) {
      throw new TypeError(`Mission briefing timing policy '${policy.policyId}' contains an invalid calibrated frame duration.`);
    }
  }
  if (!Number.isFinite(policy.defaultLineDurationMs) || policy.defaultLineDurationMs <= 0) {
    throw new TypeError(`Mission briefing timing policy '${policy.policyId}' default line duration must be positive.`);
  }
  if (!Number.isFinite(policy.portraitIntroductionDurationMs) || policy.portraitIntroductionDurationMs <= 0) {
    throw new TypeError(`Mission briefing timing policy '${policy.policyId}' portrait duration must be positive.`);
  }
  if (!policy.lineDelayBeforeMsByVoiceId || typeof policy.lineDelayBeforeMsByVoiceId !== "object") {
    throw new TypeError(`Mission briefing timing policy '${policy.policyId}' line delay calibration is missing.`);
  }
  for (const delayMs of Object.values(policy.lineDelayBeforeMsByVoiceId)) {
    if (!Number.isFinite(delayMs) || delayMs < 0) {
      throw new TypeError(`Mission briefing timing policy '${policy.policyId}' contains an invalid calibrated line delay.`);
    }
  }
}

export function requireMissionBriefingPresentationTimingPolicy(
  briefing: ScenarioBriefingDefinition,
): ScenarioBriefingPresentationTimingPolicy {
  const policy = briefing.timing?.presentationPolicy;
  if (!policy) {
    throw new Error(
      `Mission briefing '${briefing.sourceScript}' requires an explicit web-calibrated presentation timing policy; source timing is metadata-only.`,
    );
  }
  assertPresentationTimingPolicy(policy);
  return policy;
}

function normalizeFrameDuration(durationMs: number): number {
  return Number.isFinite(durationMs) && durationMs > 0 ? Math.floor(durationMs) : 0;
}
