import Phaser from "phaser";
import { defaultTheme, getThemeAssetUrl, getThemeFrameRefs } from "@shared";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload(): void {
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: { key?: string; src?: string }) => {
      console.warn("Theme texture failed to load", { key: file.key, src: file.src });
    });

    for (const { visual, frame } of getThemeFrameRefs(defaultTheme)) {
      if (this.textures.exists(frame.textureKey)) {
        continue;
      }

      this.load.image(frame.textureKey, getThemeAssetUrl(defaultTheme, visual, frame));
    }
  }

  create(): void {
    this.scene.start("main-menu");
  }
}
