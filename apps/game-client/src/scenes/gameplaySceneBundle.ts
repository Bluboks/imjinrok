import Phaser from "phaser";
import type { GameplaySceneBundle } from "../gameplaySceneRegistration.js";
import { SkirmishScene } from "./SkirmishScene.js";
import { UIScene } from "./UIScene.js";

export const gameplaySceneBundle: GameplaySceneBundle<typeof Phaser.Scene> = {
  skirmish: SkirmishScene,
  ui: UIScene,
};
