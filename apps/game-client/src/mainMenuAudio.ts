import { resolveGameClientAssetUrl } from "./assetUrl.js";

export const MAIN_MENU_BACKGROUND_MUSIC_AUDIO_CUE_KEY = "audio:menu:background-music";
export const MAIN_MENU_BUTTON_AUDIO_CUE_KEY = "audio:menu:button";
export const MAIN_MENU_COUNTRY_SELECT_AUDIO_CUE_KEY = "audio:menu:country-select";

export interface MainMenuAudioCueDefinition {
  key: string;
  url: string;
  sourcePath: string;
  sourceSha256: string;
  durationMs: number;
  volume: number;
  loop: boolean;
}

/**
 * The source paths, hashes, PCM format, and durations are source-backed.
 * Browser playback policy (looping and volume) is a source-backed adaptation:
 * the original playback controller has not yet been statically reconstructed.
 */
export const MAIN_MENU_AUDIO_CUES = [
  {
    key: MAIN_MENU_BACKGROUND_MUSIC_AUDIO_CUE_KEY,
    url: "/assets/audio/menu/menumusic.wav",
    sourcePath: "music/menumusic.YAV",
    sourceSha256: "64b84670dd7d4dccb8160f7fd8a18566b47b06d6a5bdec7d55891147465797d3",
    durationMs: 40_823.58276643991,
    volume: 0.42,
    loop: true,
  },
  {
    key: MAIN_MENU_BUTTON_AUDIO_CUE_KEY,
    url: "/assets/audio/menu/titlebutton.wav",
    sourcePath: "eft/titlebutton.YAV",
    sourceSha256: "ef4b5800f22aeb8e84932c2f57b6c43fed7ef78ddef0e87cd91ad72570d89955",
    durationMs: 513.7414965986394,
    volume: 0.72,
    loop: false,
  },
  {
    key: MAIN_MENU_COUNTRY_SELECT_AUDIO_CUE_KEY,
    url: "/assets/audio/menu/selectcountry.wav",
    sourcePath: "eft/selectcountry.YAV",
    sourceSha256: "4cb6223164c874dc60052c53f3f04dabe89070c45adc8e05b12d1492d8714942",
    durationMs: 267.39229024943313,
    volume: 0.72,
    loop: false,
  },
] as const satisfies readonly MainMenuAudioCueDefinition[];

export type MainMenuAudioCueKey = (typeof MAIN_MENU_AUDIO_CUES)[number]["key"];

export const MAIN_MENU_AUDIO_CUE_BY_KEY: ReadonlyMap<MainMenuAudioCueKey, MainMenuAudioCueDefinition> = new Map(
  MAIN_MENU_AUDIO_CUES.map((cue) => [cue.key, cue] as const),
);

export interface MainMenuAudioSceneContract {
  cache: { audio: { exists(key: string): boolean } };
  load: { audio(key: string, url: string): void };
  sound: {
    mute: boolean;
    play(key: string, config: { volume: number; loop: boolean }): unknown;
    stopByKey(key: string): void;
  };
}

export function queueMainMenuAudio(scene: MainMenuAudioSceneContract): boolean {
  let queuedAny = false;
  for (const cue of MAIN_MENU_AUDIO_CUES) {
    if (scene.cache.audio.exists(cue.key)) {
      continue;
    }

    try {
      scene.load.audio(cue.key, resolveGameClientAssetUrl(cue.url));
      queuedAny = true;
    } catch (error) {
      console.warn("Failed to queue main menu audio cue", { cueKey: cue.key, error });
    }
  }
  return queuedAny;
}

/** @deprecated Menu audio is intentionally queued after the landing screen paints. */
export const preloadMainMenuAudio = queueMainMenuAudio;

export function playMainMenuAudioCue(scene: MainMenuAudioSceneContract, cueKey: MainMenuAudioCueKey): boolean {
  if (scene.sound.mute || !scene.cache.audio.exists(cueKey)) {
    return false;
  }

  const cue = MAIN_MENU_AUDIO_CUE_BY_KEY.get(cueKey);
  if (!cue) {
    return false;
  }

  try {
    return Boolean(scene.sound.play(cue.key, { volume: cue.volume, loop: cue.loop }));
  } catch (error) {
    console.warn("Failed to play main menu audio cue", { cueKey, error });
    return false;
  }
}

export function startMainMenuBackgroundMusic(scene: MainMenuAudioSceneContract): boolean {
  return playMainMenuAudioCue(scene, MAIN_MENU_BACKGROUND_MUSIC_AUDIO_CUE_KEY);
}

export function stopMainMenuBackgroundMusic(scene: MainMenuAudioSceneContract): void {
  try {
    scene.sound.stopByKey(MAIN_MENU_BACKGROUND_MUSIC_AUDIO_CUE_KEY);
  } catch (error) {
    console.warn("Failed to stop main menu background music", { error });
  }
}
