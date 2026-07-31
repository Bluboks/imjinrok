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
  const speech = sceneMethod("addSpeechPresentation", "addBriefingMetadataPresentation");
  const metadata = sceneMethod("addBriefingMetadataPresentation", "getParticipants");
  const portrait = sceneMethod("addPortrait", "updatePortraitTransitions");

  assert.match(button, /fontFamily: PRE_GAME_KOREAN_FONT_FAMILY/u);
  assert.match(button, /resolution: resolvePreGameTextResolution\(\)/u);
  assert.match(speech, /fontFamily: PRE_GAME_KOREAN_FONT_FAMILY/u);
  assert.match(speech, /resolution: resolvePreGameTextResolution\(undefined, layout\.scale\)/u);
  assert.match(metadata, /fontFamily: PRE_GAME_KOREAN_FONT_FAMILY/u);
  assert.match(metadata, /resolution: resolvePreGameTextResolution\(undefined, layout\.scale\)/u);
  assert.match(portrait, /fontFamily: PRE_GAME_KOREAN_FONT_FAMILY/u);
  assert.match(portrait, /resolution: resolvePreGameTextResolution\(undefined, layout\.scale\)/u);
});

test("briefing metadata appears after the intro and is rendered after persistent speech content", () => {
  const draw = sceneSource.slice(
    sceneSource.indexOf("  private drawPresentation("),
    sceneSource.indexOf("  private redrawPresentation("),
  );
  const metadata = sceneMethod("addBriefingMetadataPresentation", "getParticipants");

  assert.ok(draw.indexOf("this.addSpeechPresentation") < draw.indexOf("this.addBriefingMetadataPresentation"));
  assert.match(
    draw,
    /if \(line \|\| this\.dismissed\) \{[\s\S]*?\}\s*if \(this\.isIntroReady\(this\.time\.now\)\)/u,
  );
  assert.match(draw, /if \(this\.isIntroReady\(this\.time\.now\)\) \{\s*this\.addBriefingMetadataPresentation/u);
  assert.match(metadata, /briefing\.objective\.trim\(\)/u);
  assert.match(metadata, /briefing\.objective,[\s\S]*?wordWrap: \{ width: layout\.objective\.maxWidth \}/u);
  assert.match(metadata, /briefing\.title\.trim\(\)/u);
  assert.match(metadata, /briefing\.title,\s*textStyle/u);
});
