import assert from "node:assert/strict";
import test from "node:test";
import { imjinrokK01Scenario } from "@shared";
import { collectMissionBriefingBackdropFrames } from "../missionBriefingBackdrop.js";
import {
  createMissionBriefingReplayState,
  getMissionBriefingClickAction,
  getMissionBriefingRenderLayers,
  requireMissionBriefingPresentationTimingPolicy,
  shouldReplayMissionBriefingVoice,
} from "../missionPresentationTimeline.js";
import { resolveOriginalBriefingMetadataLayout } from "../originalBriefingMetadataLayout.js";
import { resolveOriginalSpeechLayout } from "../originalSpeechLayout.js";
import { PRE_GAME_KOREAN_FONT_FAMILY, resolvePreGameTextResolution } from "../ui/preGameTypography.js";

test("resize and font readiness redraws preserve voice playback while replay explicitly restarts it", () => {
  assert.equal(shouldReplayMissionBriefingVoice("resize"), false);
  assert.equal(shouldReplayMissionBriefingVoice("font-ready"), false);
  assert.equal(shouldReplayMissionBriefingVoice("replay"), true);
  assert.equal(shouldReplayMissionBriefingVoice("line-advance"), true);
});

test("presentation policy supplies calibrated backdrop frames without reading raw source durations", () => {
  const briefing = imjinrokK01Scenario.briefing;
  const policy = requireMissionBriefingPresentationTimingPolicy(briefing);
  const frames = collectMissionBriefingBackdropFrames(briefing, policy);

  assert.equal(frames.length, 12);
  assert.equal(frames[0]?.durationMs, 420);
  assert.equal(frames[1]?.durationMs, 80);
  assert.equal(briefing.titleSequence?.[0]?.sourceDuration, 500);
});

test("skip/replay state transitions keep simulation input ordering independent of presentation timing", () => {
  const replay = createMissionBriefingReplayState(1_000);

  assert.equal(getMissionBriefingClickAction(false, false, false), "complete-intro");
  assert.equal(getMissionBriefingClickAction(true, true, false), "reveal-line");
  assert.equal(getMissionBriefingClickAction(true, false, false), "advance-line");
  assert.equal(getMissionBriefingClickAction(true, false, true), "dismiss-line");
  assert.equal(replay.lineIndex, 0);
  assert.equal(replay.dismissed, false);
});

test("speech and metadata render in stable layer order at the intro boundary", () => {
  assert.deepEqual(getMissionBriefingRenderLayers(false, false), []);
  assert.deepEqual(getMissionBriefingRenderLayers(true, false), ["speech"]);
  assert.deepEqual(getMissionBriefingRenderLayers(false, true), ["metadata"]);
  assert.deepEqual(getMissionBriefingRenderLayers(true, true), ["speech", "metadata"]);

  const speechLayout = resolveOriginalSpeechLayout(1_280, 720, 0);
  const metadataLayout = resolveOriginalBriefingMetadataLayout(1_280, 720);
  assert.ok(speechLayout.text.maxWidth > 0);
  assert.ok(metadataLayout.objective.maxWidth > 0);
});

test("briefing text rendering keeps the shared pre-game font and finite scaled resolution contract", () => {
  assert.match(PRE_GAME_KOREAN_FONT_FAMILY, /sans-serif/u);
  assert.ok(Number.isFinite(resolvePreGameTextResolution()));
  assert.ok(Number.isFinite(resolvePreGameTextResolution(undefined, 0.5)));
});

test("missing presentation calibration fails at the timing boundary instead of falling back to source metadata", () => {
  assert.throws(
    () => requireMissionBriefingPresentationTimingPolicy({
      sourceScript: "script/generic",
      title: "generic",
      objective: "generic",
      lines: [],
    }),
    /explicit web-calibrated presentation timing policy/u,
  );
});
