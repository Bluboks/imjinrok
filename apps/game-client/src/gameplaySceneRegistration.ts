import type Phaser from "phaser";
import type { GameLaunchContext } from "./session.js";

export const GAMEPLAY_LAUNCH_SCENE_KEY = "gameplay-launch";
export const SKIRMISH_SCENE_KEY = "skirmish";
export const UI_SCENE_KEY = "ui";

export interface GameplaySceneBundle<SceneConstructor> {
  skirmish: SceneConstructor;
  ui: SceneConstructor;
}

export interface GameplaySceneRegistrationPort<SceneConstructor> {
  hasScene(key: string): boolean;
  addScene(key: string, scene: SceneConstructor): void;
}

export type GameplaySceneBundleLoader<SceneConstructor> = () => Promise<GameplaySceneBundle<SceneConstructor>>;

export function registerGameplaySceneBundle<SceneConstructor>(
  scene: GameplaySceneRegistrationPort<SceneConstructor>,
  bundle: GameplaySceneBundle<SceneConstructor>,
): void {
  if (!scene.hasScene(SKIRMISH_SCENE_KEY)) {
    scene.addScene(SKIRMISH_SCENE_KEY, bundle.skirmish);
  }

  if (!scene.hasScene(UI_SCENE_KEY)) {
    scene.addScene(UI_SCENE_KEY, bundle.ui);
  }
}

export async function loadGameplaySceneBundle(): Promise<GameplaySceneBundle<typeof Phaser.Scene>> {
  return (await import("./scenes/gameplaySceneBundle.js")).gameplaySceneBundle;
}

export type GameplaySceneLoadState = "idle" | "loading" | "ready" | "failed";
export type GameplaySceneReadinessState = "idle" | "waiting-for-skirmish" | "ready" | "failed";

/**
 * Owns one gameplay launch attempt. The separate loader and registrar ports
 * keep the launch boundary usable by additional gameplay scene bundles.
 */
export class GameplaySceneLoadController {
  private loadPromise: Promise<void> | null = null;
  private state: GameplaySceneLoadState = "idle";

  getState(): GameplaySceneLoadState {
    return this.state;
  }

  load<SceneConstructor>(
    context: GameLaunchContext,
    loadBundle: GameplaySceneBundleLoader<SceneConstructor>,
    scene: GameplaySceneRegistrationPort<SceneConstructor>,
    startGameplay: (context: GameLaunchContext) => void,
  ): Promise<void> {
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.state = "loading";
    this.loadPromise = Promise.resolve()
      .then(loadBundle)
      .then((bundle) => {
        registerGameplaySceneBundle(scene, bundle);
        this.state = "ready";
        startGameplay(context);
      })
      .catch((error: unknown) => {
        this.state = "failed";
        this.loadPromise = null;
        throw error;
      });

    return this.loadPromise;
  }
}

/**
 * Keeps the loading presentation in control until Skirmish has completed its
 * Phaser create lifecycle. The caller owns the actual scene event listener.
 */
export class GameplaySceneReadinessController {
  private state: GameplaySceneReadinessState = "idle";

  getState(): GameplaySceneReadinessState {
    return this.state;
  }

  begin(): boolean {
    if (this.state !== "idle") {
      return false;
    }

    this.state = "waiting-for-skirmish";
    return true;
  }

  complete(): boolean {
    if (this.state !== "waiting-for-skirmish") {
      return false;
    }

    this.state = "ready";
    return true;
  }

  fail(): void {
    this.state = "failed";
  }
}
