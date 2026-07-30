import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAIN_MENU_AUDIO_CUES,
  MAIN_MENU_BACKGROUND_MUSIC_AUDIO_CUE_KEY,
  MAIN_MENU_BUTTON_AUDIO_CUE_KEY,
  MAIN_MENU_COUNTRY_SELECT_AUDIO_CUE_KEY,
  playMainMenuAudioCue,
  preloadMainMenuAudio,
  startMainMenuBackgroundMusic,
  stopMainMenuBackgroundMusic,
  type MainMenuAudioSceneContract,
} from "./mainMenuAudio.js";

const gameClientSrcDirectory = dirname(fileURLToPath(import.meta.url));
const publicDirectory = resolve(gameClientSrcDirectory, "../public");
const originalDirectory = resolve(gameClientSrcDirectory, "../../../original/imjinrok2");
const menuManifestPath = resolve(publicDirectory, "assets/audio/menu/manifest.json");

test("main menu audio manifest preserves source hashes and converted WAV durations", () => {
  const manifest = JSON.parse(readFileSync(menuManifestPath, "utf8")) as Array<{
    key: string;
    url: string;
    sourcePath: string;
    sourceSha256: string;
    durationMs: number;
  }>;

  assert.deepEqual(
    manifest.map(({ key, url, sourcePath, sourceSha256, durationMs }) => ({ key, url, sourcePath, sourceSha256, durationMs })),
    MAIN_MENU_AUDIO_CUES.map(({ key, url, sourcePath, sourceSha256, durationMs }) => ({ key, url, sourcePath, sourceSha256, durationMs })),
  );

  for (const cue of MAIN_MENU_AUDIO_CUES) {
    const sourcePath = resolve(originalDirectory, cue.sourcePath);
    const wavPath = resolve(publicDirectory, cue.url.slice(1));
    assert.equal(existsSync(sourcePath), true, `missing source ${cue.sourcePath}`);
    assert.equal(createHash("sha256").update(readFileSync(sourcePath)).digest("hex"), cue.sourceSha256);

    const source = readYavFormat(sourcePath);
    const wav = readWavFormat(wavPath);
    assert.equal(wav.channels, source.channels, cue.url);
    assert.equal(wav.sampleRate, source.sampleRate, cue.url);
    assert.equal(wav.bitsPerSample, source.bitsPerSample, cue.url);
    assert.ok(wav.dataSize > 0, cue.url);
    assert.ok(Math.abs((wav.dataSize / wav.byteRate) * 1_000 - cue.durationMs) < 0.001, cue.url);
  }
});

test("main menu audio queues absent assets and preserves existing cache entries", () => {
  const scene = createScene({ cached: [MAIN_MENU_BUTTON_AUDIO_CUE_KEY] });

  preloadMainMenuAudio(scene.contract);

  assert.deepEqual(scene.loaded, [
    [MAIN_MENU_BACKGROUND_MUSIC_AUDIO_CUE_KEY, "/assets/audio/menu/menumusic.wav"],
    [MAIN_MENU_COUNTRY_SELECT_AUDIO_CUE_KEY, "/assets/audio/menu/selectcountry.wav"],
  ]);
});

test("main menu audio preload failures do not block later cue requests", () => {
  const scene = createScene({ loadErrorFor: MAIN_MENU_BACKGROUND_MUSIC_AUDIO_CUE_KEY });
  const originalWarn = console.warn;
  console.warn = () => undefined;
  try {
    preloadMainMenuAudio(scene.contract);
  } finally {
    console.warn = originalWarn;
  }

  assert.deepEqual(scene.loaded, [
    [MAIN_MENU_BUTTON_AUDIO_CUE_KEY, "/assets/audio/menu/titlebutton.wav"],
    [MAIN_MENU_COUNTRY_SELECT_AUDIO_CUE_KEY, "/assets/audio/menu/selectcountry.wav"],
  ]);
});

test("main menu audio treats mute, missing assets, and playback failures as non-blocking", () => {
  const muted = createScene({ cached: [MAIN_MENU_BUTTON_AUDIO_CUE_KEY], muted: true });
  assert.equal(playMainMenuAudioCue(muted.contract, MAIN_MENU_BUTTON_AUDIO_CUE_KEY), false);
  assert.equal(muted.played.length, 0);

  const missing = createScene();
  assert.equal(playMainMenuAudioCue(missing.contract, MAIN_MENU_BUTTON_AUDIO_CUE_KEY), false);
  assert.equal(missing.played.length, 0);

  const failing = createScene({ cached: [MAIN_MENU_BUTTON_AUDIO_CUE_KEY], playError: new Error("audio unavailable") });
  const originalWarn = console.warn;
  console.warn = () => undefined;
  try {
    assert.equal(playMainMenuAudioCue(failing.contract, MAIN_MENU_BUTTON_AUDIO_CUE_KEY), false);
  } finally {
    console.warn = originalWarn;
  }
});

test("main menu music exposes explicit start and stop lifecycle", () => {
  const scene = createScene({ cached: [MAIN_MENU_BACKGROUND_MUSIC_AUDIO_CUE_KEY] });

  assert.equal(startMainMenuBackgroundMusic(scene.contract), true);
  stopMainMenuBackgroundMusic(scene.contract);

  assert.deepEqual(scene.played, [[MAIN_MENU_BACKGROUND_MUSIC_AUDIO_CUE_KEY, { volume: 0.42, loop: true }]]);
  assert.deepEqual(scene.stopped, [MAIN_MENU_BACKGROUND_MUSIC_AUDIO_CUE_KEY]);
});

function createScene(options: { cached?: string[]; muted?: boolean; playError?: Error; loadErrorFor?: string } = {}) {
  const cached = new Set(options.cached);
  const loaded: Array<[string, string]> = [];
  const played: Array<[string, { volume: number; loop: boolean }]> = [];
  const stopped: string[] = [];
  const contract: MainMenuAudioSceneContract = {
    cache: { audio: { exists: (key) => cached.has(key) } },
    load: {
      audio: (key, url) => {
        if (options.loadErrorFor === key) {
          throw new Error("loader unavailable");
        }
        loaded.push([key, url]);
      },
    },
    sound: {
      mute: options.muted ?? false,
      play: (key, config) => {
        if (options.playError) {
          throw options.playError;
        }
        played.push([key, config]);
        return true;
      },
      stopByKey: (key) => stopped.push(key),
    },
  };
  return { contract, loaded, played, stopped };
}

function readWavFormat(path: string): { channels: number; sampleRate: number; bitsPerSample: number; byteRate: number; dataSize: number } {
  const wav = readFileSync(path);
  assert.equal(wav.subarray(0, 4).toString("ascii"), "RIFF", `${path} should be a RIFF file`);
  assert.equal(wav.subarray(8, 12).toString("ascii"), "WAVE", `${path} should be a WAVE file`);
  assert.equal(wav.subarray(36, 40).toString("ascii"), "data", `${path} should contain a data chunk`);
  return {
    channels: wav.readUInt16LE(22),
    sampleRate: wav.readUInt32LE(24),
    bitsPerSample: wav.readUInt16LE(34),
    byteRate: wav.readUInt32LE(28),
    dataSize: wav.readUInt32LE(40),
  };
}

function readYavFormat(path: string): { channels: number; sampleRate: number; bitsPerSample: number } {
  const yav = readFileSync(path);
  assert.equal(yav.readUInt32LE(0), 18, `${path} should use the supported YAV fmt size`);
  assert.equal(yav.readUInt16LE(4), 1, `${path} should be PCM`);
  return {
    channels: yav.readUInt16LE(6),
    sampleRate: yav.readUInt32LE(8),
    bitsPerSample: yav.readUInt16LE(18),
  };
}
