import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { UnitDefinitionId } from "@shared";
import {
  GAMEPLAY_AUDIO_CUES,
  GAMEPLAY_AUDIO_CUE_BY_KEY,
  MISSION_BRIEFING_MUSIC_AUDIO_CUE_BY_SOURCE,
  MISSION_BRIEFING_MUSIC_AUDIO_CUE_KEY,
  UNIT_AUDIO_CUES,
  selectProductionCompleteAudioCue,
  type GameplayAudioCueKey,
  type UnitAudioAction,
} from "./gameplayAudio.js";

const gameClientSrcDirectory = dirname(fileURLToPath(import.meta.url));
const publicDirectory = resolve(gameClientSrcDirectory, "../public");
const originalTempEftDirectory = resolve(gameClientSrcDirectory, "../../../original/imjinrok2/tempeft");

interface SourceBackedUnitAudioMapping {
  kind: UnitDefinitionId;
  action: UnitAudioAction;
  cueKey: GameplayAudioCueKey;
  sourceFileName: string;
}

const japaneseSourceBackedMappings = [
  {
    kind: "japanese-farmer",
    action: "select",
    cueKey: "audio:voice:select-farmer-j1",
    sourceFileName: "select_farmerj1.YAV",
  },
  {
    kind: "japanese-farmer",
    action: "move",
    cueKey: "audio:voice:move-farmer-j1",
    sourceFileName: "move_farmerj1.YAV",
  },
  {
    kind: "japanese-farmer",
    action: "attack",
    cueKey: "audio:voice:attack-farmer-j1",
    sourceFileName: "attack_farmerj1.YAV",
  },
  {
    kind: "japanese-swordsman",
    action: "select",
    cueKey: "audio:voice:select-sword-j1",
    sourceFileName: "select_swordj1.YAV",
  },
  {
    kind: "japanese-swordsman",
    action: "move",
    cueKey: "audio:voice:move-sword-j1",
    sourceFileName: "move_swordj1.YAV",
  },
  {
    kind: "japanese-swordsman",
    action: "attack",
    cueKey: "audio:voice:attack-sword-j1",
    sourceFileName: "attack_swordj1.YAV",
  },
  {
    kind: "japanese-swordsman",
    action: "die",
    cueKey: "audio:voice:die-sword-j1",
    sourceFileName: "die_swordj1.YAV",
  },
  {
    kind: "japanese-gunner",
    action: "select",
    cueKey: "audio:voice:select-gun-j1",
    sourceFileName: "select_gunj1.YAV",
  },
  {
    kind: "japanese-gunner",
    action: "move",
    cueKey: "audio:voice:move-gun-j1",
    sourceFileName: "move_gunj1.YAV",
  },
  {
    kind: "japanese-gunner",
    action: "attack",
    cueKey: "audio:voice:attack-gun-j1",
    sourceFileName: "attack_gunj1.YAV",
  },
  {
    kind: "japanese-gunner",
    action: "die",
    cueKey: "audio:voice:die-gun-j1",
    sourceFileName: "die_gunj1.YAV",
  },
  {
    kind: "japanese-camp-house",
    action: "select",
    cueKey: "audio:voice:hq-j1",
    sourceFileName: "hqj1.YAV",
  },
  {
    kind: "japanese-camp-barracks",
    action: "select",
    cueKey: "audio:voice:barrack-j",
    sourceFileName: "select_barrackj.YAV",
  },
  {
    kind: "japanese-camp-tower",
    action: "select",
    cueKey: "audio:voice:firehouse-j",
    sourceFileName: "select_firehousej.YAV",
  },
  {
    kind: "japanese-camp-firehouse",
    action: "select",
    cueKey: "audio:voice:firehouse-j",
    sourceFileName: "select_firehousej.YAV",
  },
  {
    kind: "japanese-camp-advanced-tower",
    action: "select",
    cueKey: "audio:voice:firehouse-j",
    sourceFileName: "select_firehousej.YAV",
  },
] as const satisfies readonly SourceBackedUnitAudioMapping[];

test("gameplay audio cue assets resolve to converted WAV files", () => {
  const seenCueKeys = new Set<string>();

  for (const cue of GAMEPLAY_AUDIO_CUES) {
    assert.equal(seenCueKeys.has(cue.key), false, `duplicate cue key ${cue.key}`);
    seenCueKeys.add(cue.key);

    const wavPath = resolve(publicDirectory, cue.url);
    const wavFormat = readWavFormat(wavPath);

    assert.ok(wavFormat.dataSize > 0, `${cue.url} should contain PCM data`);
  }
});

test("K01/K02 briefing music uses the source CHANGEMUSIC cue", () => {
  assert.equal(MISSION_BRIEFING_MUSIC_AUDIO_CUE_BY_SOURCE.get("music/briefmusic.yav"), MISSION_BRIEFING_MUSIC_AUDIO_CUE_KEY);

  const cue = GAMEPLAY_AUDIO_CUE_BY_KEY.get(MISSION_BRIEFING_MUSIC_AUDIO_CUE_KEY);
  const sourcePath = resolve(gameClientSrcDirectory, "../../../original/imjinrok2/music/briefmusic.YAV");

  assert.ok(cue);
  assert.equal(existsSync(sourcePath), true);
  const sourceFormat = readYavFormat(sourcePath);
  const wavFormat = readWavFormat(resolve(publicDirectory, cue.url));

  assert.equal(wavFormat.channels, sourceFormat.channels);
  assert.equal(wavFormat.sampleRate, sourceFormat.sampleRate);
  assert.equal(wavFormat.bitsPerSample, sourceFormat.bitsPerSample);
  assert.ok(wavFormat.dataSize > 0);
});

test("Japanese K01/K02 enemy units and camp structures use source-backed audio cues", () => {
  for (const mapping of japaneseSourceBackedMappings) {
    assert.equal(UNIT_AUDIO_CUES[mapping.kind]?.[mapping.action], mapping.cueKey, `${mapping.kind}:${mapping.action}`);

    const cue = GAMEPLAY_AUDIO_CUE_BY_KEY.get(mapping.cueKey);

    assert.ok(cue, `${mapping.cueKey} should be registered`);
    const sourcePath = resolve(originalTempEftDirectory, mapping.sourceFileName);

    assert.equal(existsSync(sourcePath), true, `missing source ${mapping.sourceFileName}`);
    const sourceFormat = readYavFormat(sourcePath);
    const wavFormat = readWavFormat(resolve(publicDirectory, cue.url));

    assert.equal(wavFormat.channels, sourceFormat.channels, cue.url);
    assert.equal(wavFormat.sampleRate, sourceFormat.sampleRate, cue.url);
    assert.equal(wavFormat.bitsPerSample, sourceFormat.bitsPerSample, cue.url);
    assert.ok(wavFormat.dataSize > 0, cue.url);
    assertConvertedYavPcmPayload(sourcePath, resolve(publicDirectory, cue.url));
  }
});

test("production completion is silent for normal units unless an audio profile opts in", () => {
  const createdUnits = [
    { id: "sword-1", playerId: "local", kind: "swordsman" },
    { id: "villager-1", playerId: "local", kind: "villager" },
  ] as const;
  const areAllied = (left: string, right: string) => left === right;

  assert.equal(selectProductionCompleteAudioCue(createdUnits, new Set(), "local", areAllied), undefined);

  const modAudioProfiles: typeof UNIT_AUDIO_CUES = {
    ...UNIT_AUDIO_CUES,
    villager: {
      ...UNIT_AUDIO_CUES.villager,
      productionComplete: "audio:ui:training-done",
    },
  };

  assert.equal(
    selectProductionCompleteAudioCue(createdUnits, new Set(), "local", areAllied, modAudioProfiles),
    "audio:ui:training-done",
  );
});

test("production completion policy initializes silently and chooses one deterministic opt-in cue per sync", () => {
  const units = [
    { id: "hero-b", playerId: "local", kind: "gwon-yul" },
    { id: "hero-a", playerId: "local", kind: "ryu-seong-ryong" },
    { id: "under-construction", playerId: "local", kind: "gwon-yul", construction: {} },
    { id: "enemy", playerId: "enemy", kind: "gwon-yul" },
  ] as const;
  const areAllied = (left: string, right: string) => left === right;
  const modAudioProfiles: typeof UNIT_AUDIO_CUES = {
    ...UNIT_AUDIO_CUES,
    "gwon-yul": { productionComplete: "audio:voice:select-general-k42" },
    "ryu-seong-ryong": { productionComplete: "audio:ui:training-done" },
  };

  assert.equal(
    selectProductionCompleteAudioCue(units, new Set(units.map(({ id }) => id)), "local", areAllied, modAudioProfiles),
    undefined,
    "initial and resumed snapshots mark their units tracked before audio-enabled syncs",
  );
  assert.equal(
    selectProductionCompleteAudioCue(units, new Set(), "local", areAllied, modAudioProfiles),
    "audio:ui:training-done",
    "hero-a wins the stable ID order; only one cue is selected for this sync",
  );
});

function assertConvertedYavPcmPayload(sourcePath: string, wavPath: string): void {
  const yav = readFileSync(sourcePath);
  const wav = readFileSync(wavPath);
  const declaredDataSize = yav.readUInt32LE(22);
  const yavSampleData = yav.subarray(26, 26 + Math.min(declaredDataSize, yav.length - 26));

  assert.deepEqual(wav.subarray(44), yavSampleData, `${wavPath} should preserve ${sourcePath} PCM data`);
}

function readWavFormat(path: string): { channels: number; sampleRate: number; bitsPerSample: number; dataSize: number } {
  const wav = readFileSync(path);

  assert.equal(wav.subarray(0, 4).toString("ascii"), "RIFF", `${path} should be a RIFF file`);
  assert.equal(wav.subarray(8, 12).toString("ascii"), "WAVE", `${path} should be a WAVE file`);
  assert.equal(wav.subarray(36, 40).toString("ascii"), "data", `${path} should contain a data chunk`);

  return {
    channels: wav.readUInt16LE(22),
    sampleRate: wav.readUInt32LE(24),
    bitsPerSample: wav.readUInt16LE(34),
    dataSize: wav.readUInt32LE(40),
  };
}

function readYavFormat(path: string): { channels: number; sampleRate: number; bitsPerSample: number } {
  const yav = readFileSync(path);

  assert.ok(yav.length >= 26, `${path} should be a YAV audio file`);
  assert.equal(yav.readUInt32LE(0), 18, `${path} should use the supported YAV fmt size`);
  assert.equal(yav.readUInt16LE(4), 1, `${path} should be PCM`);

  return {
    channels: yav.readUInt16LE(6),
    sampleRate: yav.readUInt32LE(8),
    bitsPerSample: yav.readUInt16LE(18),
  };
}
