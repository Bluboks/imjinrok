import assert from "node:assert/strict";
import test from "node:test";

import {
  EXPECTED_HERO_SPRITE_SHA256,
  EXPECTED_IMJINROK_EXE_SHA256,
  extractMissionPortraitMapping,
} from "./extract-mission-portrait-mapping.mjs";

const EXPECTED_MAPPING = {
  K1: 6,
  K2: 11,
  K3: 8,
  K4: 9,
  K5: 7,
  J1: 4,
  J2: 2,
  J3: 3,
  J4: 1,
  J5: 0,
  C1: 5,
  C2: 14,
  C3: 13,
  C4: 10,
  C5: 12,
  K10: 15,
  K6: 17,
};

test("extracts the complete SPEECH speaker to hero.spr frame mapping", () => {
  const report = extractMissionPortraitMapping();

  assert.equal(report.evidenceStatus, "static-proven");
  assert.equal(report.source.executableSha256, EXPECTED_IMJINROK_EXE_SHA256);
  assert.equal(report.source.heroSpriteSha256, EXPECTED_HERO_SPRITE_SHA256);
  assert.equal(report.source.resourcePath, "yfnt\\hero.spr");
  assert.deepEqual(
    {
      width: report.source.width,
      height: report.source.height,
      frameCount: report.source.frameCount,
    },
    { width: 130, height: 120, frameCount: 20 },
  );
  assert.deepEqual(
    Object.fromEntries(
      report.entries.map(({ speakerId, frameIndex }) => [
        speakerId,
        frameIndex,
      ]),
    ),
    EXPECTED_MAPPING,
  );
});

test("locks the reported bad portrait cases to their statically proven frames", () => {
  const bySpeakerId = new Map(
    extractMissionPortraitMapping().entries.map((entry) => [
      entry.speakerId,
      entry.frameIndex,
    ]),
  );

  assert.equal(bySpeakerId.get("K1"), 6);
  assert.equal(bySpeakerId.get("K3"), 8);
  assert.equal(bySpeakerId.get("K10"), 15);
  assert.equal(bySpeakerId.get("J1"), 4);
});

test("captures the original lookup failure result and remains deterministic", () => {
  const first = extractMissionPortraitMapping();
  const second = extractMissionPortraitMapping();

  assert.equal(first.lookupFailureIndex, -1);
  assert.ok(
    first.codeAnchors.some(
      (anchor) =>
        anchor.id === "speaker-lookup-failure" &&
        anchor.bytes === "66 0d ff ff",
    ),
  );
  assert.deepEqual(second, first);
});
