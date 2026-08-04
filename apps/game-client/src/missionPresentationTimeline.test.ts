import test from "node:test";
import assert from "node:assert/strict";
import { imjinrokK01Scenario, imjinrokK02Scenario } from "@shared";
import {
  assertPresentationTimingPolicy,
  beginPresentationPause,
  createMissionBriefingLineTransitionState,
  createMissionBriefingReplayState,
  getMissionBriefingParticipantLineIndex,
  getMissionBriefingClickAction,
  getMissionBriefingIntroStage,
  getMissionBriefingPortraitScale,
  getMissionBriefingTitleFrameIndex,
  getMissionBriefingTitleSequenceDurationMs,
  getMissionDialogueClickAction,
  getMissionDialoguePointerAdvance,
  hasMissionBriefingLineRevealPending,
  isMissionBriefingLineRevealPending,
  isPresentationExternallyPaused,
  queueMissionBriefingLineTransition,
  requireMissionBriefingPresentationTimingPolicy,
  revealMissionBriefingLineTransition,
  shouldResumePresentationPlayback,
} from "./missionPresentationTimeline.js";

const k01TitleSequence = imjinrokK01Scenario.briefing?.titleSequence;
const k01Policy = imjinrokK01Scenario.briefing?.timing?.presentationPolicy;

assert.ok(k01Policy);

test("K01 raw timing metadata remains distinct from calibrated presentation timing", () => {
  assert.deepEqual(k01TitleSequence?.map(({ sourceDuration }) => sourceDuration), [500, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15]);
  assert.deepEqual(k01Policy.titleFrames.map(({ durationMs }) => durationMs), [420, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80]);
  assert.notDeepEqual(k01TitleSequence?.map(({ sourceDuration }) => sourceDuration), k01Policy.titleFrames.map(({ durationMs }) => durationMs));
  assert.equal(getMissionBriefingTitleSequenceDurationMs(k01Policy), 1_300);
  assert.equal(getMissionBriefingTitleFrameIndex(k01Policy, 1_000, 1_000, false), 0);
  assert.equal(getMissionBriefingTitleFrameIndex(k01Policy, 1_000, 1_419, false), 0);
  assert.equal(getMissionBriefingTitleFrameIndex(k01Policy, 1_000, 1_420, false), 1);

  for (let index = 1; index < 12; index += 1) {
    assert.equal(getMissionBriefingTitleFrameIndex(k01Policy, 1_000, 1_420 + (index - 1) * 80, false), index);
  }

  assert.equal(getMissionBriefingIntroStage(k01Policy, 1_000, 2_299, false), "playing");
  assert.equal(getMissionBriefingIntroStage(k01Policy, 1_000, 2_300, false), "ready");
  assert.equal(getMissionBriefingTitleFrameIndex(k01Policy, 1_000, 1_000, true), 11);
});

test("briefing replay restarts the source timeline and its dismissed dialogue state", () => {
  const replay = createMissionBriefingReplayState(4_000);

  assert.deepEqual(replay, {
    introStartedAt: 4_000,
    introCompleted: false,
    lineIndex: 0,
    lineRevealAt: null,
    nextLineAt: null,
    lineScheduled: false,
    dismissed: false,
  });
  assert.equal(getMissionBriefingTitleFrameIndex(k01Policy, replay.introStartedAt, replay.introStartedAt, replay.introCompleted), 0);
});

test("portrait introduction uses the shared 24 Hz, twenty-step calibration", () => {
  assert.equal(getMissionBriefingPortraitScale(k01Policy, 1_000, 1_000), 0);
  assert.equal(getMissionBriefingPortraitScale(k01Policy, 1_000, 1_000 + (1_000 / 24) - 1), 0);
  assert.equal(getMissionBriefingPortraitScale(k01Policy, 1_000, 1_000 + (1_000 / 24)), 0.05);
  assert.equal(getMissionBriefingPortraitScale(k01Policy, 1_000, 1_000 + k01Policy.portraitIntroductionDurationMs + 1), 1);
  assert.equal(k01Policy.portraitIntroductionDurationMs, 20 * (1_000 / 24));
  assert.equal(imjinrokK02Scenario.briefing?.timing?.presentationPolicy?.portraitIntroductionDurationMs, k01Policy.portraitIntroductionDurationMs);
});

test("a delayed line keeps the current line and its participants visible until reveal", () => {
  const initial = createMissionBriefingLineTransitionState(0);
  const firstLine = queueMissionBriefingLineTransition(initial, 0, 1_000, 160);
  assert.equal(firstLine.lineIndex, 0);
  assert.equal(firstLine.lineVisible, false);
  assert.equal(firstLine.pendingLineIndex, 0);
  assert.equal(getMissionBriefingParticipantLineIndex(firstLine, false), null);

  const active = queueMissionBriefingLineTransition(initial, 0, 1_000, 0);
  const delayed = queueMissionBriefingLineTransition(active, 1, 2_000, 160);
  assert.equal(delayed.lineIndex, 0);
  assert.equal(delayed.lineVisible, true);
  assert.equal(delayed.pendingLineIndex, 1);
  assert.equal(delayed.lineRevealAt, 2_160);
  assert.equal(hasMissionBriefingLineRevealPending(delayed), true);
  assert.equal(isMissionBriefingLineRevealPending(delayed, 2_159), true);
  assert.equal(isMissionBriefingLineRevealPending(delayed, 2_160), false);
  assert.equal(getMissionBriefingParticipantLineIndex(delayed, false), 0);

  const revealed = revealMissionBriefingLineTransition(delayed);
  assert.equal(revealed.lineIndex, 1);
  assert.equal(revealed.lineVisible, true);
  assert.equal(revealed.pendingLineIndex, null);
  assert.equal(hasMissionBriefingLineRevealPending(revealed), false);
  assert.equal(getMissionBriefingParticipantLineIndex(revealed, false), 1);
});

test("presentation pauses distinguish self-owned playback pause from external pause", () => {
  const ownedPause = beginPresentationPause(false);
  const externalPause = beginPresentationPause(true);

  assert.equal(isPresentationExternallyPaused(true, ownedPause.ownsPlaybackPause, false), false);
  assert.equal(isPresentationExternallyPaused(true, externalPause.ownsPlaybackPause, false), true);
  assert.equal(isPresentationExternallyPaused(false, ownedPause.ownsPlaybackPause, true), true);
  assert.equal(shouldResumePresentationPlayback(ownedPause), true);
  assert.equal(shouldResumePresentationPlayback(externalPause), false);
});

test("K01 delayed K1 line is revealed before a click can advance past it", () => {
  const k1Line = imjinrokK01Scenario.briefing?.lines.find((line) => line.voiceId.toLowerCase() === "k01040");

  assert.equal(k1Line?.portraitId, "K1");
  assert.equal(k1Line?.speechSlot, 2);
  assert.equal(k1Line?.sourceDelayBefore, 100);
  assert.equal(k01Policy.lineDelayBeforeMsByVoiceId.k01040, 160);
  assert.equal(getMissionBriefingClickAction(false, true, false), "complete-intro");
  assert.equal(getMissionBriefingClickAction(true, true, false), "reveal-line");
  assert.equal(getMissionBriefingClickAction(true, false, false), "advance-line");
});

test("missing or raw-shaped timing policies fail closed", () => {
  assert.throws(() => getMissionBriefingTitleSequenceDurationMs(undefined as never), /policy is required/u);
  assert.throws(
    () => requireMissionBriefingPresentationTimingPolicy({ sourceScript: "script/generic", title: "", objective: "", lines: [] }),
    /explicit web-calibrated presentation timing policy/u,
  );
  assert.throws(() => assertPresentationTimingPolicy({
    policyId: "source:raw",
    classification: "intentional-adaptation",
    sourceParity: "not-established",
    titleFrames: [],
    lineDelayBeforeMsByVoiceId: {},
    defaultLineDurationMs: 5_500,
    portraitIntroductionDurationMs: 2_400,
  } as never), /not a web-calibrated policy/u);
  assert.throws(() => assertPresentationTimingPolicy({
    policyId: "web:raw-attempt",
    classification: "intentional-adaptation",
    sourceParity: "not-established",
    titleFrames: [{ sourceAsset: "k01.spr", sourceDuration: 500 }],
    lineDelayBeforeMsByVoiceId: {},
    defaultLineDurationMs: 5_500,
    portraitIntroductionDurationMs: 2_400,
  } as never), /calibrated frame duration/u);
});

test("the final pre-game briefing click dismisses once as a project input adaptation", () => {
  assert.equal(getMissionBriefingClickAction(true, false, true), "dismiss-line");
  assert.equal(getMissionBriefingClickAction(true, false, true, true), "no-op");
});

test("dialogue clicks advance each line and finish only after the final line", () => {
  assert.equal(getMissionDialogueClickAction(0, 3), "advance-line");
  assert.equal(getMissionDialogueClickAction(1, 3), "advance-line");
  assert.equal(getMissionDialogueClickAction(2, 3), "finish-dialogue");
});

test("dialogue pointer advances consume world input for both intermediate and final lines", () => {
  assert.deepEqual(getMissionDialoguePointerAdvance(0, 3), {
    action: "advance-line",
    consumesWorldInput: true,
  });
  assert.deepEqual(getMissionDialoguePointerAdvance(2, 3), {
    action: "finish-dialogue",
    consumesWorldInput: true,
  });
});
