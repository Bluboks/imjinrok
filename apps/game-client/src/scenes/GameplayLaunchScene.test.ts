import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const sceneSource = readFileSync(
  fileURLToPath(new URL("./GameplayLaunchScene.ts", import.meta.url)),
  "utf8",
);

function sceneMethod(name: string, nextName: string): string {
  return sceneSource.slice(
    sceneSource.indexOf(`private ${name}`),
    sceneSource.indexOf(`private ${nextName}`),
  );
}

test("gameplay launch loading and failure text use the shared crisp typography", () => {
  const loading = sceneMethod("showLoading", "showLoadFailure");
  const failure = sceneSource.slice(sceneSource.indexOf("private showLoadFailure"));

  assert.match(loading, /fontFamily: PRE_GAME_KOREAN_FONT_FAMILY/u);
  assert.match(loading, /resolution: resolvePreGameTextResolution\(\)/u);
  assert.equal((failure.match(/this\.add\.text\(/gu) ?? []).length, 2);
  assert.equal((failure.match(/fontFamily: PRE_GAME_KOREAN_FONT_FAMILY/gu) ?? []).length, 2);
  assert.equal((failure.match(/resolution: resolvePreGameTextResolution\(\)/gu) ?? []).length, 2);
  assert.doesNotMatch(sceneSource, /fontFamily: "Noto Sans KR, Malgun Gothic/u);
});
