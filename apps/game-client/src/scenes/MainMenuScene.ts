import Phaser from "phaser";
import { NetworkClient } from "../net/NetworkClient.js";
import type { GameLaunchContext } from "../session.js";

const MENU_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: "Trebuchet MS, Verdana, sans-serif",
  fontSize: "26px",
  color: "#eef4df",
};

export class MainMenuScene extends Phaser.Scene {
  private readonly networkClient = new NetworkClient();

  constructor() {
    super("main-menu");
  }

  create(): void {
    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor("#0e1b1e");

    this.add
      .text(width / 2, 100, "isorts", {
        fontFamily: "Georgia, Times New Roman, serif",
        fontSize: "56px",
        color: "#f7f0d6",
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 152, "Isometric RTS Scaffold", {
        fontFamily: "Trebuchet MS, Verdana, sans-serif",
        fontSize: "18px",
        color: "#a8c3b0",
      })
      .setOrigin(0.5);

    const options = [
      { label: "1. Singleplayer Skirmish", action: () => void this.startSingleplayer() },
      { label: "2. Custom Lobby Preview", action: () => void this.startCustomLobby() },
      { label: "3. Automatch Queue Preview", action: () => void this.startAutomatch() },
    ];

    options.forEach((option, index) => {
      this.add
        .text(width / 2, 260 + index * 64, option.label, MENU_STYLE)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on("pointerup", option.action);
    });

    this.add
      .text(width / 2, height - 90, "AoE II inspired scope: singleplayer, hosted multiplayer, automatch, map editor.", {
        fontFamily: "Trebuchet MS, Verdana, sans-serif",
        fontSize: "16px",
        color: "#8fb4a2",
        align: "center",
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height - 52, "Use 1 / 2 / 3 or click a mode. Right-drag to pan, wheel to zoom in match view.", {
        fontFamily: "Trebuchet MS, Verdana, sans-serif",
        fontSize: "14px",
        color: "#6f9180",
        align: "center",
      })
      .setOrigin(0.5);

    this.input.keyboard?.on("keydown-ONE", () => void this.startSingleplayer());
    this.input.keyboard?.on("keydown-TWO", () => void this.startCustomLobby());
    this.input.keyboard?.on("keydown-THREE", () => void this.startAutomatch());
  }

  private launchGame(context: GameLaunchContext): void {
    if (this.scene.isActive("ui")) {
      this.scene.stop("ui");
    }

    this.scene.start("skirmish", context);
    this.scene.launch("ui", context);
  }

  private startSingleplayer(): void {
    this.launchGame({
      mode: "singleplayer",
      session: null,
      serverOnline: false,
    });
  }

  private async startCustomLobby(): Promise<void> {
    const result = await this.networkClient.createCustomLobby("local-player");

    this.launchGame({
      mode: "custom-lobby",
      session: result.session,
      serverOnline: result.serverOnline,
    });
  }

  private async startAutomatch(): Promise<void> {
    const result = await this.networkClient.joinAutomatch("local-player");

    this.launchGame({
      mode: "matchmaking",
      session: result.session,
      serverOnline: result.serverOnline,
    });
  }
}
