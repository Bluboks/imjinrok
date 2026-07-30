import assert from "node:assert/strict";
import test from "node:test";
import { imjinrokK01Scenario } from "@shared";
import {
  MISSION_BRIEFING_SCENE_KEY,
  PreGameBriefingLaunchController,
  launchGameWithPreGameBriefing,
} from "./preGameBriefingLaunch.js";
import type { GameLaunchContext } from "./session.js";

class RecordingSceneLaunchPort {
  readonly calls: Array<{ type: "launch" | "start" | "stop"; key: string; data?: GameLaunchContext }> = [];
  uiActive = false;

  isActive(key: string): boolean {
    return key === "ui" && this.uiActive;
  }

  launch(key: string, data: GameLaunchContext): void {
    this.calls.push({ type: "launch", key, data });
  }

  start(key: string, data: GameLaunchContext): void {
    this.calls.push({ type: "start", key, data });
  }

  stop(key: string): void {
    this.calls.push({ type: "stop", key });
  }
}

const campaignContext: GameLaunchContext = {
  entryMode: "singleplayer",
  connectionMode: "local",
  scenarioType: "campaign",
  session: null,
  serverOnline: false,
  scenario: imjinrokK01Scenario,
};

test("a fresh campaign enters only the pre-game briefing before gameplay is confirmed", () => {
  const scene = new RecordingSceneLaunchPort();

  launchGameWithPreGameBriefing(scene, campaignContext);

  assert.deepEqual(scene.calls, [{ type: "start", key: MISSION_BRIEFING_SCENE_KEY, data: campaignContext }]);
});

test("the pre-game start action enters the lazy gameplay boundary once with a duplicate no-op boundary", () => {
  const scene = new RecordingSceneLaunchPort();
  const controller = new PreGameBriefingLaunchController();

  assert.equal(controller.startGameplay(scene, campaignContext), true);
  assert.equal(controller.startGameplay(scene, campaignContext), false);
  assert.deepEqual(scene.calls, [
    { type: "start", key: "gameplay-launch", data: campaignContext },
  ]);
});

test("each new briefing lifecycle gets one independent lazy gameplay activation", () => {
  const firstScene = new RecordingSceneLaunchPort();
  const firstLifecycle = new PreGameBriefingLaunchController();
  const secondScene = new RecordingSceneLaunchPort();
  const secondLifecycle = new PreGameBriefingLaunchController();

  assert.equal(firstLifecycle.startGameplay(firstScene, campaignContext), true);
  assert.equal(firstLifecycle.startGameplay(firstScene, campaignContext), false);
  assert.equal(secondLifecycle.startGameplay(secondScene, campaignContext), true);
  assert.equal(secondLifecycle.startGameplay(secondScene, campaignContext), false);
  assert.deepEqual(firstScene.calls, [
    { type: "start", key: "gameplay-launch", data: campaignContext },
  ]);
  assert.deepEqual(secondScene.calls, [
    { type: "start", key: "gameplay-launch", data: campaignContext },
  ]);
});

test("a resumed snapshot bypasses the briefing and enters the lazy gameplay boundary", () => {
  const scene = new RecordingSceneLaunchPort();

  launchGameWithPreGameBriefing(scene, {
    ...campaignContext,
    resumeSnapshot: {
      tick: 0,
    } as never,
  });

  assert.equal(scene.calls[0]?.type, "start");
  assert.equal(scene.calls[0]?.key, "gameplay-launch");
  assert.equal(scene.calls[1], undefined);
});
