import test from "node:test";
import assert from "node:assert/strict";
import { imjinrokK01Scenario } from "@shared";
import {
  MISSION_BRIEFING_PORTRAIT_STEP_MS,
  beginPresentationPause,
  createMissionBriefingReplayState,
  getMissionBriefingClickAction,
  getMissionBriefingIntroStage,
  getMissionBriefingPortraitScale,
  getMissionBriefingTitleFrameIndex,
  getMissionBriefingTitleSequenceDurationMs,
  getMissionDialogueClickAction,
  getMissionDialoguePointerAdvance,
  isPresentationExternallyPaused,
  shouldResumePresentationPlayback,
} from "./missionPresentationTimeline.js";

const k01TitleSequence = imjinrokK01Scenario.briefing?.titleSequence;

test("K01 briefing title sequence preserves every source frame boundary", () => {
  assert.equal(getMissionBriefingTitleSequenceDurationMs(k01TitleSequence), 665);
  assert.equal(getMissionBriefingTitleFrameIndex(k01TitleSequence, 1_000, 1_000, false), 0);
  assert.equal(getMissionBriefingTitleFrameIndex(k01TitleSequence, 1_000, 1_499, false), 0);
  assert.equal(getMissionBriefingTitleFrameIndex(k01TitleSequence, 1_000, 1_500, false), 1);

  for (let index = 1; index < 12; index += 1) {
    assert.equal(getMissionBriefingTitleFrameIndex(k01TitleSequence, 1_000, 1_500 + (index - 1) * 15, false), index);
  }

  assert.equal(getMissionBriefingIntroStage(k01TitleSequence, 1_000, 1_664, false), "playing");
  assert.equal(getMissionBriefingIntroStage(k01TitleSequence, 1_000, 1_665, false), "ready");
  assert.equal(getMissionBriefingTitleFrameIndex(k01TitleSequence, 1_000, 1_000, true), 11);
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
  assert.equal(getMissionBriefingTitleFrameIndex(k01TitleSequence, replay.introStartedAt, replay.introStartedAt, replay.introCompleted), 0);
});

test("portrait introduction uses the source five-percent step rule with project fixed-cadence calibration", () => {
  assert.equal(getMissionBriefingPortraitScale(1_000, 1_000), 0);
  assert.equal(getMissionBriefingPortraitScale(1_000, 1_000 + MISSION_BRIEFING_PORTRAIT_STEP_MS - 0.01), 0);
  assert.equal(getMissionBriefingPortraitScale(1_000, 1_000 + MISSION_BRIEFING_PORTRAIT_STEP_MS), 0.05);
  assert.equal(getMissionBriefingPortraitScale(1_000, 2_000), 1);
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
  assert.equal(k1Line?.delayBeforeMs, 100);
  assert.equal(getMissionBriefingClickAction(false, true, false), "complete-intro");
  assert.equal(getMissionBriefingClickAction(true, true, false), "reveal-line");
  assert.equal(getMissionBriefingClickAction(true, false, false), "advance-line");
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
