import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const sceneSource = readFileSync(
  fileURLToPath(new URL("./MissionBriefingScene.ts", import.meta.url)),
  "utf8",
);

function sceneMethod(name: string, nextName: string): string {
  return sceneSource.slice(
    sceneSource.indexOf(`  private ${name}(`),
    sceneSource.indexOf(`  private ${nextName}(`),
  );
}

test("briefing redraw preserves voice playback for resize and font readiness", () => {
  const create = sceneSource.slice(
    sceneSource.indexOf("  create(data:"),
    sceneSource.indexOf("  private handleResize("),
  );
  const resize = sceneMethod("handleResize", "handleShutdown");
  const shutdown = sceneMethod("handleShutdown", "resetPresentation");
  const redraw = sceneMethod("redrawPresentation", "getActiveLine");

  assert.match(create, /whenPreGameTypographyReady\([\s\S]*?redrawPresentation\(false\)/u);
  assert.match(resize, /redrawPresentation\(false\)/u);
  assert.match(shutdown, /typographyReadyUnsubscribe\?\.\(\)/u);
  assert.doesNotMatch(redraw, /resetPresentation\(/u);
});

test("briefing buttons, dialogue, and portrait labels share crisp pre-game typography", () => {
  const button = sceneMethod("addButton", "advanceLine");
  const speech = sceneMethod("addSpeechPresentation", "getParticipants");
  const portrait = sceneMethod("addPortrait", "updatePortraitTransitions");

  assert.match(button, /fontFamily: PRE_GAME_KOREAN_FONT_FAMILY/u);
  assert.match(button, /resolution: resolvePreGameTextResolution\(\)/u);
  assert.match(speech, /fontFamily: PRE_GAME_KOREAN_FONT_FAMILY/u);
  assert.match(speech, /resolution: resolvePreGameTextResolution\(undefined, layout\.scale\)/u);
  assert.match(portrait, /fontFamily: PRE_GAME_KOREAN_FONT_FAMILY/u);
  assert.match(portrait, /resolution: resolvePreGameTextResolution\(undefined, layout\.scale\)/u);
});
