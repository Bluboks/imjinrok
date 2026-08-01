import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { extractK01FarmerResourceWorkFrames, replayK01FarmerResourceWorkCadence, selectK01FarmerResourceWorkFrame } from "./extract-k01-farmer-resource-work-frames.mjs";

const root = resolve(import.meta.dirname, "../..");
const fixturePath = join(root, "analysis/fixtures/k01-farmer-resource-work-frame-vectors.json");
const cadenceFixturePath = join(root, "analysis/fixtures/k01-farmer-resource-work-cadence-vectors.json");
const paths = {
  executablePath: join(root, "original/imjinrok2/imjinrok2.exe"),
  functionsPath: join(root, "analysis/generated/imjinrok2/functions.json"),
  jumpTablesPath: join(root, "analysis/generated/imjinrok2/jump-tables.json"),
  referencesPath: join(root, "analysis/generated/imjinrok2/references.json"),
  seedsPath: join(root, "analysis/generated/imjinrok2/seeds.json"),
};

test("recovers K01 farmer resource-work states 10, 11, and 16 with 96 boundary vectors", () => {
  const report = extractK01FarmerResourceWorkFrames();
  assert.equal(report.analysisStatus, "static-confirmed");
  assert.equal(report.reproductionStatus, "reproduction-complete");
  assert.equal(report.implementationStatus, "partial-project-adapters");
  assert.deepEqual(report.stateDispatch, { 10: "0x0041ecd0", 11: "0x0041edc0", 16: "0x0041d560" });
  assert.deepEqual(report.states[7][10], {
    originalAnimationState: 10, phaseCount: 8, spriteSlot: 105, frameStart: 120, frameStride: 0, directionProfile: "state-10",
    directions: report.states[7][10].directions,
  });
  assert.equal(report.states[7][10].directions.find(({ direction }) => direction === 65).mirrorX, true);
  assert.deepEqual(report.resourceVisualStateWrites, {
    functionEntry: "0x004562d0", selectorCases: { 1: 10, 2: 10, 3: 11 }, alternateRoutine: { functionEntry: "0x004554c0", writeVa: "0x00455937", state: 16 },
    uncertainty: "selector human-readable resource names, raw visual state 16 human meaning, and the full resource lifecycle remain unconfirmed.",
  });
  assert.deepEqual(report.resourceWorkActionDispatch, {
    functionEntry: "0x004554c0", switchAddress: "0x004554ec", rawActionSubstate: 8, jumpTableLabel: 7, destination: "0x00455882",
  });
  assert.equal(report.resourceWorkCadenceContract.fastStart.elapsed, "x86 signed-absolute DWORD idiom result for subrecord +0x0c - global DWORD 0x007c5f80 is signed-greater-than 300; INT32_MIN remains negative and fails");
  assert.equal(report.resourceWorkCadenceContract.cadence.threshold, "signed BYTE entity +0x6f >= signed BYTE entity +0x6e + 2");
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  const actual = report.testVectors.map(({ internalClass, state, direction, phase, frameIndex, mirrorX }) => [internalClass, state, direction, phase, frameIndex, mirrorX]);
  assert.deepEqual(actual, fixture.vectors);
});

test("replays the scoped raw state-16 fast-start and cadence boundaries", () => {
  const fixture = JSON.parse(readFileSync(cadenceFixturePath, "utf8"));
  assert.match(fixture.acceptedNumericScope, /unsigned DWORD/);
  for (const vector of fixture.vectors) {
    const replay = replayK01FarmerResourceWorkCadence(vector.input);
    const actual = {
      route: replay.route,
      fastStart: replay.fastStart ?? null,
      elapsedSignedAbsIdiomResult: replay.elapsedSignedAbsIdiomResult,
      cadenceThresholdReached: replay.cadenceThresholdReached,
      terminalReturn: replay.terminalReturn,
      subrecord: {
        lastTickDword: replay.subrecord.lastTickDword,
        cadenceLatchWord: replay.subrecord.cadenceLatchWord,
      },
      entity: Object.fromEntries(Object.keys(vector.expected.entity).map((key) => [key, replay.entity[key]])),
    };
    assert.deepEqual(actual, vector.expected, vector.id);
  }
  assert.throws(() => replayK01FarmerResourceWorkCadence({
    rawActionSubstate: 7,
    subrecord: { selectorWord: 3, periodWord: 3, cadenceLatchWord: 0, lastTickDword: 0 },
    entity: { phaseWord: 0, cadenceLimitByte: 0, cadenceCounterByte: 0, directionWord: 1 },
    globals: { tickDword: 301, moduloDword: 0 },
  }), /scoped dispatcher value 8/);
});

test("replays state-specific direction profiles and rejects unscoped input", () => {
  assert.deepEqual(selectK01FarmerResourceWorkFrame({ internalClass: 7, state: 10, direction: 65, phase: 7 }), {
    internalClass: 7, state: 10, stateName: "resource-work-10", direction: 65, facing: "se", phase: 7, spriteSlot: 105, sourcePath: "char\\farmerk.spr", frameIndex: 127, mirrorX: true,
  });
  assert.equal(selectK01FarmerResourceWorkFrame({ internalClass: 31, state: 11, direction: 20, phase: 0 }).frameIndex, 104);
  assert.equal(selectK01FarmerResourceWorkFrame({ internalClass: 31, state: 16, direction: 64, phase: 7 }).frameIndex, 127);
  assert.throws(() => selectK01FarmerResourceWorkFrame({ internalClass: 7, state: 10, direction: 1, phase: 8 }), /recovered 0..7/);
  assert.throws(() => selectK01FarmerResourceWorkFrame({ internalClass: 7, state: 4, direction: 1, phase: 0 }), /scoped set 10,11,16/);
  assert.throws(() => selectK01FarmerResourceWorkFrame({ internalClass: 1, state: 10, direction: 1, phase: 0 }), /scoped set 7,31/);
  assert.throws(() => selectK01FarmerResourceWorkFrame({ internalClass: 7, state: 11, direction: 0, phase: 0 }), /normal grid set/);
});

test("rejects tampered canonical function, reference, seed, and raw EXE evidence", (t) => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "k01-farmer-resource-work-"));
  t.after(() => rmSync(temporaryDirectory, { recursive: true, force: true }));
  let index = 0;
  const mutateJson = (source, mutate) => {
    const path = join(temporaryDirectory, `artifact-${index++}.json`);
    const value = JSON.parse(readFileSync(source, "utf8"));
    mutate(value); writeFileSync(path, `${JSON.stringify(value)}\n`); return path;
  };
  const functionsPath = mutateJson(paths.functionsPath, (value) => { value.functions.find(({ entry }) => entry === "0x0041edc0").instructionCount = 62; });
  assert.throws(() => extractK01FarmerResourceWorkFrames({ functionsPath }), /0x0041edc0 instruction count/);
  const referencesPath = mutateJson(paths.referencesPath, (value) => { value.references.find(({ from }) => from === "0x0041d25d").to = "0x0041d561"; });
  assert.throws(() => extractK01FarmerResourceWorkFrames({ referencesPath }), /0x0041d25d -> 0x0041d560/);
  const jumpTablesPath = mutateJson(paths.jumpTablesPath, (value) => { Object.values(value.tables).find(({ switchAddress }) => switchAddress === "0x004554ec").cases.find(({ label }) => label === 7).destination = "0x00455883"; });
  assert.throws(() => extractK01FarmerResourceWorkFrames({ jumpTablesPath }), /resource-work action case 7 destination/);
  const seedsPath = mutateJson(paths.seedsPath, (value) => { value.functions.find(({ entry }) => entry === "0x0041d210").instructions.find(({ address }) => address === "0x0041d244").text = "JMP 0x0041edc1"; });
  assert.throws(() => extractK01FarmerResourceWorkFrames({ seedsPath, catalogSeedsPath: paths.seedsPath }), /seed instruction 0x0041d244/);
  const executablePath = join(temporaryDirectory, "imjinrok2.exe");
  const bytes = readFileSync(paths.executablePath); bytes[0x1ecd0] ^= 1; writeFileSync(executablePath, bytes);
  assert.throws(() => extractK01FarmerResourceWorkFrames({ executablePath }), /EXE SHA-256/);
});
