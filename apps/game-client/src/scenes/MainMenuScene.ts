import Phaser from "phaser";
import {
  createImjinrokMapScaffold,
  createMapDefinitionFromId,
  createRandomSkirmishMap,
  defaultMap,
  getCampaignContinueScenario,
  imjinrokCampaignScenarios,
  imjinrokK01Scenario,
  imjinrokK02Scenario,
  IMJINROK_CAMPAIGN_PROGRESS_STORAGE_KEY,
  isCampaignComplete,
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

const MENU_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: "Noto Sans KR, Malgun Gothic, Apple SD Gothic Neo, Trebuchet MS, sans-serif",
  fontSize: "26px",
  color: "#eef4df",
};

const AI_DIFFICULTIES = ["easy", "normal", "hard"] as const satisfies readonly SkirmishAiDifficulty[];
const DUEL_PLAYER_IDS = ["local-player", "cpu-1"] as const;
const DUEL_AI_PLAYER_IDS = ["cpu-1"] as const;
const FOUR_PLAYER_IDS = ["local-player", "cpu-1", "cpu-2", "cpu-3"] as const;
const FOUR_AI_PLAYER_IDS = ["cpu-1", "cpu-2", "cpu-3"] as const;
const AI_DIFFICULTY_STORAGE_KEY = "isorts.menu.aiDifficulty";
const LAST_RANDOM_SKIRMISH_STORAGE_KEY = "isorts.menu.lastRandomSkirmish";

interface LastRandomSkirmishConfig {
  mode: "duel" | "four-player";
  seed: number;
  size: number;
  savedAt?: string;
}

type MainMenuMode = "main" | "campaign-country" | "campaign-stage";

interface MenuOption {
  label: string;
  action: () => void;
  enabled?: boolean;
}

function createVsCpuTeams(playerIds: readonly string[]): Record<string, string> {
  const teams: Record<string, string> = {};

  playerIds.forEach((playerId, index) => {
    teams[playerId] = index === 0 ? "local" : "cpu";
  });

  return teams;
}

export class MainMenuScene extends Phaser.Scene {
  private aiDifficulty: SkirmishAiDifficulty = "normal";
  private aiDifficultyText: Phaser.GameObjects.Text | null = null;
  private menuContainer: Phaser.GameObjects.Container | null = null;
  private menuMode: MainMenuMode = "main";

  constructor() {
    super("main-menu");
  }

  create(): void {
    this.aiDifficulty = this.readAiDifficultyPreference();
    this.cameras.main.setBackgroundColor("#0e1b1e");
    this.drawMenu();

    this.input.keyboard?.on("keydown-ONE", this.handleOptionOneHotkey, this);
    this.input.keyboard?.on("keydown-TWO", this.handleOptionTwoHotkey, this);
    this.input.keyboard?.on("keydown-THREE", this.handleOptionThreeHotkey, this);
    this.input.keyboard?.on("keydown-FOUR", this.handleOptionFourHotkey, this);
    this.input.keyboard?.on("keydown-FIVE", this.handleOptionFiveHotkey, this);
    this.input.keyboard?.on("keydown-SIX", this.handleOptionSixHotkey, this);
    this.input.keyboard?.on("keydown-SEVEN", this.handleOptionSevenHotkey, this);
    this.input.keyboard?.on("keydown-ESC", this.handleBackHotkey, this);
    this.input.keyboard?.on("keydown-D", this.cycleAiDifficulty, this);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
  }

  private drawMenu(): void {
    const { width, height } = this.scale;

    this.menuContainer?.destroy(true);
    this.menuContainer = this.add.container(0, 0);
    this.aiDifficultyText = null;

    const titleY = Math.max(62, height * 0.14);
    const menuTop = Math.max(180, Math.min(titleY + 116, height * 0.33));
    const menuStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      ...MENU_STYLE,
      fontSize: `${Phaser.Math.Clamp(Math.floor(width / 38), 20, 26)}px`,
    };

    this.menuContainer.add(
      this.add
      .text(width / 2, 100, "isorts", {
        fontFamily: "Georgia, Times New Roman, serif",
        fontSize: "56px",
        color: "#f7f0d6",
      })
      .setOrigin(0.5)
      .setPosition(width / 2, titleY),
    );

    this.menuContainer.add(
      this.add.text(width / 2, titleY + 52, "임진록 2 웹 포팅", {
        fontFamily: "Noto Sans KR, Malgun Gothic, Apple SD Gothic Neo, Trebuchet MS, sans-serif",
        fontSize: "18px",
        color: "#a8c3b0",
      })
      .setOrigin(0.5),
    );

    switch (this.menuMode) {
      case "campaign-country":
        this.drawCampaignCountryMenu(width, height, menuTop, menuStyle);
        return;
      case "campaign-stage":
        this.drawCampaignStageMenu(width, height, menuTop, menuStyle);
        return;
      case "main":
      default:
        break;
    }

    const campaignProgress = this.readCampaignProgress();
    const continueScenario = getCampaignContinueScenario(imjinrokCampaignScenarios, campaignProgress);
    const campaignComplete = isCampaignComplete(imjinrokCampaignScenarios, campaignProgress);
    const latestSave = this.readLatestQuickSavePayload();
    const latestRandom = this.readLastRandomSkirmishConfig();
    const options: MenuOption[] = [
      { label: `1. 저장 게임 계속 - ${latestSave ? this.getQuickSaveMenuLabel(latestSave) : "저장 없음"}`, action: () => void this.startSavedGame(latestSave), enabled: latestSave !== null },
      { label: "2. 시나리오", action: () => this.showCampaignCountryMenu(), enabled: true },
      {
        label: campaignComplete
          ? "3. 캠페인 계속 - 완료됨"
          : `3. 캠페인 계속 - ${continueScenario?.name ?? imjinrokK01Scenario.name}`,
        action: () => this.handleContinueCampaignAction(),
        enabled: true,
      },
      { label: "4. 임의 지도 1v1 CPU전", action: () => void this.startRandomSingleplayer(), enabled: true },
      { label: "5. 임의 지도 4인 CPU전", action: () => void this.startRandomFourPlayerSkirmish(), enabled: true },
      { label: "6. 원본 4인 전장 CPU전", action: () => void this.startCpuSkirmish(), enabled: true },
      { label: `7. 최근 임의 지도 다시 - ${latestRandom ? this.getLastRandomSkirmishMenuLabel(latestRandom) : "기록 없음"}`, action: () => void this.startLastRandomSkirmish(), enabled: latestRandom !== null },
    ];

    const menuStepY = this.addMenuOptions(options, width / 2, menuTop, height, menuStyle);

    this.aiDifficultyText = this.add
      .text(width / 2, menuTop + options.length * menuStepY, this.getAiDifficultyMenuLabel(), menuStyle)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerup", () => this.cycleAiDifficulty());
    this.menuContainer.add(this.aiDifficultyText);

    this.menuContainer.add(
      this.add.text(width / 2, height - 54, "싱글플레이 빌드", {
        fontFamily: "Noto Sans KR, Malgun Gothic, Apple SD Gothic Neo, Trebuchet MS, sans-serif",
        fontSize: "12px",
        color: "#8fb4a2",
        align: "center",
      })
      .setOrigin(0.5),
    );
  }

  private handleResize(): void {
    this.drawMenu();
  }

  private handleShutdown(): void {
    this.input.keyboard?.off("keydown-ONE", this.handleOptionOneHotkey, this);
    this.input.keyboard?.off("keydown-TWO", this.handleOptionTwoHotkey, this);
    this.input.keyboard?.off("keydown-THREE", this.handleOptionThreeHotkey, this);
    this.input.keyboard?.off("keydown-FOUR", this.handleOptionFourHotkey, this);
    this.input.keyboard?.off("keydown-FIVE", this.handleOptionFiveHotkey, this);
    this.input.keyboard?.off("keydown-SIX", this.handleOptionSixHotkey, this);
    this.input.keyboard?.off("keydown-SEVEN", this.handleOptionSevenHotkey, this);
    this.input.keyboard?.off("keydown-ESC", this.handleBackHotkey, this);
    this.input.keyboard?.off("keydown-D", this.cycleAiDifficulty, this);
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.menuContainer?.destroy(true);
    this.menuContainer = null;
    this.aiDifficultyText = null;
  }

  private drawCampaignCountryMenu(
    width: number,
    height: number,
    menuTop: number,
    menuStyle: Phaser.Types.GameObjects.Text.TextStyle,
  ): void {
    this.menuContainer?.add(
      this.add.text(width / 2, menuTop - 48, "나라를 선택하시오", {
        ...menuStyle,
        fontSize: "22px",
        color: "#d0b46a",
      }).setOrigin(0.5),
    );

    this.addMenuOptions(
      [
        { label: "1. 조선 (朝鮮)", action: () => this.showCampaignStageMenu(), enabled: true },
        { label: "2. 일본 (日本)", action: () => undefined, enabled: false },
        { label: "3. 명 (明)", action: () => undefined, enabled: false },
        { label: "4. 돌아가기", action: () => this.showMainMenu(), enabled: true },
      ],
      width / 2,
      menuTop + 8,
      height,
      menuStyle,
    );
  }

  private drawCampaignStageMenu(
    width: number,
    height: number,
    menuTop: number,
    menuStyle: Phaser.Types.GameObjects.Text.TextStyle,
  ): void {
    const campaignProgress = this.readCampaignProgress();
    const options: MenuOption[] = [
      ...imjinrokCampaignScenarios.map((scenario, index) => {
        const unlocked = isCampaignScenarioUnlocked(imjinrokCampaignScenarios, campaignProgress, scenario.id);

        return {
          label: this.getCampaignStageMenuLabel(index + 1, scenario, campaignProgress, unlocked),
          action: () => void this.startCampaignScenario(scenario),
          enabled: unlocked,
        };
      }),
      { label: `${imjinrokCampaignScenarios.length + 1}. 돌아가기`, action: () => this.showCampaignCountryMenu(), enabled: true },
    ];

    this.menuContainer?.add(
      this.add.text(width / 2, menuTop - 48, "조선 (朝鮮)", {
        ...menuStyle,
        fontSize: "22px",
        color: "#d0b46a",
      }).setOrigin(0.5),
    );
    this.addMenuOptions(options, width / 2, menuTop + 8, height, menuStyle);
  }

  private addMenuOptions(
    options: readonly MenuOption[],
    x: number,
    y: number,
    height: number,
    menuStyle: Phaser.Types.GameObjects.Text.TextStyle,
  ): number {
    const menuStepY = Phaser.Math.Clamp((height - y - 96) / Math.max(options.length + 1, 2), 34, 46);

    options.forEach((option, index) => {
      const text = this.add
        .text(x, y + index * menuStepY, option.label, menuStyle)
        .setOrigin(0.5);

      if (option.enabled !== false) {
        text.setInteractive({ useHandCursor: true }).on("pointerup", option.action);
      } else {
        text.setColor("#6f9180").setAlpha(0.58);
      }
      this.menuContainer?.add(text);
    });

    return menuStepY;
  }

  private handleOptionOneHotkey(): void {
    switch (this.menuMode) {
      case "campaign-country":
        this.showCampaignStageMenu();
        return;
      case "campaign-stage":
        this.startCampaignMissionK01();
        return;
      case "main":
      default:
        this.startSavedGame(this.readLatestQuickSavePayload());
    }
  }

  private handleOptionTwoHotkey(): void {
    switch (this.menuMode) {
      case "campaign-stage":
        this.startCampaignMissionK02();
        return;
      case "main":
        this.showCampaignCountryMenu();
        return;
      case "campaign-country":
      default:
        return;
    }
  }

  private handleOptionThreeHotkey(): void {
    switch (this.menuMode) {
      case "campaign-stage":
        this.showCampaignCountryMenu();
        return;
      case "main":
        this.handleContinueCampaignAction();
        return;
      case "campaign-country":
      default:
        return;
    }
  }

  private handleOptionFourHotkey(): void {
    switch (this.menuMode) {
      case "campaign-country":
        this.showMainMenu();
        return;
      case "main":
        this.startRandomSingleplayer();
        return;
      case "campaign-stage":
      default:
        return;
    }
  }

  private handleOptionFiveHotkey(): void {
    if (this.menuMode === "main") {
      this.startRandomFourPlayerSkirmish();
    }
  }

  private handleOptionSixHotkey(): void {
    if (this.menuMode === "main") {
      this.startCpuSkirmish();
    }
  }

  private handleOptionSevenHotkey(): void {
    if (this.menuMode === "main") {
      this.startLastRandomSkirmish();
    }
  }

  private handleBackHotkey(): void {
    switch (this.menuMode) {
      case "campaign-stage":
        this.showCampaignCountryMenu();
        return;
      case "campaign-country":
        this.showMainMenu();
        return;
      case "main":
      default:
        return;
    }
  }

  private showMainMenu(): void {
    this.menuMode = "main";
    this.drawMenu();
  }

  private showCampaignCountryMenu(): void {
    this.menuMode = "campaign-country";
    this.drawMenu();
  }

  private showCampaignStageMenu(): void {
    this.menuMode = "campaign-stage";
    this.drawMenu();
  }

  private launchGame(context: GameLaunchContext): void {
    if (this.scene.isActive("ui")) {
      this.scene.stop("ui");
    }

    this.scene.start("skirmish", context);
    this.scene.launch("ui", context);
  }

  private startCampaignMissionK01(): void {
    this.startCampaignScenario(imjinrokK01Scenario);
  }

  private startCampaignMissionK02(): void {
    if (isCampaignScenarioUnlocked(imjinrokCampaignScenarios, this.readCampaignProgress(), imjinrokK02Scenario.id)) {
      this.startCampaignScenario(imjinrokK02Scenario);
    }
  }

  private handleContinueCampaignAction(): void {
    const campaignProgress = this.readCampaignProgress();

    if (isCampaignComplete(imjinrokCampaignScenarios, campaignProgress)) {
      this.showCampaignStageMenu();
      return;
    }

    this.startCampaignScenario(getCampaignContinueScenario(imjinrokCampaignScenarios, campaignProgress) ?? imjinrokK01Scenario);
  }

  private startSavedGame(payload: QuickSavePayload | null): void {
    const context = payload ? this.createSavedGameLaunchContext(payload) : null;

    if (!context) {
      return;
    }

    this.launchGame(context);
  }

  private startCampaignScenario(scenario: ScenarioDefinition): void {
    const map = createImjinrokMapScaffold(scenario.mapId) ?? defaultMap;

    this.launchGame(createCampaignMissionLaunchContext(scenario, map));
  }

  private startRandomSingleplayer(): void {
    const seed = this.createRandomSeed();
    const size = 96;
    const map = createRandomSkirmishMap(seed, size);

    this.writeLastRandomSkirmishConfig({ mode: "duel", seed, size, savedAt: new Date().toISOString() });
    this.launchGame({
      entryMode: "singleplayer",
      connectionMode: "local",
      scenarioType: "skirmish",
      session: null,
      serverOnline: false,
      mapId: map.id,
      mapDefinition: map,
      playerIds: [...DUEL_PLAYER_IDS],
      playerTeams: createVsCpuTeams(DUEL_PLAYER_IDS),
      aiPlayerIds: [...DUEL_AI_PLAYER_IDS],
      aiDifficulty: this.aiDifficulty,
    });
  }

  private startRandomFourPlayerSkirmish(): void {
    const seed = this.createRandomSeed();
    const size = 128;
    const map = createRandomSkirmishMap(seed, size);

    this.writeLastRandomSkirmishConfig({ mode: "four-player", seed, size, savedAt: new Date().toISOString() });
    this.launchGame({
      entryMode: "singleplayer",
      connectionMode: "local",
      scenarioType: "skirmish",
      session: null,
      serverOnline: false,
      mapId: map.id,
      mapDefinition: map,
      playerIds: [...FOUR_PLAYER_IDS],
      playerTeams: createVsCpuTeams(FOUR_PLAYER_IDS),
      aiPlayerIds: [...FOUR_AI_PLAYER_IDS],
      aiDifficulty: this.aiDifficulty,
    });
  }

  private startLastRandomSkirmish(): void {
    const config = this.readLastRandomSkirmishConfig();

    if (!config) {
      return;
    }

    const map = createRandomSkirmishMap(config.seed, config.size);
    const playerIds = config.mode === "four-player" ? FOUR_PLAYER_IDS : DUEL_PLAYER_IDS;
    const aiPlayerIds = config.mode === "four-player" ? FOUR_AI_PLAYER_IDS : DUEL_AI_PLAYER_IDS;

    this.launchGame({
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
    });
  }

  private startCpuSkirmish(): void {
    const map = createImjinrokMapScaffold("imjinrok-cpu-4p-128") ?? defaultMap;

    this.launchGame({
      entryMode: "singleplayer",
      connectionMode: "local",
      scenarioType: "skirmish",
      session: null,
      serverOnline: false,
      mapId: map.id,
      mapDefinition: map,
      playerIds: [...FOUR_PLAYER_IDS],
      playerTeams: createVsCpuTeams(FOUR_PLAYER_IDS),
      aiPlayerIds: [...FOUR_AI_PLAYER_IDS],
      aiDifficulty: this.aiDifficulty,
    });
  }

  private cycleAiDifficulty(): void {
    const currentIndex = AI_DIFFICULTIES.indexOf(this.aiDifficulty);
    this.aiDifficulty = AI_DIFFICULTIES[(currentIndex + 1) % AI_DIFFICULTIES.length] ?? "normal";
    this.writeAiDifficultyPreference(this.aiDifficulty);
    this.aiDifficultyText?.setText(this.getAiDifficultyMenuLabel());
  }

  private readAiDifficultyPreference(): SkirmishAiDifficulty {
    try {
      const storedDifficulty = globalThis.localStorage?.getItem(AI_DIFFICULTY_STORAGE_KEY);

      return AI_DIFFICULTIES.find((difficulty) => difficulty === storedDifficulty) ?? "normal";
    } catch {
      return "normal";
    }
  }

  private writeAiDifficultyPreference(difficulty: SkirmishAiDifficulty): void {
    try {
      globalThis.localStorage?.setItem(AI_DIFFICULTY_STORAGE_KEY, difficulty);
    } catch {
      // Menu preference is optional; the in-memory difficulty still applies.
    }
  }

  private getAiDifficultyMenuLabel(): string {
    return `CPU 난이도: ${this.getAiDifficultyLabel(this.aiDifficulty)}`;
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

  private getCampaignStageMenuLabel(
    index: number,
    scenario: ScenarioDefinition,
    progress: CampaignProgressState,
    unlocked: boolean,
  ): string {
    const displayName = scenario.name.replace(/^\d+\.\s*/, "");
    let status = "";

    if (isCampaignScenarioCompleted(progress, scenario.id)) {
      status = " [완료]";
    } else if (!unlocked) {
      status = " [잠김]";
    }

    return `${index}. ${displayName}${status}`;
  }

  private getQuickSaveMenuLabel(payload: QuickSavePayload): string {
    const scenarioName = payload.launchContext.scenario?.name ?? payload.snapshot.scenario.id;

    return `${scenarioName} / ${this.formatQuickSaveTime(payload.savedAt)}`;
  }

  private getLastRandomSkirmishMenuLabel(config: LastRandomSkirmishConfig): string {
    const mode = config.mode === "four-player" ? "4인" : "1v1";

    return `${mode} ${config.seed.toString(36).toUpperCase()}`;
  }

  private createSavedGameLaunchContext(payload: QuickSavePayload): GameLaunchContext | null {
    const snapshot = normalizeSavedWorldSnapshot(payload.snapshot);
    const controlGroups = payload.controlGroups ? normalizeSerializedControlGroups(payload.controlGroups) : null;
    const activeMissionDialogue = normalizeOptionalMissionDialogueState(payload.activeMissionDialogue);

    if (!snapshot || activeMissionDialogue === null || (payload.controlGroups !== undefined && !controlGroups)) {
      return null;
    }

    const playerIds = Object.keys(snapshot.players);
    const playerTeams: Record<string, string> = {};
    const aiPlayerIds = inferQuickSaveAiPlayerIds(snapshot, payload.launchContext.aiPlayerIds);

    for (const [playerId, player] of Object.entries(snapshot.players)) {
      playerTeams[playerId] = player.teamId ?? playerId;
    }

    const restartMapDefinition =
      payload.launchContext.mapDefinition ??
      createMapDefinitionFromId(payload.launchContext.mapId ?? snapshot.map.id, { randomSize: snapshot.map.width }) ??
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
      aiPlayerIds,
      resumeSnapshot: snapshot,
      ...(payload.playerVisibility ? { resumePlayerVisibility: payload.playerVisibility } : {}),
      ...(controlGroups ? { resumeControlGroups: controlGroups } : {}),
      ...(payload.knownResources ? { resumeKnownResources: payload.knownResources } : {}),
      ...(activeMissionDialogue ? { resumeMissionDialogue: activeMissionDialogue } : {}),
      ...(payload.triggeredMissionDialogueIds ? { triggeredMissionDialogueIds: payload.triggeredMissionDialogueIds } : {}),
    };
  }

  private readLatestQuickSavePayload(): QuickSavePayload | null {
    try {
      const rawPayload = globalThis.localStorage?.getItem(LATEST_QUICK_SAVE_STORAGE_KEY);

      if (!rawPayload) {
        return null;
      }

      const payload = JSON.parse(rawPayload) as Partial<QuickSavePayload>;
      const activeMissionDialogue = normalizeOptionalMissionDialogueState(payload.activeMissionDialogue);
      const controlGroups = payload.controlGroups === undefined
        ? undefined
        : normalizeSerializedControlGroups(payload.controlGroups);
      const knownResources = payload.knownResources === undefined
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
        (payload.playerVisibility !== undefined && !deserializePlayerVisibilityState(payload.playerVisibility)) ||
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
      const rawConfig = globalThis.localStorage?.getItem(LAST_RANDOM_SKIRMISH_STORAGE_KEY);

      if (!rawConfig) {
        return null;
      }

      const config = JSON.parse(rawConfig) as Partial<LastRandomSkirmishConfig>;
      const mode = config.mode === "four-player" ? "four-player" : config.mode === "duel" ? "duel" : null;
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
        size > 192 ||
        (config.savedAt !== undefined && typeof config.savedAt !== "string")
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

  private writeLastRandomSkirmishConfig(config: LastRandomSkirmishConfig): void {
    try {
      globalThis.localStorage?.setItem(LAST_RANDOM_SKIRMISH_STORAGE_KEY, JSON.stringify(config));
    } catch {
      // Recent random map history is optional; starting the match should not depend on storage.
    }
  }

  private formatQuickSaveTime(value: string): string {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  private readCampaignProgress(): CampaignProgressState {
    try {
      const rawProgress = globalThis.localStorage?.getItem(IMJINROK_CAMPAIGN_PROGRESS_STORAGE_KEY);

      return normalizeCampaignProgressState(rawProgress ? JSON.parse(rawProgress) : null, imjinrokCampaignScenarios);
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
