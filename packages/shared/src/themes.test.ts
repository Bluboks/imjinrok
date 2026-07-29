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
  assert.equal(defaultTheme.entityBindings["korean-monk"], "korean-monk");
  assert.equal(defaultTheme.entityBindings.archer, "korean-archer");
  assert.equal(defaultTheme.entityBindings["japanese-swordsman"], "japanese-swordsman");
  assert.equal(defaultTheme.entityBindings["japanese-gunner"], "japanese-gunner");
  assert.equal(defaultTheme.entityBindings["japanese-farmer"], "japanese-farmer");
  assert.equal(defaultTheme.entityBindings["japanese-shrine-maiden"], "japanese-shrine-maiden");
  assert.equal(defaultTheme.entityBindings["japanese-samurai"], "japanese-samurai");
  assert.equal(defaultTheme.entityBindings["japanese-turtle-tank"], "japanese-turtle-tank");
  assert.equal(defaultTheme.entityBindings["japanese-konishi"], "japanese-konishi");
  assert.equal(defaultTheme.entityBindings["japanese-camp-house"], "japanese-camp-house");
  assert.equal(defaultTheme.entityBindings["japanese-camp-barracks"], "japanese-camp-barracks");
  assert.equal(defaultTheme.entityBindings["japanese-camp-tower"], "japanese-camp-tower");
  assert.equal(defaultTheme.entityBindings["japanese-camp-firehouse"], "japanese-camp-firehouse");
  assert.equal(defaultTheme.entityBindings["japanese-camp-advanced-tower"], "japanese-camp-advanced-tower");
  assert.equal(defaultTheme.entityBindings["korean-training-command"], "korean-training-command");
  assert.equal(defaultTheme.entityBindings["japanese-hq"], "japanese-hq");
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
    { manifestPath: "entities/japanese-hq/jhq.manifest.json", sourcePath: "char/jhq.spr", tableIndex: 6 },
    { manifestPath: "entities/japanese-gunner/gunj1.manifest.json", sourcePath: "char/gunj1.spr", tableIndex: 14 },
    { manifestPath: "entities/japanese-gunner/gunj2.manifest.json", sourcePath: "char/gunj2.spr", tableIndex: 15 },
    { manifestPath: "entities/japanese-gunner/gunj3.manifest.json", sourcePath: "char/gunj3.spr", tableIndex: 16 },
    { manifestPath: "entities/japanese-farmer/Farmerj.manifest.json", sourcePath: "char/farmerj.spr", tableIndex: 45 },
    { manifestPath: "entities/korean-monk/budak.manifest.json", sourcePath: "char/budak.spr", tableIndex: 12 },
    { manifestPath: "entities/japanese-shrine-maiden/advbudaj.manifest.json", sourcePath: "char/advbudaj.spr", tableIndex: 24 },
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
    { manifestPath: "entities/korean-training-command/advbarrackk.manifest.json", sourcePath: "char/advbarrackk.spr", tableIndex: 113 },
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
  const japaneseGunnerAttackManifest = readManifest("entities/japanese-gunner/gunj2.manifest.json");
  const japaneseGunnerDeathManifest = readManifest("entities/japanese-gunner/gunj3.manifest.json");
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
  const farmerCoreFrameStarts = {
    n: 16, ne: 8, e: 0, se: 32, s: 0, sw: 8, w: 16, nw: 24,
  } as const satisfies Record<Facing, number>;
  assertDirectionalFrames(villagerVisual, "idle", { stem: "farmerk", phaseCount: 8, frameStarts: farmerCoreFrameStarts });
  assertDirectionalFrames(villagerVisual, "move", { stem: "farmerk", phaseCount: 8, frameStarts: Object.fromEntries(Object.entries(farmerCoreFrameStarts).map(([facing, frame]) => [facing, frame + 40])) as Record<Facing, number> });
  assertDirectionalFrames(villagerVisual, "death", { stem: "farmerk", phaseCount: 8, frameStarts: Object.fromEntries(Object.keys(farmerCoreFrameStarts).map((facing) => [facing, 240])) as Record<Facing, number> });
  assertDirectionalClipStarts(villagerVisual, "idle", "farmerk", { n: [16, true], ne: [8, true], e: [0, true], se: [32, false], s: [0, false], sw: [8, false], w: [16, false], nw: [24, false] });
  assertDirectionalClipStarts(villagerVisual, "move", "farmerk", { n: [56, true], ne: [48, true], e: [40, true], se: [72, false], s: [40, false], sw: [48, false], w: [56, false], nw: [64, false] });
  assertDirectionalClipStarts(villagerVisual, "death", "farmerk", { n: [240, true], ne: [240, true], e: [240, true], se: [240, false], s: [240, false], sw: [240, false], w: [240, false], nw: [240, false] });
  assert.equal(villagerVisual.states.idle?.clips.s?.loop, true);
  assert.equal(villagerVisual.states.move?.clips.s?.loop, true);
  assert.deepEqual(villagerVisual.states.walk?.clips, villagerVisual.states.move?.clips);
  assert.equal(villagerVisual.states.death?.clips.s?.loop, false);
  assertDirectionalFrames(villagerVisual, "carry", {
    stem: "farmerk",
    phaseCount: 8,
    frameStarts: { s: 80, sw: 88, w: 96, nw: 104, n: 96, ne: 88, e: 80, se: 112 },
  });
  assertDirectionalFrames(villagerVisual, "carry-idle", {
    stem: "farmerk",
    phaseCount: 1,
    frameStarts: { s: 82, sw: 90, w: 98, nw: 106, n: 98, ne: 90, e: 82, se: 114 },
  });
  assertDirectionalClipStarts(villagerVisual, "carry", "farmerk", {
    n: [96, true], ne: [88, true], e: [80, true], se: [112, false], s: [80, false], sw: [88, false], w: [96, false], nw: [104, false],
  });
  assertDirectionalClipStarts(villagerVisual, "carry-idle", "farmerk", {
    n: [98, true], ne: [90, true], e: [82, true], se: [114, false], s: [82, false], sw: [90, false], w: [98, false], nw: [106, false],
  });
  assert.equal(villagerVisual.states.carry?.clips.s?.fps, 8);
  assert.equal(villagerVisual.states.carry?.clips.s?.loop, true);
  assert.equal(villagerVisual.states["carry-idle"]?.clips.s?.fps, 1);
  assert.equal(villagerVisual.states["carry-idle"]?.clips.s?.loop, true);
  // Generic gather is a project adapter to the recovered class-7 state-10 shared source band.
  assertDirectionalFrames(villagerVisual, "gather", {
    stem: "farmerk",
    phaseCount: 8,
    frameStarts: { s: 120, sw: 120, w: 120, nw: 120, n: 120, ne: 120, e: 120, se: 120 },
  });
  assertDirectionalClipStarts(villagerVisual, "gather", "farmerk", {
    s: [120, false], sw: [120, false], w: [120, false], nw: [120, false], n: [120, true], ne: [120, true], e: [120, true], se: [120, true],
  });
  assert.deepEqual(
    [...new Set(Object.values(villagerVisual.states.gather?.clips ?? {}).flatMap((clip) => clip?.frames.map((frame) => frame.fileName) ?? []))].sort(),
    frameNames("farmerk", 120, 127),
  );
  // Generic build/repair intentionally adapt the recovered class-7 state-11 source layout;
  // this does not assign state 11 an original gameplay meaning.
  const state11SourceFrameStarts = {
    s: 160, sw: 168, w: 176, nw: 184, n: 176, ne: 168, e: 160, se: 192,
  } as const satisfies Record<Facing, number>;
  const state11SourceClipStarts = {
    s: [160, false], sw: [168, false], w: [176, false], nw: [184, false],
    n: [176, true], ne: [168, true], e: [160, true], se: [192, false],
  } as const satisfies Record<Facing, readonly [number, boolean]>;
  for (const stateName of ["build", "repair"] as const) {
    assertDirectionalFrames(villagerVisual, stateName, {
      stem: "farmerk",
      phaseCount: 8,
      frameStarts: state11SourceFrameStarts,
    });
    assertDirectionalClipStarts(villagerVisual, stateName, "farmerk", state11SourceClipStarts);
    assert.equal(villagerVisual.states[stateName]?.clips.s?.fps, 8);
    assert.equal(villagerVisual.states[stateName]?.clips.s?.loop, true);
  }

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
  assert.equal(swordsmanVisual.states.idle?.clips.n?.frames[0]?.fileName, "swordk_0148.png");
  assert.equal(swordsmanVisual.states.idle?.clips.s?.frames[0]?.fileName, "swordk_0128.png");
  assert.equal(swordsmanVisual.states.attack?.clips.n?.frames[0]?.fileName, "swordk_0064.png");
  assert.equal(swordsmanVisual.states.attack?.clips.s?.frames[0]?.fileName, "swordk_0048.png");
  assert.equal(swordsmanVisual.states.attack?.clips.e?.frames[0]?.fileName, "swordk_0048.png");
  assert.equal(swordsmanVisual.states.attack?.clips.w?.frames[0]?.fileName, "swordk_0064.png");
  assert.equal(swordsmanVisual.states.attack?.clips.w?.mirrorX, undefined);
  assert.equal(swordsmanVisual.states.death?.clips.ne?.frames[0]?.fileName, "swordk_0040.png");

  assert.equal(archerManifest.source, "original/imjinrok2/char/archerk.spr");
  assert.equal(archerManifest.frameCount, 176);
  assert.equal(archerManifest.exportedFrames.length, 176);
  assert.equal(archerVisual.states.move?.clips.s?.frames.length, 8);
  assert.equal(archerVisual.states.idle?.clips.n?.frames[0]?.fileName, "archerk_0016.png");
  assert.equal(archerVisual.states.idle?.clips.s?.frames[0]?.fileName, "archerk_0000.png");
  assert.equal(archerVisual.states.move?.clips.s?.frames[0]?.fileName, "archerk_0080.png");
  assert.equal(archerVisual.states.attack?.clips.s?.frames[0]?.fileName, "archerk_0120.png");
  assert.equal(archerVisual.states.attack?.clips.e?.frames[0]?.fileName, "archerk_0120.png");
  assert.equal(archerVisual.states.attack?.clips.w?.frames[0]?.fileName, "archerk_0136.png");
  assert.equal(archerVisual.states.attack?.clips.w?.mirrorX, undefined);
  assert.equal(archerVisual.states.death?.clips.ne?.frames[0]?.fileName, "archerk_0160.png");

  assert.equal(japaneseSwordsmanManifest.source, "original/imjinrok2/char/swordj.spr");
  assert.equal(japaneseSwordsmanManifest.frameCount, 192);
  assert.equal(japaneseSwordsmanManifest.exportedFrames.length, 192);
  assert.equal(japaneseSwordsmanVisual.states.idle?.clips.n?.frames[0]?.fileName, "swordj_0016.png");
  assert.equal(japaneseSwordsmanVisual.states.move?.clips.n?.frames[0]?.fileName, "swordj_0056.png");
  assert.equal(japaneseSwordsmanVisual.states.move?.clips.s?.frames[0]?.fileName, "swordj_0040.png");
  assert.equal(japaneseSwordsmanVisual.states.attack?.clips.s?.frames[0]?.fileName, "swordj_0120.png");
  assert.equal(japaneseSwordsmanVisual.states.attack?.clips.w?.frames[0]?.fileName, "swordj_0136.png");
  assert.equal(japaneseSwordsmanVisual.states.attack?.clips.w?.mirrorX, undefined);
  assert.equal(japaneseSwordsmanVisual.states.death?.clips.ne?.frames[0]?.fileName, "swordj_0176.png");

  assert.equal(japaneseGunnerManifest.source, "original/imjinrok2/char/gunj1.spr");
  assert.equal(japaneseGunnerManifest.frameCount, 80);
  assert.equal(japaneseGunnerManifest.exportedFrames.length, 80);
  assert.equal(japaneseGunnerAttackManifest.source, "original/imjinrok2/char/gunj2.spr");
  assert.equal(japaneseGunnerAttackManifest.exportedFrames.length, 80);
  assert.equal(japaneseGunnerDeathManifest.source, "original/imjinrok2/char/gunj3.spr");
  assert.equal(japaneseGunnerDeathManifest.exportedFrames.length, 80);
  assert.equal(japaneseGunnerVisual.states.idle?.clips.n?.frames[0]?.fileName, "gunj1_0016.png");
  assert.equal(japaneseGunnerVisual.states.idle?.clips.s?.frames[0]?.fileName, "gunj1_0000.png");
  assert.equal(japaneseGunnerVisual.states.idle?.clips.n?.mirrorX, true);
  assert.equal(japaneseGunnerVisual.states.move?.clips.n?.frames[0]?.fileName, "gunj1_0056.png");
  assert.equal(japaneseGunnerVisual.states.move?.clips.s?.frames[0]?.fileName, "gunj1_0040.png");
  assert.equal(japaneseGunnerVisual.states.attack?.clips.s?.frames[0]?.fileName, "gunj2_0000.png");
  assert.equal(japaneseGunnerVisual.states.attack?.clips.w?.frames[0]?.fileName, "gunj2_0016.png");
  assert.equal(japaneseGunnerVisual.states.attack?.clips.w?.mirrorX, undefined);
  assert.equal(japaneseGunnerVisual.states.attack?.clips.e?.mirrorX, true);
  assert.equal(japaneseGunnerVisual.states.attack?.clips.s?.loop, false);
  assert.equal(japaneseGunnerVisual.states.death?.clips.ne?.frames[0]?.fileName, "gunj3_0060.png");
  assert.equal(japaneseGunnerVisual.states.death?.clips.ne?.mirrorX, true);

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

test("Japanese gunner uses the statically recovered class-12 core-state frame blocks", () => {
  const visual = defaultTheme.visuals[
    defaultTheme.entityBindings["japanese-gunner"]
  ] as EntityVisual;
  assert.deepEqual(
    Object.keys(visual.states).sort(),
    ["idle", "move", "walk", "attack", "death"].sort(),
  );
  assertDirectionalFrames(visual, "idle", {
    stem: "gunj1",
    phaseCount: 8,
    frameStarts: { s: 0, sw: 8, w: 16, nw: 24, n: 16, ne: 8, e: 0, se: 32 },
  });
  assertDirectionalFrames(visual, "move", {
    stem: "gunj1",
    phaseCount: 8,
    frameStarts: { s: 40, sw: 48, w: 56, nw: 64, n: 56, ne: 48, e: 40, se: 72 },
  });
  assertDirectionalFrames(visual, "attack", {
    stem: "gunj2",
    phaseCount: 8,
    frameStarts: { s: 0, sw: 8, w: 16, nw: 24, n: 16, ne: 8, e: 0, se: 32 },
  });
  assertDirectionalFrames(visual, "death", {
    stem: "gunj3",
    phaseCount: 8,
    frameStarts: { s: 60, sw: 60, w: 60, nw: 60, n: 60, ne: 60, e: 60, se: 60 },
  });
  assert.deepEqual(visual.states.walk, visual.states.move);
  for (const state of ["idle", "move", "walk", "attack", "death"] as const) {
    const clips = visual.states[state]?.clips;
    assert.equal(clips?.n?.mirrorX, true);
    assert.equal(clips?.ne?.mirrorX, true);
    assert.equal(clips?.e?.mirrorX, true);
    for (const facing of ["s", "sw", "w", "nw", "se"] as const) {
      assert.equal(clips?.[facing]?.mirrorX, undefined);
    }
  }
  assert.equal(visual.states.idle?.clips.s?.loop, true);
  assert.equal(visual.states.move?.clips.s?.loop, true);
  assert.equal(visual.states.walk?.clips.s?.loop, true);
  assert.equal(visual.states.attack?.clips.s?.loop, false);
  assert.equal(visual.states.death?.clips.s?.loop, false);
});

test("Japanese farmer uses the recovered resource-work and carrying frames and omits unresolved attack frames", () => {
  const manifest = readManifest("entities/japanese-farmer/Farmerj.manifest.json");
  const visual = defaultTheme.visuals[defaultTheme.entityBindings["japanese-farmer"]] as EntityVisual;

  assert.equal(manifest.source, "original/imjinrok2/char/Farmerj.spr");
  assert.equal(manifest.frameCount, 248);
  assert.equal(manifest.exportedFrames.length, 248);
  assert.deepEqual(Object.keys(visual.states).sort(), ["carry", "carry-idle", "death", "gather", "idle", "move", "walk"]);
  assertDirectionalFrames(visual, "idle", {
    stem: "Farmerj",
    phaseCount: 8,
    frameStarts: { s: 0, sw: 8, w: 16, nw: 24, n: 16, ne: 8, e: 0, se: 32 },
  });
  assertDirectionalFrames(visual, "move", {
    stem: "Farmerj",
    phaseCount: 8,
    frameStarts: { s: 160, sw: 168, w: 176, nw: 184, n: 176, ne: 168, e: 160, se: 192 },
  });
  assertDirectionalFrames(visual, "gather", {
    stem: "Farmerj",
    phaseCount: 8,
    frameStarts: { s: 40, sw: 40, w: 40, nw: 40, n: 40, ne: 40, e: 40, se: 40 },
  });
  assertDirectionalClipStarts(visual, "gather", "Farmerj", {
    s: [40, false], sw: [40, false], w: [40, false], nw: [40, false], n: [40, true], ne: [40, true], e: [40, true], se: [40, true],
  });
  assertDirectionalFrames(visual, "carry", {
    stem: "Farmerj",
    phaseCount: 8,
    frameStarts: { s: 200, sw: 208, w: 216, nw: 224, n: 216, ne: 208, e: 200, se: 232 },
  });
  assertDirectionalFrames(visual, "carry-idle", {
    stem: "Farmerj",
    phaseCount: 8,
    frameStarts: { s: 200, sw: 208, w: 216, nw: 224, n: 216, ne: 208, e: 200, se: 232 },
  });
  assertDirectionalClipStarts(visual, "carry", "Farmerj", {
    n: [216, true], ne: [208, true], e: [200, true], se: [232, false], s: [200, false], sw: [208, false], w: [216, false], nw: [224, false],
  });
  assertDirectionalClipStarts(visual, "carry-idle", "Farmerj", {
    n: [216, true], ne: [208, true], e: [200, true], se: [232, false], s: [200, false], sw: [208, false], w: [216, false], nw: [224, false],
  });
  assertDirectionalFrames(visual, "death", {
    stem: "Farmerj",
    phaseCount: 8,
    frameStarts: { s: 240, sw: 240, w: 240, nw: 240, n: 240, ne: 240, e: 240, se: 240 },
  });
  assert.deepEqual(visual.states.walk, visual.states.move);
  assert.equal(visual.states.attack, undefined);
  assert.equal(visual.states.idle?.clips.s?.loop, true);
  assert.equal(visual.states.move?.clips.s?.loop, true);
  assert.equal(visual.states.carry?.clips.s?.loop, true);
  assert.equal(visual.states.carry?.clips.s?.fps, 8);
  assert.deepEqual(visual.states["carry-idle"], visual.states.carry);
  assert.equal(visual.states.death?.clips.s?.loop, false);
});

test("K01 classes 2, 3, and 4 use only the recovered normal core-state frame blocks", () => {
  const expectations = [
    ["swordsman", "swordk", { idle: [128, 10], move: [0, 8], attack: [48, 8], death: [40, 0] }],
    ["japanese-swordsman", "swordj", { idle: [0, 8], move: [40, 8], attack: [120, 8], death: [176, 0] }],
    ["archer", "archerk", { idle: [0, 8], move: [80, 8], attack: [120, 8], death: [160, 0] }],
  ] as const;
  const directionIndexes = { s: 0, sw: 1, w: 2, nw: 3, n: 2, ne: 1, e: 0, se: 4 } as const;

  for (const [binding, stem, states] of expectations) {
    const visual = defaultTheme.visuals[defaultTheme.entityBindings[binding]] as EntityVisual;
    assert.deepEqual(Object.keys(visual.states).sort(), ["idle", "move", "walk", "attack", "death"].sort());
    for (const [stateName, [start, stride]] of Object.entries(states)) {
      const phaseCount = binding === "swordsman" && stateName === "idle" ? 10 : 8;
      const state = visual.states[stateName as "idle" | "move" | "attack" | "death"];
      assert.ok(state);
      for (const [facing, directionIndex] of Object.entries(directionIndexes) as [Facing, number][]) {
        const clip = state.clips[facing];
        const first = `${stem}_${String(start + directionIndex * stride).padStart(4, "0")}.png`;
        assert.equal(clip?.frames[0]?.fileName, first);
        assert.equal(clip?.frames.length, phaseCount);
        assert.equal(clip?.mirrorX === true, ["n", "ne", "e"].includes(facing));
      }
    }
    assert.deepEqual(visual.states.walk, visual.states.move);
    assert.equal(visual.states.idle?.clips.s?.loop, true);
    assert.equal(visual.states.move?.clips.s?.loop, true);
    assert.equal(visual.states.walk?.clips.s?.loop, true);
    assert.equal(visual.states.attack?.clips.s?.loop, false);
    assert.equal(visual.states.death?.clips.s?.loop, false);
  }
});

test("K01 class 11 monk and class 16 shrine maiden use only their recovered core frame blocks", () => {
  const expectations = [
    ["korean-monk", "budak", 140, { idle: [100, 8, 8], move: [0, 8, 8], attack: [50, 10, 10], death: [40, 0, 8] }],
    ["japanese-shrine-maiden", "advbudaj", 300, { idle: [120, 8, 8], move: [0, 8, 8], attack: [60, 10, 10], death: [40, 0, 8] }],
  ] as const;
  const directionIndexes = { s: 0, sw: 1, w: 2, nw: 3, n: 2, ne: 1, e: 0, se: 4 } as const;

  for (const [binding, stem, frameCount, states] of expectations) {
    const manifest = readManifest(`entities/${binding}/${stem}.manifest.json`);
    const visual = defaultTheme.visuals[defaultTheme.entityBindings[binding]] as EntityVisual;
    assert.equal(manifest.source, `original/imjinrok2/char/${stem}.spr`);
    assert.equal(manifest.frameCount, frameCount);
    assert.equal(manifest.exportedFrames.length, binding === "japanese-shrine-maiden" ? 160 : frameCount);
    assert.deepEqual(Object.keys(visual.states).sort(), ["idle", "move", "walk", "attack", "death"].sort());
    for (const [stateName, [start, stride, phaseCount]] of Object.entries(states)) {
      const state = visual.states[stateName as "idle" | "move" | "attack" | "death"];
      assert.ok(state);
      for (const [facing, directionIndex] of Object.entries(directionIndexes) as [Facing, number][]) {
        const clip = state.clips[facing];
        assert.equal(clip?.frames[0]?.fileName, `${stem}_${String(start + directionIndex * stride).padStart(4, "0")}.png`);
        assert.equal(clip?.frames.length, phaseCount);
        assert.equal(clip?.mirrorX === true, ["n", "ne", "e"].includes(facing));
      }
    }
    assert.deepEqual(visual.states.walk, visual.states.move);
    assert.equal(visual.states.idle?.clips.s?.loop, true);
    assert.equal(visual.states.move?.clips.s?.loop, true);
    assert.equal(visual.states.attack?.clips.s?.loop, false);
    assert.equal(visual.states.death?.clips.s?.loop, false);
  }
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
  stateName: string,
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

test("Japanese Konishi uses the statically recovered core-state frame blocks", () => {
  const manifests = [
    ["generalj11", 49],
    ["generalj12", 36],
    ["generalj13", 54],
  ].map(([stem, frameCount]) => ({
    stem,
    frameCount,
    manifest: readManifest(
      `entities/japanese-konishi/${stem}.manifest.json`,
    ),
  }));
  for (const { stem, frameCount, manifest } of manifests) {
    assert.equal(manifest.source, `original/imjinrok2/char/${stem}.spr`);
    assert.equal(manifest.frameCount, frameCount);
    assert.equal(manifest.exportedFrames.length, frameCount);
  }

  const visual = defaultTheme.visuals[
    defaultTheme.entityBindings["japanese-konishi"]
  ] as EntityVisual;
  assert.deepEqual(
    Object.keys(visual.states).sort(),
    ["idle", "move", "walk", "attack", "death"].sort(),
  );
  assertDirectionalFrames(visual, "idle", {
    stem: "generalj12",
    phaseCount: 6,
    frameStarts: { s: 0, sw: 6, w: 12, nw: 18, n: 12, ne: 6, e: 0, se: 24 },
  });
  assertDirectionalFrames(visual, "move", {
    stem: "generalj11",
    phaseCount: 8,
    frameStarts: { s: 0, sw: 8, w: 16, nw: 24, n: 16, ne: 8, e: 0, se: 32 },
  });
  assert.deepEqual(visual.states.walk, visual.states.move);
  assertDirectionalFrames(visual, "attack", {
    stem: "generalj13",
    phaseCount: 10,
    frameStarts: { s: 0, sw: 10, w: 20, nw: 30, n: 20, ne: 10, e: 0, se: 40 },
  });
  assertDirectionalFrames(visual, "death", {
    stem: "generalj11",
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
    for (const facing of ["s", "sw", "w", "nw", "se"] as const) {
      assert.equal(clips?.[facing]?.mirrorX, undefined);
    }
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
      idleFrame: "millk_0007.png",
      completeFrame: "millk_0008.png",
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

test("default theme binds newly identified opening buildings to only their proven base frames", () => {
  const expectations = [
    {
      binding: "korean-training-command",
      manifestPath: "entities/korean-training-command/advbarrackk.manifest.json",
      source: "original/imjinrok2/char/advbarrackk.spr",
      dimensions: { width: 137, height: 118 },
      idleFrame: "advbarrackk_0007.png",
    },
    {
      binding: "japanese-hq",
      manifestPath: "entities/japanese-hq/jhq.manifest.json",
      source: "original/imjinrok2/char/jhq.spr",
      dimensions: { width: 120, height: 133 },
      idleFrame: "jhq_0007.png",
    },
    {
      binding: "japanese-camp-barracks",
      manifestPath: "entities/japanese-camp-barracks/barrackj.manifest.json",
      source: "original/imjinrok2/char/barrackj.spr",
      dimensions: { width: 125, height: 110 },
      idleFrame: "barrackj_0007.png",
    },
    {
      binding: "japanese-camp-tower",
      manifestPath: "entities/japanese-camp-tower/towerj.manifest.json",
      source: "original/imjinrok2/char/towerj.spr",
      dimensions: { width: 71, height: 98 },
      idleFrame: "towerj_0007.png",
    },
  ] as const;

  for (const expectation of expectations) {
    const visual = defaultTheme.visuals[defaultTheme.entityBindings[expectation.binding]] as EntityVisual;
    const manifest = readManifest(expectation.manifestPath);

    assert.equal(manifest.source, expectation.source);
    assert.deepEqual({ width: manifest.width, height: manifest.height }, expectation.dimensions);
    assert.equal(visual.states.idle?.clips.default?.frames[0]?.fileName, expectation.idleFrame);
    assert.equal(visual.states.construction, undefined);
    assert.equal(visual.states.damaged, undefined);
    assert.equal(visual.layers, undefined);
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
  const firehouseVisual = defaultTheme.visuals[defaultTheme.entityBindings["japanese-camp-firehouse"]] as EntityVisual;
  const houseOverlay = houseVisual.layers?.find((layer) => layer.id === "idle-overlay");

  assert.deepEqual(
    houseOverlay?.states.idle?.clips.default?.frames.map((frame) => frame.fileName),
    frameNames("millj", 9, 18),
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
  width: number;
  height: number;
  frameCount: number;
  exportedFrames: readonly unknown[];
} {
  return JSON.parse(readFileSync(join(defaultThemeAssetRoot, relativePath), "utf8")) as {
    source: string;
    width: number;
    height: number;
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
