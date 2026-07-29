import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { extractK01FarmerResourceWorkFrames, selectK01FarmerResourceWorkFrame } from "./extract-k01-farmer-resource-work-frames.mjs";

const root = resolve(import.meta.dirname, "../..");
const fixturePath = join(root, "analysis/fixtures/k01-farmer-resource-work-frame-vectors.json");
const paths = {
  executablePath: join(root, "original/imjinrok2/imjinrok2.exe"),
  functionsPath: join(root, "analysis/generated/imjinrok2/functions.json"),
  referencesPath: join(root, "analysis/generated/imjinrok2/references.json"),
  seedsPath: join(root, "analysis/generated/imjinrok2/seeds.json"),
};

test("recovers K01 farmer resource-work states 10, 11, and 16 with 96 boundary vectors", () => {
  const report = extractK01FarmerResourceWorkFrames();
  assert.equal(report.analysisStatus, "static-confirmed");
  assert.equal(report.reproductionStatus, "reproduction-complete");
  assert.equal(report.implementationStatus, "pending-project-adapter");
  assert.deepEqual(report.stateDispatch, { 10: "0x0041ecd0", 11: "0x0041edc0", 16: "0x0041d560" });
  assert.deepEqual(report.states[7][10], {
    originalAnimationState: 10, phaseCount: 8, spriteSlot: 105, frameStart: 120, frameStride: 0, directionProfile: "state-10",
    directions: report.states[7][10].directions,
  });
  assert.equal(report.states[7][10].directions.find(({ direction }) => direction === 65).mirrorX, true);
  assert.deepEqual(report.resourceVisualStateWrites, {
    functionEntry: "0x004562d0", selectorCases: { 1: 10, 2: 10, 3: 11 }, alternateRoutine: { functionEntry: "0x004554c0", writeVa: "0x00455937", state: 16 },
    uncertainty: "selector human-readable resource names and the internal condition that reaches the state-16 write remain unconfirmed.",
  });
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  const actual = report.testVectors.map(({ internalClass, state, direction, phase, frameIndex, mirrorX }) => [internalClass, state, direction, phase, frameIndex, mirrorX]);
  assert.deepEqual(actual, fixture.vectors);
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
  const seedsPath = mutateJson(paths.seedsPath, (value) => { value.functions.find(({ entry }) => entry === "0x0041d210").instructions.find(({ address }) => address === "0x0041d244").text = "JMP 0x0041edc1"; });
  assert.throws(() => extractK01FarmerResourceWorkFrames({ seedsPath }), /seed instruction 0x0041d244/);
  const executablePath = join(temporaryDirectory, "imjinrok2.exe");
  const bytes = readFileSync(paths.executablePath); bytes[0x1ecd0] ^= 1; writeFileSync(executablePath, bytes);
  assert.throws(() => extractK01FarmerResourceWorkFrames({ executablePath }), /EXE SHA-256/);
});
