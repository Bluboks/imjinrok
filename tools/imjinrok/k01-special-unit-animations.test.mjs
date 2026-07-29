import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  extractK01SpecialUnitAnimations,
  selectK01SpecialUnitFrame,
} from "./extract-k01-special-unit-animations.mjs";

const root = resolve(import.meta.dirname, "../..");
const fixturePath = join(root, "analysis/fixtures/k01-special-unit-animation-vectors.json");
const paths = {
  functionsPath: join(root, "analysis/generated/imjinrok2/functions.json"),
  jumpTablesPath: join(root, "analysis/generated/imjinrok2/jump-tables.json"),
  seedsPath: join(root, "analysis/generated/imjinrok2/seeds.json"),
  budakPath: join(root, "original/imjinrok2/char/budak.spr"),
};

test("derives K01 monk and shrine-maiden core states from canonical catalog, map, sprites, and initializer calls", () => {
  const report = extractK01SpecialUnitAnimations();

  assert.deepEqual(
    report.classes.map(({ identity, initializerRange, states, mapRecords }) => ({
      internalClass: identity.internalClass,
      name: identity.originalGameplayName,
      projectKind: identity.projectKind,
      range: `${initializerRange.start}-${initializerRange.end}`,
      states: Object.fromEntries(Object.entries(states).map(([name, state]) => [name, [state.originalAnimationState, state.spriteSlot, state.frameStart, state.frameStride, state.phaseCount]])),
      mapRecords,
    })),
    [
      { internalClass: 11, name: "조선 승병", projectKind: "korean-monk", range: "0x0042a520-0x0042a5d4", states: { idle: [8, 112, 100, 8, 8], move: [1, 112, 0, 8, 8], attack: [4, 112, 50, 10, 10], death: [7, 112, 40, 0, 8] }, mapRecords: [{ rawOwnerWord: 0, sourcePosition: { x: 9, y: 11 }, projectKind: "korean-monk", identityMapping: "exact-static-identity-source" }, { rawOwnerWord: 0, sourcePosition: { x: 7, y: 10 }, projectKind: "korean-monk", identityMapping: "exact-static-identity-source" }] },
      { internalClass: 16, name: "일본 무녀", projectKind: "japanese-shrine-maiden", range: "0x0042a5d5-0x0042a689", states: { idle: [8, 124, 120, 8, 8], move: [1, 124, 0, 8, 8], attack: [4, 124, 60, 10, 10], death: [7, 124, 40, 0, 8] }, mapRecords: [{ rawOwnerWord: 1, sourcePosition: { x: 11, y: 54 }, projectKind: "japanese-shrine-maiden", identityMapping: "exact-static-identity-source" }] },
    ],
  );
  assert.deepEqual(report.testVectors, JSON.parse(readFileSync(fixturePath, "utf8")).vectors);
});

test("replays exact normal direction frame and mirror selection for the scoped states", () => {
  assert.deepEqual(selectK01SpecialUnitFrame({ internalClass: 11, state: 4, direction: 20, phase: 9 }), {
    internalClass: 11, state: 4, stateName: "attack", direction: 20, facing: "nw", phase: 9,
    spriteSlot: 112, sourcePath: "char\\budak.spr", frameIndex: 89, mirrorX: false,
  });
  assert.deepEqual(selectK01SpecialUnitFrame({ internalClass: 16, state: 8, direction: 80, phase: 7 }), {
    internalClass: 16, state: 8, stateName: "idle", direction: 80, facing: "ne", phase: 7,
    spriteSlot: 124, sourcePath: "char\\advbudaj.spr", frameIndex: 135, mirrorX: true,
  });
  assert.equal(selectK01SpecialUnitFrame({ internalClass: 16, state: 7, direction: 64, phase: 0 }).frameIndex, 40);
  assert.throws(() => selectK01SpecialUnitFrame({ internalClass: 11, state: 2, direction: 1, phase: 0 }), /scoped set/);
  assert.throws(() => selectK01SpecialUnitFrame({ internalClass: 16, state: 1, direction: 0, phase: 0 }), /normal grid set/);
  assert.throws(() => selectK01SpecialUnitFrame({ internalClass: 11, state: 4, direction: 1, phase: 10 }), /recovered 0..9/);
});

test("rejects tampered canonical function, initializer, map, and source sprite evidence", (t) => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "k01-special-unit-"));
  t.after(() => rmSync(temporaryDirectory, { recursive: true, force: true }));
  const copyJson = (source, mutate) => {
    const path = join(temporaryDirectory, `${Math.random()}.json`);
    const value = JSON.parse(readFileSync(source, "utf8"));
    mutate(value);
    writeFileSync(path, `${JSON.stringify(value)}\n`);
    return path;
  };
  const functionsPath = copyJson(paths.functionsPath, (value) => {
    value.functions.find(({ entry }) => entry === "0x004390e0").instructionCount = 23;
  });
  assert.throws(() => extractK01SpecialUnitAnimations({ functionsPath }), /0x004390e0 instruction count/);
  const jumpTablesPath = copyJson(paths.jumpTablesPath, (value) => {
    Object.values(value.tables).find(({ switchAddress }) => switchAddress === "0x004292b3").cases.find(({ label }) => label === 16).destination = "0x0042a68a";
  });
  assert.throws(() => extractK01SpecialUnitAnimations({ jumpTablesPath }), /class 16 initializer destination/);
  const seedsPath = copyJson(paths.seedsPath, (value) => {
    value.functions.find(({ entry }) => entry === "0x004291d0").instructions.find(({ address }) => address === "0x0042a653").text = "PUSH 0xb";
  });
  assert.throws(() => extractK01SpecialUnitAnimations({ seedsPath }), /class 16 attack initializer/);
  const mapPath = join(temporaryDirectory, "k01.map");
  copyFileSync(join(root, "original/imjinrok2/stagemap/k01.map"), mapPath);
  const mapBytes = readFileSync(mapPath);
  mapBytes[10] ^= 1;
  writeFileSync(mapPath, mapBytes);
  assert.throws(() => extractK01SpecialUnitAnimations({ mapPath }), /K01 map SHA-256/);
  const budakPath = join(temporaryDirectory, "budak.spr");
  copyFileSync(paths.budakPath, budakPath);
  const spriteBytes = readFileSync(budakPath);
  spriteBytes[spriteBytes.length - 1] ^= 0xff;
  writeFileSync(budakPath, spriteBytes);
  assert.throws(() => extractK01SpecialUnitAnimations({ budakPath }), /SHA-256/);
});
