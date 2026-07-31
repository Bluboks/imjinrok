import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  extractK01SelectionPortraitBindings,
  EXPECTED_PORTRAIT_SPRITE_SHA256,
} from "./extract-k01-selection-portrait-bindings.mjs";

const root = resolve(import.meta.dirname, "../..");

test("recovers the K01 selected-entity portrait.spr binding for every in-scope class", () => {
  const report = extractK01SelectionPortraitBindings();

  assert.equal(report.evidenceStatus, "static-proven");
  assert.deepEqual(report.resourceBinding, {
    sourcePath: "fnt\\portrait.spr",
    resourcePathPointer: "0x004bd714",
    resourceTable: { base: "0x004bc094", index: 34 },
    runtimeRecord: "0x008a57a8",
    frameOffsetTable: "0x008a5c68",
    surfacePointer: "0x008a639c",
  });
  assert.equal(report.sources.portraitSprite.sha256, EXPECTED_PORTRAIT_SPRITE_SHA256);
  assert.equal(report.sources.portraitSprite.frameCount, 150);
  assert.deepEqual(
    report.bindings.map(({ internalClass, kind, frameIndex, fileName }) => [internalClass, kind, frameIndex, fileName]),
    [
      [2, "swordsman", 32, "portrait_0032.png"],
      [3, "japanese-swordsman", 3, "portrait_0003.png"],
      [4, "archer", 31, "portrait_0031.png"],
      [7, "villager", 33, "portrait_0033.png"],
      [11, "korean-monk", 34, "portrait_0034.png"],
      [12, "japanese-gunner", 2, "portrait_0002.png"],
      [13, "japanese-samurai", 4, "portrait_0004.png"],
      [14, "japanese-turtle-tank", 11, "portrait_0011.png"],
      [16, "japanese-shrine-maiden", 5, "portrait_0005.png"],
      [31, "japanese-farmer", 6, "portrait_0006.png"],
      [48, "house", 51, "portrait_0051.png"],
      [49, "town-center", 52, "portrait_0052.png"],
      [50, "barracks", 54, "portrait_0054.png"],
      [51, "korean-training-command", 44, "portrait_0044.png"],
      [57, "japanese-camp-house", 28, "portrait_0028.png"],
      [58, "japanese-hq", 26, "portrait_0026.png"],
      [60, "japanese-camp-barracks", 22, "portrait_0022.png"],
      [62, "japanese-camp-firehouse", 24, "portrait_0024.png"],
      [63, "japanese-camp-tower", 120, "portrait_0120.png"],
      [76, "gwon-yul", 46, "portrait_0046.png"],
      [78, "ryu-seong-ryong", 48, "portrait_0048.png"],
      [82, "japanese-konishi", 15, "portrait_0015.png"],
    ],
  );
});

test("rejects altered binary-analysis and portrait source inputs", (t) => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "k01-selection-portrait-"));
  t.after(() => rmSync(temporaryDirectory, { recursive: true, force: true }));

  const portraitPath = join(temporaryDirectory, "portrait.spr");
  copyFileSync(join(root, "original/imjinrok2/fnt/portrait.spr"), portraitPath);
  const portraitBytes = readFileSync(portraitPath);
  portraitBytes[0] ^= 0xff;
  writeFileSync(portraitPath, portraitBytes);
  assert.throws(() => extractK01SelectionPortraitBindings({ portraitPath }), /portrait\.spr SHA-256/);

  const seedsPath = join(temporaryDirectory, "seeds.json");
  const seeds = JSON.parse(readFileSync(join(root, "analysis/generated/imjinrok2/seeds.json"), "utf8"));
  seeds.sourceSha256 = "0".repeat(64);
  writeFileSync(seedsPath, `${JSON.stringify(seeds)}\n`);
  assert.throws(() => extractK01SelectionPortraitBindings({ seedsPath }), /seeds\.json SHA-256/);
});
