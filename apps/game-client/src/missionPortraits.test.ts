import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { imjinrokCampaignScenarios } from "@shared";

import { extractMissionPortraitMapping } from "../../../tools/imjinrok/extract-mission-portrait-mapping.mjs";
import {
  MISSION_PORTRAIT_FRAME_BY_ID,
  MISSION_PORTRAIT_IMAGE_CUES,
  MISSION_PORTRAIT_SOURCE,
  normalizeMissionPortraitId,
} from "./missionPortraits";

const gameClientSrcDirectory = dirname(fileURLToPath(import.meta.url));
const assetDirectory = resolve(
  gameClientSrcDirectory,
  "../public/assets/themes/default/ui/mission-portraits",
);

test("client portrait mapping exactly matches the original executable", () => {
  const extractedMapping = Object.fromEntries(
    extractMissionPortraitMapping().entries.map(
      ({ speakerId, frameIndex }: { speakerId: string; frameIndex: number }) => [
        speakerId,
        frameIndex,
      ],
    ),
  );

  assert.deepEqual(MISSION_PORTRAIT_FRAME_BY_ID, extractedMapping);
  assert.equal(MISSION_PORTRAIT_SOURCE, "original/imjinrok2/yfnt/hero.spr");
});

test("every original hero.spr frame is exported with source dimensions", () => {
  const manifest = JSON.parse(
    readFileSync(resolve(assetDirectory, "hero.manifest.json"), "utf8"),
  ) as {
    source: string;
    width: number;
    height: number;
    frameCount: number;
    exportedFrames: Array<{ index: number; fileName: string }>;
  };

  assert.equal(manifest.source, MISSION_PORTRAIT_SOURCE);
  assert.equal(manifest.width, 130);
  assert.equal(manifest.height, 120);
  assert.equal(manifest.frameCount, 20);
  assert.equal(manifest.exportedFrames.length, 20);

  for (const frame of manifest.exportedFrames) {
    const expectedFileName = `hero_${String(frame.index).padStart(4, "0")}.png`;
    const pngPath = resolve(assetDirectory, frame.fileName);

    assert.equal(frame.fileName, expectedFileName);
    assert.equal(existsSync(pngPath), true, `missing ${pngPath}`);
    assert.deepEqual(readPngDimensions(pngPath), { width: 130, height: 120 });
  }
});

test("all campaign portrait IDs resolve to exported static mappings", () => {
  const mappedIds = new Set(
    MISSION_PORTRAIT_IMAGE_CUES.map((cue) => cue.portraitId),
  );
  const usedIds = new Set<string>();

  for (const scenario of imjinrokCampaignScenarios) {
    for (const line of scenario.briefing?.lines ?? []) {
      usedIds.add(normalizeMissionPortraitId(line.portraitId));
    }
    for (const dialogue of scenario.missionDialogues ?? []) {
      for (const line of dialogue.lines) {
        usedIds.add(normalizeMissionPortraitId(line.portraitId));
      }
    }
  }

  for (const portraitId of usedIds) {
    assert.equal(mappedIds.has(portraitId), true, portraitId);
  }
  assert.equal(mappedIds.has(normalizeMissionPortraitId(" unknown ")), false);
});

function readPngDimensions(path: string): { width: number; height: number } {
  const png = readFileSync(path);
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  assert.deepEqual(
    [...png.subarray(0, pngSignature.length)],
    pngSignature,
    `${path} should be a PNG`,
  );

  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}
