import Phaser from "phaser";
import {
  defaultMap,
  defaultTheme,
  ELEVATION_NEIGHBOR_OFFSETS,
  actionDefinitions,
  factionDefinitions,
  createImjinrokMapScaffold,
  createMapDefinitionFromId,
  getGridFacing,
  getNextCampaignScenario,
  getThemeAssetUrl,
  getThemeFrameRefs,
  getTerrainVisual,
  getTileAt,
  imjinrokCampaignScenarios,
  IMJINROK_CAMPAIGN_PROGRESS_STORAGE_KEY,
  markCampaignScenarioCompleted,
  normalizeCampaignProgressState,
  resourceDefinitions,
  researchDefinitions,
  resolveElevationTerrainSlot,
  terrainDefinitions,
  terrainTypes,
  unitCanPerformAction,
  unitDefinitions,
  type AnimationClip,
  type BankResourceKind,
  type BuildingDefinitionId,
  type CheatCodeId,
  type CommandEnvelope,
  type ActionDefinitionId,
  type ElevationNeighbor,
  type EntityVisual,
  type EntityVisualLayer,
  type Facing,
  type FactionId,
  type FrameRef,
  type GridPoint,
  type MapDefinition,
  type OriginalSpeechSlot,
  type ResourceAmountSet,
  type ResourceDefinition,
  type ResourceNode,
  type ResearchDefinitionId,
  type ScenarioBriefingLineDefinition,
  type ScenarioDefinition,
  type ScenarioMissionDialogueDefinition,
  type ThemeDefinition,
  type TerrainKindSlot,
  type TerrainType,
  type TerrainVisual,
  type ThemeFrameRef,
  type UnitDefinitionId,
} from "@shared";
import {
  areTilesVisible,
  cartToIso,
  createPlayerVisibility,
  createInitialWorldState,
  findBuildWorkPath,
  getConstructionProgress,
  getEnvironmentLightLevel,
  getPlayerPopulationState,
  getResourceNodeState,
  getTileVisibility,
  isoToCart,
  SIM_TICKS_PER_SECOND,
  TileVisibility,
  toWorldSnapshot,
  updatePlayerVisibilityWithChanges,
  validateBuildingPlacement,
  type CombatEventState,
  type IssueCommandResult,
  type PlayerVisibilityState,
  type UnitState,
  type WorldState,
} from "@simulation";
import {
  MISSION_PORTRAIT_IMAGE_CUES,
  normalizeMissionPortraitId,
  type MissionPortraitImageDefinition,
} from "../missionPortraits";
import {
  getOriginalSpeechSlot,
  resolveOriginalSpeechLayout,
} from "../originalSpeechLayout";
import { selectConstructionFrameIndex } from "../originalBuildingVisualState";
import {
  ACTION_TRIGGERED_EVENT,
  BATTLEFIELD_SUMMARY_ACTION_EVENT,
  BATTLEFIELD_SUMMARY_CHANGED_EVENT,
  BATTLEFIELD_SUMMARY_REGISTRY_KEY,
  DRAG_SELECTION_CHANGED_EVENT,
  GAME_PLAYBACK_CHANGED_EVENT,
  GAME_PLAYBACK_CONTROL_EVENT,
  GAME_PLAYBACK_REGISTRY_KEY,
  MINIMAP_ALERT_EVENT,
  MINIMAP_NAVIGATE_EVENT,
  MINIMAP_ENTITIES_CHANGED_EVENT,
  MINIMAP_ENTITIES_REGISTRY_KEY,
  MINIMAP_MAP_CHANGED_EVENT,
  MINIMAP_MAP_REGISTRY_KEY,
  MINIMAP_RESOURCES_CHANGED_EVENT,
  MINIMAP_RESOURCES_REGISTRY_KEY,
  MINIMAP_VISIBILITY_CHANGED_EVENT,
  MINIMAP_VISIBILITY_REGISTRY_KEY,
  MINIMAP_VIEWPORT_CHANGED_EVENT,
  MINIMAP_VIEWPORT_REGISTRY_KEY,
  PLAYER_ECONOMY_CHANGED_EVENT,
  PLAYER_ECONOMY_REGISTRY_KEY,
  SELECTED_ENTITY_CHANGED_EVENT,
  SELECTED_ENTITY_REGISTRY_KEY,
  VIRTUAL_CURSOR_CHANGED_EVENT,
  VIRTUAL_CURSOR_REGISTRY_KEY,
  type ActionTriggeredView,
  type BattlefieldSummaryActionView,
  type BattlefieldSideSummaryView,
  type BattlefieldSummaryView,
  type DragSelectionView,
  type GamePlaybackControlView,
  type MinimapAlertView,
  type MinimapPoint,
  type MinimapResourcesView,
  type PlayerEconomyView,
  toSelectedEntityView,
} from "../hud.js";
import { createSessionTransport, type SessionTransport } from "../net/SessionTransport.js";
import { getMissionLineDurationMs, normalizeMissionVoiceId } from "../missionVoiceTiming.js";
import {
  beginPresentationPause,
  getMissionDialogueClickAction,
  getMissionDialoguePointerAdvance,
  isPresentationExternallyPaused,
  shouldResumePresentationPlayback,
  type PresentationPauseOwnership,
} from "../missionPresentationTimeline.js";
import { placeStaticVisual } from "../render/placeStaticVisual.js";
import { getEntityAnimationStateKey } from "../render/entityAnimationState.js";
import { getAssetScale, getFrameOrigin, getFramePivot, REFERENCE_PX_PER_WU, RENDER_DEPTH_BIAS } from "../render/visualScale.js";
import {
  createCampaignMissionLaunchContext,
  deserializePlayerVisibilityState,
  createFreshLaunchContext,
  isOptionalStringArray,
  isSupportedQuickSaveVersion,
  LATEST_QUICK_SAVE_STORAGE_KEY,
  normalizeOptionalMissionDialogueState,
  normalizeSavedWorldSnapshot,
  normalizeSerializedControlGroups,
  normalizeSerializedKnownResources,
  QUICK_SAVE_VERSION,
  serializePlayerVisibilityState,
  type GameLaunchContext,
  type QuickSavePayload,
  type SerializedControlGroups,
  type SerializedKnownResourceView,
  type SerializedMissionDialogueState,
  type SerializedPlayerVisibilityState,
} from "../session.js";
import { createFormationTargets } from "../formation.js";
import { launchGameWithPreGameBriefing } from "../preGameBriefingLaunch.js";
import {
  CARDINAL_FOG_NEIGHBOR_OFFSETS,
  K01_NORMAL_FOG_PROFILE_MAP_ID,
  NORMAL_FOG_ASSETS,
  requireSourceTexture,
  resolveK01NormalFogTransition,
  resolveSourceFogTileScale,
  type FogVisibility,
  type SourceFogTile,
} from "../ui/sourceFogAndCommandAssets.js";
import {
  BUILD_DONE_AUDIO_CUE_KEY,
  COMMAND_REJECTED_AUDIO_CUE_KEY,
  GAMEPLAY_AUDIO_CUES,
  GAMEPLAY_AUDIO_CUE_BY_KEY,
  MISSION_DEFEAT_AUDIO_CUE_KEY,
  MISSION_VICTORY_AUDIO_CUE_KEY,
  TRAINING_DONE_AUDIO_CUE_KEY,
  UNDER_ATTACK_ALERT_COOLDOWN_MS,
  UNDER_ATTACK_AUDIO_CUE_KEY,
  UNIT_AUDIO_CUES,
  UPGRADE_DONE_AUDIO_CUE_KEY,
  type GameplayAudioCueKey,
  type UnitAudioAction,
} from "../gameplayAudio.js";

const DRAG_THRESHOLD_SQ = 36;
const EDGE_PAN_SIZE = 28;
const EDGE_PAN_SPEED = 520;
const TERRAIN_CHUNK_SIZE = 16;
const VIEWPORT_EVENT_INTERVAL_MS = 1000 / 30;
const SCREEN_OVERLAY_DEPTH = 1_000_000;
const GAME_AUDIO_MUTED_STORAGE_KEY = "isorts.audio.muted";
const FOG_UNEXPLORED_ALPHA = 0.9;
const FOG_EXPLORED_ALPHA = 0.48;
const TERRAIN_DEBUG_DETAILS_STORAGE_KEY = "isorts.debug.terrainDetails";
const RESOURCE_DEFINITIONS = resourceDefinitions as Readonly<Record<string, ResourceDefinition>>;
const MISSION_DIALOGUE_LINE_DURATION_MS = 5_500;
const COMMAND_FEEDBACK_DURATION_MS = 2_200;
const UNDER_ATTACK_ALERT_DURATION_MS = 2_800;
const CONTROL_GROUP_DOUBLE_TAP_MS = 450;
const UNIT_DOUBLE_CLICK_SELECT_MS = 420;
const ENVIRONMENT_OVERLAY_DEPTH = SCREEN_OVERLAY_DEPTH - 140;
const MIN_CAMERA_ZOOM = 0.55;
const MAX_CAMERA_ZOOM = 1.8;
const PLAYBACK_SPEEDS = [0.5, 1, 1.5, 2, 3] as const;
const MAX_CLIENT_PRODUCTION_QUEUE_SIZE = 5;
const CHEAT_INPUT_MAX_LENGTH = 32;

type ClientCheatAction =
  | { type: "simulation"; code: CheatCodeId; label: string }
  | { type: "reveal-map"; label: string }
  | { type: "instant-victory"; label: string }
  | { type: "unsupported"; label: string };

const IMJINROK_CHEAT_CODES: Record<string, ClientCheatAction> = {
  "돈을갖고튀어라": { type: "simulation", code: "grant-resources", label: "자원 증가" },
  "총알탄사나이": { type: "simulation", code: "fast-production", label: "생산/건설 가속" },
  "보이지않는위험": { type: "reveal-map", label: "지도 밝힘" },
  "인정사정볼것없다": { type: "simulation", code: "invincible", label: "무적" },
  "이보다더좋을수는없다": { type: "instant-victory", label: "즉시 승리" },
  "열세번째전사": { type: "unsupported", label: "장수 레벨" },
  "주유소습격사건": { type: "unsupported", label: "상점 아이템" },
  "비오는날의수채화": { type: "simulation", code: "force-rain", label: "비" },
};

function getCancellableQueueLength(unit: UnitState): number {
  return (unit.productionQueue?.length ?? 0) + (unit.researchQueue?.length ?? 0);
}

interface MissionVoiceAudioCueDefinition {
  key: string;
  voiceId: string;
  url: string;
  volume: number;
}

interface MissionResultLogoFrameDefinition {
  key: string;
  url: string;
}

interface MissionResultLogoDefinition {
  source: string;
  width: number;
  height: number;
  frames: readonly MissionResultLogoFrameDefinition[];
}

const MISSION_VOICE_AUDIO_PREFIX = "audio:mission-voice:";
const MISSION_VOICE_AUDIO_VOLUME = 0.86;
const MISSION_RESULT_LOGO_IMAGE_PREFIX = "image:mission-result-logo:";
const MISSION_RESULT_LOGO_ASSET_ROOT_URL = "assets/themes/default/ui/result";
const MISSION_RESULT_LOGO_FRAME_MS = 80;
const MISSION_RESULT_BACKDROP_IMAGE_KEY = "image:mission-result-backdrop:titleresult";
const MISSION_RESULT_BACKDROP_URL = "assets/themes/default/ui/result/titleresult/titleresult_0000.png";
const MISSION_RESULT_BACKDROP_SOURCE_WIDTH = 640;
const MISSION_RESULT_BACKDROP_SOURCE_HEIGHT = 480;

const MISSION_VOICE_AUDIO_CUES = collectMissionVoiceAudioCues(imjinrokCampaignScenarios);
const MISSION_VOICE_AUDIO_CUE_BY_ID: ReadonlyMap<string, MissionVoiceAudioCueDefinition> = new Map(
  MISSION_VOICE_AUDIO_CUES.map((cue) => [cue.voiceId, cue] as const),
);
const MISSION_PORTRAIT_IMAGE_CUE_BY_ID: ReadonlyMap<string, MissionPortraitImageDefinition> = new Map(
  MISSION_PORTRAIT_IMAGE_CUES.map((cue) => [normalizeMissionPortraitId(cue.portraitId), cue] as const),
);

const MISSION_RESULT_LOGO_BY_STATUS = {
  victory: createMissionResultLogoDefinition("winlogo", "original/imjinrok2/yfnt/winlogo.spr"),
  defeat: createMissionResultLogoDefinition("loselogo", "original/imjinrok2/yfnt/loselogo.spr"),
} as const satisfies Record<"victory" | "defeat", MissionResultLogoDefinition>;

function createMissionResultLogoDefinition(stem: string, source: string): MissionResultLogoDefinition {
  return {
    source,
    width: 250,
    height: 100,
    frames: Array.from({ length: 28 }, (_value, index) => ({
      key: `${MISSION_RESULT_LOGO_IMAGE_PREFIX}${stem}:${index}`,
      url: `${MISSION_RESULT_LOGO_ASSET_ROOT_URL}/${stem}/${stem}_${String(index).padStart(4, "0")}.png`,
    })),
  };
}


function collectMissionVoiceAudioCues(
  scenarios: readonly ScenarioDefinition[],
): MissionVoiceAudioCueDefinition[] {
  const voiceIds = new Set<string>();

  for (const scenario of scenarios) {
    for (const line of scenario.briefing?.lines ?? []) {
      addMissionVoiceId(voiceIds, line.voiceId);
    }

    for (const dialogue of scenario.missionDialogues ?? []) {
      for (const line of dialogue.lines) {
        addMissionVoiceId(voiceIds, line.voiceId);
      }
    }
  }

  return [...voiceIds].sort().map((voiceId) => ({
    key: `${MISSION_VOICE_AUDIO_PREFIX}${voiceId}`,
    voiceId,
    url: `assets/audio/mission/${voiceId}.wav`,
    volume: MISSION_VOICE_AUDIO_VOLUME,
  }));
}

function addMissionVoiceId(voiceIds: Set<string>, voiceId: string): void {
  const normalizedVoiceId = normalizeMissionVoiceId(voiceId);

  if (normalizedVoiceId) {
    voiceIds.add(normalizedVoiceId);
  }
}

const POINT_TARGET_ACTION_IDS = new Set<ActionDefinitionId>(["move", "gather", "rally-point", "repair", "attack-move", "patrol"]);

type PointTargetActionId = "move" | "gather" | "rally-point" | "repair" | "attack-move" | "patrol";

interface PendingTargetAction {
  actionId: PointTargetActionId;
  selectedEntityIds: string[];
}

interface UnitRenderable {
  container: Phaser.GameObjects.Container;
  body?: Phaser.GameObjects.Graphics;
  selectionRing: Phaser.GameObjects.Graphics;
  sprite?: Phaser.GameObjects.Image;
  spriteLayers?: UnitRenderableSpriteLayer[];
  teamBadge?: Phaser.GameObjects.Graphics;
  damageFlash: Phaser.GameObjects.Graphics;
  healthBarBack: Phaser.GameObjects.Graphics;
  healthBarFill: Phaser.GameObjects.Graphics;
  lastFacing: Facing;
  damageFlashUntil: number;
  lastHealth: number;
}

type ScreenOverlayGameObject = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Depth;

type ScreenOverlayTransformGameObject = ScreenOverlayGameObject &
  Phaser.GameObjects.Components.ScrollFactor &
  Phaser.GameObjects.Components.Transform;

interface UnitRenderableSpriteLayer extends EntityAnimationTracker {
  id: string;
  sprite: Phaser.GameObjects.Image;
}

interface EntityAnimationTracker {
  animationKey: string | null;
  animationFrameIndex: number;
  animationFrameElapsedMs: number;
}

interface EntityAnimationSelection {
  key: string;
  clip: AnimationClip;
}

interface ResourceRenderable {
  container: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Graphics;
  marker: Phaser.GameObjects.Graphics;
  glyph: Phaser.GameObjects.Text;
  stateKey: string;
}

interface FogChunkBounds {
  chunkX: number;
  chunkY: number;
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
  width: number;
  height: number;
  depth: number;
}

interface TerrainDebugAssetInfo {
  label: string;
  visualId: string | null;
  slot: TerrainKindSlot | "base" | null;
  fileName: string | null;
  textureKey: string | null;
  loaded: boolean;
}

interface TerrainDebugTileInfo {
  point: GridPoint;
  terrain: TerrainType;
  elevation: number;
  transitionSlot: TerrainKindSlot | null;
  assets: TerrainDebugAssetInfo[];
}

interface ObjectiveTrackerEntry {
  id: string;
  label: string;
  status: "pending" | "completed" | "failed";
  progress: string;
  focusUnitIds: string[];
  focusWorldPoint: Phaser.Math.Vector2 | null;
}

interface ObjectiveAreaLabelDefinition {
  x: number;
  y: number;
  text: string;
  color: string;
}

interface ActiveMissionDialogue {
  dialogue: ScenarioMissionDialogueDefinition;
  lineIndex: number;
  nextLineAt: number;
}

interface MissionDialogueParticipant {
  portraitId: string;
  speechSlot: OriginalSpeechSlot;
}

interface PendingBuildPlacement {
  builderUnitIds: string[];
  building: BuildingDefinitionId;
}

interface ControlGroupRecallState {
  group: number;
  time: number;
}

interface UnitSelectionClickState {
  kind: UnitDefinitionId;
  time: number;
}

interface MissionResultSideSummary {
  units: number;
  workers: number;
  fighters: number;
  buildings: number;
  resources: ResourceAmountSet;
  populationUsed: number;
  populationCap: number;
}

interface KnownResourceView {
  resource: ResourceNode;
  point: GridPoint;
}

export class SkirmishScene extends Phaser.Scene {
  private map: MapDefinition = defaultMap;
  private worldState: WorldState = createInitialWorldState(defaultMap, ["local-player", "cpu-1"]);
  private sessionTransport: SessionTransport | null = null;
  private lastSyncedTick = Number.NEGATIVE_INFINITY;
  private mapOrigin = new Phaser.Math.Vector2(0, 0);
  private readonly terrainChunks: Phaser.GameObjects.RenderTexture[] = [];
  private readonly terrainRenderStamps = new Map<string, Phaser.GameObjects.Image>();
  private readonly elevationFogStamps = new Map<string, Phaser.GameObjects.Image>();
  private readonly sourceFogStamps = new Map<string, Phaser.GameObjects.Image>();
  private readonly elevationOverlays: Phaser.GameObjects.Image[] = [];
  private readonly fogChunks: (Phaser.GameObjects.RenderTexture | null)[] = [];
  private readonly knownResourceViews = new Map<string, KnownResourceView>();
  private readonly resourceRenderables = new Map<string, ResourceRenderable>();
  private readonly unitRenderables = new Map<string, UnitRenderable>();
  private readonly processedCombatEventIds = new Set<string>();
  private readonly combatEffectGraphics = new Set<Phaser.GameObjects.Graphics>();
  private readonly terrainTextureKeys = new Map<TerrainType, string>();
  private readonly fogTextureKeys = new Map<TileVisibility, string>();
  private screenOverlayCamera: Phaser.Cameras.Scene2D.Camera | null = null;
  private readonly screenOverlayRoots = new Set<ScreenOverlayGameObject>();
  private readonly activeTheme: ThemeDefinition = defaultTheme;
  private localPlayerId = "local-player";
  private playerVisibility: PlayerVisibilityState = createPlayerVisibility(defaultMap);
  private fogChunkDirtyMask = new Uint8Array(0);
  private fogChunksPerRow = 0;
  private fogChunksPerColumn = 0;
  private terrainFogLiftPaddingPx = 0;
  private perfEnabled = false;
  private perfText: Phaser.GameObjects.Text | null = null;
  private scenarioStatusText: Phaser.GameObjects.Text | null = null;
  private commandFeedbackText: Phaser.GameObjects.Text | null = null;
  private commandFeedbackHideAt = 0;
  private cheatInputElement: HTMLInputElement | null = null;
  private revealMapCheatActive = false;
  private underAttackText: Phaser.GameObjects.Text | null = null;
  private underAttackHideAt = 0;
  private lastUnderAttackAlertAt = Number.NEGATIVE_INFINITY;
  private underAttackFocusPoint: Phaser.Math.Vector2 | null = null;
  private missionDialogueContainer: Phaser.GameObjects.Container | null = null;
  private missionResultContainer: Phaser.GameObjects.Container | null = null;
  private missionResultAudioStatus: "victory" | "defeat" | null = null;
  private recordedCampaignVictoryScenarioId: string | null = null;
  private pauseMenuContainer: Phaser.GameObjects.Container | null = null;
  private pauseMenuMessageText: Phaser.GameObjects.Text | null = null;
  private objectiveAreaGraphics: Phaser.GameObjects.Graphics | null = null;
  private readonly objectiveAreaLabels: Phaser.GameObjects.Text[] = [];
  private objectiveAreaLabelSignature = "";
  private environmentOverlay: Phaser.GameObjects.Graphics | null = null;
  private environmentOverlaySignature = "";
  private objectiveTrackerContainer: Phaser.GameObjects.Container | null = null;
  private objectiveTrackerBounds: Phaser.Geom.Rectangle | null = null;
  private objectiveTrackerSignature = "";
  private pendingBuildPlacement: PendingBuildPlacement | null = null;
  private pendingTargetAction: PendingTargetAction | null = null;
  private buildPlacementPreview: Phaser.GameObjects.Graphics | null = null;
  private buildPlacementPreviewSignature = "";
  private rollingFrameMs = 0;
  private lastVisibilityDeltaMs = 0;
  private lastFogRedrawMs = 0;
  private lastFogDirtyChunkCount = 0;
  private lastFogTileDrawCount = 0;
  private lastViewportEmitAt = 0;
  private viewportDirty = false;
  private cursorKeys: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private dragStartScreen: Phaser.Math.Vector2 | null = null;
  private dragCurrentScreen: Phaser.Math.Vector2 | null = null;
  private isDragSelecting = false;
  private isLeftMouseHeld = false;
  private launchContext: GameLaunchContext | null = null;
  private activeMissionDialogue: ActiveMissionDialogue | null = null;
  private missionDialoguePausedAt: number | null = null;
  private missionDialoguePauseOwnership: PresentationPauseOwnership | null = null;
  private missionDialogueConsumedPointerId: number | null = null;
  private readonly introducedMissionPortraitKeys = new Set<string>();
  private readonly triggeredMissionDialogueIds = new Set<string>();
  private isPointerLocked = false;
  private readonly virtualCursorScreen = new Phaser.Math.Vector2(0, 0);
  private readonly selectedUnitIds = new Set<string>();
  private readonly lastAudioCuePlayedAt = new Map<GameplayAudioCueKey, number>();
  private audioMuted = false;
  private readonly trackedConstructionUnitIds = new Set<string>();
  private readonly trackedCompletedResearchKeys = new Set<string>();
  private readonly trackedUnitIds = new Set<string>();
  private readonly controlGroups = new Map<number, string[]>();
  private lastControlGroupRecall: ControlGroupRecallState | null = null;
  private lastUnitSelectionClick: UnitSelectionClickState | null = null;
  private lastIdleWorkerUnitId: string | null = null;
  private terrainDebugEnabled = false;
  private terrainDebugPanel: HTMLDivElement | null = null;
  private terrainDebugCheckbox: HTMLInputElement | null = null;
  private terrainDebugTooltip: HTMLDivElement | null = null;
  private terrainDebugHighlight: Phaser.GameObjects.Graphics | null = null;
  private hoveredTerrainDebugTile: GridPoint | null = null;
  private readonly handleCheatInputKeyDown = (event: KeyboardEvent): void => {
    event.stopPropagation();

    if (event.key === "Escape") {
      this.closeCheatInput();
      event.preventDefault();
      return;
    }

    if (event.key !== "Enter") {
      return;
    }

    const cheatCode = this.cheatInputElement?.value ?? "";

    this.closeCheatInput();
    this.submitCheatCode(cheatCode);
    event.preventDefault();
  };

  constructor() {
    super("skirmish");
  }

  preload(): void {
    for (const cue of GAMEPLAY_AUDIO_CUES) {
      if (!this.cache.audio.exists(cue.key)) {
        this.load.audio(cue.key, cue.url);
      }
    }

    for (const cue of MISSION_VOICE_AUDIO_CUES) {
      if (!this.cache.audio.exists(cue.key)) {
        this.load.audio(cue.key, cue.url);
      }
    }

    for (const cue of MISSION_PORTRAIT_IMAGE_CUES) {
      if (!this.textures.exists(cue.key)) {
        this.load.image(cue.key, cue.url);
      }
    }

    for (const logo of Object.values(MISSION_RESULT_LOGO_BY_STATUS)) {
      for (const frame of logo.frames) {
        if (!this.textures.exists(frame.key)) {
          this.load.image(frame.key, frame.url);
        }
      }
    }

    if (!this.textures.exists(MISSION_RESULT_BACKDROP_IMAGE_KEY)) {
      this.load.image(MISSION_RESULT_BACKDROP_IMAGE_KEY, MISSION_RESULT_BACKDROP_URL);
    }

    for (const asset of NORMAL_FOG_ASSETS) {
      if (!this.textures.exists(asset.textureKey)) {
        this.load.image(asset.textureKey, asset.assetPath);
      }
    }
  }

  create(data: GameLaunchContext): void {
    this.closeCheatInput();
    this.revealMapCheatActive = false;
    this.activeMissionDialogue = null;
    this.missionResultAudioStatus = null;
    this.recordedCampaignVictoryScenarioId = null;
    this.missionDialoguePauseOwnership = null;
    this.missionDialogueConsumedPointerId = null;
    this.introducedMissionPortraitKeys.clear();
    this.triggeredMissionDialogueIds.clear();
    this.processedCombatEventIds.clear();
    this.trackedConstructionUnitIds.clear();
    this.trackedCompletedResearchKeys.clear();
    this.trackedUnitIds.clear();
    this.knownResourceViews.clear();
    this.lastAudioCuePlayedAt.clear();
    this.controlGroups.clear();
    this.lastControlGroupRecall = null;
    this.lastUnitSelectionClick = null;
    this.lastIdleWorkerUnitId = null;
    this.pendingTargetAction = null;
    this.setGameplayAudioMuted(this.readGameplayAudioMutedPreference(), false);
    this.hideMissionDialogueOverlay();

    const players = data.playerIds?.length
      ? data.playerIds
      : data.session?.playerIds.length
        ? data.session.playerIds
        : ["local-player", "cpu-1"];

    this.launchContext = data;
    this.localPlayerId = players[0] ?? "local-player";
    this.perfEnabled = new URLSearchParams(globalThis.location?.search ?? "").get("perf") === "1";
    this.map = this.resolveLaunchMap(data);
    this.sessionTransport = createSessionTransport(data, this.map, players);
    this.worldState = this.sessionTransport.getSnapshot();
    this.map = this.worldState.map;
    this.lastSyncedTick = this.worldState.tick;
    this.syncConstructionAudioState(false);
    this.syncProgressAudioState(false);
    if (data.resumeSnapshot) {
      this.markCurrentCombatEventsProcessed();
      this.restoreTriggeredMissionDialogues(data.triggeredMissionDialogueIds);
    }
    this.restoreControlGroups(data.resumeControlGroups);
    this.playerVisibility = this.resolveLaunchPlayerVisibility(data.resumePlayerVisibility, this.map);
    this.restoreKnownResourceViews(data.resumeKnownResources);
    this.terrainFogLiftPaddingPx = this.computeTerrainFogLiftPaddingPx();
    this.configureFogChunkGrid();
    this.mapOrigin.set(this.scale.width / 2, 160);
    this.virtualCursorScreen.set(this.scale.width / 2, this.scale.height / 2);
    this.refreshLocalVisibility();

    this.cameras.main.setBackgroundColor("#143137");
    this.setupScreenOverlayCamera();
    this.centerCameraOnLocalStart();
    this.clampCameraToWorld();

    this.setupEnvironmentOverlay();
    this.setupPerfOverlay();
    this.setupScenarioStatusOverlay();
    this.setupCommandFeedbackOverlay();
    this.setupUnderAttackAlertOverlay();
    if (data.resumeSnapshot) {
      this.restoreActiveMissionDialogue(data.resumeMissionDialogue);
    }
    this.setupObjectiveAreaOverlay();
    this.setupObjectiveTrackerOverlay();
    this.setupTerrainDebugOverlay();

    this.setupCameraControls();
    this.setupMouseControls();
    this.setupControlGroupHotkeys();
    this.setupPlaybackHotkeys();
    this.setupPointerLockLifecycle();
    this.ensureActiveThemeTexturesLoaded(() => {
      this.redrawTerrain();
      this.redrawElevationOverlay();
    });
    this.redrawAllFogOverlay();
    this.syncResourceRenderables();
    this.syncUnitRenderables();
    this.publishVirtualCursor();
    this.publishPlayerEconomy();
    this.publishBattlefieldSummary();
    this.publishGamePlayback();
    this.selectInitialUnit(this.localPlayerId);
    this.publishMinimapMap();
    this.publishMinimapVisibility();
    this.publishMinimapEntities();
    this.publishMinimapViewport(true);
    this.updateScenarioStatusOverlay();
    this.redrawObjectiveAreaOverlay();
    this.updateObjectiveTrackerOverlay();
    this.updateMissionResultOverlay();
  }

  override update(time: number, delta: number): void {
    if (!this.isBlockingModalOpen()) {
      this.handleCameraPan(delta);
    }

    this.updateTerrainDebugHover();
    this.updatePerfOverlay(delta);
    this.updateCommandFeedbackOverlay(time);
    this.updateUnderAttackAlertOverlay(time);
    this.updateBuildPlacementPreview();
    this.flushViewportIfDirty(time);

    const previousScenarioStatus = this.worldState.scenario.status;

    this.sessionTransport?.update(time, delta);
    const nextSnapshot = this.sessionTransport?.getSnapshot() ?? this.worldState;
    const animationDelta = this.getWorldAnimationDeltaMs(delta);

    if (nextSnapshot === this.worldState && nextSnapshot.tick === this.lastSyncedTick) {
      this.updateEnvironmentOverlay();
      this.updateVisibleUnitAnimationFrames(animationDelta);
      this.updateMissionDialogueOverlay(time);
      this.updateMissionResultOverlay();
      return;
    }

    this.worldState = nextSnapshot;
    this.map = nextSnapshot.map;
    this.lastSyncedTick = nextSnapshot.tick;
    this.updateEnvironmentOverlay();
    const dirtyFogChunkCount = this.refreshLocalVisibility();
    this.redrawDirtyFogOverlay(dirtyFogChunkCount);
    this.pruneMissingSelections();
    this.syncResourceRenderables();
    this.syncUnitRenderables(animationDelta);
    this.syncConstructionAudioState(true);
    this.syncProgressAudioState(true);
    this.playCombatEvents();
    this.publishPlayerEconomy();
    this.publishBattlefieldSummary();
    this.emitSelectionChanged();
    if (dirtyFogChunkCount > 0) {
      this.publishMinimapVisibility();
    }
    this.publishMinimapEntities();
    this.updateScenarioStatusOverlay();
    this.redrawObjectiveAreaOverlay();
    this.updateObjectiveTrackerOverlay();
    this.updateMissionDialogueOverlay(time);
    this.updateMissionResultOverlay();
    if (previousScenarioStatus !== nextSnapshot.scenario.status) {
      this.publishGamePlayback();
    }
  }

  private getWorldAnimationDeltaMs(deltaMs: number): number {
    const playback = this.sessionTransport?.getPlaybackState();

    if (
      !playback ||
      playback.paused ||
      this.pauseMenuContainer ||
      this.worldState.scenario.status !== "running" ||
      !Number.isFinite(deltaMs) ||
      deltaMs <= 0
    ) {
      return 0;
    }

    return deltaMs * Math.max(0, playback.speed);
  }

  private setupCameraControls(): void {
    this.input.mouse?.disableContextMenu();
    this.cursorKeys = this.input.keyboard?.createCursorKeys() ?? null;

    this.input.on(
      "wheel",
      (
        pointer: Phaser.Input.Pointer,
        _gameObjects: Phaser.GameObjects.GameObject[],
        _deltaX: number,
        deltaY: number,
      ) => {
        this.zoomCameraAtScreenPoint(this.getCameraZoomAnchor(pointer), -deltaY * 0.001);
      },
    );
  }

  private setupMouseControls(): void {
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.missionDialogueConsumedPointerId === pointer.id && !this.activeMissionDialogue) {
        this.missionDialogueConsumedPointerId = null;
      }

      if (this.isBlockingModalOpen()) {
        return;
      }

      if (this.isPointerInObjectiveTracker(pointer)) {
        return;
      }

      this.syncVirtualCursor(pointer, false);
      if (!this.isScreenPointInWorldField(this.virtualCursorScreen)) {
        return;
      }

      this.requestPointerLock();

      if (!this.isLeftButtonEvent(pointer)) {
        return;
      }

      this.isLeftMouseHeld = true;

      if (this.pendingBuildPlacement) {
        return;
      }

      if (this.pendingTargetAction) {
        return;
      }

      this.beginDragSelection();
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.isBlockingModalOpen()) {
        return;
      }

      if (this.isPointerInObjectiveTracker(pointer)) {
        return;
      }

      this.syncVirtualCursor(pointer, true);
      this.updateDragSelection();
    });

    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (this.missionDialogueConsumedPointerId === pointer.id) {
        this.missionDialogueConsumedPointerId = null;
        return;
      }

      if (this.isBlockingModalOpen()) {
        return;
      }

      if (this.isPointerInObjectiveTracker(pointer)) {
        return;
      }

      this.syncVirtualCursor(pointer, false);

      if (this.isRightButtonEvent(pointer)) {
        if (this.pendingBuildPlacement) {
          this.cancelBuildPlacement();
          return;
        }

        if (this.pendingTargetAction) {
          this.cancelPendingTargetAction();
          return;
        }

        if (this.isScreenPointInWorldField(this.virtualCursorScreen)) {
          this.issueDefaultActionAtScreenPoint(this.virtualCursorScreen);
        }

        return;
      }

      if (this.isLeftButtonEvent(pointer) || this.isLeftMouseHeld) {
        this.isLeftMouseHeld = false;

        if (this.pendingBuildPlacement) {
          if (this.isScreenPointInWorldField(this.virtualCursorScreen)) {
            this.issuePendingBuildPlacement(this.virtualCursorScreen);
          }
          this.cancelDragSelection();
          return;
        }

        if (this.pendingTargetAction) {
          if (this.isScreenPointInWorldField(this.virtualCursorScreen)) {
            this.issuePendingTargetAction(this.virtualCursorScreen);
          }
          this.cancelDragSelection();
          return;
        }

        this.finishDragSelection(pointer);
      }
    });
  }

  private isLeftButtonEvent(pointer: Phaser.Input.Pointer): boolean {
    return pointer.button === 0 || pointer.leftButtonDown() || pointer.leftButtonReleased();
  }

  private isRightButtonEvent(pointer: Phaser.Input.Pointer): boolean {
    return pointer.button === 2 || pointer.rightButtonDown() || pointer.rightButtonReleased();
  }

  private isAdditiveSelectionEvent(pointer: Phaser.Input.Pointer): boolean {
    const event = pointer.event;

    return typeof event === "object" && event !== null && "shiftKey" in event && Boolean((event as { shiftKey?: boolean }).shiftKey);
  }

  private isPointerInObjectiveTracker(pointer: Phaser.Input.Pointer): boolean {
    return this.objectiveTrackerBounds?.contains(pointer.x, pointer.y) ?? false;
  }

  private isBlockingModalOpen(): boolean {
    return Boolean(this.activeMissionDialogue || this.missionResultContainer || this.pauseMenuContainer);
  }

  private setupPointerLockLifecycle(): void {
    this.input.manager.events.on(Phaser.Input.Events.POINTERLOCK_CHANGE, this.handlePointerLockChanged, this);
    this.game.events.on(MINIMAP_NAVIGATE_EVENT, this.handleMinimapNavigate, this);
    this.game.events.on(ACTION_TRIGGERED_EVENT, this.handleActionTriggered, this);
    this.game.events.on(BATTLEFIELD_SUMMARY_ACTION_EVENT, this.handleBattlefieldSummaryAction, this);
    this.game.events.on(GAME_PLAYBACK_CONTROL_EVENT, this.handlePlaybackControl, this);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
  }

  private handleMinimapNavigate(target: MinimapPoint): void {
    if (this.isBlockingModalOpen()) {
      return;
    }

    this.centerCameraOnWorldPoint(target);
    this.publishMinimapViewport(true);
  }

  private handleActionTriggered(action: ActionTriggeredView): void {
    if (this.worldState.scenario.status !== "running" || this.pauseMenuContainer) {
      return;
    }

    if (this.isPointTargetAction(action.actionId)) {
      this.beginPointTargetAction(action.actionId, action.selectedEntityIds);
      return;
    }

    if (action.actionId === "stop") {
      this.issueStopCommands(action.selectedEntityIds);
      return;
    }

    if (action.actionId === "train-villager") {
      this.issueTrainUnit(action.selectedEntityIds, "villager", "train-villager");
      return;
    }

    if (action.actionId === "train-swordsman") {
      this.issueTrainUnit(action.selectedEntityIds, "swordsman", "train-swordsman");
      return;
    }

    if (action.actionId === "train-archer") {
      this.issueTrainUnit(action.selectedEntityIds, "archer", "train-archer");
      return;
    }

    if (action.actionId === "research-loom") {
      this.issueResearch(action.selectedEntityIds, "loom");
      return;
    }

    if (action.actionId === "cancel-production") {
      this.issueCancelProduction(action.selectedEntityIds);
      return;
    }

    if (action.actionId === "cancel-construction") {
      this.issueCancelConstruction(action.selectedEntityIds);
      return;
    }

    if (action.actionId === "build") {
      this.beginBuildPlacement(action.selectedEntityIds, "house");
      return;
    }

    if (action.actionId === "build-town-center") {
      this.beginBuildPlacement(action.selectedEntityIds, "town-center");
      return;
    }

    if (action.actionId === "build-barracks") {
      this.beginBuildPlacement(action.selectedEntityIds, "barracks");
      return;
    }

    if (action.actionId === "build-beacon") {
      this.beginBuildPlacement(action.selectedEntityIds, "beacon");
      return;
    }

    if (action.actionId === "set-gather") {
      if (this.hasRallyPointBuildings(action.selectedEntityIds)) {
        this.issueGatherRallyNearestCommands(action.selectedEntityIds);
      } else {
        this.issueGatherNearestCommands(action.selectedEntityIds);
      }
      return;
    }

    if (action.actionId === "town-bell") {
      this.issueTownBellCommands(action.selectedEntityIds);
      return;
    }

    if (action.actionId === "hold") {
      this.issueHoldPositionCommands(action.selectedEntityIds);
      return;
    }
  }

  private handleBattlefieldSummaryAction(action: BattlefieldSummaryActionView): void {
    if (this.worldState.scenario.status !== "running" || this.pauseMenuContainer) {
      return;
    }

    if (action.type === "select-idle-worker") {
      this.selectNextIdleWorker();
    }
  }

  private isPointTargetAction(actionId: ActionDefinitionId): actionId is PointTargetActionId {
    return POINT_TARGET_ACTION_IDS.has(actionId);
  }

  private handlePointerLockChanged(_event: Event, locked: boolean): void {
    this.isPointerLocked = locked;
    if (!locked && this.isLeftMouseHeld) {
      this.isLeftMouseHeld = false;
      this.cancelDragSelection();
    }
    this.publishVirtualCursor();
  }

  private handleResize(): void {
    this.clampVirtualCursorToScreen();
    this.screenOverlayCamera?.setSize(this.scale.width, this.scale.height).setScroll(0, 0).setZoom(1);
    this.clampCameraToWorld();
    this.layoutScenarioStatusOverlay();
    this.layoutCommandFeedbackOverlay();
    this.layoutUnderAttackAlertOverlay();
    this.redrawMissionDialogueOverlay();
    this.redrawPauseMenuOverlay();
    this.redrawMissionResultOverlay();
    this.updateEnvironmentOverlay(true);
    this.objectiveTrackerSignature = "";
    this.updateObjectiveTrackerOverlay();
    this.publishVirtualCursor();
    this.publishMinimapMap();
    this.publishMinimapVisibility();
    this.publishMinimapEntities();
    this.publishMinimapViewport(true);
  }

  private handleShutdown(): void {
    this.closeCheatInput();
    this.stopGameplayAudio();
    this.input.manager.events.off(Phaser.Input.Events.POINTERLOCK_CHANGE, this.handlePointerLockChanged, this);
    this.input.keyboard?.off("keydown", this.handleControlGroupKeyDown, this);
    this.input.keyboard?.off("keydown", this.handlePlaybackKeyDown, this);
    this.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, this.handleGameObjectAddedToScene, this);
    this.events.off(Phaser.Scenes.Events.REMOVED_FROM_SCENE, this.handleGameObjectRemovedFromScene, this);
    this.game.events.off(MINIMAP_NAVIGATE_EVENT, this.handleMinimapNavigate, this);
    this.game.events.off(ACTION_TRIGGERED_EVENT, this.handleActionTriggered, this);
    this.game.events.off(BATTLEFIELD_SUMMARY_ACTION_EVENT, this.handleBattlefieldSummaryAction, this);
    this.game.events.off(GAME_PLAYBACK_CONTROL_EVENT, this.handlePlaybackControl, this);
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.clearHudRegistryState();
    this.terrainChunks.forEach((chunk) => chunk.destroy());
    this.terrainChunks.length = 0;
    this.disposeTerrainRenderStamps();
    this.disposeElevationFogStamps();
    this.disposeSourceFogStamps();
    this.disposeElevationOverlay();
    this.disposeFogOverlay();
    this.disposeEnvironmentOverlay();
    this.fogChunkDirtyMask = new Uint8Array(0);
    this.fogChunksPerRow = 0;
    this.fogChunksPerColumn = 0;
    this.resourceRenderables.forEach((renderable) => renderable.container.destroy(true));
    this.resourceRenderables.clear();
    this.knownResourceViews.clear();
    this.unitRenderables.forEach((renderable) => renderable.container.destroy(true));
    this.unitRenderables.clear();
    this.combatEffectGraphics.forEach((graphics) => graphics.destroy());
    this.combatEffectGraphics.clear();
    this.processedCombatEventIds.clear();
    this.screenOverlayCamera = null;
    this.screenOverlayRoots.clear();
    this.disposeTerrainDebugOverlay();
    this.sessionTransport?.dispose();
    this.sessionTransport = null;
    this.controlGroups.clear();
    this.lastControlGroupRecall = null;
    this.lastUnitSelectionClick = null;
    this.lastIdleWorkerUnitId = null;
    this.perfText?.destroy();
    this.perfText = null;
    this.scenarioStatusText?.destroy();
    this.scenarioStatusText = null;
    this.commandFeedbackText?.destroy();
    this.commandFeedbackText = null;
    this.underAttackText?.destroy();
    this.underAttackText = null;
    this.underAttackFocusPoint = null;
    this.clearMissionDialogueOverlay();
    this.hideMissionResultOverlay();
    this.hidePauseMenu(false);
    this.disposeObjectiveTrackerOverlay();
    this.cancelBuildPlacement();
    this.cancelPendingTargetAction();
    this.objectiveAreaGraphics?.destroy();
    this.objectiveAreaGraphics = null;
    this.disposeObjectiveAreaLabels();
  }

  private clearHudRegistryState(): void {
    this.registry.remove([
      SELECTED_ENTITY_REGISTRY_KEY,
      VIRTUAL_CURSOR_REGISTRY_KEY,
      MINIMAP_MAP_REGISTRY_KEY,
      MINIMAP_VIEWPORT_REGISTRY_KEY,
      MINIMAP_ENTITIES_REGISTRY_KEY,
      MINIMAP_RESOURCES_REGISTRY_KEY,
      MINIMAP_VISIBILITY_REGISTRY_KEY,
      PLAYER_ECONOMY_REGISTRY_KEY,
      BATTLEFIELD_SUMMARY_REGISTRY_KEY,
      GAME_PLAYBACK_REGISTRY_KEY,
    ]);
  }

  private setupScreenOverlayCamera(): void {
    this.screenOverlayCamera = this.cameras
      .add(0, 0, this.scale.width, this.scale.height, false, "skirmish-screen-overlay")
      .setBackgroundColor("rgba(0,0,0,0)")
      .setScroll(0, 0)
      .setZoom(1);
    this.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, this.handleGameObjectAddedToScene, this);
    this.events.on(Phaser.Scenes.Events.REMOVED_FROM_SCENE, this.handleGameObjectRemovedFromScene, this);

    for (const gameObject of this.children.list) {
      this.applyScreenOverlayCameraFilter(gameObject);
    }
  }

  private handleGameObjectAddedToScene(gameObject: Phaser.GameObjects.GameObject): void {
    this.applyScreenOverlayCameraFilter(gameObject);
  }

  private handleGameObjectRemovedFromScene(gameObject: Phaser.GameObjects.GameObject): void {
    if (this.screenOverlayRoots.delete(gameObject as ScreenOverlayGameObject)) {
      return;
    }

    if (this.isScreenOverlayTreeObject(gameObject)) {
      this.allowGameObjectOnScreenOverlayCamera(gameObject);
    }
  }

  private handleScreenOverlayRootDestroyed(gameObject: Phaser.GameObjects.GameObject): void {
    this.screenOverlayRoots.delete(gameObject as ScreenOverlayGameObject);
  }

  private applyScreenOverlayCameraFilter(gameObject: Phaser.GameObjects.GameObject): void {
    const screenOverlayCamera = this.screenOverlayCamera;

    if (!screenOverlayCamera) {
      return;
    }

    if (this.isScreenOverlayTreeObject(gameObject)) {
      this.allowGameObjectOnScreenOverlayCamera(gameObject);
      return;
    }

    gameObject.cameraFilter &= ~this.cameras.main.id;
    screenOverlayCamera.ignore(gameObject);
  }

  private allowGameObjectOnScreenOverlayCamera(gameObject: Phaser.GameObjects.GameObject): void {
    const screenOverlayCamera = this.screenOverlayCamera;

    if (!screenOverlayCamera) {
      return;
    }

    this.cameras.main.ignore(gameObject);
    gameObject.cameraFilter &= ~screenOverlayCamera.id;

    if (gameObject instanceof Phaser.GameObjects.Container) {
      for (const child of gameObject.list) {
        this.allowGameObjectOnScreenOverlayCamera(child);
      }
    }
  }

  private isScreenOverlayTreeObject(gameObject: Phaser.GameObjects.GameObject): boolean {
    let current: Phaser.GameObjects.GameObject | null = gameObject;

    while (current) {
      if (this.screenOverlayRoots.has(current as ScreenOverlayGameObject)) {
        return true;
      }

      current = current.parentContainer ?? null;
    }

    return false;
  }

  private addScreenOverlayGraphics(depth: number): Phaser.GameObjects.Graphics {
    return this.registerScreenOverlay(this.add.graphics(), depth);
  }

  private addScreenOverlayText(
    x: number,
    y: number,
    text: string | string[],
    style?: Phaser.Types.GameObjects.Text.TextStyle,
    depth = SCREEN_OVERLAY_DEPTH,
  ): Phaser.GameObjects.Text {
    return this.registerScreenOverlay(this.add.text(x, y, text, style), depth);
  }

  private addScreenOverlayContainer(depth: number): Phaser.GameObjects.Container {
    return this.registerScreenOverlay(this.add.container(0, 0), depth);
  }

  private registerScreenOverlay<T extends ScreenOverlayTransformGameObject>(gameObject: T, depth: number): T {
    const screenOverlayCamera = this.screenOverlayCamera;

    if (!screenOverlayCamera) {
      throw new Error("Screen overlay camera must be initialized before creating overlays.");
    }

    gameObject.setScrollFactor(0).setDepth(depth);
    this.screenOverlayRoots.add(gameObject);
    this.allowGameObjectOnScreenOverlayCamera(gameObject);
    gameObject.once(Phaser.GameObjects.Events.DESTROY, this.handleScreenOverlayRootDestroyed, this);

    return gameObject;
  }

  private refreshScreenOverlayCameraOrder(): void {
    for (const gameObject of this.screenOverlayRoots) {
      this.allowGameObjectOnScreenOverlayCamera(gameObject as Phaser.GameObjects.GameObject);
      this.children.bringToTop(gameObject as Phaser.GameObjects.GameObject);
    }
  }

  private setupEnvironmentOverlay(): void {
    this.disposeEnvironmentOverlay();
    this.environmentOverlay = this.addScreenOverlayGraphics(ENVIRONMENT_OVERLAY_DEPTH);
    this.updateEnvironmentOverlay(true);
  }

  private disposeEnvironmentOverlay(): void {
    this.environmentOverlay?.destroy();
    this.environmentOverlay = null;
    this.environmentOverlaySignature = "";
  }

  private updateEnvironmentOverlay(force = false): void {
    const graphics = this.environmentOverlay;

    if (!graphics) {
      return;
    }

    const environment = this.worldState.environment;
    const width = this.scale.width;
    const height = this.scale.height;
    const lightLevel = getEnvironmentLightLevel(environment);
    const nightAlpha = Phaser.Math.Clamp((1 - lightLevel) * 0.42, 0, 0.32);
    const rainFrame = environment.weather === "rain" ? this.worldState.tick % 48 : 0;
    const signature = `${width}x${height}:${environment.weather}:${environment.dayPhase}:${rainFrame}`;

    if (!force && signature === this.environmentOverlaySignature) {
      return;
    }

    this.environmentOverlaySignature = signature;
    graphics.clear();

    if (nightAlpha > 0) {
      graphics.fillStyle(0x071426, nightAlpha).fillRect(0, 0, width, height);
    }

    if (environment.weather === "rain") {
      const rainWashAlpha = environment.dayPhase === "night" ? 0.09 : 0.065;
      graphics.fillStyle(0x8ab0bd, rainWashAlpha).fillRect(0, 0, width, height);
      this.drawRainOverlay(graphics, width, height, rainFrame);
    }
  }

  private drawRainOverlay(graphics: Phaser.GameObjects.Graphics, width: number, height: number, rainFrame: number): void {
    const spacingPx = 34;
    const rowSpacingPx = 104;
    const offsetPx = rainFrame * 2;

    graphics.lineStyle(1, 0xc8e8ef, 0.2);

    for (let x = -spacingPx + (offsetPx % spacingPx); x < width + spacingPx; x += spacingPx) {
      for (let y = -rowSpacingPx + (offsetPx % rowSpacingPx); y < height + rowSpacingPx; y += rowSpacingPx) {
        graphics.lineBetween(x + 8, y, x - 6, y + 24);
      }
    }
  }

  private setupPerfOverlay(): void {
    if (!this.perfEnabled) {
      return;
    }

    this.perfText = this.addScreenOverlayText(
      12,
      12,
      "",
      { fontFamily: "monospace", fontSize: "12px", color: "#9fffa2", backgroundColor: "#0008" },
      SCREEN_OVERLAY_DEPTH + 10,
    );
  }

  private updatePerfOverlay(delta: number): void {
    if (!this.perfText) {
      return;
    }

    this.rollingFrameMs = this.rollingFrameMs === 0 ? delta : this.rollingFrameMs * 0.92 + delta * 0.08;
    this.perfText.setText(
      `fps ${this.game.loop.actualFps.toFixed(1)} | frame ${this.rollingFrameMs.toFixed(1)}ms | ` +
        `vis ${this.lastVisibilityDeltaMs.toFixed(2)}ms | fog ${this.lastFogRedrawMs.toFixed(2)}ms ` +
        `dirty ${this.lastFogDirtyChunkCount}/${this.fogChunks.length} draws ${this.lastFogTileDrawCount}`,
    );
  }

  private setupScenarioStatusOverlay(): void {
    this.scenarioStatusText = this.addScreenOverlayText(
      this.scale.width / 2,
      18,
      "",
      {
        fontFamily: "Noto Sans KR, Malgun Gothic, Apple SD Gothic Neo, Trebuchet MS, sans-serif",
        fontSize: "16px",
        color: "#f1dfaa",
        backgroundColor: "#071112cc",
        padding: { x: 12, y: 7 },
        align: "center",
        wordWrap: { width: Math.min(this.scale.width - 48, 720) },
      },
      SCREEN_OVERLAY_DEPTH + 5,
    ).setOrigin(0.5, 0);
  }

  private setupCommandFeedbackOverlay(): void {
    this.commandFeedbackText = this.addScreenOverlayText(
      this.scale.width / 2,
      58,
      "",
      {
        fontFamily: "Noto Sans KR, Malgun Gothic, Apple SD Gothic Neo, Trebuchet MS, sans-serif",
        fontSize: "14px",
        color: "#ffd1c8",
        backgroundColor: "#190b09dd",
        padding: { x: 12, y: 7 },
        align: "center",
        wordWrap: { width: Math.min(this.scale.width - 48, 680) },
      },
      SCREEN_OVERLAY_DEPTH + 16,
    )
      .setOrigin(0.5, 0)
      .setVisible(false);
  }

  private showCommandFeedback(reason: string): void {
    this.playGameplayAudio(COMMAND_REJECTED_AUDIO_CUE_KEY);
    this.showTransientFeedback(`명령 실패: ${this.getCommandFeedbackMessage(reason)}`, "#ffd1c8", "#190b09dd");
  }

  private getActionFeedbackLabel(actionId: ActionDefinitionId): string {
    switch (actionId) {
      case "move":
        return "이동";
      case "gather":
        return "채집";
      case "rally-point":
        return "집결지";
      case "repair":
        return "수리";
      case "attack-move":
        return "공격 이동";
      case "patrol":
        return "순찰";
      default:
        return actionDefinitions[actionId].label;
    }
  }

  private showTransientFeedback(message: string, color = "#f1dfaa", backgroundColor = "#071112dd"): void {
    if (!this.commandFeedbackText) {
      return;
    }

    this.commandFeedbackText
      .setText(message)
      .setColor(color)
      .setBackgroundColor(backgroundColor)
      .setAlpha(1)
      .setVisible(true);
    this.commandFeedbackHideAt = this.time.now + COMMAND_FEEDBACK_DURATION_MS;
    this.layoutCommandFeedbackOverlay();
  }

  private showCheatFeedback(label: string): void {
    this.showTransientFeedback(`치트키 적용: ${label}`, "#dff6b2", "#0b2118dd");
  }

  private openCheatInput(): void {
    if (this.cheatInputElement || typeof document === "undefined") {
      return;
    }

    const input = document.createElement("input");
    input.type = "text";
    input.lang = "ko";
    input.spellcheck = false;
    input.autocomplete = "off";
    input.maxLength = CHEAT_INPUT_MAX_LENGTH;
    input.setAttribute("aria-label", "chat");
    Object.assign(input.style, {
      position: "fixed",
      left: "50%",
      bottom: "34px",
      transform: "translateX(-50%)",
      width: "min(420px, calc(100vw - 48px))",
      zIndex: "2147483647",
      boxSizing: "border-box",
      border: "1px solid rgba(233, 214, 157, 0.85)",
      borderRadius: "2px",
      background: "rgba(13, 17, 18, 0.92)",
      color: "#f2e7c1",
      outline: "none",
      padding: "8px 10px",
      font: "15px Noto Sans KR, Malgun Gothic, Apple SD Gothic Neo, sans-serif",
      boxShadow: "0 6px 18px rgba(0, 0, 0, 0.35)",
    });

    input.addEventListener("keydown", this.handleCheatInputKeyDown, true);
    document.body.append(input);
    this.cheatInputElement = input;
    input.focus();
  }

  private closeCheatInput(): void {
    const input = this.cheatInputElement;

    if (!input) {
      return;
    }

    input.removeEventListener("keydown", this.handleCheatInputKeyDown, true);
    input.remove();
    this.cheatInputElement = null;
  }

  private submitCheatCode(rawCode: string): void {
    const normalizedCode = rawCode.trim().replace(/\s+/g, "");

    if (!normalizedCode) {
      return;
    }

    const action = IMJINROK_CHEAT_CODES[normalizedCode];

    if (!action) {
      this.showTransientFeedback("치트키가 적용되지 않았습니다.", "#ffd1c8", "#190b09dd");
      return;
    }

    if (!this.sessionTransport || this.sessionTransport.isRemote) {
      this.showTransientFeedback("치트키는 싱글플레이에서만 사용할 수 있습니다.", "#ffd1c8", "#190b09dd");
      return;
    }

    if (this.worldState.scenario.status !== "running") {
      return;
    }

    switch (action.type) {
      case "simulation":
        this.applySimulationCheat(action.code, action.label);
        return;
      case "reveal-map":
        this.revealMapCheatActive = true;
        this.applyRevealMapCheat();
        this.showCheatFeedback(action.label);
        return;
      case "instant-victory":
        if (this.sessionTransport.forceScenarioResult("victory")) {
          this.syncWorldFromTransport(true);
          this.publishGamePlayback();
          this.showCheatFeedback(action.label);
        }
        return;
      case "unsupported":
        this.showTransientFeedback(`${action.label} 치트키는 현재 MVP 시스템이 없습니다.`, "#f1dfaa", "#071112dd");
        return;
    }
  }

  private applySimulationCheat(code: CheatCodeId, label: string): void {
    void this.issueCommandEnvelopeWithOptions(
      {
        sessionId: this.launchContext?.session?.id ?? "offline-skirmish",
        playerId: this.localPlayerId,
        issuedAtTick: this.worldState.tick,
        command: { type: "cheat", code },
      },
      { suppressFeedback: true },
    ).then((result) => {
      if (!result?.ok) {
        this.showCommandFeedback(result?.reason ?? "command request failed");
        return;
      }

      this.syncWorldFromTransport(true);
      this.updateEnvironmentOverlay(true);
      this.showCheatFeedback(label);
    });
  }

  private applyRevealMapCheat(): void {
    const dirtyFogChunkCount = this.refreshLocalVisibility();

    this.redrawDirtyFogOverlay(dirtyFogChunkCount);
    this.syncResourceRenderables();
    this.syncUnitRenderables();
    this.publishMinimapVisibility();
    this.publishMinimapEntities();
  }

  private updateCommandFeedbackOverlay(time: number): void {
    if (!this.commandFeedbackText || !this.commandFeedbackText.visible) {
      return;
    }

    const remainingMs = this.commandFeedbackHideAt - time;

    if (remainingMs <= 0) {
      this.commandFeedbackText.setVisible(false);
      this.layoutUnderAttackAlertOverlay();
      return;
    }

    this.commandFeedbackText.setAlpha(Phaser.Math.Clamp(remainingMs / 320, 0, 1));
  }

  private layoutCommandFeedbackOverlay(): void {
    this.commandFeedbackText
      ?.setWordWrapWidth(Math.min(this.scale.width - 48, 680))
      .setPosition(this.scale.width / 2, this.scenarioStatusText?.visible ? 64 : 18);
    this.layoutUnderAttackAlertOverlay();
  }

  private setupUnderAttackAlertOverlay(): void {
    this.underAttackText = this.addScreenOverlayText(
      this.scale.width / 2,
      96,
      "",
      {
        fontFamily: "Noto Sans KR, Malgun Gothic, Apple SD Gothic Neo, Trebuchet MS, sans-serif",
        fontSize: "15px",
        color: "#ffddd6",
        backgroundColor: "#2a0808df",
        padding: { x: 14, y: 8 },
        align: "center",
        wordWrap: { width: Math.min(this.scale.width - 48, 620) },
      },
      SCREEN_OVERLAY_DEPTH + 17,
    )
      .setOrigin(0.5, 0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true })
      .on("pointerup", () => this.focusUnderAttackAlert());
  }

  private showUnderAttackAlert(event: CombatEventState): void {
    if (!this.underAttackText) {
      return;
    }

    const now = this.time.now;

    if (now - this.lastUnderAttackAlertAt < UNDER_ATTACK_ALERT_COOLDOWN_MS && !event.killed) {
      return;
    }

    const targetCategory = unitDefinitions[event.targetKind].category;
    const message = event.killed
      ? targetCategory === "building"
        ? "건물이 파괴되었습니다"
        : "아군이 전사했습니다"
      : targetCategory === "building"
        ? "기지가 공격받고 있습니다"
        : "아군이 공격받고 있습니다";

    this.lastUnderAttackAlertAt = now;
    this.underAttackFocusPoint = this.getGridPointWorldPosition(event.targetPosition);
    this.playGameplayAudio(UNDER_ATTACK_AUDIO_CUE_KEY);
    this.underAttackText.setText(message).setAlpha(1).setVisible(true);
    this.underAttackHideAt = now + UNDER_ATTACK_ALERT_DURATION_MS;
    this.layoutUnderAttackAlertOverlay();
    this.game.events.emit(MINIMAP_ALERT_EVENT, {
      id: event.id,
      kind: "under-attack",
      severity: event.killed ? "critical" : "normal",
      position: { ...event.targetPosition },
    } satisfies MinimapAlertView);
    this.showUnderAttackMarker(event.targetPosition);
  }

  private updateUnderAttackAlertOverlay(time: number): void {
    if (!this.underAttackText || !this.underAttackText.visible) {
      return;
    }

    const remainingMs = this.underAttackHideAt - time;

    if (remainingMs <= 0) {
      this.underAttackText.setVisible(false);
      return;
    }

    this.underAttackText.setAlpha(Phaser.Math.Clamp(remainingMs / 420, 0, 1));
  }

  private layoutUnderAttackAlertOverlay(): void {
    if (!this.underAttackText) {
      return;
    }

    let y = 18;

    if (this.scenarioStatusText?.visible) {
      y = Math.max(y, this.scenarioStatusText.y + this.scenarioStatusText.displayHeight + 8);
    }

    if (this.commandFeedbackText?.visible) {
      y = Math.max(y, this.commandFeedbackText.y + this.commandFeedbackText.displayHeight + 8);
    }

    this.underAttackText.setWordWrapWidth(Math.min(this.scale.width - 48, 620)).setPosition(this.scale.width / 2, y);
  }

  private focusUnderAttackAlert(): void {
    if (!this.underAttackFocusPoint || this.isBlockingModalOpen()) {
      return;
    }

    this.centerCameraOnWorldPoint(this.underAttackFocusPoint);
    this.publishMinimapViewport(true);
  }

  private getCommandFeedbackMessage(reason: string): string {
    switch (reason) {
      case "scenario has ended":
        return "이미 종료된 게임입니다.";
      case "not enough resources":
        return "자원이 부족합니다.";
      case "player resource bank not found":
        return "플레이어 자원 정보를 찾을 수 없습니다.";
      case "population cap reached":
        return "인구 한도에 도달했습니다. 집을 더 지으세요.";
      case "production queue is full":
        return "생산 대기열이 가득 찼습니다.";
      case "building is researching":
        return "이 건물은 연구를 진행 중입니다.";
      case "production queue is busy":
        return "생산 대기열이 사용 중입니다.";
      case "research already in progress":
        return "이미 연구가 진행 중입니다.";
      case "research already completed":
        return "이미 완료된 연구입니다.";
      case "research cannot be performed here":
        return "이 건물에서는 해당 연구를 진행할 수 없습니다.";
      case "research definition not found":
        return "연구 정보를 찾을 수 없습니다.";
      case "research queue is full":
        return "연구 대기열이 가득 찼습니다.";
      case "queue is empty":
        return "취소할 대기열이 없습니다.";
      case "queue item not found":
        return "취소할 대기열 항목을 찾을 수 없습니다.";
      case "no room to train unit":
        return "유닛을 배치할 공간이 없습니다.";
      case "unit not found":
        return "유닛을 찾을 수 없습니다.";
      case "unit is not owned by player":
        return "내 유닛에만 명령할 수 있습니다.";
      case "unit cannot perform action":
        return "선택한 유닛은 이 명령을 수행할 수 없습니다.";
      case "unit cannot move":
        return "이 유닛은 이동할 수 없습니다.";
      case "unit cannot attack":
        return "이 유닛은 공격할 수 없습니다.";
      case "unit cannot be trained":
        return "훈련할 수 없는 유닛입니다.";
      case "unit cannot be trained here":
        return "이 건물에서는 해당 유닛을 훈련할 수 없습니다.";
      case "trainable unit definition not found":
        return "훈련 유닛 정보를 찾을 수 없습니다.";
      case "target is invalid":
        return "목표 지점이 올바르지 않습니다.";
      case "unit is not placeable":
        return "배치할 수 없는 유닛입니다.";
      case "build target is invalid":
        return "건설 지점이 올바르지 않습니다.";
      case "build target not visible":
        return "시야가 확보된 곳에만 건설할 수 있습니다.";
      case "building definition not found":
        return "건물 정보를 찾을 수 없습니다.";
      case "building footprint is invalid":
        return "건설 범위가 올바르지 않습니다.";
      case "building footprint is outside map":
        return "지도 밖에는 건설할 수 없습니다.";
      case "building footprint is occupied":
        return "건설 위치가 막혀 있습니다.";
      case "building footprint overlaps a resource":
        return "자원 위에는 건설할 수 없습니다.";
      case "cannot build on forest":
        return "숲에는 건설할 수 없습니다.";
      case "cannot build on water":
        return "깊은 물에는 건설할 수 없습니다.";
      case "cannot build on shallowWater":
        return "얕은 물에는 건설할 수 없습니다.";
      case "cannot build on cliff":
        return "절벽에는 건설할 수 없습니다.";
      case "no path to build site":
        return "건설 위치까지 갈 수 없습니다.";
      case "no path to repair target":
        return "수리 대상까지 이동할 수 없습니다.";
      case "no path to target":
        return "목표 지점까지 이동할 수 없습니다.";
      case "no path to resource":
        return "자원까지 이동할 수 없습니다.";
      case "resource node not found":
        return "채집할 자원을 찾을 수 없습니다.";
      case "resource node not visible":
        return "현재 시야에 들어온 자원만 채집할 수 있습니다.";
      case "resource node is not harvestable":
        return "채집할 수 없는 자원입니다.";
      case "resource gather capacity is full":
        return "더 이상 자원을 실을 수 없습니다.";
      case "unit is under construction":
        return "아직 완성되지 않은 건물입니다.";
      case "unit is not a building":
        return "건물이 아닙니다.";
      case "unit is not under construction":
        return "건설 중인 건물이 아닙니다.";
      case "cannot attack friendly unit":
        return "아군은 공격할 수 없습니다.";
      case "attack target not found":
        return "공격 대상을 찾을 수 없습니다.";
      case "repair target not found":
        return "수리 대상을 찾을 수 없습니다.";
      case "repair target is already at full health":
        return "이미 완전히 수리된 대상입니다.";
      case "repair target is not a building":
        return "현재는 건물만 수리할 수 있습니다.";
      case "cannot repair enemy unit":
        return "적 유닛은 수리할 수 없습니다.";
      case "idle worker not found":
        return "유휴 작업자가 없습니다.";
      case "combat unit not found":
        return "선택할 전투 유닛이 없습니다.";
      case "rally target is invalid":
        return "집결 지점이 올바르지 않습니다.";
      case "rally resource node not found":
        return "집결지로 지정할 자원을 찾을 수 없습니다.";
      case "command request failed":
        return "명령 전송에 실패했습니다.";
      default:
        return reason;
    }
  }

  private getMissionDialogueLineDurationMs(line: ScenarioBriefingLineDefinition): number {
    return getMissionLineDurationMs(line, MISSION_DIALOGUE_LINE_DURATION_MS);
  }

  private updateMissionDialogueOverlay(time: number): void {
    if (this.missionResultContainer) {
      this.clearMissionDialogueOverlay();
      return;
    }

    if (this.isMissionPresentationPaused()) {
      this.pauseMissionDialogueTimer(time);
      return;
    }

    this.resumeMissionDialogueTimer(time);

    if (this.activeMissionDialogue) {
      this.advanceActiveMissionDialogue(time);
      return;
    }

    const dialogue = this.findNextTriggeredMissionDialogue();
    const firstLine = dialogue?.lines[0];

    if (!dialogue || !firstLine) {
      return;
    }

    this.triggeredMissionDialogueIds.add(dialogue.id);
    this.activeMissionDialogue = {
      dialogue,
      lineIndex: 0,
      nextLineAt: time + this.getMissionDialogueLineDurationMs(firstLine),
    };
    this.beginMissionDialoguePlaybackPause();
    this.focusMissionDialogueCamera(dialogue);
    this.showMissionDialogueLine(dialogue, firstLine, 0);
  }

  private isMissionPresentationPaused(): boolean {
    const playback = this.sessionTransport?.getPlaybackState();
    const ownsPlaybackPause = Boolean(this.missionDialoguePauseOwnership?.ownsPlaybackPause);

    return isPresentationExternallyPaused(
      Boolean(this.worldState.scenario.status === "running" && playback?.paused),
      ownsPlaybackPause,
      Boolean(this.pauseMenuContainer),
    );
  }

  private pauseMissionDialogueTimer(time: number): void {
    if (!this.activeMissionDialogue || this.missionDialoguePausedAt !== null) {
      return;
    }

    this.missionDialoguePausedAt = time;
  }

  private resumeMissionDialogueTimer(time: number): void {
    if (this.missionDialoguePausedAt === null) {
      return;
    }

    const pausedDuration = Math.max(0, time - this.missionDialoguePausedAt);

    if (this.activeMissionDialogue) {
      this.activeMissionDialogue.nextLineAt += pausedDuration;
    }

    this.missionDialoguePausedAt = null;
  }

  private advanceActiveMissionDialogue(time: number): void {
    const active = this.activeMissionDialogue;

    if (!active) {
      return;
    }

    const line = active.dialogue.lines[active.lineIndex];

    if (!line) {
      this.clearMissionDialogueOverlay();
      return;
    }

    if (!this.missionDialogueContainer) {
      this.showMissionDialogueLine(active.dialogue, line, active.lineIndex);
    }

    if (time < active.nextLineAt) {
      return;
    }

    this.advanceMissionDialogueLine(time);
  }

  private advanceMissionDialogueLine(time = this.time.now): void {
    const active = this.activeMissionDialogue;

    if (!active) {
      return;
    }

    if (getMissionDialogueClickAction(active.lineIndex, active.dialogue.lines.length) === "finish-dialogue") {
      const completedDialogue = active.dialogue;

      this.clearMissionDialogueOverlay();
      this.completeScenarioAfterMissionDialogue(completedDialogue);
      return;
    }

    active.lineIndex += 1;

    const nextLine = active.dialogue.lines[active.lineIndex];

    if (!nextLine) {
      throw new Error("Mission dialogue timeline advanced beyond its declared line count.");
    }

    active.nextLineAt = time + this.getMissionDialogueLineDurationMs(nextLine);
    this.showMissionDialogueLine(active.dialogue, nextLine, active.lineIndex);
  }

  private findNextTriggeredMissionDialogue(): ScenarioMissionDialogueDefinition | null {
    for (const dialogue of this.launchContext?.scenario?.missionDialogues ?? []) {
      if (this.triggeredMissionDialogueIds.has(dialogue.id)) {
        continue;
      }

      if (this.isMissionDialogueTriggerMet(dialogue)) {
        return dialogue;
      }
    }

    return null;
  }

  private isMissionDialogueTriggerMet(dialogue: ScenarioMissionDialogueDefinition): boolean {
    switch (dialogue.trigger.type) {
      case "tick":
        return this.worldState.tick >= dialogue.trigger.tick;
      case "objective-status":
        return this.worldState.scenario.objectives[dialogue.trigger.objectiveId]?.status === dialogue.trigger.status;
      case "scenario-status":
        return this.worldState.scenario.status === dialogue.trigger.status;
      case "unit-in-area":
        return this.countMatchingUnitsForDialogueTrigger(dialogue.trigger) >= Math.max(1, dialogue.trigger.count ?? 1);
    }
  }

  private restoreTriggeredMissionDialogues(triggeredIds: readonly string[] | undefined): void {
    this.clearMissionDialogueOverlay();
    this.triggeredMissionDialogueIds.clear();

    if (triggeredIds) {
      triggeredIds.forEach((id) => this.triggeredMissionDialogueIds.add(id));
      return;
    }

    for (const dialogue of this.launchContext?.scenario?.missionDialogues ?? []) {
      if (this.wasMissionDialogueTriggerAlreadyPassed(dialogue)) {
        this.triggeredMissionDialogueIds.add(dialogue.id);
      }
    }
  }

  private serializeActiveMissionDialogue(): SerializedMissionDialogueState | undefined {
    if (!this.activeMissionDialogue) {
      return undefined;
    }

    return {
      dialogueId: this.activeMissionDialogue.dialogue.id,
      lineIndex: this.activeMissionDialogue.lineIndex,
    };
  }

  private restoreActiveMissionDialogue(savedDialogue: SerializedMissionDialogueState | undefined): void {
    if (!savedDialogue) {
      return;
    }

    const dialogue = this.launchContext?.scenario?.missionDialogues?.find((candidate) => candidate.id === savedDialogue.dialogueId);
    const lineIndex = Phaser.Math.Clamp(savedDialogue.lineIndex, 0, Math.max(0, (dialogue?.lines.length ?? 1) - 1));
    const line = dialogue?.lines[lineIndex];

    if (!dialogue || !line) {
      return;
    }

    this.triggeredMissionDialogueIds.add(dialogue.id);
    this.activeMissionDialogue = {
      dialogue,
      lineIndex,
      nextLineAt: this.time.now + this.getMissionDialogueLineDurationMs(line),
    };
    this.beginMissionDialoguePlaybackPause();
    this.focusMissionDialogueCamera(dialogue);
    this.showMissionDialogueLine(dialogue, line, lineIndex);
  }

  private wasMissionDialogueTriggerAlreadyPassed(dialogue: ScenarioMissionDialogueDefinition): boolean {
    switch (dialogue.trigger.type) {
      case "tick":
        return this.worldState.tick >= dialogue.trigger.tick;
      case "objective-status": {
        const objective = this.worldState.scenario.objectives[dialogue.trigger.objectiveId];

        if (!objective || objective.status !== dialogue.trigger.status) {
          return false;
        }

        return dialogue.trigger.status === "completed"
          ? objective.completedAtTick !== undefined
          : objective.failedAtTick !== undefined;
      }
      case "scenario-status":
        return this.worldState.scenario.status === dialogue.trigger.status && this.worldState.scenario.endedAtTick !== undefined;
      case "unit-in-area":
        return false;
    }
  }

  private countMatchingUnitsForDialogueTrigger(
    trigger: Extract<ScenarioMissionDialogueDefinition["trigger"], { type: "unit-in-area" }>,
  ): number {
    const playerId = trigger.playerId ?? Object.keys(this.worldState.players)[0];

    if (!playerId) {
      return 0;
    }

    return Object.values(this.worldState.units).filter((unit) =>
      unit.playerId === playerId &&
      unit.kind === trigger.targetKind &&
      !unit.construction &&
      this.isPointInArea(unit.position, trigger.area),
    ).length;
  }

  private focusMissionDialogueCamera(dialogue: ScenarioMissionDialogueDefinition): void {
    if (!dialogue.focusPoint) {
      return;
    }

    this.centerCameraOnGridPoint(dialogue.focusPoint);
  }

  private isPointInArea(point: GridPoint, area: { x: number; y: number; width: number; height: number }): boolean {
    return point.x >= area.x && point.x < area.x + area.width && point.y >= area.y && point.y < area.y + area.height;
  }

  private showMissionDialogueLine(
    dialogue: ScenarioMissionDialogueDefinition,
    line: ScenarioBriefingLineDefinition,
    lineIndex: number,
  ): void {
    this.hideMissionDialogueOverlay();

    const width = this.scale.width;
    const height = this.scale.height;
    const container = this.addScreenOverlayContainer(SCREEN_OVERLAY_DEPTH + 18);

    this.addOriginalSpeechPresentation(
      container,
      dialogue.lines,
      line,
      lineIndex,
      width,
      height,
    );
    container.add(
      this.add
        .zone(0, 0, width, height)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true })
        .on(
          "pointerdown",
          (
            pointer: Phaser.Input.Pointer,
            _localX: number,
            _localY: number,
            event: Phaser.Types.Input.EventData,
          ) => {
            this.missionDialogueConsumedPointerId = pointer.id;
            event.stopPropagation();
          },
        )
        .on(
          "pointerup",
          (
            pointer: Phaser.Input.Pointer,
            _localX: number,
            _localY: number,
            event: Phaser.Types.Input.EventData,
          ) => {
            event.stopPropagation();
            this.advanceMissionDialogueLineFromPointer(pointer);
          },
        ),
    );

    container.setAlpha(0);
    this.tweens.add({
      targets: container,
      alpha: 1,
      duration: 120,
      ease: "Sine.easeOut",
    });

    this.missionDialogueContainer = container;
    this.playMissionLineVoice(line);
    this.refreshScreenOverlayCameraOrder();
  }

  private addOriginalSpeechPresentation(
    container: Phaser.GameObjects.Container,
    lines: readonly ScenarioBriefingLineDefinition[],
    activeLine: ScenarioBriefingLineDefinition,
    lineIndex: number,
    viewportWidth: number,
    viewportHeight: number,
  ): void {
    const activeSlot = getOriginalSpeechSlot(activeLine);
    const participants = this.getOriginalSpeechParticipants(lines, lineIndex);

    for (const participant of participants) {
      const portraitKey = `${participant.speechSlot}:${normalizeMissionPortraitId(participant.portraitId)}`;
      const isNewPortrait = !this.introducedMissionPortraitKeys.has(portraitKey);

      this.introducedMissionPortraitKeys.add(portraitKey);
      this.addOriginalSpeechPortrait(
        container,
        participant,
        participant.speechSlot === activeSlot,
        viewportWidth,
        viewportHeight,
        isNewPortrait,
      );
    }

    const layout = resolveOriginalSpeechLayout(
      viewportWidth,
      viewportHeight,
      activeSlot,
    );
    const fontSize = Math.max(1, Math.round(16 * layout.scale));
    const lineSpacing = Math.max(0, Math.round(4 * layout.scale));

    container.add(
      this.add
        .text(layout.text.x, layout.text.centerY, activeLine.text, {
          fontFamily: "Noto Sans KR, Malgun Gothic, Apple SD Gothic Neo, sans-serif",
          fontSize: String(fontSize) + "px",
          color: "#ffffff",
          lineSpacing,
          stroke: "#000000",
          strokeThickness: Math.max(2, Math.round(2 * layout.scale)),
          wordWrap: { width: layout.text.maxWidth },
        })
        .setOrigin(0, 0.5),
    );
  }

  private addOriginalSpeechPortrait(
    container: Phaser.GameObjects.Container,
    participant: MissionDialogueParticipant,
    active: boolean,
    viewportWidth: number,
    viewportHeight: number,
    animateIntroduction: boolean,
  ): void {
    const cue = this.getMissionPortraitImageCue(participant.portraitId);

    if (!cue) {
      return;
    }

    this.textures.get(cue.key).setFilter(Phaser.Textures.FilterMode.NEAREST);

    const { portrait } = resolveOriginalSpeechLayout(
      viewportWidth,
      viewportHeight,
      participant.speechSlot,
    );
    const targetScale = portrait.width / 130;
    const image = this.add
      .image(
        portrait.x + portrait.width / 2,
        portrait.y + portrait.height / 2,
        cue.key,
      )
      .setScale(animateIntroduction ? 0 : targetScale);

    if (!active) {
      image.setTint(0x534668);
    }

    container.add(image);

    if (animateIntroduction) {
      this.tweens.add({
        targets: image,
        scaleX: targetScale,
        scaleY: targetScale,
        duration: 240,
        ease: "Cubic.easeOut",
      });
    }
  }

  private getMissionPortraitImageCue(portraitId: string): MissionPortraitImageDefinition | null {
    const cue = MISSION_PORTRAIT_IMAGE_CUE_BY_ID.get(normalizeMissionPortraitId(portraitId));

    return cue && this.textures.exists(cue.key) ? cue : null;
  }

  private getOriginalSpeechParticipants(
    lines: readonly ScenarioBriefingLineDefinition[],
    lineIndex: number,
  ): MissionDialogueParticipant[] {
    const bySlot = new Map<OriginalSpeechSlot, MissionDialogueParticipant>();
    const lastIncludedIndex = Math.min(lineIndex, lines.length - 1);

    for (let index = 0; index <= lastIncludedIndex; index += 1) {
      const line = lines[index];

      if (!line) {
        continue;
      }

      const speechSlot = getOriginalSpeechSlot(line);
      bySlot.set(speechSlot, {
        portraitId: line.portraitId,
        speechSlot,
      });
    }

    return [...bySlot.values()].sort((left, right) => left.speechSlot - right.speechSlot);
  }

  private redrawMissionDialogueOverlay(): void {
    const active = this.activeMissionDialogue;

    if (!active) {
      return;
    }

    const line = active.dialogue.lines[active.lineIndex];

    if (!line) {
      this.clearMissionDialogueOverlay();
      return;
    }

    this.showMissionDialogueLine(active.dialogue, line, active.lineIndex);
  }

  private hideMissionDialogueOverlay(): void {
    this.missionDialogueContainer?.destroy(true);
    this.missionDialogueContainer = null;
    this.stopMissionVoiceAudio();
  }

  private advanceMissionDialogueLineFromPointer(pointer: Phaser.Input.Pointer): void {
    const active = this.activeMissionDialogue;

    if (!active || !getMissionDialoguePointerAdvance(active.lineIndex, active.dialogue.lines.length).consumesWorldInput) {
      return;
    }

    this.missionDialogueConsumedPointerId = pointer.id;
    this.advanceMissionDialogueLine();
  }

  private clearMissionDialogueOverlay(): void {
    const shouldResumePlayback = shouldResumePresentationPlayback(this.missionDialoguePauseOwnership);

    this.activeMissionDialogue = null;
    this.missionDialoguePausedAt = null;
    this.missionDialoguePauseOwnership = null;
    this.introducedMissionPortraitKeys.clear();
    this.hideMissionDialogueOverlay();

    if (shouldResumePlayback && this.worldState.scenario.status === "running") {
      this.setPlaybackPaused(false);
    }
  }

  private beginMissionDialoguePlaybackPause(): void {
    if (this.missionDialoguePauseOwnership) {
      return;
    }

    this.missionDialoguePauseOwnership = this.acquirePresentationPlaybackPause();
  }

  private acquirePresentationPlaybackPause(): PresentationPauseOwnership {
    const playbackWasPaused = Boolean(this.sessionTransport?.getPlaybackState()?.paused);
    const pausedByPresentation = !playbackWasPaused && this.setPlaybackPaused(true);

    return beginPresentationPause(playbackWasPaused || !pausedByPresentation);
  }

  private completeScenarioAfterMissionDialogue(dialogue: ScenarioMissionDialogueDefinition): void {
    const status = dialogue.completeScenarioOnEnd;

    if (!status || !this.sessionTransport || this.sessionTransport.isRemote || this.worldState.scenario.status !== "running") {
      return;
    }

    if (this.sessionTransport.forceScenarioResult(status)) {
      this.syncWorldFromTransport(true);
      this.publishGamePlayback();
    }
  }

  private updateMissionResultOverlay(): void {
    const status = this.worldState.scenario.status;

    if (status === "running") {
      this.hideMissionResultOverlay();
      this.missionResultAudioStatus = null;
      return;
    }

    if (this.missionResultContainer) {
      return;
    }

    if (this.activeMissionDialogue || this.hasPendingTriggeredMissionDialogue()) {
      return;
    }

    if (status === "victory") {
      this.recordCampaignVictory();
    }

    this.clearMissionDialogueOverlay();
    this.hidePauseMenu(false);
    this.playMissionResultAudio(status);
    this.missionResultContainer = this.createMissionResultOverlay(status);
  }

  private playMissionResultAudio(status: "victory" | "defeat"): void {
    if (this.missionResultAudioStatus === status) {
      return;
    }

    this.missionResultAudioStatus = status;
    this.playGameplayAudio(status === "victory" ? MISSION_VICTORY_AUDIO_CUE_KEY : MISSION_DEFEAT_AUDIO_CUE_KEY);
  }

  private hasPendingTriggeredMissionDialogue(): boolean {
    const dialogue = this.findNextTriggeredMissionDialogue();

    return Boolean(dialogue?.lines[0]);
  }

  private togglePauseMenu(): void {
    if (this.worldState.scenario.status !== "running" || this.missionResultContainer) {
      return;
    }

    if (this.pauseMenuContainer) {
      this.hidePauseMenu(true);
      return;
    }

    this.showPauseMenu();
  }

  private showPauseMenu(): void {
    if (this.pauseMenuContainer) {
      return;
    }

    this.cancelDragSelection();
    this.cancelBuildPlacement();
    this.cancelPendingTargetAction();
    this.releasePointerLock();
    this.setPlaybackPaused(true);
    this.pauseMenuContainer = this.createPauseMenuOverlay();
  }

  private createPauseMenuOverlay(): Phaser.GameObjects.Container {
    const width = this.scale.width;
    const height = this.scale.height;
    const panelWidth = Phaser.Math.Clamp(width * 0.34, 360, 500);
    const panelHeight = 414;
    const panelX = (width - panelWidth) / 2;
    const panelY = Math.max(72, (height - panelHeight) / 2 - 30);
    const scenarioName = this.launchContext?.scenario?.name ?? this.worldState.scenario.id;
    const container = this.addScreenOverlayContainer(SCREEN_OVERLAY_DEPTH + 28);
    const graphics = this.add.graphics();

    graphics
      .fillStyle(0x020708, 0.52)
      .fillRect(0, 0, width, height)
      .fillStyle(0x071112, 0.96)
      .fillRoundedRect(panelX, panelY, panelWidth, panelHeight, 8)
      .lineStyle(2, 0xd0b46a, 0.86)
      .strokeRoundedRect(panelX, panelY, panelWidth, panelHeight, 8)
      .lineStyle(1, 0x315158, 0.9)
      .lineBetween(panelX + 26, panelY + 76, panelX + panelWidth - 26, panelY + 76);

    container.add(graphics);
    container.add(
      this.add.text(panelX + panelWidth / 2, panelY + 24, "일시정지", {
        fontFamily: "Georgia, Times New Roman, serif",
        fontSize: "32px",
        color: "#f1dfaa",
      }).setOrigin(0.5, 0),
    );
    container.add(
      this.add.text(panelX + panelWidth / 2, panelY + 86, scenarioName, {
        fontFamily: "Noto Sans KR, Malgun Gothic, Apple SD Gothic Neo, Trebuchet MS, sans-serif",
        fontSize: "15px",
        color: "#cfe0d4",
        wordWrap: { width: panelWidth - 60 },
        align: "center",
      }).setOrigin(0.5, 0),
    );

    const buttonWidth = 180;
    const buttonX = panelX + (panelWidth - buttonWidth) / 2;

    this.pauseMenuMessageText = this.add
      .text(panelX + panelWidth / 2, panelY + 112, this.getQuickSaveSummaryText(), {
        fontFamily: "Noto Sans KR, Malgun Gothic, Apple SD Gothic Neo, Trebuchet MS, sans-serif",
        fontSize: "11px",
        color: "#8fb4a2",
        align: "center",
        wordWrap: { width: panelWidth - 48 },
      })
      .setOrigin(0.5, 0);
    container.add(this.pauseMenuMessageText);

    const buttons = [
      { label: "계속하기", onClick: () => this.hidePauseMenu(true) },
      { label: "빠른 저장", onClick: () => this.quickSaveGame() },
      { label: "빠른 불러오기", onClick: () => this.quickLoadGame() },
      { label: "항복", onClick: () => this.surrenderMission() },
      { label: "다시 시작", onClick: () => this.restartMission() },
      { label: "메인 메뉴", onClick: () => this.returnToMainMenu() },
    ];

    buttons.forEach((button, index) => {
      this.addResultButton(container, buttonX, panelY + 140 + index * 42, buttonWidth, button.label, button.onClick);
    });

    return container;
  }

  private redrawPauseMenuOverlay(): void {
    if (!this.pauseMenuContainer) {
      return;
    }

    const message = this.pauseMenuMessageText?.text;

    this.pauseMenuContainer.destroy(true);
    this.pauseMenuContainer = null;
    this.pauseMenuMessageText = null;
    this.pauseMenuContainer = this.createPauseMenuOverlay();

    if (message) {
      this.showPauseMenuMessage(message);
    }
  }

  private hidePauseMenu(resumePlayback: boolean): void {
    if (!this.pauseMenuContainer) {
      return;
    }

    this.pauseMenuContainer.destroy(true);
    this.pauseMenuContainer = null;
    this.pauseMenuMessageText = null;

    if (resumePlayback && this.worldState.scenario.status === "running" && !this.presentationOwnsPlaybackPause()) {
      this.setPlaybackPaused(false);
    }
  }

  private presentationOwnsPlaybackPause(): boolean {
    return Boolean(this.missionDialoguePauseOwnership?.ownsPlaybackPause);
  }

  private quickSaveGame(): void {
    if (!this.sessionTransport || this.sessionTransport.isRemote) {
      this.showQuickSaveFeedback("로컬 싱글플레이에서만 저장할 수 있습니다.", false);
      return;
    }

    const activeMissionDialogue = this.serializeActiveMissionDialogue();
    const payload: QuickSavePayload = {
      version: QUICK_SAVE_VERSION,
      contextKey: this.getQuickSaveContextKey(),
      savedAt: new Date().toISOString(),
      launchContext: this.createQuickSaveLaunchContext(),
      snapshot: toWorldSnapshot(this.worldState),
      playerVisibility: serializePlayerVisibilityState(this.playerVisibility),
      controlGroups: this.serializeControlGroups(),
      knownResources: this.serializeKnownResourceViews(),
      ...(activeMissionDialogue ? { activeMissionDialogue } : {}),
      triggeredMissionDialogueIds: [...this.triggeredMissionDialogueIds],
    };

    try {
      globalThis.localStorage?.setItem(this.getQuickSaveStorageKey(), JSON.stringify(payload));
      globalThis.localStorage?.setItem(LATEST_QUICK_SAVE_STORAGE_KEY, JSON.stringify(payload));
      this.showQuickSaveFeedback("저장 완료", true);
    } catch {
      this.showQuickSaveFeedback("저장 실패: 브라우저 저장 공간을 사용할 수 없습니다.", false);
    }
  }

  private surrenderMission(): void {
    if (!this.sessionTransport || this.sessionTransport.isRemote) {
      this.showQuickSaveFeedback("로컬 싱글플레이에서만 항복할 수 있습니다.", false);
      return;
    }

    if (!this.sessionTransport.forceScenarioResult("defeat")) {
      this.showQuickSaveFeedback("이미 종료된 전투입니다.", false);
      return;
    }

    this.syncWorldFromTransport(true);
    this.publishGamePlayback();
  }

  private quickLoadGame(): void {
    if (!this.sessionTransport || this.sessionTransport.isRemote) {
      this.showQuickSaveFeedback("로컬 싱글플레이에서만 불러올 수 있습니다.", false);
      return;
    }

    const payload = this.readQuickSavePayload();

    if (!payload) {
      this.showQuickSaveFeedback("현재 미션/맵에 맞는 저장 데이터가 없습니다.", false);
      return;
    }

    if (!this.sessionTransport.replaceSnapshot(payload.snapshot, this.launchContext?.scenario)) {
      this.showQuickSaveFeedback("불러오기에 실패했습니다.", false);
      return;
    }

    this.resetClientStateForLoadedSnapshot(this.sessionTransport.getSnapshot(), payload.playerVisibility, payload.knownResources);
    this.restoreControlGroups(payload.controlGroups);
    this.syncWorldFromTransport(true);
    this.restoreTriggeredMissionDialogues(payload.triggeredMissionDialogueIds);
    this.restoreActiveMissionDialogue(payload.activeMissionDialogue);
    this.setPlaybackPaused(true);
    this.showQuickSaveFeedback("불러오기 완료", true);
  }

  private resetClientStateForLoadedSnapshot(
    snapshot: WorldState,
    savedVisibility: SerializedPlayerVisibilityState | undefined,
    savedKnownResources: SerializedKnownResourceView[] | undefined,
  ): void {
    this.cancelDragSelection();
    this.cancelBuildPlacement();
    this.cancelPendingTargetAction();
    this.stopGameplayAudio();
    this.hideMissionResultOverlay();
    this.missionResultAudioStatus = null;
    this.recordedCampaignVictoryScenarioId = null;
    this.selectedUnitIds.clear();
    this.controlGroups.clear();
    this.lastControlGroupRecall = null;
    this.lastUnitSelectionClick = null;
    this.lastIdleWorkerUnitId = null;
    this.processedCombatEventIds.clear();
    snapshot.combatEvents.forEach((event) => this.processedCombatEventIds.add(event.id));
    this.combatEffectGraphics.forEach((graphics) => graphics.destroy());
    this.combatEffectGraphics.clear();
    this.underAttackText?.setVisible(false);
    this.underAttackHideAt = 0;
    this.underAttackFocusPoint = null;
    this.objectiveTrackerSignature = "";
    this.worldState = snapshot;
    this.lastSyncedTick = snapshot.tick;
    this.map = snapshot.map;
    this.revealMapCheatActive = false;
    this.syncConstructionAudioState(false);
    this.syncProgressAudioState(false);
    this.playerVisibility = this.resolveLaunchPlayerVisibility(savedVisibility, snapshot.map);
    this.restoreKnownResourceViews(savedKnownResources);
    this.configureFogChunkGrid();
    this.redrawAllFogOverlay();
  }

  private markCurrentCombatEventsProcessed(): void {
    this.processedCombatEventIds.clear();
    this.worldState.combatEvents.forEach((event) => this.processedCombatEventIds.add(event.id));
  }

  private getQuickSaveSummaryText(): string {
    const payload = this.readQuickSavePayload();

    if (!payload) {
      return "저장 데이터 없음";
    }

    return `저장됨: ${this.formatQuickSaveTime(payload.savedAt)}`;
  }

  private showPauseMenuMessage(message: string): void {
    this.pauseMenuMessageText?.setText(message);
  }

  private showQuickSaveFeedback(message: string, ok: boolean): void {
    this.showPauseMenuMessage(message);

    if (this.pauseMenuContainer) {
      return;
    }

    this.showTransientFeedback(message, ok ? "#d8e4d7" : "#ffd1c8", ok ? "#071112dd" : "#190b09dd");
  }

  private readQuickSavePayload(): QuickSavePayload | null {
    try {
      const rawPayload = globalThis.localStorage?.getItem(this.getQuickSaveStorageKey());

      if (!rawPayload) {
        return null;
      }

      const payload = JSON.parse(rawPayload) as Partial<QuickSavePayload>;

      const snapshot = normalizeSavedWorldSnapshot(payload.snapshot);
      const activeMissionDialogue = normalizeOptionalMissionDialogueState(payload.activeMissionDialogue);
      const controlGroups = payload.controlGroups === undefined
        ? undefined
        : normalizeSerializedControlGroups(payload.controlGroups);
      const knownResources = payload.knownResources === undefined
        ? undefined
        : normalizeSerializedKnownResources(payload.knownResources);

      if (
        !isSupportedQuickSaveVersion(payload.version) ||
        payload.contextKey !== this.getQuickSaveContextKey() ||
        !snapshot ||
        !payload.savedAt ||
        !payload.launchContext ||
        activeMissionDialogue === null ||
        (payload.playerVisibility !== undefined && !deserializePlayerVisibilityState(payload.playerVisibility)) ||
        (payload.controlGroups !== undefined && !controlGroups) ||
        (payload.knownResources !== undefined && !knownResources) ||
        !isOptionalStringArray(payload.triggeredMissionDialogueIds)
      ) {
        return null;
      }

      return {
        ...payload,
        snapshot,
        ...(activeMissionDialogue ? { activeMissionDialogue } : {}),
        ...(controlGroups ? { controlGroups } : {}),
        ...(knownResources ? { knownResources } : {}),
      } as QuickSavePayload;
    } catch {
      return null;
    }
  }

  private getQuickSaveStorageKey(): string {
    return `isorts.quickSave.${this.getQuickSaveContextKey()}`;
  }

  private createQuickSaveLaunchContext(): GameLaunchContext {
    const context: GameLaunchContext = this.launchContext
      ? { ...this.launchContext }
      : {
          entryMode: "singleplayer",
          connectionMode: "local",
          scenarioType: "skirmish",
          session: null,
          serverOnline: false,
        };

    delete context.resumeSnapshot;
    delete context.resumePlayerVisibility;
    delete context.resumeControlGroups;
    delete context.resumeKnownResources;
    delete context.resumeMissionDialogue;

    const restartMapDefinition =
      context.mapDefinition ??
      createMapDefinitionFromId(context.mapId ?? this.map.id, { randomSize: this.map.width }) ??
      this.map;

    return {
      ...context,
      entryMode: "singleplayer",
      connectionMode: "local",
      session: null,
      serverOnline: false,
      mapId: restartMapDefinition.id,
      mapDefinition: restartMapDefinition,
      playerIds: Object.keys(this.worldState.players),
      playerTeams: this.createPlayerTeamsFromWorld(),
      triggeredMissionDialogueIds: [...this.triggeredMissionDialogueIds],
    };
  }

  private createPlayerTeamsFromWorld(): Record<string, string> {
    const teams: Record<string, string> = {};

    for (const [playerId, player] of Object.entries(this.worldState.players)) {
      teams[playerId] = player.teamId ?? playerId;
    }

    return teams;
  }

  private getQuickSaveContextKey(): string {
    const scenarioId = this.launchContext?.scenario?.id ?? this.worldState.scenario.id;
    const mapId = this.map.id;
    const players = Object.keys(this.worldState.players).join(",");
    const teams = Object.entries(this.worldState.players)
      .map(([playerId, player]) => `${playerId}:${player.teamId ?? playerId}`)
      .join(",");
    const aiDifficulty = this.launchContext?.aiDifficulty ?? "normal";

    return `${this.launchContext?.scenarioType ?? "skirmish"}:${scenarioId}:${mapId}:${players}:${teams}:${aiDifficulty}`;
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

  private recordCampaignVictory(): void {
    const scenarioId = this.launchContext?.scenario?.id ?? this.worldState.scenario.id;

    if (this.recordedCampaignVictoryScenarioId === scenarioId) {
      return;
    }

    if (!imjinrokCampaignScenarios.some((scenario) => scenario.id === scenarioId)) {
      return;
    }

    this.recordedCampaignVictoryScenarioId = scenarioId;

    try {
      const rawProgress = globalThis.localStorage?.getItem(IMJINROK_CAMPAIGN_PROGRESS_STORAGE_KEY);
      const progress = normalizeCampaignProgressState(rawProgress ? JSON.parse(rawProgress) : null, imjinrokCampaignScenarios);
      const updatedProgress = markCampaignScenarioCompleted(
        progress,
        imjinrokCampaignScenarios,
        scenarioId,
        new Date().toISOString(),
      );

      globalThis.localStorage?.setItem(IMJINROK_CAMPAIGN_PROGRESS_STORAGE_KEY, JSON.stringify(updatedProgress));
    } catch {
      // Campaign progress is a convenience; mission results should still display if storage is unavailable.
    }
  }

  private createMissionResultOverlay(status: "victory" | "defeat"): Phaser.GameObjects.Container {
    const width = this.scale.width;
    const height = this.scale.height;
    const panelWidth = Phaser.Math.Clamp(width * 0.5, 460, 660);
    const nextCampaignContext = status === "victory" ? this.createNextCampaignMissionContext() : null;
    const hasSourceLogo = this.hasMissionResultLogo(status);
    const panelHeight = nextCampaignContext ? 420 : 384;
    const panelX = (width - panelWidth) / 2;
    const panelY = Math.max(76, (height - panelHeight) / 2 - 40);
    const resultColor = status === "victory" ? 0xbfff8f : 0xff9b86;
    const resultTitle = status === "victory" ? "승리" : "패배";
    const scenarioName = this.launchContext?.scenario?.name ?? this.worldState.scenario.id;
    const objectiveLines = this.getScenarioUiObjectives()
      .map((objective) => `${objective.status === "completed" ? "완료" : objective.status === "failed" ? "실패" : "미완료"}: ${objective.label}`);
    const resultSummaryLines = this.getMissionResultSummaryLines();

    const container = this.addScreenOverlayContainer(SCREEN_OVERLAY_DEPTH + 30);
    const hasSourceBackdrop = this.addMissionResultBackdrop(container, width, height);
    const graphics = this.add.graphics();

    graphics
      .fillStyle(0x020708, hasSourceBackdrop ? 0.28 : 0.58)
      .fillRect(0, 0, width, height)
      .fillStyle(0x071112, 0.96)
      .fillRoundedRect(panelX, panelY, panelWidth, panelHeight, 8)
      .lineStyle(2, resultColor, 0.85)
      .strokeRoundedRect(panelX, panelY, panelWidth, panelHeight, 8)
      .lineStyle(1, 0xd0b46a, 0.55)
      .lineBetween(panelX + 26, panelY + 138, panelX + panelWidth - 26, panelY + 138);

    container.add(graphics);

    if (!hasSourceLogo || !this.addMissionResultLogo(container, status, panelX + panelWidth / 2, panelY + 68, Math.min(250, panelWidth - 80))) {
      container.add(
        this.add.text(panelX + panelWidth / 2, panelY + 50, resultTitle, {
          fontFamily: "Georgia, Times New Roman, serif",
          fontSize: "34px",
          color: status === "victory" ? "#d9ffba" : "#ffd1c8",
        }).setOrigin(0.5, 0),
      );
    }
    container.add(
      this.add.text(panelX + panelWidth / 2, panelY + 150, scenarioName, {
        fontFamily: "Noto Sans KR, Malgun Gothic, Apple SD Gothic Neo, Trebuchet MS, sans-serif",
        fontSize: "16px",
        color: "#f1dfaa",
      }).setOrigin(0.5, 0),
    );
    container.add(
      this.add.text(panelX + 34, panelY + 184, objectiveLines.join("\n"), {
        fontFamily: "Noto Sans KR, Malgun Gothic, Apple SD Gothic Neo, Trebuchet MS, sans-serif",
        fontSize: "14px",
        color: "#cfe0d4",
        lineSpacing: 6,
        wordWrap: { width: panelWidth - 68 },
      }),
    );
    container.add(
      this.add.text(panelX + 34, panelY + 256, resultSummaryLines.join("\n"), {
        fontFamily: "Noto Sans KR, Malgun Gothic, Apple SD Gothic Neo, Trebuchet MS, sans-serif",
        fontSize: "13px",
        color: "#8fb4a2",
        lineSpacing: 5,
        wordWrap: { width: panelWidth - 68 },
      }),
    );

    const buttons = [
      ...(nextCampaignContext
        ? [
            {
              label: "다음 미션",
              onClick: () => this.launchMissionContext(nextCampaignContext),
            },
          ]
        : []),
      {
        label: "다시 시작",
        onClick: () => this.restartMission(),
      },
      {
        label: "메인 메뉴",
        onClick: () => this.returnToMainMenu(),
      },
    ];
    const buttonY = panelY + panelHeight - 58;
    const buttonWidth = 126;
    const buttonGap = 12;
    const totalButtonWidth = buttons.length * buttonWidth + (buttons.length - 1) * buttonGap;
    const buttonStartX = panelX + (panelWidth - totalButtonWidth) / 2;

    buttons.forEach((button, index) => {
      this.addResultButton(container, buttonStartX + index * (buttonWidth + buttonGap), buttonY, buttonWidth, button.label, button.onClick);
    });

    return container;
  }

  private addMissionResultBackdrop(
    container: Phaser.GameObjects.Container,
    width: number,
    height: number,
  ): boolean {
    if (!this.textures.exists(MISSION_RESULT_BACKDROP_IMAGE_KEY)) {
      return false;
    }

    const scale = Math.max(
      width / MISSION_RESULT_BACKDROP_SOURCE_WIDTH,
      height / MISSION_RESULT_BACKDROP_SOURCE_HEIGHT,
    );
    const image = this.add.image(width / 2, height / 2, MISSION_RESULT_BACKDROP_IMAGE_KEY)
      .setScale(scale)
      .setAlpha(0.94);

    container.add(image);
    return true;
  }

  private hasMissionResultLogo(status: "victory" | "defeat"): boolean {
    return MISSION_RESULT_LOGO_BY_STATUS[status].frames.some((frame) => this.textures.exists(frame.key));
  }

  private addMissionResultLogo(
    container: Phaser.GameObjects.Container,
    status: "victory" | "defeat",
    centerX: number,
    centerY: number,
    maxWidth: number,
  ): boolean {
    const logo = MISSION_RESULT_LOGO_BY_STATUS[status];
    const frames = logo.frames.filter((frame) => this.textures.exists(frame.key));

    if (frames.length === 0) {
      return false;
    }

    const scale = Math.min(1, maxWidth / logo.width);
    const image = this.add.image(centerX, centerY, frames[0]!.key)
      .setDisplaySize(logo.width * scale, logo.height * scale);

    container.add(image);

    if (frames.length > 1) {
      let frameIndex = 0;
      const timer = this.time.addEvent({
        delay: MISSION_RESULT_LOGO_FRAME_MS,
        loop: true,
        callback: () => {
          frameIndex = (frameIndex + 1) % frames.length;
          image.setTexture(frames[frameIndex]!.key);
        },
      });

      container.once(Phaser.GameObjects.Events.DESTROY, () => timer.remove(false));
    }

    return true;
  }

  private getMissionResultSummaryLines(): string[] {
    const localSummary = this.createSideSummary((playerId) => this.arePlayersAllied(this.localPlayerId, playerId));
    const enemySummary = this.createSideSummary((playerId) => this.isEnemyPlayer(playerId));

    return [
      `시간: ${this.formatMissionElapsedTime()}`,
      `아군 병력: ${localSummary.units}  건물: ${localSummary.buildings}  인구: ${localSummary.populationUsed}/${localSummary.populationCap}`,
      `적 병력: ${enemySummary.units}  건물: ${enemySummary.buildings}`,
      `아군 자원: 식량 ${localSummary.resources.food} · 목재 ${localSummary.resources.wood} · 금 ${localSummary.resources.gold} · 석재 ${localSummary.resources.stone}`,
    ];
  }

  private createSideSummary(matchesPlayer: (playerId: string) => boolean): MissionResultSideSummary {
    const resources: ResourceAmountSet = { food: 0, wood: 0, gold: 0, stone: 0 };
    let units = 0;
    let workers = 0;
    let fighters = 0;
    let buildings = 0;
    let populationUsed = 0;
    let populationCap = 0;

    for (const unit of Object.values(this.worldState.units)) {
      if (!matchesPlayer(unit.playerId)) {
        continue;
      }

      const definition = unitDefinitions[unit.kind];

      units += 1;
      if (definition.category === "building") buildings += 1;
      else if (definition.category === "worker") workers += 1;
      else fighters += 1;
    }

    for (const [playerId, bank] of Object.entries(this.worldState.playerResources)) {
      if (!matchesPlayer(playerId)) {
        continue;
      }

      resources.food += bank.food;
      resources.wood += bank.wood;
      resources.gold += bank.gold;
      resources.stone += bank.stone;

      const population = getPlayerPopulationState(this.worldState, playerId);
      populationUsed += population.used;
      populationCap += population.cap;
    }

    return { units, workers, fighters, buildings, resources, populationUsed, populationCap };
  }

  private formatMissionElapsedTime(): string {
    const endedAtTick = this.worldState.scenario.endedAtTick ?? this.worldState.tick;
    const totalSeconds = Math.max(0, Math.floor(endedAtTick / SIM_TICKS_PER_SECOND));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  private addResultButton(
    container: Phaser.GameObjects.Container,
    x: number,
    y: number,
    width: number,
    label: string,
    onClick: () => void,
  ): void {
    const height = 34;
    const graphics = this.add.graphics();
    graphics
      .fillStyle(0x102428, 0.98)
      .fillRoundedRect(x, y, width, height, 6)
      .lineStyle(1, 0xd0b46a, 0.92)
      .strokeRoundedRect(x, y, width, height, 6);

    const text = this.add.text(x + width / 2, y + 8, label, {
      fontFamily: "Noto Sans KR, Malgun Gothic, Apple SD Gothic Neo, Trebuchet MS, sans-serif",
      fontSize: "13px",
      color: "#f1dfaa",
    }).setOrigin(0.5, 0);
    const hitZone = this.add
      .zone(x, y, width, height)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .on("pointerup", onClick);

    container.add([graphics, text, hitZone]);
  }

  private hideMissionResultOverlay(): void {
    this.missionResultContainer?.destroy(true);
    this.missionResultContainer = null;
  }

  private redrawMissionResultOverlay(): void {
    const status = this.worldState.scenario.status;

    if (!this.missionResultContainer || status === "running") {
      return;
    }

    this.missionResultContainer.destroy(true);
    this.missionResultContainer = this.createMissionResultOverlay(status);
  }

  private restartMission(): void {
    const context = this.launchContext;

    if (!context) {
      return;
    }

    this.stopGameplayAudio();
    this.launchMissionContext(this.createRestartLaunchContext(context));
  }

  private createRestartLaunchContext(context: GameLaunchContext): GameLaunchContext {
    return createFreshLaunchContext(context);
  }

  private launchMissionContext(context: GameLaunchContext): void {
    this.stopGameplayAudio();
    launchGameWithPreGameBriefing(this.scene, context);
  }

  private createNextCampaignMissionContext(): GameLaunchContext | null {
    const scenarioId = this.launchContext?.scenario?.id ?? this.worldState.scenario.id;
    const nextScenario = getNextCampaignScenario(imjinrokCampaignScenarios, scenarioId);

    if (!nextScenario) {
      return null;
    }

    const map = createImjinrokMapScaffold(nextScenario.mapId) ?? defaultMap;

    return createCampaignMissionLaunchContext(nextScenario, map);
  }

  private returnToMainMenu(): void {
    this.stopGameplayAudio();
    this.scene.stop("ui");
    this.scene.start("main-menu");
  }

  private setupObjectiveTrackerOverlay(): void {
    this.objectiveTrackerSignature = "";
    this.updateObjectiveTrackerOverlay();
  }

  private updateObjectiveTrackerOverlay(): void {
    const entries = this.getObjectiveTrackerEntries();

    if (entries.length === 0) {
      this.disposeObjectiveTrackerOverlay();
      return;
    }

    const panelWidth = Phaser.Math.Clamp(this.scale.width * 0.24, 280, 360);
    const panelX = 12;
    const panelY = 88;
    const rowHeight = 46;
    const panelHeight = 42 + entries.length * rowHeight + 12;
    const signature = [
      this.scale.width,
      this.scale.height,
      ...entries.map((entry) =>
        `${entry.id}:${entry.status}:${entry.label}:${entry.progress}:${entry.focusUnitIds.join(",")}:${entry.focusWorldPoint?.x.toFixed(1) ?? "-"},${entry.focusWorldPoint?.y.toFixed(1) ?? "-"}`,
      ),
    ].join("|");

    if (signature === this.objectiveTrackerSignature) {
      return;
    }

    this.disposeObjectiveTrackerOverlay();
    this.objectiveTrackerSignature = signature;
    this.objectiveTrackerBounds = new Phaser.Geom.Rectangle(panelX, panelY, panelWidth, panelHeight);

    const container = this.addScreenOverlayContainer(SCREEN_OVERLAY_DEPTH + 8);
    const graphics = this.add.graphics();
    graphics
      .fillStyle(0x061012, 0.9)
      .fillRoundedRect(panelX, panelY, panelWidth, panelHeight, 8)
      .lineStyle(1, 0x315158, 0.95)
      .strokeRoundedRect(panelX, panelY, panelWidth, panelHeight, 8)
      .fillStyle(0x102428, 0.96)
      .fillRoundedRect(panelX + 10, panelY + 10, panelWidth - 20, 24, 5);
    container.add(graphics);
    container.add(
      this.add.text(panelX + 20, panelY + 15, "목표", {
        fontFamily: "Noto Sans KR, Malgun Gothic, Apple SD Gothic Neo, Trebuchet MS, sans-serif",
        fontSize: "12px",
        color: "#d0b46a",
      }),
    );

    entries.forEach((entry, index) => {
      const rowY = panelY + 42 + index * rowHeight;
      const color = this.getObjectiveTrackerColor(entry.status);
      const labelColor = entry.status === "failed" ? "#ffbdaf" : entry.status === "completed" ? "#d9ffba" : "#f1dfaa";

      graphics
        .lineStyle(1, 0x203b40, 0.72)
        .lineBetween(panelX + 14, rowY + rowHeight - 4, panelX + panelWidth - 14, rowY + rowHeight - 4)
        .fillStyle(color, entry.status === "pending" ? 0.8 : 0.95)
        .fillCircle(panelX + 23, rowY + 12, 5);

      container.add(
        this.add.text(panelX + 38, rowY + 4, entry.label, {
          fontFamily: "Noto Sans KR, Malgun Gothic, Apple SD Gothic Neo, Trebuchet MS, sans-serif",
          fontSize: "13px",
          color: labelColor,
          wordWrap: { width: panelWidth - 54 },
        }),
      );
      container.add(
        this.add.text(panelX + 38, rowY + 24, entry.progress, {
          fontFamily: "Noto Sans KR, Malgun Gothic, Apple SD Gothic Neo, Trebuchet MS, sans-serif",
          fontSize: "11px",
          color: "#8fb4a2",
          wordWrap: { width: panelWidth - 54 },
        }),
      );

      if (entry.focusWorldPoint || entry.focusUnitIds.length > 0) {
        const hitZone = this.add
          .zone(panelX, rowY, panelWidth, rowHeight)
          .setOrigin(0, 0)
          .setInteractive({ useHandCursor: true })
          .on("pointerup", () => this.focusObjectiveTrackerEntry(entry));

        container.add(hitZone);
      }
    });

    this.objectiveTrackerContainer = container;
    this.refreshScreenOverlayCameraOrder();
  }

  private disposeObjectiveTrackerOverlay(): void {
    this.objectiveTrackerContainer?.destroy(true);
    this.objectiveTrackerContainer = null;
    this.objectiveTrackerBounds = null;
  }

  private getObjectiveTrackerEntries(): ObjectiveTrackerEntry[] {
    return this.getScenarioUiObjectives()
      .map((objective) => ({
        id: objective.id,
        label: objective.label,
        status: objective.status,
        progress: this.getObjectiveProgressText(objective),
        focusUnitIds: this.getObjectiveFocusUnitIds(objective),
        focusWorldPoint: this.getObjectiveFocusWorldPoint(objective),
      }));
  }

  private getScenarioUiObjectives(): Array<WorldState["scenario"]["objectives"][string]> {
    return Object.values(this.worldState.scenario.objectives)
      .filter((objective) => (objective.required || objective.defeatOnFailure) && this.isObjectiveVisibleInScenarioUi(objective));
  }

  private isObjectiveVisibleInScenarioUi(objective: WorldState["scenario"]["objectives"][string]): boolean {
    if (objective.status !== "pending") {
      return true;
    }

    if (objective.visibleAfterObjectiveId === undefined) {
      return true;
    }

    return this.worldState.scenario.objectives[objective.visibleAfterObjectiveId]?.status === "completed";
  }

  private getObjectiveProgressText(objective: WorldState["scenario"]["objectives"][string]): string {
    switch (objective.type) {
      case "build-building": {
        const count = this.getObjectiveMatchingUnits(objective).length;
        const required = this.getObjectiveRequiredCount(objective);

        return objective.status === "completed" ? `${required} / ${required}` : `${count} / ${required}`;
      }
      case "move-unit-to-area": {
        const units = this.getObjectiveMatchingUnits(objective);
        const required = this.getObjectiveRequiredCount(objective);
        const area = objective.area;

        if (units.length === 0) {
          return "목표 유닛 소실";
        }

        const reached = area ? units.filter((unit) => this.isUnitInObjectiveArea(unit, area)).length : 0;
        if (reached >= required) {
          const unmetRequirementLabel = this.getFirstUnmetObjectiveCompletionRequirementLabel(objective);
          if (unmetRequirementLabel) {
            return `${unmetRequirementLabel} 필요`;
          }

          return `도착 ${reached} / ${required}`;
        }

        const unit = units[0];
        const routeProgress = unit ? this.getObjectiveRouteProgressText(unit, objective) : null;
        const distance = unit && area ? this.getGridDistanceToAreaCenter(unit.position, area) : 0;

        return unit
          ? `HP ${unit.health.current} / ${unit.health.max} · ${routeProgress ?? `거리 ${distance}`}`
          : `도착 ${reached} / ${required}`;
      }
      case "protect-units": {
        const units = this.getObjectiveMatchingUnits(objective);
        const required = this.getObjectiveRequiredCount(objective);
        const alive = Math.min(required, units.length);
        const unit = units[0];

        if (!unit) {
          return "보호 대상 소실";
        }

        return `생존 ${alive} / ${required} · HP ${unit.health.current} / ${unit.health.max}`;
      }
      case "defeat-opponents": {
        const remainingEnemies = Object.values(this.worldState.units).filter((unit) => this.isEnemyPlayer(unit.playerId)).length;
        const visibleEnemies = Object.values(this.worldState.units).filter((unit) =>
          this.isEnemyPlayer(unit.playerId) &&
          this.isUnitVisibleToLocalPlayer(unit),
        ).length;

        if (remainingEnemies <= 0) {
          return "적 병력 전멸";
        }

        return visibleEnemies > 0 ? `발견한 적 ${visibleEnemies}` : "적 수색 중";
      }
      case "survive":
        return this.getSurvivalObjectiveProgressText(objective);
      case "collect-resources":
        return this.getResourceObjectiveProgressText(objective);
      case "custom":
        return objective.status === "pending" ? objective.description : objective.status === "completed" ? "완료" : "실패";
    }
  }

  private getSurvivalObjectiveProgressText(objective: WorldState["scenario"]["objectives"][string]): string {
    if (objective.durationTicks === undefined) {
      return "생존 유지";
    }

    const requiredSeconds = Math.ceil(Math.max(1, objective.durationTicks) / SIM_TICKS_PER_SECOND);
    const elapsedSeconds = Math.min(requiredSeconds, Math.floor(this.worldState.tick / SIM_TICKS_PER_SECOND));

    return `${elapsedSeconds} / ${requiredSeconds}초`;
  }

  private getResourceObjectiveProgressText(objective: WorldState["scenario"]["objectives"][string]): string {
    const resources = objective.resources;

    if (!resources) {
      return "자원 목표 진행 중";
    }

    const bank = this.worldState.playerResources[objective.playerId ?? this.localPlayerId];
    const lines = (Object.entries(resources) as Array<[BankResourceKind, number | undefined]>)
      .filter(([, required]) => required !== undefined && required > 0)
      .map(([resourceKind, required]) => {
        const requiredAmount = required ?? 0;
        const currentAmount = Math.min(requiredAmount, bank?.[resourceKind] ?? 0);
        return `${this.getBankResourceLabel(resourceKind)} ${currentAmount} / ${requiredAmount}`;
      });

    return lines.length > 0 ? lines.join(" · ") : "자원 목표 진행 중";
  }

  private getObjectiveFocusWorldPoint(objective: WorldState["scenario"]["objectives"][string]): Phaser.Math.Vector2 | null {
    if (objective.type === "move-unit-to-area" && objective.area) {
      const point = this.getGridWorldPoint({
        x: objective.area.x + objective.area.width / 2 - 0.5,
        y: objective.area.y + objective.area.height / 2 - 0.5,
      });

      return new Phaser.Math.Vector2(point.x, point.y);
    }

    if (objective.type === "build-building") {
      const builtUnit = this.getObjectiveMatchingUnits(objective)[0];
      return builtUnit ? this.getUnitWorldPosition(builtUnit) : null;
    }

    if (objective.type === "protect-units") {
      const protectedUnit = this.getObjectiveMatchingUnits(objective)[0];
      return protectedUnit ? this.getUnitWorldPosition(protectedUnit) : null;
    }

    if (objective.type === "defeat-opponents") {
      const enemy = Object.values(this.worldState.units).find((unit) =>
        this.isEnemyPlayer(unit.playerId) &&
        this.isUnitVisibleToLocalPlayer(unit),
      );

      return enemy ? this.getUnitWorldPosition(enemy) : null;
    }

    return null;
  }

  private focusObjectiveTrackerEntry(entry: ObjectiveTrackerEntry): void {
    if (this.missionResultContainer) {
      return;
    }

    const focusUnits = entry.focusUnitIds
      .map((unitId) => this.worldState.units[unitId])
      .filter((unit): unit is UnitState => unit !== undefined && this.isUnitSelectable(unit));

    if (focusUnits.length > 0) {
      this.selectUnits(focusUnits);
    }

    if (entry.focusWorldPoint) {
      this.centerCameraOnWorldPoint(entry.focusWorldPoint);
    } else if (focusUnits.length > 0) {
      this.centerCameraOnUnits(focusUnits);
    } else {
      return;
    }

    this.publishMinimapViewport(true);
  }

  private getObjectiveFocusUnitIds(objective: WorldState["scenario"]["objectives"][string]): string[] {
    switch (objective.type) {
      case "build-building":
      case "move-unit-to-area":
      case "protect-units":
        return this.getObjectiveMatchingUnits(objective).map((unit) => unit.id);
      case "survive":
      case "defeat-opponents":
      case "collect-resources":
      case "custom":
        return [];
    }
  }

  private getObjectiveTrackerColor(status: ObjectiveTrackerEntry["status"]): number {
    switch (status) {
      case "completed":
        return 0x8bd59b;
      case "failed":
        return 0xff8c73;
      case "pending":
        return 0xd0b46a;
    }
  }

  private getObjectiveMatchingUnits(objective: WorldState["scenario"]["objectives"][string]): UnitState[] {
    const playerId = objective.playerId ?? this.localPlayerId;

    if (!objective.targetKind) {
      return [];
    }

    return Object.values(this.worldState.units).filter((unit) => unit.playerId === playerId && unit.kind === objective.targetKind);
  }

  private getObjectiveRequiredCount(objective: WorldState["scenario"]["objectives"][string]): number {
    return Math.max(1, objective.count ?? 1);
  }

  private getFirstUnmetObjectiveCompletionRequirementLabel(objective: WorldState["scenario"]["objectives"][string]): string | null {
    for (const requiredObjectiveId of objective.completionRequiresObjectiveIds ?? []) {
      const requiredObjective = this.worldState.scenario.objectives[requiredObjectiveId];

      if (requiredObjective?.status !== "completed") {
        return requiredObjective?.label ?? "선행 목표";
      }
    }

    return null;
  }

  private getObjectiveRouteProgressText(
    unit: UnitState,
    objective: WorldState["scenario"]["objectives"][string],
  ): string | null {
    const waypoints = objective.routeWaypoints;

    if (!waypoints || waypoints.length < 2) {
      return null;
    }

    const nextWaypointIndex = waypoints.slice(1).findIndex((waypoint) => this.getGridDistanceToPoint(unit.position, waypoint) > 4);

    if (nextWaypointIndex < 0) {
      return null;
    }

    const waypoint = waypoints[nextWaypointIndex + 1]!;
    const distance = this.getGridDistanceToPoint(unit.position, waypoint);
    const label = objective.routeWaypointLabels?.[nextWaypointIndex + 1] ?? "다음 지점";

    return `${label} ${nextWaypointIndex + 1} / ${waypoints.length - 1} · 거리 ${distance}`;
  }

  private getBankResourceLabel(resourceKind: BankResourceKind): string {
    switch (resourceKind) {
      case "food":
        return "식량";
      case "wood":
        return "목재";
      case "gold":
        return "금";
      case "stone":
        return "석재";
    }
  }

  private isUnitInObjectiveArea(unit: UnitState, area: { x: number; y: number; width: number; height: number }): boolean {
    return (
      unit.position.x >= area.x &&
      unit.position.x < area.x + area.width &&
      unit.position.y >= area.y &&
      unit.position.y < area.y + area.height
    );
  }

  private getGridDistanceToAreaCenter(point: GridPoint, area: { x: number; y: number; width: number; height: number }): number {
    const centerX = area.x + area.width / 2 - 0.5;
    const centerY = area.y + area.height / 2 - 0.5;

    return Math.round(Math.hypot(point.x - centerX, point.y - centerY));
  }

  private getGridDistanceToPoint(from: GridPoint, to: GridPoint): number {
    return Math.round(Math.hypot(from.x - to.x, from.y - to.y));
  }

  private setupObjectiveAreaOverlay(): void {
    this.objectiveAreaGraphics = this.add.graphics().setDepth(SCREEN_OVERLAY_DEPTH - 100);
    this.redrawObjectiveAreaOverlay();
  }

  private redrawObjectiveAreaOverlay(): void {
    const graphics = this.objectiveAreaGraphics;

    if (!graphics) {
      return;
    }

    graphics.clear();
    const labelDefinitions: ObjectiveAreaLabelDefinition[] = [];

    for (const objective of Object.values(this.worldState.scenario.objectives)) {
      if (!objective.required && !objective.defeatOnFailure) {
        continue;
      }

      if (objective.type !== "move-unit-to-area" || !objective.area) {
        continue;
      }

      if (!this.isObjectiveVisibleInScenarioUi(objective)) {
        continue;
      }

      const points = this.getObjectiveAreaWorldPoints(objective.area);
      const routePoints = this.getObjectiveRouteWorldPoints(objective.routeWaypoints);
      const color = objective.status === "completed" ? 0x8bd59b : objective.status === "failed" ? 0xff8c73 : 0xf4df8e;
      const alpha = objective.status === "pending" ? 0.13 : 0.18;

      if (routePoints.length >= 2) {
        graphics
          .lineStyle(7, 0x071112, 0.58)
          .strokePoints(routePoints, false)
          .lineStyle(3, color, 0.76)
          .strokePoints(routePoints, false);

        for (const point of routePoints.slice(1, -1)) {
          graphics
            .lineStyle(2, 0x071112, 0.9)
            .strokeCircle(point.x, point.y, 10)
            .fillStyle(color, 0.78)
            .fillCircle(point.x, point.y, 5);
        }

        routePoints.slice(1).forEach((point, index) => {
          const label = objective.routeWaypointLabels?.[index + 1];

          if (!label) {
            return;
          }

          labelDefinitions.push({
            x: point.x,
            y: point.y,
            text: label,
            color: this.getObjectiveAreaLabelColor(objective.status),
          });
        });
      }

      graphics
        .fillStyle(color, alpha)
        .fillPoints(points, true)
        .lineStyle(3, color, 0.9)
        .strokePoints(points, true);

      const center = this.getGridWorldPoint({
        x: objective.area.x + objective.area.width / 2 - 0.5,
        y: objective.area.y + objective.area.height / 2 - 0.5,
      });

      graphics
        .lineStyle(2, 0x071112, 0.92)
        .strokeCircle(center.x, center.y, 12)
        .fillStyle(color, 0.88)
        .fillCircle(center.x, center.y, 6);
    }

    this.syncObjectiveAreaLabels(labelDefinitions);
  }

  private getObjectiveRouteWorldPoints(routeWaypoints: readonly GridPoint[] | undefined): Phaser.Geom.Point[] {
    return (routeWaypoints ?? []).map((point) => this.getGridWorldPoint(point));
  }

  private syncObjectiveAreaLabels(labelDefinitions: readonly ObjectiveAreaLabelDefinition[]): void {
    const signature = labelDefinitions
      .map((label) => `${label.text}:${label.x.toFixed(1)},${label.y.toFixed(1)}:${label.color}`)
      .join("|");

    if (signature === this.objectiveAreaLabelSignature) {
      return;
    }

    this.disposeObjectiveAreaLabels();
    this.objectiveAreaLabelSignature = signature;

    for (const label of labelDefinitions) {
      const text = this.add.text(label.x + 12, label.y - 18, label.text, {
        fontFamily: "Noto Sans KR, Malgun Gothic, Apple SD Gothic Neo, Trebuchet MS, sans-serif",
        fontSize: "12px",
        color: label.color,
      })
        .setDepth(SCREEN_OVERLAY_DEPTH - 99)
        .setOrigin(0, 0.5)
        .setStroke("#071112", 4);

      this.objectiveAreaLabels.push(text);
    }
  }

  private disposeObjectiveAreaLabels(): void {
    this.objectiveAreaLabels.forEach((label) => label.destroy());
    this.objectiveAreaLabels.length = 0;
    this.objectiveAreaLabelSignature = "";
  }

  private getObjectiveAreaLabelColor(status: WorldState["scenario"]["objectives"][string]["status"]): string {
    switch (status) {
      case "completed":
        return "#d9ffba";
      case "failed":
        return "#ffbdaf";
      case "pending":
        return "#f1dfaa";
    }
  }

  private getObjectiveAreaWorldPoints(area: { x: number; y: number; width: number; height: number }): Phaser.Geom.Point[] {
    return [
      this.getGridWorldPoint({ x: area.x - 0.5, y: area.y - 0.5 }),
      this.getGridWorldPoint({ x: area.x + area.width - 0.5, y: area.y - 0.5 }),
      this.getGridWorldPoint({ x: area.x + area.width - 0.5, y: area.y + area.height - 0.5 }),
      this.getGridWorldPoint({ x: area.x - 0.5, y: area.y + area.height - 0.5 }),
    ];
  }

  private getGridWorldPoint(point: GridPoint): Phaser.Geom.Point {
    const iso = cartToIso(point, this.map.tileWidth, this.map.tileHeight);

    return new Phaser.Geom.Point(this.mapOrigin.x + iso.x, this.mapOrigin.y + iso.y);
  }

  private updateScenarioStatusOverlay(): void {
    if (!this.scenarioStatusText) {
      return;
    }

    const objectives = this.getScenarioUiObjectives();
    const status = this.worldState.scenario.status;

    if (status === "victory" || status === "defeat") {
      this.scenarioStatusText
        .setText(status === "victory" ? "승리 - 목표 완료" : "패배 - 임무 실패")
        .setColor(status === "victory" ? "#bfff8f" : "#ff9b86")
        .setVisible(true);
      this.layoutScenarioStatusOverlay();
      return;
    }

    if (objectives.length === 0) {
      this.scenarioStatusText.setVisible(false);
      return;
    }

    const objectiveText = objectives.map((objective) => {
      const prefix = objective.status === "completed" ? "완료" : objective.status === "failed" ? "실패" : "목표";
      return `${prefix}: ${objective.label}`;
    }).join("\n");

    this.scenarioStatusText
      .setText(objectiveText)
      .setColor("#f1dfaa")
      .setVisible(true);
    this.layoutScenarioStatusOverlay();
  }

  private layoutScenarioStatusOverlay(): void {
    this.scenarioStatusText?.setWordWrapWidth(Math.min(this.scale.width - 48, 720)).setPosition(this.scale.width / 2, 18);
    this.layoutCommandFeedbackOverlay();
  }

  private setupTerrainDebugOverlay(): void {
    if (!this.shouldShowTerrainDebugPanel()) {
      this.terrainDebugEnabled = false;
      return;
    }

    this.terrainDebugEnabled = true;
    this.terrainDebugHighlight = this.add.graphics().setDepth(SCREEN_OVERLAY_DEPTH - 50).setVisible(false);

    const panel = document.createElement("div");
    panel.className = "terrain-debug-panel";
    panel.setAttribute("data-debug-panel", "terrain");

    const title = document.createElement("div");
    title.className = "terrain-debug-panel__title";
    title.textContent = "DEBUG TERRAIN";

    const row = document.createElement("label");
    row.className = "terrain-debug-panel__row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = this.terrainDebugEnabled;
    checkbox.addEventListener("change", () => this.setTerrainDebugEnabled(checkbox.checked));

    const label = document.createElement("span");
    label.textContent = "지형 세부사안 tooltip 표시";

    row.append(checkbox, label);
    panel.append(title, row);

    const tooltip = document.createElement("div");
    tooltip.className = "terrain-debug-tooltip";
    tooltip.hidden = true;

    document.body.append(panel, tooltip);

    this.terrainDebugPanel = panel;
    this.terrainDebugCheckbox = checkbox;
    this.terrainDebugTooltip = tooltip;
  }

  private setTerrainDebugEnabled(enabled: boolean): void {
    this.terrainDebugEnabled = enabled;
    this.writeTerrainDebugEnabled(enabled);

    if (this.terrainDebugCheckbox && this.terrainDebugCheckbox.checked !== enabled) {
      this.terrainDebugCheckbox.checked = enabled;
    }

    if (!enabled) {
      this.hideTerrainDebugHover();
      return;
    }

    this.hoveredTerrainDebugTile = null;
    this.updateTerrainDebugHover();
  }

  private disposeTerrainDebugOverlay(): void {
    this.terrainDebugPanel?.remove();
    this.terrainDebugTooltip?.remove();
    this.terrainDebugHighlight?.destroy();
    this.terrainDebugPanel = null;
    this.terrainDebugCheckbox = null;
    this.terrainDebugTooltip = null;
    this.terrainDebugHighlight = null;
    this.hoveredTerrainDebugTile = null;
  }

  private readTerrainDebugEnabled(): boolean {
    try {
      return globalThis.localStorage?.getItem(TERRAIN_DEBUG_DETAILS_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }

  private shouldShowTerrainDebugPanel(): boolean {
    const params = new URLSearchParams(globalThis.location?.search ?? "");

    return params.get("debugTerrain") === "1";
  }

  private writeTerrainDebugEnabled(enabled: boolean): void {
    try {
      globalThis.localStorage?.setItem(TERRAIN_DEBUG_DETAILS_STORAGE_KEY, enabled ? "1" : "0");
    } catch {
      // Local storage may be unavailable in privacy-restricted browser modes.
    }
  }

  private requestPointerLock(): void {
    if (!this.input.mouse?.locked) {
      this.input.mouse?.requestPointerLock();
    }
  }

  private releasePointerLock(): void {
    if (this.input.mouse?.locked) {
      this.input.mouse.releasePointerLock();
    }

    this.isPointerLocked = false;
    this.publishVirtualCursor();
  }

  private syncVirtualCursor(pointer: Phaser.Input.Pointer, useMovement: boolean): void {
    const isLocked = this.isPointerLocked || Boolean(this.input.mouse?.locked) || pointer.locked;

    if (isLocked && useMovement) {
      this.virtualCursorScreen.x += pointer.movementX;
      this.virtualCursorScreen.y += pointer.movementY;
    } else if (!isLocked) {
      this.virtualCursorScreen.set(pointer.x, pointer.y);
    }

    this.clampVirtualCursorToScreen();
    this.publishVirtualCursor();
  }

  private clampVirtualCursorToScreen(): void {
    this.virtualCursorScreen.set(
      Phaser.Math.Clamp(this.virtualCursorScreen.x, 0, this.scale.width),
      Phaser.Math.Clamp(this.virtualCursorScreen.y, 0, this.scale.height),
    );
  }

  private publishVirtualCursor(): void {
    const cursor = {
      x: this.virtualCursorScreen.x,
      y: this.virtualCursorScreen.y,
      locked: this.isPointerLocked,
    };

    this.registry.set(VIRTUAL_CURSOR_REGISTRY_KEY, cursor);
    this.game.events.emit(VIRTUAL_CURSOR_CHANGED_EVENT, cursor);
  }

  private publishGamePlayback(): void {
    const playback = this.sessionTransport?.getPlaybackState();

    if (!playback) {
      return;
    }

    const view = { ...playback, audioMuted: this.audioMuted };

    this.registry.set(GAME_PLAYBACK_REGISTRY_KEY, view);
    this.game.events.emit(GAME_PLAYBACK_CHANGED_EVENT, view);
  }

  private getCameraZoomAnchor(pointer: Phaser.Input.Pointer): Phaser.Math.Vector2 {
    if (this.isPointerLocked || this.input.mouse?.locked || pointer.locked) {
      return this.virtualCursorScreen.clone();
    }

    return new Phaser.Math.Vector2(pointer.x, pointer.y);
  }

  private zoomCameraAtScreenPoint(screenPoint: Phaser.Math.Vector2, zoomDelta: number): void {
    const camera = this.cameras.main;
    const nextZoom = Phaser.Math.Clamp(camera.zoom + zoomDelta, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);

    if (Math.abs(nextZoom - camera.zoom) < 0.001) {
      return;
    }

    const worldBeforeZoom = this.screenToWorldPoint(screenPoint);
    camera.setZoom(nextZoom);
    const worldAfterZoom = this.screenToWorldPoint(screenPoint);

    camera.scrollX += worldBeforeZoom.x - worldAfterZoom.x;
    camera.scrollY += worldBeforeZoom.y - worldAfterZoom.y;
    this.clampCameraToWorld();
    this.publishMinimapViewport(true);
  }

  private handleCameraPan(delta: number): void {
    const panDirection = this.getEdgePanDirection(this.virtualCursorScreen);
    panDirection.add(this.getKeyboardPanDirection());

    if (panDirection.lengthSq() === 0) {
      return;
    }

    panDirection.normalize();

    const distance = (EDGE_PAN_SPEED * delta) / 1000 / this.cameras.main.zoom;

    this.cameras.main.scrollX += panDirection.x * distance;
    this.cameras.main.scrollY += panDirection.y * distance;
    this.clampCameraToWorld();
    this.viewportDirty = true;
  }

  private getKeyboardPanDirection(): Phaser.Math.Vector2 {
    const direction = new Phaser.Math.Vector2(0, 0);

    if (!this.cursorKeys) {
      return direction;
    }

    if (this.cursorKeys.left.isDown) {
      direction.x -= 1;
    }
    if (this.cursorKeys.right.isDown) {
      direction.x += 1;
    }
    if (this.cursorKeys.up.isDown) {
      direction.y -= 1;
    }
    if (this.cursorKeys.down.isDown) {
      direction.y += 1;
    }

    return direction;
  }

  private setupControlGroupHotkeys(): void {
    this.input.keyboard?.on("keydown", this.handleControlGroupKeyDown, this);
  }

  private setupPlaybackHotkeys(): void {
    this.input.keyboard?.on("keydown", this.handlePlaybackKeyDown, this);
  }

  private handlePlaybackKeyDown(event: KeyboardEvent): void {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || this.missionResultContainer) {
      return;
    }

    if ((event.code === "Space" || event.code === "Enter") && this.advanceMissionPresentation()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (this.cheatInputElement) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.code === "Escape") {
      if (this.activeMissionDialogue) {
        this.advanceMissionDialogueLine();
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (this.pendingBuildPlacement || this.pendingTargetAction) {
        this.cancelBuildPlacement();
        this.cancelPendingTargetAction();
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      this.togglePauseMenu();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.code === "F5") {
      this.quickSaveGame();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.code === "F9") {
      this.quickLoadGame();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (this.pauseMenuContainer) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.code === "Enter") {
      this.openCheatInput();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.code === "Space") {
      this.togglePlaybackPause();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.code === "KeyI") {
      if (event.shiftKey) {
        this.selectAllIdleWorkers();
      } else {
        this.selectNextIdleWorker();
      }
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.code === "KeyA" && event.shiftKey) {
      this.selectAllCombatUnits();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.key === "," || event.key === "[") {
      this.stepPlaybackSpeed(-1);
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.key === "." || event.key === "]") {
      this.stepPlaybackSpeed(1);
      event.preventDefault();
      event.stopPropagation();
    }
  }

  private advanceMissionPresentation(): boolean {
    if (this.activeMissionDialogue) {
      this.advanceMissionDialogueLine();
      return true;
    }

    return false;
  }

  private handlePlaybackControl(control: GamePlaybackControlView): void {
    switch (control.type) {
      case "toggle-audio":
        this.toggleGameplayAudioMuted();
        return;
      case "toggle-pause":
        this.togglePlaybackPause();
        return;
      case "speed-down":
        this.stepPlaybackSpeed(-1);
        return;
      case "speed-up":
        this.stepPlaybackSpeed(1);
        return;
    }
  }

  private togglePlaybackPause(): void {
    if (this.presentationOwnsPlaybackPause()) {
      return;
    }

    const playback = this.sessionTransport?.getPlaybackState();

    if (!playback?.controllable) {
      return;
    }

    this.setPlaybackPaused(!playback.paused);
  }

  private stepPlaybackSpeed(direction: -1 | 1): void {
    const playback = this.sessionTransport?.getPlaybackState();

    if (!playback?.controllable) {
      return;
    }

    this.sessionTransport?.setPlaybackSpeed(this.getAdjacentPlaybackSpeed(playback.speed, direction));
    this.publishGamePlayback();
  }

  private setPlaybackPaused(paused: boolean): boolean {
    const playback = this.sessionTransport?.getPlaybackState();

    if (!playback?.controllable) {
      return false;
    }

    this.sessionTransport?.setPaused(paused);
    this.publishGamePlayback();
    return true;
  }

  private toggleGameplayAudioMuted(): void {
    this.setGameplayAudioMuted(!this.audioMuted, true);
  }

  private setGameplayAudioMuted(muted: boolean, persist: boolean): void {
    this.audioMuted = muted;
    this.sound.mute = muted;

    if (muted) {
      this.stopGameplayAudio();
    }

    if (persist) {
      this.writeGameplayAudioMutedPreference(muted);
    }

    if (!muted && this.missionResultContainer) {
      const status = this.worldState.scenario.status;

      if (status === "victory" || status === "defeat") {
        this.missionResultAudioStatus = null;
        this.playMissionResultAudio(status);
      }
    }

    this.publishGamePlayback();
  }

  private readGameplayAudioMutedPreference(): boolean {
    try {
      return globalThis.localStorage?.getItem(GAME_AUDIO_MUTED_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }

  private writeGameplayAudioMutedPreference(muted: boolean): void {
    try {
      if (muted) {
        globalThis.localStorage?.setItem(GAME_AUDIO_MUTED_STORAGE_KEY, "1");
      } else {
        globalThis.localStorage?.removeItem(GAME_AUDIO_MUTED_STORAGE_KEY);
      }
    } catch {
      // Ignore private-mode or storage quota errors; the in-memory audio state still applies.
    }
  }

  private stopGameplayAudio(): void {
    for (const cue of GAMEPLAY_AUDIO_CUES) {
      this.sound.stopByKey(cue.key);
    }

    this.stopMissionVoiceAudio();
  }

  private stopMissionVoiceAudio(): void {
    for (const cue of MISSION_VOICE_AUDIO_CUES) {
      this.sound.stopByKey(cue.key);
    }
  }

  private playMissionLineVoice(line: ScenarioBriefingLineDefinition): void {
    this.stopMissionVoiceAudio();

    if (this.audioMuted || this.sound.mute) {
      return;
    }

    const cue = MISSION_VOICE_AUDIO_CUE_BY_ID.get(normalizeMissionVoiceId(line.voiceId));

    if (!cue || !this.cache.audio.exists(cue.key)) {
      return;
    }

    try {
      this.sound.play(cue.key, { volume: cue.volume });
    } catch (error) {
      console.warn("Failed to play mission voice audio cue", { voiceId: line.voiceId, error });
    }
  }

  private getAdjacentPlaybackSpeed(currentSpeed: number, direction: -1 | 1): number {
    if (direction < 0) {
      return [...PLAYBACK_SPEEDS].reverse().find((speed) => speed < currentSpeed - 0.01) ?? 0.5;
    }

    return PLAYBACK_SPEEDS.find((speed) => speed > currentSpeed + 0.01) ?? 3;
  }

  private serializeControlGroups(): SerializedControlGroups {
    const groups: SerializedControlGroups = {};
    const groupNumbers = [...this.controlGroups.keys()].sort((a, b) => a - b);

    for (const group of groupNumbers) {
      const unitIds = this.getLiveControlGroupUnits(group).map((unit) => unit.id);

      if (unitIds.length > 0) {
        groups[String(group)] = unitIds;
      }
    }

    return groups;
  }

  private restoreControlGroups(serializedGroups: SerializedControlGroups | undefined): void {
    this.controlGroups.clear();
    this.lastControlGroupRecall = null;

    if (!serializedGroups) {
      return;
    }

    const groups = normalizeSerializedControlGroups(serializedGroups);

    if (!groups) {
      return;
    }

    for (const [groupKey, unitIds] of Object.entries(groups)) {
      const group = Number(groupKey);

      if (!Number.isInteger(group) || group < 0 || group > 9) {
        continue;
      }

      const liveUnitIds = unitIds.filter((unitId) => {
        const unit = this.worldState.units[unitId];

        return unit !== undefined && this.isUnitSelectable(unit);
      });

      if (liveUnitIds.length > 0) {
        this.controlGroups.set(group, liveUnitIds);
      }
    }
  }

  private handleControlGroupKeyDown(event: KeyboardEvent): void {
    if (event.repeat || event.altKey || this.cheatInputElement || this.isBlockingModalOpen()) {
      return;
    }

    const group = this.getControlGroupNumber(event);

    if (group === null) {
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      this.assignControlGroup(group);
      event.preventDefault();
      return;
    }

    if (event.shiftKey) {
      this.addSelectionToControlGroup(group);
      event.preventDefault();
      return;
    }

    this.recallControlGroup(group);
    event.preventDefault();
  }

  private getControlGroupNumber(event: KeyboardEvent): number | null {
    if (/^Digit\d$/.test(event.code)) {
      return Number(event.code.slice("Digit".length));
    }

    if (/^Numpad\d$/.test(event.code)) {
      return Number(event.code.slice("Numpad".length));
    }

    if (/^\d$/.test(event.key)) {
      return Number(event.key);
    }

    return null;
  }

  private assignControlGroup(group: number): void {
    const unitIds = this.getSelectedUnits().map((unit) => unit.id);

    if (unitIds.length === 0) {
      this.controlGroups.delete(group);
      this.lastControlGroupRecall = null;
      return;
    }

    this.controlGroups.set(group, unitIds);
    this.lastControlGroupRecall = null;
  }

  private addSelectionToControlGroup(group: number): void {
    const selectedUnitIds = this.getSelectedUnits().map((unit) => unit.id);

    if (selectedUnitIds.length === 0) {
      return;
    }

    const mergedUnitIds = new Set<string>(this.getLiveControlGroupUnits(group).map((unit) => unit.id));

    for (const unitId of selectedUnitIds) {
      mergedUnitIds.add(unitId);
    }

    this.controlGroups.set(group, [...mergedUnitIds]);
    this.lastControlGroupRecall = null;
  }

  private recallControlGroup(group: number): void {
    const units = this.getLiveControlGroupUnits(group);

    if (units.length === 0) {
      this.controlGroups.delete(group);
      this.lastControlGroupRecall = null;
      return;
    }

    const now = this.time.now;
    const shouldCenterCamera =
      this.lastControlGroupRecall?.group === group &&
      now - this.lastControlGroupRecall.time <= CONTROL_GROUP_DOUBLE_TAP_MS;

    this.selectUnits(units);

    if (shouldCenterCamera) {
      this.centerCameraOnUnits(units);
    }

    this.lastControlGroupRecall = { group, time: now };
  }

  private getLiveControlGroupUnits(group: number): UnitState[] {
    const unitIds = this.controlGroups.get(group) ?? [];
    const units: UnitState[] = [];
    const liveUnitIds: string[] = [];

    for (const unitId of unitIds) {
      const unit = this.worldState.units[unitId];

      if (!unit || !this.isUnitSelectable(unit)) {
        continue;
      }

      units.push(unit);
      liveUnitIds.push(unitId);
    }

    if (liveUnitIds.length !== unitIds.length) {
      if (liveUnitIds.length > 0) {
        this.controlGroups.set(group, liveUnitIds);
      } else {
        this.controlGroups.delete(group);
      }
    }

    return units;
  }

  private centerCameraOnUnits(units: readonly UnitState[]): void {
    if (units.length === 0) {
      return;
    }

    const positions = units.map((unit) => this.getUnitWorldPosition(unit));
    const minX = Math.min(...positions.map((position) => position.x));
    const maxX = Math.max(...positions.map((position) => position.x));
    const minY = Math.min(...positions.map((position) => position.y));
    const maxY = Math.max(...positions.map((position) => position.y));

    this.centerCameraOnWorldPoint({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 });
    this.publishMinimapViewport(true);
  }

  private selectNextIdleWorker(): void {
    const idleWorkers = this.getIdleWorkers();

    if (idleWorkers.length === 0) {
      this.lastIdleWorkerUnitId = null;
      this.showCommandFeedback("idle worker not found");
      return;
    }

    const selectedIdleWorker = this.getSelectedUnits().find((unit) => this.isIdleWorker(unit));
    const anchorUnitId = this.lastIdleWorkerUnitId ?? selectedIdleWorker?.id ?? null;
    const anchorIndex = anchorUnitId ? idleWorkers.findIndex((unit) => unit.id === anchorUnitId) : -1;
    const nextWorker = idleWorkers[(anchorIndex + 1) % idleWorkers.length] ?? idleWorkers[0];

    if (!nextWorker) {
      return;
    }

    this.lastIdleWorkerUnitId = nextWorker.id;
    this.selectUnits([nextWorker]);
    this.centerCameraOnUnits([nextWorker]);
  }

  private selectAllIdleWorkers(): void {
    const idleWorkers = this.getIdleWorkers();

    if (idleWorkers.length === 0) {
      this.lastIdleWorkerUnitId = null;
      this.showCommandFeedback("idle worker not found");
      return;
    }

    this.lastIdleWorkerUnitId = idleWorkers.at(-1)?.id ?? null;
    this.selectUnits(idleWorkers);
    this.centerCameraOnUnits(idleWorkers);
  }

  private selectAllCombatUnits(): void {
    const combatUnits = this.getCombatUnits();

    if (combatUnits.length === 0) {
      this.showCommandFeedback("combat unit not found");
      return;
    }

    this.selectUnits(combatUnits);
    this.centerCameraOnUnits(combatUnits);
  }

  private getIdleWorkers(): UnitState[] {
    return Object.values(this.worldState.units)
      .filter((unit) => this.isIdleWorker(unit))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  private isIdleWorker(unit: UnitState): boolean {
    return (
      this.isUnitSelectable(unit) &&
      unitCanPerformAction(unit.kind, "gather") &&
      unit.currentOrder === undefined &&
      unit.movementTarget === undefined &&
      (unit.movementPath?.length ?? 0) === 0 &&
      unit.construction === undefined
    );
  }

  private getCombatUnits(): UnitState[] {
    return Object.values(this.worldState.units)
      .filter((unit) => this.isCombatUnit(unit))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  private isCombatUnit(unit: UnitState): boolean {
    const definition = unitDefinitions[unit.kind];

    return (
      this.isUnitSelectable(unit) &&
      definition.category === "infantry" &&
      unitCanPerformAction(unit.kind, "attack-move") &&
      unit.construction === undefined
    );
  }

  private getEdgePanDirection(point: Phaser.Math.Vector2): Phaser.Math.Vector2 {
    const direction = new Phaser.Math.Vector2(0, 0);

    if (point.x < 0 || point.x > this.scale.width || point.y < 0 || point.y > this.scale.height) {
      return direction;
    }

    if (point.x <= EDGE_PAN_SIZE) {
      direction.x = -1;
    } else if (point.x >= this.scale.width - EDGE_PAN_SIZE) {
      direction.x = 1;
    }

    if (point.y <= EDGE_PAN_SIZE) {
      direction.y = -1;
    } else if (point.y >= this.scale.height - EDGE_PAN_SIZE) {
      direction.y = 1;
    }

    return direction;
  }

  private beginDragSelection(): void {
    const start = this.getClampedFieldScreenPoint(this.virtualCursorScreen);

    this.dragStartScreen = start;
    this.dragCurrentScreen = start.clone();
    this.isDragSelecting = false;
    this.publishDragSelection(null);
  }

  private updateDragSelection(): void {
    if (!this.dragStartScreen || !this.isLeftMouseHeld) {
      return;
    }

    this.dragCurrentScreen = this.getClampedFieldScreenPoint(this.virtualCursorScreen);

    const dragDistanceSq = Phaser.Math.Distance.Squared(
      this.dragStartScreen.x,
      this.dragStartScreen.y,
      this.dragCurrentScreen.x,
      this.dragCurrentScreen.y,
    );

    if (dragDistanceSq < DRAG_THRESHOLD_SQ) {
      if (this.isDragSelecting) {
        this.isDragSelecting = false;
        this.publishDragSelection(null);
      }
      return;
    }

    this.isDragSelecting = true;
    this.publishDragSelection(this.getScreenRectangle(this.dragStartScreen, this.dragCurrentScreen));
  }

  private finishDragSelection(pointer: Phaser.Input.Pointer): void {
    if (!this.dragStartScreen) {
      return;
    }

    const append = this.isAdditiveSelectionEvent(pointer);

    if (this.isDragSelecting) {
      this.dragCurrentScreen = this.getClampedFieldScreenPoint(this.virtualCursorScreen);
      this.selectUnitsInDragRectangle({ append });
    } else if (this.isScreenPointInWorldField(this.virtualCursorScreen)) {
      this.selectSingleUnitAtScreenPoint(this.virtualCursorScreen, { append });
    }

    this.dragStartScreen = null;
    this.dragCurrentScreen = null;
    this.isDragSelecting = false;
    this.publishDragSelection(null);
  }

  private cancelDragSelection(): void {
    this.dragStartScreen = null;
    this.dragCurrentScreen = null;
    this.isDragSelecting = false;
    this.publishDragSelection(null);
  }

  private publishDragSelection(rectangle: Phaser.Geom.Rectangle | null): void {
    const selection: DragSelectionView | null = rectangle
      ? { x: rectangle.x, y: rectangle.y, width: rectangle.width, height: rectangle.height }
      : null;

    this.game.events.emit(DRAG_SELECTION_CHANGED_EVENT, selection);
  }

  private selectSingleUnitAtScreenPoint(point: Phaser.Math.Vector2, options: { append?: boolean } = {}): void {
    const worldPoint = this.screenToWorldPoint(point);
    const unit = this.findUnitAtWorldPoint(worldPoint.x, worldPoint.y);

    if (!unit) {
      if (!options.append) {
        this.clearSelection();
      }
      this.lastUnitSelectionClick = null;
      return;
    }

    const now = this.time.now;
    const isDoubleClick =
      this.lastUnitSelectionClick?.kind === unit.kind &&
      now - this.lastUnitSelectionClick.time <= UNIT_DOUBLE_CLICK_SELECT_MS;

    if (isDoubleClick) {
      const visibleUnitsOfKind = this.getSelectableUnitsOfKindInView(unit.kind);

      this.selectUnits(visibleUnitsOfKind.length > 0 ? visibleUnitsOfKind : [unit], { append: options.append === true });
    } else {
      this.selectUnits([unit], { append: options.append === true });
    }

    this.lastUnitSelectionClick = { kind: unit.kind, time: now };
  }

  private selectUnitsInDragRectangle(options: { append?: boolean } = {}): void {
    if (!this.dragStartScreen || !this.dragCurrentScreen) {
      return;
    }

    const rectangle = this.getScreenRectangle(this.dragStartScreen, this.dragCurrentScreen);
    const selectedUnits = Object.values(this.worldState.units).filter((unit) => {
      if (!this.isUnitSelectable(unit)) {
        return false;
      }

      const unitSelectionBounds = this.getUnitSelectionScreenBounds(unit);

      return Phaser.Geom.Intersects.RectangleToRectangle(rectangle, unitSelectionBounds);
    });

    this.selectUnits(this.preferMobileUnitsForBoxSelection(selectedUnits), { append: options.append === true });
    this.lastUnitSelectionClick = null;
  }

  private getSelectableUnitsOfKindInView(kind: UnitDefinitionId): UnitState[] {
    return Object.values(this.worldState.units).filter((unit) => {
      if (unit.kind !== kind || !this.isUnitSelectable(unit)) {
        return false;
      }

      return this.isScreenPointInWorldField(this.getUnitScreenPosition(unit));
    });
  }

  private issueDefaultActionAtScreenPoint(point: Phaser.Math.Vector2): void {
    const worldPoint = this.screenToWorldPoint(point);
    const enemyTarget = this.findVisibleEnemyUnitAtWorldPoint(worldPoint.x, worldPoint.y);
    const repairTarget = enemyTarget ? null : this.findRepairTargetAtWorldPoint(worldPoint.x, worldPoint.y);
    const selectedUnits = this.getSelectedUnits();
    const repairWorkers = repairTarget
      ? selectedUnits.filter((unit) => unitCanPerformAction(unit.kind, "repair"))
      : [];

    if (repairTarget && repairWorkers.length > 0) {
      this.issueRepairCommands(repairWorkers, repairTarget);
      return;
    }

    const commandableUnits = selectedUnits.filter((unit) => unitCanPerformAction(unit.kind, enemyTarget ? "attack-move" : "move"));
    const target = enemyTarget
      ? this.clampGridPoint({ x: Math.round(enemyTarget.position.x), y: Math.round(enemyTarget.position.y) })
      : this.getGridPointFromScreenPoint(point);
    const resourceTarget = !enemyTarget ? this.findResourceTargetAtGridPoint(target) : null;
    const gatherWorkers = resourceTarget
      ? selectedUnits.filter((unit) => unitCanPerformAction(unit.kind, "gather"))
      : [];

    if (resourceTarget && gatherWorkers.length > 0) {
      this.issueGatherCommands(gatherWorkers, resourceTarget);
      return;
    }

    if (commandableUnits.length === 0) {
      const rallyBuildings = selectedUnits.filter((unit) => unitCanPerformAction(unit.kind, "rally-point"));

      if (rallyBuildings.length > 0) {
        this.issueRallyPointCommands(rallyBuildings, target, resourceTarget?.id, enemyTarget ? "attack-move" : undefined);
      }

      return;
    }

    const formationTargets = enemyTarget ? [] : this.getFormationTargets(target, commandableUnits.length);
    const commandPromises = commandableUnits.map((unit, index) => {
      const command: CommandEnvelope["command"] = enemyTarget
        ? {
            type: "attack-unit",
            unitId: unit.id,
            targetUnitId: enemyTarget.id,
          }
        : {
            type: "move",
            unitId: unit.id,
            target: formationTargets[index] ?? target,
          };

      const envelope: CommandEnvelope = {
        sessionId: this.launchContext?.session?.id ?? "offline-skirmish",
        playerId: this.localPlayerId,
        issuedAtTick: this.worldState.tick,
        command,
      };

      return this.issueCommandEnvelope(envelope);
    });

    void Promise.all(commandPromises).then((results) => {
      this.syncWorldFromTransport(true);
      this.emitSelectionChanged();
      this.syncUnitRenderables();
      this.publishMinimapEntities();

      if (this.hasAcceptedCommand(results)) {
        this.playUnitAudio(commandableUnits, enemyTarget ? "attack" : "move");
        this.showMoveTargetMarker(target);
      }
    });
  }

  private issueGatherCommands(workers: readonly UnitState[], target: { id: string; point: GridPoint }): void {
    if (workers.length === 0) {
      return;
    }

    const commandPromises = workers.map((unit) => this.issueGatherCommand(unit, target));

    void Promise.all(commandPromises).then((results) => {
      this.syncWorldFromTransport(true);
      this.emitSelectionChanged();
      this.syncUnitRenderables();
      this.publishMinimapEntities();

      if (this.hasAcceptedCommand(results)) {
        this.playUnitAudio(workers, "move");
        this.showMoveTargetMarker(target.point);
      }
    });
  }

  private issueRepairAtScreenPoint(unitIds: readonly string[], point: Phaser.Math.Vector2): void {
    const worldPoint = this.screenToWorldPoint(point);
    const target = this.findRepairTargetAtWorldPoint(worldPoint.x, worldPoint.y) ?? this.findNearestRepairTargetForUnits(unitIds);
    const workers = unitIds
      .map((unitId) => this.worldState.units[unitId])
      .filter((unit): unit is UnitState => unit !== undefined && unitCanPerformAction(unit.kind, "repair"));

    if (!target || workers.length === 0) {
      return;
    }

    this.issueRepairCommands(workers, target);
  }

  private issueRepairCommands(workers: readonly UnitState[], target: UnitState): void {
    if (workers.length === 0) {
      return;
    }

    const commandPromises = workers.map((unit) => {
      const envelope: CommandEnvelope = {
        sessionId: this.launchContext?.session?.id ?? "offline-skirmish",
        playerId: this.localPlayerId,
        issuedAtTick: this.worldState.tick,
        command: {
          type: "repair",
          workerUnitId: unit.id,
          targetUnitId: target.id,
        },
      };

      return this.issueCommandEnvelope(envelope);
    });

    void Promise.all(commandPromises).then((results) => {
      this.syncWorldFromTransport(true);
      this.emitSelectionChanged();
      this.syncUnitRenderables();
      this.publishMinimapEntities();

      if (this.hasAcceptedCommand(results)) {
        this.playUnitAudio(workers, "move");
        this.showMoveTargetMarker({
          x: Math.round(target.position.x),
          y: Math.round(target.position.y),
        });
      }
    });
  }

  private issueMoveAtScreenPoint(unitIds: readonly string[], point: Phaser.Math.Vector2): void {
    const target = this.getGridPointFromScreenPoint(point);
    const commandableUnits = unitIds
      .map((unitId) => this.worldState.units[unitId])
      .filter((unit): unit is UnitState => unit !== undefined && unitCanPerformAction(unit.kind, "move"));

    if (commandableUnits.length === 0) {
      return;
    }

    const formationTargets = this.getFormationTargets(target, commandableUnits.length);
    const commandPromises = commandableUnits.map((unit, index) => {
      const envelope: CommandEnvelope = {
        sessionId: this.launchContext?.session?.id ?? "offline-skirmish",
        playerId: this.localPlayerId,
        issuedAtTick: this.worldState.tick,
        command: {
          type: "move",
          unitId: unit.id,
          target: formationTargets[index] ?? target,
        },
      };

      return this.issueCommandEnvelope(envelope);
    });

    void Promise.all(commandPromises).then((results) => {
      this.syncWorldFromTransport(true);
      this.emitSelectionChanged();
      this.syncUnitRenderables();
      this.publishMinimapEntities();

      if (this.hasAcceptedCommand(results)) {
        this.playUnitAudio(commandableUnits, "move");
        this.showMoveTargetMarker(target);
      }
    });
  }

  private issueCommandEnvelope(envelope: CommandEnvelope): Promise<IssueCommandResult | null> {
    return this.issueCommandEnvelopeWithOptions(envelope);
  }

  private hasAcceptedCommand(results: readonly (IssueCommandResult | null)[]): boolean {
    return results.some((result) => result?.ok === true);
  }

  private issueCommandEnvelopeWithOptions(
    envelope: CommandEnvelope,
    options: { suppressFeedback?: boolean } = {},
  ): Promise<IssueCommandResult | null> {
    return Promise.resolve(this.sessionTransport?.issueCommand(envelope) ?? null)
      .then((result) => {
        if (result && !result.ok && !options.suppressFeedback) {
          this.showCommandFeedback(result.reason);
        }

        return result;
      })
      .catch((error: unknown) => {
        console.warn("Failed to issue command", error);
        if (!options.suppressFeedback) {
          this.showCommandFeedback("command request failed");
        }
        return { ok: false, reason: "command request failed" };
      });
  }

  private issueStopCommands(unitIds: readonly string[]): void {
    const commandableUnits: UnitState[] = [];

    for (const unitId of unitIds) {
      const unit = this.worldState.units[unitId];

      if (unit && unitCanPerformAction(unit.kind, "stop")) {
        commandableUnits.push(unit);
      }
    }

    if (commandableUnits.length === 0) {
      return;
    }

    const commandPromises = commandableUnits.map((unit) => {
      const envelope: CommandEnvelope = {
        sessionId: this.launchContext?.session?.id ?? "offline-skirmish",
        playerId: this.localPlayerId,
        issuedAtTick: this.worldState.tick,
        command: {
          type: "stop",
          unitId: unit.id,
        },
      };

      return this.issueCommandEnvelope(envelope);
    });

    void Promise.all(commandPromises).then((results) => {
      this.syncWorldFromTransport(true);
      this.emitSelectionChanged();
      this.syncUnitRenderables();
      this.publishMinimapEntities();

    });
  }

  private issueHoldPositionCommands(unitIds: readonly string[]): void {
    const commandableUnits = unitIds
      .map((unitId) => this.worldState.units[unitId])
      .filter((unit): unit is UnitState => unit !== undefined && unitCanPerformAction(unit.kind, "hold"));

    if (commandableUnits.length === 0) {
      return;
    }

    const commandPromises = commandableUnits.map((unit) => {
      const envelope: CommandEnvelope = {
        sessionId: this.launchContext?.session?.id ?? "offline-skirmish",
        playerId: this.localPlayerId,
        issuedAtTick: this.worldState.tick,
        command: {
          type: "hold-position",
          unitId: unit.id,
        },
      };

      return this.issueCommandEnvelope(envelope);
    });

    void Promise.all(commandPromises).then((results) => {
      this.syncWorldFromTransport(true);
      this.emitSelectionChanged();
      this.syncUnitRenderables();
      this.publishMinimapEntities();

    });
  }

  private issueTrainUnit(unitIds: readonly string[], unitKind: UnitDefinitionId, actionId: ActionDefinitionId): void {
    const buildings = unitIds
      .map((unitId) => this.worldState.units[unitId])
      .filter((unit): unit is UnitState => unit !== undefined && unitCanPerformAction(unit.kind, actionId));
    const building = this.findLeastQueuedTrainingBuilding(buildings);

    if (!building) {
      if (buildings.some((unit) => (unit.researchQueue?.length ?? 0) > 0)) {
        this.showCommandFeedback("building is researching");
      } else if (buildings.some((unit) => (unit.productionQueue?.length ?? 0) >= MAX_CLIENT_PRODUCTION_QUEUE_SIZE)) {
        this.showCommandFeedback("production queue is full");
      }
      return;
    }

    const envelope: CommandEnvelope = {
      sessionId: this.launchContext?.session?.id ?? "offline-skirmish",
      playerId: this.localPlayerId,
      issuedAtTick: this.worldState.tick,
      command: {
        type: "train-unit",
        buildingUnitId: building.id,
        unit: unitKind,
      },
    };

    void this.issueCommandEnvelope(envelope).then(() => {
      this.syncWorldFromTransport(true);
      this.emitSelectionChanged();
      this.publishPlayerEconomy();
      this.publishMinimapEntities();
    });
  }

  private findLeastQueuedTrainingBuilding(buildings: readonly UnitState[]): UnitState | null {
    return buildings
      .filter((unit) =>
        !unit.construction &&
        (unit.researchQueue?.length ?? 0) === 0 &&
        (unit.productionQueue?.length ?? 0) < MAX_CLIENT_PRODUCTION_QUEUE_SIZE,
      )
      .sort((a, b) => {
        const queueDelta = (a.productionQueue?.length ?? 0) - (b.productionQueue?.length ?? 0);

        return queueDelta !== 0 ? queueDelta : a.id.localeCompare(b.id);
      })[0] ?? null;
  }

  private issueResearch(unitIds: readonly string[], research: ResearchDefinitionId): void {
    const definition = researchDefinitions[research];
    const buildings = unitIds
      .map((unitId) => this.worldState.units[unitId])
      .filter((unit): unit is UnitState => (
        unit !== undefined &&
        !unit.construction &&
        (definition.sourceBuildings as readonly UnitDefinitionId[]).includes(unit.kind) &&
        unitCanPerformAction(unit.kind, definition.actionId)
      ));
    const building = buildings.find((unit) =>
      (unit.productionQueue?.length ?? 0) === 0 &&
      (unit.researchQueue?.length ?? 0) === 0,
    );

    if (!building) {
      if (buildings.some((unit) => (unit.productionQueue?.length ?? 0) > 0)) {
        this.showCommandFeedback("production queue is busy");
      } else if (buildings.some((unit) => (unit.researchQueue?.length ?? 0) > 0)) {
        this.showCommandFeedback("research queue is full");
      }
      return;
    }

    const envelope: CommandEnvelope = {
      sessionId: this.launchContext?.session?.id ?? "offline-skirmish",
      playerId: this.localPlayerId,
      issuedAtTick: this.worldState.tick,
      command: {
        type: "research",
        buildingUnitId: building.id,
        research,
      },
    };

    void this.issueCommandEnvelope(envelope).then(() => {
      this.syncWorldFromTransport(true);
      this.emitSelectionChanged();
      this.publishPlayerEconomy();
      this.publishMinimapEntities();
    });
  }

  private issueCancelProduction(unitIds: readonly string[]): void {
    const buildings = unitIds
      .map((unitId) => this.worldState.units[unitId])
      .filter((unit): unit is UnitState => (
        unit !== undefined &&
        !unit.construction &&
        unitCanPerformAction(unit.kind, "cancel-production") &&
        ((unit.productionQueue?.length ?? 0) > 0 || (unit.researchQueue?.length ?? 0) > 0)
      ));
    const building = this.findMostQueuedProductionBuilding(buildings);
    const queueItem = building?.productionQueue?.at(-1) ?? building?.researchQueue?.at(-1);

    if (!building || !queueItem) {
      return;
    }

    const envelope: CommandEnvelope = {
      sessionId: this.launchContext?.session?.id ?? "offline-skirmish",
      playerId: this.localPlayerId,
      issuedAtTick: this.worldState.tick,
      command: {
        type: "cancel-production",
        buildingUnitId: building.id,
        queueItemId: queueItem.id,
      },
    };

    void this.issueCommandEnvelope(envelope).then(() => {
      this.syncWorldFromTransport(true);
      this.emitSelectionChanged();
      this.publishPlayerEconomy();
      this.publishMinimapEntities();
    });
  }

  private findMostQueuedProductionBuilding(buildings: readonly UnitState[]): UnitState | null {
    return [...buildings]
      .sort((a, b) => {
        const queueDelta = getCancellableQueueLength(b) - getCancellableQueueLength(a);

        return queueDelta !== 0 ? queueDelta : a.id.localeCompare(b.id);
      })[0] ?? null;
  }

  private issueCancelConstruction(unitIds: readonly string[]): void {
    const buildings = unitIds
      .map((unitId) => this.worldState.units[unitId])
      .filter((unit): unit is UnitState => unit !== undefined && unit.playerId === this.localPlayerId && Boolean(unit.construction));

    if (buildings.length === 0) {
      return;
    }

    const commandPromises = buildings.map((building) => {
      const envelope: CommandEnvelope = {
        sessionId: this.launchContext?.session?.id ?? "offline-skirmish",
        playerId: this.localPlayerId,
        issuedAtTick: this.worldState.tick,
        command: {
          type: "cancel-construction",
          unitId: building.id,
        },
      };

      return this.issueCommandEnvelope(envelope);
    });

    void Promise.all(commandPromises).then(() => {
      this.syncWorldFromTransport(true);
      this.emitSelectionChanged();
      this.syncUnitRenderables();
      this.publishPlayerEconomy();
      this.publishMinimapEntities();
    });
  }

  private beginBuildPlacement(unitIds: readonly string[], building: BuildingDefinitionId): void {
    const builderUnitIds = unitIds.filter((unitId) => {
      const unit = this.worldState.units[unitId];

      return unit !== undefined && unitCanPerformAction(unit.kind, "build");
    });

    if (builderUnitIds.length === 0) {
      this.showCommandFeedback("unit cannot perform action");
      return;
    }

    this.cancelPendingTargetAction();
    this.pendingBuildPlacement = { builderUnitIds, building };
    this.buildPlacementPreviewSignature = "";
    this.updateBuildPlacementPreview();
  }

  private cancelBuildPlacement(): void {
    this.pendingBuildPlacement = null;
    this.buildPlacementPreviewSignature = "";

    if (this.buildPlacementPreview) {
      this.buildPlacementPreview.clear();
      this.buildPlacementPreview.setVisible(false);
    }
  }

  private beginPointTargetAction(actionId: PointTargetActionId, selectedEntityIds: readonly string[]): void {
    const commandableEntityIds = selectedEntityIds.filter((unitId) => {
      const unit = this.worldState.units[unitId];

      return unit !== undefined && unitCanPerformAction(unit.kind, actionId);
    });

    if (commandableEntityIds.length === 0) {
      this.showCommandFeedback("unit cannot perform action");
      return;
    }

    this.cancelBuildPlacement();
    this.cancelDragSelection();
    this.pendingTargetAction = {
      actionId,
      selectedEntityIds: commandableEntityIds,
    };
    this.showTransientFeedback(`${this.getActionFeedbackLabel(actionId)}: 대상을 지정하세요`);
  }

  private cancelPendingTargetAction(): void {
    this.pendingTargetAction = null;
  }

  private issuePendingTargetAction(point: Phaser.Math.Vector2): void {
    const pending = this.pendingTargetAction;

    if (!pending) {
      return;
    }

    this.pendingTargetAction = null;

    switch (pending.actionId) {
      case "move":
        this.issueMoveAtScreenPoint(pending.selectedEntityIds, point);
        return;
      case "gather":
        this.issueGatherAtScreenPoint(pending.selectedEntityIds, point);
        return;
      case "rally-point":
        this.issueRallyPointAtScreenPoint(pending.selectedEntityIds, point);
        return;
      case "repair":
        this.issueRepairAtScreenPoint(pending.selectedEntityIds, point);
        return;
      case "attack-move":
        this.issueAttackMoveAtScreenPoint(pending.selectedEntityIds, point);
        return;
      case "patrol":
        this.issuePatrolAtScreenPoint(pending.selectedEntityIds, point);
        return;
    }
  }

  private issuePendingBuildPlacement(point: Phaser.Math.Vector2): void {
    const pending = this.pendingBuildPlacement;

    if (!pending) {
      return;
    }

    const target = this.getGridPointFromScreenPoint(point);

    void this.issueBuildCommand(pending.builderUnitIds, pending.building, target).then((result) => {
      if (result?.ok) {
        this.cancelBuildPlacement();
      } else {
        this.buildPlacementPreviewSignature = "";
        this.updateBuildPlacementPreview();
      }
    });
  }

  private issueBuildCommand(
    unitIds: readonly string[],
    building: BuildingDefinitionId,
    target: GridPoint,
  ): Promise<IssueCommandResult | null> {
    if (!this.hasBuildCapableUnit(unitIds)) {
      this.showCommandFeedback("unit cannot perform action");
      return Promise.resolve(null);
    }

    const placement = validateBuildingPlacement(this.worldState, building, target);

    if (!placement.ok) {
      this.showCommandFeedback(placement.reason);
      return Promise.resolve(null);
    }

    if (!this.isBuildFootprintVisibleToLocalPlayer(target, building)) {
      this.showCommandFeedback("build target not visible");
      return Promise.resolve(null);
    }

    const builder = unitIds
      .map((unitId) => this.worldState.units[unitId])
      .find((unit): unit is UnitState => this.canUnitBuildAtTarget(unit, building, target));

    if (!builder) {
      this.showCommandFeedback("no path to build site");
      return Promise.resolve(null);
    }

    const envelope: CommandEnvelope = {
      sessionId: this.launchContext?.session?.id ?? "offline-skirmish",
      playerId: this.localPlayerId,
      issuedAtTick: this.worldState.tick,
      command: {
        type: "build",
        builderUnitId: builder.id,
        building,
        target,
      },
    };

    return this.issueCommandEnvelope(envelope).then((result) => {
      this.syncWorldFromTransport(true);
      this.emitSelectionChanged();
      this.publishPlayerEconomy();
      this.publishMinimapEntities();

      if (result?.ok) {
        this.playUnitAudio([builder], "move");
        this.showMoveTargetMarker(target);
        this.issueConstructionAssistCommands(unitIds, builder.id);
      }

      return result;
    });
  }

  private issueConstructionAssistCommands(unitIds: readonly string[], primaryBuilderId: string): void {
    const builder = this.worldState.units[primaryBuilderId];

    if (builder?.currentOrder?.type !== "build") {
      return;
    }

    const buildingUnitId = builder.currentOrder.buildingUnitId;

    if (!buildingUnitId) {
      return;
    }

    const target = this.worldState.units[buildingUnitId];

    if (!target?.construction) {
      return;
    }

    const assistants = unitIds
      .filter((unitId) => unitId !== primaryBuilderId)
      .map((unitId) => this.worldState.units[unitId])
      .filter((unit): unit is UnitState => (
        unit !== undefined &&
        unit.playerId === this.localPlayerId &&
        unitCanPerformAction(unit.kind, "repair")
      ));

    if (assistants.length === 0) {
      return;
    }

    this.issueRepairCommands(assistants, target);
  }

  private hasRallyPointBuildings(unitIds: readonly string[]): boolean {
    return unitIds
      .map((unitId) => this.worldState.units[unitId])
      .some((unit) => unit !== undefined && unitCanPerformAction(unit.kind, "rally-point"));
  }

  private issueRallyPointAtScreenPoint(unitIds: readonly string[], point: Phaser.Math.Vector2): void {
    const worldPoint = this.screenToWorldPoint(point);
    const enemyTarget = this.findVisibleEnemyUnitAtWorldPoint(worldPoint.x, worldPoint.y);
    const target = enemyTarget
      ? this.clampGridPoint({ x: Math.round(enemyTarget.position.x), y: Math.round(enemyTarget.position.y) })
      : this.getGridPointFromScreenPoint(point);
    const resourceTarget = !enemyTarget ? this.findResourceTargetAtGridPoint(target) : null;
    const buildings = unitIds
      .map((unitId) => this.worldState.units[unitId])
      .filter((unit): unit is UnitState => unit !== undefined && unitCanPerformAction(unit.kind, "rally-point"));

    this.issueRallyPointCommands(buildings, target, resourceTarget?.id, enemyTarget ? "attack-move" : undefined);
  }

  private issueRallyPointCommands(
    buildings: readonly UnitState[],
    target: GridPoint,
    resourceId?: string,
    mode?: "move" | "attack-move",
  ): void {
    if (buildings.length === 0) {
      return;
    }

    const commandPromises = buildings.map((building) => {
      const envelope: CommandEnvelope = {
        sessionId: this.launchContext?.session?.id ?? "offline-skirmish",
        playerId: this.localPlayerId,
        issuedAtTick: this.worldState.tick,
        command: {
          type: "set-rally-point",
          buildingUnitId: building.id,
          target,
          ...(resourceId ? { resourceId } : {}),
          ...(mode && !resourceId ? { mode } : {}),
        },
      };

      return this.issueCommandEnvelope(envelope);
    });

    void Promise.all(commandPromises).then((results) => {
      this.syncWorldFromTransport(true);
      this.emitSelectionChanged();
      this.syncUnitRenderables();
      this.publishMinimapEntities();

      if (this.hasAcceptedCommand(results)) {
        this.showMoveTargetMarker(target);
      }
    });
  }

  private issueTownBellCommands(unitIds: readonly string[]): void {
    const buildings = unitIds
      .map((unitId) => this.worldState.units[unitId])
      .filter((unit): unit is UnitState => unit !== undefined && unitCanPerformAction(unit.kind, "town-bell"));

    if (buildings.length === 0) {
      return;
    }

    const commandPromises = buildings.map((building) => {
      const envelope: CommandEnvelope = {
        sessionId: this.launchContext?.session?.id ?? "offline-skirmish",
        playerId: this.localPlayerId,
        issuedAtTick: this.worldState.tick,
        command: {
          type: "town-bell",
          buildingUnitId: building.id,
        },
      };

      return this.issueCommandEnvelope(envelope);
    });

    void Promise.all(commandPromises).then((results) => {
      this.syncWorldFromTransport(true);
      this.emitSelectionChanged();
      this.syncUnitRenderables();
      this.publishMinimapEntities();

      const firstBuilding = this.hasAcceptedCommand(results) ? buildings[0] : undefined;
      if (firstBuilding) {
        this.showMoveTargetMarker({
          x: Math.round(firstBuilding.position.x),
          y: Math.round(firstBuilding.position.y),
        });
      }
    });
  }

  private issueGatherRallyNearestCommands(unitIds: readonly string[]): void {
    const buildings = unitIds
      .map((unitId) => this.worldState.units[unitId])
      .filter((unit): unit is UnitState => unit !== undefined && unitCanPerformAction(unit.kind, "rally-point"));
    const resourceTargets = this.collectResourceTargets();

    if (buildings.length === 0) {
      return;
    }

    if (resourceTargets.length === 0) {
      this.showCommandFeedback("resource node not visible");
      return;
    }

    buildings.forEach((building) => {
      const target = this.findNearestResourceTarget(building.position, resourceTargets);

      if (target) {
        this.issueRallyPointCommands([building], target.point, target.id);
      }
    });
  }

  private issueGatherNearestCommands(unitIds: readonly string[]): void {
    const workers = unitIds
      .map((unitId) => this.worldState.units[unitId])
      .filter((unit): unit is UnitState => unit !== undefined && unitCanPerformAction(unit.kind, "gather"));
    const resourceTargets = this.collectResourceTargets();

    if (workers.length === 0) {
      this.showCommandFeedback("unit cannot perform action");
      return;
    }

    if (resourceTargets.length === 0) {
      this.showCommandFeedback("resource node not visible");
      return;
    }

    const commandPromises = workers.map((unit) => this.issueGatherNearestReachableCommand(unit, resourceTargets));

    void Promise.all(commandPromises).then((results) => {
      this.syncWorldFromTransport(true);
      this.emitSelectionChanged();
      this.syncUnitRenderables();
      this.publishMinimapEntities();

      if (this.hasAcceptedCommand(results)) {
        this.playUnitAudio(workers, "move");
      }
    });
  }

  private issueGatherAtScreenPoint(unitIds: readonly string[], point: Phaser.Math.Vector2): void {
    const workers = unitIds
      .map((unitId) => this.worldState.units[unitId])
      .filter((unit): unit is UnitState => unit !== undefined && unitCanPerformAction(unit.kind, "gather"));

    if (workers.length === 0) {
      this.showCommandFeedback("unit cannot perform action");
      return;
    }

    const target = this.getGridPointFromScreenPoint(point);
    const resourceTarget = this.findResourceTargetAtGridPoint(target);

    if (!resourceTarget) {
      this.showCommandFeedback(
        getTileVisibility(this.playerVisibility, target) === TileVisibility.Visible
          ? "resource node not found"
          : "resource node not visible",
      );
      return;
    }

    this.issueGatherCommands(workers, resourceTarget);
  }

  private async issueGatherNearestReachableCommand(
    unit: UnitState,
    targets: readonly { id: string; point: GridPoint }[],
  ): Promise<IssueCommandResult | null> {
    let lastResult: IssueCommandResult | null = null;

    for (const target of this.sortResourceTargetsByDistance(unit.position, targets)) {
      const result = await this.issueGatherCommand(unit, target, true);

      lastResult = result;
      if (result?.ok) {
        return result;
      }
    }

    if (lastResult && !lastResult.ok) {
      this.showCommandFeedback(lastResult.reason);
    }

    return lastResult;
  }

  private issueGatherCommand(unit: UnitState, target: { id: string; point: GridPoint }): Promise<IssueCommandResult | null>;
  private issueGatherCommand(
    unit: UnitState,
    target: { id: string; point: GridPoint },
    suppressFeedback: boolean,
  ): Promise<IssueCommandResult | null>;
  private issueGatherCommand(
    unit: UnitState,
    target: { id: string; point: GridPoint },
    suppressFeedback = false,
  ): Promise<IssueCommandResult | null> {
    const envelope: CommandEnvelope = {
      sessionId: this.launchContext?.session?.id ?? "offline-skirmish",
      playerId: this.localPlayerId,
      issuedAtTick: this.worldState.tick,
      command: {
        type: "gather",
        unitId: unit.id,
        resourceId: target.id,
      },
    };

    return this.issueCommandEnvelopeWithOptions(envelope, { suppressFeedback });
  }

  private issueAttackMoveAtScreenPoint(unitIds: readonly string[], point: Phaser.Math.Vector2): void {
    const commandableUnits = unitIds
      .map((unitId) => this.worldState.units[unitId])
      .filter((unit): unit is UnitState => unit !== undefined && unitCanPerformAction(unit.kind, "attack-move"));

    if (commandableUnits.length === 0) {
      return;
    }

    const enemy = this.findNearestVisibleEnemyToLocalUnits(commandableUnits);
    const worldPoint = this.screenToWorldPoint(point);
    const enemyTarget = this.isScreenPointInWorldField(point)
      ? this.findVisibleEnemyUnitAtWorldPoint(worldPoint.x, worldPoint.y)
      : null;
    const target = enemyTarget
      ? this.clampGridPoint({ x: Math.round(enemyTarget.position.x), y: Math.round(enemyTarget.position.y) })
      : this.isScreenPointInWorldField(point)
        ? this.getGridPointFromScreenPoint(point)
      : enemy?.position ?? this.findEnemySpawnPoint() ?? {
          x: this.map.width - 4,
          y: this.map.height - 4,
        };

    const formationTargets = enemyTarget ? [] : this.getFormationTargets(target, commandableUnits.length);
    const commandPromises = commandableUnits.map((unit, index) => {
      const command: CommandEnvelope["command"] = enemyTarget
        ? {
            type: "attack-unit",
            unitId: unit.id,
            targetUnitId: enemyTarget.id,
          }
        : {
            type: "attack-move",
            unitId: unit.id,
            target: formationTargets[index] ?? target,
          };
      const envelope: CommandEnvelope = {
        sessionId: this.launchContext?.session?.id ?? "offline-skirmish",
        playerId: this.localPlayerId,
        issuedAtTick: this.worldState.tick,
        command,
      };

      return this.issueCommandEnvelope(envelope);
    });

    void Promise.all(commandPromises).then((results) => {
      this.syncWorldFromTransport(true);
      this.emitSelectionChanged();
      this.syncUnitRenderables();
      this.publishMinimapEntities();

      if (this.hasAcceptedCommand(results)) {
        this.playUnitAudio(commandableUnits, "attack");
        this.showMoveTargetMarker(target);
      }
    });
  }

  private issuePatrolAtScreenPoint(unitIds: readonly string[], point: Phaser.Math.Vector2): void {
    const target = this.getGridPointFromScreenPoint(point);
    const commandableUnits = unitIds
      .map((unitId) => this.worldState.units[unitId])
      .filter((unit): unit is UnitState => unit !== undefined && unitCanPerformAction(unit.kind, "patrol"));

    if (commandableUnits.length === 0) {
      return;
    }

    const formationTargets = this.getFormationTargets(target, commandableUnits.length);
    const commandPromises = commandableUnits.map((unit, index) => {
      const envelope: CommandEnvelope = {
        sessionId: this.launchContext?.session?.id ?? "offline-skirmish",
        playerId: this.localPlayerId,
        issuedAtTick: this.worldState.tick,
        command: {
          type: "patrol",
          unitId: unit.id,
          target: formationTargets[index] ?? target,
        },
      };

      return this.issueCommandEnvelope(envelope);
    });

    void Promise.all(commandPromises).then((results) => {
      this.syncWorldFromTransport(true);
      this.syncUnitRenderables();
      this.publishMinimapEntities();

      if (this.hasAcceptedCommand(results)) {
        this.playUnitAudio(commandableUnits, "move");
        this.showMoveTargetMarker(target);
      }
    });
  }

  private publishMinimapMap(): void {
    const bounds = this.getWorldFieldBounds();
    const view = { map: this.map, worldBounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } };

    this.registry.set(MINIMAP_MAP_REGISTRY_KEY, view);
    this.game.events.emit(MINIMAP_MAP_CHANGED_EVENT, view);
  }

  private publishPlayerEconomy(): void {
    const resources = this.worldState.playerResources[this.localPlayerId] ?? { food: 0, wood: 0, gold: 0, stone: 0 };
    const view: PlayerEconomyView = {
      playerId: this.localPlayerId,
      resources: { ...resources },
      population: getPlayerPopulationState(this.worldState, this.localPlayerId),
      research: this.createPlayerResearchView(this.localPlayerId),
    };

    this.registry.set(PLAYER_ECONOMY_REGISTRY_KEY, view);
    this.game.events.emit(PLAYER_ECONOMY_CHANGED_EVENT, view);
  }

  private createPlayerResearchView(playerId: string): PlayerEconomyView["research"] {
    const completed = Object.entries(this.worldState.playerResearch[playerId]?.completed ?? {})
      .filter(([, done]) => done)
      .map(([research]) => research as ResearchDefinitionId);
    const pending = Object.values(this.worldState.units)
      .filter((unit) => unit.playerId === playerId)
      .flatMap((unit) => unit.researchQueue?.map((item) => item.research) ?? []);

    return {
      completed,
      pending: Array.from(new Set(pending)),
    };
  }

  private publishBattlefieldSummary(): void {
    const view: BattlefieldSummaryView = {
      playerId: this.localPlayerId,
      local: this.createBattlefieldSideSummary((unit) => this.arePlayersAllied(this.localPlayerId, unit.playerId)),
      visibleEnemy: this.createBattlefieldSideSummary(
        (unit) => this.isEnemyPlayer(unit.playerId) && this.isUnitVisibleToLocalPlayer(unit),
      ),
      environment: { ...this.worldState.environment },
    };

    this.registry.set(BATTLEFIELD_SUMMARY_REGISTRY_KEY, view);
    this.game.events.emit(BATTLEFIELD_SUMMARY_CHANGED_EVENT, view);
  }

  private createBattlefieldSideSummary(matchesUnit: (unit: UnitState) => boolean): BattlefieldSideSummaryView {
    const summary: BattlefieldSideSummaryView = { units: 0, workers: 0, idleWorkers: 0, fighters: 0, buildings: 0 };

    for (const unit of Object.values(this.worldState.units)) {
      if (!matchesUnit(unit)) {
        continue;
      }

      const definition = unitDefinitions[unit.kind];
      summary.units += 1;

      if (definition.category === "building") {
        summary.buildings += 1;
      } else if (definition.category === "worker") {
        summary.workers += 1;
        if (this.isIdleWorker(unit)) {
          summary.idleWorkers += 1;
        }
      } else {
        summary.fighters += 1;
      }
    }

    return summary;
  }

  private publishMinimapEntities(): void {
    const view = {
      entities: Object.values(this.worldState.units)
        .filter((unit) => this.isUnitVisibleToLocalPlayer(unit))
        .map((unit) => ({
          id: unit.id,
          playerId: unit.playerId,
          faction: this.getPlayerFaction(unit.playerId),
          kind: unit.kind,
          position: { ...unit.position },
          selected: this.selectedUnitIds.has(unit.id),
        })),
    };

    this.registry.set(MINIMAP_ENTITIES_REGISTRY_KEY, view);
    this.game.events.emit(MINIMAP_ENTITIES_CHANGED_EVENT, view);
  }

  private publishMinimapVisibility(): void {
    this.registry.set(MINIMAP_VISIBILITY_REGISTRY_KEY, this.playerVisibility);
    this.game.events.emit(MINIMAP_VISIBILITY_CHANGED_EVENT, this.playerVisibility);
  }

  private publishMinimapViewport(force = false): void {
    if (!force && this.time.now - this.lastViewportEmitAt < VIEWPORT_EVENT_INTERVAL_MS) {
      this.viewportDirty = true;
      return;
    }

    const camera = this.cameras.main;
    const bounds = this.getWorldFieldBounds();
    const view = {
      viewportWorldCorners: [
        this.screenToWorldPoint(new Phaser.Math.Vector2(0, 0)),
        this.screenToWorldPoint(new Phaser.Math.Vector2(this.scale.width, 0)),
        this.screenToWorldPoint(new Phaser.Math.Vector2(this.scale.width, this.scale.height)),
        this.screenToWorldPoint(new Phaser.Math.Vector2(0, this.scale.height)),
      ].map((point) => ({ x: point.x, y: point.y })),
      worldBounds: {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      },
      zoom: camera.zoom,
    };

    this.lastViewportEmitAt = this.time.now;
    this.viewportDirty = false;
    this.registry.set(MINIMAP_VIEWPORT_REGISTRY_KEY, view);
    this.game.events.emit(MINIMAP_VIEWPORT_CHANGED_EVENT, view);
  }

  private flushViewportIfDirty(time: number): void {
    if (this.viewportDirty && time - this.lastViewportEmitAt >= VIEWPORT_EVENT_INTERVAL_MS) {
      this.publishMinimapViewport(true);
    }
  }

  private getGridPointFromScreenPoint(point: Phaser.Math.Vector2): GridPoint {
    const worldPoint = this.screenToWorldPoint(point);
    const cartPoint = isoToCart(
      {
        x: worldPoint.x - this.mapOrigin.x,
        y: worldPoint.y - this.mapOrigin.y,
      },
      this.map.tileWidth,
      this.map.tileHeight,
    );

    return this.clampGridPoint({
      x: Math.round(cartPoint.x),
      y: Math.round(cartPoint.y),
    });
  }

  private updateTerrainDebugHover(): void {
    if (!this.terrainDebugEnabled || !this.isScreenPointInWorldField(this.virtualCursorScreen) || this.isPointerOverTerrainDebugPanel()) {
      this.hideTerrainDebugHover();
      return;
    }

    const point = this.getGridPointFromScreenPoint(this.virtualCursorScreen);
    const isSameTile = this.hoveredTerrainDebugTile?.x === point.x && this.hoveredTerrainDebugTile.y === point.y;

    if (!isSameTile) {
      this.hoveredTerrainDebugTile = point;
      this.drawTerrainDebugHighlight(point);
      this.renderTerrainDebugTooltip(this.getTerrainDebugTileInfo(point));
    }

    this.positionTerrainDebugTooltip();
  }

  private hideTerrainDebugHover(): void {
    this.hoveredTerrainDebugTile = null;
    this.terrainDebugHighlight?.clear().setVisible(false);

    if (this.terrainDebugTooltip) {
      this.terrainDebugTooltip.hidden = true;
    }
  }

  private isPointerOverTerrainDebugPanel(): boolean {
    if (!this.terrainDebugPanel) {
      return false;
    }

    const hoveredElement = document.elementFromPoint(this.virtualCursorScreen.x, this.virtualCursorScreen.y);

    return hoveredElement ? this.terrainDebugPanel.contains(hoveredElement) : false;
  }

  private drawTerrainDebugHighlight(point: GridPoint): void {
    if (!this.terrainDebugHighlight) {
      return;
    }

    const iso = cartToIso(point, this.map.tileWidth, this.map.tileHeight);
    const worldX = this.mapOrigin.x + iso.x;
    const worldY = this.mapOrigin.y + iso.y;
    const halfWidth = this.map.tileWidth / 2;
    const halfHeight = this.map.tileHeight / 2;
    const diamond = [
      new Phaser.Geom.Point(worldX, worldY - halfHeight),
      new Phaser.Geom.Point(worldX + halfWidth, worldY),
      new Phaser.Geom.Point(worldX, worldY + halfHeight),
      new Phaser.Geom.Point(worldX - halfWidth, worldY),
    ];

    this.terrainDebugHighlight
      .clear()
      .setVisible(true)
      .fillStyle(0x9fffa2, 0.12)
      .fillPoints(diamond, true)
      .lineStyle(2, 0xcfff7a, 0.95)
      .strokePoints(diamond, true);
  }

  private getTerrainDebugTileInfo(point: GridPoint): TerrainDebugTileInfo {
    const tile = getTileAt(this.map, point.x, point.y);
    const neighbors = this.getElevationNeighbors(point.x, point.y);
    const transitionSlot = resolveElevationTerrainSlot(tile.elevation, neighbors);
    const assets: TerrainDebugAssetInfo[] = [];
    const flatVisual = this.getFlatTerrainVisualForTerrain(tile.terrain);
    const flatFrame = flatVisual ? this.pickTerrainFrame(flatVisual, "base", point.x, point.y) : null;

    if (tile.elevation <= 0) {
      assets.push(this.createTerrainDebugAssetInfo("base", flatVisual, "base", flatFrame));
    }

    if (transitionSlot) {
      const visualTerrain = this.resolveElevationVisualTerrain(tile.terrain, tile.elevation, neighbors);
      const terrainVisual = this.getTerrainVisualForTerrain(visualTerrain);
      const frame = terrainVisual ? this.pickTerrainFrame(terrainVisual, transitionSlot, point.x, point.y) : null;

      if (tile.elevation > 0 && transitionSlot !== "plateauTop") {
        const lowerFrame = terrainVisual ? this.pickTerrainFrame(terrainVisual, "plateauTop", point.x, point.y) : null;

        assets.push(this.createTerrainDebugAssetInfo(`lower plateau L${tile.elevation}`, terrainVisual, "plateauTop", lowerFrame));
      }

      assets.push(this.createTerrainDebugAssetInfo(`elevation L${transitionSlot === "plateauTop" ? tile.elevation : tile.elevation + 1}`, terrainVisual, transitionSlot, frame));
    }

    return {
      point,
      terrain: tile.terrain,
      elevation: tile.elevation,
      transitionSlot,
      assets,
    };
  }

  private createTerrainDebugAssetInfo(
    label: string,
    visual: TerrainVisual | null,
    slot: TerrainKindSlot | "base" | null,
    frame: FrameRef | null,
  ): TerrainDebugAssetInfo {
    return {
      label,
      visualId: visual?.id ?? null,
      slot,
      fileName: frame?.fileName ?? null,
      textureKey: frame?.textureKey ?? null,
      loaded: frame ? this.textures.exists(frame.textureKey) : false,
    };
  }

  private renderTerrainDebugTooltip(info: TerrainDebugTileInfo): void {
    if (!this.terrainDebugTooltip) {
      return;
    }

    const title = document.createElement("div");
    title.className = "terrain-debug-tooltip__title";
    title.textContent = `Tile ${info.point.x}, ${info.point.y}`;

    const rows = document.createElement("div");
    rows.className = "terrain-debug-tooltip__rows";
    this.appendTerrainDebugRow(rows, "terrain", info.terrain);
    this.appendTerrainDebugRow(rows, "elevation", String(info.elevation));
    this.appendTerrainDebugRow(rows, "slot", info.transitionSlot ?? "flat");
    this.appendTerrainDebugRow(rows, "theme", this.activeTheme.id);

    const assets = document.createElement("div");
    assets.className = "terrain-debug-tooltip__assets";
    for (const asset of info.assets) {
      const row = document.createElement("div");
      row.className = "terrain-debug-tooltip__asset";

      const label = document.createElement("span");
      label.className = "terrain-debug-tooltip__asset-label";
      label.textContent = asset.label;

      const file = document.createElement("code");
      file.textContent = asset.fileName ?? "no themed asset";

      const meta = document.createElement("span");
      meta.className = asset.loaded ? "terrain-debug-tooltip__asset-meta" : "terrain-debug-tooltip__asset-meta terrain-debug-tooltip__asset-meta--missing";
      meta.textContent = `${asset.visualId ?? "fallback"} / ${asset.slot ?? "—"}${asset.loaded ? "" : " / missing"}`;

      row.append(label, file, meta);
      assets.append(row);
    }

    this.terrainDebugTooltip.replaceChildren(title, rows, assets);
    this.terrainDebugTooltip.hidden = false;
  }

  private appendTerrainDebugRow(parent: HTMLElement, labelText: string, valueText: string): void {
    const row = document.createElement("div");
    row.className = "terrain-debug-tooltip__row";

    const label = document.createElement("span");
    label.textContent = labelText;

    const value = document.createElement("strong");
    value.textContent = valueText;

    row.append(label, value);
    parent.append(row);
  }

  private positionTerrainDebugTooltip(): void {
    if (!this.terrainDebugTooltip || this.terrainDebugTooltip.hidden) {
      return;
    }

    const margin = 14;
    const offset = 18;
    const tooltipWidth = this.terrainDebugTooltip.offsetWidth;
    const tooltipHeight = this.terrainDebugTooltip.offsetHeight;
    const maxLeft = Math.max(margin, globalThis.innerWidth - tooltipWidth - margin);
    const maxTop = Math.max(margin, globalThis.innerHeight - tooltipHeight - margin);
    const left = Phaser.Math.Clamp(this.virtualCursorScreen.x + offset, margin, maxLeft);
    const top = Phaser.Math.Clamp(this.virtualCursorScreen.y + offset, margin, maxTop);

    this.terrainDebugTooltip.style.left = `${left}px`;
    this.terrainDebugTooltip.style.top = `${top}px`;
  }

  private getFormationTargets(origin: GridPoint, count: number): GridPoint[] {
    return createFormationTargets(origin, count, {
      width: this.map.width,
      height: this.map.height,
    });
  }

  private showMoveTargetMarker(target: GridPoint): void {
    const iso = cartToIso(target, this.map.tileWidth, this.map.tileHeight);
    const worldX = this.mapOrigin.x + iso.x;
    const worldY = this.mapOrigin.y + iso.y;
    const marker = this.add.graphics();
    const halfWidth = this.map.tileWidth / 4;
    const halfHeight = this.map.tileHeight / 4;

    marker.setDepth(worldY + 30);
    marker.lineStyle(2, 0xf4df8e, 0.95);
    marker.strokePoints(
      [
        new Phaser.Geom.Point(worldX, worldY - halfHeight),
        new Phaser.Geom.Point(worldX + halfWidth, worldY),
        new Phaser.Geom.Point(worldX, worldY + halfHeight),
        new Phaser.Geom.Point(worldX - halfWidth, worldY),
      ],
      true,
    );

    this.tweens.add({
      targets: marker,
      alpha: 0,
      duration: 420,
      ease: "Sine.easeOut",
      onComplete: () => marker.destroy(),
    });
  }

  private updateBuildPlacementPreview(): void {
    const pending = this.pendingBuildPlacement;

    if (!pending || !this.isScreenPointInWorldField(this.virtualCursorScreen)) {
      this.buildPlacementPreview?.setVisible(false);
      return;
    }

    const target = this.getGridPointFromScreenPoint(this.virtualCursorScreen);
    const isValid = this.isBuildTargetValid(target, pending);
    const signature = `${pending.building}:${target.x}:${target.y}:${isValid ? "ok" : "blocked"}`;

    if (signature === this.buildPlacementPreviewSignature) {
      this.buildPlacementPreview?.setVisible(true);
      return;
    }

    const preview = this.ensureBuildPlacementPreview();

    preview.clear();
    preview.setVisible(true);
    preview.setDepth(SCREEN_OVERLAY_DEPTH - 90);

    const fillColor = isValid ? 0x5fbf80 : 0xd36454;
    const strokeColor = isValid ? 0xaee8ba : 0xffb0a5;

    for (const tile of this.getBuildingFootprintTiles(target, pending.building)) {
      this.drawBuildPlacementTile(preview, tile, fillColor, strokeColor);
    }

    this.buildPlacementPreviewSignature = signature;
  }

  private ensureBuildPlacementPreview(): Phaser.GameObjects.Graphics {
    if (!this.buildPlacementPreview) {
      this.buildPlacementPreview = this.add.graphics().setScrollFactor(1);
    }

    return this.buildPlacementPreview;
  }

  private drawBuildPlacementTile(
    graphics: Phaser.GameObjects.Graphics,
    tile: GridPoint,
    fillColor: number,
    strokeColor: number,
  ): void {
    const iso = cartToIso(tile, this.map.tileWidth, this.map.tileHeight);
    const worldX = this.mapOrigin.x + iso.x;
    const worldY = this.mapOrigin.y + iso.y;
    const halfWidth = this.map.tileWidth / 2;
    const halfHeight = this.map.tileHeight / 2;
    const points = [
      new Phaser.Geom.Point(worldX, worldY - halfHeight),
      new Phaser.Geom.Point(worldX + halfWidth, worldY),
      new Phaser.Geom.Point(worldX, worldY + halfHeight),
      new Phaser.Geom.Point(worldX - halfWidth, worldY),
    ];

    graphics.fillStyle(fillColor, 0.18);
    graphics.fillPoints(points, true);
    graphics.lineStyle(2, strokeColor, 0.8);
    graphics.strokePoints(points, true);
  }

  private screenToWorldPoint(point: Phaser.Math.Vector2): Phaser.Math.Vector2 {
    const camera = this.cameras.main;
    const originX = camera.width * camera.originX;
    const originY = camera.height * camera.originY;

    return new Phaser.Math.Vector2(
      camera.scrollX + originX + (point.x - camera.x - originX) / camera.zoom,
      camera.scrollY + originY + (point.y - camera.y - originY) / camera.zoom,
    );
  }

  private worldToScreenPoint(point: Phaser.Math.Vector2): Phaser.Math.Vector2 {
    const camera = this.cameras.main;
    const originX = camera.width * camera.originX;
    const originY = camera.height * camera.originY;

    return new Phaser.Math.Vector2(
      camera.x + originX + (point.x - camera.scrollX - originX) * camera.zoom,
      camera.y + originY + (point.y - camera.scrollY - originY) * camera.zoom,
    );
  }

  private isScreenPointInWorldField(point: Phaser.Math.Vector2): boolean {
    return point.x >= 0 && point.x <= this.scale.width && point.y >= 0 && point.y < this.getHudTop();
  }

  private getClampedFieldScreenPoint(point: Phaser.Math.Vector2): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(
      Phaser.Math.Clamp(point.x, 0, this.scale.width),
      Phaser.Math.Clamp(point.y, 0, this.getHudTop()),
    );
  }

  private getScreenRectangle(start: Phaser.Math.Vector2, end: Phaser.Math.Vector2): Phaser.Geom.Rectangle {
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);

    return new Phaser.Geom.Rectangle(x, y, Math.abs(start.x - end.x), Math.abs(start.y - end.y));
  }

  private getUnitScreenPosition(unit: UnitState): Phaser.Math.Vector2 {
    return this.worldToScreenPoint(this.getUnitWorldPosition(unit));
  }

  private getUnitSelectionScreenBounds(unit: UnitState): Phaser.Geom.Rectangle {
    const position = this.getUnitScreenPosition(unit);
    const radius = unitDefinitions[unit.kind].selectionRadius;
    const zoom = this.cameras.main.zoom;
    const padding = 4;
    const halfWidth = radius * 1.6 * zoom + padding;
    const top = radius * zoom + padding;
    const bottom = radius * 1.3 * zoom + padding;

    return new Phaser.Geom.Rectangle(position.x - halfWidth, position.y - top, halfWidth * 2, top + bottom);
  }

  private getHudTop(): number {
    const hudHeight = Phaser.Math.Clamp(this.scale.height * 0.26, 178, 220);

    return this.scale.height - hudHeight;
  }

  private clampCameraToWorld(): void {
    const bounds = this.getWorldFieldBounds();
    const camera = this.cameras.main;
    const originX = camera.width * camera.originX;
    const originY = camera.height * camera.originY;
    const centerX = camera.scrollX + originX;
    const centerY = camera.scrollY + originY;
    const clampedCenterX = Phaser.Math.Clamp(centerX, bounds.left, bounds.right);
    const clampedCenterY = Phaser.Math.Clamp(centerY, bounds.top, bounds.bottom);

    camera.scrollX = clampedCenterX - originX;
    camera.scrollY = clampedCenterY - originY;
  }

  private centerCameraOnWorldPoint(point: MinimapPoint): void {
    const camera = this.cameras.main;
    const originX = camera.width * camera.originX;
    const originY = camera.height * camera.originY;

    camera.scrollX = point.x - originX;
    camera.scrollY = point.y - originY;
    this.clampCameraToWorld();
  }

  private centerCameraOnGridPoint(point: GridPoint): void {
    const worldPoint = this.getGridWorldPoint(point);

    this.centerCameraOnWorldPoint(worldPoint);
    this.publishMinimapViewport(true);
  }

  private centerCameraOnLocalStart(): void {
    if (this.map.sourceInitialView) {
      this.centerCameraOnGridPoint(this.map.sourceInitialView);
      return;
    }

    const localUnits = Object.values(this.worldState.units).filter((unit) => unit.playerId === this.localPlayerId);
    const anchor = localUnits.find((unit) => unitDefinitions[unit.kind].category === "building") ?? localUnits[0];

    if (anchor) {
      const position = this.getUnitWorldPosition(anchor);
      this.cameras.main.centerOn(position.x, position.y);
      return;
    }

    const spawn = this.map.spawnPoints[0] ?? { x: 0, y: 0 };
    const iso = cartToIso(spawn, this.map.tileWidth, this.map.tileHeight);

    this.cameras.main.centerOn(this.mapOrigin.x + iso.x, this.mapOrigin.y + iso.y);
  }

  private getWorldFieldBounds(): Phaser.Geom.Rectangle {
    const halfWidth = this.map.tileWidth / 2;
    const halfHeight = this.map.tileHeight / 2;
    const top = new Phaser.Math.Vector2(this.mapOrigin.x, this.mapOrigin.y - halfHeight);
    const rightIso = cartToIso({ x: this.map.width - 1, y: 0 }, this.map.tileWidth, this.map.tileHeight);
    const bottomIso = cartToIso(
      { x: this.map.width - 1, y: this.map.height - 1 },
      this.map.tileWidth,
      this.map.tileHeight,
    );
    const leftIso = cartToIso({ x: 0, y: this.map.height - 1 }, this.map.tileWidth, this.map.tileHeight);
    const corners = [
      top,
      new Phaser.Math.Vector2(this.mapOrigin.x + rightIso.x + halfWidth, this.mapOrigin.y + rightIso.y),
      new Phaser.Math.Vector2(this.mapOrigin.x + bottomIso.x, this.mapOrigin.y + bottomIso.y + halfHeight),
      new Phaser.Math.Vector2(this.mapOrigin.x + leftIso.x - halfWidth, this.mapOrigin.y + leftIso.y),
    ];
    const xs = corners.map((corner) => corner.x);
    const ys = corners.map((corner) => corner.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return new Phaser.Geom.Rectangle(minX, minY, maxX - minX, maxY - minY);
  }

  private clampGridPoint(point: GridPoint): GridPoint {
    return {
      x: Phaser.Math.Clamp(point.x, 0, this.map.width - 1),
      y: Phaser.Math.Clamp(point.y, 0, this.map.height - 1),
    };
  }

  private selectInitialUnit(playerId: string): void {
    const units = Object.values(this.worldState.units).filter((unit) => unit.playerId === playerId);
    const preferredUnit =
      units.find((unit) => unitDefinitions[unit.kind].category === "building") ?? units[0];

    if (preferredUnit) {
      this.selectUnits([preferredUnit], { audio: false });
    }
  }

  private playUnitAudio(units: readonly UnitState[], action: UnitAudioAction): void {
    const cueKey = this.resolveUnitAudioCue(units, action);

    if (cueKey) {
      this.playGameplayAudio(cueKey);
    }
  }

  private resolveUnitAudioCue(units: readonly UnitState[], action: UnitAudioAction): GameplayAudioCueKey | null {
    for (const unit of units) {
      const cueKey = UNIT_AUDIO_CUES[unit.kind]?.[action];

      if (cueKey) {
        return cueKey;
      }
    }

    return null;
  }

  private playGameplayAudio(cueKey: GameplayAudioCueKey): void {
    if (this.audioMuted || this.sound.mute) {
      return;
    }

    const cue = GAMEPLAY_AUDIO_CUE_BY_KEY.get(cueKey);

    if (!cue || !this.cache.audio.exists(cue.key)) {
      return;
    }

    const now = this.time.now;
    const lastPlayedAt = this.lastAudioCuePlayedAt.get(cueKey) ?? Number.NEGATIVE_INFINITY;

    if (now - lastPlayedAt < cue.cooldownMs) {
      return;
    }

    try {
      if (this.sound.play(cue.key, { volume: cue.volume, loop: cue.loop ?? false })) {
        this.lastAudioCuePlayedAt.set(cueKey, now);
      }
    } catch (error) {
      console.warn("Failed to play gameplay audio cue", { cueKey, error });
    }
  }

  private syncConstructionAudioState(playCompletedAudio: boolean): void {
    const activeConstructionIds = new Set<string>();
    let localConstructionCompleted = false;

    for (const unit of Object.values(this.worldState.units)) {
      if (!this.arePlayersAllied(this.localPlayerId, unit.playerId)) {
        continue;
      }

      if (unit.construction) {
        activeConstructionIds.add(unit.id);
      }
    }

    for (const unitId of this.trackedConstructionUnitIds) {
      if (activeConstructionIds.has(unitId)) {
        continue;
      }

      const unit = this.worldState.units[unitId];

      if (unit && this.arePlayersAllied(this.localPlayerId, unit.playerId) && !unit.construction) {
        localConstructionCompleted = true;
      }
    }

    this.trackedConstructionUnitIds.clear();
    activeConstructionIds.forEach((unitId) => this.trackedConstructionUnitIds.add(unitId));

    if (playCompletedAudio && localConstructionCompleted) {
      this.playGameplayAudio(BUILD_DONE_AUDIO_CUE_KEY);
    }
  }

  private syncProgressAudioState(playCompletedAudio: boolean): void {
    const currentUnitIds = new Set<string>();
    const currentCompletedResearchKeys = new Set<string>();
    let localUnitCreated = false;
    let localResearchCompleted = false;

    for (const unit of Object.values(this.worldState.units)) {
      currentUnitIds.add(unit.id);

      if (
        playCompletedAudio &&
        !this.trackedUnitIds.has(unit.id) &&
        this.arePlayersAllied(this.localPlayerId, unit.playerId) &&
        !unit.construction
      ) {
        localUnitCreated = true;
      }
    }

    for (const [playerId, researchState] of Object.entries(this.worldState.playerResearch)) {
      if (!this.arePlayersAllied(this.localPlayerId, playerId)) {
        continue;
      }

      for (const [research, completed] of Object.entries(researchState.completed)) {
        if (!completed) {
          continue;
        }

        const researchKey = `${playerId}:${research}`;
        currentCompletedResearchKeys.add(researchKey);

        if (playCompletedAudio && !this.trackedCompletedResearchKeys.has(researchKey)) {
          localResearchCompleted = true;
        }
      }
    }

    this.trackedUnitIds.clear();
    currentUnitIds.forEach((unitId) => this.trackedUnitIds.add(unitId));
    this.trackedCompletedResearchKeys.clear();
    currentCompletedResearchKeys.forEach((researchKey) => this.trackedCompletedResearchKeys.add(researchKey));

    if (localUnitCreated) {
      this.playGameplayAudio(TRAINING_DONE_AUDIO_CUE_KEY);
    }

    if (localResearchCompleted) {
      this.playGameplayAudio(UPGRADE_DONE_AUDIO_CUE_KEY);
    }
  }

  private resolveLaunchMap(data: GameLaunchContext): MapDefinition {
    if (data.mapDefinition) {
      return data.mapDefinition;
    }

    if (data.mapId) {
      return createMapDefinitionFromId(data.mapId, { randomSize: data.resumeSnapshot?.map.width }) ?? defaultMap;
    }

    return defaultMap;
  }

  private resolveLaunchPlayerVisibility(
    savedVisibility: SerializedPlayerVisibilityState | undefined,
    map: MapDefinition,
  ): PlayerVisibilityState {
    const visibility = deserializePlayerVisibilityState(savedVisibility);

    return visibility && this.isPlayerVisibilityCompatibleWithMap(visibility, map)
      ? visibility
      : createPlayerVisibility(map);
  }

  private isPlayerVisibilityCompatibleWithMap(visibility: PlayerVisibilityState, map: MapDefinition): boolean {
    return visibility.width === map.width && visibility.height === map.height && visibility.tiles.length === map.width * map.height;
  }

  private selectUnits(units: UnitState[], options: { audio?: boolean; append?: boolean } = {}): void {
    this.cancelBuildPlacement();
    this.cancelPendingTargetAction();

    if (!options.append) {
      this.selectedUnitIds.clear();
    }

    const selectedUnits: UnitState[] = [];

    for (const unit of units) {
      if (this.isUnitSelectable(unit)) {
        this.selectedUnitIds.add(unit.id);
        selectedUnits.push(unit);
      }
    }

    if (options.audio !== false) {
      this.playUnitAudio(selectedUnits, "select");
    }
    this.emitSelectionChanged();
    this.syncUnitRenderables();
    this.publishMinimapEntities();
  }

  private clearSelection(): void {
    this.cancelBuildPlacement();
    this.cancelPendingTargetAction();
    this.selectedUnitIds.clear();
    this.emitSelectionChanged();
    this.syncUnitRenderables();
    this.publishMinimapEntities();
  }

  private emitSelectionChanged(): void {
    const selection = this.getSelectedUnits().map((unit) => toSelectedEntityView(unit));

    this.registry.set(SELECTED_ENTITY_REGISTRY_KEY, selection);
    this.game.events.emit(SELECTED_ENTITY_CHANGED_EVENT, selection);
  }

  private getSelectedUnits(): UnitState[] {
    return Object.values(this.worldState.units).filter((unit) => this.selectedUnitIds.has(unit.id) && this.isUnitSelectable(unit));
  }

  private syncWorldFromTransport(force = false): void {
    const snapshot = this.sessionTransport?.getSnapshot();

    if (!snapshot) {
      return;
    }

    if (!force && snapshot === this.worldState && snapshot.tick === this.lastSyncedTick) {
      return;
    }

    this.worldState = snapshot;
    this.map = snapshot.map;
    this.lastSyncedTick = snapshot.tick;
    const dirtyFogChunkCount = this.refreshLocalVisibility();
    this.redrawDirtyFogOverlay(dirtyFogChunkCount);
    this.pruneMissingSelections();
    this.syncResourceRenderables();
    this.syncUnitRenderables();
    this.syncConstructionAudioState(true);
    this.syncProgressAudioState(true);
    this.playCombatEvents();
    this.publishPlayerEconomy();
    this.publishBattlefieldSummary();
    this.emitSelectionChanged();
    if (dirtyFogChunkCount > 0) {
      this.publishMinimapVisibility();
    }
    this.publishMinimapEntities();
    this.updateScenarioStatusOverlay();
    this.redrawObjectiveAreaOverlay();
    this.updateObjectiveTrackerOverlay();
    this.updateMissionResultOverlay();
  }

  private pruneMissingSelections(): void {
    for (const selectedUnitId of this.selectedUnitIds) {
      const unit = this.worldState.units[selectedUnitId];

      if (!unit || !this.isUnitSelectable(unit)) {
        this.selectedUnitIds.delete(selectedUnitId);
      }
    }

    if (this.pendingTargetAction) {
      const liveTargetingUnitIds = this.pendingTargetAction.selectedEntityIds.filter((unitId) => {
        const unit = this.worldState.units[unitId];

        return unit !== undefined && this.isUnitSelectable(unit) && unitCanPerformAction(unit.kind, this.pendingTargetAction!.actionId);
      });

      if (liveTargetingUnitIds.length > 0) {
        this.pendingTargetAction.selectedEntityIds = liveTargetingUnitIds;
      } else {
        this.cancelPendingTargetAction();
      }
    }

    for (const group of [...this.controlGroups.keys()]) {
      this.getLiveControlGroupUnits(group);
    }
  }

  private findUnitAtWorldPoint(worldX: number, worldY: number): UnitState | null {
    // TODO: Add a grid/chunk spatial index if entity counts grow or profiling shows selection scans matter.
    let selectedUnit: UnitState | null = null;
    let selectedDistanceSq = Number.POSITIVE_INFINITY;
    let selectedPriority = Number.POSITIVE_INFINITY;

    for (const unit of Object.values(this.worldState.units)) {
      if (!this.isUnitSelectable(unit)) {
        continue;
      }

      const unitPosition = this.getUnitWorldPosition(unit);
      const radius = unitDefinitions[unit.kind].hitRadius;
      const deltaX = worldX - unitPosition.x;
      const deltaY = worldY - unitPosition.y;
      const distanceSq = deltaX * deltaX + deltaY * deltaY;
      const priority = this.getFriendlySelectionPriority(unit);

      if (
        distanceSq <= radius * radius &&
        (priority < selectedPriority || (priority === selectedPriority && distanceSq < selectedDistanceSq))
      ) {
        selectedUnit = unit;
        selectedDistanceSq = distanceSq;
        selectedPriority = priority;
      }
    }

    return selectedUnit;
  }

  private preferMobileUnitsForBoxSelection(units: UnitState[]): UnitState[] {
    const mobileUnits = units.filter((unit) => this.getFriendlySelectionPriority(unit) === 0);

    return mobileUnits.length > 0 ? mobileUnits : units;
  }

  private getFriendlySelectionPriority(unit: UnitState): number {
    return unitDefinitions[unit.kind].category === "building" ? 1 : 0;
  }

  private findVisibleEnemyUnitAtWorldPoint(worldX: number, worldY: number): UnitState | null {
    let selectedUnit: UnitState | null = null;
    let selectedDistanceSq = Number.POSITIVE_INFINITY;

    for (const unit of Object.values(this.worldState.units)) {
      if (!this.isEnemyPlayer(unit.playerId) || !this.isUnitVisibleToLocalPlayer(unit)) {
        continue;
      }

      const unitPosition = this.getUnitWorldPosition(unit);
      const radius = unitDefinitions[unit.kind].hitRadius;
      const deltaX = worldX - unitPosition.x;
      const deltaY = worldY - unitPosition.y;
      const distanceSq = deltaX * deltaX + deltaY * deltaY;

      if (distanceSq <= radius * radius && distanceSq < selectedDistanceSq) {
        selectedUnit = unit;
        selectedDistanceSq = distanceSq;
      }
    }

    return selectedUnit;
  }

  private findRepairTargetAtWorldPoint(worldX: number, worldY: number): UnitState | null {
    let selectedUnit: UnitState | null = null;
    let selectedDistanceSq = Number.POSITIVE_INFINITY;

    for (const unit of Object.values(this.worldState.units)) {
      if (!this.isRepairTarget(unit)) {
        continue;
      }

      const unitPosition = this.getUnitWorldPosition(unit);
      const radius = unitDefinitions[unit.kind].hitRadius;
      const deltaX = worldX - unitPosition.x;
      const deltaY = worldY - unitPosition.y;
      const distanceSq = deltaX * deltaX + deltaY * deltaY;

      if (distanceSq <= radius * radius && distanceSq < selectedDistanceSq) {
        selectedUnit = unit;
        selectedDistanceSq = distanceSq;
      }
    }

    return selectedUnit;
  }

  private findNearestRepairTargetForUnits(unitIds: readonly string[]): UnitState | null {
    const workers = unitIds
      .map((unitId) => this.worldState.units[unitId])
      .filter((unit): unit is UnitState => unit !== undefined && unitCanPerformAction(unit.kind, "repair"));

    if (workers.length === 0) {
      return null;
    }

    let selectedUnit: UnitState | null = null;
    let selectedDistanceSq = Number.POSITIVE_INFINITY;

    for (const unit of Object.values(this.worldState.units)) {
      if (!this.isRepairTarget(unit)) {
        continue;
      }

      for (const worker of workers) {
        const distanceSq = Phaser.Math.Distance.Squared(worker.position.x, worker.position.y, unit.position.x, unit.position.y);

        if (distanceSq < selectedDistanceSq) {
          selectedUnit = unit;
          selectedDistanceSq = distanceSq;
        }
      }
    }

    return selectedUnit;
  }

  private isRepairTarget(unit: UnitState): boolean {
    return (
      unit.playerId === this.localPlayerId &&
      this.isUnitVisibleToLocalPlayer(unit) &&
      unitDefinitions[unit.kind].category === "building" &&
      (unit.construction !== undefined || unit.health.current < unit.health.max)
    );
  }

  private isBuildTargetValid(
    target: GridPoint,
    pending: PendingBuildPlacement,
  ): boolean {
    return pending.builderUnitIds
      .map((unitId) => this.worldState.units[unitId])
      .some((unit) => this.canUnitBuildAtTarget(unit, pending.building, target));
  }

  private canUnitBuildAtTarget(
    unit: UnitState | undefined,
    building: BuildingDefinitionId,
    target: GridPoint,
  ): unit is UnitState {
    return (
      unit !== undefined &&
      unit.playerId === this.localPlayerId &&
      unitCanPerformAction(unit.kind, "build") &&
      !unit.construction &&
      validateBuildingPlacement(this.worldState, building, target).ok &&
      this.isBuildFootprintVisibleToLocalPlayer(target, building) &&
      findBuildWorkPath(this.worldState, unit, building, target) !== null
    );
  }

  private hasBuildCapableUnit(unitIds: readonly string[]): boolean {
    return unitIds.some((unitId) => {
      const unit = this.worldState.units[unitId];

      return (
        unit !== undefined &&
        unit.playerId === this.localPlayerId &&
        unitCanPerformAction(unit.kind, "build") &&
        !unit.construction
      );
    });
  }

  private isBuildFootprintVisibleToLocalPlayer(target: GridPoint, building: BuildingDefinitionId): boolean {
    return areTilesVisible(this.playerVisibility, this.getBuildingFootprintTiles(target, building));
  }

  private getBuildingFootprintTiles(target: GridPoint, building: BuildingDefinitionId): GridPoint[] {
    const definition = unitDefinitions[building];
    const width = Math.floor(definition.footprint.width);
    const height = Math.floor(definition.footprint.height);
    const originX = Math.round(target.x - (width - 1) / 2);
    const originY = Math.round(target.y - (height - 1) / 2);
    const tiles: GridPoint[] = [];

    if (width <= 0 || height <= 0) {
      return tiles;
    }

    for (let dy = 0; dy < height; dy += 1) {
      for (let dx = 0; dx < width; dx += 1) {
        tiles.push({ x: originX + dx, y: originY + dy });
      }
    }

    return tiles;
  }

  private collectResourceTargets(): { id: string; point: GridPoint }[] {
    const targets: { id: string; point: GridPoint }[] = [];

    for (let y = 0; y < this.map.height; y += 1) {
      for (let x = 0; x < this.map.width; x += 1) {
        const resource = getTileAt(this.map, x, y).resource;

        if (
          resource &&
          resource.amount > 0 &&
          getResourceNodeState(resource) === "active" &&
          this.isResourceVisibleToLocalPlayer({ x, y })
        ) {
          targets.push({ id: resource.id, point: { x, y } });
        }
      }
    }

    return targets;
  }

  private findResourceTargetAtGridPoint(point: GridPoint): { id: string; point: GridPoint } | null {
    const resource = getTileAt(this.map, point.x, point.y).resource;

    if (!resource || resource.amount <= 0 || getResourceNodeState(resource) !== "active" || !this.isResourceVisibleToLocalPlayer(point)) {
      return null;
    }

    return { id: resource.id, point: { ...point } };
  }

  private isResourceVisibleToLocalPlayer(point: GridPoint): boolean {
    return getTileVisibility(this.playerVisibility, point) === TileVisibility.Visible;
  }

  private findNearestResourceTarget(
    position: GridPoint,
    targets: readonly { id: string; point: GridPoint }[],
  ): { id: string; point: GridPoint } | null {
    let bestTarget: { id: string; point: GridPoint } | null = null;
    let bestDistanceSq = Number.POSITIVE_INFINITY;

    for (const target of targets) {
      const distanceSq = Phaser.Math.Distance.Squared(position.x, position.y, target.point.x, target.point.y);

      if (distanceSq < bestDistanceSq) {
        bestTarget = target;
        bestDistanceSq = distanceSq;
      }
    }

    return bestTarget;
  }

  private sortResourceTargetsByDistance(
    position: GridPoint,
    targets: readonly { id: string; point: GridPoint }[],
  ): { id: string; point: GridPoint }[] {
    return [...targets].sort((a, b) => {
      const distanceDelta =
        Phaser.Math.Distance.Squared(position.x, position.y, a.point.x, a.point.y) -
        Phaser.Math.Distance.Squared(position.x, position.y, b.point.x, b.point.y);

      return distanceDelta !== 0 ? distanceDelta : a.id.localeCompare(b.id);
    });
  }

  private findNearestVisibleEnemyToLocalUnits(units: readonly UnitState[]): UnitState | null {
    let bestEnemy: UnitState | null = null;
    let bestDistanceSq = Number.POSITIVE_INFINITY;

    for (const unit of units) {
      for (const candidate of Object.values(this.worldState.units)) {
        if (!this.isEnemyPlayer(candidate.playerId) || !this.isUnitVisibleToLocalPlayer(candidate)) {
          continue;
        }

        const distanceSq = Phaser.Math.Distance.Squared(
          unit.position.x,
          unit.position.y,
          candidate.position.x,
          candidate.position.y,
        );

        if (distanceSq < bestDistanceSq) {
          bestEnemy = candidate;
          bestDistanceSq = distanceSq;
        }
      }
    }

    return bestEnemy;
  }

  private findEnemySpawnPoint(): GridPoint | null {
    const enemyPlayerId = Object.keys(this.worldState.players).find((playerId) => this.isEnemyPlayer(playerId));
    const enemyPlayerIndex = enemyPlayerId ? Object.keys(this.worldState.players).indexOf(enemyPlayerId) : -1;

    return enemyPlayerIndex >= 0 ? this.map.spawnPoints[enemyPlayerIndex] ?? null : null;
  }

  private getUnitWorldPosition(unit: UnitState): Phaser.Math.Vector2 {
    return this.getGridPointWorldPosition(unit.position);
  }

  private getGridPointWorldPosition(point: GridPoint): Phaser.Math.Vector2 {
    const iso = cartToIso(point, this.map.tileWidth, this.map.tileHeight);

    return new Phaser.Math.Vector2(this.mapOrigin.x + iso.x, this.mapOrigin.y + iso.y - this.map.tileHeight / 2);
  }

  private refreshLocalVisibility(): number {
    const startedAt = this.perfEnabled ? performance.now() : 0;

    if (this.revealMapCheatActive) {
      const dirtyChunkCount = this.revealAllLocalVisibility();

      if (this.perfEnabled) {
        this.lastVisibilityDeltaMs = performance.now() - startedAt;
      }

      return dirtyChunkCount;
    }

    const update = updatePlayerVisibilityWithChanges(this.playerVisibility, this.worldState, this.localPlayerId, {
      dirtyChunks: this.fogChunkDirtyMask,
      chunkSize: TERRAIN_CHUNK_SIZE,
    });

    this.playerVisibility = update.visibility;

    if (this.perfEnabled) {
      this.lastVisibilityDeltaMs = performance.now() - startedAt;
    }

    return this.expandDirtyFogChunksForK01Transitions(update.dirtyChunkCount);
  }

  private revealAllLocalVisibility(): number {
    const tileCount = this.map.width * this.map.height;
    let changed = this.playerVisibility.width !== this.map.width ||
      this.playerVisibility.height !== this.map.height ||
      this.playerVisibility.tiles.length !== tileCount;

    if (!changed) {
      for (let index = 0; index < this.playerVisibility.tiles.length; index += 1) {
        if (this.playerVisibility.tiles[index] !== TileVisibility.Visible) {
          changed = true;
          break;
        }
      }
    }

    const tiles = new Uint8Array(tileCount);
    tiles.fill(TileVisibility.Visible);
    this.playerVisibility = {
      width: this.map.width,
      height: this.map.height,
      tiles,
    };

    if (!changed) {
      this.fogChunkDirtyMask.fill(0);
      return 0;
    }

    this.fogChunkDirtyMask.fill(1);
    return this.fogChunkDirtyMask.length;
  }

  private isUnitVisibleToLocalPlayer(unit: UnitState): boolean {
    if (unit.playerId === this.localPlayerId) {
      return true;
    }

    return getTileVisibility(this.playerVisibility, unit.position) === TileVisibility.Visible;
  }

  private isUnitSelectable(unit: UnitState): boolean {
    return unit.playerId === this.localPlayerId && this.isUnitVisibleToLocalPlayer(unit);
  }

  private configureFogChunkGrid(): void {
    this.disposeFogOverlay();
    this.disposeSourceFogStamps();
    this.fogChunksPerRow = Math.ceil(this.map.width / TERRAIN_CHUNK_SIZE);
    this.fogChunksPerColumn = Math.ceil(this.map.height / TERRAIN_CHUNK_SIZE);
    this.fogChunkDirtyMask = new Uint8Array(this.fogChunksPerRow * this.fogChunksPerColumn);
    this.fogChunks.length = this.fogChunkDirtyMask.length;
    this.fogChunks.fill(null);
  }

  private disposeFogOverlay(): void {
    this.fogChunks.forEach((chunk) => chunk?.destroy());
    this.fogChunks.length = 0;
  }

  private redrawAllFogOverlay(): void {
    const startedAt = this.perfEnabled ? performance.now() : 0;

    if (this.perfEnabled) console.time("fog full bake");
    this.ensureFogTextures();
    this.ensureK01NormalFogTextures();

    let tileDrawCount = 0;

    for (let chunkIndex = 0; chunkIndex < this.fogChunks.length; chunkIndex += 1) {
      tileDrawCount += this.redrawFogChunk(chunkIndex);
    }

    this.lastFogDirtyChunkCount = this.fogChunks.length;
    this.lastFogTileDrawCount = tileDrawCount;
    this.fogChunkDirtyMask.fill(0);

    if (this.perfEnabled) {
      this.lastFogRedrawMs = performance.now() - startedAt;
      console.timeEnd("fog full bake");
    }
  }

  private redrawDirtyFogOverlay(dirtyChunkCount: number): void {
    if (dirtyChunkCount === 0) {
      this.lastFogDirtyChunkCount = 0;
      this.lastFogTileDrawCount = 0;
      this.lastFogRedrawMs = 0;
      return;
    }

    const startedAt = this.perfEnabled ? performance.now() : 0;

    if (this.perfEnabled) console.time("fog dirty bake");
    this.ensureFogTextures();
    this.ensureK01NormalFogTextures();

    let redrawnChunkCount = 0;
    let tileDrawCount = 0;

    for (let chunkIndex = 0; chunkIndex < this.fogChunkDirtyMask.length; chunkIndex += 1) {
      if (this.fogChunkDirtyMask[chunkIndex] !== 1) {
        continue;
      }

      tileDrawCount += this.redrawFogChunk(chunkIndex);
      redrawnChunkCount += 1;
    }

    this.lastFogDirtyChunkCount = redrawnChunkCount;
    this.lastFogTileDrawCount = tileDrawCount;

    if (this.perfEnabled) {
      this.lastFogRedrawMs = performance.now() - startedAt;
      console.timeEnd("fog dirty bake");
    }
  }

  private redrawFogChunk(chunkIndex: number): number {
    const bounds = this.getFogChunkBounds(chunkIndex);
    const renderTexture = this.ensureFogChunkRenderTexture(chunkIndex, bounds);

    let hasFog = false;
    let tileDrawCount = 0;

    renderTexture.clear();

    for (let y = bounds.chunkY; y <= bounds.maxY; y += 1) {
      for (let x = bounds.chunkX; x <= bounds.maxX; x += 1) {
        const visibility = (this.playerVisibility.tiles[y * this.playerVisibility.width + x] ?? TileVisibility.Unexplored) as TileVisibility;

        if (visibility === TileVisibility.Visible) {
          continue;
        }

        const textureKey = this.fogTextureKeys.get(visibility);

        if (!textureKey) {
          continue;
        }

        const iso = cartToIso({ x, y }, this.map.tileWidth, this.map.tileHeight);
        const worldX = this.mapOrigin.x + iso.x;
        const worldY = this.mapOrigin.y + iso.y;
        const tile = getTileAt(this.map, x, y);
        const drewElevationFog = this.drawElevationFogTile(renderTexture, bounds, visibility, x, y, worldX, worldY);

        if (!drewElevationFog) {
          if (tile.elevation <= 0) {
            this.drawBaseFogTile(renderTexture, bounds, textureKey, visibility, x, y, worldX, worldY);
          } else {
            this.drawFallbackFogTile(renderTexture, bounds, textureKey, worldX, worldY);
          }
        }

        this.drawK01NormalFogTransition(renderTexture, bounds, visibility, x, y, worldX, worldY);

        hasFog = true;
        tileDrawCount += 1;
      }
    }

    renderTexture.setVisible(hasFog);
    return tileDrawCount;
  }

  private drawBaseFogTile(
    renderTexture: Phaser.GameObjects.RenderTexture,
    bounds: FogChunkBounds,
    fallbackTextureKey: string,
    visibility: TileVisibility,
    x: number,
    y: number,
    worldX: number,
    worldY: number,
  ): void {
    const tile = getTileAt(this.map, x, y);
    const flatVisual = this.getFlatTerrainVisualForTerrain(tile.terrain);
    const flatFrame = flatVisual ? this.pickTerrainFrame(flatVisual, "base", x, y) : null;

    if (flatVisual && flatFrame && this.textures.exists(flatFrame.textureKey)) {
      this.drawVisualFogFrame(renderTexture, bounds, flatVisual, flatFrame, visibility, worldX, worldY, 0);
      return;
    }

    this.drawFallbackFogTile(renderTexture, bounds, fallbackTextureKey, worldX, worldY);
  }

  private drawFallbackFogTile(
    renderTexture: Phaser.GameObjects.RenderTexture,
    bounds: FogChunkBounds,
    textureKey: string,
    worldX: number,
    worldY: number,
  ): void {
    const halfWidth = this.map.tileWidth / 2;
    const halfHeight = this.map.tileHeight / 2;

    renderTexture.draw(textureKey, worldX - bounds.minX - halfWidth - 1, worldY - bounds.minY - halfHeight - 1);
  }

  private drawK01NormalFogTransition(
    renderTexture: Phaser.GameObjects.RenderTexture,
    bounds: FogChunkBounds,
    visibility: TileVisibility,
    x: number,
    y: number,
    worldX: number,
    worldY: number,
  ): void {
    if (getTileAt(this.map, x, y).elevation > 0) return;
    const source = resolveK01NormalFogTransition(
      this.map.id,
      this.toSourceFogVisibility(visibility),
      (direction) => {
        const offset = CARDINAL_FOG_NEIGHBOR_OFFSETS[direction];
        const neighborX = x + offset.x;
        const neighborY = y + offset.y;
        return this.toSourceFogVisibility(this.getFogVisibilityAt(neighborX, neighborY));
      },
    );

    if (!source) return;
    requireSourceTexture(source, (textureKey) => this.textures.exists(textureKey));
    renderTexture.draw(this.getSourceFogStamp(source), worldX - bounds.minX, worldY - bounds.minY);
  }

  private getFogVisibilityAt(x: number, y: number): TileVisibility {
    if (x < 0 || x >= this.map.width || y < 0 || y >= this.map.height) {
      return TileVisibility.Unexplored;
    }
    return (this.playerVisibility.tiles[y * this.playerVisibility.width + x] ?? TileVisibility.Unexplored) as TileVisibility;
  }

  private toSourceFogVisibility(visibility: TileVisibility): FogVisibility {
    if (visibility === TileVisibility.Visible) return "visible";
    return visibility === TileVisibility.Explored ? "explored" : "unseen";
  }

  private getSourceFogStamp(source: SourceFogTile): Phaser.GameObjects.Image {
    const stampKey = `${source.textureKey}:${source.alpha}`;
    const existing = this.sourceFogStamps.get(stampKey);
    if (existing) return existing;

    const stamp = this.make.image({ x: 0, y: 0, key: source.textureKey, add: false });
    const scale = resolveSourceFogTileScale(this.map.tileWidth, this.map.tileHeight);
    stamp
      .setOrigin(0.5, 0.5)
      .setScale(scale.x, scale.y)
      .setAlpha(source.alpha);
    this.sourceFogStamps.set(stampKey, stamp);
    return stamp;
  }

  private drawElevationFogTile(
    renderTexture: Phaser.GameObjects.RenderTexture,
    bounds: FogChunkBounds,
    visibility: TileVisibility,
    x: number,
    y: number,
    worldX: number,
    worldY: number,
  ): boolean {
    const tile = getTileAt(this.map, x, y);
    const neighbors = this.getElevationNeighbors(x, y);
    const slot = resolveElevationTerrainSlot(tile.elevation, neighbors);

    if (!slot) {
      return false;
    }

    const visualTerrain = this.resolveElevationVisualTerrain(tile.terrain, tile.elevation, neighbors);
    const terrainVisual = this.getTerrainVisualForTerrain(visualTerrain);
    const frame = terrainVisual ? this.pickTerrainFrame(terrainVisual, slot, x, y) : null;

    if (!terrainVisual || !frame || !this.textures.exists(frame.textureKey)) {
      return false;
    }

    let drewFog = false;

    if (tile.elevation > 0 && slot !== "plateauTop") {
      const lowerFrame = this.pickTerrainFrame(terrainVisual, "plateauTop", x, y);

      if (lowerFrame && this.textures.exists(lowerFrame.textureKey)) {
        this.drawVisualFogFrame(renderTexture, bounds, terrainVisual, lowerFrame, visibility, worldX, worldY, tile.elevation);
        drewFog = true;
      }
    }

    this.drawVisualFogFrame(
      renderTexture,
      bounds,
      terrainVisual,
      frame,
      visibility,
      worldX,
      worldY,
      slot === "plateauTop" ? tile.elevation : tile.elevation + 1,
    );
    drewFog = true;

    return drewFog;
  }

  private drawVisualFogFrame(
    renderTexture: Phaser.GameObjects.RenderTexture,
    bounds: FogChunkBounds,
    visual: TerrainVisual,
    frame: FrameRef,
    visibility: TileVisibility,
    worldX: number,
    worldY: number,
    liftSteps: number,
  ): void {
    const stamp = this.getElevationFogStamp(visual, frame, visibility);
    const scale = getAssetScale(visual, this.activeTheme.display.defaultPxPerWu ?? REFERENCE_PX_PER_WU);
    const pivot = getFramePivot(visual, frame);
    const liftPx = (pivot.liftPx ?? 0) * scale * liftSteps;

    renderTexture.draw(stamp, worldX - bounds.minX, worldY - bounds.minY - liftPx);
  }

  private ensureFogChunkRenderTexture(chunkIndex: number, bounds: FogChunkBounds): Phaser.GameObjects.RenderTexture {
    const existing = this.fogChunks[chunkIndex];

    if (existing) {
      return existing;
    }

    const renderTexture = this.add
      .renderTexture(bounds.minX, bounds.minY, bounds.width, bounds.height)
      .setOrigin(0, 0)
      .setDepth(bounds.depth);

    this.fogChunks[chunkIndex] = renderTexture;
    return renderTexture;
  }

  private getFogChunkBounds(chunkIndex: number): FogChunkBounds {
    const chunkColumn = chunkIndex % this.fogChunksPerRow;
    const chunkRow = Math.floor(chunkIndex / this.fogChunksPerRow);
    const chunkX = chunkColumn * TERRAIN_CHUNK_SIZE;
    const chunkY = chunkRow * TERRAIN_CHUNK_SIZE;
    const maxX = Math.min(this.map.width - 1, chunkX + TERRAIN_CHUNK_SIZE - 1);
    const maxY = Math.min(this.map.height - 1, chunkY + TERRAIN_CHUNK_SIZE - 1);
    const corners = [
      this.getTileWorldDiamondBounds(chunkX, chunkY),
      this.getTileWorldDiamondBounds(maxX, chunkY),
      this.getTileWorldDiamondBounds(maxX, maxY),
      this.getTileWorldDiamondBounds(chunkX, maxY),
    ];
    const minX = Math.min(...corners.map((corner) => corner.left)) - 2;
    const flatMinY = Math.min(...corners.map((corner) => corner.top)) - 2;
    const minY = flatMinY - this.terrainFogLiftPaddingPx;
    const maxRight = Math.max(...corners.map((corner) => corner.right)) + 2;
    const maxBottom = Math.max(...corners.map((corner) => corner.bottom)) + 2;

    return {
      chunkX,
      chunkY,
      maxX,
      maxY,
      minX,
      minY,
      width: Math.ceil(maxRight - minX),
      height: Math.ceil(maxBottom - minY),
      depth: flatMinY + 1,
    };
  }

  private ensureFogTextures(): void {
    const fogStyles = [
      { visibility: TileVisibility.Unexplored, alpha: FOG_UNEXPLORED_ALPHA },
      { visibility: TileVisibility.Explored, alpha: FOG_EXPLORED_ALPHA },
    ];

    for (const style of fogStyles) {
      const key = `fog-diamond-${style.visibility}`;
      if (this.textures.exists(key)) {
        this.fogTextureKeys.set(style.visibility, key);
        continue;
      }

      const g = this.add.graphics();
      const halfWidth = this.map.tileWidth / 2;
      const halfHeight = this.map.tileHeight / 2;
      g.fillStyle(0x020608, style.alpha);
      g.fillPoints([
        new Phaser.Geom.Point(halfWidth + 1, 1),
        new Phaser.Geom.Point(this.map.tileWidth + 1, halfHeight + 1),
        new Phaser.Geom.Point(halfWidth + 1, this.map.tileHeight + 1),
        new Phaser.Geom.Point(1, halfHeight + 1),
      ], true);
      g.generateTexture(key, this.map.tileWidth + 2, this.map.tileHeight + 2);
      g.destroy();
      this.fogTextureKeys.set(style.visibility, key);
    }
  }

  private ensureK01NormalFogTextures(): void {
    if (this.map.id !== K01_NORMAL_FOG_PROFILE_MAP_ID) return;
    for (const asset of NORMAL_FOG_ASSETS) {
      requireSourceTexture(asset, (textureKey) => this.textures.exists(textureKey));
    }
  }

  private expandDirtyFogChunksForK01Transitions(dirtyChunkCount: number): number {
    if (dirtyChunkCount === 0 || this.map.id !== K01_NORMAL_FOG_PROFILE_MAP_ID) {
      return dirtyChunkCount;
    }

    const originallyDirty = Array.from(this.fogChunkDirtyMask.entries())
      .filter(([, dirty]) => dirty === 1)
      .map(([chunkIndex]) => chunkIndex);
    for (const chunkIndex of originallyDirty) {
      const chunkX = chunkIndex % this.fogChunksPerRow;
      const chunkY = Math.floor(chunkIndex / this.fogChunksPerRow);
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const neighborX = chunkX + offsetX;
          const neighborY = chunkY + offsetY;
          if (neighborX < 0 || neighborX >= this.fogChunksPerRow || neighborY < 0 || neighborY >= this.fogChunksPerColumn) continue;
          this.fogChunkDirtyMask[neighborY * this.fogChunksPerRow + neighborX] = 1;
        }
      }
    }

    let expandedCount = 0;
    for (const dirty of this.fogChunkDirtyMask) {
      expandedCount += dirty;
    }
    return expandedCount;
  }

  private redrawTerrain(): void {
    if (this.perfEnabled) console.time("terrain chunk bake");
    this.terrainChunks.forEach((chunk) => chunk.destroy());
    this.terrainChunks.length = 0;
    this.ensureTerrainTextures();

    const halfWidth = this.map.tileWidth / 2;
    const halfHeight = this.map.tileHeight / 2;

    for (let chunkY = 0; chunkY < this.map.height; chunkY += TERRAIN_CHUNK_SIZE) {
      for (let chunkX = 0; chunkX < this.map.width; chunkX += TERRAIN_CHUNK_SIZE) {
        const maxX = Math.min(this.map.width - 1, chunkX + TERRAIN_CHUNK_SIZE - 1);
        const maxY = Math.min(this.map.height - 1, chunkY + TERRAIN_CHUNK_SIZE - 1);
        const corners = [
          this.getTileWorldDiamondBounds(chunkX, chunkY),
          this.getTileWorldDiamondBounds(maxX, chunkY),
          this.getTileWorldDiamondBounds(maxX, maxY),
          this.getTileWorldDiamondBounds(chunkX, maxY),
        ];
        const minX = Math.min(...corners.map((corner) => corner.left)) - 2;
        const minY = Math.min(...corners.map((corner) => corner.top)) - 2;
        const maxRight = Math.max(...corners.map((corner) => corner.right)) + 2;
        const maxBottom = Math.max(...corners.map((corner) => corner.bottom)) + 2;
        const renderTexture = this.add
          .renderTexture(minX, minY, Math.ceil(maxRight - minX), Math.ceil(maxBottom - minY))
          .setOrigin(0, 0)
          .setDepth(minY);

        for (let y = chunkY; y <= maxY; y += 1) {
          for (let x = chunkX; x <= maxX; x += 1) {
            const tile = getTileAt(this.map, x, y);
            if (tile.elevation > 0) {
              continue;
            }

            const iso = cartToIso({ x, y }, this.map.tileWidth, this.map.tileHeight);
            const worldX = this.mapOrigin.x + iso.x;
            const worldY = this.mapOrigin.y + iso.y;
            const flatVisual = this.getFlatTerrainVisualForTerrain(tile.terrain);
            const flatFrame = flatVisual ? this.pickTerrainFrame(flatVisual, "base", x, y) : null;

            if (flatVisual && flatFrame && this.textures.exists(flatFrame.textureKey)) {
              renderTexture.draw(this.getTerrainRenderStamp(flatVisual, flatFrame), worldX - minX, worldY - minY);
            } else {
              renderTexture.draw(this.terrainTextureKeys.get(tile.terrain)!, worldX - minX - halfWidth - 1, worldY - minY - halfHeight - 1);
            }
          }
        }

        this.terrainChunks.push(renderTexture);
      }
    }
    if (this.perfEnabled) console.timeEnd("terrain chunk bake");
  }

  private redrawElevationOverlay(): void {
    this.disposeElevationOverlay();

    for (let y = 0; y < this.map.height; y += 1) {
      for (let x = 0; x < this.map.width; x += 1) {
        const tile = getTileAt(this.map, x, y);
        const neighbors = this.getElevationNeighbors(x, y);
        const slot = resolveElevationTerrainSlot(tile.elevation, neighbors);

        if (!slot) {
          continue;
        }

        const visualTerrain = this.resolveElevationVisualTerrain(tile.terrain, tile.elevation, neighbors);
        const terrainVisual = this.getTerrainVisualForTerrain(visualTerrain);
        const frame = terrainVisual ? this.pickTerrainFrame(terrainVisual, slot, x, y) : null;

        if (!terrainVisual || !frame || !this.textures.exists(frame.textureKey)) {
          continue;
        }

        const iso = cartToIso({ x, y }, this.map.tileWidth, this.map.tileHeight);
        const worldX = this.mapOrigin.x + iso.x;
        const worldY = this.mapOrigin.y + iso.y;
        if (tile.elevation > 0 && slot !== "plateauTop") {
          const lowerFrame = this.pickTerrainFrame(terrainVisual, "plateauTop", x, y);

          if (lowerFrame && this.textures.exists(lowerFrame.textureKey)) {
            const lowerOverlay = placeStaticVisual(
              this,
              terrainVisual,
              lowerFrame,
              { x: worldX, y: worldY },
              {
                depth: this.getTerrainChunkDepthForTile(x, y),
                depthBias: RENDER_DEPTH_BIAS.elevation,
                liftSteps: tile.elevation,
                pxPerWu: this.activeTheme.display.defaultPxPerWu ?? REFERENCE_PX_PER_WU,
              },
            );

            this.elevationOverlays.push(lowerOverlay);
          }
        }

        const overlay = placeStaticVisual(
          this,
          terrainVisual,
          frame,
          { x: worldX, y: worldY },
          {
            depth: this.getTerrainChunkDepthForTile(x, y),
            depthBias: RENDER_DEPTH_BIAS.elevation,
            liftSteps: slot === "plateauTop" ? tile.elevation : tile.elevation + 1,
            pxPerWu: this.activeTheme.display.defaultPxPerWu ?? REFERENCE_PX_PER_WU,
          },
        );

        this.elevationOverlays.push(overlay);
      }
    }
  }

  private disposeElevationOverlay(): void {
    this.elevationOverlays.forEach((overlay) => overlay.destroy());
    this.elevationOverlays.length = 0;
  }

  private getFlatTerrainVisualForTerrain(terrain: TerrainType): TerrainVisual | null {
    const visualId = this.activeTheme.terrainBindings[terrain]?.flat;

    return visualId ? getTerrainVisual(this.activeTheme, visualId) : null;
  }

  private pickTerrainFrame(visual: TerrainVisual, slot: TerrainKindSlot, x: number, y: number): FrameRef | null {
    const frames = visual.slots[slot];

    if (!frames?.length) {
      return null;
    }

    const hash = this.hashTile(x, y, slot);
    return frames[hash % frames.length] ?? frames[0] ?? null;
  }

  private hashTile(x: number, y: number, salt: string): number {
    let hash = Math.imul(x + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(y + 0xc2b2ae35, 0x27d4eb2f);

    for (let index = 0; index < salt.length; index += 1) {
      hash = Math.imul(hash ^ salt.charCodeAt(index), 0x165667b1);
    }

    return hash >>> 0;
  }

  private getTerrainRenderStamp(visual: TerrainVisual, frame: FrameRef): Phaser.GameObjects.Image {
    const stampKey = `${visual.id}:${frame.textureKey}:${frame.frameName ?? ""}`;
    const existingStamp = this.terrainRenderStamps.get(stampKey);

    if (existingStamp) {
      return existingStamp;
    }

    const stamp = frame.frameName
      ? this.make.image({ x: 0, y: 0, key: frame.textureKey, frame: frame.frameName, add: false })
      : this.make.image({ x: 0, y: 0, key: frame.textureKey, add: false });
    const origin = getFrameOrigin(visual, frame);
    const scale = getAssetScale(visual, this.activeTheme.display.defaultPxPerWu ?? REFERENCE_PX_PER_WU);

    this.applyVisualTextureFilter(visual, frame);
    stamp.setOrigin(origin.x, origin.y).setScale(scale);
    this.terrainRenderStamps.set(stampKey, stamp);

    return stamp;
  }

  private getElevationFogStamp(visual: TerrainVisual, frame: FrameRef, visibility: TileVisibility): Phaser.GameObjects.Image {
    const stampKey = `${visibility}:${visual.id}:${frame.textureKey}:${frame.frameName ?? ""}`;
    const existingStamp = this.elevationFogStamps.get(stampKey);

    if (existingStamp) {
      return existingStamp;
    }

    const stamp = frame.frameName
      ? this.make.image({ x: 0, y: 0, key: frame.textureKey, frame: frame.frameName, add: false })
      : this.make.image({ x: 0, y: 0, key: frame.textureKey, add: false });
    const origin = getFrameOrigin(visual, frame);
    const scale = getAssetScale(visual, this.activeTheme.display.defaultPxPerWu ?? REFERENCE_PX_PER_WU);
    const alpha = visibility === TileVisibility.Unexplored ? FOG_UNEXPLORED_ALPHA : FOG_EXPLORED_ALPHA;

    this.applyVisualTextureFilter(visual, frame);
    stamp
      .setOrigin(origin.x, origin.y)
      .setScale(scale)
      .setAlpha(alpha)
      .setTint(0x020608);

    this.elevationFogStamps.set(stampKey, stamp);

    return stamp;
  }

  private disposeTerrainRenderStamps(): void {
    this.terrainRenderStamps.forEach((stamp) => stamp.destroy());
    this.terrainRenderStamps.clear();
  }

  private disposeElevationFogStamps(): void {
    this.elevationFogStamps.forEach((stamp) => stamp.destroy());
    this.elevationFogStamps.clear();
  }

  private disposeSourceFogStamps(): void {
    this.sourceFogStamps.forEach((stamp) => stamp.destroy());
    this.sourceFogStamps.clear();
  }

  private applyVisualTextureFilter(visual: TerrainVisual, frame: FrameRef): void {
    const texture = this.textures.get(frame.textureKey);
    const filterMode = visual.render.filtering === "linear"
      ? Phaser.Textures.FilterMode.LINEAR
      : Phaser.Textures.FilterMode.NEAREST;

    texture.setFilter(filterMode);
  }

  private computeTerrainFogLiftPaddingPx(): number {
    const layer = this.map.layers[0];

    if (!layer) {
      return 0;
    }

    const maxElevation = layer.tiles.reduce((max, tile) => Math.max(max, tile.elevation), 0);
    const elevationStepPx = this.map.tileHeight / 2;

    return maxElevation * elevationStepPx + 2;
  }

  private getElevationNeighbors(x: number, y: number): Array<ElevationNeighbor & { terrain: TerrainType }> {
    const neighbors: Array<ElevationNeighbor & { terrain: TerrainType }> = [];

    for (const offset of ELEVATION_NEIGHBOR_OFFSETS) {
      const neighborTile = getTileAt(this.map, x + offset.dx, y + offset.dy);

      neighbors.push({
        dx: offset.dx,
        dy: offset.dy,
        elevation: neighborTile.elevation,
        terrain: neighborTile.terrain,
      });
    }

    return neighbors;
  }

  private resolveElevationVisualTerrain(
    terrain: TerrainType,
    elevation: number,
    neighbors: readonly (ElevationNeighbor & { terrain: TerrainType })[],
  ): TerrainType {
    if (elevation > 0) {
      return terrain;
    }

    let selectedTerrain = terrain;
    let selectedElevation = elevation;

    for (const neighbor of neighbors) {
      if (neighbor.elevation <= selectedElevation) {
        continue;
      }

      selectedTerrain = neighbor.terrain;
      selectedElevation = neighbor.elevation;
    }

    return selectedTerrain;
  }

  private getTerrainVisualForTerrain(terrain: TerrainType): TerrainVisual | null {
    const binding = this.activeTheme.terrainBindings[terrain];
    const visualId = binding?.elevated ?? binding?.flat;

    return visualId ? getTerrainVisual(this.activeTheme, visualId) : null;
  }

  private getTerrainChunkDepthForTile(x: number, y: number): number {
    const chunkX = Math.floor(x / TERRAIN_CHUNK_SIZE) * TERRAIN_CHUNK_SIZE;
    const chunkY = Math.floor(y / TERRAIN_CHUNK_SIZE) * TERRAIN_CHUNK_SIZE;
    const maxX = Math.min(this.map.width - 1, chunkX + TERRAIN_CHUNK_SIZE - 1);
    const maxY = Math.min(this.map.height - 1, chunkY + TERRAIN_CHUNK_SIZE - 1);
    const corners = [
      this.getTileWorldDiamondBounds(chunkX, chunkY),
      this.getTileWorldDiamondBounds(maxX, chunkY),
      this.getTileWorldDiamondBounds(maxX, maxY),
      this.getTileWorldDiamondBounds(chunkX, maxY),
    ];

    return Math.min(...corners.map((corner) => corner.top)) - 2;
  }

  private ensureTerrainTextures(): void {
    terrainTypes.forEach((terrain) => {
      const key = `terrain-diamond-${terrain}`;
      if (this.textures.exists(key)) {
        this.terrainTextureKeys.set(terrain, key);
        return;
      }
      const g = this.add.graphics();
      const halfWidth = this.map.tileWidth / 2;
      const halfHeight = this.map.tileHeight / 2;
      g.fillStyle(this.getTerrainColor(terrain), 1);
      g.fillPoints([
        new Phaser.Geom.Point(halfWidth + 1, 1),
        new Phaser.Geom.Point(this.map.tileWidth + 1, halfHeight + 1),
        new Phaser.Geom.Point(halfWidth + 1, this.map.tileHeight + 1),
        new Phaser.Geom.Point(1, halfHeight + 1),
      ], true);
      g.lineStyle(1, 0x203037, 0.6);
      g.strokePoints([
        new Phaser.Geom.Point(halfWidth + 1, 1),
        new Phaser.Geom.Point(this.map.tileWidth + 1, halfHeight + 1),
        new Phaser.Geom.Point(halfWidth + 1, this.map.tileHeight + 1),
        new Phaser.Geom.Point(1, halfHeight + 1),
      ], true);
      g.generateTexture(key, this.map.tileWidth + 2, this.map.tileHeight + 2);
      g.destroy();
      this.terrainTextureKeys.set(terrain, key);
    });
  }

  private ensureActiveThemeTexturesLoaded(onComplete: () => void): void {
    const missingFrames = getThemeFrameRefs(this.activeTheme).filter(({ frame }) => !this.textures.exists(frame.textureKey));

    if (missingFrames.length === 0) {
      onComplete();
      return;
    }

    console.warn(
      "Missing theme textures detected; retrying load:",
      missingFrames.map(({ frame }) => frame.fileName ?? frame.textureKey),
    );

    const handleLoadError = (file: { key?: string; src?: string }) => {
      console.warn("Theme texture failed to load", { key: file.key, src: file.src });
    };

    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, handleLoadError);
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, handleLoadError);
      onComplete();
    });

    for (const { visual, frame } of missingFrames) {
      this.load.image(frame.textureKey, getThemeAssetUrl(this.activeTheme, visual, frame));
    }

    this.load.start();
  }

  private getTileWorldDiamondBounds(x: number, y: number): Phaser.Geom.Rectangle {
    const iso = cartToIso({ x, y }, this.map.tileWidth, this.map.tileHeight);
    return new Phaser.Geom.Rectangle(
      this.mapOrigin.x + iso.x - this.map.tileWidth / 2,
      this.mapOrigin.y + iso.y - this.map.tileHeight / 2,
      this.map.tileWidth,
      this.map.tileHeight,
    );
  }

  private syncResourceRenderables(): void {
    this.refreshKnownResourceViews();

    const liveIds = new Set<string>();

    for (const resourceView of this.iterateKnownResourceViews()) {
      const definition = RESOURCE_DEFINITIONS[resourceView.resource.kind];

      if (!definition) {
        continue;
      }

      liveIds.add(resourceView.resource.id);
      let renderable = this.resourceRenderables.get(resourceView.resource.id);

      if (!renderable) {
        renderable = this.createResourceRenderable();
        this.resourceRenderables.set(resourceView.resource.id, renderable);
      }

      const state = getResourceNodeState(resourceView.resource);
      const stateKey = `${resourceView.resource.kind}:${state}`;

      if (renderable.stateKey !== stateKey) {
        this.redrawResourceRenderable(renderable, definition, resourceView.resource);
        renderable.stateKey = stateKey;
      }

      const position = this.getResourceWorldPosition(resourceView.point);
      renderable.container
        .setPosition(position.x, position.y)
        .setAlpha(resourceView.visibility === TileVisibility.Visible ? 1 : 0.38)
        .setDepth(position.depth);
    }

    for (const [resourceId, renderable] of this.resourceRenderables) {
      if (!liveIds.has(resourceId)) {
        renderable.container.destroy(true);
        this.resourceRenderables.delete(resourceId);
      }
    }

    this.publishMinimapResources();
  }

  private *iterateKnownResourceViews(): IterableIterator<{
    resource: ResourceNode;
    point: GridPoint;
    visibility: TileVisibility;
  }> {
    for (const resourceView of this.knownResourceViews.values()) {
      const visibility = getTileVisibility(this.playerVisibility, resourceView.point);

      if (visibility === TileVisibility.Unexplored) {
        continue;
      }

      yield { ...resourceView, visibility };
    }
  }

  private refreshKnownResourceViews(): void {
    for (const layer of this.worldState.map.layers) {
      for (let tileIndex = 0; tileIndex < layer.tiles.length; tileIndex += 1) {
        const point = {
          x: tileIndex % this.worldState.map.width,
          y: Math.floor(tileIndex / this.worldState.map.width),
        };
        const visibility = getTileVisibility(this.playerVisibility, point);

        if (visibility !== TileVisibility.Visible) {
          continue;
        }

        const key = this.getResourceMemoryKey(point);
        const resource = layer.tiles[tileIndex]?.resource;

        if (!resource || !RESOURCE_DEFINITIONS[resource.kind]) {
          this.knownResourceViews.delete(key);
          continue;
        }

        this.knownResourceViews.set(key, {
          point,
          resource: { ...resource },
        });
      }
    }
  }

  private serializeKnownResourceViews(): SerializedKnownResourceView[] {
    return Array.from(this.knownResourceViews.values())
      .sort((a, b) => this.getResourceMemoryKey(a.point).localeCompare(this.getResourceMemoryKey(b.point)))
      .map((view) => ({
        point: { ...view.point },
        resource: { ...view.resource },
      }));
  }

  private restoreKnownResourceViews(resources: readonly SerializedKnownResourceView[] | undefined): void {
    this.knownResourceViews.clear();

    if (!resources) {
      return;
    }

    for (const view of resources) {
      const point = {
        x: Math.round(view.point.x),
        y: Math.round(view.point.y),
      };

      if (
        point.x < 0 ||
        point.y < 0 ||
        point.x >= this.map.width ||
        point.y >= this.map.height ||
        !RESOURCE_DEFINITIONS[view.resource.kind]
      ) {
        continue;
      }

      this.knownResourceViews.set(this.getResourceMemoryKey(point), {
        point,
        resource: { ...view.resource },
      });
    }
  }

  private publishMinimapResources(): void {
    const resources: MinimapResourcesView = {
      resources: Array.from(this.knownResourceViews.values())
        .map((view) => {
          const visibility = getTileVisibility(this.playerVisibility, view.point);

          if (visibility === TileVisibility.Unexplored) {
            return null;
          }

          return {
            id: view.resource.id,
            kind: view.resource.kind,
            position: { ...view.point },
            visible: visibility === TileVisibility.Visible,
          };
        })
        .filter((resource): resource is MinimapResourcesView["resources"][number] => resource !== null),
    };

    this.registry.set(MINIMAP_RESOURCES_REGISTRY_KEY, resources);
    this.game.events.emit(MINIMAP_RESOURCES_CHANGED_EVENT, resources);
  }

  private getResourceMemoryKey(point: GridPoint): string {
    return `${point.x},${point.y}`;
  }

  private createResourceRenderable(): ResourceRenderable {
    const container = this.add.container(0, 0);
    const shadow = this.add.graphics();
    const marker = this.add.graphics();
    const glyph = this.add
      .text(0, -15, "", {
        color: "#102125",
        fontFamily: "monospace",
        fontSize: "11px",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    container.add([shadow, marker, glyph]);

    return { container, shadow, marker, glyph, stateKey: "" };
  }

  private redrawResourceRenderable(
    renderable: ResourceRenderable,
    definition: ResourceDefinition,
    resource: ResourceNode,
  ): void {
    const state = getResourceNodeState(resource);
    const depleted = state === "depleted";
    const visual = definition.placeholderVisual;
    const fillColor = depleted ? 0x77725f : visual.worldColor;
    const outlineColor = depleted ? 0x3a3932 : visual.outlineColor;
    const alpha = depleted ? 0.68 : 1;

    renderable.shadow
      .clear()
      .fillStyle(0x061012, depleted ? 0.24 : 0.42)
      .fillEllipse(0, 8, 34, 14);

    renderable.marker.clear();

    if (definition.category === "wood") {
      this.drawWoodPlaceholder(renderable.marker, resource.kind, fillColor, outlineColor, alpha, depleted);
    } else {
      this.drawPatchPlaceholder(renderable.marker, fillColor, outlineColor, alpha, depleted);
    }

    renderable.glyph
      .setText(visual.glyph)
      .setColor(depleted ? "#e8dfbf" : "#102125")
      .setAlpha(depleted ? 0.72 : 0.95)
      .setY(definition.category === "wood" && !depleted ? -24 : -12);
  }

  private drawPatchPlaceholder(
    graphics: Phaser.GameObjects.Graphics,
    fillColor: number,
    outlineColor: number,
    alpha: number,
    depleted: boolean,
  ): void {
    graphics
      .fillStyle(fillColor, alpha)
      .fillEllipse(0, 0, 28, 15)
      .lineStyle(2, outlineColor, alpha)
      .strokeEllipse(0, 0, 28, 15);

    if (depleted) {
      graphics
        .lineStyle(2, 0x3a3932, 0.65)
        .lineBetween(-8, -3, 8, 3)
        .lineBetween(-8, 3, 8, -3);
      return;
    }

    graphics
      .lineStyle(2, 0xf5efbd, 0.85)
      .lineBetween(-6, 1, -8, -7)
      .lineBetween(0, 2, 0, -8)
      .lineBetween(6, 1, 8, -7);
  }

  private drawWoodPlaceholder(
    graphics: Phaser.GameObjects.Graphics,
    kind: string,
    fillColor: number,
    outlineColor: number,
    alpha: number,
    depleted: boolean,
  ): void {
    if (kind === "bamboo") {
      const height = depleted ? 14 : 32;
      graphics.lineStyle(4, outlineColor, alpha).lineBetween(-7, 4, -7, 4 - height);
      graphics.lineStyle(4, fillColor, alpha).lineBetween(0, 5, 0, 5 - height);
      graphics.lineStyle(4, outlineColor, alpha).lineBetween(7, 4, 7, 4 - height);

      if (!depleted) {
        graphics
          .fillStyle(fillColor, 0.9)
          .fillEllipse(-13, -18, 14, 7)
          .fillEllipse(12, -23, 14, 7);
      }

      return;
    }

    graphics
      .fillStyle(0x8b5a32, alpha)
      .fillRoundedRect(-5, -4, 10, depleted ? 13 : 25, 3)
      .lineStyle(2, 0x4a2d1c, alpha)
      .strokeRoundedRect(-5, -4, 10, depleted ? 13 : 25, 3);

    if (!depleted) {
      graphics
        .fillStyle(fillColor, alpha)
        .fillCircle(0, -24, 17)
        .lineStyle(2, outlineColor, alpha)
        .strokeCircle(0, -24, 17);
    }
  }

  private getResourceWorldPosition(point: GridPoint): { x: number; y: number; depth: number } {
    const iso = cartToIso(point, this.map.tileWidth, this.map.tileHeight);
    const worldX = this.mapOrigin.x + iso.x;
    const worldY = this.mapOrigin.y + iso.y;
    const y = worldY - this.map.tileHeight / 3;

    return {
      x: worldX,
      y,
      depth: worldY + 8,
    };
  }

  private syncUnitRenderables(deltaMs = 0): void {
    const liveIds = new Set(Object.values(this.worldState.units).filter((unit) => this.isUnitVisibleToLocalPlayer(unit)).map((unit) => unit.id));
    for (const [id, renderable] of this.unitRenderables) {
      if (!liveIds.has(id)) {
        renderable.container.destroy(true);
        this.unitRenderables.delete(id);
      }
    }

    Object.values(this.worldState.units).filter((unit) => this.isUnitVisibleToLocalPlayer(unit)).forEach((unit) => {
      let renderable = this.unitRenderables.get(unit.id);
      if (!renderable) {
        renderable = this.createUnitRenderable(unit);
        this.unitRenderables.set(unit.id, renderable);
      }
      const unitPosition = this.getUnitWorldPosition(unit);
      const visual = this.getEntityVisual(unit.kind);
      const hasConstructionVisual = visual?.states.construction !== undefined;
      renderable.container.setPosition(unitPosition.x, unitPosition.y).setDepth(unitPosition.y + 20);
      renderable.container.setAlpha(unit.construction && !hasConstructionVisual ? 0.68 : 1);
      renderable.selectionRing.setVisible(this.selectedUnitIds.has(unit.id));
      this.updateUnitRenderableFrame(renderable, unit, deltaMs);
      this.updateUnitCombatFeedback(renderable, unit);
    });
  }

  private updateVisibleUnitAnimationFrames(deltaMs: number): void {
    Object.values(this.worldState.units)
      .filter((unit) => this.isUnitVisibleToLocalPlayer(unit))
      .forEach((unit) => {
        const renderable = this.unitRenderables.get(unit.id);

        if (renderable) {
          this.updateUnitRenderableFrame(renderable, unit, deltaMs);
        }
      });
  }

  private createUnitRenderable(unit: UnitState): UnitRenderable {
    const radius = unitDefinitions[unit.kind].renderRadius;
    const color = factionDefinitions[this.getPlayerFaction(unit.playerId)].unitColor;
    const definition = unitDefinitions[unit.kind];
    const container = this.add.container(0, 0);
    const selectionRing = this.add.graphics();
    const damageFlash = this.add.graphics();
    const healthBarBack = this.add.graphics();
    const healthBarFill = this.add.graphics();
    const visual = this.getEntityVisual(unit.kind);
    const initialFacing = this.getUnitFacing(unit);
    const selection = visual ? this.getEntityAnimationSelection(unit, visual, initialFacing) : null;
    const frame = selection?.clip.frames[0] ?? null;

    selectionRing.lineStyle(2, 0xf3dd8f, 1);
    selectionRing.strokeEllipse(
      0,
      0,
      Math.max(radius * 3.2, definition.footprint.width * this.map.tileWidth * 0.82),
      Math.max(radius * 1.8, definition.footprint.height * this.map.tileHeight * 0.9),
    );

    if (visual && frame && this.textures.exists(frame.textureKey)) {
      const sprite = this.add.image(0, 0, frame.textureKey, frame.frameName);
      const origin = getFrameOrigin(visual, frame);
      const scale = getAssetScale(visual, REFERENCE_PX_PER_WU);
      const teamBadge = this.add.graphics();
      const spriteLayers: UnitRenderableSpriteLayer[] = [{
        id: "base",
        sprite,
        animationKey: null,
        animationFrameIndex: 0,
        animationFrameElapsedMs: 0,
      }];

      this.textures.get(frame.textureKey).setFilter(Phaser.Textures.FilterMode.NEAREST);
      sprite.setOrigin(origin.x, origin.y).setScale(scale).setFlipX(selection?.clip.mirrorX ?? false);
      for (const visualLayer of visual.layers ?? []) {
        const layerSelection = this.getEntityLayerAnimationSelection(unit, visual, visualLayer, initialFacing);
        const layerFrame = layerSelection?.clip.frames[0] ?? null;

        if (!layerFrame || !this.textures.exists(layerFrame.textureKey)) {
          continue;
        }

        const layerSprite = this.add.image(0, 0, layerFrame.textureKey, layerFrame.frameName);
        const layerOrigin = getFrameOrigin(visual, layerFrame);
        const layerScale = getAssetScale(visual, REFERENCE_PX_PER_WU);

        this.textures.get(layerFrame.textureKey).setFilter(Phaser.Textures.FilterMode.NEAREST);
        layerSprite.setOrigin(layerOrigin.x, layerOrigin.y).setScale(layerScale).setFlipX(layerSelection?.clip.mirrorX ?? false);
        spriteLayers.push({
          id: visualLayer.id,
          sprite: layerSprite,
          animationKey: null,
          animationFrameIndex: 0,
          animationFrameElapsedMs: 0,
        });
      }
      teamBadge.fillStyle(color, 0.9);
      teamBadge.fillCircle(0, 7, Math.max(3, Math.min(radius * 0.55, 5)));
      teamBadge.lineStyle(1, 0x071112, 0.95);
      teamBadge.strokeCircle(0, 7, Math.max(3, Math.min(radius * 0.55, 5)));
      container.add([selectionRing, ...spriteLayers.map((layer) => layer.sprite), teamBadge, damageFlash, healthBarBack, healthBarFill]);
      return {
        container,
        selectionRing,
        sprite,
        spriteLayers,
        teamBadge,
        damageFlash,
        healthBarBack,
        healthBarFill,
        lastFacing: initialFacing,
        damageFlashUntil: 0,
        lastHealth: unit.health.current,
      };
    }

    const body = this.add.graphics();
    body.fillStyle(color, 1);
    body.fillCircle(0, 0, radius);
    body.lineStyle(2, 0x102125, 0.9);
    body.strokeCircle(0, 0, radius);
    container.add([selectionRing, body, damageFlash, healthBarBack, healthBarFill]);
    return {
      container,
      body,
      selectionRing,
      damageFlash,
      healthBarBack,
      healthBarFill,
      lastFacing: initialFacing,
      damageFlashUntil: 0,
      lastHealth: unit.health.current,
    };
  }

  private updateUnitCombatFeedback(renderable: UnitRenderable, unit: UnitState): void {
    if (unit.health.current < renderable.lastHealth) {
      renderable.damageFlashUntil = this.time.now + 180;
    }

    renderable.lastHealth = unit.health.current;
    this.redrawUnitHealthBar(renderable, unit);
    this.redrawUnitDamageFlash(renderable, unit);
  }

  private redrawUnitHealthBar(renderable: UnitRenderable, unit: UnitState): void {
    const healthRatio = Phaser.Math.Clamp(unit.health.current / unit.health.max, 0, 1);
    const damaged = healthRatio < 1;
    const selected = this.selectedUnitIds.has(unit.id);

    renderable.healthBarBack.clear();
    renderable.healthBarFill.clear();

    if (!damaged && !selected) {
      return;
    }

    const definition = unitDefinitions[unit.kind];
    const width = Math.max(30, definition.renderRadius * 3.4, definition.footprint.width * 16);
    const y = -Math.max(24, definition.renderRadius * 2.6, definition.footprint.height * 14);
    const fillColor = healthRatio > 0.55 ? 0x75b46f : healthRatio > 0.25 ? 0xd0b46a : 0xd36b52;

    renderable.healthBarBack
      .fillStyle(0x071112, 0.82)
      .fillRoundedRect(-width / 2, y, width, 5, 2)
      .lineStyle(1, 0x102125, 0.92)
      .strokeRoundedRect(-width / 2, y, width, 5, 2);

    renderable.healthBarFill
      .fillStyle(fillColor, 0.95)
      .fillRoundedRect(-width / 2 + 1, y + 1, Math.max(2, (width - 2) * healthRatio), 3, 1);
  }

  private redrawUnitDamageFlash(renderable: UnitRenderable, unit: UnitState): void {
    renderable.damageFlash.clear();

    if (this.time.now >= renderable.damageFlashUntil) {
      return;
    }

    const definition = unitDefinitions[unit.kind];
    const remaining = Phaser.Math.Clamp((renderable.damageFlashUntil - this.time.now) / 180, 0, 1);
    const width = Math.max(definition.renderRadius * 2.9, definition.footprint.width * 18);
    const height = Math.max(definition.renderRadius * 1.8, definition.footprint.height * 12);

    renderable.damageFlash
      .lineStyle(2, 0xf17c63, 0.2 + remaining * 0.58)
      .strokeEllipse(0, 0, width, height)
      .fillStyle(0xf17c63, 0.04 + remaining * 0.12)
      .fillEllipse(0, 0, width, height);
  }

  private playCombatEvents(): void {
    const activeEventIds = new Set<string>();

    for (const event of this.worldState.combatEvents) {
      activeEventIds.add(event.id);

      if (this.processedCombatEventIds.has(event.id)) {
        continue;
      }

      this.processedCombatEventIds.add(event.id);

      if (this.isUnderAttackAlertEvent(event)) {
        this.showUnderAttackAlert(event);
      }

      if (this.isCombatEventVisible(event)) {
        this.playCombatEventAudio(event);
        this.spawnCombatEventEffect(event);
      }
    }

    if (this.processedCombatEventIds.size <= 512) {
      return;
    }

    for (const eventId of this.processedCombatEventIds) {
      if (!activeEventIds.has(eventId)) {
        this.processedCombatEventIds.delete(eventId);
      }
    }
  }

  private isCombatEventVisible(event: CombatEventState): boolean {
    return (
      getTileVisibility(this.playerVisibility, event.sourcePosition) === TileVisibility.Visible ||
      getTileVisibility(this.playerVisibility, event.targetPosition) === TileVisibility.Visible
    );
  }

  private isUnderAttackAlertEvent(event: CombatEventState): boolean {
    return this.isEnemyPlayer(event.sourcePlayerId) && this.arePlayersAllied(this.localPlayerId, event.targetPlayerId);
  }

  private playCombatEventAudio(event: CombatEventState): void {
    if (!event.killed) {
      return;
    }

    const cueKey = UNIT_AUDIO_CUES[event.targetKind]?.die;

    if (cueKey) {
      this.playGameplayAudio(cueKey);
    }
  }

  private showUnderAttackMarker(target: GridPoint): void {
    const position = this.getGridPointWorldPosition(target);
    const marker = this.add.graphics();
    const halfWidth = this.map.tileWidth * 0.34;
    const halfHeight = this.map.tileHeight * 0.34;
    const points = [
      new Phaser.Geom.Point(0, -halfHeight),
      new Phaser.Geom.Point(halfWidth, 0),
      new Phaser.Geom.Point(0, halfHeight),
      new Phaser.Geom.Point(-halfWidth, 0),
    ];

    marker
      .setPosition(position.x, position.y)
      .setDepth(position.y + 150)
      .fillStyle(0xf17c63, 0.14)
      .fillPoints(points, true)
      .lineStyle(3, 0xff8c73, 0.96)
      .strokePoints(points, true)
      .lineStyle(2, 0xffddd6, 0.9)
      .lineBetween(-halfWidth * 0.5, 0, halfWidth * 0.5, 0)
      .lineBetween(0, -halfHeight * 0.5, 0, halfHeight * 0.5);

    this.combatEffectGraphics.add(marker);
    this.tweens.add({
      targets: marker,
      alpha: 0,
      scaleX: 1.45,
      scaleY: 1.45,
      duration: 880,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.combatEffectGraphics.delete(marker);
        marker.destroy();
      },
    });
  }

  private spawnCombatEventEffect(event: CombatEventState): void {
    const source = this.getGridPointWorldPosition(event.sourcePosition);
    const target = this.getGridPointWorldPosition(event.targetPosition);
    const graphics = this.add.graphics();
    const isFriendlyAttack = this.arePlayersAllied(this.localPlayerId, event.sourcePlayerId);
    const lineColor = isFriendlyAttack ? 0xf0d782 : 0xf17c63;
    const impactColor = event.killed ? 0xfff0b2 : lineColor;
    const sourceY = source.y - 14;
    const targetY = target.y - 14;
    const distance = Phaser.Math.Distance.Between(source.x, sourceY, target.x, targetY);
    const impactRadius = event.killed ? 15 : 10;

    graphics
      .setDepth(Math.max(source.y, target.y) + 90)
      .lineStyle(distance > this.map.tileWidth * 0.75 ? 2 : 0, lineColor, 0.82);

    if (distance > this.map.tileWidth * 0.75) {
      graphics.lineBetween(source.x, sourceY, target.x, targetY);
    }

    graphics
      .lineStyle(2, impactColor, 0.88)
      .strokeCircle(target.x, targetY, impactRadius)
      .lineStyle(1, 0x25140c, 0.62)
      .lineBetween(target.x - 6, targetY - 4, target.x + 6, targetY + 4)
      .lineBetween(target.x + 5, targetY - 5, target.x - 5, targetY + 5);

    this.combatEffectGraphics.add(graphics);
    this.tweens.add({
      targets: graphics,
      alpha: 0,
      duration: event.killed ? 360 : 260,
      ease: "Quad.easeOut",
      onComplete: () => {
        this.combatEffectGraphics.delete(graphics);
        graphics.destroy();
      },
    });
  }

  private updateUnitRenderableFrame(renderable: UnitRenderable, unit: UnitState, deltaMs = 0): void {
    if (!renderable.sprite || !renderable.spriteLayers) {
      return;
    }

    const visual = this.getEntityVisual(unit.kind);
    const facing = this.getUnitFacing(unit, renderable.lastFacing);
    const selection = visual ? this.getEntityAnimationSelection(unit, visual, facing) : null;
    const baseLayer = renderable.spriteLayers[0];
    const frame = selection && baseLayer ? this.advanceEntityAnimation(baseLayer, selection, deltaMs) : null;

    renderable.lastFacing = facing;

    const frameMatches =
      renderable.sprite.texture.key === frame?.textureKey &&
      (frame?.frameName === undefined || String(renderable.sprite.frame.name) === frame.frameName);

    if (!visual) {
      return;
    }

    if (!frame || !this.textures.exists(frame.textureKey)) {
      this.updateUnitRenderableSpriteLayers(renderable, unit, visual, facing, deltaMs);
      return;
    }

    renderable.sprite.setFlipX(selection?.clip.mirrorX ?? false);

    if (frameMatches) {
      this.updateUnitRenderableSpriteLayers(renderable, unit, visual, facing, deltaMs);
      return;
    }

    const origin = getFrameOrigin(visual, frame);

    renderable.sprite
      .setTexture(frame.textureKey, frame.frameName)
      .setOrigin(origin.x, origin.y)
      .setFlipX(selection?.clip.mirrorX ?? false);
    this.updateUnitRenderableSpriteLayers(renderable, unit, visual, facing, deltaMs);
  }

  private updateUnitRenderableSpriteLayers(
    renderable: UnitRenderable,
    unit: UnitState,
    visual: EntityVisual,
    facing: Facing,
    deltaMs: number,
  ): void {
    const spriteLayers = renderable.spriteLayers ?? [];
    for (const visualLayer of visual.layers ?? []) {
      const renderLayer = spriteLayers.find((layer) => layer.id === visualLayer.id);

      if (!renderLayer) {
        continue;
      }

      const selection = this.getEntityLayerAnimationSelection(unit, visual, visualLayer, facing);
      const frame = selection ? this.advanceEntityAnimation(renderLayer, selection, deltaMs) : null;

      if (!selection || !frame || !this.textures.exists(frame.textureKey)) {
        renderLayer.sprite.setVisible(false);
        continue;
      }

      renderLayer.sprite.setVisible(true);
      const frameMatches =
        renderLayer.sprite.texture.key === frame.textureKey &&
        (frame.frameName === undefined || String(renderLayer.sprite.frame.name) === frame.frameName);

      renderLayer.sprite.setFlipX(selection.clip.mirrorX ?? false);
      if (frameMatches) {
        continue;
      }

      const origin = getFrameOrigin(visual, frame);
      renderLayer.sprite.setTexture(frame.textureKey, frame.frameName).setOrigin(origin.x, origin.y);
    }
  }

  private getEntityVisual(unitKind: UnitState["kind"]): EntityVisual | null {
    const visualId = this.activeTheme.entityBindings[unitKind];
    const visual = visualId ? this.activeTheme.visuals[visualId] : null;

    return visual?.kind === "entity" ? visual : null;
  }

  private getEntityAnimationSelection(unit: UnitState, visual: EntityVisual, facing: Facing): EntityAnimationSelection | null {
    const stateKey = getEntityAnimationStateKey(unit, visual);

    if (!stateKey) {
      return null;
    }

    const state = visual.states[stateKey];

    if (!state) {
      return null;
    }

    const facingClip = state.clips[facing];
    const defaultClip = state.clips.default;

    if (facingClip) {
      const constructionSelection = this.getConstructionAnimationSelection(unit, visual, stateKey, facing, facingClip);
      if (constructionSelection) {
        return constructionSelection;
      }

      return { key: `${visual.id}:${stateKey}:${facing}`, clip: facingClip };
    }

    if (defaultClip) {
      const constructionSelection = this.getConstructionAnimationSelection(unit, visual, stateKey, "default", defaultClip);
      if (constructionSelection) {
        return constructionSelection;
      }

      return { key: `${visual.id}:${stateKey}:default`, clip: defaultClip };
    }

    for (const [clipKey, clip] of Object.entries(state.clips)) {
      if (clip) {
        const constructionSelection = this.getConstructionAnimationSelection(unit, visual, stateKey, clipKey, clip);
        if (constructionSelection) {
          return constructionSelection;
        }

        return { key: `${visual.id}:${stateKey}:${clipKey}`, clip };
      }
    }

    return null;
  }

  private getEntityLayerAnimationSelection(
    unit: UnitState,
    visual: EntityVisual,
    layer: EntityVisualLayer,
    facing: Facing,
  ): EntityAnimationSelection | null {
    const stateKey = getEntityAnimationStateKey(unit, visual);

    if (!stateKey) {
      return null;
    }

    const state = layer.states[stateKey];

    if (!state) {
      return null;
    }

    const facingClip = state.clips[facing];
    if (facingClip) {
      return { key: `${visual.id}:${layer.id}:${stateKey}:${facing}`, clip: facingClip };
    }

    const defaultClip = state.clips.default;
    if (defaultClip) {
      return { key: `${visual.id}:${layer.id}:${stateKey}:default`, clip: defaultClip };
    }

    for (const [clipKey, clip] of Object.entries(state.clips)) {
      if (clip) {
        return { key: `${visual.id}:${layer.id}:${stateKey}:${clipKey}`, clip };
      }
    }

    return null;
  }

  private getConstructionAnimationSelection(
    unit: UnitState,
    visual: EntityVisual,
    stateKey: string,
    clipKey: string,
    clip: AnimationClip,
  ): EntityAnimationSelection | null {
    if (stateKey !== "construction" || !unit.construction || clip.frames.length === 0) {
      return null;
    }

    const progress = getConstructionProgress(unit);
    const frameIndex = selectConstructionFrameIndex(progress, clip);
    const frame = clip.frames[frameIndex];

    if (!frame) {
      return null;
    }

    return {
      key: `${visual.id}:${stateKey}:${clipKey}:${frameIndex}`,
      clip: { frames: [frame], fps: 1, loop: false },
    };
  }

  private advanceEntityAnimation(renderable: EntityAnimationTracker, selection: EntityAnimationSelection, deltaMs: number): FrameRef | null {
    if (selection.clip.frames.length === 0) {
      return null;
    }

    if (renderable.animationKey !== selection.key) {
      renderable.animationKey = selection.key;
      renderable.animationFrameIndex = 0;
      renderable.animationFrameElapsedMs = 0;
    } else {
      this.advanceAnimationFrameIndex(renderable, selection.clip, deltaMs);
    }

    return selection.clip.frames[Math.min(renderable.animationFrameIndex, selection.clip.frames.length - 1)] ?? null;
  }

  private advanceAnimationFrameIndex(renderable: EntityAnimationTracker, clip: AnimationClip, deltaMs: number): void {
    if (clip.frames.length < 2 || clip.fps <= 0 || deltaMs <= 0) {
      return;
    }

    const frameDurationMs = 1000 / clip.fps;
    renderable.animationFrameElapsedMs += deltaMs;

    while (renderable.animationFrameElapsedMs >= frameDurationMs) {
      renderable.animationFrameElapsedMs -= frameDurationMs;

      if (renderable.animationFrameIndex < clip.frames.length - 1) {
        renderable.animationFrameIndex += 1;
        continue;
      }

      if (clip.loop === false) {
        renderable.animationFrameElapsedMs = 0;
        break;
      }

      renderable.animationFrameIndex = 0;
    }
  }

  private getUnitFacing(unit: UnitState, fallbackFacing: Facing = "s"): Facing {
    const target = this.getUnitFacingTarget(unit);

    if (!target) {
      return fallbackFacing;
    }

    const dx = target.x - unit.position.x;
    const dy = target.y - unit.position.y;

    return getGridFacing(dx, dy, fallbackFacing);
  }

  private getUnitFacingTarget(unit: UnitState): GridPoint | null {
    if (unit.movementTarget) {
      return unit.movementTarget;
    }

    if (unit.currentOrder?.type === "attack-unit") {
      return this.worldState.units[unit.currentOrder.targetUnitId]?.position ?? null;
    }

    if (unit.currentOrder?.type === "repair") {
      return this.worldState.units[unit.currentOrder.targetUnitId]?.position ?? null;
    }

    if (
      unit.currentOrder?.type === "move" ||
      unit.currentOrder?.type === "attack-move" ||
      unit.currentOrder?.type === "build" ||
      unit.currentOrder?.type === "gather"
    ) {
      return unit.currentOrder.target;
    }

    if (unit.currentOrder?.type === "patrol") {
      return unit.currentOrder.nextTarget;
    }

    return null;
  }

  private getTerrainColor(terrain: TerrainType): number {
    return terrainDefinitions[terrain].worldColor;
  }

  private getPlayerFaction(playerId: string): FactionId {
    return this.worldState.players[playerId]?.faction ?? "blue";
  }

  private getPlayerTeamId(playerId: string): string {
    return this.worldState.players[playerId]?.teamId ?? playerId;
  }

  private arePlayersAllied(firstPlayerId: string, secondPlayerId: string): boolean {
    return this.getPlayerTeamId(firstPlayerId) === this.getPlayerTeamId(secondPlayerId);
  }

  private isEnemyPlayer(playerId: string): boolean {
    return !this.arePlayersAllied(this.localPlayerId, playerId);
  }
}
