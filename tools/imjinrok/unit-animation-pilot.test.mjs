import test from "node:test";
import assert from "node:assert/strict";
import {
  closeSync,
  copyFileSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DIRECTION_DELTAS,
  EXPECTED_EXECUTABLE_SHA256,
  EXPECTED_SPRITE_SHA256,
  EXPECTED_TYPE_FLAGS,
  STATE_1_SPECIAL_DIRECTION_MASK,
  extractUnitAnimationPilot,
  selectPilotFrame,
} from "./extract-unit-animation-pilot.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const executablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const spritePath = join(repositoryRoot, "original/imjinrok2/char/swordk.spr");
const jumpTablesPath = join(repositoryRoot, "analysis/generated/imjinrok2/jump-tables.json");
const seedsPath = join(repositoryRoot, "analysis/generated/imjinrok2/seeds.json");

test("extracts the static internal-class-2 to sprite-slot-100 animation evidence chain", () => {
  const report = extractUnitAnimationPilot({ executablePath, spritePath, jumpTablesPath, seedsPath });

  assert.equal(report.analysisStatus, "static-confirmed-for-class-2-movement");
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
  assert.equal(report.typeDefinition.flags, "0x04080805");
  assert.equal(EXPECTED_TYPE_FLAGS, 0x04080805);
  assert.equal(report.states.find((state) => state.state === 1)?.pathCondition, "(DWORD [entity+0x74] & 0x80000008) == 0");
  assert.equal(report.states.find((state) => state.state === 2)?.pathCondition, "unconditional");
  assert.equal(report.stateSemantics.normalMovementFunction, "0x00425b20");
  assert.equal(report.stateSemantics.state1.meaning, "movement");
  assert.equal(report.stateSemantics.state2.meaning, "alternate-movement-visual");
  assert.equal(report.stateSemantics.state1.selectorCondition, "BYTE [entity+0xba] != 1");
  assert.match(report.stateSemantics.state2.selectorCondition, /BYTE \[entity\+0xba\] == 1/);
  assert.equal(report.state1SpecialDirectionPath.selectionMask, "0x80000008");
  assert.equal(STATE_1_SPECIAL_DIRECTION_MASK >>> 0, 0x80000008);
  assert.equal(report.state1SpecialDirectionPath.class2InitialMaskValue, "0x00000000");
  assert.equal(report.state1SpecialDirectionPath.class2UsesNormalPathAtInitialization, true);
  assert.deepEqual(report.state1SpecialDirectionPath.class2ConfiguredFrameBaseFields, [
    "+0xa8",
    "+0xaa",
    "+0xac",
    "+0xae",
    "+0xb0",
  ]);
  assert.equal(report.state1SpecialDirectionPath.directions.length, 16);
  assert.deepEqual(
    report.state1SpecialDirectionPath.directions
      .filter((direction) => direction.class2FrameBaseConfigured === false)
      .map(({ direction, frameBaseField }) => [direction, frameBaseField]),
    [
      [0x04, "+0xb4"],
      [0x10, "+0xb4"],
      [0x14, "+0xb8"],
      [1001, "+0xb2"],
      [1002, "+0xb6"],
      [1003, "+0xb6"],
      [1004, "+0xb2"],
    ],
  );
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

test("refuses static-analysis artifacts generated from a different executable", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "imjinrok-animation-analysis-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  for (const [sourcePath, field] of [
    [jumpTablesPath, "jumpTablesPath"],
    [seedsPath, "seedsPath"],
  ]) {
    const alteredPath = join(directory, sourcePath.endsWith("seeds.json") ? "seeds.json" : "jump-tables.json");
    const artifact = JSON.parse(readFileSync(sourcePath, "utf8"));
    artifact.sourceSha256 = "0".repeat(64);
    writeFileSync(alteredPath, `${JSON.stringify(artifact)}\n`);

    assert.throws(
      () =>
        extractUnitAnimationPilot({
          executablePath,
          spritePath,
          jumpTablesPath,
          seedsPath,
          [field]: alteredPath,
        }),
      /source SHA-256 mismatch/,
    );
  }
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
