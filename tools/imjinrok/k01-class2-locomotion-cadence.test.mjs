import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { extractK01Class2LocomotionCadence, replayClass2WalkPhaseCadence } from "./extract-k01-class2-locomotion-cadence.mjs";

const root = resolve(import.meta.dirname, "../..");
const fixturePath = join(root, "analysis/fixtures/k01-class2-locomotion-cadence-vectors.json");
const paths = {
  executablePath: join(root, "original/imjinrok2/imjinrok2.exe"),
  spritePath: join(root, "original/imjinrok2/char/swordk.spr"),
  seedsPath: join(root, "analysis/generated/imjinrok2/seeds.json"),
};

test("hash-binds class 2 raw locomotion fields to its normal movement cadence", () => {
  const report = extractK01Class2LocomotionCadence(paths);
  assert.equal(report.analysisStatus, "static-confirmed");
  assert.equal(report.reproductionStatus, "reproduction-complete");
  assert.equal(report.implementationStatus, "analysis-only");
  assert.deepEqual(report.identity, {
    internalClass: 2,
    originalGameplayName: "조선 창병",
    projectStableId: "swordsman",
    sourcePath: "char\\swordk.spr",
    typeRecord: "0x008830a8",
    typeInitializerCall: "0x0045c03f",
  });
  assert.deepEqual(report.rawFieldBinding.typeRecord, {
    field3c: { offset: "+0x3c", writerArgument: 30, class2InitialValue: 0 },
    field50: { offset: "+0x50", writerArgument: 38, class2InitialValue: 0 },
  });
  assert.deepEqual(report.rawFieldBinding.entity, {
    cadenceLimit: { offset: "+0x4ea", initializedFromTypeField: "+0x50", class2InitialValue: 0 },
    cadenceCounter: { offset: "+0x4ec", initializedTo: 0 },
    rawAccumulatorInput: { offset: "+0x4ee", initializedFromTypeField: "+0x3c", class2InitialValue: 0 },
    rawAccumulator: { offset: "+0x4f2", initializedTo: 0 },
    animationPhase: { offset: "+0x1b2", mirroredTo: "+0x34", state1And2PhaseCount: 8 },
  });
  assert.equal(report.evidence.functionEvidence.length, 4);
  assert.equal(report.evidence.evidencePoints.length, 26);
});

test("replays normal and boundary class 2 walk cadence vectors without a clock conversion", () => {
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  assert.match(fixture.acceptedReplayScope, /unsigned-WORD/);
  for (const vector of fixture.vectors) {
    assert.deepEqual(replayClass2WalkPhaseCadence(vector.input), vector.expected, vector.id);
  }
});

test("rejects an unsupported cadence route and tampered static artifacts", (t) => {
  assert.throws(
    () => replayClass2WalkPhaseCadence({ route: "tick", alternateMovement: false, phaseWord: 0, cadenceCounterWord: 0, cadenceLimitWord: 0 }),
    /route must be pre-displacement or post-displacement/,
  );
  assert.throws(
    () => replayClass2WalkPhaseCadence({ route: "post-displacement", alternateMovement: false, phaseWord: -1, cadenceCounterWord: 0, cadenceLimitWord: 0 }),
    /phaseWord must be an unsigned WORD/,
  );

  const directory = mkdtempSync(join(tmpdir(), "k01-class2-locomotion-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const alteredSeedsPath = join(directory, "seeds.json");
  const seeds = JSON.parse(readFileSync(paths.seedsPath, "utf8"));
  seeds.functions.find(({ entry }) => entry === "0x00425b20").instructions.pop();
  writeFileSync(alteredSeedsPath, `${JSON.stringify(seeds)}\n`);
  assert.throws(() => extractK01Class2LocomotionCadence({ ...paths, seedsPath: alteredSeedsPath }), /0x00425b20 instruction count/);

  const alteredExecutablePath = join(directory, "imjinrok2.exe");
  const executable = readFileSync(paths.executablePath);
  executable[0x25cb4] ^= 1;
  writeFileSync(alteredExecutablePath, executable);
  assert.throws(() => extractK01Class2LocomotionCadence({ ...paths, executablePath: alteredExecutablePath }), /original EXE SHA-256/);
});
