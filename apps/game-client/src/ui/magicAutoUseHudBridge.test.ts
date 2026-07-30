import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));

test("HUD bridge publishes initial player-global state, dispatches a typed command, and cleans event listeners", () => {
  const uiSource = readFileSync(resolve(sourceDirectory, "../scenes/UIScene.ts"), "utf8");
  const skirmishSource = readFileSync(resolve(sourceDirectory, "../scenes/SkirmishScene.ts"), "utf8");

  assert.match(uiSource, /MAGIC_AUTO_USE_REGISTRY_KEY/);
  assert.match(uiSource, /MAGIC_AUTO_USE_CHANGED_EVENT, this\.handleMagicAutoUseChanged/);
  assert.match(uiSource, /MAGIC_AUTO_USE_REQUESTED_EVENT, \{ enabled: action\.enabled, source: "button" \}/);
  assert.match(uiSource, /off\(MAGIC_AUTO_USE_CHANGED_EVENT, this\.handleMagicAutoUseChanged/);
  assert.match(skirmishSource, /on\(MAGIC_AUTO_USE_REQUESTED_EVENT, this\.handleMagicAutoUseRequested/);
  assert.match(skirmishSource, /command: \{ type: "set-magic-auto-use", enabled: request\.enabled \}/);
  assert.match(skirmishSource, /syncWorldFromTransport\(true\);\n      this\.publishMagicAutoUse\(\);/);
  assert.match(skirmishSource, /off\(MAGIC_AUTO_USE_REQUESTED_EVENT, this\.handleMagicAutoUseRequested/);
});
