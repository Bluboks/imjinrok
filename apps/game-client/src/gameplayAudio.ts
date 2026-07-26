import type { UnitDefinitionId } from "@shared";

export const UNDER_ATTACK_ALERT_COOLDOWN_MS = 3_500;
export const BUILD_DONE_AUDIO_CUE_KEY = "audio:ui:build-done";
export const COMMAND_REJECTED_AUDIO_CUE_KEY = "audio:ui:cannot-make-there";
export const MISSION_BRIEFING_MUSIC_AUDIO_CUE_KEY = "audio:music:mission-briefing";
export const MISSION_DEFEAT_AUDIO_CUE_KEY = "audio:music:mission-defeat";
export const MISSION_VICTORY_AUDIO_CUE_KEY = "audio:music:mission-victory";
export const TRAINING_DONE_AUDIO_CUE_KEY = "audio:ui:training-done";
export const UNDER_ATTACK_AUDIO_CUE_KEY = "audio:ui:be-attacked";
export const UPGRADE_DONE_AUDIO_CUE_KEY = "audio:ui:upgrade-done";

export type UnitAudioAction = "attack" | "die" | "move" | "select";

export interface GameplayAudioCueDefinition {
  key: string;
  url: string;
  volume: number;
  cooldownMs: number;
  loop?: boolean;
}

export const GAMEPLAY_AUDIO_CUES = [
  { key: "audio:voice:select-farmer-k1", url: "assets/audio/voice/select_farmerk1.wav", volume: 0.72, cooldownMs: 650 },
  { key: "audio:voice:move-farmer-k1", url: "assets/audio/voice/move_farmerk1.wav", volume: 0.72, cooldownMs: 750 },
  { key: "audio:voice:attack-farmer-k1", url: "assets/audio/voice/attack_farmerk1.wav", volume: 0.72, cooldownMs: 850 },
  { key: "audio:voice:die-farmer-k1", url: "assets/audio/voice/die_farmerk1.wav", volume: 0.76, cooldownMs: 700 },
  { key: "audio:voice:select-sword-k1", url: "assets/audio/voice/select_swordk1.wav", volume: 0.72, cooldownMs: 650 },
  { key: "audio:voice:move-sword-k1", url: "assets/audio/voice/move_swordk1.wav", volume: 0.72, cooldownMs: 750 },
  { key: "audio:voice:attack-sword-k1", url: "assets/audio/voice/attack_swordk1.wav", volume: 0.76, cooldownMs: 850 },
  { key: "audio:voice:die-sword-k1", url: "assets/audio/voice/die_swordk1.wav", volume: 0.78, cooldownMs: 700 },
  { key: "audio:voice:select-archer-k1", url: "assets/audio/voice/select_archerk1.wav", volume: 0.72, cooldownMs: 650 },
  { key: "audio:voice:move-archer-k1", url: "assets/audio/voice/move_archerk1.wav", volume: 0.72, cooldownMs: 750 },
  { key: "audio:voice:attack-archer-k1", url: "assets/audio/voice/attack_archerk1.wav", volume: 0.76, cooldownMs: 850 },
  { key: "audio:voice:die-archer-k1", url: "assets/audio/voice/die_archerk1.wav", volume: 0.78, cooldownMs: 700 },
  { key: "audio:voice:select-sword-j1", url: "assets/audio/voice/select_swordj1.wav", volume: 0.72, cooldownMs: 650 },
  { key: "audio:voice:move-sword-j1", url: "assets/audio/voice/move_swordj1.wav", volume: 0.72, cooldownMs: 750 },
  { key: "audio:voice:attack-sword-j1", url: "assets/audio/voice/attack_swordj1.wav", volume: 0.76, cooldownMs: 850 },
  { key: "audio:voice:die-sword-j1", url: "assets/audio/voice/die_swordj1.wav", volume: 0.78, cooldownMs: 700 },
  { key: "audio:voice:select-gun-j1", url: "assets/audio/voice/select_gunj1.wav", volume: 0.72, cooldownMs: 650 },
  { key: "audio:voice:move-gun-j1", url: "assets/audio/voice/move_gunj1.wav", volume: 0.72, cooldownMs: 750 },
  { key: "audio:voice:attack-gun-j1", url: "assets/audio/voice/attack_gunj1.wav", volume: 0.76, cooldownMs: 850 },
  { key: "audio:voice:die-gun-j1", url: "assets/audio/voice/die_gunj1.wav", volume: 0.78, cooldownMs: 700 },
  { key: "audio:voice:hq-k1", url: "assets/audio/voice/hqk1.wav", volume: 0.7, cooldownMs: 650 },
  { key: "audio:voice:mill-k1", url: "assets/audio/voice/millk1.wav", volume: 0.7, cooldownMs: 650 },
  { key: "audio:voice:barrack-k1", url: "assets/audio/voice/barrackk1.wav", volume: 0.7, cooldownMs: 650 },
  { key: "audio:voice:firehouse-k1", url: "assets/audio/voice/firehousek1.wav", volume: 0.7, cooldownMs: 650 },
  { key: "audio:voice:hq-j1", url: "assets/audio/voice/hqj1.wav", volume: 0.7, cooldownMs: 650 },
  { key: "audio:voice:barrack-j", url: "assets/audio/voice/select_barrackj.wav", volume: 0.7, cooldownMs: 650 },
  { key: "audio:voice:firehouse-j", url: "assets/audio/voice/select_firehousej.wav", volume: 0.7, cooldownMs: 650 },
  { key: "audio:voice:select-general-k42", url: "assets/audio/voice/select_generalk42.wav", volume: 0.72, cooldownMs: 650 },
  { key: "audio:voice:move-general-k42", url: "assets/audio/voice/move_generalk42.wav", volume: 0.72, cooldownMs: 750 },
  { key: "audio:voice:attack-general-k4", url: "assets/audio/voice/attack_generalk4.wav", volume: 0.76, cooldownMs: 850 },
  { key: BUILD_DONE_AUDIO_CUE_KEY, url: "assets/audio/ui/builddone.wav", volume: 0.76, cooldownMs: 900 },
  { key: COMMAND_REJECTED_AUDIO_CUE_KEY, url: "assets/audio/ui/cannotmakethere.wav", volume: 0.76, cooldownMs: 1_000 },
  { key: MISSION_BRIEFING_MUSIC_AUDIO_CUE_KEY, url: "assets/audio/music/briefmusic.wav", volume: 0.42, cooldownMs: 0, loop: true },
  { key: MISSION_DEFEAT_AUDIO_CUE_KEY, url: "assets/audio/music/lose.wav", volume: 0.68, cooldownMs: 6_000 },
  { key: MISSION_VICTORY_AUDIO_CUE_KEY, url: "assets/audio/music/win.wav", volume: 0.72, cooldownMs: 6_000 },
  { key: TRAINING_DONE_AUDIO_CUE_KEY, url: "assets/audio/ui/trainspotdonemessage.wav", volume: 0.74, cooldownMs: 900 },
  { key: UNDER_ATTACK_AUDIO_CUE_KEY, url: "assets/audio/ui/beattackedmessage.wav", volume: 0.82, cooldownMs: UNDER_ATTACK_ALERT_COOLDOWN_MS },
  { key: UPGRADE_DONE_AUDIO_CUE_KEY, url: "assets/audio/ui/upgradedone.wav", volume: 0.76, cooldownMs: 900 },
] as const satisfies readonly GameplayAudioCueDefinition[];

export type GameplayAudioCueKey = (typeof GAMEPLAY_AUDIO_CUES)[number]["key"];

export const GAMEPLAY_AUDIO_CUE_BY_KEY: ReadonlyMap<GameplayAudioCueKey, GameplayAudioCueDefinition> = new Map(
  GAMEPLAY_AUDIO_CUES.map((cue) => [cue.key, cue] as const),
);

export const MISSION_BRIEFING_MUSIC_AUDIO_CUE_BY_SOURCE = new Map<string, GameplayAudioCueKey>([
  ["music/briefmusic.yav", MISSION_BRIEFING_MUSIC_AUDIO_CUE_KEY],
]);

export const UNIT_AUDIO_CUES: Partial<Record<UnitDefinitionId, Partial<Record<UnitAudioAction, GameplayAudioCueKey>>>> = {
  "town-center": { select: "audio:voice:hq-k1" },
  house: { select: "audio:voice:mill-k1" },
  barracks: { select: "audio:voice:barrack-k1" },
  beacon: { select: "audio:voice:firehouse-k1" },
  "japanese-camp-house": { select: "audio:voice:hq-j1" },
  "japanese-camp-barracks": { select: "audio:voice:barrack-j" },
  "japanese-camp-tower": { select: "audio:voice:firehouse-j" },
  "japanese-camp-firehouse": { select: "audio:voice:firehouse-j" },
  "japanese-camp-advanced-tower": { select: "audio:voice:firehouse-j" },
  villager: {
    attack: "audio:voice:attack-farmer-k1",
    die: "audio:voice:die-farmer-k1",
    move: "audio:voice:move-farmer-k1",
    select: "audio:voice:select-farmer-k1",
  },
  swordsman: {
    attack: "audio:voice:attack-sword-k1",
    die: "audio:voice:die-sword-k1",
    move: "audio:voice:move-sword-k1",
    select: "audio:voice:select-sword-k1",
  },
  archer: {
    attack: "audio:voice:attack-archer-k1",
    die: "audio:voice:die-archer-k1",
    move: "audio:voice:move-archer-k1",
    select: "audio:voice:select-archer-k1",
  },
  "japanese-swordsman": {
    attack: "audio:voice:attack-sword-j1",
    die: "audio:voice:die-sword-j1",
    move: "audio:voice:move-sword-j1",
    select: "audio:voice:select-sword-j1",
  },
  "japanese-gunner": {
    attack: "audio:voice:attack-gun-j1",
    die: "audio:voice:die-gun-j1",
    move: "audio:voice:move-gun-j1",
    select: "audio:voice:select-gun-j1",
  },
  "ryu-seong-ryong": {
    attack: "audio:voice:attack-general-k4",
    move: "audio:voice:move-general-k42",
    select: "audio:voice:select-general-k42",
  },
  "gwon-yul": {
    attack: "audio:voice:attack-general-k4",
    move: "audio:voice:move-general-k42",
    select: "audio:voice:select-general-k42",
  },
  "royal-cart": {
    move: "audio:voice:move-general-k42",
    select: "audio:voice:select-general-k42",
  },
};
