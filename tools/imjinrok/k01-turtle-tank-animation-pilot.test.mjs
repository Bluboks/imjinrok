import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test, { after } from "node:test";

import {
  TURTLE_TANK_GRID_PROFILES,
  TURTLE_TANK_OPAQUE_PROFILES,
  extractK01TurtleTankAnimationPilot,
  selectTurtleTankFrame,
} from "./extract-k01-turtle-tank-animation-pilot.mjs";

const root = resolve(import.meta.dirname, "../..");
const paths = {
  executablePath: resolve(root, "original/imjinrok2/imjinrok2.exe"),
  functionsPath: resolve(root, "analysis/generated/imjinrok2/functions.json"),
  jumpTablesPath: resolve(root, "analysis/generated/imjinrok2/jump-tables.json"),
  seedsPath: resolve(root, "analysis/generated/imjinrok2/seeds.json"),
  spritePath: resolve(root, "original/imjinrok2/char/ghosttankj.spr"),
};
const temporaryDirectories = new Set();
after(() => {
  for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true });
});

test("extracts class 14 identity, initializer, consumer gates, and sprite contract", () => {
  const report = extractReport();
  assert.equal(report.analysisStatus, "static-confirmed");
  assert.equal(report.reproductionStatus, "reproduction-complete");
  assert.deepEqual(report.identity, {
    internalClass: 14,
    originalGameplayName: "일본 귀갑차",
    typeRecordAddress: "0x00884038",
    typeFlags: "0x80143205",
    spriteSlot: 104,
    sourcePath: "char\\ghosttankj.spr",
  });
  assert.deepEqual(report.classDispatch, {
    functionEntry: "0x004291d0",
    switchAddress: "0x004292b3",
    class: 14,
    destination: "0x0042bae1",
    scopedBlock: "0x0042bae1-0x0042bb8c",
  });
  assert.deepEqual(report.attackDispatch, {
    wrapperFunction: "0x0041e370",
    switchAddress: "0x0041e385",
    class: 14,
    destination: "0x0041e38c",
    specialConsumer: "0x0041e3f0",
    requiredPhaseCountCondition: "WORD [entity+0x144] != 0",
    flagsGate: "none",
  });
  assert.equal(report.initialTypeFlags.state1SpecialMaskValue, "0x80000000");
  assert.deepEqual(
    [report.sources.sprite.slot, report.sources.sprite.tableIndex, report.sources.sprite.pointerCell, report.sources.sprite.sha256, report.sources.sprite.width, report.sources.sprite.height, report.sources.sprite.frameCount],
    [104, 4, "0x004bc234", "34c3fdb3bcd79bc95f907aa7c381c11a374b30c8f7dd45f89f0e762a139f04ec", 70, 60, 88],
  );
  assert.deepEqual(
    Object.fromEntries(Object.entries(report.states).map(([name, state]) => [name, {
      originalAnimationState: state.originalAnimationState,
      phaseCount: state.phaseCount,
      configuredBases: state.configuredBases,
      frameRange: state.frameRange,
    }])),
    {
      idle: { originalAnimationState: 8, phaseCount: 1, configuredBases: [16, 32, 48, 64, 0], frameRange: [0, 64] },
      move: { originalAnimationState: 1, phaseCount: 8, configuredBases: [0, 8, 16, 24, 32, 40, 48, 56, 64], frameRange: [0, 71] },
      attack: { originalAnimationState: 4, phaseCount: 1, configuredBases: [72, 73, 74, 75, 76, 77, 78, 79, 80], frameRange: [72, 80] },
    },
  );
  assert.equal("frames" in report.sources.sprite, false);
  assert.equal("endOffset" in report.sources.sprite, false);
  assert.equal(report.evidencePoints.every(({ matched }) => matched), true);
  assert.equal(report.functionEvidence.length, 8);
  assert.deepEqual(
    [
      "movement-raw-1000-direct-branch",
      "movement-raw-1000-frame-base",
      "attack-raw-1000-direct-branch",
      "attack-raw-1000-frame-base",
    ].map((id) => {
      const evidence = report.evidencePoints.find((point) => point.id === id);
      return [id, evidence?.matched];
    }),
    [
      ["movement-raw-1000-direct-branch", true],
      ["movement-raw-1000-frame-base", true],
      ["attack-raw-1000-direct-branch", true],
      ["attack-raw-1000-frame-base", true],
    ],
  );
});

test("replays every grid direction and every configured phase", () => {
  const expected = {
    8: { s: [16, false], sw: [32, false], w: [48, false], nw: [64, false], n: [48, true], ne: [32, true], e: [16, true], se: [0, false] },
    1: { s: [16, false], sw: [32, false], w: [48, false], nw: [64, false], n: [48, true], ne: [32, true], e: [16, true], se: [0, false] },
    4: { s: [74, false], sw: [76, false], w: [78, false], nw: [80, false], n: [78, true], ne: [76, true], e: [74, true], se: [72, false] },
  };
  for (const [stateText, facings] of Object.entries(expected)) {
    const state = Number(stateText);
    const phaseCount = state === 1 ? 8 : 1;
    for (const profile of TURTLE_TANK_GRID_PROFILES) {
      const [start, mirrorX] = facings[profile.facing];
      const replays = Array.from({ length: phaseCount }, (_, phase) =>
        selectTurtleTankFrame({ state, direction: profile.direction, phase }),
      );
      assert.deepEqual(replays.map(({ frameIndex }) => frameIndex), Array.from({ length: phaseCount }, (_, phase) => start + phase));
      assert.equal(replays[0].mirrorX, mirrorX);
      assert.equal(replays[0].facing, profile.facing);
    }
  }
});

test("replays opaque raw directions 1000 through 1007 without assigning facings", () => {
  for (const profile of TURTLE_TANK_OPAQUE_PROFILES) {
    const move = Array.from({ length: 8 }, (_, phase) =>
      selectTurtleTankFrame({ state: 1, direction: profile.direction, phase }),
    );
    assert.deepEqual(move.map(({ frameIndex }) => frameIndex), Array.from({ length: 8 }, (_, phase) => profile.configuredBaseIndex * 8 + phase));
    assert.equal(move[0].facing, null);
    assert.equal(move[0].directionMeaning, "opaque");
    assert.equal(move[0].mirrorX, profile.mirrorX);
    assert.deepEqual(selectTurtleTankFrame({ state: 4, direction: profile.direction, phase: 0 }), {
      state: 4,
      stateName: "attack",
      direction: profile.direction,
      facing: null,
      directionMeaning: "opaque",
      phase: 0,
      spriteSlot: 104,
      sourcePath: "char\\ghosttankj.spr",
      frameIndex: 72 + profile.configuredBaseIndex,
      mirrorX: profile.mirrorX,
    });
  }
});

test("rejects out-of-scope gates, phases, states, directions, and widths", () => {
  assert.throws(() => selectTurtleTankFrame({ state: 1, direction: 1, phase: 0, entityFlags: 0x00143205 }), /mask value 0x80000000/);
  assert.throws(() => selectTurtleTankFrame({ state: 1, direction: 1, phase: 0, entityFlags: 0x8014320d }), /mask value 0x80000000/);
  assert.throws(() => selectTurtleTankFrame({ state: 1, direction: 1, phase: 0, entityFlags: 0x84143205 }), /alternate movement mask clear/);
  assert.throws(() => selectTurtleTankFrame({ state: 8, direction: 1, phase: 0, entityFlags: 0x8014320d }), /bit 0x08 clear/);
  assert.throws(() => selectTurtleTankFrame({ state: 4, direction: 1, phase: 0, attackPhaseCount: 0 }), /WORD \+0x144 nonzero/);
  assert.throws(() => selectTurtleTankFrame({ state: 7, direction: 1, phase: 0 }), /scoped set 1,4,8/);
  assert.throws(() => selectTurtleTankFrame({ state: 8, direction: 1000, phase: 0 }), /recovered idle set/);
  assert.throws(() => selectTurtleTankFrame({ state: 1, direction: 999, phase: 0 }), /recovered move set/);
  assert.throws(() => selectTurtleTankFrame({ state: 1, direction: 1, phase: 8 }), /outside 0..7/);
  assert.throws(() => selectTurtleTankFrame({ state: 4, direction: 1, phase: 1 }), /outside 0..0/);
  assert.throws(() => selectTurtleTankFrame({ state: 1, direction: 0x8000, phase: 0 }), /signed WORD/);
  assert.throws(() => selectTurtleTankFrame({ state: 1, direction: 1, phase: 0, entityFlags: 0x1_0000_0000 }), /unsigned DWORD/);
  assert.throws(() => selectTurtleTankFrame({ state: 4, direction: 1, phase: 0, attackPhaseCount: 0x1_0000 }), /unsigned WORD/);
});

test("rejects tampered EXE and SPR inputs", async (t) => {
  for (const [label, source, option] of [["EXE", paths.executablePath, "executablePath"], ["SPR", paths.spritePath, "spritePath"]]) {
    await t.test(label, () => {
      const directory = temporaryDirectory();
      const altered = join(directory, label.toLowerCase());
      copyFileSync(source, altered);
      const bytes = readFileSync(altered);
      bytes[bytes.length - 1] ^= 0xff;
      writeFileSync(altered, bytes);
      assert.throws(() => extractReport({ [option]: altered }), /SHA-256 mismatch/);
    });
  }
});

test("rejects stale functions and tampered class, attack, and direction switches", async (t) => {
  await t.test("canonical function", () => {
    const path = copiedJson(paths.functionsPath, (artifact) => {
      artifact.functions.find(({ entry }) => entry === "0x0041efa0").instructionCount = 139;
    });
    assert.throws(() => extractReport({ functionsPath: path }), /0x0041efa0 instruction count mismatch/);
  });
  for (const [name, switchAddress, label, destination, message] of [
    ["class", "0x004292b3", 14, "0x0042bb8d", /class 14 initializer destination mismatch/],
    ["attack", "0x0041e385", 14, "0x0041e3a0", /class 14 attack wrapper destination mismatch/],
    ["idle-grid", "0x0041d8a5", 1, "0x0041d976", /idle raw direction 1 mismatch/],
    ["move-grid", "0x0041efe3", 1, "0x0041f267", /move raw direction 1 mismatch/],
    ["attack-opaque", "0x0041e513", 1007, "0x0041e5d0", /attack opaque direction 1007 mismatch/],
  ]) {
    await t.test(name, () => {
      const path = copiedJson(paths.jumpTablesPath, (artifact) => {
        const table = Object.values(artifact.tables).find((candidate) => candidate.switchAddress === switchAddress);
        table.cases.find((entry) => entry.label === label).destination = destination;
      });
      assert.throws(() => extractReport({ jumpTablesPath: path }), message);
    });
  }
});

function extractReport(overrides = {}) {
  return extractK01TurtleTankAnimationPilot({ ...paths, ...overrides });
}
function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "k01-turtle-tank-"));
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
