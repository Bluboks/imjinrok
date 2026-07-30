import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  ORIGINAL_COMMAND_CONTROL_BINDINGS,
  ORIGINAL_COMMAND_ICON_ASSETS,
  DEFAULT_SOURCE_COMMAND_ICON_PROFILE_REGISTRY,
  IMJINROK_SOURCE_COMMAND_ICON_PROFILE,
  IMJINROK_SOURCE_FOG_PROFILE_ID,
  SOURCE_FOG_COMPOSITE_IMAGE_GEOMETRY,
  SOURCE_FOG_OVERLAY_TINT,
  SOURCE_FOG_COMPOSITE_ASSETS,
  requireSourceTexture,
  assertSourceFogFamilyIndex,
  assertSourceFogGroundLayerFamilies,
  assertSourceFogVisualProfile,
  buildSourceFogCornerMask,
  expandSourceFogDirtyChunkMask,
  getSourceFogNeighborVisibility,
  requireSourceFogGroundLayer,
  resolveEnvironmentOverlayLightContract,
  reproduceSourceFogFrameIndices,
  resolveSourceCommandIcon,
  resolveMagicAutoUseSourceCommandIcon,
  resolveSourceCommandIconProfileForScenario,
  SourceCommandIconProfileRegistry,
  resolveSourceFogComposite,
  resolveSourceFogLayerPlan,
} from "./sourceFogAndCommandAssets";

test("source fog uses the exact corner bits, lookup, and six-frame algebra behind an explicit profile", () => {
  const neighborVisibility = (neighbor: string) => neighbor === "top" || neighbor === "bottomRight" ? "unseen" as const : "visible" as const;
  assert.equal(buildSourceFogCornerMask("unseen", neighborVisibility), 0xb);
  assert.equal(buildSourceFogCornerMask("unseen", (neighbor) => neighbor === "bottom" ? "unseen" : "visible"), 0xc);
  assert.equal(buildSourceFogCornerMask("unseen", (neighbor) => neighbor === "left" ? "unseen" : "visible"), 0x5);
  const selectors = Array.from({ length: 16 }, (_value, mask) => {
    const diagonal = new Set([
      mask & 0x1 ? "topLeft" : "",
      mask & 0x2 ? "topRight" : "",
      mask & 0x4 ? "bottomLeft" : "",
      mask & 0x8 ? "bottomRight" : "",
    ]);
    return resolveSourceFogComposite(IMJINROK_SOURCE_FOG_PROFILE_ID, 0, "unseen", (neighbor) => diagonal.has(neighbor) ? "unseen" : "visible")?.selector ?? null;
  });
  assert.deepEqual(selectors, [null, 9, 8, 2, 10, 1, 12, 5, 11, 13, 3, 6, 0, 4, 7, null]);
  assert.deepEqual(reproduceSourceFogFrameIndices(9), [18, 19, 50, 51, 82, 83]);
  assert.deepEqual(
    resolveSourceFogComposite(IMJINROK_SOURCE_FOG_PROFILE_ID, 14, "unseen", neighborVisibility),
    {
      textureKey: "original-normal-fog-14-selector-06",
      assetPath: "assets/themes/default/fog/normal/composites/fog14_selector06.png",
      familyIndex: 14,
      selector: 6,
      sourceFrameIndices: [12, 13, 44, 45, 76, 77],
      sourceStateValue: 4,
      alpha: 1,
    },
  );
  assert.equal(resolveSourceFogComposite(IMJINROK_SOURCE_FOG_PROFILE_ID, 0, "explored", () => "explored"), null);
  assert.deepEqual(resolveSourceFogLayerPlan(IMJINROK_SOURCE_FOG_PROFILE_ID, 0, "unseen", () => "unseen"), {
    drawBaseFog: true,
    composite: null,
  });
  assert.deepEqual(resolveSourceFogLayerPlan(IMJINROK_SOURCE_FOG_PROFILE_ID, 0, "explored", () => "explored"), {
    drawBaseFog: true,
    composite: null,
  });
  assert.deepEqual(resolveSourceFogLayerPlan(IMJINROK_SOURCE_FOG_PROFILE_ID, 0, "visible", () => "visible"), {
    drawBaseFog: false,
    composite: null,
  });
  assert.deepEqual(reproduceSourceFogFrameIndices(13), [26, 27, 58, 59, 90, 91]);
  assert.throws(() => reproduceSourceFogFrameIndices(14), /0\.\.13/);
});

test("source fog composites keep source frame identity but use the shared 64x48 placement geometry and dark product tint", () => {
  assert.deepEqual(SOURCE_FOG_COMPOSITE_IMAGE_GEOMETRY, {
    width: 64,
    height: 48,
    footprintAnchor: { x: 32, y: 16 },
  });
  assert.equal(SOURCE_FOG_OVERLAY_TINT, 0x020608);
});

test("source fog keeps the generic fallback and malformed opt-ins fail loudly", () => {
  assert.equal(resolveSourceFogComposite(undefined, undefined, "unseen", () => "unseen"), null);
  assert.throws(() => assertSourceFogVisualProfile("missing-profile"), /Unknown source fog visual profile/);
  assert.throws(() => assertSourceFogFamilyIndex(undefined), /family index/);
  assert.throws(() => assertSourceFogFamilyIndex(15), /0\.\.14/);
  assert.equal(SOURCE_FOG_COMPOSITE_ASSETS.length, 210);
});

test("source fog expands dirty chunks across the exact eight-neighbor boundary", () => {
  const edge = new Uint8Array([1, 0, 0, 0, 0, 0]);
  assert.equal(expandSourceFogDirtyChunkMask(edge, 3, 2), 4);
  assert.deepEqual([...edge], [1, 1, 0, 1, 1, 0]);
  const center = new Uint8Array(9);
  center[4] = 1;
  assert.equal(expandSourceFogDirtyChunkMask(center, 3, 3), 9);
  assert.throws(() => expandSourceFogDirtyChunkMask(new Uint8Array(1), 0, 1), /positive integers/);
});

test("source fog excludes out-of-bounds neighbors and validates only the rendered ground layer", () => {
  assert.equal(getSourceFogNeighborVisibility(0, 0, "topLeft", 2, 2, () => "unseen"), "visible");
  assert.equal(getSourceFogNeighborVisibility(1, 1, "topLeft", 2, 2, () => "unseen"), "unseen");
  const ground = { tiles: [{ fogVisuals: { familyIndex: 0 } }] };
  const overlay = { tiles: [{}] };
  assert.equal(requireSourceFogGroundLayer([ground, overlay]), ground);
  assert.doesNotThrow(() => assertSourceFogGroundLayerFamilies([ground, overlay]));
  assert.throws(() => assertSourceFogGroundLayerFamilies([{ tiles: [{}] }]), /family index/);
  assert.throws(() => requireSourceFogGroundLayer([]), /ground layer at index 0/);
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
  assert.match(sceneSource, /environment\.dayPhase\}:\$\{visualState\.lightSignature\}:\$\{paletteAdapter\?\.paletteId \?\? "none"\}:\$\{rainFrame\}/);
  assert.match(sceneSource, /fillStyle\(0x071426, visualState\.nightAlpha\)/);
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
  assert.equal(IMJINROK_SOURCE_COMMAND_ICON_PROFILE.unboundActionPolicy, "disabled-placeholder");
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
  assert.deepEqual(
    resolveMagicAutoUseSourceCommandIcon(false, IMJINROK_SOURCE_COMMAND_ICON_PROFILE),
    {
      ...ORIGINAL_COMMAND_ICON_ASSETS.find((asset) => asset.sourceFrameIndex === 27)!,
      sourceActionWord: 61,
      sourceLabel: "자동마법설정",
      evidenceStatus: "exact-source-control-binding",
    },
  );
  assert.equal(resolveMagicAutoUseSourceCommandIcon(true, IMJINROK_SOURCE_COMMAND_ICON_PROFILE)?.sourceFrameIndex, 26);
  assert.equal(resolveMagicAutoUseSourceCommandIcon(false), undefined);
  assert.equal(resolveSourceCommandIconProfileForScenario("core-default"), undefined);
  assert.equal(resolveSourceCommandIconProfileForScenario("imjinrok-k01-opening"), IMJINROK_SOURCE_COMMAND_ICON_PROFILE);
});

test("a command icon registry lets a mod replace the K01 pack without changing the adaptive layout", () => {
  const customProfile = {
    ...IMJINROK_SOURCE_COMMAND_ICON_PROFILE,
    actionBindings: {
      move: {
        ...ORIGINAL_COMMAND_ICON_ASSETS.find((asset) => asset.sourceFrameIndex === 45)!,
        sourceActionWord: 999,
        sourceLabel: "custom-move",
        evidenceStatus: "source-backed-adaptation" as const,
      },
    },
    unboundActionPolicy: "glyph-fallback" as const,
  };
  const registry = new SourceCommandIconProfileRegistry([
    IMJINROK_SOURCE_COMMAND_ICON_PROFILE,
  ]);

  registry.replace(customProfile);

  assert.equal(registry.resolve(customProfile.id), customProfile);
  assert.equal(
    resolveSourceCommandIconProfileForScenario("imjinrok-k01-opening", registry),
    customProfile,
  );
  assert.throws(
    () => registry.register(IMJINROK_SOURCE_COMMAND_ICON_PROFILE),
    /already registered/,
  );
  assert.equal(
    DEFAULT_SOURCE_COMMAND_ICON_PROFILE_REGISTRY.resolve(IMJINROK_SOURCE_COMMAND_ICON_PROFILE.id),
    IMJINROK_SOURCE_COMMAND_ICON_PROFILE,
  );
});

test("missing source textures fail loudly", () => {
  assert.throws(
    () => requireSourceTexture(resolveSourceCommandIcon("move", IMJINROK_SOURCE_COMMAND_ICON_PROFILE)!, () => false),
    /Required source-backed texture is not loaded/,
  );
});
