import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  extractK01CoreUnitAnimations,
  selectCoreUnitFrame,
} from "./extract-k01-core-unit-animations.mjs";

const root = resolve(import.meta.dirname, "../..");
const fixturePath = join(root, "analysis/fixtures/k01-core-unit-animation-vectors.json");
const paths = {
  functionsPath: join(root, "analysis/generated/imjinrok2/functions.json"),
  jumpTablesPath: join(root, "analysis/generated/imjinrok2/jump-tables.json"),
  seedsPath: join(root, "analysis/generated/imjinrok2/seeds.json"),
  swordkPath: join(root, "original/imjinrok2/char/swordk.spr"),
};

test("derives K01 classes 2/3/4 core states and quarantines state 2", () => {
  const report = extractK01CoreUnitAnimations();
  assert.equal(report.classes.length, 3);
  assert.deepEqual(
    report.classes.map(({ identity, initializerRange, states }) => ({
      internalClass: identity.internalClass,
      flags: identity.typeFlags,
      range: `${initializerRange.start}-${initializerRange.end}`,
      states: Object.fromEntries(Object.entries(states).map(([name, state]) => [name, [state.originalAnimationState, state.spriteSlot, state.frameStart, state.frameStride, state.phaseCount]])),
    })),
    [
      { internalClass: 2, flags: "0x04080805", range: "0x00429f48-0x00429feb", states: { idle: [8, 100, 128, 10, 10], move: [1, 100, 0, 8, 8], state2: [2, 100, 88, 8, 8], attack: [4, 100, 48, 8, 8], death: [7, 100, 40, 0, 8] } },
      { internalClass: 3, flags: "0x04080805", range: "0x00429fec-0x0042a09a", states: { idle: [8, 101, 0, 8, 8], move: [1, 101, 40, 8, 8], state2: [2, 101, 80, 8, 8], attack: [4, 101, 120, 8, 8], death: [7, 101, 176, 0, 8] } },
      { internalClass: 4, flags: "0x04082805", range: "0x0042a156-0x0042a204", states: { idle: [8, 102, 0, 8, 8], move: [1, 102, 80, 8, 8], state2: [2, 102, 40, 8, 8], attack: [4, 102, 120, 8, 8], death: [7, 102, 160, 0, 8] } },
    ],
  );
  assert.equal(report.evidencePoints.every(({ matched }) => matched), true);
  assert.match(report.acceptedInputScope, /state 2.*quarantined/);
  assert.deepEqual(report.testVectors, JSON.parse(readFileSync(fixturePath, "utf8")).vectors);
});

test("replays the normal direction contract and rejects unsupported gates or widths", () => {
  assert.deepEqual(selectCoreUnitFrame({ internalClass: 2, state: 8, direction: 1, phase: 9 }), {
    internalClass: 2, state: 8, stateName: "idle", direction: 1, facing: "s", phase: 9,
    spriteSlot: 100, sourcePath: "char\\swordk.spr", frameIndex: 137, mirrorX: false,
  });
  assert.equal(selectCoreUnitFrame({ internalClass: 3, state: 4, direction: 4, phase: 0 }).frameIndex, 136);
  assert.deepEqual(selectCoreUnitFrame({ internalClass: 4, state: 7, direction: 80, phase: 7 }), {
    internalClass: 4, state: 7, stateName: "death", direction: 80, facing: "ne", phase: 7,
    spriteSlot: 102, sourcePath: "char\\archerk.spr", frameIndex: 167, mirrorX: true,
  });
  assert.equal(selectCoreUnitFrame({ internalClass: 2, state: 2, direction: 1, phase: 0 }).stateName, "state2");
  assert.throws(() => selectCoreUnitFrame({ internalClass: 2, state: 8, direction: 1, phase: 0, entityFlags: 8 }), /bit 0x08 clear/);
  assert.throws(() => selectCoreUnitFrame({ internalClass: 3, state: 1, direction: 1, phase: 0, entityFlags: 0x80000000 }), /mask 0x80000008 clear/);
  assert.throws(() => selectCoreUnitFrame({ internalClass: 4, state: 4, direction: 1, phase: 0, attackPhaseCount: 0 }), /nonzero phase count/);
  assert.throws(() => selectCoreUnitFrame({ internalClass: 2, state: 1, direction: 1.5, phase: 0 }), /signed WORD/);
  assert.throws(() => selectCoreUnitFrame({ internalClass: 2, state: 1, direction: 0, phase: 0 }), /normal grid set/);
  assert.throws(() => selectCoreUnitFrame({ internalClass: 2, state: 8, direction: 1, phase: 10 }), /recovered 0..9/);
  assert.throws(() => selectCoreUnitFrame({ internalClass: 2, state: 3, direction: 1, phase: 0 }), /scoped set/);
  assert.throws(() => selectCoreUnitFrame({ internalClass: 5, state: 1, direction: 1, phase: 0 }), /classes 2,3,4/);
  assert.throws(() => selectCoreUnitFrame({ internalClass: 2, state: 1, direction: 1, phase: 0, entityFlags: -1 }), /unsigned DWORD/);
  assert.throws(() => selectCoreUnitFrame({ internalClass: 2, state: 4, direction: 1, phase: 0, attackPhaseCount: 0x1_0000 }), /unsigned WORD/);
});

test("rejects tampered canonical analysis and source sprite evidence", () => {
  const copyJson = (source, mutate) => {
    const path = join(mkdtempSync(join(tmpdir(), "k01-core-unit-")), "artifact.json");
    const value = JSON.parse(readFileSync(source, "utf8"));
    mutate(value);
    writeFileSync(path, `${JSON.stringify(value)}\n`);
    return path;
  };
  const functionsPath = copyJson(paths.functionsPath, (value) => {
    value.functions.find(({ entry }) => entry === "0x004390e0").instructionCount = 23;
  });
  assert.throws(() => extractK01CoreUnitAnimations({ functionsPath }), /0x004390e0 instruction count/);
  const jumpTablesPath = copyJson(paths.jumpTablesPath, (value) => {
    Object.values(value.tables).find(({ switchAddress }) => switchAddress === "0x004292b3").cases.find(({ label }) => label === 4).destination = "0x0042a205";
  });
  assert.throws(() => extractK01CoreUnitAnimations({ jumpTablesPath }), /class 4 initializer destination/);
  const seedsPath = copyJson(paths.seedsPath, (value) => {
    value.functions.find(({ entry }) => entry === "0x004291d0").instructions.find(({ address }) => address === "0x0042a1ee").text = "PUSH 0x79";
  });
  assert.throws(() => extractK01CoreUnitAnimations({ seedsPath }), /class 4 attack initializer/);
  const swordkPath = join(mkdtempSync(join(tmpdir(), "k01-core-unit-")), "swordk.spr");
  copyFileSync(paths.swordkPath, swordkPath);
  const bytes = readFileSync(swordkPath);
  bytes[bytes.length - 1] ^= 0xff;
  writeFileSync(swordkPath, bytes);
  assert.throws(() => extractK01CoreUnitAnimations({ swordkPath }), /SHA-256/);
});
