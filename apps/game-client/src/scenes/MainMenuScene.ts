import Phaser from "phaser";
import {
  createImjinrokMapScaffold,
  createMapDefinitionFromId,
  createRandomSkirmishMap,
  defaultMap,
  imjinrokCampaignScenarios,
  imjinrokK01Scenario,
  imjinrokK02Scenario,
  IMJINROK_CAMPAIGN_PROGRESS_STORAGE_KEY,
  isCampaignScenarioCompleted,
  isCampaignScenarioUnlocked,
  normalizeCampaignProgressState,
  type CampaignProgressState,
  type ScenarioDefinition,
} from "@shared";
import type { SkirmishAiDifficulty } from "@simulation";
import {
  createCampaignMissionLaunchContext,
  deserializePlayerVisibilityState,
  inferQuickSaveAiPlayerIds,
  isOptionalStringArray,
  isSupportedQuickSaveVersion,
  LATEST_QUICK_SAVE_STORAGE_KEY,
  normalizeOptionalMissionDialogueState,
  normalizeSerializedKnownResources,
  normalizeSerializedControlGroups,
  normalizeSavedWorldSnapshot,
  type GameLaunchContext,
  type QuickSavePayload,
} from "../session.js";
import {
  cycleMouseControlMode,
  readGameplayPreferences,
  stepGameSpeedPreset,
  writeGameplayPreferences,
  type GameplayPreferences,
} from "../gameplayPreferences.js";
import {
  resolveMainMenuKeyboardAction,
  type MainMenuAction,
  type MainMenuActionAvailability,
  type MainMenuScreen,
} from "../mainMenuFlow.js";
import {
  resolveCampaignNationAtSourcePoint,
  resolveCampaignNationMissionAction,
  type CampaignNation,
} from "../mainMenuCountrySelection.js";
import {
  IMJINROK_CLASSIC_MAIN_MENU_GEOMETRY,
  resolveMainMenuCanvasLayout,
  type MainMenuSourceRect,
} from "../mainMenuLayout.js";
import {
  MAIN_MENU_BUTTON_AUDIO_CUE_KEY,
  MAIN_MENU_COUNTRY_SELECT_AUDIO_CUE_KEY,
  playMainMenuAudioCue,
  queueMainMenuAudio,
  startMainMenuBackgroundMusic,
  stopMainMenuBackgroundMusic,
} from "../mainMenuAudio.js";
import {
  MAIN_MENU_ASSETS,
  MAIN_MENU_RESOURCE_PLAN,
  MainMenuDeferredActionQueue,
  requiresDeferredMainMenuResources,
} from "../mainMenuDeferredLoad.js";
import { launchGameWithPreGameBriefing } from "../preGameBriefingLaunch.js";

const AI_DIFFICULTIES = [
  "easy",
  "normal",
  "hard",
] as const satisfies readonly SkirmishAiDifficulty[];
const DUEL_PLAYER_IDS = ["local-player", "cpu-1"] as const;
const DUEL_AI_PLAYER_IDS = ["cpu-1"] as const;
const FOUR_PLAYER_IDS = ["local-player", "cpu-1", "cpu-2", "cpu-3"] as const;
const FOUR_AI_PLAYER_IDS = ["cpu-1", "cpu-2", "cpu-3"] as const;
const AI_DIFFICULTY_STORAGE_KEY = "isorts.menu.aiDifficulty";
const LAST_RANDOM_SKIRMISH_STORAGE_KEY = "isorts.menu.lastRandomSkirmish";

// A future remastered presentation may replace logical canvas, assets, and
// geometry independently from this classic source-art menu profile.

interface LastRandomSkirmishConfig {
  mode: "duel" | "four-player";
  seed: number;
  size: number;
  savedAt?: string;
}

interface SourceMenuEntry {
  label: string;
  action: MainMenuAction;
  enabled?: boolean;
}

function createVsCpuTeams(
  playerIds: readonly string[],
): Record<string, string> {
  return Object.fromEntries(
    playerIds.map((playerId, index) => [
      playerId,
      index === 0 ? "local" : "cpu",
    ]),
  );
}

/**
 * The classic 640×480 source-art presentation layered in a RESIZE Phaser
 * scene. The pointer rectangles are intentionally project adaptation geometry;
 * source sprites are preserved without stretching and centered in the browser
 * viewport.
 */
export class MainMenuScene extends Phaser.Scene {
  private aiDifficulty: SkirmishAiDifficulty = "normal";
  private gameplayPreferences: GameplayPreferences = readGameplayPreferences();
  private keyboardHandlers = new Map<string, () => void>();
  private menuContainer: Phaser.GameObjects.Container | null = null;
  private menuMode: MainMenuScreen = "main";
  private campaignNationHover: CampaignNation | null = null;
  private deferredLoadStarted = false;
  private deferredLoadComplete = false;
  private readonly deferredActions = new MainMenuDeferredActionQueue<MainMenuAction>();
  private readonly presentationGeometry = IMJINROK_CLASSIC_MAIN_MENU_GEOMETRY;

  constructor() {
    super("main-menu");
  }

  preload(): void {
    for (const asset of MAIN_MENU_RESOURCE_PLAN.critical.images) {
      if (!this.textures.exists(asset.key)) {
        this.load.image(asset.key, asset.url);
      }
    }
  }

  create(): void {
    this.aiDifficulty = this.readAiDifficultyPreference();
    this.gameplayPreferences = readGameplayPreferences();
    this.cameras.main.setBackgroundColor("#090705");
    this.drawMenu();

    for (const key of [
      "ONE",
      "TWO",
      "THREE",
      "FOUR",
      "FIVE",
      "SIX",
      "SEVEN",
      "ESC",
    ] as const) {
      this.bindKeyboard(key, () => this.handleKeyboardAction(key));
    }
    this.bindKeyboard("D", () => this.cycleAiDifficulty());
    this.bindKeyboard("G", () => this.cycleGameSpeedPreference());
    this.bindKeyboard("M", () => this.cycleMouseControlModePreference());
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    this.beginDeferredMenuLoad();
  }

  private beginDeferredMenuLoad(): void {
    if (this.deferredLoadStarted) {
      return;
    }
    this.deferredLoadStarted = true;

    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, this.handleDeferredLoadError, this);
    this.load.once(Phaser.Loader.Events.COMPLETE, this.completeDeferredMenuLoad, this);

    let queuedAny = queueMainMenuAudio(this);
    for (const asset of MAIN_MENU_RESOURCE_PLAN.deferred.images) {
      if (this.textures.exists(asset.key)) {
        continue;
      }
      try {
        this.load.image(asset.key, asset.url);
        queuedAny = true;
      } catch (error) {
        console.warn("Failed to queue deferred main menu image", {
          assetKey: asset.key,
          error,
        });
      }
    }

    if (!queuedAny) {
      this.completeDeferredMenuLoad();
      return;
    }

    try {
      this.load.start();
    } catch (error) {
      console.warn("Failed to start deferred main menu load", { error });
      this.completeDeferredMenuLoad();
    }
  }

  private handleDeferredLoadError(file: { key?: string; src?: string }): void {
    console.warn("Deferred main menu resource failed to load", {
      key: file.key,
      src: file.src,
    });
  }

  private completeDeferredMenuLoad(): void {
    if (this.deferredLoadComplete) {
      return;
    }
    this.deferredLoadComplete = true;
    this.removeDeferredLoadListeners();
    startMainMenuBackgroundMusic(this);

    const pendingAction = this.deferredActions.markReady();
    if (pendingAction) {
      this.executeAction(pendingAction);
    }
  }

  private removeDeferredLoadListeners(): void {
    this.load.off(
      Phaser.Loader.Events.FILE_LOAD_ERROR,
      this.handleDeferredLoadError,
      this,
    );
    this.load.off(
      Phaser.Loader.Events.COMPLETE,
      this.completeDeferredMenuLoad,
      this,
    );
  }

  private drawMenu(): void {
    const layout = resolveMainMenuCanvasLayout(
      this.scale.width,
      this.scale.height,
      this.presentationGeometry,
    );
    this.menuContainer?.destroy(true);
    this.menuContainer = this.add
      .container(layout.offsetX, layout.offsetY)
      .setScale(layout.scale);

    switch (this.menuMode) {
      case "campaign-country":
        this.drawCampaignCountryMenu();
        return;
      case "campaign-stage":
        this.drawCampaignStageMenu();
        return;
      case "random":
        this.drawRandomMenu();
        return;
      case "preferences":
        this.drawPreferencesMenu();
        return;
      case "main":
      default:
        this.drawMainMenu();
    }
  }

  private drawMainMenu(): void {
    this.addSourceScreen(
      MAIN_MENU_ASSETS.landing,
      "임진록 2\n원본 메인 화면 자산을 불러오지 못했습니다.",
    );
    const latestSave = this.readLatestQuickSavePayload();

    this.addSourceAction(
      this.presentationGeometry.projectAdaptationHitRects.main.scenario,
      () => this.executeAction("show-campaign-country"),
    );
    this.addSourceAction(
      this.presentationGeometry.projectAdaptationHitRects.main.load,
      () => this.executeAction("load-latest-save"),
      latestSave !== null,
    );
    this.addSourceAction(
      this.presentationGeometry.projectAdaptationHitRects.main.preferences,
      () => this.executeAction("show-preferences"),
    );
    this.addSourceAction(
      this.presentationGeometry.projectAdaptationHitRects.main.random,
      () => this.executeAction("show-random"),
    );

    if (!latestSave) {
      this.addDisabledOverlay(
        this.presentationGeometry.projectAdaptationHitRects.main.load,
        "저장 없음",
      );
    }
    this.addDisabledOverlay(
      { x: 12, y: 408, width: 118, height: 62 },
      "웹판 미지원",
    );
  }

  private drawCampaignCountryMenu(): void {
    this.addSourceScreen(
      this.getCampaignCountryScreenAsset(),
      "국가 선택\n원본 배경 자산을 불러오지 못했습니다.",
    );
    this.addCampaignCountrySelectionMap();
    this.addProjectAdaptationButton(
      this.presentationGeometry.projectAdaptationHitRects.country.back,
      "돌아가기",
      "back",
    );
  }

  private getCampaignCountryScreenAsset() {
    switch (this.campaignNationHover?.selectedScreen) {
      case "korea":
        return MAIN_MENU_ASSETS.korea;
      case "japan":
        return MAIN_MENU_ASSETS.japan;
      case "china":
        return MAIN_MENU_ASSETS.china;
      default:
        return MAIN_MENU_ASSETS.stage;
    }
  }

  private addCampaignCountrySelectionMap(): void {
    const zone = this.add
      .zone(
        0,
        0,
        this.presentationGeometry.logicalWidth,
        this.presentationGeometry.logicalHeight,
      )
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    const updateHover = (_pointer: Phaser.Input.Pointer, localX: number, localY: number) => {
      this.setCampaignNationHover(this.getCampaignNationAtSourcePoint(localX, localY));
    };

    zone.on("pointerover", updateHover);
    zone.on("pointermove", updateHover);
    zone.on("pointerout", () => this.setCampaignNationHover(null));
    zone.on(
      "pointerup",
      (_pointer: Phaser.Input.Pointer, localX: number, localY: number) => {
        const action = resolveCampaignNationMissionAction(
          this.getCampaignNationAtSourcePoint(localX, localY),
        );
        if (action) {
          this.executeAction(action);
        }
      },
    );
    this.menuContainer?.add(zone);
  }

  private getCampaignNationAtSourcePoint(
    x: number,
    y: number,
  ): CampaignNation | null {
    return resolveCampaignNationAtSourcePoint(
      { x, y },
      (sourceX, sourceY) => {
        const pixel = this.textures.getPixel(
          sourceX,
          sourceY,
          MAIN_MENU_ASSETS.countryMask.key,
        );
        return pixel
          ? {
              red: pixel.red,
              green: pixel.green,
              blue: pixel.blue,
              alpha: pixel.alpha,
            }
          : null;
      },
    );
  }

  private setCampaignNationHover(nation: CampaignNation | null): void {
    if (nation?.id === this.campaignNationHover?.id) {
      return;
    }
    this.campaignNationHover = nation;
    this.drawMenu();
  }

  private drawCampaignStageMenu(): void {
    this.addSourceScreen(
      MAIN_MENU_ASSETS.korea,
      "조선 시나리오\n원본 배경 자산을 불러오지 못했습니다.",
    );
    this.addStageBorder();
    const progress = this.readCampaignProgress();
    const scenarios = [imjinrokK01Scenario, imjinrokK02Scenario] as const;

    for (let index = 0; index < 8; index += 1) {
      const scenario = scenarios[index];
      const unlocked = scenario
        ? isCampaignScenarioUnlocked(
            imjinrokCampaignScenarios,
            progress,
            scenario.id,
          )
        : false;
      const label = scenario
        ? this.getCampaignStageLabel(index + 1, scenario, progress, unlocked)
        : `${index + 1}. 자료 미구현`;
      const enabled = Boolean(scenario && unlocked);
      const rect = this.getStageSlotRect(index);

      if (enabled) {
        this.addSourceAction(rect, () =>
          this.executeAction(index === 0 ? "launch-k01" : "launch-k02"),
        );
        this.addSourceImage(
          MAIN_MENU_ASSETS.selectBox,
          rect.x + 3,
          rect.y - 1,
          0.7,
        );
      }
      this.addText(rect.x + 39, rect.y + 14, label, {
        fontSize: "12px",
        color: enabled ? "#382319" : "#76695a",
      })
        .setOrigin(0, 0.5)
        .setAlpha(enabled ? 1 : 0.72);
    }

    this.addProjectAdaptationButton(
      this.presentationGeometry.projectAdaptationHitRects.stage.back,
      "돌아가기",
      "back",
    );
  }

  private drawRandomMenu(): void {
    this.addSourceScreen(
      MAIN_MENU_ASSETS.landing,
      "임의게임\n원본 메뉴 자산을 불러오지 못했습니다.",
    );
    this.addRightPanel("임의게임", [
      { label: "1. 임의 지도 1v1 CPU전", action: "start-random-duel" },
      { label: "2. 임의 지도 4인 CPU전", action: "start-random-four-player" },
      { label: "3. 원본 4인 전장 CPU전", action: "start-cpu-skirmish" },
      {
        label: `4. 최근 임의 지도${this.readLastRandomSkirmishConfig() ? " 다시 시작" : " · 기록 없음"}`,
        action: "start-last-random",
        enabled: this.readLastRandomSkirmishConfig() !== null,
      },
    ]);
  }

  private drawPreferencesMenu(): void {
    this.addSourceScreen(
      MAIN_MENU_ASSETS.landing,
      "환경 설정\n원본 메뉴 자산을 불러오지 못했습니다.",
    );
    this.addRightPanel("환경 설정", [
      {
        label: `1. 게임 속도 · ${this.getGameSpeedPreferenceName(this.gameplayPreferences.gameSpeed)}`,
        action: "cycle-game-speed",
      },
      {
        label: `2. 마우스 · ${this.gameplayPreferences.mouseControlMode === "one-button" ? "원버튼" : "투버튼"}`,
        action: "cycle-mouse-mode",
      },
      {
        label: `3. CPU 난이도 · ${this.getAiDifficultyLabel(this.aiDifficulty)}`,
        action: "cycle-ai-difficulty",
      },
    ]);
    this.addText(536, 350, "G · M · D 단축키로도 변경할 수 있습니다.", {
      fontSize: "10px",
      color: "#554133",
      align: "center",
      wordWrap: { width: 140 },
    }).setOrigin(0.5, 0);
  }

  private addRightPanel(
    title: string,
    entries: readonly SourceMenuEntry[],
  ): void {
    this.addSourceImage(MAIN_MENU_ASSETS.menuBorder, 452, 86);
    this.addText(538, 103, title, {
      fontSize: "18px",
      color: "#3d261a",
    }).setOrigin(0.5);
    entries.forEach((entry, index) => {
      const rect = this.getPanelRowRect(index);
      this.addPanelTextButton(
        rect,
        entry.label,
        entry.action,
        entry.enabled !== false,
      );
    });
    this.addPanelTextButton(
      this.presentationGeometry.projectAdaptationHitRects.panel.back,
      "돌아가기",
      "back",
    );
  }

  private addPanelTextButton(
    rect: MainMenuSourceRect,
    label: string,
    action: MainMenuAction,
    enabled = true,
  ): void {
    this.addSourceImage(MAIN_MENU_ASSETS.menuButton, rect.x + 5, rect.y);
    const text = this.addText(
      rect.x + rect.width / 2,
      rect.y + rect.height / 2,
      label,
      {
        fontSize: "11px",
        color: enabled ? "#3c281b" : "#786a5a",
        align: "center",
        wordWrap: { width: rect.width - 14 },
      },
    )
      .setOrigin(0.5)
      .setAlpha(enabled ? 1 : 0.68);

    if (enabled) {
      this.addSourceAction(rect, () => this.executeAction(action));
    }
  }

  private addProjectAdaptationButton(
    rect: MainMenuSourceRect,
    label: string,
    action: MainMenuAction,
  ): void {
    const button = this.add
      .graphics()
      .fillStyle(0x3b281d, 0.96)
      .fillRoundedRect(rect.x, rect.y, rect.width, rect.height, 4)
      .lineStyle(1, 0xae8c58, 1)
      .strokeRoundedRect(rect.x, rect.y, rect.width, rect.height, 4);
    this.menuContainer?.add(button);
    this.addText(rect.x + rect.width / 2, rect.y + rect.height / 2, label, {
      fontSize: "12px",
      color: "#ead8a5",
      align: "center",
    }).setOrigin(0.5);
    this.addSourceAction(rect, () => this.executeAction(action));
  }

  private addStageBorder(): void {
    const { border } =
      this.presentationGeometry.projectAdaptationHitRects.stage;
    this.addSourceImage(MAIN_MENU_ASSETS.stageBorder, border.x, border.y);
  }

  private addSourceScreen(
    asset: (typeof MAIN_MENU_ASSETS)[keyof typeof MAIN_MENU_ASSETS],
    fallbackText: string,
  ): void {
    if (this.textures.exists(asset.key)) {
      this.addSourceImage(asset, 0, 0)?.setOrigin(0, 0);
      return;
    }

    const fallback = this.add
      .graphics()
      .fillStyle(0x17110a, 1)
      .fillRect(
        0,
        0,
        this.presentationGeometry.logicalWidth,
        this.presentationGeometry.logicalHeight,
      )
      .lineStyle(2, 0xa48a50, 1)
      .strokeRect(
        12,
        12,
        this.presentationGeometry.logicalWidth - 24,
        this.presentationGeometry.logicalHeight - 24,
      );
    this.menuContainer?.add(fallback);
    this.addText(
      this.presentationGeometry.logicalWidth / 2,
      this.presentationGeometry.logicalHeight / 2,
      fallbackText,
      {
        fontSize: "18px",
        color: "#e6d6ae",
        align: "center",
      },
    ).setOrigin(0.5);
  }

  private addSourceImage(
    asset: (typeof MAIN_MENU_ASSETS)[keyof typeof MAIN_MENU_ASSETS],
    x: number,
    y: number,
    alpha = 1,
  ): Phaser.GameObjects.Image | null {
    if (!this.textures.exists(asset.key)) {
      return null;
    }

    const image = this.add
      .image(x, y, asset.key)
      .setOrigin(0, 0)
      .setAlpha(alpha);
    this.menuContainer?.add(image);
    return image;
  }

  private addText(
    x: number,
    y: number,
    text: string,
    style: Phaser.Types.GameObjects.Text.TextStyle,
  ): Phaser.GameObjects.Text {
    const label = this.add.text(x, y, text, {
      fontFamily: "Batang, AppleMyungjo, Nanum Myeongjo, serif",
      stroke: "#e5dcbf",
      strokeThickness: 0.4,
      ...style,
    });
    this.menuContainer?.add(label);
    return label;
  }

  private addSourceAction(
    rect: MainMenuSourceRect,
    action: () => void,
    enabled = true,
  ): void {
    if (!enabled) {
      return;
    }
    const zone = this.add
      .zone(rect.x, rect.y, rect.width, rect.height)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    zone.on("pointerup", action);
    this.menuContainer?.add(zone);
  }

  private addDisabledOverlay(rect: MainMenuSourceRect, label: string): void {
    const graphics = this.add
      .graphics()
      .fillStyle(0x120d08, 0.9)
      .fillRect(rect.x, rect.y, rect.width, rect.height);
    this.menuContainer?.add(graphics);
    this.addText(rect.x + rect.width / 2, rect.y + rect.height / 2, label, {
      fontSize: "13px",
      color: "#b9ab91",
    }).setOrigin(0.5);
  }

  private handleKeyboardAction(key: string): void {
    const action = resolveMainMenuKeyboardAction(
      this.menuMode,
      key,
      this.getActionAvailability(),
    );
    if (action) {
      this.executeAction(action);
    }
  }

  private executeAction(action: MainMenuAction): void {
    if (
      requiresDeferredMainMenuResources(action) &&
      !this.deferredActions.isReady
    ) {
      this.deferredActions.request(action);
      return;
    }

    playMainMenuAudioCue(
      this,
      action === "show-campaign-stage"
        ? MAIN_MENU_COUNTRY_SELECT_AUDIO_CUE_KEY
        : MAIN_MENU_BUTTON_AUDIO_CUE_KEY,
    );
    switch (action) {
      case "show-campaign-country":
        this.campaignNationHover = null;
        this.menuMode = "campaign-country";
        this.drawMenu();
        return;
      case "show-campaign-stage":
        this.menuMode = "campaign-stage";
        this.drawMenu();
        return;
      case "show-random":
        this.menuMode = "random";
        this.drawMenu();
        return;
      case "show-preferences":
        this.menuMode = "preferences";
        this.drawMenu();
        return;
      case "load-latest-save":
        this.startSavedGame(this.readLatestQuickSavePayload());
        return;
      case "launch-k01":
        this.startCampaignScenario(imjinrokK01Scenario);
        return;
      case "launch-k02":
        if (this.getActionAvailability().isK02Unlocked) {
          this.startCampaignScenario(imjinrokK02Scenario);
        }
        return;
      case "start-random-duel":
        this.startRandomSingleplayer();
        return;
      case "start-random-four-player":
        this.startRandomFourPlayerSkirmish();
        return;
      case "start-cpu-skirmish":
        this.startCpuSkirmish();
        return;
      case "start-last-random":
        this.startLastRandomSkirmish();
        return;
      case "cycle-ai-difficulty":
        this.cycleAiDifficulty();
        return;
      case "cycle-game-speed":
        this.cycleGameSpeedPreference();
        return;
      case "cycle-mouse-mode":
        this.cycleMouseControlModePreference();
        return;
      case "back":
        this.campaignNationHover = null;
        this.menuMode =
          this.menuMode === "campaign-stage" ? "campaign-country" : "main";
        this.drawMenu();
    }
  }

  private getActionAvailability(): MainMenuActionAvailability {
    return {
      hasQuickSave: this.readLatestQuickSavePayload() !== null,
      isK02Unlocked: isCampaignScenarioUnlocked(
        imjinrokCampaignScenarios,
        this.readCampaignProgress(),
        imjinrokK02Scenario.id,
      ),
      hasLastRandom: this.readLastRandomSkirmishConfig() !== null,
    };
  }

  private handleResize(): void {
    this.drawMenu();
  }

  private handleShutdown(): void {
    for (const [key, listener] of this.keyboardHandlers) {
      this.input.keyboard?.off(`keydown-${key}`, listener);
    }
    this.keyboardHandlers.clear();
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.removeDeferredLoadListeners();
    this.deferredActions.reset();
    this.deferredLoadStarted = false;
    this.deferredLoadComplete = false;
    stopMainMenuBackgroundMusic(this);
    this.menuContainer?.destroy(true);
    this.menuContainer = null;
  }

  private getStageSlotRect(index: number): MainMenuSourceRect {
    const { stage } = this.presentationGeometry.projectAdaptationHitRects;
    return { ...stage.slot, y: stage.firstSlotY + index * stage.slotHeight };
  }

  private bindKeyboard(key: string, listener: () => void): void {
    this.keyboardHandlers.set(key, listener);
    this.input.keyboard?.on(`keydown-${key}`, listener);
  }

  private getPanelRowRect(index: number): MainMenuSourceRect {
    const { panel } = this.presentationGeometry.projectAdaptationHitRects;
    return { ...panel.row, y: panel.firstRowY + index * panel.rowHeight };
  }

  private launchGame(context: GameLaunchContext): void {
    launchGameWithPreGameBriefing(this.scene, context);
  }

  private startSavedGame(payload: QuickSavePayload | null): void {
    const context = payload ? this.createSavedGameLaunchContext(payload) : null;
    if (context) {
      this.launchGame(context);
    }
  }

  private startCampaignScenario(scenario: ScenarioDefinition): void {
    const map = createImjinrokMapScaffold(scenario.mapId) ?? defaultMap;
    this.launchGame(createCampaignMissionLaunchContext(scenario, map));
  }

  private startRandomSingleplayer(): void {
    const seed = this.createRandomSeed();
    const size = 96;
    const map = createRandomSkirmishMap(seed, size);
    this.writeLastRandomSkirmishConfig({
      mode: "duel",
      seed,
      size,
      savedAt: new Date().toISOString(),
    });
    this.launchGame(
      this.createSkirmishLaunchContext(
        map,
        DUEL_PLAYER_IDS,
        DUEL_AI_PLAYER_IDS,
      ),
    );
  }

  private startRandomFourPlayerSkirmish(): void {
    const seed = this.createRandomSeed();
    const size = 128;
    const map = createRandomSkirmishMap(seed, size);
    this.writeLastRandomSkirmishConfig({
      mode: "four-player",
      seed,
      size,
      savedAt: new Date().toISOString(),
    });
    this.launchGame(
      this.createSkirmishLaunchContext(
        map,
        FOUR_PLAYER_IDS,
        FOUR_AI_PLAYER_IDS,
      ),
    );
  }

  private startLastRandomSkirmish(): void {
    const config = this.readLastRandomSkirmishConfig();
    if (!config) {
      return;
    }
    const map = createRandomSkirmishMap(config.seed, config.size);
    const playerIds =
      config.mode === "four-player" ? FOUR_PLAYER_IDS : DUEL_PLAYER_IDS;
    const aiPlayerIds =
      config.mode === "four-player" ? FOUR_AI_PLAYER_IDS : DUEL_AI_PLAYER_IDS;
    this.launchGame(
      this.createSkirmishLaunchContext(map, playerIds, aiPlayerIds),
    );
  }

  private startCpuSkirmish(): void {
    const map = createImjinrokMapScaffold("imjinrok-cpu-4p-128") ?? defaultMap;
    this.launchGame(
      this.createSkirmishLaunchContext(
        map,
        FOUR_PLAYER_IDS,
        FOUR_AI_PLAYER_IDS,
      ),
    );
  }

  private createSkirmishLaunchContext(
    map: ReturnType<typeof createRandomSkirmishMap>,
    playerIds: readonly string[],
    aiPlayerIds: readonly string[],
  ): GameLaunchContext {
    return {
      entryMode: "singleplayer",
      connectionMode: "local",
      scenarioType: "skirmish",
      session: null,
      serverOnline: false,
      mapId: map.id,
      mapDefinition: map,
      playerIds: [...playerIds],
      playerTeams: createVsCpuTeams(playerIds),
      aiPlayerIds: [...aiPlayerIds],
      aiDifficulty: this.aiDifficulty,
    };
  }

  private cycleAiDifficulty(): void {
    const currentIndex = AI_DIFFICULTIES.indexOf(this.aiDifficulty);
    this.aiDifficulty =
      AI_DIFFICULTIES[(currentIndex + 1) % AI_DIFFICULTIES.length] ?? "normal";
    this.writeAiDifficultyPreference(this.aiDifficulty);
    if (this.menuMode === "preferences") {
      this.drawMenu();
    }
  }

  private cycleGameSpeedPreference(): void {
    this.gameplayPreferences = {
      ...this.gameplayPreferences,
      gameSpeed: stepGameSpeedPreset(this.gameplayPreferences.gameSpeed, 1),
    };
    writeGameplayPreferences(this.gameplayPreferences);
    if (this.menuMode === "preferences") {
      this.drawMenu();
    }
  }

  private cycleMouseControlModePreference(): void {
    this.gameplayPreferences = {
      ...this.gameplayPreferences,
      mouseControlMode: cycleMouseControlMode(
        this.gameplayPreferences.mouseControlMode,
      ),
    };
    writeGameplayPreferences(this.gameplayPreferences);
    if (this.menuMode === "preferences") {
      this.drawMenu();
    }
  }

  private getCampaignStageLabel(
    index: number,
    scenario: ScenarioDefinition,
    progress: CampaignProgressState,
    unlocked: boolean,
  ): string {
    const displayName = scenario.name.replace(/^\d+\.\s*/, "");
    if (isCampaignScenarioCompleted(progress, scenario.id)) {
      return `${index}. ${displayName} · 완료`;
    }
    return `${index}. ${displayName}${unlocked ? "" : " · 잠김"}`;
  }

  private getGameSpeedPreferenceName(
    speed: GameplayPreferences["gameSpeed"],
  ): string {
    switch (speed) {
      case "slowest":
        return "매우 느림";
      case "slow":
        return "느림";
      case "normal":
        return "보통";
      case "fast":
        return "빠름";
      case "fastest":
        return "매우 빠름";
    }
  }

  private getAiDifficultyLabel(difficulty: SkirmishAiDifficulty): string {
    switch (difficulty) {
      case "easy":
        return "쉬움";
      case "normal":
        return "보통";
      case "hard":
        return "어려움";
    }
  }

  private readAiDifficultyPreference(): SkirmishAiDifficulty {
    try {
      const storedDifficulty = globalThis.localStorage?.getItem(
        AI_DIFFICULTY_STORAGE_KEY,
      );
      return (
        AI_DIFFICULTIES.find((difficulty) => difficulty === storedDifficulty) ??
        "normal"
      );
    } catch {
      return "normal";
    }
  }

  private writeAiDifficultyPreference(difficulty: SkirmishAiDifficulty): void {
    try {
      globalThis.localStorage?.setItem(AI_DIFFICULTY_STORAGE_KEY, difficulty);
    } catch {
      // In-memory preferences remain active when browser storage is unavailable.
    }
  }

  private createSavedGameLaunchContext(
    payload: QuickSavePayload,
  ): GameLaunchContext | null {
    const snapshot = normalizeSavedWorldSnapshot(payload.snapshot);
    const controlGroups = payload.controlGroups
      ? normalizeSerializedControlGroups(payload.controlGroups)
      : null;
    const activeMissionDialogue = normalizeOptionalMissionDialogueState(
      payload.activeMissionDialogue,
    );
    if (
      !snapshot ||
      activeMissionDialogue === null ||
      (payload.controlGroups !== undefined && !controlGroups)
    ) {
      return null;
    }
    const playerIds = Object.keys(snapshot.players);
    const playerTeams = Object.fromEntries(
      Object.entries(snapshot.players).map(([id, player]) => [
        id,
        player.teamId ?? id,
      ]),
    );
    const restartMapDefinition =
      payload.launchContext.mapDefinition ??
      createMapDefinitionFromId(
        payload.launchContext.mapId ?? snapshot.map.id,
        { randomSize: snapshot.map.width },
      ) ??
      snapshot.map;
    return {
      ...payload.launchContext,
      entryMode: "singleplayer",
      connectionMode: "local",
      session: null,
      serverOnline: false,
      mapId: restartMapDefinition.id,
      mapDefinition: restartMapDefinition,
      playerIds,
      playerTeams,
      aiPlayerIds: inferQuickSaveAiPlayerIds(
        snapshot,
        payload.launchContext.aiPlayerIds,
      ),
      resumeSnapshot: snapshot,
      ...(payload.playerVisibility
        ? { resumePlayerVisibility: payload.playerVisibility }
        : {}),
      ...(controlGroups ? { resumeControlGroups: controlGroups } : {}),
      ...(payload.knownResources
        ? { resumeKnownResources: payload.knownResources }
        : {}),
      ...(activeMissionDialogue
        ? { resumeMissionDialogue: activeMissionDialogue }
        : {}),
      ...(payload.triggeredMissionDialogueIds
        ? { triggeredMissionDialogueIds: payload.triggeredMissionDialogueIds }
        : {}),
    };
  }

  private readLatestQuickSavePayload(): QuickSavePayload | null {
    try {
      const rawPayload = globalThis.localStorage?.getItem(
        LATEST_QUICK_SAVE_STORAGE_KEY,
      );
      if (!rawPayload) {
        return null;
      }
      const payload = JSON.parse(rawPayload) as Partial<QuickSavePayload>;
      const activeMissionDialogue = normalizeOptionalMissionDialogueState(
        payload.activeMissionDialogue,
      );
      const controlGroups =
        payload.controlGroups === undefined
          ? undefined
          : normalizeSerializedControlGroups(payload.controlGroups);
      const knownResources =
        payload.knownResources === undefined
          ? undefined
          : normalizeSerializedKnownResources(payload.knownResources);
      if (
        !isSupportedQuickSaveVersion(payload.version) ||
        typeof payload.contextKey !== "string" ||
        typeof payload.savedAt !== "string" ||
        !payload.launchContext ||
        activeMissionDialogue === null ||
        !isOptionalStringArray(payload.triggeredMissionDialogueIds) ||
        (payload.controlGroups !== undefined && !controlGroups) ||
        (payload.knownResources !== undefined && !knownResources) ||
        (payload.playerVisibility !== undefined &&
          !deserializePlayerVisibilityState(payload.playerVisibility)) ||
        !normalizeSavedWorldSnapshot(payload.snapshot)
      ) {
        return null;
      }
      return {
        ...payload,
        ...(activeMissionDialogue ? { activeMissionDialogue } : {}),
        ...(controlGroups ? { controlGroups } : {}),
        ...(knownResources ? { knownResources } : {}),
      } as QuickSavePayload;
    } catch {
      return null;
    }
  }

  private readLastRandomSkirmishConfig(): LastRandomSkirmishConfig | null {
    try {
      const rawConfig = globalThis.localStorage?.getItem(
        LAST_RANDOM_SKIRMISH_STORAGE_KEY,
      );
      if (!rawConfig) {
        return null;
      }
      const config = JSON.parse(rawConfig) as Partial<LastRandomSkirmishConfig>;
      const mode =
        config.mode === "four-player"
          ? "four-player"
          : config.mode === "duel"
            ? "duel"
            : null;
      const seed = config.seed;
      const size = config.size;
      if (
        !mode ||
        !Number.isSafeInteger(seed) ||
        seed === undefined ||
        seed < 0 ||
        seed > 0xffffffff ||
        !Number.isSafeInteger(size) ||
        size === undefined ||
        size < 48 ||
        size > 192
      ) {
        return null;
      }
      return {
        mode,
        seed: seed >>> 0,
        size,
        ...(config.savedAt ? { savedAt: config.savedAt } : {}),
      };
    } catch {
      return null;
    }
  }

  private writeLastRandomSkirmishConfig(
    config: LastRandomSkirmishConfig,
  ): void {
    try {
      globalThis.localStorage?.setItem(
        LAST_RANDOM_SKIRMISH_STORAGE_KEY,
        JSON.stringify(config),
      );
    } catch {
      // Starting a local match must not depend on optional browser storage.
    }
  }

  private readCampaignProgress(): CampaignProgressState {
    try {
      const rawProgress = globalThis.localStorage?.getItem(
        IMJINROK_CAMPAIGN_PROGRESS_STORAGE_KEY,
      );
      return normalizeCampaignProgressState(
        rawProgress ? JSON.parse(rawProgress) : null,
        imjinrokCampaignScenarios,
      );
    } catch {
      return normalizeCampaignProgressState(null, imjinrokCampaignScenarios);
    }
  }

  private createRandomSeed(): number {
    const values = new Uint32Array(1);
    globalThis.crypto?.getRandomValues(values);
    return values[0] || Math.floor(this.time.now * 1000);
  }
}
