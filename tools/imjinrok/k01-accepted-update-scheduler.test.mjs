import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import test from "node:test";

import {
  extractK01AcceptedUpdateScheduler,
  replayAcceptedUpdate,
  replayModeGuard,
  replayStageOneEntry,
} from "./extract-k01-accepted-update-scheduler.mjs";

const root = resolve(import.meta.dirname, "../..");
const paths = {
  executablePath: resolve(root, "original/imjinrok2/imjinrok2.exe"),
  functionsPath: resolve(root, "analysis/generated/imjinrok2/functions.json"),
  referencesPath: resolve(root, "analysis/generated/imjinrok2/references.json"),
  jumpTablesPath: resolve(root, "analysis/generated/imjinrok2/jump-tables.json"),
  seedsPath: resolve(root, "analysis/generated/imjinrok2/seeds.json"),
};
const fixturePath = resolve(root, "analysis/fixtures/k01-accepted-update-scheduler.json");

test("binds stage-one producer chain and accepted-step call order to static provenance", () => {
  const report = extractK01AcceptedUpdateScheduler(paths);
  assert.equal(report.source.sha256, "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e");
  assert.equal(report.analysisStatus, "static-confirmed-bounded-chain-with-unresolved-mode-producer");
  assert.equal(report.reproductionStatus, "reproduction-complete");
  assert.equal(report.implementationStatus, "none");
  assert.equal(report.producerInventory.stageReachability.mapSource, "0x0048d740 (stagemap\\k01.map)");
  assert.equal(report.producerInventory.persistedSelector.failure.includes("writes 2"), true);
  assert.equal(report.producerInventory.persistedSelector.success.includes("0x1d4"), true);
  assert.equal(report.producerInventory.schedulerMode.producerStatus, "K01-stage-1-value-unresolved");
  assert.match(report.producerInventory.guard.aliasBoundary, /Direct references/);
  assert.deepEqual(report.acceptedStep.orderedCalls.slice(0, 6), [
    "FUN_00447bc0",
    "FUN_004464c0 (pre-update)",
    "FUN_004481d0 (distinct raw-tick result wrapper)",
    "FUN_0048ddb0 (pre-gates -> timer resolver -> stage dispatch)",
    "FUN_0048d6f0 (timer resolver; before K01 stage updater)",
    "FUN_0048a5c0 (stage 1 K01 updater, only on distinct tick and no prior result)",
  ]);
  assert.equal(report.acceptedStep.invocationCounts.outerProjectilePool, "one FUN_00447360 call per accepted scheduler step");
  assert.equal(report.acceptedStep.invocationCounts.projectilePoolA, "one forward pass over 100 raw slots per FUN_00447360 call");
  assert.equal(report.codeAnchors.length, 13);
  assert.ok(report.codeAnchors.every((anchor) => anchor.matched));
  assert.equal(report.callEdges.length, 19);
  for (const vector of report.vectors) assert.deepEqual(vector.result, vector.expected, vector.id);
  assert.equal(readFileSync(fixturePath, "utf8"), `${JSON.stringify(report, null, 2)}\n`);
});

test("replays mode/guard, stage reachability, repeated ticks, wrap, and accepted counts", () => {
  assert.deepEqual(replayStageOneEntry({ mainStateWord: 1, stageSelector: 1 }), {
    stageEntryReached: true,
    stageOneCaseReached: true,
    nextMainStateWord: 3,
    schedulerReached: true,
    modeRoutineReached: false,
    modeGate: "not-applicable",
  });
  assert.equal(replayStageOneEntry({ mainStateWord: 23, stageSelector: 0, state23ModeWord: 0 }).schedulerReached, false);
  assert.equal(replayStageOneEntry({ mainStateWord: 23, stageSelector: 0, state23ModeWord: 1 }).schedulerReached, true);
  assert.deepEqual(replayModeGuard({ previousModeWord: 0, guardWord: 0, argumentWord: 1 }), {
    modeWord: 1,
    events: [
      { kind: "write-word", address: "0x00c06e20", value: 1 },
      { kind: "write-word", address: "0x00bccc44", value: 0 },
    ],
    write: 1,
    guardAccepted: true,
    modeInput: 0,
  });
  assert.equal(replayModeGuard({ previousModeWord: 1, guardWord: 9, argumentWord: 1 }).modeWord, 0);

  const sameTick = replayAcceptedUpdate({ rawGlobalTick: 0xffffffff, cachedGlobalTick: 0xffffffff });
  assert.equal(sameTick.events.some(({ kind }) => kind === "mission-dispatcher-call"), false);
  const wrappedDistinct = replayAcceptedUpdate({ rawGlobalTick: 0, cachedGlobalTick: 0xffffffff, activeEntityCount: 2 });
  assert.equal(wrappedDistinct.events.filter(({ kind }) => kind === "global-tick-cache-write").length, 1);
  assert.equal(wrappedDistinct.projectilePoolCallCount, 1);
  assert.equal(wrappedDistinct.entityUpdateCallCount, 2);
  const result = replayAcceptedUpdate({ rawGlobalTick: 3, cachedGlobalTick: 2, dispatcherResultAx: 0xffff });
  assert.equal(result.accepted, false);
  assert.equal(result.projectilePoolCallCount, 0);
  assert.equal(result.events.findIndex(({ kind, target }) => kind === "stage-dispatch" && target === "0x0048a5c0") >= 0, true);
  assert.equal(result.events.findIndex(({ target }) => target === "0x00447360"), -1);
  assert.equal(result.nextMainStateWord, 0x1a);
  assert.throws(() => replayAcceptedUpdate({ rawGlobalTick: 1, cachedGlobalTick: 0, clockGateResult: -1 }), /clockGateResult/);
  assert.throws(() => replayModeGuard({ previousModeWord: 0, guardWord: -1, argumentWord: 1 }), /guardWord/);
  assert.throws(() => replayAcceptedUpdate({ rawGlobalTick: 1, cachedGlobalTick: 0, stageSelector: 2 }), /only stageSelector 1/);
  const unrelatedState = replayAcceptedUpdate({ mainStateWord: 2, rawGlobalTick: 1, cachedGlobalTick: 0, acceptedStepCounter: 9 });
  assert.deepEqual(
    {
      accepted: unrelatedState.accepted,
      rejection: unrelatedState.rejection,
      rawGlobalTick: unrelatedState.rawGlobalTick,
      cachedGlobalTick: unrelatedState.cachedGlobalTick,
      acceptedStepCounter: unrelatedState.acceptedStepCounter,
      nextMainStateWord: unrelatedState.nextMainStateWord,
    },
    { accepted: false, rejection: "main-state-not-scheduler", rawGlobalTick: 1, cachedGlobalTick: 0, acceptedStepCounter: 9, nextMainStateWord: 2 },
  );
  const state23Rejected = replayAcceptedUpdate({ mainStateWord: 23, state23ModeWord: 0, rawGlobalTick: 1, cachedGlobalTick: 0, acceptedStepCounter: 9 });
  assert.deepEqual(
    {
      accepted: state23Rejected.accepted,
      rejection: state23Rejected.rejection,
      rawGlobalTick: state23Rejected.rawGlobalTick,
      cachedGlobalTick: state23Rejected.cachedGlobalTick,
      acceptedStepCounter: state23Rejected.acceptedStepCounter,
      nextMainStateWord: state23Rejected.nextMainStateWord,
    },
    { accepted: false, rejection: "state-23-mode-reject", rawGlobalTick: 1, cachedGlobalTick: 0, acceptedStepCounter: 9, nextMainStateWord: 23 },
  );
});

test("retains wrapper cache across rejection and replays cross-invocation state", () => {
  const clockRejected = replayAcceptedUpdate({ rawGlobalTick: 7, cachedGlobalTick: 6, clockGateResult: 0 });
  assert.deepEqual(
    {
      rawGlobalTick: clockRejected.rawGlobalTick,
      cachedGlobalTick: clockRejected.cachedGlobalTick,
      acceptedStepCounter: clockRejected.acceptedStepCounter,
      nextMainStateWord: clockRejected.nextMainStateWord,
    },
    { rawGlobalTick: 7, cachedGlobalTick: 7, acceptedStepCounter: 0, nextMainStateWord: 3 },
  );

  const sameTickAccepted = replayAcceptedUpdate({
    rawGlobalTick: clockRejected.rawGlobalTick,
    cachedGlobalTick: clockRejected.cachedGlobalTick,
    acceptedStepCounter: clockRejected.acceptedStepCounter,
    gate7c627c: 1,
  });
  assert.equal(sameTickAccepted.events.some(({ kind }) => kind === "mission-dispatcher-call"), false);
  assert.deepEqual(
    {
      rawGlobalTick: sameTickAccepted.rawGlobalTick,
      cachedGlobalTick: sameTickAccepted.cachedGlobalTick,
      acceptedStepCounter: sameTickAccepted.acceptedStepCounter,
    },
    { rawGlobalTick: 8, cachedGlobalTick: 7, acceptedStepCounter: 1 },
  );

  const nextDistinct = replayAcceptedUpdate({
    rawGlobalTick: sameTickAccepted.rawGlobalTick,
    cachedGlobalTick: sameTickAccepted.cachedGlobalTick,
    acceptedStepCounter: sameTickAccepted.acceptedStepCounter,
  });
  assert.equal(nextDistinct.events.some(({ kind }) => kind === "mission-dispatcher-call"), true);
});

test("applies remaining pre-update result only outside exact command mode one", () => {
  const modeOne = replayAcceptedUpdate({ rawGlobalTick: 1, cachedGlobalTick: 0, commandGateModeWord: 1, preUpdateResult: 1 });
  assert.equal(modeOne.accepted, true);
  const modeZero = replayAcceptedUpdate({ rawGlobalTick: 1, cachedGlobalTick: 0, commandGateModeWord: 0, preUpdateResult: 1 });
  assert.equal(modeZero.rejection, "pre-update-result");
  assert.equal(modeZero.events.some(({ target }) => target === "0x00447e10"), false);
  const widened = replayAcceptedUpdate({ rawGlobalTick: 1, cachedGlobalTick: 0, commandGateModeWord: 0, preUpdateResult: 0x10001 });
  assert.equal(widened.accepted, true);
});

test("uses canonical repository-relative provenance across alternate absolute roots", () => {
  const report = extractK01AcceptedUpdateScheduler(paths);
  const alternateRoot = mkdtempSync(join(tmpdir(), "k01-accepted-update-scheduler-alt-"));
  try {
    symlinkSync(join(root, "original"), join(alternateRoot, "original"), "dir");
    symlinkSync(join(root, "analysis"), join(alternateRoot, "analysis"), "dir");
    const alternateReport = extractK01AcceptedUpdateScheduler({
      executablePath: resolve(alternateRoot, "original/imjinrok2/imjinrok2.exe"),
      functionsPath: resolve(alternateRoot, "analysis/generated/imjinrok2/functions.json"),
      referencesPath: resolve(alternateRoot, "analysis/generated/imjinrok2/references.json"),
      jumpTablesPath: resolve(alternateRoot, "analysis/generated/imjinrok2/jump-tables.json"),
      seedsPath: resolve(alternateRoot, "analysis/generated/imjinrok2/seeds.json"),
    });

    assert.deepEqual(alternateReport, report);
    assert.equal(report.source.executablePath, "original/imjinrok2/imjinrok2.exe");
    assert.deepEqual(
      Object.fromEntries(Object.entries(report.generatedArtifacts).map(([name, artifact]) => [name, artifact.path])),
      {
        functions: "analysis/generated/imjinrok2/functions.json",
        references: "analysis/generated/imjinrok2/references.json",
        jumpTables: "analysis/generated/imjinrok2/jump-tables.json",
        seeds: "analysis/generated/imjinrok2/seeds.json",
      },
    );
    const serialized = JSON.stringify(alternateReport);
    const absoluteHomePrefix = [String.fromCharCode(47), "home", String.fromCharCode(47)].join("");
    assert.equal(serialized.includes(absoluteHomePrefix), false);
    assert.equal(serialized.includes(root), false);
    assert.equal(serialized.includes(alternateRoot), false);
    assert.equal(serialized.includes(`${basename(root)}/`), false);
  } finally {
    rmSync(alternateRoot, { recursive: true, force: true });
  }
});

test("rejects changed executable and stale generated provenance loudly", () => {
  const directory = mkdtempSync(join(tmpdir(), "k01-accepted-update-scheduler-"));
  try {
    const source = Buffer.from(readFileSync(paths.executablePath));
    source[0x47cb8] ^= 0xff;
    const executablePath = join(directory, "changed.exe");
    writeFileSync(executablePath, source);
    assert.throws(() => extractK01AcceptedUpdateScheduler({ ...paths, executablePath }), /original EXE SHA-256/);

    const functionsText = readFileSync(paths.functionsPath, "utf8");
    const functionsPath = join(directory, "functions.json");
    writeFileSync(functionsPath, functionsText.replace("b694ee213a1b5f189ed7455e00690dcb29d970eca6ea87ef1f59c42c611cfb24", "0".repeat(64)));
    assert.throws(() => extractK01AcceptedUpdateScheduler({ ...paths, functionsPath }), /functions artifact SHA-256/);

    const referencesPath = join(directory, "references.json");
    writeFileSync(referencesPath, readFileSync(paths.referencesPath, "utf8").replace('"to": "0x004430f0"', '"to": "0x004430f1"'));
    assert.throws(() => extractK01AcceptedUpdateScheduler({ ...paths, referencesPath }), /references artifact SHA-256/);

    const jumpTablesPath = join(directory, "jump-tables.json");
    writeFileSync(jumpTablesPath, readFileSync(paths.jumpTablesPath, "utf8").replace('"destination": "0x004600cb"', '"destination": "0x004600cc"'));
    assert.throws(() => extractK01AcceptedUpdateScheduler({ ...paths, jumpTablesPath }), /jump tables artifact SHA-256/);

    const seedsPath = join(directory, "seeds.json");
    writeFileSync(seedsPath, readFileSync(paths.seedsPath, "utf8").replace("25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e", "0".repeat(64)));
    assert.throws(() => extractK01AcceptedUpdateScheduler({ ...paths, seedsPath }), /source SHA-256/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
