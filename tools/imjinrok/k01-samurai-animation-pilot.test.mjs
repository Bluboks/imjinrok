import assert from "node:assert/strict";
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test, { after } from "node:test";

import {
  SAMURAI_DIRECTION_PROFILES,
  extractK01SamuraiAnimationPilot,
  selectSamuraiFrame,
  validateDirectionProfiles,
} from "./extract-k01-samurai-animation-pilot.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const executablePath = resolve(
  repositoryRoot,
  "original/imjinrok2/imjinrok2.exe",
);
const functionsPath = resolve(
  repositoryRoot,
  "analysis/generated/imjinrok2/functions.json",
);
const jumpTablesPath = resolve(
  repositoryRoot,
  "analysis/generated/imjinrok2/jump-tables.json",
);
const seedsPath = resolve(
  repositoryRoot,
  "analysis/generated/imjinrok2/seeds.json",
);
const sharedDirectionSpritePath = resolve(
  repositoryRoot,
  "original/imjinrok2/char/swordk.spr",
);
const primarySpritePath = resolve(
  repositoryRoot,
  "original/imjinrok2/char/horseswordj1.spr",
);
const secondarySpritePath = resolve(
  repositoryRoot,
  "original/imjinrok2/char/horseswordj2.spr",
);

test("extracts class 13 identity, both SPR slots, and exact core state initializers", () => {
  const report = extractReport();

  assert.equal(report.analysisStatus, "static-confirmed");
  assert.equal(report.reproductionStatus, "reproduction-complete");
  assert.equal(report.identity.internalClass, 13);
  assert.equal(report.identity.originalGameplayName, "일본 사무라이");
  assert.equal(report.identity.typeRecordAddress, "0x00883eec");
  assert.equal(report.identity.typeFlags, "0x00089005");
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(report.sources.sprites).map(([key, sprite]) => [
        key,
        {
          slot: sprite.slot,
          tableIndex: sprite.tableIndex,
          pointerCell: sprite.pointerCell,
          sourcePath: sprite.sourcePath,
          sha256: sprite.sha256,
          dimensions: [sprite.width, sprite.height, sprite.frameCount],
        },
      ]),
    ),
    {
      primary: {
        slot: 117,
        tableIndex: 17,
        pointerCell: "0x004bc268",
        sourcePath: "char\\horseswordj1.spr",
        sha256:
          "f08dba883a1e5686383d05882d2c0f21c2bb52b6b2c2bb00e4d806f41ac9fdfa",
        dimensions: [80, 80, 90],
      },
      secondary: {
        slot: 118,
        tableIndex: 18,
        pointerCell: "0x004bc26c",
        sourcePath: "char\\horseswordj2.spr",
        sha256:
          "d3d3ec5f0ef9d4b3237182f8dd34baf532437a4f17622b6995877702d3576a62",
        dimensions: [80, 80, 70],
      },
    },
  );
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(report.states).map(([stateName, state]) => [
        stateName,
        {
          originalAnimationState: state.originalAnimationState,
          spriteSlot: state.spriteSlot,
          sourcePath: state.sourcePath,
          frameStart: state.frameStart,
          frameStride: state.frameStride,
          phaseCount: state.phaseCount,
          frameRange: state.frameRange,
        },
      ]),
    ),
    {
      idle: {
        originalAnimationState: 8,
        spriteSlot: 118,
        sourcePath: "char\\horseswordj2.spr",
        frameStart: 0,
        frameStride: 8,
        phaseCount: 8,
        frameRange: [0, 39],
      },
      move: {
        originalAnimationState: 1,
        spriteSlot: 117,
        sourcePath: "char\\horseswordj1.spr",
        frameStart: 0,
        frameStride: 8,
        phaseCount: 8,
        frameRange: [0, 39],
      },
      attack: {
        originalAnimationState: 4,
        spriteSlot: 117,
        sourcePath: "char\\horseswordj1.spr",
        frameStart: 50,
        frameStride: 8,
        phaseCount: 8,
        frameRange: [50, 89],
      },
      death: {
        originalAnimationState: 7,
        spriteSlot: 117,
        sourcePath: "char\\horseswordj1.spr",
        frameStart: 40,
        frameStride: 0,
        phaseCount: 8,
        frameRange: [40, 47],
      },
    },
  );
  assert.equal(report.evidencePoints.every(({ matched }) => matched), true);
  assert.deepEqual(
    report.functionEvidence.map(
      ({ entry, instructionCount, instructionSha256, bodyRanges }) => ({
        entry,
        instructionCount,
        instructionSha256,
        bodyRanges,
      }),
    ),
    [
      {
        entry: "0x004291d0",
        instructionCount: 4156,
        instructionSha256:
          "1c05959938219ae4fa918ba3061b1856dcfb575f007a1a48281dd316709a7e96",
        bodyRanges: ["0x004291d0-0x0042c547"],
      },
      {
        entry: "0x0041e370",
        instructionCount: 115,
        instructionSha256:
          "aa96086d04f698f4965205fa74803f0cc7d7db9a05ee610834a0ccffac293a61",
        bodyRanges: [
          "0x0041e370-0x0041e3bd",
          "0x0041e3f0-0x0041e5db",
        ],
      },
      {
        entry: "0x0041d210",
        instructionCount: 177,
        instructionSha256:
          "dbc2f289ae0aacdc6d7ef785d7d8290d1153742003a389889f5ac881563ca278",
        bodyRanges: [
          "0x0041d210-0x0041d277",
          "0x0041d2c0-0x0041d41a",
          "0x0041e200-0x0041e2f5",
        ],
      },
    ],
  );
});

test("proves the class 13 attack wrapper instead of using the hero class shortcut", () => {
  const report = extractReport();

  assert.deepEqual(report.classDispatch, {
    functionEntry: "0x004291d0",
    switchAddress: "0x004292b3",
    class: 13,
    destination: "0x0042a492",
  });
  assert.deepEqual(report.attackDispatch, {
    wrapperFunction: "0x0041e370",
    switchAddress: "0x0041e385",
    class: 13,
    destination: "0x0041e3a0",
    normalConsumer: "0x0041e200",
    requiredFlagsClear: "0x80000000",
    requiredPhaseCountCondition: "WORD [entity+0x144] != 0",
  });
  assert.deepEqual(report.initialTypeFlags, {
    value: "0x00089005",
    state1SpecialMaskValue: "0x00000000",
    alternateMovementEligibilityMaskValue: "0x00000000",
    idleSpecialMaskValue: "0x00000000",
    attackSpecialMaskValue: "0x00000000",
    normalCoreStatePathsSelected: true,
    laterRuntimeMutation: "unresolved",
  });
});

const temporaryDirectories = new Set();
after(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("replays every phase for all eight facings in idle, movement, attack, and death", () => {
  const expectedStateRanges = {
    8: {
      s: [0, 7, false],
      sw: [8, 15, false],
      w: [16, 23, false],
      nw: [24, 31, false],
      n: [16, 23, true],
      ne: [8, 15, true],
      e: [0, 7, true],
      se: [32, 39, false],
    },
    1: {
      s: [0, 7, false],
      sw: [8, 15, false],
      w: [16, 23, false],
      nw: [24, 31, false],
      n: [16, 23, true],
      ne: [8, 15, true],
      e: [0, 7, true],
      se: [32, 39, false],
    },
    4: {
      s: [50, 57, false],
      sw: [58, 65, false],
      w: [66, 73, false],
      nw: [74, 81, false],
      n: [66, 73, true],
      ne: [58, 65, true],
      e: [50, 57, true],
      se: [82, 89, false],
    },
    7: {
      s: [40, 47, false],
      sw: [40, 47, false],
      w: [40, 47, false],
      nw: [40, 47, false],
      n: [40, 47, true],
      ne: [40, 47, true],
      e: [40, 47, true],
      se: [40, 47, false],
    },
  };

  assert.equal(SAMURAI_DIRECTION_PROFILES.length, 8);
  for (const [stateText, facings] of Object.entries(expectedStateRanges)) {
    const state = Number(stateText);
    for (const profile of SAMURAI_DIRECTION_PROFILES) {
      const [first, last, mirrorX] = facings[profile.facing];
      const frames = Array.from({ length: 8 }, (_value, phase) =>
        selectSamuraiFrame({
          state,
          direction: profile.direction,
          phase,
        }).frameIndex,
      );
      assert.deepEqual(
        {
          frames,
          mirrorX: selectSamuraiFrame({
            state,
            direction: profile.direction,
            phase: 0,
          }).mirrorX,
        },
        {
          frames: Array.from(
            { length: last - first + 1 },
            (_value, offset) => first + offset,
          ),
          mirrorX,
        },
      );
    }
  }
});

test("rejects shared direction evidence with a changed frame-base index", () => {
  assert.doesNotThrow(() =>
    validateDirectionProfiles(SAMURAI_DIRECTION_PROFILES),
  );
  const changed = SAMURAI_DIRECTION_PROFILES.map((profile) => ({
    ...profile,
  }));
  changed[0].frameBaseIndex = 1;
  assert.throws(
    () => validateDirectionProfiles(changed),
    /shared normal direction profiles mismatch/,
  );
});

test("rejects out-of-scope flags, zero attack phase count, and malformed replay inputs", () => {
  assert.throws(
    () =>
      selectSamuraiFrame({
        state: 1,
        direction: 1,
        phase: 0,
        entityFlags: 0x0008900d,
      }),
    /normal movement path is unavailable/,
  );
  assert.throws(
    () =>
      selectSamuraiFrame({
        state: 1,
        direction: 1,
        phase: 0,
        entityFlags: 0x04089005,
      }),
    /normal movement path is unavailable/,
  );
  assert.throws(
    () =>
      selectSamuraiFrame({
        state: 8,
        direction: 1,
        phase: 0,
        entityFlags: 0x0008900d,
      }),
    /flags bit 0x08 clear/,
  );
  assert.throws(
    () =>
      selectSamuraiFrame({
        state: 4,
        direction: 1,
        phase: 0,
        entityFlags: 0x80089005,
      }),
    /flags 0x80000000 clear/,
  );
  assert.throws(
    () =>
      selectSamuraiFrame({
        state: 4,
        direction: 1,
        phase: 0,
        attackPhaseCount: 0,
      }),
    /WORD \+0x144 nonzero/,
  );
  assert.throws(
    () => selectSamuraiFrame({ state: 2, direction: 1, phase: 0 }),
    /scoped set 1,4,7,8/,
  );
  assert.throws(
    () => selectSamuraiFrame({ state: 1, direction: 0, phase: 0 }),
    /recovered normal set/,
  );
  assert.throws(
    () => selectSamuraiFrame({ state: 1, direction: 1, phase: -1 }),
    /outside 0\.\.7/,
  );
  assert.throws(
    () => selectSamuraiFrame({ state: 1, direction: 1, phase: 8 }),
    /outside 0\.\.7/,
  );
  assert.throws(
    () =>
      selectSamuraiFrame({
        state: 1,
        direction: 1,
        phase: 0,
        entityFlags: 0x1_0000_0000,
      }),
    /unsigned DWORD/,
  );
  assert.throws(
    () =>
      selectSamuraiFrame({
        state: 4,
        direction: 1,
        phase: 0,
        attackPhaseCount: 0x1_0000,
      }),
    /unsigned WORD/,
  );
});

test("rejects tampered primary and secondary SPR files", async (t) => {
  for (const [name, sourcePath, option] of [
    ["primary", primarySpritePath, "primarySpritePath"],
    ["secondary", secondarySpritePath, "secondarySpritePath"],
  ]) {
    await t.test(name, () => {
      const directory = mkdtempSync(join(tmpdir(), `k01-samurai-${name}-`));
      t.after(() => rmSync(directory, { recursive: true, force: true }));
      const alteredPath = join(directory, `${name}.spr`);
      copyFileSync(sourcePath, alteredPath);
      const buffer = readFileSync(alteredPath);
      buffer[buffer.length - 1] ^= 0xff;
      writeFileSync(alteredPath, buffer);
      assert.throws(
        () => extractReport({ [option]: alteredPath }),
        /SHA-256 mismatch/,
      );
    });
  }
});

test("rejects stale or tampered canonical function and jump-table evidence", async (t) => {
  await t.test("functions source hash", () => {
    const path = copiedJson("functions.json", functionsPath, (artifact) => {
      artifact.sourceSha256 = "0".repeat(64);
    });
    assert.throws(
      () => extractReport({ functionsPath: path }),
      /functions source SHA-256 mismatch/,
    );
  });

  await t.test("attack function boundary", () => {
    const path = copiedJson("functions.json", functionsPath, (artifact) => {
      artifact.functions.find(
        ({ entry }) => entry === "0x0041e370",
      ).instructionCount = 114;
    });
    assert.throws(
      () => extractReport({ functionsPath: path }),
      /0x0041e370 instruction count mismatch/,
    );
  });

  await t.test("initializer instruction hash", () => {
    const path = copiedJson("functions.json", functionsPath, (artifact) => {
      artifact.functions.find(
        ({ entry }) => entry === "0x004291d0",
      ).instructionSha256 = "0".repeat(64);
    });
    assert.throws(
      () => extractReport({ functionsPath: path }),
      /0x004291d0 instruction SHA-256 mismatch/,
    );
  });

  await t.test("class switch", () => {
    const path = copiedJson("jump-tables.json", jumpTablesPath, (artifact) => {
      const table = Object.values(artifact.tables).find(
        ({ switchAddress }) => switchAddress === "0x004292b3",
      );
      table.cases.find(({ label }) => label === 13).destination =
        "0x0042a520";
    });
    assert.throws(
      () => extractReport({ jumpTablesPath: path }),
      /class 13 initializer destination mismatch/,
    );
  });

  await t.test("attack switch", () => {
    const path = copiedJson("jump-tables.json", jumpTablesPath, (artifact) => {
      const table = Object.values(artifact.tables).find(
        ({ switchAddress }) => switchAddress === "0x0041e385",
      );
      table.cases.find(({ label }) => label === 13).destination =
        "0x0041e38c";
    });
    assert.throws(
      () => extractReport({ jumpTablesPath: path }),
      /class 13 attack wrapper destination mismatch/,
    );
  });
});

function extractReport(overrides = {}) {
  return extractK01SamuraiAnimationPilot({
    executablePath,
    functionsPath,
    jumpTablesPath,
    seedsPath,
    sharedDirectionSpritePath,
    primarySpritePath,
    secondarySpritePath,
    ...overrides,
  });
}

function copiedJson(name, sourcePath, mutate) {
  const directory = mkdtempSync(join(tmpdir(), "k01-samurai-analysis-"));
  temporaryDirectories.add(directory);
  const path = join(directory, name);
  const artifact = JSON.parse(readFileSync(sourcePath, "utf8"));
  mutate(artifact);
  writeFileSync(path, `${JSON.stringify(artifact)}\n`);
  return path;
}
