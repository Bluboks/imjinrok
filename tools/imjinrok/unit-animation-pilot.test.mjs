import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, openSync, closeSync, readSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DIRECTION_DELTAS,
  EXPECTED_EXECUTABLE_SHA256,
  EXPECTED_SPRITE_SHA256,
  extractUnitAnimationPilot,
  selectPilotFrame,
} from "./extract-unit-animation-pilot.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const executablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const spritePath = join(repositoryRoot, "original/imjinrok2/char/swordk.spr");
const jumpTablesPath = join(repositoryRoot, "analysis/generated/imjinrok2/jump-tables.json");

test("extracts the static internal-class-2 to sprite-slot-100 animation evidence chain", () => {
  const report = extractUnitAnimationPilot({ executablePath, spritePath, jumpTablesPath });

  assert.equal(report.analysisStatus, "static-confirmed-for-scoped-pilot");
  assert.deepEqual(
    {
      internalClass: report.identity.internalClass,
      originalGameplayName: report.identity.originalGameplayName,
      spriteSlot: report.identity.spriteSlot,
      sourcePath: report.identity.sourcePath,
      gameplayNameStatus: report.identity.gameplayNameStatus,
      projectEntityBindingStatus: report.identity.projectEntityBindingStatus,
    },
    {
      internalClass: 2,
      originalGameplayName: "조선 창병",
      spriteSlot: 100,
      sourcePath: "char\\swordk.spr",
      gameplayNameStatus: "static-confirmed",
      projectEntityBindingStatus: "display-name-and-sprite-source-confirmed",
    },
  );
  assert.equal(report.sources.executable.sha256, EXPECTED_EXECUTABLE_SHA256);
  assert.equal(report.sources.sprite.sha256, EXPECTED_SPRITE_SHA256);
  assert.deepEqual(
    {
      width: report.sources.sprite.width,
      height: report.sources.sprite.height,
      frameCount: report.sources.sprite.frameCount,
    },
    { width: 60, height: 60, frameCount: 192 },
  );
  assert.equal(report.resourceBinding.pointerTable, "0x004bc094");
  assert.equal(report.resourceBinding.pointerCell, "0x004bc224");
  assert.equal(report.resourceBinding.sourcePathPointer, "0x004bd24c");
  assert.equal(report.resourceBinding.runtimeRecordAddress, "0x008d6d98");
  assert.equal(report.entityBinding.classField, "+0x37");
  assert.equal(report.entityBinding.initializerAddress, "0x00429f48");
  assert.equal(report.typeDefinition.recordAddress, "0x008830a8");
  assert.equal(report.typeDefinition.originalGameplayName, "조선 창병");
  assert.equal(report.states.find((state) => state.state === 1)?.pathCondition, "(DWORD [entity+0x74] & 0x80000008) == 0");
  assert.equal(report.states.find((state) => state.state === 2)?.pathCondition, "unconditional");
  assert.equal(report.evidencePoints.every((point) => point.matched), true);
});

test("reproduces every confirmed direction at both phase boundaries for states 1 and 2", () => {
  const expectedState1 = new Map([
    [0x01, [0, false]],
    [0x04, [16, false]],
    [0x05, [8, false]],
    [0x10, [16, true]],
    [0x14, [24, false]],
    [0x40, [0, true]],
    [0x41, [32, false]],
    [0x50, [8, true]],
  ]);
  const expectedState2 = new Map([
    [0x01, [88, false]],
    [0x04, [104, false]],
    [0x05, [96, false]],
    [0x10, [104, true]],
    [0x14, [112, false]],
    [0x40, [88, true]],
    [0x41, [120, false]],
    [0x50, [96, true]],
  ]);

  assert.equal(DIRECTION_DELTAS.size, 8);
  for (const [state, expected] of [
    [1, expectedState1],
    [2, expectedState2],
  ]) {
    for (const [direction, [base, mirrorX]] of expected) {
      assert.deepEqual(
        selectPilotFrame({ state, direction, phase: 0, previousMirrorX: !mirrorX }),
        {
          state,
          direction,
          phase: 0,
          frameIndex: base,
          mirrorX,
          mirrorWrite: "assigned",
          frameBaseField: expectedBaseField(state, direction),
          usedDefault: false,
        },
      );
      assert.equal(
        selectPilotFrame({ state, direction, phase: 7, previousMirrorX: !mirrorX }).frameIndex,
        base + 7,
      );
    }
  }
});

test("preserves the mirror selector on unsupported directions and rejects invalid pilot inputs", () => {
  assert.deepEqual(selectPilotFrame({ state: 1, direction: 0x00, phase: 6, previousMirrorX: true }), {
    state: 1,
    direction: 0,
    phase: 6,
    frameIndex: 6,
    mirrorX: true,
    mirrorWrite: "unchanged",
    frameBaseField: null,
    usedDefault: true,
  });
  assert.deepEqual(selectPilotFrame({ state: 2, direction: 0x7f, phase: 2, previousMirrorX: false }), {
    state: 2,
    direction: 0x7f,
    phase: 2,
    frameIndex: 2,
    mirrorX: false,
    mirrorWrite: "unchanged",
    frameBaseField: null,
    usedDefault: true,
  });
  assert.throws(
    () => selectPilotFrame({ state: 3, direction: 1, phase: 0 }),
    /Unsupported pilot state 3/,
  );
  assert.throws(
    () => selectPilotFrame({ state: 1, direction: 1, phase: -1 }),
    /phase -1 is outside 0\.\.7/,
  );
  assert.throws(
    () => selectPilotFrame({ state: 2, direction: 1, phase: 8 }),
    /phase 8 is outside 0\.\.7/,
  );
  assert.throws(
    () => selectPilotFrame({ state: 1, direction: 1, phase: 0, entityFlags: 0x08 }),
    /unrecovered special \+0x1e8 direction path/,
  );
});

test("refuses an executable whose fixed static evidence no longer matches", () => {
  const directory = mkdtempSync(join(tmpdir(), "imjinrok-animation-pilot-"));
  const alteredExecutablePath = join(directory, "imjinrok2.exe");
  copyFileSync(executablePath, alteredExecutablePath);

  const handle = openSync(alteredExecutablePath, "r+");
  try {
    const byte = Buffer.alloc(1);
    readSync(handle, byte, 0, 1, 0x4336b);
    byte[0] ^= 0xff;
    writeSync(handle, byte, 0, 1, 0x4336b);
  } finally {
    closeSync(handle);
  }

  assert.throws(
    () => extractUnitAnimationPilot({ executablePath: alteredExecutablePath, spritePath, jumpTablesPath }),
    /SHA-256 mismatch/,
  );
});

function expectedBaseField(state, direction) {
  const state1 = new Map([
    [0x01, "+0xa8"],
    [0x04, "+0xac"],
    [0x05, "+0xaa"],
    [0x10, "+0xac"],
    [0x14, "+0xae"],
    [0x40, "+0xa8"],
    [0x41, "+0xb0"],
    [0x50, "+0xaa"],
  ]);
  const state2 = new Map([
    [0x01, "+0xbe"],
    [0x04, "+0xc2"],
    [0x05, "+0xc0"],
    [0x10, "+0xc2"],
    [0x14, "+0xc4"],
    [0x40, "+0xbe"],
    [0x41, "+0xc6"],
    [0x50, "+0xc0"],
  ]);
  return (state === 1 ? state1 : state2).get(direction);
}
