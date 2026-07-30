import type { GameLaunchContext } from "./session.js";
import { GAMEPLAY_LAUNCH_SCENE_KEY } from "./gameplaySceneRegistration.js";

export const MISSION_BRIEFING_SCENE_KEY = "mission-briefing";

export interface SceneLaunchPort {
  isActive(key: string): boolean;
  launch(key: string, data: GameLaunchContext): void;
  start(key: string, data: GameLaunchContext): void;
  stop(key: string): void;
}

export function shouldShowPreGameBriefing(context: GameLaunchContext): boolean {
  return Boolean(context.scenario?.briefing && !context.resumeSnapshot);
}

export function launchGameplayScenes(scene: SceneLaunchPort, context: GameLaunchContext): void {
  if (scene.isActive("ui")) {
    scene.stop("ui");
  }

  scene.start(GAMEPLAY_LAUNCH_SCENE_KEY, context);
}

export function launchGameWithPreGameBriefing(scene: SceneLaunchPort, context: GameLaunchContext): void {
  if (!shouldShowPreGameBriefing(context)) {
    launchGameplayScenes(scene, context);
    return;
  }

  if (scene.isActive("ui")) {
    scene.stop("ui");
  }

  scene.start(MISSION_BRIEFING_SCENE_KEY, context);
}

export class PreGameBriefingLaunchController {
  private gameplayStarted = false;

  startGameplay(scene: SceneLaunchPort, context: GameLaunchContext): boolean {
    if (this.gameplayStarted) {
      return false;
    }

    this.gameplayStarted = true;
    launchGameplayScenes(scene, context);
    return true;
  }
}
