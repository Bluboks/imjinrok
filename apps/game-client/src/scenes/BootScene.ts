import Phaser from "phaser";
import { INITIAL_LANDING_RESOURCE_POLICY } from "../mainMenuDeferredLoad.js";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload(): void {
    for (const asset of INITIAL_LANDING_RESOURCE_POLICY.boot.images) {
      if (!this.textures.exists(asset.key)) {
        this.load.image(asset.key, asset.url);
      }
    }
  }

  create(): void {
    this.scene.start("main-menu");
  }
}
