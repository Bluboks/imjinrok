import Phaser from "phaser";
import {
  GAMEPLAY_LAUNCH_SCENE_KEY,
  GameplaySceneLoadController,
  loadGameplaySceneBundle,
  SKIRMISH_SCENE_KEY,
  UI_SCENE_KEY,
} from "../gameplaySceneRegistration.js";
import type { GameLaunchContext } from "../session.js";

const MAIN_MENU_SCENE_KEY = "main-menu";

export class GameplayLaunchScene extends Phaser.Scene {
  private context: GameLaunchContext | null = null;
  private loadController = new GameplaySceneLoadController();

  constructor() {
    super(GAMEPLAY_LAUNCH_SCENE_KEY);
  }

  init(data: GameLaunchContext): void {
    this.context = data;
    this.loadController = new GameplaySceneLoadController();
  }

  create(): void {
    const context = this.context;
    if (!context) {
      this.showLoadFailure(new Error("Missing gameplay launch context."));
      return;
    }

    this.showLoading();
    void this.loadController.load(
      context,
      loadGameplaySceneBundle,
      {
        hasScene: (key) => this.scene.manager.keys[key] !== undefined,
        addScene: (key, sceneClass) => this.scene.add(key, sceneClass),
      },
      (launchContext) => {
        this.scene.start(SKIRMISH_SCENE_KEY, launchContext);
        this.scene.launch(UI_SCENE_KEY, launchContext);
      },
    ).catch((error: unknown) => this.showLoadFailure(error));
  }

  private showLoading(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor("#102325");
    this.add.text(width / 2, height / 2, "게임 화면을 불러오는 중…", {
      color: "#f1dfaa",
      fontFamily: "Noto Sans KR, Malgun Gothic, Apple SD Gothic Neo, sans-serif",
      fontSize: "18px",
    }).setOrigin(0.5);
  }

  private showLoadFailure(error: unknown): void {
    const details = error instanceof Error ? error.message : String(error);
    console.error("Failed to load gameplay scenes.", error);

    this.children.removeAll(true);
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor("#28161b");
    const message = this.add.text(width / 2, height / 2 - 34, `게임 화면을 불러오지 못했습니다.\n${details}`, {
      align: "center",
      color: "#ffd7d7",
      fontFamily: "Noto Sans KR, Malgun Gothic, Apple SD Gothic Neo, sans-serif",
      fontSize: "16px",
      wordWrap: { width: Math.max(240, width - 48) },
    }).setOrigin(0.5);
    const buttonWidth = 180;
    const buttonHeight = 38;
    const buttonX = width / 2 - buttonWidth / 2;
    const buttonY = Math.min(height - 58, message.y + message.height / 2 + 28);
    const button = this.add.rectangle(buttonX + buttonWidth / 2, buttonY + buttonHeight / 2, buttonWidth, buttonHeight, 0x102325)
      .setStrokeStyle(1, 0xd0b46a)
      .setInteractive({ useHandCursor: true });
    const label = this.add.text(button.x, button.y, "메뉴로 돌아가기", {
      color: "#f1dfaa",
      fontFamily: "Noto Sans KR, Malgun Gothic, Apple SD Gothic Neo, sans-serif",
      fontSize: "14px",
    }).setOrigin(0.5);
    button.on("pointerup", () => this.scene.start(MAIN_MENU_SCENE_KEY));
    label.setInteractive({ useHandCursor: true }).on("pointerup", () => this.scene.start(MAIN_MENU_SCENE_KEY));
  }
}
