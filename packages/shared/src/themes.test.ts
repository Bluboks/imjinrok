import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractOriginalSpriteTable } from "../../../tools/imjinrok/extract-sprite-table.mjs";
import { defaultTheme, getGridFacing, getThemeFrameRefs } from "./index.js";
import type { EntityVisual, Facing } from "./visuals.js";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const defaultThemeAssetRoot = join(repositoryRoot, "apps/game-client/public/assets/themes/default");
const originalExecutablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");

test("default theme entity bindings point to loadable source-converted assets", () => {
  assert.equal(defaultTheme.entityBindings.villager, "villager-korean-farmer");
  assert.equal(defaultTheme.entityBindings.swordsman, "korean-swordsman");
  assert.equal(defaultTheme.entityBindings.archer, "korean-archer");
  assert.equal(defaultTheme.entityBindings["japanese-swordsman"], "japanese-swordsman");
  assert.equal(defaultTheme.entityBindings["japanese-gunner"], "japanese-gunner");
  assert.equal(defaultTheme.entityBindings["japanese-samurai"], "japanese-samurai");
  assert.equal(defaultTheme.entityBindings["japanese-turtle-tank"], "japanese-turtle-tank");
  assert.equal(defaultTheme.entityBindings["japanese-konishi"], "japanese-konishi");
  assert.equal(defaultTheme.entityBindings["japanese-camp-house"], "japanese-camp-house");
  assert.equal(defaultTheme.entityBindings["japanese-camp-barracks"], "japanese-camp-barracks");
  assert.equal(defaultTheme.entityBindings["japanese-camp-tower"], "japanese-camp-tower");
  assert.equal(defaultTheme.entityBindings["japanese-camp-firehouse"], "japanese-camp-firehouse");
  assert.equal(defaultTheme.entityBindings["japanese-camp-advanced-tower"], "japanese-camp-advanced-tower");
  assert.equal(defaultTheme.entityBindings["ryu-seong-ryong"], "korean-ryu-seong-ryong");
  assert.equal(defaultTheme.entityBindings["gwon-yul"], "korean-gwon-yul");
  assert.equal(defaultTheme.entityBindings["town-center"], "korean-hq");

  const missing = getThemeFrameRefs(defaultTheme)
    .map(({ visual, frame }) => join(defaultThemeAssetRoot, visual.assetPath, frame.fileName ?? `${frame.textureKey}.png`))
    .filter((path) => !existsSync(path));

  assert.deepEqual(missing, []);
});

test("original executable sprite pointer table backs K01/K02 theme source sprites", () => {
  const spriteTable = extractOriginalSpriteTable(originalExecutablePath);
  const tableEntriesByPath = new Map(spriteTable.entries.map((entry) => [entry.sourcePathNormalized, entry]));
  const expectations = [
    { manifestPath: "entities/swordsman/swordk.manifest.json", sourcePath: "char/swordk.spr", tableIndex: 0 },
    { manifestPath: "entities/japanese-swordsman/swordj.manifest.json", sourcePath: "char/swordj.spr", tableIndex: 1 },
    { manifestPath: "entities/archer/archerk.manifest.json", sourcePath: "char/archerk.spr", tableIndex: 2 },
    { manifestPath: "entities/villager/farmerk.manifest.json", sourcePath: "char/farmerk.spr", tableIndex: 5 },
    { manifestPath: "entities/barracks/barrackk.manifest.json", sourcePath: "char/barrackk.spr", tableIndex: 8 },
    { manifestPath: "entities/japanese-camp-barracks/barrackj.manifest.json", sourcePath: "char/barrackj.spr", tableIndex: 10 },
    { manifestPath: "entities/japanese-gunner/gunj1.manifest.json", sourcePath: "char/gunj1.spr", tableIndex: 14 },
    { manifestPath: "entities/japanese-samurai/horseswordj1.manifest.json", sourcePath: "char/horseswordj1.spr", tableIndex: 17 },
    { manifestPath: "entities/japanese-samurai/horseswordj2.manifest.json", sourcePath: "char/horseswordj2.spr", tableIndex: 18 },
    { manifestPath: "entities/japanese-turtle-tank/ghosttankj.manifest.json", sourcePath: "char/ghosttankj.spr", tableIndex: 4 },
    { manifestPath: "entities/japanese-konishi/generalj11.manifest.json", sourcePath: "char/generalj11.spr", tableIndex: 65 },
    { manifestPath: "entities/japanese-camp-house/millj.manifest.json", sourcePath: "char/millj.spr", tableIndex: 23 },
    {
      manifestPath: "entities/korean-signal-beacon/firehousek.manifest.json",
      sourcePath: "char/firehousek.spr",
      tableIndex: 13,
    },
    { manifestPath: "entities/town-center/hqk.manifest.json", sourcePath: "char/hqk.spr", tableIndex: 41 },
    { manifestPath: "entities/house/millk.manifest.json", sourcePath: "char/millk.spr", tableIndex: 46 },
    { manifestPath: "entities/general-k4/generalk4.manifest.json", sourcePath: "char/generalk4.spr", tableIndex: 60 },
    { manifestPath: "entities/gwon-yul/generalk11.manifest.json", sourcePath: "char/generalk11.spr", tableIndex: 53 },
    { manifestPath: "entities/gwon-yul/generalk12.manifest.json", sourcePath: "char/generalk12.spr", tableIndex: 54 },
    { manifestPath: "entities/gwon-yul/generalk13.manifest.json", sourcePath: "char/generalk13.spr", tableIndex: 55 },
    {
      manifestPath: "entities/ryu-seong-ryong/generalk31.manifest.json",
      sourcePath: "char/generalk31.spr",
      tableIndex: 58,
    },
    {
      manifestPath: "entities/ryu-seong-ryong/generalk32.manifest.json",
      sourcePath: "char/generalk32.spr",
      tableIndex: 59,
    },
    { manifestPath: "entities/japanese-camp-tower/towerj.manifest.json", sourcePath: "char/towerj.spr", tableIndex: 119 },
    { manifestPath: "entities/japanese-camp-advanced-tower/advtowerj.manifest.json", sourcePath: "char/advtowerj.spr", tableIndex: 120 },
    { manifestPath: "entities/japanese-camp-firehouse/firehousej.manifest.json", sourcePath: "char/firehousej.spr", tableIndex: 121 },
    { manifestPath: "entities/royal-cart/koreanking.manifest.json", sourcePath: "char/koreanking.spr", tableIndex: 124 },
  ] as const;

  assert.equal(spriteTable.tableVa, "0x004bc224");
  assert.equal(spriteTable.entryCount, 126);

  for (const expectation of expectations) {
    const manifest = readManifest(expectation.manifestPath);
    const sourcePath = normalizeManifestSourcePath(manifest.source);
    const tableEntry = tableEntriesByPath.get(expectation.sourcePath);

    assert.equal(sourcePath, expectation.sourcePath);
    assert.ok(tableEntry, `missing original sprite table entry ${expectation.sourcePath}`);
    assert.equal(tableEntry.index, expectation.tableIndex);
  }
});

test("default theme unit frame blocks stay within their source exports", () => {
  // Most unit action blocks remain provisional; K01 hero core states have narrower static evidence.
  const farmerManifest = readManifest("entities/villager/farmerk.manifest.json");
  const swordsmanManifest = readManifest("entities/swordsman/swordk.manifest.json");
  const archerManifest = readManifest("entities/archer/archerk.manifest.json");
  const japaneseSwordsmanManifest = readManifest("entities/japanese-swordsman/swordj.manifest.json");
  const japaneseGunnerManifest = readManifest("entities/japanese-gunner/gunj1.manifest.json");
  const generalManifest = readManifest("entities/general-k4/generalk4.manifest.json");
  const gwonYulManifest = readManifest("entities/gwon-yul/generalk11.manifest.json");
  const gwonYulAttackManifest = readManifest("entities/gwon-yul/generalk12.manifest.json");
  const gwonYulIdleManifest = readManifest("entities/gwon-yul/generalk13.manifest.json");
  const ryuSeongRyongManifest = readManifest("entities/ryu-seong-ryong/generalk31.manifest.json");
  const ryuSeongRyongCombatManifest = readManifest("entities/ryu-seong-ryong/generalk32.manifest.json");
  const royalCartManifest = readManifest("entities/royal-cart/koreanking.manifest.json");
  const villagerVisual = defaultTheme.visuals[defaultTheme.entityBindings.villager] as EntityVisual;
  const swordsmanVisual = defaultTheme.visuals[defaultTheme.entityBindings.swordsman] as EntityVisual;
  const archerVisual = defaultTheme.visuals[defaultTheme.entityBindings.archer] as EntityVisual;
  const japaneseSwordsmanVisual = defaultTheme.visuals[defaultTheme.entityBindings["japanese-swordsman"]] as EntityVisual;
  const japaneseGunnerVisual = defaultTheme.visuals[defaultTheme.entityBindings["japanese-gunner"]] as EntityVisual;
  const generalVisual = defaultTheme.visuals["korean-general-k4"] as EntityVisual;
  const gwonYulVisual = defaultTheme.visuals[defaultTheme.entityBindings["gwon-yul"]] as EntityVisual;
  const ryuSeongRyongVisual = defaultTheme.visuals[defaultTheme.entityBindings["ryu-seong-ryong"]] as EntityVisual;
  const royalCartVisual = defaultTheme.visuals[defaultTheme.entityBindings["royal-cart"]] as EntityVisual;

  assert.equal(farmerManifest.source, "original/imjinrok2/char/farmerk.spr");
  assert.equal(farmerManifest.frameCount, 248);
  assert.equal(farmerManifest.exportedFrames.length, 248);
  assert.equal(villagerVisual.states.move?.clips.s?.frames.length, 8);
  assert.equal(villagerVisual.states.idle?.clips.n?.frames[0]?.fileName, "farmerk_0000.png");
  assert.equal(villagerVisual.states.move?.clips.n?.frames[0]?.fileName, "farmerk_0040.png");
  assert.equal(villagerVisual.states.move?.clips.ne?.frames[0]?.fileName, "farmerk_0048.png");
  assert.equal(villagerVisual.states.move?.clips.e?.frames[0]?.fileName, "farmerk_0056.png");
  assert.equal(villagerVisual.states.move?.clips.se?.frames[0]?.fileName, "farmerk_0064.png");
  assert.equal(villagerVisual.states.move?.clips.s?.frames[0]?.fileName, "farmerk_0072.png");
  assert.equal(villagerVisual.states.move?.clips.w?.frames[0]?.fileName, "farmerk_0056.png");
  assert.equal(villagerVisual.states.move?.clips.w?.mirrorX, true);
  assert.equal(villagerVisual.states.move?.clips.sw?.frames[0]?.fileName, "farmerk_0064.png");
  assert.equal(villagerVisual.states.move?.clips.sw?.mirrorX, true);
  assert.equal(villagerVisual.states.carry?.clips.s?.frames[0]?.fileName, "farmerk_0112.png");
  assert.equal(villagerVisual.states.gather?.clips.s?.frames[0]?.fileName, "farmerk_0152.png");
  assert.equal(villagerVisual.states.build?.clips.s?.frames[0]?.fileName, "farmerk_0192.png");
  assert.equal(villagerVisual.states.repair?.clips.s?.frames[0]?.fileName, "farmerk_0192.png");

  assert.equal(swordsmanManifest.source, "original/imjinrok2/char/swordk.spr");
  assert.equal(swordsmanManifest.frameCount, 192);
  assert.equal(swordsmanManifest.exportedFrames.length, 192);
  assert.equal(swordsmanVisual.states.move?.clips.s?.frames.length, 8);
  const verifiedMovementFacings = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const satisfies readonly Facing[];
  assert.deepEqual(
    Object.fromEntries(
      verifiedMovementFacings.map((facing) => {
        const clip = swordsmanVisual.states.move?.clips[facing];
        return [facing, [clip?.frames[0]?.fileName, clip?.mirrorX === true]];
      }),
    ),
    {
      n: ["swordk_0016.png", true],
      ne: ["swordk_0008.png", true],
      e: ["swordk_0000.png", true],
      se: ["swordk_0032.png", false],
      s: ["swordk_0000.png", false],
      sw: ["swordk_0008.png", false],
      w: ["swordk_0016.png", false],
      nw: ["swordk_0024.png", false],
    },
  );
  assert.deepEqual(
    swordsmanVisual.states.walk?.clips,
    swordsmanVisual.states.move?.clips,
  );
  assert.equal(swordsmanVisual.states.attack?.clips.n?.frames[0]?.fileName, "swordk_0048.png");
  assert.equal(swordsmanVisual.states.attack?.clips.s?.frames[0]?.fileName, "swordk_0080.png");
  assert.equal(swordsmanVisual.states.attack?.clips.e?.frames[0]?.fileName, "swordk_0064.png");
  assert.equal(swordsmanVisual.states.attack?.clips.w?.frames[0]?.fileName, "swordk_0064.png");
  assert.equal(swordsmanVisual.states.attack?.clips.w?.mirrorX, true);

  assert.equal(archerManifest.source, "original/imjinrok2/char/archerk.spr");
  assert.equal(archerManifest.frameCount, 176);
  assert.equal(archerManifest.exportedFrames.length, 176);
  assert.equal(archerVisual.states.move?.clips.s?.frames.length, 8);
  assert.equal(archerVisual.states.idle?.clips.n?.frames[0]?.fileName, "archerk_0120.png");
  assert.equal(archerVisual.states.idle?.clips.s?.frames[0]?.fileName, "archerk_0152.png");
  assert.equal(archerVisual.states.move?.clips.s?.frames[0]?.fileName, "archerk_0112.png");
  assert.equal(archerVisual.states.attack?.clips.s?.frames[0]?.fileName, "archerk_0032.png");
  assert.equal(archerVisual.states.attack?.clips.e?.frames[0]?.fileName, "archerk_0016.png");
  assert.equal(archerVisual.states.attack?.clips.w?.frames[0]?.fileName, "archerk_0016.png");
  assert.equal(archerVisual.states.attack?.clips.w?.mirrorX, true);

  assert.equal(japaneseSwordsmanManifest.source, "original/imjinrok2/char/swordj.spr");
  assert.equal(japaneseSwordsmanManifest.frameCount, 192);
  assert.equal(japaneseSwordsmanManifest.exportedFrames.length, 192);
  assert.equal(japaneseSwordsmanVisual.states.idle?.clips.n?.frames[0]?.fileName, "swordj_0000.png");
  assert.equal(japaneseSwordsmanVisual.states.move?.clips.n?.frames[0]?.fileName, "swordj_0040.png");
  assert.equal(japaneseSwordsmanVisual.states.move?.clips.s?.frames[0]?.fileName, "swordj_0072.png");
  assert.equal(japaneseSwordsmanVisual.states.attack?.clips.s?.frames[0]?.fileName, "swordj_0160.png");
  assert.equal(japaneseSwordsmanVisual.states.attack?.clips.w?.frames[0]?.fileName, "swordj_0144.png");
  assert.equal(japaneseSwordsmanVisual.states.attack?.clips.w?.mirrorX, true);

  assert.equal(japaneseGunnerManifest.source, "original/imjinrok2/char/gunj1.spr");
  assert.equal(japaneseGunnerManifest.frameCount, 80);
  assert.equal(japaneseGunnerManifest.exportedFrames.length, 80);
  assert.equal(japaneseGunnerVisual.states.idle?.clips.n?.frames[0]?.fileName, "gunj1_0000.png");
  assert.equal(japaneseGunnerVisual.states.move?.clips.n?.frames[0]?.fileName, "gunj1_0040.png");
  assert.equal(japaneseGunnerVisual.states.move?.clips.s?.frames[0]?.fileName, "gunj1_0072.png");
  assert.equal(japaneseGunnerVisual.states.attack?.clips.s?.frames[0]?.fileName, "gunj1_0072.png");
  assert.equal(japaneseGunnerVisual.states.attack?.clips.w?.frames[0]?.fileName, "gunj1_0056.png");
  assert.equal(japaneseGunnerVisual.states.attack?.clips.w?.mirrorX, true);

  assert.equal(generalManifest.source, "original/imjinrok2/char/generalk4.spr");
  assert.equal(generalManifest.frameCount, 208);
  assert.equal(generalManifest.exportedFrames.length, 208);
  assert.equal(generalVisual.states.idle?.clips.n?.frames[0]?.fileName, "generalk4_0000.png");
  assert.equal(generalVisual.states.idle?.clips.s?.frames[0]?.fileName, "generalk4_0032.png");
  assert.equal(generalVisual.states.move?.clips.s?.frames[0]?.fileName, "generalk4_0072.png");
  assert.equal(generalVisual.states.attack?.clips.n?.frames[0]?.fileName, "generalk4_0096.png");
  assert.equal(generalVisual.states.attack?.clips.s?.frames[0]?.fileName, "generalk4_0128.png");
  assert.equal(generalVisual.states.attack?.clips.e?.frames[0]?.fileName, "generalk4_0112.png");
  assert.equal(generalVisual.states.attack?.clips.w?.frames[0]?.fileName, "generalk4_0112.png");
  assert.equal(generalVisual.states.attack?.clips.w?.mirrorX, true);

  assert.equal(gwonYulManifest.source, "original/imjinrok2/char/generalk11.spr");
  assert.equal(gwonYulManifest.frameCount, 48);
  assert.equal(gwonYulManifest.exportedFrames.length, 48);
  assert.deepEqual(
    Object.fromEntries(
      verifiedMovementFacings.map((facing) => {
        const clip = gwonYulVisual.states.move?.clips[facing];
        return [facing, [clip?.frames[0]?.fileName, clip?.mirrorX === true]];
      }),
    ),
    {
      n: ["generalk11_0016.png", true],
      ne: ["generalk11_0008.png", true],
      e: ["generalk11_0000.png", true],
      se: ["generalk11_0032.png", false],
      s: ["generalk11_0000.png", false],
      sw: ["generalk11_0008.png", false],
      w: ["generalk11_0016.png", false],
      nw: ["generalk11_0024.png", false],
    },
  );
  assert.deepEqual(
    gwonYulVisual.states.walk?.clips,
    gwonYulVisual.states.move?.clips,
  );
  assert.equal(gwonYulIdleManifest.frameCount, 48);
  assert.equal(gwonYulIdleManifest.exportedFrames.length, 48);
  assertDirectionalClipStarts(gwonYulVisual, "idle", "generalk13", {
    n: [16, true],
    ne: [8, true],
    e: [0, true],
    se: [32, false],
    s: [0, false],
    sw: [8, false],
    w: [16, false],
    nw: [24, false],
  });
  assert.equal(gwonYulVisual.states.idle?.clips.s?.frames.length, 8);
  assert.equal(gwonYulAttackManifest.frameCount, 56);
  assert.equal(gwonYulAttackManifest.exportedFrames.length, 56);
  assertDirectionalClipStarts(gwonYulVisual, "attack", "generalk12", {
    n: [20, true],
    ne: [10, true],
    e: [0, true],
    se: [40, false],
    s: [0, false],
    sw: [10, false],
    w: [20, false],
    nw: [30, false],
  });
  assert.equal(gwonYulVisual.states.attack?.clips.s?.frames.length, 8);
  assert.equal(gwonYulVisual.states.attack?.clips.s?.loop, false);
  assertDirectionalClipStarts(gwonYulVisual, "death", "generalk11", {
    n: [40, true],
    ne: [40, true],
    e: [40, true],
    se: [40, false],
    s: [40, false],
    sw: [40, false],
    w: [40, false],
    nw: [40, false],
  });

  assert.equal(ryuSeongRyongManifest.source, "original/imjinrok2/char/generalk31.spr");
  assert.equal(ryuSeongRyongManifest.frameCount, 80);
  assert.equal(ryuSeongRyongManifest.exportedFrames.length, 80);
  assert.deepEqual(
    Object.fromEntries(
      verifiedMovementFacings.map((facing) => {
        const clip = ryuSeongRyongVisual.states.move?.clips[facing];
        return [facing, [clip?.frames[0]?.fileName, clip?.mirrorX === true]];
      }),
    ),
    {
      n: ["generalk31_0056.png", true],
      ne: ["generalk31_0048.png", true],
      e: ["generalk31_0040.png", true],
      se: ["generalk31_0072.png", false],
      s: ["generalk31_0040.png", false],
      sw: ["generalk31_0048.png", false],
      w: ["generalk31_0056.png", false],
      nw: ["generalk31_0064.png", false],
    },
  );
  assert.deepEqual(
    ryuSeongRyongVisual.states.walk?.clips,
    ryuSeongRyongVisual.states.move?.clips,
  );
  assertDirectionalClipStarts(ryuSeongRyongVisual, "idle", "generalk31", {
    n: [16, true],
    ne: [8, true],
    e: [0, true],
    se: [32, false],
    s: [0, false],
    sw: [8, false],
    w: [16, false],
    nw: [24, false],
  });
  assert.equal(ryuSeongRyongVisual.states.idle?.clips.s?.frames.length, 8);
  assert.equal(ryuSeongRyongCombatManifest.frameCount, 60);
  assert.equal(ryuSeongRyongCombatManifest.exportedFrames.length, 60);
  assertDirectionalClipStarts(ryuSeongRyongVisual, "attack", "generalk32", {
    n: [20, true],
    ne: [10, true],
    e: [0, true],
    se: [40, false],
    s: [0, false],
    sw: [10, false],
    w: [20, false],
    nw: [30, false],
  });
  assert.equal(ryuSeongRyongVisual.states.attack?.clips.s?.frames.length, 10);
  assertDirectionalClipStarts(ryuSeongRyongVisual, "death", "generalk32", {
    n: [50, true],
    ne: [50, true],
    e: [50, true],
    se: [50, false],
    s: [50, false],
    sw: [50, false],
    w: [50, false],
    nw: [50, false],
  });

  assert.equal(royalCartManifest.source, "original/imjinrok2/char/koreanking.spr");
  assert.equal(royalCartManifest.frameCount, 50);
  assert.equal(royalCartManifest.exportedFrames.length, 50);
  assert.equal(royalCartVisual.states.idle?.clips.n?.frames[0]?.fileName, "koreanking_0000.png");
  assert.equal(royalCartVisual.states.idle?.clips.s?.frames[0]?.fileName, "koreanking_0040.png");
  assert.equal(royalCartVisual.states.move?.clips.s?.frames.length, 10);
  assert.equal(royalCartVisual.states.move?.clips.s?.frames[0]?.fileName, "koreanking_0040.png");
  assert.equal(royalCartVisual.states.move?.clips.s?.frames.at(-1)?.fileName, "koreanking_0049.png");
  assert.equal(royalCartVisual.states.move?.clips.sw?.frames[0]?.fileName, "koreanking_0030.png");
  assert.equal(royalCartVisual.states.move?.clips.sw?.mirrorX, true);
  assert.equal(royalCartVisual.states.move?.clips.se?.frames.at(-1)?.fileName, "koreanking_0039.png");
});

test("Japanese samurai uses the statically recovered core-state frame blocks", () => {
  const primaryManifest = readManifest(
    "entities/japanese-samurai/horseswordj1.manifest.json",
  );
  const secondaryManifest = readManifest(
    "entities/japanese-samurai/horseswordj2.manifest.json",
  );
  const visual = defaultTheme.visuals[
    defaultTheme.entityBindings["japanese-samurai"]
  ] as EntityVisual;

  assert.equal(primaryManifest.source, "original/imjinrok2/char/horseswordj1.spr");
  assert.equal(primaryManifest.frameCount, 90);
  assert.equal(primaryManifest.exportedFrames.length, 90);
  assert.equal(secondaryManifest.source, "original/imjinrok2/char/horseswordj2.spr");
  assert.equal(secondaryManifest.frameCount, 70);
  assert.equal(secondaryManifest.exportedFrames.length, 70);
  assert.deepEqual(
    Object.keys(visual.states).sort(),
    ["idle", "move", "walk", "attack", "death"].sort(),
  );

  assertDirectionalFrames(visual, "idle", {
    stem: "horseswordj2",
    phaseCount: 8,
    frameStarts: { s: 0, sw: 8, w: 16, nw: 24, n: 16, ne: 8, e: 0, se: 32 },
  });
  assertDirectionalFrames(visual, "move", {
    stem: "horseswordj1",
    phaseCount: 8,
    frameStarts: { s: 0, sw: 8, w: 16, nw: 24, n: 16, ne: 8, e: 0, se: 32 },
  });
  assert.deepEqual(visual.states.walk, visual.states.move);
  assertDirectionalFrames(visual, "attack", {
    stem: "horseswordj1",
    phaseCount: 8,
    frameStarts: { s: 50, sw: 58, w: 66, nw: 74, n: 66, ne: 58, e: 50, se: 82 },
  });
  assertDirectionalFrames(visual, "death", {
    stem: "horseswordj1",
    phaseCount: 8,
    frameStarts: { s: 40, sw: 40, w: 40, nw: 40, n: 40, ne: 40, e: 40, se: 40 },
  });
  assert.equal(visual.states.idle?.clips.s?.loop, true);
  assert.equal(visual.states.move?.clips.s?.loop, true);
  assert.equal(visual.states.walk?.clips.s?.loop, true);
  assert.equal(visual.states.attack?.clips.s?.loop, false);
  assert.equal(visual.states.death?.clips.s?.loop, false);

  for (const state of ["idle", "move", "walk", "attack", "death"] as const) {
    const clips = visual.states[state]?.clips;
    assert.equal(clips?.n?.mirrorX, true);
    assert.equal(clips?.ne?.mirrorX, true);
    assert.equal(clips?.e?.mirrorX, true);
    assert.equal(clips?.s?.mirrorX, undefined);
    assert.equal(clips?.sw?.mirrorX, undefined);
    assert.equal(clips?.w?.mirrorX, undefined);
    assert.equal(clips?.nw?.mirrorX, undefined);
    assert.equal(clips?.se?.mirrorX, undefined);
  }
});

test("Japanese turtle tank uses only the statically recovered grid core-state frames", () => {
  const manifest = readManifest(
    "entities/japanese-turtle-tank/ghosttankj.manifest.json",
  );
  const visual = defaultTheme.visuals[
    defaultTheme.entityBindings["japanese-turtle-tank"]
  ] as EntityVisual;

  assert.equal(manifest.source, "original/imjinrok2/char/ghosttankj.spr");
  assert.equal(manifest.frameCount, 88);
  assert.equal(manifest.exportedFrames.length, 88);
  assert.deepEqual(
    Object.keys(visual.states).sort(),
    ["idle", "move", "walk", "attack"].sort(),
  );
  assertDirectionalFrames(visual, "idle", {
    stem: "ghosttankj",
    phaseCount: 1,
    frameStarts: { s: 16, sw: 32, w: 48, nw: 64, n: 48, ne: 32, e: 16, se: 0 },
  });
  assertDirectionalFrames(visual, "move", {
    stem: "ghosttankj",
    phaseCount: 8,
    frameStarts: { s: 16, sw: 32, w: 48, nw: 64, n: 48, ne: 32, e: 16, se: 0 },
  });
  assert.deepEqual(visual.states.walk, visual.states.move);
  assertDirectionalFrames(visual, "attack", {
    stem: "ghosttankj",
    phaseCount: 1,
    frameStarts: { s: 74, sw: 76, w: 78, nw: 80, n: 78, ne: 76, e: 74, se: 72 },
  });
  assert.equal(visual.states.idle?.clips.s?.loop, true);
  assert.equal(visual.states.move?.clips.s?.loop, true);
  assert.equal(visual.states.walk?.clips.s?.loop, true);
  assert.equal(visual.states.attack?.clips.s?.loop, false);
  for (const state of ["idle", "move", "walk", "attack"] as const) {
    const clips = visual.states[state]?.clips;
    assert.equal(clips?.n?.mirrorX, true);
    assert.equal(clips?.ne?.mirrorX, true);
    assert.equal(clips?.e?.mirrorX, true);
    for (const facing of ["s", "sw", "w", "nw", "se"] as const) {
      assert.equal(clips?.[facing]?.mirrorX, undefined);
    }
  }
});

function assertDirectionalFrames(
  visual: EntityVisual,
  stateName: "idle" | "move" | "walk" | "attack" | "death",
  expected: {
    stem: string;
    phaseCount: number;
    frameStarts: Record<Facing, number>;
  },
): void {
  const state = visual.states[stateName];
  assert.ok(state);
  const expectedFacings: Facing[] = [
    "s",
    "sw",
    "w",
    "nw",
    "n",
    "ne",
    "e",
    "se",
  ];
  assert.deepEqual(state.facings, expectedFacings);
  for (const facing of expectedFacings) {
    const clip = state.clips[facing];
    const frameStart = expected.frameStarts[facing];
    assert.deepEqual(
      clip?.frames.map(({ fileName }) => fileName),
      Array.from(
        { length: expected.phaseCount },
        (_value, phase) =>
          `${expected.stem}_${String(frameStart + phase).padStart(4, "0")}.png`,
      ),
    );
  }
}

test("remaining identity-only Japanese visual uses only the proven base-frame still", () => {
  const expectations = [
    {
      kind: "japanese-konishi",
      manifestPath: "entities/japanese-konishi/generalj11.manifest.json",
      source: "original/imjinrok2/char/generalj11.spr",
      frameCount: 49,
      frameFile: "generalj11_0000.png",
    },
  ] as const;

  for (const expectation of expectations) {
    const manifest = readManifest(expectation.manifestPath);
    const visual = defaultTheme.visuals[
      defaultTheme.entityBindings[expectation.kind]
    ] as EntityVisual;
    assert.equal(manifest.source, expectation.source);
    assert.equal(manifest.frameCount, expectation.frameCount);
    assert.equal(manifest.exportedFrames.length, expectation.frameCount);
    assert.deepEqual(Object.keys(visual.states), ["default"]);
    assert.deepEqual(Object.keys(visual.states.default?.clips ?? {}), ["default"]);
    assert.equal(
      visual.states.default?.clips.default?.frames[0]?.fileName,
      expectation.frameFile,
    );
    assert.equal(
      visual.states.default?.clips.default?.frames.length,
      1,
    );
    assert.equal(visual.states.default?.facings, undefined);
    assert.equal(visual.states.default?.clips.default?.mirrorX, undefined);
  }
});

test("project grid facings match the statically recovered Korean spearman movement deltas", () => {
  assert.deepEqual(
    [
      [0, 1],
      [-1, 1],
      [-1, 0],
      [-1, -1],
      [0, -1],
      [1, -1],
      [1, 0],
      [1, 1],
    ].map(([deltaX, deltaY]) => getGridFacing(deltaX, deltaY)),
    ["s", "sw", "w", "nw", "n", "ne", "e", "se"],
  );
  assert.equal(getGridFacing(0, 0, "nw"), "nw");
});

test("default theme maps source-exported building construction frames", () => {
  const buildingExpectations = [
    {
      binding: "town-center",
      manifestPath: "entities/town-center/hqk.manifest.json",
      source: "original/imjinrok2/char/hqk.spr",
      frameCount: 20,
      idleFrame: "hqk_0007.png",
      constructionFrameCount: 8,
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
      manifestPath: "entities/korean-signal-beacon/firehousek.manifest.json",
      source: "original/imjinrok2/char/firehousek.spr",
      frameCount: 16,
      idleFrame: "firehousek_0007.png",
      constructionFrameCount: 8,
    },
    {
      binding: "japanese-camp-house",
      manifestPath: "entities/japanese-camp-house/millj.manifest.json",
      source: "original/imjinrok2/char/millj.spr",
      frameCount: 36,
      idleFrame: "millj_0008.png",
    },
    {
      binding: "japanese-camp-barracks",
      manifestPath: "entities/japanese-camp-barracks/barrackj.manifest.json",
      source: "original/imjinrok2/char/barrackj.spr",
      frameCount: 24,
      idleFrame: "barrackj_0009.png",
      completeFrame: "barrackj_0007.png",
      constructionFrameCount: 8,
    },
    {
      binding: "japanese-camp-tower",
      manifestPath: "entities/japanese-camp-tower/towerj.manifest.json",
      source: "original/imjinrok2/char/towerj.spr",
      frameCount: 40,
      idleFrame: "towerj_0008.png",
    },
    {
      binding: "japanese-camp-firehouse",
      manifestPath: "entities/japanese-camp-firehouse/firehousej.manifest.json",
      source: "original/imjinrok2/char/firehousej.spr",
      frameCount: 40,
      idleFrame: "firehousej_0009.png",
      completeFrame: "firehousej_0008.png",
    },
    {
      binding: "japanese-camp-advanced-tower",
      manifestPath: "entities/japanese-camp-advanced-tower/advtowerj.manifest.json",
      source: "original/imjinrok2/char/advtowerj.spr",
      frameCount: 10,
      idleFrame: "advtowerj_0008.png",
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
    assert.equal(visual.states.construction?.clips.default?.frames.at(-1)?.fileName, expectation.completeFrame ?? expectation.idleFrame);
  }
});

test("default theme applies the statically recovered Korean HQ body states", () => {
  const visual = defaultTheme.visuals[defaultTheme.entityBindings["town-center"]] as EntityVisual;

  assert.deepEqual(
    visual.states.construction?.clips.default?.progressFrameThresholds,
    [0, 10, 20, 30, 40, 50, 70, 100],
  );
  assert.equal(visual.states.idle?.clips.default?.frames[0]?.fileName, "hqk_0007.png");
  assert.equal(visual.states.damaged?.clips.default?.frames[0]?.fileName, "hqk_0008.png");
});

test("default theme applies the statically recovered Korean beacon identity and body states", () => {
  const visual = defaultTheme.visuals[
    defaultTheme.entityBindings.beacon
  ] as EntityVisual;

  assert.equal(
    visual.assetPath,
    "entities/korean-signal-beacon",
  );
  assert.deepEqual(
    visual.states.construction?.clips.default?.progressFrameThresholds,
    [0, 10, 20, 30, 40, 50, 70, 100],
  );
  assert.equal(
    visual.states.idle?.clips.default?.frames[0]?.fileName,
    "firehousek_0007.png",
  );
  assert.equal(
    visual.states.damaged?.clips.default?.frames[0]?.fileName,
    "firehousek_0008.png",
  );
});

test("default theme animates Japanese camp building idle frames from source sprites", () => {
  const houseVisual = defaultTheme.visuals[defaultTheme.entityBindings["japanese-camp-house"]] as EntityVisual;
  const barracksVisual = defaultTheme.visuals[defaultTheme.entityBindings["japanese-camp-barracks"]] as EntityVisual;
  const firehouseVisual = defaultTheme.visuals[defaultTheme.entityBindings["japanese-camp-firehouse"]] as EntityVisual;
  const houseOverlay = houseVisual.layers?.find((layer) => layer.id === "idle-overlay");

  assert.deepEqual(
    houseOverlay?.states.idle?.clips.default?.frames.map((frame) => frame.fileName),
    frameNames("millj", 9, 18),
  );
  assert.deepEqual(
    barracksVisual.states.idle?.clips.default?.frames.map((frame) => frame.fileName),
    frameNames("barrackj", 9, 17),
  );
  assert.deepEqual(
    firehouseVisual.states.idle?.clips.default?.frames.map((frame) => frame.fileName),
    frameNames("firehousej", 9, 19),
  );
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

function frameNames(stem: string, from: number, to: number): string[] {
  return Array.from({ length: to - from + 1 }, (_value, offset) => `${stem}_${String(from + offset).padStart(4, "0")}.png`);
}

function assertDirectionalClipStarts(
  visual: EntityVisual,
  stateName: string,
  stem: string,
  expected: Record<Facing, readonly [number, boolean]>,
): void {
  assert.deepEqual(
    Object.fromEntries(
      Object.keys(expected).map((facing) => {
        const clip = visual.states[stateName]?.clips[facing as Facing];
        return [
          facing,
          [
            clip?.frames[0]?.fileName,
            clip?.mirrorX === true,
          ],
        ];
      }),
    ),
    Object.fromEntries(
      Object.entries(expected).map(([facing, [frameIndex, mirrorX]]) => [
        facing,
        [
          `${stem}_${String(frameIndex).padStart(4, "0")}.png`,
          mirrorX,
        ],
      ]),
    ),
  );
}

function normalizeManifestSourcePath(source: string): string {
  return source.replace(/^original\/imjinrok2\//, "").replaceAll("\\", "/").toLowerCase();
}
