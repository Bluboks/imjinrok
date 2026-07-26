import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { imjinrokCampaignScenarios } from "@shared";
import {
  getMissionLineDurationMs,
  MISSION_LINE_VOICE_PADDING_MS,
  MISSION_VOICE_DURATIONS_MS,
  normalizeMissionVoiceId,
} from "./missionVoiceTiming.js";

const gameClientSrcDirectory = dirname(fileURLToPath(import.meta.url));
const missionAudioDirectory = resolve(gameClientSrcDirectory, "../public/assets/audio/mission");

test("mission voice timing covers every K01/K02 briefing and dialogue voice", () => {
  const scenarioVoiceIds = new Set<string>();

  for (const scenario of imjinrokCampaignScenarios) {
    for (const line of scenario.briefing?.lines ?? []) {
      scenarioVoiceIds.add(normalizeMissionVoiceId(line.voiceId));
    }

    for (const dialogue of scenario.missionDialogues ?? []) {
      for (const line of dialogue.lines) {
        scenarioVoiceIds.add(normalizeMissionVoiceId(line.voiceId));
      }
    }
  }

  assert.deepEqual(
    [...scenarioVoiceIds].sort(),
    Object.keys(MISSION_VOICE_DURATIONS_MS).sort(),
  );
});

test("mission voice timing matches converted wav durations", () => {
  for (const [voiceId, expectedDurationMs] of Object.entries(MISSION_VOICE_DURATIONS_MS)) {
    const wavDurationMs = readWavDurationMs(resolve(missionAudioDirectory, `${voiceId}.wav`));

    assert.equal(expectedDurationMs, wavDurationMs, voiceId);
  }
});

test("mission line timing keeps long source voice lines from being cut off", () => {
  assert.equal(
    getMissionLineDurationMs({ voiceId: "K02030" }, 5_500),
    MISSION_VOICE_DURATIONS_MS.k02030 + MISSION_LINE_VOICE_PADDING_MS,
  );
  assert.ok(getMissionLineDurationMs({ voiceId: "K02030" }, 5_500) > 5_500);
});

function readWavDurationMs(filePath: string): number {
  const buffer = readFileSync(filePath);
  let offset = 12;
  let byteRate = 0;
  let dataSize = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);

    if (chunkId === "fmt ") {
      byteRate = buffer.readUInt32LE(offset + 16);
    } else if (chunkId === "data") {
      dataSize = chunkSize;
      break;
    }

    offset += 8 + chunkSize + (chunkSize % 2);
  }

  assert.ok(byteRate > 0, `${filePath} should have a byte rate`);
  assert.ok(dataSize > 0, `${filePath} should have PCM data`);

  return Math.ceil((dataSize / byteRate) * 1_000);
}
