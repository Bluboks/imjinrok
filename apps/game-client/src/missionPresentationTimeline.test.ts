import test from "node:test";
import assert from "node:assert/strict";
import { imjinrokK01Scenario } from "@shared";
import {
  MISSION_BRIEFING_INTRO_FADE_MS,
  MISSION_BRIEFING_INTRO_HOLD_MS,
  beginPresentationPause,
  createMissionBriefingReplayState,
  getMissionBriefingClickAction,
  getMissionBriefingIntroFadeAlpha,
  getMissionBriefingIntroFrameAlphas,
  getMissionBriefingIntroStage,
  getMissionDialogueClickAction,
  getMissionDialoguePointerAdvance,
  isPresentationExternallyPaused,
  shouldResumePresentationPlayback,
} from "./missionPresentationTimeline.js";

test("briefing intro holds the blank frame, then fades the completed frame", () => {
  assert.equal(getMissionBriefingIntroStage(1_000, 1_000, false), "holding");
  assert.equal(getMissionBriefingIntroFadeAlpha(1_000, 1_000, false), 0);
  assert.deepEqual(getMissionBriefingIntroFrameAlphas(1_000, 1_000, false), { base: 1, completed: 0 });
  assert.equal(getMissionBriefingIntroStage(1_000, 1_000 + MISSION_BRIEFING_INTRO_HOLD_MS, false), "fading");
  assert.ok(getMissionBriefingIntroFadeAlpha(1_000, 1_000 + MISSION_BRIEFING_INTRO_HOLD_MS + 100, false) > 0);
  assert.equal(
    getMissionBriefingIntroStage(1_000, 1_000 + MISSION_BRIEFING_INTRO_HOLD_MS + MISSION_BRIEFING_INTRO_FADE_MS, false),
    "ready",
  );
  assert.equal(getMissionBriefingIntroFadeAlpha(1_000, 1_000, true), 1);
  assert.deepEqual(
    getMissionBriefingIntroFrameAlphas(1_000, 1_000 + MISSION_BRIEFING_INTRO_HOLD_MS + 100, false),
    {
      base: 1,
      completed: getMissionBriefingIntroFadeAlpha(1_000, 1_000 + MISSION_BRIEFING_INTRO_HOLD_MS + 100, false),
    },
  );
});

test("briefing replay restarts as a base-only intro with no scheduled line", () => {
  const replay = createMissionBriefingReplayState(4_000);

  assert.deepEqual(replay, {
    introStartedAt: 4_000,
    introCompleted: false,
    lineIndex: 0,
    lineRevealAt: null,
    nextLineAt: null,
    lineScheduled: false,
  });
  assert.deepEqual(getMissionBriefingIntroFrameAlphas(replay.introStartedAt, replay.introStartedAt, replay.introCompleted), {
    base: 1,
    completed: 0,
  });
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
  assert.equal(getMissionBriefingClickAction(true, false, true), "hold-line");
});

test("the final briefing line is held for the explicit game-start button", () => {
  assert.equal(getMissionBriefingClickAction(true, false, true), "hold-line");
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
