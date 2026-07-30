import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  ORIGINAL_COMMAND_CONTROL_BINDINGS,
  ORIGINAL_COMMAND_ICON_ASSETS,
  IMJINROK_SOURCE_COMMAND_ICON_PROFILE,
  requireSourceTexture,
  resolveCardinalVisibleNeighborMask,
  resolveEnvironmentOverlayLightContract,
  resolveNormalSourceFogTransition,
  resolveSourceFogTileScale,
  resolveSourceCommandIcon,
  resolveSourceCommandIconProfileForScenario,
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

test("keeps original control bindings separate from exported image identity and generic product fallback", () => {
  assert.deepEqual(
    ORIGINAL_COMMAND_CONTROL_BINDINGS.map(({ sourceActionWord, frameOrResourceIndex, sourceLabel }) => [sourceActionWord, frameOrResourceIndex, sourceLabel]),
    [[61, 27, "자동마법설정"], [62, 26, "자동마법해제"], [63, 28, null], [64, 29, null]],
  );
  assert.deepEqual(ORIGINAL_COMMAND_ICON_ASSETS.map(({ sourceFrameIndex }) => sourceFrameIndex), [4, 6, 10, 11, 12, 16, 26, 27, 28, 29, 39, 43, 45]);
  assert.equal(resolveSourceCommandIcon("move"), undefined);
});

test("the opt-in Imjinrok profile binds exact controls and labels source-backed adaptations", () => {
  assert.deepEqual(
    Object.entries(IMJINROK_SOURCE_COMMAND_ICON_PROFILE.actionBindings).map(([actionId, binding]) => [
      actionId,
      binding?.sourceFrameIndex,
      binding?.sourceActionWord,
      binding?.sourceLabel,
      binding?.evidenceStatus,
    ]),
    [
      ["move", 6, 3, "이동", "exact-source-control-binding"],
      ["stop", 43, 2, "정지", "exact-source-control-binding"],
      ["patrol", 10, 35, "순찰", "exact-source-control-binding"],
      ["repair", 12, 16, "수리", "exact-source-control-binding"],
      ["hold", 39, 39, "사수", "exact-source-control-binding"],
      ["rally-point", 11, 21, "집결지설정", "exact-source-control-binding"],
      ["cancel-production", 45, 19, "취소", "exact-source-control-binding"],
      ["cancel-construction", 45, 19, "취소", "exact-source-control-binding"],
      ["attack-move", 4, 5, "공격", "source-backed-adaptation"],
      ["build", 16, 11, "건설", "source-backed-adaptation"],
    ],
  );
  assert.equal(resolveSourceCommandIcon("move", IMJINROK_SOURCE_COMMAND_ICON_PROFILE)?.sourceFrameIndex, 6);
  assert.equal(resolveSourceCommandIconProfileForScenario("core-default"), undefined);
  assert.equal(resolveSourceCommandIconProfileForScenario("imjinrok-k01-opening"), IMJINROK_SOURCE_COMMAND_ICON_PROFILE);
});

test("missing source textures fail loudly", () => {
  assert.throws(
    () => requireSourceTexture(resolveSourceCommandIcon("move", IMJINROK_SOURCE_COMMAND_ICON_PROFILE)!, () => false),
    /Required source-backed texture is not loaded/,
  );
});
