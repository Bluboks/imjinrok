import assert from "node:assert/strict";
import test from "node:test";
import {
  ORIGINAL_COMMAND_CONTROL_BINDINGS,
  ORIGINAL_COMMAND_ICON_ASSETS,
  requireSourceTexture,
  resolveSourceCommandIcon,
  resolveSourceFogTile,
} from "./sourceFogAndCommandAssets";

test("fog resolver keeps source identity separate from the explicit project mask policy", () => {
  assert.equal(resolveSourceFogTile("visible", 0), null);
  assert.deepEqual(resolveSourceFogTile("unseen", 4), {
    textureKey: "original-normal-fog-4-frame-0000",
    assetPath: "assets/themes/default/fog/normal/fog4_0000.png",
    sourceSpriteIndex: 4,
    sourceFrameIndex: 0,
    alpha: 1,
  });
  assert.equal(resolveSourceFogTile("explored", 15)?.sourceSpriteIndex, 14);
  assert.equal(resolveSourceFogTile("explored", 15)?.alpha, 0.58);
  assert.throws(() => resolveSourceFogTile("unseen", 16), /0\.\.15/);
});

test("keeps original control bindings separate from exported image identity and product fallback", () => {
  assert.deepEqual(
    ORIGINAL_COMMAND_CONTROL_BINDINGS.map(({ sourceActionWord, frameOrResourceIndex, sourceLabel }) => [sourceActionWord, frameOrResourceIndex, sourceLabel]),
    [[61, 27, "자동마법설정"], [62, 26, "자동마법해제"], [63, 28, null], [64, 29, null]],
  );
  assert.deepEqual(ORIGINAL_COMMAND_ICON_ASSETS.map(({ sourceFrameIndex }) => sourceFrameIndex), [26, 27, 28, 29]);
  assert.equal(resolveSourceCommandIcon("move"), undefined);
});

test("missing source textures fail loudly", () => {
  assert.throws(
    () => requireSourceTexture(ORIGINAL_COMMAND_ICON_ASSETS[0]!, () => false),
    /Required source-backed texture is not loaded/,
  );
});
