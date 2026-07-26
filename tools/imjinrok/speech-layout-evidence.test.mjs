import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, openSync, closeSync, readSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_EXECUTABLE_SHA256,
  EXPECTED_HERO_SPRITE_SHA256,
  extractSpeechLayoutEvidence,
} from "./extract-speech-layout-evidence.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const executablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const heroSpritePath = join(repositoryRoot, "original/imjinrok2/yfnt/hero.spr");
const jumpTablesPath = join(repositoryRoot, "analysis/generated/imjinrok2/jump-tables.json");

test("extracts the fixed four-slot SPEECH layout from the original executable", () => {
  const report = extractSpeechLayoutEvidence({ executablePath, heroSpritePath, jumpTablesPath });

  assert.equal(report.analysisStatus, "static-confirmed");
  assert.deepEqual(report.coordinateSystem, { width: 640, height: 480, origin: "top-left" });
  assert.deepEqual(report.portrait.slots, [
    { slot: 0, x: 26, y: 49, right: 156, bottom: 169 },
    { slot: 1, x: 490, y: 49, right: 620, bottom: 169 },
    { slot: 2, x: 26, y: 210, right: 156, bottom: 330 },
    { slot: 3, x: 490, y: 210, right: 620, bottom: 330 },
  ]);
  assert.deepEqual(report.text, { x: 188, centerY: 190, maxWidth: 278 });
  assert.equal(report.invalidSlotBehavior.destination, "0x004a8458");
  assert.equal(report.evidencePoints.every((point) => point.matched), true);
});

test("binds the layout to the exact hero sprite resource", () => {
  const report = extractSpeechLayoutEvidence({ executablePath, heroSpritePath, jumpTablesPath });

  assert.equal(report.sources.executable.sha256, EXPECTED_EXECUTABLE_SHA256);
  assert.equal(report.sources.heroSprite.sha256, EXPECTED_HERO_SPRITE_SHA256);
  assert.deepEqual(
    {
      embeddedPath: report.sources.heroSprite.embeddedPath,
      width: report.sources.heroSprite.width,
      height: report.sources.heroSprite.height,
      frameCount: report.sources.heroSprite.frameCount,
    },
    {
      embeddedPath: "yfnt\\hero.spr",
      width: 130,
      height: 120,
      frameCount: 20,
    },
  );
});

test("refuses an executable whose fixed layout evidence no longer matches", () => {
  const directory = mkdtempSync(join(tmpdir(), "imjinrok-speech-layout-"));
  const alteredExecutablePath = join(directory, "imjinrok2.exe");
  copyFileSync(executablePath, alteredExecutablePath);

  const handle = openSync(alteredExecutablePath, "r+");
  try {
    const byte = Buffer.alloc(1);
    readSync(handle, byte, 0, 1, 0xa8425);
    byte[0] ^= 0xff;
    writeSync(handle, byte, 0, 1, 0xa8425);
  } finally {
    closeSync(handle);
  }

  assert.throws(
    () =>
      extractSpeechLayoutEvidence({
        executablePath: alteredExecutablePath,
        heroSpritePath,
        jumpTablesPath,
      }),
    /SHA-256 mismatch/,
  );
});
