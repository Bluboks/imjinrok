import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultTheme, getThemeFrameRefs } from "./index.js";
import type { EntityVisual } from "./visuals.js";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const defaultThemeAssetRoot = join(repositoryRoot, "apps/game-client/public/assets/themes/default");

test("default theme entity bindings point to loadable source-converted assets", () => {
  assert.equal(defaultTheme.entityBindings.villager, "villager-korean-farmer");
  assert.equal(defaultTheme.entityBindings.swordsman, "korean-swordsman");
  assert.equal(defaultTheme.entityBindings.archer, "korean-archer");
  assert.equal(defaultTheme.entityBindings["ryu-seong-ryong"], "korean-swordsman");
  assert.equal(defaultTheme.entityBindings["gwon-yul"], "korean-swordsman");
  assert.equal(defaultTheme.entityBindings["town-center"], "korean-hq");

  const missing = getThemeFrameRefs(defaultTheme)
    .map(({ visual, frame }) => join(defaultThemeAssetRoot, visual.assetPath, frame.fileName ?? `${frame.textureKey}.png`))
    .filter((path) => !existsSync(path));

  assert.deepEqual(missing, []);
});

test("default theme uses source-exported multi-frame Korean unit clips", () => {
  const farmerManifest = readManifest("entities/villager/farmerk.manifest.json");
  const swordsmanManifest = readManifest("entities/swordsman/swordk.manifest.json");
  const archerManifest = readManifest("entities/archer/archerk.manifest.json");
  const royalCartManifest = readManifest("entities/royal-cart/koreanking.manifest.json");
  const villagerVisual = defaultTheme.visuals[defaultTheme.entityBindings.villager] as EntityVisual;
  const swordsmanVisual = defaultTheme.visuals[defaultTheme.entityBindings.swordsman] as EntityVisual;
  const archerVisual = defaultTheme.visuals[defaultTheme.entityBindings.archer] as EntityVisual;
  const royalCartVisual = defaultTheme.visuals[defaultTheme.entityBindings["royal-cart"]] as EntityVisual;

  assert.equal(farmerManifest.source, "original/imjinrok2/char/farmerk.spr");
  assert.equal(farmerManifest.frameCount, 248);
  assert.equal(farmerManifest.exportedFrames.length, 248);
  assert.equal(villagerVisual.states.move?.clips.s?.frames.length, 8);
  assert.equal(villagerVisual.states.move?.clips.s?.frames[0]?.fileName, "farmerk_0000.png");
  assert.equal(villagerVisual.states.move?.clips.sw?.frames[0]?.fileName, "farmerk_0008.png");
  assert.equal(villagerVisual.states.move?.clips.e?.frames[0]?.fileName, "farmerk_0016.png");
  assert.equal(villagerVisual.states.move?.clips.e?.mirrorX, true);
  assert.equal(villagerVisual.states.gather?.clips.s?.frames[0]?.fileName, "farmerk_0064.png");
  assert.equal(villagerVisual.states.build?.clips.s?.frames[0]?.fileName, "farmerk_0128.png");
  assert.equal(villagerVisual.states.repair?.clips.s?.frames[0]?.fileName, "farmerk_0128.png");

  assert.equal(swordsmanManifest.source, "original/imjinrok2/char/swordk.spr");
  assert.equal(swordsmanManifest.frameCount, 192);
  assert.equal(swordsmanManifest.exportedFrames.length, 192);
  assert.equal(swordsmanVisual.states.move?.clips.s?.frames.length, 8);
  assert.equal(swordsmanVisual.states.attack?.clips.s?.frames[0]?.fileName, "swordk_0064.png");
  assert.equal(swordsmanVisual.states.attack?.clips.e?.frames[0]?.fileName, "swordk_0080.png");
  assert.equal(swordsmanVisual.states.attack?.clips.e?.mirrorX, true);

  assert.equal(archerManifest.source, "original/imjinrok2/char/archerk.spr");
  assert.equal(archerManifest.frameCount, 176);
  assert.equal(archerManifest.exportedFrames.length, 176);
  assert.equal(archerVisual.states.move?.clips.s?.frames.length, 8);
  assert.equal(archerVisual.states.idle?.clips.s?.frames[0]?.fileName, "archerk_0080.png");
  assert.equal(archerVisual.states.move?.clips.s?.frames[0]?.fileName, "archerk_0080.png");
  assert.equal(archerVisual.states.attack?.clips.s?.frames[0]?.fileName, "archerk_0000.png");
  assert.equal(archerVisual.states.attack?.clips.e?.frames[0]?.fileName, "archerk_0016.png");
  assert.equal(archerVisual.states.attack?.clips.e?.mirrorX, true);

  assert.equal(royalCartManifest.source, "original/imjinrok2/char/koreanking.spr");
  assert.equal(royalCartManifest.frameCount, 50);
  assert.equal(royalCartManifest.exportedFrames.length, 50);
  assert.equal(royalCartVisual.states.idle?.clips.s?.frames[0]?.fileName, "koreanking_0000.png");
  assert.equal(royalCartVisual.states.idle?.clips.sw?.frames[0]?.fileName, "koreanking_0006.png");
  assert.equal(royalCartVisual.states.move?.clips.s?.frames.length, 6);
  assert.equal(royalCartVisual.states.move?.clips.sw?.frames[0]?.fileName, "koreanking_0006.png");
  assert.equal(royalCartVisual.states.move?.clips.se?.frames.at(-1)?.fileName, "koreanking_0047.png");
});

test("default theme maps Korean building construction frames from source sprites", () => {
  const buildingExpectations = [
    {
      binding: "town-center",
      manifestPath: "entities/town-center/hqk.manifest.json",
      source: "original/imjinrok2/char/hqk.spr",
      frameCount: 20,
      idleFrame: "hqk_0008.png",
    },
    {
      binding: "house",
      manifestPath: "entities/house/millk.manifest.json",
      source: "original/imjinrok2/char/millk.spr",
      frameCount: 16,
      idleFrame: "millk_0008.png",
    },
    {
      binding: "barracks",
      manifestPath: "entities/barracks/barrackk.manifest.json",
      source: "original/imjinrok2/char/barrackk.spr",
      frameCount: 32,
      idleFrame: "barrackk_0007.png",
      constructionFrameCount: 8,
    },
    {
      binding: "beacon",
      manifestPath: "entities/beacon/towerk.manifest.json",
      source: "original/imjinrok2/char/towerk.spr",
      frameCount: 24,
      idleFrame: "towerk_0008.png",
    },
  ] as const;

  for (const expectation of buildingExpectations) {
    const visualId = defaultTheme.entityBindings[expectation.binding];
    const visual = defaultTheme.visuals[visualId] as EntityVisual;
    const manifest = readManifest(expectation.manifestPath);

    assert.equal(manifest.source, expectation.source);
    assert.equal(manifest.frameCount, expectation.frameCount);
    assert.equal(manifest.exportedFrames.length, expectation.frameCount);
    assert.equal(visual.states.idle?.clips.default?.frames[0]?.fileName, expectation.idleFrame);
    assert.equal(visual.states.construction?.clips.default?.frames.length, expectation.constructionFrameCount ?? 9);
    assert.equal(visual.states.construction?.clips.default?.frames[0]?.fileName.endsWith("_0000.png"), true);
    assert.equal(visual.states.construction?.clips.default?.frames.at(-1)?.fileName, expectation.idleFrame);
  }
});

test("default theme models Korean barracks flag as an idle overlay layer", () => {
  const visual = defaultTheme.visuals[defaultTheme.entityBindings.barracks] as EntityVisual;
  const flagLayer = visual.layers?.find((layer) => layer.id === "flag");

  assert.ok(flagLayer);
  assert.deepEqual(
    flagLayer.states.idle?.clips.default?.frames.map((frame) => frame.fileName),
    [
      "barrackk_0009.png",
      "barrackk_0010.png",
      "barrackk_0011.png",
      "barrackk_0012.png",
      "barrackk_0013.png",
      "barrackk_0014.png",
      "barrackk_0015.png",
    ],
  );
});

function readManifest(relativePath: string): {
  source: string;
  frameCount: number;
  exportedFrames: readonly unknown[];
} {
  return JSON.parse(readFileSync(join(defaultThemeAssetRoot, relativePath), "utf8")) as {
    source: string;
    frameCount: number;
    exportedFrames: readonly unknown[];
  };
}
