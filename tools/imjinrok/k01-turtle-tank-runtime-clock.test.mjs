import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test, { after } from "node:test";

import { extractEntityTypeCatalog } from "./extract-entity-type-catalog.mjs";
import {
  extractK01TurtleTankRuntimeClock,
  replayTurtleTankAcceptedUpdate,
  replayTurtleTankAcceptedTurnSequence,
  validateK01TurtleTankClass14Binding,
} from "./extract-k01-turtle-tank-runtime-clock.mjs";

const root = resolve(import.meta.dirname, "../..");
const paths = {
  executablePath: resolve(root, "original/imjinrok2/imjinrok2.exe"),
  functionsPath: resolve(root, "analysis/generated/imjinrok2/functions.json"),
  referencesPath: resolve(root, "analysis/generated/imjinrok2/references.json"),
  jumpTablesPath: resolve(root, "analysis/generated/imjinrok2/jump-tables.json"),
  seedsPath: resolve(root, "analysis/generated/imjinrok2/seeds.json"),
};
const temporaryDirectories = new Set();
after(() => {
  for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true });
});

const acceptedScheduler = {
  transitionGuardWord: 0,
  mainStateWord: 3,
  preUpdateReturn: 0,
  clockGateReturn: 1,
  commandGateModeWord: 1,
  commandReadinessReturn: 0,
};
const turn = (currentDirection, targetDirection, normalDirection, cadenceCounter, turnPending = 0) =>
  ({ currentDirection, targetDirection, normalDirection, cadenceCounter, cadenceLimit: 2, turnPending, dirty: 0 });

test("binds the accepted-update-to-class-14-turn chain to the original EXE", () => {
  const report = extractK01TurtleTankRuntimeClock(paths);
  assert.equal(report.analysisStatus, "static-confirmed");
  assert.equal(report.reproductionStatus, "reproduction-complete");
  assert.equal(report.implementationStatus, "not-ported-contract-only");
  assert.equal(report.source.sha256, "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e");
  assert.equal(report.functionEvidence.length, 18);
  assert.equal(report.callEdges.length, 19);
  assert.ok(report.codeAnchors.every((anchor) => anchor.matched));
  assert.deepEqual(report.actionFive, {
    switchAddress: "0x0043cda3", action: 5, destination: "0x0043d153",
  });
  assert.deepEqual(report.class14Binding, {
    internalClass: 14,
    typeRecordAddress: "0x00884038",
    rawFlags: "0x80143205",
    specialTurnMask: "0x80000008",
    specialTurnMaskValue: "0x80000000",
    cadenceDefault: 2,
    cadenceTypeField: "+0x48 WORD",
    cadenceRuntimeField: "+0x71 BYTE",
    provenance: {
      typeInitializerCall: "0x0045c843",
      seedsPath: paths.seedsPath,
      seedsSourceSha256: "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e",
    },
  });
  assert.deepEqual(report.scheduler.acceptedOrder, [
    "0x00447e10 returns nonzero",
    "increment 0x007c5f80 with DWORD wrap",
    "0x00447360",
    "active entity 0x0043c9c0",
  ]);
  assert.equal(report.scheduler.exactWallClockHz, null);
  assert.match(report.turnVisibility.movement, /1000\.\.1007/);
  assert.match(report.turnVisibility.attack, /unchanged/);
  assert.equal(report.projectContract.acceptedUpdate, "unsigned DWORD originalAcceptedUpdate ordinal, preserved with wrap and separate from project fixed ticks");
  assert.match(report.projectContract.conversionBoundary, /no Hz/);
  assert.deepEqual(report.testVectors.map(({ id }) => id), [
    "rejected-clock-gate-does-not-touch-turn",
    "grid-to-intermediate-to-grid",
    "equality-no-step",
    "opposite-tie-steps-backward",
    "cadence-byte-wrap",
  ]);
});

test("replays rejected scheduling, cadence, consumer visibility, equality, and wraps", () => {
  const rejected = replayTurtleTankAcceptedUpdate({
    scheduler: { ...acceptedScheduler, clockGateReturn: 0, acceptedStepCounter: 7 },
    turn: turn(1, 5, 1, 1),
  });
  assert.deepEqual(rejected, {
    scheduler: { accepted: false, rejection: "clock-gate-returned-zero", acceptedStepCounter: 7, timestampHistoryCall: null, projectilePoolCallCount: 0 },
    turn: turn(1, 5, 1, 1), helperInvocationCount: 0,
  });

  const intermediate = replayTurtleTankAcceptedUpdate({
    scheduler: { ...acceptedScheduler, acceptedStepCounter: 0 },
    turn: turn(1, 5, 1, 1),
  });
  assert.equal(intermediate.scheduler.acceptedStepCounter, 1);
  assert.equal(intermediate.helperInvocationCount, 1);
  assert.deepEqual(intermediate.turn, {
    returned: 0, currentDirection: 1000, normalDirection: 1,
    cadenceCounter: 0, cadenceLimit: 2, turnPending: 1, dirty: 1,
    stepped: true, forwardDistance: 2,
  });

  const grid = replayTurtleTankAcceptedUpdate({
    scheduler: { ...acceptedScheduler, acceptedStepCounter: 1 },
    turn: turn(1000, 5, 1, 1),
  });
  assert.equal(grid.turn.currentDirection, 5);
  assert.equal(grid.turn.normalDirection, 5, "attack consumer receives the later grid result");

  const equality = replayTurtleTankAcceptedUpdate({
    scheduler: { ...acceptedScheduler, acceptedStepCounter: 8 },
    turn: turn(1, 1, 1, 1, 1),
  });
  assert.deepEqual(equality.turn, {
    returned: 1, currentDirection: 1, normalDirection: 1,
    cadenceCounter: 1, cadenceLimit: 2, turnPending: 0, dirty: 0, stepped: false,
  });

  const opposite = replayTurtleTankAcceptedUpdate({
    scheduler: { ...acceptedScheduler, acceptedStepCounter: 9 },
    turn: turn(1, 16, 1, 1),
  });
  assert.equal(opposite.turn.currentDirection, 1007, "opposite tie goes backward");
  assert.equal(opposite.turn.normalDirection, 1, "intermediate remains invisible to attack");

  const wrapped = replayTurtleTankAcceptedUpdate({
    scheduler: { ...acceptedScheduler, acceptedStepCounter: 0xffffffff },
    turn: turn(1, 5, 1, 0xff),
  });
  assert.equal(wrapped.scheduler.acceptedStepCounter, 0, "accepted DWORD wraps");
  assert.equal(wrapped.turn.cadenceCounter, 0, "cadence BYTE wraps before comparison");
  assert.equal(wrapped.turn.stepped, false);

  const sequence = replayTurtleTankAcceptedTurnSequence({
    scheduler: { ...acceptedScheduler, acceptedStepCounter: 0 },
    initialTurn: turn(1, 5, 1, 0),
    targetDirections: [5, 5, 5, 5],
  });
  assert.deepEqual(sequence.map(({ acceptedStepCounter }) => acceptedStepCounter), [1, 2, 3, 4]);
  assert.deepEqual(sequence.map(({ currentDirection }) => currentDirection), [1, 1000, 1000, 5]);
  assert.deepEqual(sequence.map(({ normalDirection }) => normalDirection), [1, 1, 1, 5]);
  assert.deepEqual(sequence.map(({ stepped }) => stepped), [false, true, false, true]);
});

test("does not invent a turn when an accepted entity action does not reach the helper", () => {
  const result = replayTurtleTankAcceptedUpdate({
    scheduler: { ...acceptedScheduler, acceptedStepCounter: 4 },
    turn: turn(1, 5, 1, 1),
    invokeTurnHelper: false,
  });
  assert.equal(result.scheduler.accepted, true);
  assert.equal(result.scheduler.acceptedStepCounter, 5);
  assert.equal(result.helperInvocationCount, 0);
  assert.deepEqual(result.turn, turn(1, 5, 1, 1));
});

test("rejects tampered source-bound analysis evidence", () => {
  const functionsPath = copiedJson(paths.functionsPath, (artifact) => {
    artifact.functions.find(({ entry }) => entry === "0x004381c0").instructionSha256 = "0".repeat(64);
  });
  assert.throws(() => extractK01TurtleTankRuntimeClock({ ...paths, functionsPath }), /0x004381c0 instruction SHA-256/);

  const referencesPath = copiedJson(paths.referencesPath, (artifact) => {
    const edge = artifact.references.find(({ from, to }) => from === "0x00447cb8" && to === "0x00447360");
    edge.to = "0x00447361";
  });
  assert.throws(() => extractK01TurtleTankRuntimeClock({ ...paths, referencesPath }), /0x00447cb8/);

  const jumpTablesPath = copiedJson(paths.jumpTablesPath, (artifact) => {
    const table = Object.values(artifact.tables).find(({ functionEntry, switchAddress }) => functionEntry === "0x0043c9c0" && switchAddress === "0x0043cda3");
    table.cases.find(({ label }) => label === 5).destination = "0x0043d322";
  });
  assert.throws(() => extractK01TurtleTankRuntimeClock({ ...paths, jumpTablesPath }), /action 5 dispatcher destination/);

  const seedsPath = copiedJson(paths.seedsPath, (artifact) => {
    const initializer = artifact.functions.find(({ entry }) => entry === "0x0045bf50");
    initializer.instructions.find(({ address }) => address === "0x0045c7ea").text = "PUSH 0x80143201";
  });
  assert.throws(() => extractK01TurtleTankRuntimeClock({ ...paths, seedsPath }), /SHA-256 mismatch/);
  const tamperedCatalog = JSON.parse(JSON.stringify(extractEntityTypeCatalog({
    executablePath: paths.executablePath,
    seedsPath: paths.seedsPath,
  })));
  tamperedCatalog.types.find(({ internalClass }) => internalClass === 14).definition.flags = "0x80143201";
  assert.throws(() => validateK01TurtleTankClass14Binding(tamperedCatalog), /class 14 raw flags/);

  const cadenceFunctionsPath = copiedJson(paths.functionsPath, (artifact) => {
    artifact.functions.find(({ entry }) => entry === "0x0045bd00").instructionSha256 = "1".repeat(64);
  });
  assert.throws(() => extractK01TurtleTankRuntimeClock({ ...paths, functionsPath: cadenceFunctionsPath }), /0x0045bd00 instruction SHA-256/);
});

function copiedJson(source, mutate) {
  const directory = mkdtempSync(join(tmpdir(), "k01-turtle-clock-"));
  temporaryDirectories.add(directory);
  const destination = join(directory, "artifact.json");
  const artifact = JSON.parse(readFileSync(source, "utf8"));
  mutate(artifact);
  writeFileSync(destination, `${JSON.stringify(artifact)}\n`);
  return destination;
}
