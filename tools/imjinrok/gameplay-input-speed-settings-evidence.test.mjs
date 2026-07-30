import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  extractGameplayInputSpeedSettingsEvidence,
  reproduceSourceGameSpeed,
} from "./extract-gameplay-input-speed-settings-evidence.mjs";

const root = resolve(import.meta.dirname, "../..");
const fixturePath = join(root, "analysis/fixtures/gameplay-input-speed-settings-evidence.json");
const executablePath = join(root, "original/imjinrok2/imjinrok2.exe");
const mouseSpritePath = join(root, "original/imjinrok2/yfnt/mouseinterface.spr");

test("extracts the hash-bound game speed and mouse-interface fixture", () => {
  assert.deepEqual(extractGameplayInputSpeedSettingsEvidence(), JSON.parse(readFileSync(fixturePath, "utf8")));
});

test("reproduces source speed states, including the outside-state branch", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((sourceState) => reproduceSourceGameSpeed({ sourceState, baseIntervalMs: 50 })), [64, 60, 50, 40, 30, 30]);
  assert.throws(() => reproduceSourceGameSpeed({ sourceState: 1.5, baseIntervalMs: 50 }), /integer/u);
  assert.throws(() => reproduceSourceGameSpeed({ sourceState: 1, baseIntervalMs: 0 }), /positive/u);
});

test("rejects tampered executable and mouse resource before accepting evidence", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "gameplay-input-speed-evidence-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const [source, option] of [[executablePath, "executablePath"], [mouseSpritePath, "mouseSpritePath"]]) {
    const target = join(directory, option);
    copyFileSync(source, target);
    const bytes = readFileSync(target);
    bytes[0] ^= 0xff;
    writeFileSync(target, bytes);
    assert.throws(() => extractGameplayInputSpeedSettingsEvidence({ [option]: target }), /SHA-256|not an MZ executable/u);
  }
});
