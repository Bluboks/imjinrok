import Phaser from "phaser";
import { BootScene } from "../scenes/BootScene.js";
import { GameplayLaunchScene } from "../scenes/GameplayLaunchScene.js";
import { MainMenuScene } from "../scenes/MainMenuScene.js";
import { MissionBriefingScene } from "../scenes/MissionBriefingScene.js";

export function createGame(): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: "app",
    backgroundColor: "#102325",
    width: window.innerWidth,
    height: window.innerHeight,
    scene: [BootScene, MainMenuScene, MissionBriefingScene, GameplayLaunchScene],
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  });
}
