import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  extractK01KoreanFarmerCoreFrames,
  selectK01KoreanFarmerCoreFrame,
} from "./extract-k01-korean-farmer-core-frames.mjs";

const root = resolve(import.meta.dirname, "../..");
const fixturePath = join(root, "analysis/fixtures/k01-korean-farmer-core-frame-vectors.json");
const paths = {
  functionsPath: join(root, "analysis/generated/imjinrok2/functions.json"),
  jumpTablesPath: join(root, "analysis/generated/imjinrok2/jump-tables.json"),
  referencesPath: join(root, "analysis/generated/imjinrok2/references.json"),
  seedsPath: join(root, "analysis/generated/imjinrok2/seeds.json"),
  mapPath: join(root, "original/imjinrok2/stagemap/k01.map"),
  farmerkPath: join(root, "original/imjinrok2/char/farmerk.spr"),
};

test("derives K01 class-7 creation-default core frames from canonical map, creator, helpers, and sprite", () => {
  const report = extractK01KoreanFarmerCoreFrames();

  assert.deepEqual(report.identity, {
    internalClass: 7,
    originalGameplayName: "조선 농부",
    typeRecordAddress: "0x00883724",
    typeFlags: "0x000a0801",
    spriteSlot: 105,
    sourcePath: "char\\farmerk.spr",
  });
  assert.deepEqual(report.sources.map.activeClass7Owner0Records, [
    { rawOwnerWord: 0, sourcePosition: { x: 7, y: 6 } },
    { rawOwnerWord: 0, sourcePosition: { x: 8, y: 6 } },
  ]);
  assert.deepEqual(report.creationDefault.result, {
    field: "+0x47a", value: 0, status: "creation-default-static-confirmed",
  });
  assert.deepEqual(report.creationDefault.creator.subrecordZeroer, {
    callVa: "0x00437962", ecx: "ESI+0x45c", functionEntry: "0x004550c0", dwordCount: 14, byteCount: 56, coversField: "+0x47a",
  });
  assert.deepEqual(
    Object.fromEntries(Object.entries(report.states).map(([name, state]) => [name, [state.originalAnimationState, state.frameStart, state.frameStride, state.phaseCount, state.loop]])),
    {
      idle: [8, 0, 8, 8, true],
      move: [1, 40, 8, 8, true],
      death: [7, 240, 0, 8, false],
    },
  );
  assert.deepEqual(report.initializer.death, {
    helper: "0x004390b0", callCount: 5, frameStart: 240, phaseCount: 8, spriteSlot: 105,
  });
  assert.deepEqual(report.testVectors, JSON.parse(readFileSync(fixturePath, "utf8")).vectors);
});

test("replays state 8/1/7 direction, mirror, and boundary-phase vectors", () => {
  assert.deepEqual(selectK01KoreanFarmerCoreFrame({ state: 8, direction: 16, phase: 7 }), {
    internalClass: 7, state: 8, stateName: "idle", direction: 16, facing: "n", phase: 7,
    spriteSlot: 105, sourcePath: "char\\farmerk.spr", frameIndex: 23, mirrorX: true,
  });
  assert.deepEqual(selectK01KoreanFarmerCoreFrame({ state: 1, direction: 5, phase: 0 }), {
    internalClass: 7, state: 1, stateName: "move", direction: 5, facing: "sw", phase: 0,
    spriteSlot: 105, sourcePath: "char\\farmerk.spr", frameIndex: 48, mirrorX: false,
  });
  assert.deepEqual(selectK01KoreanFarmerCoreFrame({ state: 7, direction: 64, phase: 7 }), {
    internalClass: 7, state: 7, stateName: "death", direction: 64, facing: "e", phase: 7,
    spriteSlot: 105, sourcePath: "char\\farmerk.spr", frameIndex: 247, mirrorX: true,
  });
  assert.throws(() => selectK01KoreanFarmerCoreFrame({ state: 4, direction: 1, phase: 0 }), /scoped set/);
  assert.throws(() => selectK01KoreanFarmerCoreFrame({ state: 1, direction: 1, phase: 8 }), /recovered 0..7/);
  assert.throws(() => selectK01KoreanFarmerCoreFrame({ state: 8, direction: 0, phase: 0 }), /normal grid set/);
  assert.throws(() => selectK01KoreanFarmerCoreFrame({ state: 1, direction: 1, phase: 0, resourceField: 1 }), /resourceField must be zero/);
  assert.throws(() => selectK01KoreanFarmerCoreFrame({ state: 1, direction: 1.5, phase: 0 }), /signed WORD/);
});

test("rejects tampered canonical function, switch, reference, seed, map, and sprite evidence", (t) => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "k01-korean-farmer-core-"));
  t.after(() => rmSync(temporaryDirectory, { recursive: true, force: true }));
  let artifactIndex = 0;
  const copyJson = (source, mutate) => {
    const path = join(temporaryDirectory, `artifact-${artifactIndex}.json`);
    artifactIndex += 1;
    const value = JSON.parse(readFileSync(source, "utf8"));
    mutate(value);
    writeFileSync(path, `${JSON.stringify(value)}\n`);
    return path;
  };

  const functionsPath = copyJson(paths.functionsPath, (value) => {
    value.functions.find(({ entry }) => entry === "0x004550c0").instructionCount = 25;
  });
  assert.throws(() => extractK01KoreanFarmerCoreFrames({ functionsPath }), /0x004550c0 instruction count/);
  const jumpTablesPath = copyJson(paths.jumpTablesPath, (value) => {
    Object.values(value.tables).find(({ switchAddress }) => switchAddress === "0x00428fcc").cases.find(({ label }) => label === 7).destination = "0x00429047";
  });
  assert.throws(() => extractK01KoreanFarmerCoreFrames({ jumpTablesPath }), /class-7 switch destination/);
  const referencesPath = copyJson(paths.referencesPath, (value) => {
    value.references.find(({ from }) => from === "0x00437f29").to = "0x004291d1";
  });
  assert.throws(() => extractK01KoreanFarmerCoreFrames({ referencesPath }), /missing required call edge/);
  const seedsPath = copyJson(paths.seedsPath, (value) => {
    value.functions.find(({ entry }) => entry === "0x004291d0").instructions.find(({ address }) => address === "0x00429834").text = "MOV EDI,0x6a";
  });
  assert.throws(() => extractK01KoreanFarmerCoreFrames({ seedsPath }), /0x00429834/);
  const mapPath = join(temporaryDirectory, "k01.map");
  copyFileSync(paths.mapPath, mapPath);
  const mapBytes = readFileSync(mapPath);
  mapBytes[10] ^= 1;
  writeFileSync(mapPath, mapBytes);
  assert.throws(() => extractK01KoreanFarmerCoreFrames({ mapPath }), /K01 map SHA-256/);
  const farmerkPath = join(temporaryDirectory, "farmerk.spr");
  copyFileSync(paths.farmerkPath, farmerkPath);
  const spriteBytes = readFileSync(farmerkPath);
  spriteBytes[spriteBytes.length - 1] ^= 0xff;
  writeFileSync(farmerkPath, spriteBytes);
  assert.throws(() => extractK01KoreanFarmerCoreFrames({ farmerkPath }), /farmerk SPR SHA-256/);
});
