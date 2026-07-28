import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test, { after } from "node:test";

import {
  KONISHI_DIRECTION_PROFILES,
  extractK01KonishiAnimationPilot,
  selectKonishiFrame,
} from "./extract-k01-konishi-animation-pilot.mjs";

const root = resolve(import.meta.dirname, "../..");
const paths = {
  executablePath: resolve(root, "original/imjinrok2/imjinrok2.exe"),
  functionsPath: resolve(root, "analysis/generated/imjinrok2/functions.json"),
  jumpTablesPath: resolve(root, "analysis/generated/imjinrok2/jump-tables.json"),
  seedsPath: resolve(root, "analysis/generated/imjinrok2/seeds.json"),
  primarySpritePath: resolve(root, "original/imjinrok2/char/generalj11.spr"),
  idleSpritePath: resolve(root, "original/imjinrok2/char/generalj12.spr"),
  attackSpritePath: resolve(root, "original/imjinrok2/char/generalj13.spr"),
};
const temporaryDirectories = new Set();
after(() => {
  for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true });
});

test("extracts class 82 identity, three SPR slots, initializers, and normal gates", () => {
  const report = extractReport();
  assert.equal(report.analysisStatus, "static-confirmed");
  assert.equal(report.reproductionStatus, "reproduction-complete");
  assert.deepEqual(report.identity, {
    internalClass: 82,
    originalGameplayName: "일본 고니시",
    typeRecordAddress: "0x00889868",
    typeFlags: "0x00880805",
    primarySpriteSlot: 165,
    primarySourcePath: "char\\generalj11.spr",
  });
  assert.deepEqual(
    Object.fromEntries(Object.entries(report.sources.sprites).map(([name, sprite]) => [name, {
      slot: sprite.slot,
      tableIndex: sprite.tableIndex,
      pointerCell: sprite.pointerCell,
      sourcePointer: sprite.sourcePointer,
      sourcePath: sprite.sourcePath,
      sha256: sprite.sha256,
      dimensions: [sprite.width, sprite.height, sprite.frameCount],
    }])),
    {
      primary: { slot: 165, tableIndex: 65, pointerCell: "0x004bc328", sourcePointer: "0x004bcd6c", sourcePath: "char\\generalj11.spr", sha256: "eff3f8eb3a60c50ea6ac534d90e568bac415526a00f6ca2e287e00bfdf4bb03f", dimensions: [140, 108, 49] },
      idle: { slot: 166, tableIndex: 66, pointerCell: "0x004bc32c", sourcePointer: "0x004bcd58", sourcePath: "char\\generalj12.spr", sha256: "914ea581e7ba8ad7d972e19f5089478de0391be1c79288a2f711a238dc28b44f", dimensions: [140, 108, 36] },
      attack: { slot: 167, tableIndex: 67, pointerCell: "0x004bc330", sourcePointer: "0x004bcd44", sourcePath: "char\\generalj13.spr", sha256: "43322afcb8f5c90e63925efc2de647a36c5d3663d8a8638bc814a05c241a8b91", dimensions: [140, 108, 54] },
    },
  );
  assert.deepEqual(report.initialTypeFlags, {
    value: "0x00880805",
    state1MaskValue: "0x00000000",
    alternateMovementEligibilityMaskValue: "0x00000000",
    idleSpecialMaskValue: "0x00000000",
    attackSpecialMaskValue: "0x00000000",
    normalCoreStatePathsSelected: true,
    laterRuntimeMutation: "unresolved",
  });
  assert.equal(report.functionEvidence.length, 11);
  assert.equal(report.evidencePoints.every(({ matched }) => matched), true);
  for (const sprite of Object.values(report.sources.sprites)) {
    assert.equal("frames" in sprite, false);
    assert.equal("endOffset" in sprite, false);
  }
});

test("proves class 82 attack uses the out-of-range default route without an invented case", () => {
  const report = extractReport();
  assert.deepEqual(report.attackDispatch, {
    wrapperFunction: "0x0041e370",
    switchAddress: "0x0041e385",
    internalClass: 82,
    normalizedClass: 77,
    maximumSwitchIndex: 32,
    hasExplicitCase82: false,
    defaultGate: "0x0041e3a0",
    normalConsumer: "0x0041e200",
    requiredFlagsClear: "0x80000000",
    requiredPhaseCountCondition: "WORD [entity+0x144] != 0",
  });
});

test("replays every phase for all eight facings in four scoped states", () => {
  const expected = {
    8: { phases: 6, slot: 166, starts: { s: 0, sw: 6, w: 12, nw: 18, n: 12, ne: 6, e: 0, se: 24 } },
    1: { phases: 8, slot: 165, starts: { s: 0, sw: 8, w: 16, nw: 24, n: 16, ne: 8, e: 0, se: 32 } },
    4: { phases: 10, slot: 167, starts: { s: 0, sw: 10, w: 20, nw: 30, n: 20, ne: 10, e: 0, se: 40 } },
    7: { phases: 8, slot: 165, starts: { s: 40, sw: 40, w: 40, nw: 40, n: 40, ne: 40, e: 40, se: 40 } },
  };
  for (const [stateText, contract] of Object.entries(expected)) {
    const state = Number(stateText);
    for (const profile of KONISHI_DIRECTION_PROFILES) {
      const frames = Array.from({ length: contract.phases }, (_, phase) =>
        selectKonishiFrame({ state, direction: profile.direction, phase }),
      );
      assert.deepEqual(frames.map(({ frameIndex }) => frameIndex), Array.from({ length: contract.phases }, (_, phase) => contract.starts[profile.facing] + phase));
      assert.equal(frames[0].spriteSlot, contract.slot);
      assert.equal(frames[0].mirrorX, profile.mirrorX);
      assert.equal(frames[0].facing, profile.facing);
    }
  }
});

test("rejects out-of-scope flags, phases, directions, states, and widths", () => {
  assert.throws(() => selectKonishiFrame({ state: 1, direction: 1, phase: 0, entityFlags: 0x80880805 }), /mask 0x80000008 clear/);
  assert.throws(() => selectKonishiFrame({ state: 1, direction: 1, phase: 0, entityFlags: 0x04880805 }), /alternate mask clear/);
  assert.throws(() => selectKonishiFrame({ state: 8, direction: 1, phase: 0, entityFlags: 0x0088080d }), /bit 0x08 clear/);
  assert.throws(() => selectKonishiFrame({ state: 4, direction: 1, phase: 0, entityFlags: 0x80880805 }), /high bit clear/);
  assert.throws(() => selectKonishiFrame({ state: 4, direction: 1, phase: 0, attackPhaseCount: 0 }), /WORD \+0x144 nonzero/);
  assert.throws(() => selectKonishiFrame({ state: 2, direction: 1, phase: 0 }), /scoped set 1,4,7,8/);
  assert.throws(() => selectKonishiFrame({ state: 1, direction: 0, phase: 0 }), /recovered grid set/);
  assert.throws(() => selectKonishiFrame({ state: 8, direction: 1, phase: 6 }), /outside 0..5/);
  assert.throws(() => selectKonishiFrame({ state: 4, direction: 1, phase: 10 }), /outside 0..9/);
  assert.throws(() => selectKonishiFrame({ state: 1, direction: 0x8000, phase: 0 }), /signed WORD/);
  assert.throws(() => selectKonishiFrame({ state: 1, direction: 1, phase: 0, entityFlags: 0x1_0000_0000 }), /unsigned DWORD/);
  assert.throws(() => selectKonishiFrame({ state: 4, direction: 1, phase: 0, attackPhaseCount: 0x1_0000 }), /unsigned WORD/);
});

test("rejects tampered EXE and every scoped SPR", async (t) => {
  for (const [name, source, option] of [
    ["EXE", paths.executablePath, "executablePath"],
    ["primary", paths.primarySpritePath, "primarySpritePath"],
    ["idle", paths.idleSpritePath, "idleSpritePath"],
    ["attack", paths.attackSpritePath, "attackSpritePath"],
  ]) {
    await t.test(name, () => {
      const directory = temporaryDirectory();
      const altered = join(directory, name);
      copyFileSync(source, altered);
      const bytes = readFileSync(altered);
      bytes[bytes.length - 1] ^= 0xff;
      writeFileSync(altered, bytes);
      assert.throws(() => extractReport({ [option]: altered }), /SHA-256 mismatch/);
    });
  }
});

test("rejects stale functions and tampered class, state, direction, or attack topology", async (t) => {
  await t.test("function hash", () => {
    const path = copiedJson(paths.functionsPath, (artifact) => {
      artifact.functions.find(({ entry }) => entry === "0x004390e0").instructionSha256 = "0".repeat(64);
    });
    assert.throws(() => extractReport({ functionsPath: path }), /0x004390e0 instruction SHA-256 mismatch/);
  });
  for (const [name, switchAddress, mutate, message] of [
    ["class initializer", "0x004292b3", (table) => { table.cases.find(({ label }) => label === 82).destination = "0x0042aeae"; }, /class 82 initializer destination mismatch/],
    ["state dispatch", "0x0041d21a", (table) => { table.cases.find(({ label }) => label === 7).destination = "0x0041d26c"; }, /state 7 dispatch mismatch/],
    ["idle direction", "0x0041d8a5", (table) => { table.cases.find(({ label }) => label === 1).destination = "0x0041d96b"; }, /idle raw direction 1 mismatch/],
    ["invented class 82 attack case", "0x0041e385", (table) => { table.cases.push({ label: 82, destination: "0x0041e3a0" }); }, /must use the attack out-of-range default route/],
    ["removed maximum attack class", "0x0041e385", (table) => { table.cases = table.cases.filter(({ label }) => label !== 37); }, /attack class switch maximum actual class mismatch: expected 37, got 36/],
  ]) {
    await t.test(name, () => {
      const path = copiedJson(paths.jumpTablesPath, (artifact) => {
        const table = Object.values(artifact.tables).find((candidate) => candidate.switchAddress === switchAddress);
        mutate(table);
      });
      assert.throws(() => extractReport({ jumpTablesPath: path }), message);
    });
  }
});

function extractReport(overrides = {}) {
  return extractK01KonishiAnimationPilot({ ...paths, ...overrides });
}
function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "k01-konishi-"));
  temporaryDirectories.add(directory);
  return directory;
}
function copiedJson(source, mutate) {
  const directory = temporaryDirectory();
  const path = join(directory, "artifact.json");
  const artifact = JSON.parse(readFileSync(source, "utf8"));
  mutate(artifact);
  writeFileSync(path, `${JSON.stringify(artifact)}\n`);
  return path;
}
