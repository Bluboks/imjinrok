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
import {
  createMissionBriefingReplayState,
  getMissionBriefingClickAction,
  getMissionBriefingIntroFrameAlphas,
  getMissionBriefingIntroStage,
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
  private introImage: Phaser.GameObjects.Image | null = null;
  private introStartedAt: number | null = null;
  private hideAt: number | null = null;
  private lineIndex = 0;
  private lineRevealAt: number | null = null;
  private nextLineAt: number | null = null;
  private introCompleted = false;
  private lineScheduled = false;
  private musicPlaying = false;
  private readonly introducedPortraitKeys = new Set<string>();

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
  }

  override update(time: number): void {
    if (!this.container || this.hideAt === null) {
      return;
    }

    this.updateBackdrop(time);
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
    this.redrawPresentation();
  }

  private handleShutdown(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.stopAudio();
    this.destroyPresentation();
    this.introducedPortraitKeys.clear();
  }

  private resetPresentation(): void {
    const replay = createMissionBriefingReplayState(this.time.now);

    this.introStartedAt = replay.introStartedAt;
    this.introCompleted = replay.introCompleted;
    this.lineIndex = replay.lineIndex;
    this.lineRevealAt = replay.lineRevealAt;
    this.nextLineAt = replay.nextLineAt;
    this.lineScheduled = replay.lineScheduled;
    this.hideAt = this.context?.scenario?.briefing?.noEnd ? Number.POSITIVE_INFINITY : this.time.now + BRIEFING_DURATION_MS;
    this.introducedPortraitKeys.clear();
  }

  private drawPresentation(): void {
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

    if (line) {
      this.addSpeechPresentation(container, briefing.lines, line, this.lineIndex, width, height);
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
      this.resetPresentation();
      this.redrawPresentation();
    });
    this.addButton(container, graphics, startX, buttonY, buttonWidth, "게임 시작", () => this.startGameplay());

    this.container = container;
    this.playMusic();
    if (line) {
      this.playVoice(line);
    }
  }

  private redrawPresentation(): void {
    if (!this.container) {
      return;
    }

    this.destroyPresentation();
    this.drawPresentation();
    this.updateBackdrop(this.time.now);
  }

  private getActiveLine(briefing: ScenarioBriefingDefinition): ScenarioBriefingLineDefinition | undefined {
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
    const baseFrame = frames[0];
    const completedFrame = frames.at(-1);
    if (!baseFrame || !this.textures.exists(baseFrame.key)) {
      return;
    }

    const scale = Math.min(width / BACKDROP_SOURCE_WIDTH, height / BACKDROP_SOURCE_HEIGHT);
    const alphas = this.getBackdropAlphas(this.time.now);
    this.backdropImage = this.add.image(width / 2, height / 2, baseFrame.key).setScale(scale).setAlpha(alphas.base);
    container.add(this.backdropImage);
    if (completedFrame && this.textures.exists(completedFrame.key)) {
      this.introImage = this.add.image(width / 2, height / 2, completedFrame.key).setScale(scale).setAlpha(alphas.completed);
      container.add(this.introImage);
    }
  }

  private getBackdropAlphas(time: number): { base: number; completed: number } {
    return getMissionBriefingIntroFrameAlphas(this.introStartedAt ?? time, time, this.introCompleted);
  }

  private updateBackdrop(time: number): void {
    const briefing = this.context?.scenario?.briefing;
    if (!briefing || !this.backdropImage || !this.introImage) {
      return;
    }

    const completedFrame = collectMissionBriefingBackdropFrames(briefing).at(-1);
    const alphas = this.getBackdropAlphas(time);
    this.backdropImage.setAlpha(alphas.base);
    if (completedFrame && this.introImage.texture.key !== completedFrame.key) {
      this.introImage.setTexture(completedFrame.key);
    }
    this.introImage.setAlpha(alphas.completed);
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
      fontFamily: "Noto Sans KR, Malgun Gothic, Apple SD Gothic Neo, Trebuchet MS, sans-serif",
      fontSize: "13px",
      color: "#f1dfaa",
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
    if (action === "hold-line") {
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
    return getMissionBriefingIntroStage(this.introStartedAt ?? time, time, this.introCompleted) === "ready";
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
    this.introImage = null;
  }

  private addSpeechPresentation(
    container: Phaser.GameObjects.Container,
    lines: readonly ScenarioBriefingLineDefinition[],
    activeLine: ScenarioBriefingLineDefinition,
    lineIndex: number,
    viewportWidth: number,
    viewportHeight: number,
  ): void {
    const activeSlot = getOriginalSpeechSlot(activeLine);
    for (const participant of this.getParticipants(lines, lineIndex)) {
      const portraitKey = `${participant.speechSlot}:${normalizeMissionPortraitId(participant.portraitId)}`;
      const isNew = !this.introducedPortraitKeys.has(portraitKey);
      this.introducedPortraitKeys.add(portraitKey);
      this.addPortrait(container, participant, participant.speechSlot === activeSlot, viewportWidth, viewportHeight, isNew);
    }

    const layout = resolveOriginalSpeechLayout(viewportWidth, viewportHeight, activeSlot);
    container.add(this.add.text(layout.text.x, layout.text.centerY, activeLine.text, {
      fontFamily: "Noto Sans KR, Malgun Gothic, Apple SD Gothic Neo, sans-serif",
      fontSize: `${Math.max(1, Math.round(16 * layout.scale))}px`,
      color: "#ffffff",
      lineSpacing: Math.max(0, Math.round(4 * layout.scale)),
      stroke: "#000000",
      strokeThickness: Math.max(2, Math.round(2 * layout.scale)),
      wordWrap: { width: layout.text.maxWidth },
    }).setOrigin(0, 0.5));
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
    animateIntroduction: boolean,
  ): void {
    const cue = portraitCueById.get(normalizeMissionPortraitId(participant.portraitId));
    if (!cue || !this.textures.exists(cue.key)) {
      return;
    }

    const { portrait } = resolveOriginalSpeechLayout(viewportWidth, viewportHeight, participant.speechSlot);
    const targetScale = portrait.width / 130;
    const image = this.add.image(portrait.x + portrait.width / 2, portrait.y + portrait.height / 2, cue.key)
      .setScale(animateIntroduction ? 0 : targetScale);
    if (!active) {
      image.setTint(0x534668);
    }
    container.add(image);
    if (animateIntroduction) {
      this.tweens.add({ targets: image, scaleX: targetScale, scaleY: targetScale, duration: 240, ease: "Cubic.easeOut" });
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
