import Phaser from "phaser";
import { BootScene } from "../scenes/BootScene.js";
import { MainMenuScene } from "../scenes/MainMenuScene.js";
import { SkirmishScene } from "../scenes/SkirmishScene.js";
import { UIScene } from "../scenes/UIScene.js";

export function createGame(): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: "app",
    backgroundColor: "#102325",
    width: window.innerWidth,
    height: window.innerHeight,
    scene: [BootScene, MainMenuScene, SkirmishScene, UIScene],
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  });
}
