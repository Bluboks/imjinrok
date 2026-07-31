import Phaser from "phaser";
import {
  type OriginalSpeechSlot,
  type ScenarioBriefingDefinition,
  type ScenarioBriefingLineDefinition,
} from "@shared";
import {
  MISSION_PORTRAIT_IMAGE_CUES,
  normalizeMissionPortraitId,
} from "../missionPortraits.js";
import { collectMissionBriefingBackdropFrames } from "../missionBriefingBackdrop.js";
import { resolveOriginalBriefingMetadataLayout } from "../originalBriefingMetadataLayout.js";
import {
  createMissionBriefingReplayState,
  getMissionBriefingClickAction,
  getMissionBriefingIntroStage,
  getMissionBriefingPortraitScale,
  getMissionBriefingTitleFrameIndex,
} from "../missionPresentationTimeline.js";
import { getOriginalSpeechSlot, resolveOriginalSpeechLayout } from "../originalSpeechLayout.js";
import {
  MISSION_BRIEFING_SCENE_KEY,
  PreGameBriefingLaunchController,
  launchGameplayScenes,
} from "../preGameBriefingLaunch.js";
import type { GameLaunchContext } from "../session.js";
import { getMissionLineDurationMs, normalizeMissionVoiceId } from "../missionVoiceTiming.js";
import {
  GAMEPLAY_AUDIO_CUE_BY_KEY,
  MISSION_BRIEFING_MUSIC_AUDIO_CUE_BY_SOURCE,
  MISSION_BRIEFING_MUSIC_AUDIO_CUE_KEY,
  type GameplayAudioCueKey,
} from "../gameplayAudio.js";
import {
  PRE_GAME_KOREAN_FONT_FAMILY,
  resolvePreGameTextResolution,
  whenPreGameTypographyReady,
} from "../ui/preGameTypography.js";

const BRIEFING_DURATION_MS = 60_000;
const BRIEFING_LINE_DURATION_MS = 5_500;
const BACKDROP_SOURCE_WIDTH = 640;
const BACKDROP_SOURCE_HEIGHT = 480;
const VOICE_AUDIO_PREFIX = "audio:mission-voice:";
const VOICE_AUDIO_VOLUME = 0.86;

interface VoiceCue {
  key: string;
  voiceId: string;
  url: string;
  volume: number;
}

interface Participant {
  portraitId: string;
  speechSlot: OriginalSpeechSlot;
}

const portraitCueById = new Map(
  MISSION_PORTRAIT_IMAGE_CUES.map((cue) => [normalizeMissionPortraitId(cue.portraitId), cue] as const),
);

export class MissionBriefingScene extends Phaser.Scene {
  private context: GameLaunchContext | null = null;
  private launchController = new PreGameBriefingLaunchController();
  private container: Phaser.GameObjects.Container | null = null;
  private backdropImage: Phaser.GameObjects.Image | null = null;
  private introStartedAt: number | null = null;
  private hideAt: number | null = null;
  private lineIndex = 0;
  private lineRevealAt: number | null = null;
  private nextLineAt: number | null = null;
  private introCompleted = false;
  private lineScheduled = false;
  private dismissed = false;
  private musicPlaying = false;
  private typographyReadyUnsubscribe: (() => void) | null = null;
  private readonly introducedPortraitAt = new Map<string, number>();
  private readonly portraitTransitionImages = new Map<string, {
    image: Phaser.GameObjects.Image;
    targetScale: number;
    startedAt: number;
  }>();

  constructor() {
    super(MISSION_BRIEFING_SCENE_KEY);
  }

  init(data: GameLaunchContext): void {
    this.context = data;
  }

  preload(): void {
    for (const cue of MISSION_PORTRAIT_IMAGE_CUES) {
      if (!this.textures.exists(cue.key)) {
        this.load.image(cue.key, cue.url);
      }
    }

    for (const frame of collectMissionBriefingBackdropFrames(this.context?.scenario?.briefing)) {
      if (!this.textures.exists(frame.key)) {
        this.load.image(frame.key, frame.url);
      }
    }

    for (const cue of collectVoiceCues(this.context?.scenario?.briefing)) {
      if (!this.cache.audio.exists(cue.key)) {
        this.load.audio(cue.key, cue.url);
      }
    }

    const musicCue = GAMEPLAY_AUDIO_CUE_BY_KEY.get(this.getMusicCueKey());
    if (musicCue && !this.cache.audio.exists(musicCue.key)) {
      this.load.audio(musicCue.key, musicCue.url);
    }
  }

  create(data: GameLaunchContext): void {
    this.context = data;
    this.launchController = new PreGameBriefingLaunchController();
    const briefing = data.scenario?.briefing;

    if (!briefing || data.resumeSnapshot) {
      this.startGameplay();
      return;
    }

    this.cameras.main.setBackgroundColor("#000000");
    this.resetPresentation();
    this.drawPresentation();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    this.typographyReadyUnsubscribe = whenPreGameTypographyReady(() => {
      if (!this.container || !this.scene.isActive(MISSION_BRIEFING_SCENE_KEY)) {
        return;
      }

      this.redrawPresentation(false);
    });
  }

  override update(time: number): void {
    if (!this.container || this.hideAt === null) {
      return;
    }

    this.updateBackdrop(time);
    this.updatePortraitTransitions(time);
    if (!this.lineScheduled && this.isIntroReady(time)) {
      this.lineScheduled = true;
      this.scheduleLine(time);
      this.redrawPresentation();
      return;
    }
    if (this.lineRevealAt !== null && time >= this.lineRevealAt) {
      this.revealLine(time);
      return;
    }
    if (this.nextLineAt !== null && time >= this.nextLineAt) {
      this.advanceLine(time);
      return;
    }
    if (time >= this.hideAt) {
      this.startGameplay();
    }
  }

  private handleResize(): void {
    this.redrawPresentation(false);
  }

  private handleShutdown(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.typographyReadyUnsubscribe?.();
    this.typographyReadyUnsubscribe = null;
    this.stopAudio();
    this.destroyPresentation();
    this.introducedPortraitAt.clear();
  }

  private resetPresentation(): void {
    const replay = createMissionBriefingReplayState(this.time.now);

    this.introStartedAt = replay.introStartedAt;
    this.introCompleted = replay.introCompleted;
    this.lineIndex = replay.lineIndex;
    this.lineRevealAt = replay.lineRevealAt;
    this.nextLineAt = replay.nextLineAt;
    this.lineScheduled = replay.lineScheduled;
    this.dismissed = replay.dismissed;
    this.hideAt = this.context?.scenario?.briefing?.noEnd ? Number.POSITIVE_INFINITY : this.time.now + BRIEFING_DURATION_MS;
    this.introducedPortraitAt.clear();
  }

  private drawPresentation(replayLineVoice = true): void {
    const briefing = this.context?.scenario?.briefing;
    if (!briefing) {
      return;
    }

    const { width, height } = this.scale;
    const line = this.getActiveLine(briefing);
    const container = this.add.container(0, 0).setDepth(1_000_000);
    const graphics = this.add.graphics().fillStyle(0x000000, 1).fillRect(0, 0, width, height);
    container.add(graphics);
    this.addBackdrop(container, width, height, briefing);

    if (line || this.dismissed) {
      this.addSpeechPresentation(container, briefing.lines, line, this.lineIndex, width, height);
    }
    if (this.isIntroReady(this.time.now)) {
      this.addBriefingMetadataPresentation(container, briefing, width, height);
    }

    container.add(
      this.add.zone(0, 0, width, height).setOrigin(0, 0).setInteractive({ useHandCursor: true })
        .on("pointerup", () => this.advanceLine(this.time.now)),
    );

    const buttonWidth = 104;
    const buttonGap = 12;
    const buttonY = Math.max(8, height - 40);
    const startX = width - 12 - buttonWidth;
    this.addButton(container, graphics, startX - buttonGap - buttonWidth, buttonY, buttonWidth, "다시보기", () => {
      this.stopVoice();
      this.resetPresentation();
      this.redrawPresentation();
    });
    this.addButton(container, graphics, startX, buttonY, buttonWidth, "게임 시작", () => this.startGameplay());

    this.container = container;
    this.playMusic();
    if (line && replayLineVoice) {
      this.playVoice(line);
    }
  }

  private redrawPresentation(replayLineVoice = true): void {
    if (!this.container) {
      return;
    }

    this.destroyPresentation();
    this.drawPresentation(replayLineVoice);
    this.updateBackdrop(this.time.now);
  }

  private getActiveLine(briefing: ScenarioBriefingDefinition): ScenarioBriefingLineDefinition | undefined {
    if (this.dismissed) {
      return undefined;
    }
    const revealPending = this.lineRevealAt !== null && this.time.now < this.lineRevealAt;
    return !this.lineScheduled || revealPending ? undefined : briefing.lines[this.lineIndex];
  }

  private addBackdrop(
    container: Phaser.GameObjects.Container,
    width: number,
    height: number,
    briefing: ScenarioBriefingDefinition,
  ): void {
    const frames = collectMissionBriefingBackdropFrames(briefing);
    const frameIndex = getMissionBriefingTitleFrameIndex(frames, this.introStartedAt ?? this.time.now, this.time.now, this.introCompleted);
    const frame = frames[frameIndex];
    if (!frame || !this.textures.exists(frame.key)) {
      return;
    }

    const scale = Math.min(width / BACKDROP_SOURCE_WIDTH, height / BACKDROP_SOURCE_HEIGHT);
    this.backdropImage = this.add.image(width / 2, height / 2, frame.key).setScale(scale);
    container.add(this.backdropImage);
  }

  private updateBackdrop(time: number): void {
    const briefing = this.context?.scenario?.briefing;
    if (!briefing || !this.backdropImage) {
      return;
    }

    const frames = collectMissionBriefingBackdropFrames(briefing);
    const frameIndex = getMissionBriefingTitleFrameIndex(frames, this.introStartedAt ?? time, time, this.introCompleted);
    const frame = frames[frameIndex];
    if (frame && this.backdropImage.texture.key !== frame.key) {
      this.backdropImage.setTexture(frame.key);
    }
  }

  private addButton(
    container: Phaser.GameObjects.Container,
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    label: string,
    onClick: () => void,
  ): void {
    const height = 32;
    graphics.fillStyle(0x102428, 0.94).fillRect(x, y, width, height).lineStyle(1, 0xd0b46a, 0.72).strokeRect(x, y, width, height);
    container.add(this.add.text(x + width / 2, y + 7, label, {
      fontFamily: PRE_GAME_KOREAN_FONT_FAMILY,
      fontSize: "13px",
      color: "#f1dfaa",
      resolution: resolvePreGameTextResolution(),
    }).setOrigin(0.5, 0));
    container.add(this.add.zone(x, y, width, height).setOrigin(0, 0).setInteractive({ useHandCursor: true })
      .on("pointerdown", (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => event.stopPropagation())
      .on("pointerup", (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation();
        onClick();
      }));
  }

  private advanceLine(time: number): void {
    const briefing = this.context?.scenario?.briefing;
    if (!briefing || !this.container) {
      return;
    }

    const action = getMissionBriefingClickAction(
      this.isIntroReady(time),
      this.lineRevealAt !== null && time < this.lineRevealAt,
      this.lineIndex + 1 >= briefing.lines.length,
      this.dismissed,
    );
    if (action === "complete-intro") {
      this.introCompleted = true;
      this.lineScheduled = true;
      this.scheduleLine(time, false);
      this.redrawPresentation();
      return;
    }
    if (action === "reveal-line") {
      this.revealLine(time);
      return;
    }
    if (action === "dismiss-line") {
      this.dismissed = true;
      this.lineRevealAt = null;
      this.nextLineAt = null;
      this.stopVoice();
      this.redrawPresentation();
      return;
    }
    if (action === "no-op") {
      return;
    }

    this.lineIndex += 1;
    this.scheduleLine(time);
    this.redrawPresentation();
  }

  private revealLine(time: number): void {
    this.scheduleLine(time, false);
    this.redrawPresentation();
  }

  private isIntroReady(time: number): boolean {
    return getMissionBriefingIntroStage(
      collectMissionBriefingBackdropFrames(this.context?.scenario?.briefing),
      this.introStartedAt ?? time,
      time,
      this.introCompleted,
    ) === "ready";
  }

  private scheduleLine(time: number, respectDelay = true): void {
    const line = this.context?.scenario?.briefing?.lines[this.lineIndex];
    if (!line) {
      this.lineRevealAt = null;
      this.nextLineAt = null;
      return;
    }

    const delay = respectDelay ? Math.max(0, Math.floor(line.delayBeforeMs ?? 0)) : 0;
    if (delay > 0) {
      this.lineRevealAt = time + delay;
      this.nextLineAt = null;
      return;
    }

    this.lineRevealAt = null;
    this.nextLineAt = this.lineIndex + 1 < (this.context?.scenario?.briefing?.lines.length ?? 0)
      ? time + getMissionLineDurationMs(line, BRIEFING_LINE_DURATION_MS)
      : null;
  }

  private startGameplay(): void {
    const context = this.context;
    if (!context || !this.launchController.startGameplay(this.scene, context)) {
      return;
    }

    this.stopAudio();
    this.destroyPresentation();
  }

  private destroyPresentation(): void {
    if (this.container) {
      this.tweens.killTweensOf(this.container.getAll());
      this.container.destroy(true);
    }
    this.container = null;
    this.backdropImage = null;
    this.portraitTransitionImages.clear();
  }

  private addSpeechPresentation(
    container: Phaser.GameObjects.Container,
    lines: readonly ScenarioBriefingLineDefinition[],
    activeLine: ScenarioBriefingLineDefinition | undefined,
    lineIndex: number,
    viewportWidth: number,
    viewportHeight: number,
  ): void {
    const activeSlot = activeLine ? getOriginalSpeechSlot(activeLine) : null;
    const participantLineIndex = this.dismissed ? lines.length - 1 : lineIndex;
    for (const participant of this.getParticipants(lines, participantLineIndex)) {
      const portraitKey = `${participant.speechSlot}:${normalizeMissionPortraitId(participant.portraitId)}`;
      const introductionStartedAt = this.introducedPortraitAt.get(portraitKey) ?? this.time.now;
      this.introducedPortraitAt.set(portraitKey, introductionStartedAt);
      this.addPortrait(
        container,
        participant,
        participant.speechSlot === activeSlot,
        viewportWidth,
        viewportHeight,
        introductionStartedAt,
      );
    }

    if (!activeLine || activeSlot === null) {
      return;
    }
    const layout = resolveOriginalSpeechLayout(viewportWidth, viewportHeight, activeSlot);
    container.add(this.add.text(layout.text.x, layout.text.centerY, activeLine.text, {
      fontFamily: PRE_GAME_KOREAN_FONT_FAMILY,
      fontSize: `${Math.max(1, Math.round(16 * layout.scale))}px`,
      color: "#ffffff",
      lineSpacing: Math.max(0, Math.round(4 * layout.scale)),
      stroke: "#000000",
      strokeThickness: Math.max(2, Math.round(2 * layout.scale)),
      wordWrap: { width: layout.text.maxWidth },
      resolution: resolvePreGameTextResolution(undefined, layout.scale),
    }).setOrigin(0, 0.5));
  }

  private addBriefingMetadataPresentation(
    container: Phaser.GameObjects.Container,
    briefing: ScenarioBriefingDefinition,
    viewportWidth: number,
    viewportHeight: number,
  ): void {
    const layout = resolveOriginalBriefingMetadataLayout(viewportWidth, viewportHeight);
    const fontSize = `${Math.max(1, Math.round(16 * layout.scale))}px`;
    const textStyle = {
      fontFamily: PRE_GAME_KOREAN_FONT_FAMILY,
      fontSize,
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: Math.max(2, Math.round(2 * layout.scale)),
      resolution: resolvePreGameTextResolution(undefined, layout.scale),
    } as const;

    if (briefing.objective.trim()) {
      container.add(this.add.text(
        layout.objective.x,
        layout.objective.firstStringCenterY,
        briefing.objective,
        {
          ...textStyle,
          lineSpacing: Math.max(0, Math.round(4 * layout.scale)),
          wordWrap: { width: layout.objective.maxWidth },
        },
      ).setOrigin(0, 0.5));
    }
    if (briefing.title.trim()) {
      container.add(this.add.text(
        layout.title.x,
        layout.title.centerY,
        briefing.title,
        textStyle,
      ).setOrigin(0, 0.5));
    }
  }

  private getParticipants(lines: readonly ScenarioBriefingLineDefinition[], lineIndex: number): Participant[] {
    const bySlot = new Map<OriginalSpeechSlot, Participant>();
    for (let index = 0; index <= Math.min(lineIndex, lines.length - 1); index += 1) {
      const line = lines[index];
      if (line) {
        bySlot.set(getOriginalSpeechSlot(line), { portraitId: line.portraitId, speechSlot: getOriginalSpeechSlot(line) });
      }
    }
    return [...bySlot.values()];
  }

  private addPortrait(
    container: Phaser.GameObjects.Container,
    participant: Participant,
    active: boolean,
    viewportWidth: number,
    viewportHeight: number,
    introductionStartedAt: number,
  ): void {
    const cue = portraitCueById.get(normalizeMissionPortraitId(participant.portraitId));
    if (!cue || !this.textures.exists(cue.key)) {
      return;
    }

    const { portrait } = resolveOriginalSpeechLayout(viewportWidth, viewportHeight, participant.speechSlot);
    const targetScale = portrait.width / 130;
    const introductionScale = getMissionBriefingPortraitScale(introductionStartedAt, this.time.now);
    const image = this.add.image(portrait.x + portrait.width / 2, portrait.y + portrait.height / 2, cue.key)
      .setScale(targetScale * introductionScale);
    if (!active) {
      image.setTint(0x534668);
    }
    container.add(image);
    const portraitKey = `${participant.speechSlot}:${normalizeMissionPortraitId(participant.portraitId)}`;
    this.portraitTransitionImages.set(portraitKey, { image, targetScale, startedAt: introductionStartedAt });

    const label = this.context?.scenario?.briefing?.portraitLabels?.[normalizeMissionPortraitId(participant.portraitId)];
    if (label) {
      const layout = resolveOriginalSpeechLayout(viewportWidth, viewportHeight, participant.speechSlot);
      container.add(this.add.text(layout.label.centerX, layout.label.y, label, {
        fontFamily: PRE_GAME_KOREAN_FONT_FAMILY,
        fontSize: `${Math.max(1, Math.round(12 * layout.scale))}px`,
        color: active ? "#f1dfaa" : "#9a8d9d",
        stroke: "#000000",
        strokeThickness: Math.max(1, Math.round(layout.scale)),
        resolution: resolvePreGameTextResolution(undefined, layout.scale),
      }).setOrigin(0.5, 0));
    }
  }

  private updatePortraitTransitions(time: number): void {
    for (const transition of this.portraitTransitionImages.values()) {
      transition.image.setScale(transition.targetScale * getMissionBriefingPortraitScale(transition.startedAt, time));
    }
  }

  private getMusicCueKey(): GameplayAudioCueKey {
    const musicSource = this.context?.scenario?.briefing?.musicSource?.trim().replaceAll("\\", "/").toLowerCase();
    return musicSource
      ? MISSION_BRIEFING_MUSIC_AUDIO_CUE_BY_SOURCE.get(musicSource) ?? MISSION_BRIEFING_MUSIC_AUDIO_CUE_KEY
      : MISSION_BRIEFING_MUSIC_AUDIO_CUE_KEY;
  }

  private playMusic(): void {
    if (this.musicPlaying || this.sound.mute) {
      return;
    }
    const cue = GAMEPLAY_AUDIO_CUE_BY_KEY.get(this.getMusicCueKey());
    if (cue && this.cache.audio.exists(cue.key) && this.sound.play(cue.key, { volume: cue.volume, loop: cue.loop ?? false })) {
      this.musicPlaying = true;
    }
  }

  private playVoice(line: ScenarioBriefingLineDefinition): void {
    this.stopVoice();
    const cue = collectVoiceCues(this.context?.scenario?.briefing).find((candidate) => candidate.voiceId === normalizeMissionVoiceId(line.voiceId));
    if (cue && !this.sound.mute && this.cache.audio.exists(cue.key)) {
      this.sound.play(cue.key, { volume: cue.volume });
    }
  }

  private stopVoice(): void {
    for (const cue of collectVoiceCues(this.context?.scenario?.briefing)) {
      this.sound.stopByKey(cue.key);
    }
  }

  private stopAudio(): void {
    this.stopVoice();
    this.sound.stopByKey(this.getMusicCueKey());
    this.musicPlaying = false;
  }
}

function collectVoiceCues(briefing: ScenarioBriefingDefinition | undefined): VoiceCue[] {
  const voiceIds = new Set<string>();
  for (const line of briefing?.lines ?? []) {
    const voiceId = normalizeMissionVoiceId(line.voiceId);
    if (voiceId) {
      voiceIds.add(voiceId);
    }
  }
  return [...voiceIds].sort().map((voiceId) => ({
    key: `${VOICE_AUDIO_PREFIX}${voiceId}`,
    voiceId,
    url: `assets/audio/mission/${voiceId}.wav`,
    volume: VOICE_AUDIO_VOLUME,
  }));
}
