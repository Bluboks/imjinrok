import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test, { after } from "node:test";

import {
  TURTLE_TANK_GRID_PROFILES,
  TURTLE_TANK_INTERMEDIATE_TURN_PROFILES,
  extractK01TurtleTankAnimationPilot,
  replayTransientEffectUpdate,
  replayTurtleTankDestruction,
  replayTurtleTankTurn,
  selectTransientEffectFrame,
  selectTurtleTankFrame,
} from "./extract-k01-turtle-tank-animation-pilot.mjs";

const root = resolve(import.meta.dirname, "../..");
const paths = {
  executablePath: resolve(root, "original/imjinrok2/imjinrok2.exe"),
  functionsPath: resolve(root, "analysis/generated/imjinrok2/functions.json"),
  jumpTablesPath: resolve(root, "analysis/generated/imjinrok2/jump-tables.json"),
  seedsPath: resolve(root, "analysis/generated/imjinrok2/seeds.json"),
  spritePath: resolve(root, "original/imjinrok2/char/ghosttankj.spr"),
  exp1SpritePath: resolve(root, "original/imjinrok2/fnt/exp1.spr"),
  exp2SpritePath: resolve(root, "original/imjinrok2/fnt/exp2.spr"),
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
  assert.equal(report.functionEvidence.length, 28);
  assert.deepEqual(report.turnContract.ring, [1, 1000, 5, 1001, 4, 1002, 20, 1003, 16, 1004, 80, 1005, 64, 1006, 65, 1007]);
  assert.equal(report.turnContract.cadenceDefault, 2);
  assert.deepEqual(report.destruction.creationDefaults, {
    cadence: { typeWriterArgument: 35, value: 2, typeField: "+0x48 WORD", runtimeField: "+0x71 BYTE" },
    actionFlags: { typeWriterArgument: 39, value: 8, typeField: "+0x54 DWORD", runtimeField: "+0x84 WORD" },
  });
  assert.deepEqual(
    ["turn-ring-full-table", "turn-shortest-forward-and-backward-tie", "type-writer-cadence-field-0x48", "type-writer-action-flags-field-0x54"].map((id) => report.evidencePoints.find((point) => point.id === id)?.matched),
    [true, true, true, true],
  );
  assert.match(
    report.evidencePoints.find((point) => point.id === "type-writer-cadence-field-0x48")?.meaning ?? "",
    /arg 35 at \[ESP\+0x90\] to type WORD \+0x48/,
  );
  assert.deepEqual(
    { range: report.initializerWriteScan.range, convention: report.initializerWriteScan.rangeConvention },
    { range: "0x0042bae1-0x0042bb8c", convention: "inclusive" },
  );
  assert.deepEqual(report.initializerWriteScan.directWrites.map(({ operation, field, width }) => ({ operation, field, width })), [
    { operation: "MOV", field: "+0x92", width: "byte" },
    { operation: "MOV", field: "+0xa6", width: "byte" },
    { operation: "MOV", field: "+0x144", width: "word" },
    { operation: "MOV", field: "+0xd0", width: "byte" },
    { operation: "MOV", field: "+0xec", width: "byte" },
  ]);
  assert.deepEqual(report.initializerWriteScan.helperCalls.map(({ target }) => target), [
    "0x00438e80",
    "0x00438e80",
    "0x00438e80",
    "0x00438e80",
    "0x00438e80",
    "0x00438f20",
    "0x00439110",
    "0x00438ff0",
    "0x00438ff0",
  ]);
  assert.deepEqual(report.initializerWriteScan.state7FieldWrites, []);
  assert.deepEqual(report.sources.destruction.map(({ kind, sourcePath, frameRange }) => ({ kind, sourcePath, frameRange })), [
    { kind: 2, sourcePath: "fnt\\exp1.spr", frameRange: [0, 17] },
    { kind: 4, sourcePath: "fnt\\exp2.spr", frameRange: [0, 2] },
  ]);
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

test("replays the class-14 intermediate 16-ring turn cadence and shortest tie policy", () => {
  const ring = [1, 1000, 5, 1001, 4, 1002, 20, 1003, 16, 1004, 80, 1005, 64, 1006, 65, 1007];
  for (let index = 0; index < ring.length; index += 1) {
    const next = replayTurtleTankTurn({
      currentDirection: ring[index],
      targetDirection: ring[(index + 1) % ring.length],
      normalDirection: 1,
      cadenceCounter: 1,
      cadenceLimit: 2,
    });
    assert.equal(next.currentDirection, ring[(index + 1) % ring.length]);
    assert.equal(next.normalDirection, ring[(index + 1) % ring.length] < 1000 ? ring[(index + 1) % ring.length] : 1);
  }
  assert.equal(replayTurtleTankTurn({ currentDirection: 1, targetDirection: 16, normalDirection: 1, cadenceCounter: 1, cadenceLimit: 2 }).currentDirection, 1007, "opposite tie goes backward");
  assert.equal(replayTurtleTankTurn({ currentDirection: 1, targetDirection: 1007, normalDirection: 1, cadenceCounter: 1, cadenceLimit: 2 }).currentDirection, 1007, "backward adjacency wraps from ring start");
  assert.equal(replayTurtleTankTurn({ currentDirection: 1, targetDirection: 4, normalDirection: 1, cadenceCounter: 1, cadenceLimit: 2 }).currentDirection, 1000, "forward multi-step advances once");
  assert.equal(replayTurtleTankTurn({ currentDirection: 4, targetDirection: 1, normalDirection: 4, cadenceCounter: 1, cadenceLimit: 2 }).currentDirection, 1001, "backward multi-step advances once");
  assert.deepEqual(replayTurtleTankTurn({ currentDirection: 1, targetDirection: 1, normalDirection: 1, cadenceCounter: 1, cadenceLimit: 2, turnPending: 1 }), { returned: 1, currentDirection: 1, normalDirection: 1, cadenceCounter: 1, cadenceLimit: 2, turnPending: 0, dirty: 0, stepped: false });
  assert.deepEqual(replayTurtleTankTurn({ currentDirection: 1, targetDirection: 5, normalDirection: 1, cadenceCounter: 0, cadenceLimit: 2 }), { returned: 0, currentDirection: 1, normalDirection: 1, cadenceCounter: 1, cadenceLimit: 2, turnPending: 0, dirty: 0, stepped: false });
  assert.equal(replayTurtleTankTurn({ currentDirection: 1, targetDirection: 5, normalDirection: 1, cadenceCounter: 0xff, cadenceLimit: 2 }).cadenceCounter, 0, "BYTE cadence wraps before comparison");
});

test("replays default destruction allocation, PRNG, resource frames, and next release", () => {
  const empty = Array(60).fill(0);
  empty[1] = 1;
  const odd = replayTurtleTankDestruction({ flags: 0x08, effectPool: empty, prngState: 1, x: -2, y: 7, ownerByte: 255 });
  assert.equal(odd.returned, 1);
  assert.equal(odd.effect?.slot, 2);
  assert.equal(odd.effect?.kind, 2);
  assert.deepEqual(odd.effect?.frameCount, undefined);
  assert.deepEqual(odd.effect && { resourceSlot: odd.effect.resourceSlot, phaseCount: odd.effect.phaseCount, x: odd.effect.x, y: odd.effect.y, ownerByte: odd.effect.ownerByte }, { resourceSlot: 5, phaseCount: 18, x: -2, y: 7, ownerByte: 255 });
  const even = replayTurtleTankDestruction({ flags: 0x18, effectPool: Array(60).fill(0), prngState: 0, x: 0, y: 0, ownerByte: 0 });
  assert.equal(even.effect?.kind, 4);
  assert.equal(even.effect?.resourceSlot, 6);
  assert.equal(even.nextAction, 7);
  assert.equal(even.releasesOnNextAcceptedUpdate, true);
  assert.equal(replayTurtleTankDestruction({ flags: 0x08, effectPool: Array(60).fill(0), prngState: 0, x: 0, y: 0, ownerByte: 0, runtimeFlags: 0x85 }).releasesOnNextAcceptedUpdate, false);
  const full = replayTurtleTankDestruction({ flags: 0x08, effectPool: Array(60).fill(1), prngState: 0x87654321, x: 0, y: 0, ownerByte: 0 });
  assert.deepEqual(full.effect, null);
  assert.equal(full.prngState, 0x87654321);
  assert.equal(replayTurtleTankDestruction({ flags: 0x08, effectPool: Array(60).fill(0), prngState: 0xffffffff, x: 0, y: 0, ownerByte: 0 }).prngState, (Math.imul(0xffffffff, 0xff83) >>> 0) % 0xfffb);
  for (const flags of [0x00, 0x01, 0x02, 0x0a]) {
    assert.throws(() => replayTurtleTankDestruction({ flags, effectPool: Array(60).fill(0), prngState: 0, x: 0, y: 0, ownerByte: 0 }), /bit-0x08 branch/);
  }
});

test("replays all transient effect phases and raw unsigned tick boundaries", () => {
  for (const [kind, count] of [[2, 18], [4, 3]]) {
    for (let phase = 0; phase < count; phase += 1) {
      assert.deepEqual(selectTransientEffectFrame({ kind, phase, phaseCount: count }), { kind, phase, phaseCount: count, frameIndex: phase });
    }
  }
  for (const [kind, count] of [[2, 18], [4, 3]]) {
    for (let phase = 0; phase < count; phase += 1) {
      const result = replayTransientEffectUpdate({ kind, phase, phaseCount: count, lastTick: 5, currentTick: 3 });
      assert.equal(result.returned, phase === count - 1 ? 0 : 1);
      if (phase < count - 1) {
        assert.equal(result.frameIndex, phase + 1);
      } else {
        assert.equal(result.frameIndex, null);
      }
    }
  }
  assert.equal(replayTransientEffectUpdate({ kind: 2, phase: 0, phaseCount: 18, lastTick: 5, currentTick: 4 }).advanced, false);
  assert.equal(replayTransientEffectUpdate({ kind: 2, phase: 0, phaseCount: 18, lastTick: 0, currentTick: 0xffffffff }).advanced, false);
  assert.equal(replayTransientEffectUpdate({ kind: 2, phase: 0, phaseCount: 18, lastTick: 1, currentTick: 0xffffffff }).advanced, true);
  assert.throws(() => replayTurtleTankTurn({ currentDirection: 2, targetDirection: 1, normalDirection: 1, cadenceCounter: 0, cadenceLimit: 2 }), /16-ring/);
  assert.throws(() => replayTurtleTankTurn({ currentDirection: 1, targetDirection: 1, normalDirection: 1, cadenceCounter: 0x100, cadenceLimit: 2 }), /unsigned BYTE/);
  assert.throws(() => replayTurtleTankDestruction({ flags: 8, effectPool: [], prngState: 0, x: 0, y: 0, ownerByte: 0 }), /exactly 60/);
  assert.throws(() => replayTransientEffectUpdate({ kind: 2, phase: 18, phaseCount: 18, lastTick: 2, currentTick: 0 }), /outside/);
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

test("replays intermediate turn directions 1000 through 1007 without assigning generic facings", () => {
  for (const profile of TURTLE_TANK_INTERMEDIATE_TURN_PROFILES) {
    const move = Array.from({ length: 8 }, (_, phase) =>
      selectTurtleTankFrame({ state: 1, direction: profile.direction, phase }),
    );
    assert.deepEqual(move.map(({ frameIndex }) => frameIndex), Array.from({ length: 8 }, (_, phase) => profile.configuredBaseIndex * 8 + phase));
    assert.equal(move[0].facing, null);
    assert.equal(move[0].directionMeaning, "intermediate-turn");
    assert.equal(move[0].mirrorX, profile.mirrorX);
    assert.deepEqual(selectTurtleTankFrame({ state: 4, direction: profile.direction, phase: 0 }), {
      state: 4,
      stateName: "attack",
      direction: profile.direction,
      facing: null,
      directionMeaning: "intermediate-turn",
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
  for (const [label, source, option] of [["EXE", paths.executablePath, "executablePath"], ["SPR", paths.spritePath, "spritePath"], ["EXP1", paths.exp1SpritePath, "exp1SpritePath"], ["EXP2", paths.exp2SpritePath, "exp2SpritePath"]]) {
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
  await t.test("seeded class-14 initializer instructions", () => {
    const path = copiedJson(paths.seedsPath, (artifact) => {
      const initializer = artifact.functions.find(({ entry }) => entry === "0x004291d0");
      initializer.instructions.find(({ address }) => address === "0x0042bb68").text = "MOV word ptr [ESI + 0x18c],0x0";
    });
    assert.throws(() => extractReport({ seedsPath: path, catalogSeedsPath: paths.seedsPath }), /class 14 initializer direct writes mismatch/);
  });
  await t.test("seeded class-14 initializer DWORD destination", () => {
    const path = copiedJson(paths.seedsPath, (artifact) => {
      const initializer = artifact.functions.find(({ entry }) => entry === "0x004291d0");
      initializer.instructions.find(({ address }) => address === "0x0042bb68").text = "MOV dword ptr [ESI + 0x18c],0x0";
    });
    assert.throws(() => extractReport({ seedsPath: path, catalogSeedsPath: paths.seedsPath }), /class 14 initializer direct writes mismatch/);
  });
  await t.test("seeded class-14 initializer non-write ESI operand", () => {
    const path = copiedJson(paths.seedsPath, (artifact) => {
      const initializer = artifact.functions.find(({ entry }) => entry === "0x004291d0");
      initializer.instructions.find(({ address }) => address === "0x0042bb68").text = "CMP byte ptr [ESI + 0xd0],0x0";
    });
    assert.throws(() => extractReport({ seedsPath: path, catalogSeedsPath: paths.seedsPath }), /class 14 initializer direct writes mismatch/);
  });
  for (const [name, switchAddress, label, destination, message] of [
    ["class", "0x004292b3", 14, "0x0042bb8d", /class 14 initializer destination mismatch/],
    ["attack", "0x0041e385", 14, "0x0041e3a0", /class 14 attack wrapper destination mismatch/],
    ["idle-grid", "0x0041d8a5", 1, "0x0041d976", /idle raw direction 1 mismatch/],
    ["move-grid", "0x0041efe3", 1, "0x0041f267", /move raw direction 1 mismatch/],
    ["attack-intermediate", "0x0041e513", 1007, "0x0041e5d0", /attack intermediate turn direction 1007 mismatch/],
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
