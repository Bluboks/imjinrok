import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  ORIGINAL_COMMAND_CONTROL_BINDINGS,
  ORIGINAL_COMMAND_ICON_ASSETS,
  requireSourceTexture,
  resolveCardinalVisibleNeighborMask,
  resolveEnvironmentOverlayLightContract,
  resolveNormalSourceFogTransition,
  resolveSourceFogTileScale,
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

test("source fog scales its 32×16 source image to the active map diamond", () => {
  assert.deepEqual(resolveSourceFogTileScale(64, 32), { x: 2, y: 2 });
  assert.deepEqual(resolveSourceFogTileScale(96, 48), { x: 3, y: 3 });
  assert.throws(() => resolveSourceFogTileScale(0, 32), /positive finite/);
});

test("environment overlay contract preserves four-decimal light-curve redraw precision", () => {
  assert.deepEqual(resolveEnvironmentOverlayLightContract(0.5), {
    lightLevel: 0.5, lightSignature: "0.5000", nightAlpha: 0.21,
  });
  assert.equal(resolveEnvironmentOverlayLightContract(0.50004).lightSignature, "0.5000");
  assert.equal(resolveEnvironmentOverlayLightContract(0.50006).lightSignature, "0.5001");
  assert.deepEqual(resolveEnvironmentOverlayLightContract(0.75), {
    lightLevel: 0.75, lightSignature: "0.7500", nightAlpha: 0.105,
  });
  assert.throws(() => resolveEnvironmentOverlayLightContract(Number.NaN), /must be finite/);
});

test("SkirmishScene consumes the light contract in its environment overlay signature", () => {
  const scenePath = resolve(dirname(fileURLToPath(import.meta.url)), "../scenes/SkirmishScene.ts");
  const sceneSource = readFileSync(scenePath, "utf8");

  assert.match(sceneSource, /resolveEnvironmentOverlayLightContract\(getEnvironmentLightLevel\(environment\)\)/);
  assert.match(sceneSource, /environment\.dayPhase\}:\$\{visualState\.lightSignature\}:\$\{rainFrame\}/);
  assert.match(sceneSource, /fillStyle\(0x071426, visualState\.nightAlpha\)/);
});

test("normal source fog uses a deterministic cardinal project policy only for an opted-in tileset", () => {
  assert.equal(
    resolveCardinalVisibleNeighborMask((direction) => direction === "west" || direction === "south" ? "visible" : "unseen"),
    0x9,
  );
  assert.equal(resolveNormalSourceFogTransition("core-default", "unseen", () => "visible"), null);
  assert.equal(resolveNormalSourceFogTransition("imjinrok-normal", "visible", () => "unseen"), null);
  assert.deepEqual(
    resolveNormalSourceFogTransition("imjinrok-normal", "explored", (direction) => direction === "east" ? "visible" : "unseen"),
    {
      textureKey: "original-normal-fog-4-frame-0000",
      assetPath: "assets/themes/default/fog/normal/fog4_0000.png",
      sourceSpriteIndex: 4,
      sourceFrameIndex: 0,
      alpha: 0.58,
    },
  );
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
