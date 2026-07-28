import assert from "node:assert/strict";
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  extractK01NormalReinforcementAnimationBatch,
  selectJapaneseGunnerFrame,
} from "./extract-k01-normal-reinforcement-animation-batch.mjs";

const root = resolve(import.meta.dirname, "../..");
const paths = {
  functionsPath: join(root, "analysis/generated/imjinrok2/functions.json"),
  jumpTablesPath: join(root, "analysis/generated/imjinrok2/jump-tables.json"),
  seedsPath: join(root, "analysis/generated/imjinrok2/seeds.json"),
  gunj2Path: join(root, "original/imjinrok2/char/gunj2.spr"),
};

test("derives K01 class-12 normal initializer contracts and quarantines state 2", () => {
  const report = extractK01NormalReinforcementAnimationBatch();
  assert.equal(report.identity.originalGameplayName, "일본 조총병");
  assert.equal(report.classDispatch.scopedRange, "0x0042a752-0x0042a807");
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(report.states).map(([name, state]) => [
        name,
        [
          state.originalAnimationState,
          state.spriteSlot,
          state.frameStart,
          state.frameStride,
          state.phaseCount,
        ],
      ]),
    ),
    {
      idle: [8, 114, 0, 8, 8],
      move: [1, 114, 40, 8, 8],
      state2: [2, 115, 40, 8, 8],
      attack: [4, 115, 0, 8, 8],
      death: [7, 116, 60, 0, 8],
    },
  );
  assert.equal(report.batchCrossCheck.class13.directionsMatch, true);
  assert.equal(report.batchCrossCheck.class82.directionsMatch, true);
  assert.equal(report.batchCrossCheck.class14Exception.movementAndAttackSpecial, true);
  assert.equal(report.batchCrossCheck.class14Exception.idleSpecial, false);
  assert.match(report.unresolvedScope, /state 2 environment label/);
  assert.equal(report.evidencePoints.every(({ matched }) => matched), true);
  assert.match(report.evidencePoints[0]?.rawOffset ?? "", /^0x[0-9a-f]+$/);
  assert.equal(report.testVectors.length, 80);
  for (const state of [8, 1, 2, 4, 7]) {
    const vectors = report.testVectors.filter(
      (vector) => vector.state === state && vector.phase === 0,
    );
    const expectedVectors = {
      8: [
        ["char\\gunj1.spr", 0, false], ["char\\gunj1.spr", 8, false],
        ["char\\gunj1.spr", 16, false], ["char\\gunj1.spr", 24, false],
        ["char\\gunj1.spr", 16, true], ["char\\gunj1.spr", 8, true],
        ["char\\gunj1.spr", 0, true], ["char\\gunj1.spr", 32, false],
      ],
      1: [
        ["char\\gunj1.spr", 40, false], ["char\\gunj1.spr", 48, false],
        ["char\\gunj1.spr", 56, false], ["char\\gunj1.spr", 64, false],
        ["char\\gunj1.spr", 56, true], ["char\\gunj1.spr", 48, true],
        ["char\\gunj1.spr", 40, true], ["char\\gunj1.spr", 72, false],
      ],
      2: [
        ["char\\gunj2.spr", 40, false], ["char\\gunj2.spr", 48, false],
        ["char\\gunj2.spr", 56, false], ["char\\gunj2.spr", 64, false],
        ["char\\gunj2.spr", 56, true], ["char\\gunj2.spr", 48, true],
        ["char\\gunj2.spr", 40, true], ["char\\gunj2.spr", 72, false],
      ],
      4: [
        ["char\\gunj2.spr", 0, false], ["char\\gunj2.spr", 8, false],
        ["char\\gunj2.spr", 16, false], ["char\\gunj2.spr", 24, false],
        ["char\\gunj2.spr", 16, true], ["char\\gunj2.spr", 8, true],
        ["char\\gunj2.spr", 0, true], ["char\\gunj2.spr", 32, false],
      ],
      7: [
        ["char\\gunj3.spr", 60, false], ["char\\gunj3.spr", 60, false],
        ["char\\gunj3.spr", 60, false], ["char\\gunj3.spr", 60, false],
        ["char\\gunj3.spr", 60, true], ["char\\gunj3.spr", 60, true],
        ["char\\gunj3.spr", 60, true], ["char\\gunj3.spr", 60, false],
      ],
    };
    assert.deepEqual(
      vectors.map(({ sourcePath, frameIndex, mirrorX }) => [sourcePath, frameIndex, mirrorX]),
      expectedVectors[state],
    );
  }
});

test("replays normal shared direction sources and default gates", () => {
  assert.deepEqual(
    selectJapaneseGunnerFrame({ state: 8, direction: 16, phase: 3 }),
    {
      state: 8,
      stateName: "idle",
      direction: 16,
      facing: "n",
      phase: 3,
      spriteSlot: 114,
      sourcePath: "char\\gunj1.spr",
      frameIndex: 19,
      mirrorX: true,
    },
  );
  assert.equal(
    selectJapaneseGunnerFrame({ state: 1, direction: 65, phase: 7 }).frameIndex,
    79,
  );
  assert.equal(
    selectJapaneseGunnerFrame({ state: 4, direction: 4, phase: 0 }).sourcePath,
    "char\\gunj2.spr",
  );
  assert.deepEqual(
    selectJapaneseGunnerFrame({ state: 7, direction: 80, phase: 6 }).frameIndex,
    66,
  );
  assert.equal(
    selectJapaneseGunnerFrame({ state: 2, direction: 1, phase: 0 }).stateName,
    "state2",
  );
  assert.throws(
    () =>
      selectJapaneseGunnerFrame({
        state: 1,
        direction: 1,
        phase: 0,
        entityFlags: 0x80000000,
      }),
    /normal path/,
  );
  assert.throws(
    () => selectJapaneseGunnerFrame({ state: 4, direction: 1, phase: 0, attackPhaseCount: 0 }),
    /attack normal path/,
  );
  assert.throws(
    () => selectJapaneseGunnerFrame({ state: 1, direction: 1.5, phase: 0 }),
    /signed WORD/,
  );
  assert.throws(
    () => selectJapaneseGunnerFrame({ state: 1, direction: 0, phase: 0 }),
    /normal grid set/,
  );
  assert.throws(
    () => selectJapaneseGunnerFrame({ state: 1, direction: 1, phase: -1 }),
    /recovered 0..7/,
  );
  assert.throws(
    () => selectJapaneseGunnerFrame({ state: 1, direction: 1, phase: 8 }),
    /recovered 0..7/,
  );
  assert.throws(
    () => selectJapaneseGunnerFrame({ state: 3, direction: 1, phase: 0 }),
    /scoped set/,
  );
  assert.throws(
    () => selectJapaneseGunnerFrame({ state: 1, direction: 1, phase: 0, entityFlags: -1 }),
    /unsigned DWORD/,
  );
  assert.throws(
    () =>
      selectJapaneseGunnerFrame({
        state: 4,
        direction: 1,
        phase: 0,
        attackPhaseCount: 0x1_0000,
      }),
    /unsigned WORD/,
  );
});

test("rejects canonical artifact, initializer, jump, and gunj2 tampering", () => {
  const copyJson = (source, mutate) => {
    const path = join(mkdtempSync(join(tmpdir(), "k01-normal-")), "artifact.json");
    const value = JSON.parse(readFileSync(source, "utf8"));
    mutate(value);
    writeFileSync(path, `${JSON.stringify(value)}\n`);
    return path;
  };
  const tamperedFunctionsPath = copyJson(paths.functionsPath, (value) => {
    value.functions.find(({ entry }) => entry === "0x00438e50").instructionCount = 23;
  });
  assert.throws(
    () => extractK01NormalReinforcementAnimationBatch({ functionsPath: tamperedFunctionsPath }),
    /0x00438e50 instruction count/,
  );
  const tamperedJumpTablesPath = copyJson(paths.jumpTablesPath, (value) => {
    const classSwitch = Object.values(value.tables).find(
      ({ switchAddress }) => switchAddress === "0x004292b3",
    );
    classSwitch.cases.find(({ label }) => label === 12).destination = "0x0042a808";
  });
  assert.throws(
    () => extractK01NormalReinforcementAnimationBatch({ jumpTablesPath: tamperedJumpTablesPath }),
    /class 12 initializer destination/,
  );
  const tamperedSeedsPath = copyJson(paths.seedsPath, (value) => {
    const initializer = value.functions.find(({ entry }) => entry === "0x004291d0");
    initializer.instructions.find(({ address }) => address === "0x0042a76a").text = "PUSH 0x29";
  });
  assert.throws(
    () => extractK01NormalReinforcementAnimationBatch({ seedsPath: tamperedSeedsPath }),
    /class 12 derived normal initializers/,
  );
  const altered = join(mkdtempSync(join(tmpdir(), "k01-normal-")), "gunj2.spr");
  copyFileSync(paths.gunj2Path, altered);
  const bytes = readFileSync(altered);
  bytes[bytes.length - 1] ^= 0xff;
  writeFileSync(altered, bytes);
  assert.throws(
    () => extractK01NormalReinforcementAnimationBatch({ gunj2Path: altered }),
    /SHA-256/,
  );
});
