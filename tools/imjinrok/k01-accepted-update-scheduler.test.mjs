import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
  assert.equal(report.codeAnchors.length, 11);
  assert.ok(report.codeAnchors.every((anchor) => anchor.matched));
  assert.equal(report.callEdges.length, 19);
  for (const vector of report.vectors) assert.deepEqual(vector.result, vector.expected, vector.id);
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
  assert.equal(sameTick.events.some(({ target }) => target === "0x0048ddb0"), false);
  const wrappedDistinct = replayAcceptedUpdate({ rawGlobalTick: 0, cachedGlobalTick: 0xffffffff, activeEntityCount: 2 });
  assert.equal(wrappedDistinct.events.filter(({ kind }) => kind === "raw-tick-cache-write").length, 1);
  assert.equal(wrappedDistinct.projectilePoolCallCount, 1);
  assert.equal(wrappedDistinct.entityUpdateCallCount, 2);
  const result = replayAcceptedUpdate({ rawGlobalTick: 3, cachedGlobalTick: 2, dispatcherResultAx: 0xffff });
  assert.equal(result.accepted, false);
  assert.equal(result.projectilePoolCallCount, 0);
  assert.equal(result.events.findIndex(({ target }) => target === "0x0048a5c0") >= 0, true);
  assert.equal(result.events.findIndex(({ target }) => target === "0x00447360"), -1);
  assert.throws(() => replayAcceptedUpdate({ rawGlobalTick: 1, cachedGlobalTick: 0, clockGateResult: -1 }), /clockGateResult/);
  assert.throws(() => replayModeGuard({ previousModeWord: 0, guardWord: -1, argumentWord: 1 }), /guardWord/);
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
