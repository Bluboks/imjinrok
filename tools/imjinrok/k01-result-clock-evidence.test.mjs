import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  extractK01ResultClockEvidence,
  replayResultClockSample,
  replayResultClockToMission,
  replayScriptFlagLifecycle,
  replayScriptLoader,
} from "./extract-k01-result-clock-evidence.mjs";

const root = resolve(import.meta.dirname, "../..");
const paths = {
  executablePath: join(root, "original/imjinrok2/imjinrok2.exe"),
  functionsPath: join(root, "analysis/generated/imjinrok2/functions.json"),
  referencesPath: join(root, "analysis/generated/imjinrok2/references.json"),
  seedsPath: join(root, "analysis/generated/imjinrok2/seeds.json"),
};
const fixturePath = join(root, "analysis/fixtures/k01-result-clock-evidence.json");

test("extracts the canonical bounded result-clock and K01 flag fixture", () => {
  assert.deepEqual(
    extractK01ResultClockEvidence(),
    JSON.parse(readFileSync(fixturePath, "utf8")),
  );
});

test("replays queue/gate sampling, DWORD wrap, strict timer and raw-tick boundaries", () => {
  assert.deepEqual(
    replayResultClockSample({
      previousClock: 100,
      unsignedSample: 151,
      messageQueuePending: true,
      mainGateBlocked: false,
    }),
    {
      sampled: false,
      reason: "message-queue",
      previousClock: 100,
      unsignedSample: null,
      resultClock: 100,
      elapsed: null,
      wrapped: false,
    },
  );
  const report = extractK01ResultClockEvidence();
  assert.deepEqual(
    report.testVectors.map(({ id, result }) => ({ id, result })),
    [
      {
        id: "idle-samples-unsigned-milliseconds",
        result: {
          sampled: true,
          reason: "idle-gate-passed",
          previousClock: 100,
          unsignedSample: 151,
          resultClock: 151,
          elapsed: 51,
          wrapped: false,
        },
      },
      {
        id: "queued-message-does-not-sample",
        result: {
          sampled: false,
          reason: "message-queue",
          previousClock: 100,
          unsignedSample: null,
          resultClock: 100,
          elapsed: null,
          wrapped: false,
        },
      },
      {
        id: "main-gate-does-not-sample",
        result: {
          sampled: false,
          reason: "main-gate",
          previousClock: 100,
          unsignedSample: null,
          resultClock: 100,
          elapsed: null,
          wrapped: false,
        },
      },
      {
        id: "dword-wrap-sample",
        result: {
          sampled: true,
          reason: "idle-gate-passed",
          previousClock: 0xfffffffe,
          unsignedSample: 1,
          resultClock: 1,
          elapsed: 3,
          wrapped: true,
        },
      },
    ],
  );
  assert.equal(report.downstream.timerResolver.vectors[0].result.result, 0);
  assert.equal(report.downstream.timerResolver.vectors[1].result.result, 1);
  assert.deepEqual(report.downstream.distinctRawTickGate.vectors[0].result.events, []);
  assert.deepEqual(report.downstream.distinctRawTickGate.vectors[1].result.events, [
    { kind: "global-tick-cache-write", value: 8 },
    { kind: "mission-dispatcher-call" },
  ]);
  const wrappedMission = replayResultClockToMission({
    previousClock: 0xfffffffe,
    unsignedSample: 1,
    rawGlobalTick: 8,
    cachedGlobalTick: 7,
    winTimer: 0,
    lossTimer: 0,
  });
  assert.equal(wrappedMission.sample.resultClock, 1);
  assert.equal(wrappedMission.commit.returnValue, 0);
});

test("replays loader, busy start, completed record stop, and bounded cleanup flags", () => {
  assert.deepEqual(replayScriptLoader({ loaderReturn: 1 }), {
    returnValue: 1,
    readinessBefore: 0,
    readinessAfter: 1,
    loaderCalled: true,
    source: "loader-success-writes-object-plus-0x4",
  });
  assert.deepEqual(replayScriptLoader({ loaderReturn: 0 }), {
    returnValue: 0,
    readinessBefore: 0,
    readinessAfter: 0,
    loaderCalled: true,
    source: "loader-zero-return-before-success-write",
  });
  assert.throws(
    () => replayScriptLoader({ loaderReturn: 1, readinessBefore: 1 }),
    /K01 load call/u,
  );

  const report = extractK01ResultClockEvidence();
  assert.deepEqual(
    report.scriptFlagVectors.map(({ id }) => id),
    [
      "successful-load",
      "successful-load-starts-script",
      "loader-zero-leaves-readiness-unset",
      "busy-start-does-not-restart",
      "final-record-stops-and-sleeps",
    ],
  );
  const busy = report.scriptFlagVectors[3].result;
  assert.equal(busy.loader, null);
  assert.equal(busy.events[0].loaderCalled, false);
  assert.equal(busy.events[1].reason, "already-loaded-context");
  const completed = report.scriptFlagVectors[4].result;
  assert.equal(completed.stopped, true);
  assert.equal(completed.cleanedUp, true);
  assert.equal(completed.readiness, 0);
  assert.equal(completed.runFlag, 0);
  assert.equal(completed.events.at(-1).projectedWrite, "object+0x4 = 0");

  const nonOneRun = replayScriptFlagLifecycle({
    readinessBefore: 1,
    runFlagBefore: 4,
    loaderReturn: 1,
    loadRequested: true,
    startRequested: false,
    completedRecordReady: true,
    completionGate: 0,
  });
  assert.equal(nonOneRun.readiness, 1);
  assert.equal(nonOneRun.runFlag, 4);
  assert.equal(nonOneRun.cleanedUp, false);

  const alreadyStopped = replayScriptFlagLifecycle({
    readinessBefore: 1,
    runFlagBefore: 0,
    loaderReturn: 1,
    loadRequested: true,
    startRequested: false,
    completedRecordReady: false,
    completionGate: 1,
  });
  assert.equal(alreadyStopped.readiness, 0);
  assert.equal(alreadyStopped.runFlag, 0);
  assert.equal(alreadyStopped.cleanedUp, true);
});

test("rejects malformed replay values and independently tampered static inputs", (t) => {
  assert.throws(
    () => replayResultClockSample({ previousClock: 0, unsignedSample: 0, messageQueuePending: 0 }),
    /boolean/u,
  );
  assert.throws(
    () => replayScriptFlagLifecycle({ loaderReturn: 1, readinessBefore: -1 }),
    /unsigned DWORD/u,
  );
  assert.throws(
    () => replayScriptLoader({ loaderReturn: 2 }),
    /either zero or one/u,
  );

  const directory = mkdtempSync(join(tmpdir(), "k01-result-clock-evidence-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const executablePath = copyWithByteFlip(directory, paths.executablePath);
  assert.throws(
    () => extractK01ResultClockEvidence({ ...paths, executablePath }),
    /SHA-256/u,
  );
  const functionsPath = copyWithByteFlip(directory, paths.functionsPath);
  assert.throws(
    () => extractK01ResultClockEvidence({ ...paths, functionsPath }),
    /functions artifact SHA-256/u,
  );
  const referencesPath = copyWithByteFlip(directory, paths.referencesPath);
  assert.throws(
    () => extractK01ResultClockEvidence({ ...paths, referencesPath }),
    /references artifact SHA-256/u,
  );
  const seedsPath = copyWithByteFlip(directory, paths.seedsPath);
  assert.throws(
    () => extractK01ResultClockEvidence({ ...paths, seedsPath }),
    /seeds artifact SHA-256/u,
  );
});

function copyWithByteFlip(directory, source) {
  const destination = join(directory, `${Math.random().toString(16).slice(2)}${source.endsWith(".exe") ? ".exe" : ".json"}`);
  const bytes = readFileSync(source);
  bytes[bytes.length - 1] ^= 1;
  writeFileSync(destination, bytes);
  return destination;
}
