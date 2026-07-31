import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  EXPECTED_BARRACKS_SPRITE_SHA256,
  extractKoreanBarracksIdleOverlay,
  selectPrimaryBodyConfiguration,
} from "./extract-k01-korean-barracks-idle-overlay.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const fixturePath = resolve(repositoryRoot, "analysis/fixtures/k01-korean-barracks-idle-overlay-vectors.json");
const extractorPath = resolve(import.meta.dirname, "extract-k01-korean-barracks-idle-overlay.mjs");

test("binds class 50's generic primary body path without inventing an overlay", () => {
  const report = extractKoreanBarracksIdleOverlay();
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

  assert.deepEqual(
    {
      analysisStatus: report.analysisStatus,
      sourceSha256: report.sources.sprite.sha256,
      sourceShape: [report.sources.sprite.width, report.sources.sprite.height, report.sources.sprite.frameCount],
      identity: report.identity,
      primaryBody: report.primaryBody,
      overlayConclusion: report.overlayConclusion,
      reproductionVectors: report.reproductionVectors,
    },
    fixture,
  );
  assert.equal(report.sources.sprite.sha256, EXPECTED_BARRACKS_SPRITE_SHA256);
  assert.equal(report.evidence.evidencePoints.length, 9);
});

test("reproduces the only class-50 primary-body frame configurations proved by the generic branch", () => {
  assert.deepEqual(selectPrimaryBodyConfiguration(0), {
    bodyDamageState: 0,
    spriteSlot: 108,
    configuredFrameOffset: 7,
    primaryConfigurationMode: 1,
    renderFrameFormula: "renderFrame = currentPhase + configuredFrameOffset",
  });
  assert.deepEqual(selectPrimaryBodyConfiguration(1), {
    bodyDamageState: 1,
    spriteSlot: 108,
    configuredFrameOffset: 8,
    primaryConfigurationMode: 1,
    renderFrameFormula: "renderFrame = currentPhase + configuredFrameOffset",
  });
  assert.equal(selectPrimaryBodyConfiguration(2).configuredFrameOffset, 8, "all nonzero WORD values take the damaged branch");
  assert.throws(() => selectPrimaryBodyConfiguration(-1), /must be an unsigned WORD/);
  assert.throws(() => selectPrimaryBodyConfiguration(65_536), /must be an unsigned WORD/);
});

test("rejects a barrackk sprite whose bytes do not match the bound original asset", (t) => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "k01-barracks-overlay-"));
  t.after(() => rmSync(temporaryDirectory, { recursive: true, force: true }));
  const spritePath = join(temporaryDirectory, "barrackk.spr");
  const bytes = readFileSync(join(repositoryRoot, "original/imjinrok2/char/barrackk.spr"));
  bytes[0] ^= 0xff;
  writeFileSync(spritePath, bytes);

  assert.throws(
    () => extractKoreanBarracksIdleOverlay({ spritePath }),
    /SHA-256 mismatch/,
  );
});

test("prints concrete primary-body values outside JSON mode", () => {
  const result = spawnSync(process.execPath, [extractorPath], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /class 50: slot 108, configured offset 7/);
  assert.match(result.stdout, /overlay 9\.\.15: not-established/);
  assert.doesNotMatch(result.stdout, /undefined/);
});
